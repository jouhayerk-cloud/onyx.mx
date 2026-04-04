import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ""

serve(async (req) => {
  const url = new URL(req.url);
  const referrer = req.headers.get('referer') || '';
  
  const findTag = (str: string) => {
    if (!str) return null;
    const match = str.match(/tagid[=\-: ]*([A-Z]{2}[0-9A-Z\-]+)/i);
    return match ? match[1] : null;
  }
  
  const tagid = findTag(url.search) || findTag(url.pathname) || findTag(referrer);
  const userAgent = req.headers.get('user-agent') || '';
  const isCrawler = /bot|facebookexternalhit|whatsapp|slack|twitterbot/i.test(userAgent);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let inventoryItem = null;

  if (tagid) {
    try {
      const { data } = await supabase.from('inventory').select('*').eq('book_barcode', tagid).maybeSingle();
      inventoryItem = data;
      if (!inventoryItem) {
        const match = tagid.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i);
        if (match) {
            const [_, v, wb, num] = match;
            const { data: pData } = await supabase.from('inventory').select('*').or(`workbook.eq.${wb},workbook.eq.V${wb}`).eq('item_number', parseInt(num, 10));
            inventoryItem = pData?.[0];
        }
      }
    } catch(e){}
  }

  const appUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagid || ''}`;

  if (tagid && !isCrawler) {
    return Response.redirect(appUrl, 302);
  }

  // If no tag, serve the Bootloader as a strict HTML response
  const htmlOut = isCrawler ? `<!DOCTYPE html><html><head>
    <title>${tagid || 'Onyx Artifact'}</title>
    <meta property="og:title" content="${tagid || 'Onyx Artifact'}">
    <meta property="og:description" content="${inventoryItem ? (inventoryItem.shape + ' | ' + (inventoryItem.item_type || 'ITEM') + ' | ' + inventoryItem.color).toUpperCase() : 'Secure Traceability Hub'}">
    <meta property="og:image" content="${(inventoryItem?.media_urls || '').split(',')[0] || 'https://jouhayerk-cloud.github.io/onyx.mx/OnyxMini.svg'}">
    <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta http-equiv="refresh" content="0;url=${appUrl}">
  </head><body>Redirecting...</body></html>` 
  : `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Onyx Smart Hub</title>
    <style>
        body { background: #000; color: #444; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .spinner { border: 2px solid #222; border-top: 2px solid #00f0ff; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div style="text-align: center;">
        <div class="spinner"></div>
        <div>Synchronizing...</div>
    </div>
    <script>
        try {
            const ref = document.referrer || window.parent.location.href;
            const match = ref.match(/tagid[=\-: ]*([A-Z]{2}[0-9A-Z\-]+)/i);
            if (match && match[1]) {
                window.location.href = window.location.pathname + "?tagid=" + match[1];
            } else {
                setTimeout(() => { window.location.href = "${appUrl}"; }, 1000);
            }
        } catch(e) {
            window.location.href = "${appUrl}";
        }
    </script>
</body>
</html>`;

  return new Response(htmlOut, { 
    headers: { 
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff" 
    } 
  });
})
