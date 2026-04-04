import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ""

serve(async (req) => {
  const url = new URL(req.url)
  
  // Robust param detection
  const tagid = url.searchParams.get('tagid') || 
                url.searchParams.get('tagID') || 
                url.searchParams.get('TagID') || 
                url.searchParams.get('TAGID');

  // If a crawler (WhatsApp, Slack, etc.) is checking the link, serve metadata
  const userAgent = req.headers.get('user-agent') || '';
  const isCrawler = /bot|facebookexternalhit|whatsapp|slack|twitterbot|linkedinbot/i.test(userAgent);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  let inventoryItem = null;

  if (tagid) {
    try {
      const { data } = await supabase.from('inventory').select('*').eq('book_barcode', tagid).maybeSingle();
      inventoryItem = data;
      if (!inventoryItem) {
        const match = tagid.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
        if (match) {
            const [_, vendor, wb, num] = match;
            const { data: pData } = await supabase.from('inventory').select('*').or(`workbook.eq.${wb},workbook.eq.V${wb}`).eq('item_number', parseInt(num, 10));
            inventoryItem = pData?.[0];
        }
      }
    } catch(e){}
  }

  const appUrlWithTag = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagid || ''}`;

  // If it's a human, just redirect them to the working GitHub URL immediately.
  // This bypasses all "Raw Code" and Google Sites iframe issues.
  if (!isCrawler) {
    return Response.redirect(appUrlWithTag, 302);
  }

  // If it's a crawler, serve the metadata
  const itemName = inventoryItem?.shape || "Onyx Artifact";
  const itemDesc = inventoryItem ? `${inventoryItem.material} ${inventoryItem.color}` : "Secure Traceability Hub";
  const imageUrl = inventoryItem?.media_urls?.split(',')[0] || "https://jouhayerk-cloud.github.io/onyx.mx/OnyxMini.svg";

  const html = `<!DOCTYPE html><html><head>
    <title>Onyx Hub | ${itemName}</title>
    <meta property="og:title" content="Artifact ${tagid} | ${itemName}">
    <meta property="og:description" content="${itemDesc}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:type" content="website">
    <meta http-equiv="refresh" content="0;url=${appUrlWithTag}">
  </head><body>Redirecting...</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
})
