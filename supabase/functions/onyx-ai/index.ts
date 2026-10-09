import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_ROLES = ["Developer", "Admin", "ClientBoss"];
const ALLOWED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro"
];

async function authenticateCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;

  if (!token) {
    return { errorResponse: new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized: Missing token" } }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { errorResponse: new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized: Invalid token" } }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  let appUser = null;
  const { data: userById } = await supabase.from("app_users").select("*").eq("id", user.id).maybeSingle();
  if (userById) {
    appUser = userById;
  } else if (user.email) {
    const { data: userByEmail } = await supabase.from("app_users").select("*").ilike("email", user.email).maybeSingle();
    if (userByEmail) appUser = userByEmail;
  }

  if (!appUser) {
    return { errorResponse: new Response(JSON.stringify({ error: { code: 403, message: "Forbidden: User not provisioned" } }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  const isActive = appUser.active !== false && appUser.is_active !== false;
  if (!isActive) {
    return { errorResponse: new Response(JSON.stringify({ error: { code: 403, message: "Forbidden: Account inactive" } }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return { errorResponse: new Response(JSON.stringify({ error: { code: 403, message: `Forbidden: role '${appUser.role}' is not authorized` } }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  return { caller: appUser };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: 405, message: "Method not allowed" } }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const authResult = await authenticateCaller(req);
  if (authResult.errorResponse) return authResult.errorResponse;

  const reqClone = req.clone();
  const buffer = await reqClone.arrayBuffer();
  if (buffer.byteLength > 200 * 1024) {
    return new Response(JSON.stringify({ error: { code: 413, message: "Payload too large" } }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try {
    const text = new TextDecoder().decode(buffer);
    body = JSON.parse(text);
  } catch (e) {
    return new Response(JSON.stringify({ error: { code: 400, message: "Invalid JSON" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { messages, model } = body;
  
  if (!messages) {
    return new Response(JSON.stringify({ error: { code: 400, message: "Missing messages parameter" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let targetModel = model || "gemini-2.5-flash";
  if (targetModel.startsWith("models/")) {
    targetModel = targetModel.replace("models/", "");
  }

  if (!ALLOWED_MODELS.includes(targetModel)) {
    return new Response(JSON.stringify({ error: { code: 400, message: "Model not allowed" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let contents = messages.contents || messages;
  if (Array.isArray(contents) && contents.length > 50) {
    return new Response(JSON.stringify({ error: { code: 400, message: "Too many messages" } }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { code: 500, message: "Server configuration error" } }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Build the upstream payload on the server: a signed-in caller must not choose arbitrary Gemini fields or an unbounded output size.
  // Only these top-level fields are forwarded, and generationConfig is rebuilt from a whitelist with clamped numbers.
  const src: Record<string, any> = Array.isArray(messages) ? { contents: messages } : messages;
  const MAX_OUTPUT_TOKENS = 8192;
  const clamp = (v: unknown, lo: number, hi: number): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
  const payload: Record<string, unknown> = { contents: src.contents };
  for (const k of ["systemInstruction", "system_instruction", "tools", "toolConfig", "tool_config"]) {
    if (src[k] !== undefined) payload[k] = src[k];
  }
  const gcIn = (src.generationConfig ?? src.generation_config ?? {}) as Record<string, any>;
  const gc: Record<string, unknown> = {
    maxOutputTokens: clamp(gcIn.maxOutputTokens, 1, MAX_OUTPUT_TOKENS) ?? MAX_OUTPUT_TOKENS,
  };
  const temperature = clamp(gcIn.temperature, 0, 2);
  if (temperature !== undefined) gc.temperature = temperature;
  const topP = clamp(gcIn.topP, 0, 1);
  if (topP !== undefined) gc.topP = topP;
  const topK = clamp(gcIn.topK, 1, 100);
  if (topK !== undefined) gc.topK = topK;
  if (gcIn.responseMimeType === "application/json" || gcIn.responseMimeType === "text/plain") gc.responseMimeType = gcIn.responseMimeType;
  if (gcIn.responseSchema !== undefined && typeof gcIn.responseSchema === "object") gc.responseSchema = gcIn.responseSchema;
  const budget = clamp(gcIn.thinkingConfig?.thinkingBudget, -1, MAX_OUTPUT_TOKENS);
  if (budget !== undefined) gc.thinkingConfig = { thinkingBudget: budget };
  // Gemini 3.x uses a level instead of a budget
  const level = gcIn.thinkingConfig?.thinkingLevel;
  if (level === "low" || level === "medium" || level === "high") gc.thinkingConfig = { ...(gc.thinkingConfig ?? {}), thinkingLevel: level };
  payload.generationConfig = gc;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;

  try {
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: { code: geminiRes.status, message: errData.error?.message || "Upstream AI error" } }), { status: geminiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await geminiRes.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: { code: 500, message: "Internal server error" } }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
