import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ""

serve(async (req) => {
  const url = new URL(req.url)
  const referrer = req.headers.get('referer') || ''; // Referrer header from Google Sites
  
  const findTagInStr = (str: string) => {
    if (!str) return null;
    const match = str.match(/tagid[=\-: ]*([A-Z]{2}[0-9A-Z\-]+)/i);
    return match ? match[1] : null;
  }
  
  // Detect tag from Current URL OR Referrer (for Google Sites embeds)
  const tagid = findTagInStr(url.search) || findTagInStr(url.pathname) || findTagInStr(referrer);

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
            const [_, v, wb, num] = match;
            const { data: pData } = await supabase.from('inventory').select('*').or(`workbook.eq.${wb},workbook.eq.V${wb}`).eq('item_number', parseInt(num, 10));
            inventoryItem = pData?.[0];
        }
      }
    } catch(e){}
  }

  const appUrlWithTag = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagid || ''}`;

  // If we found a tag, redirect human to app
  if (tagid && !isCrawler) {
    return Response.redirect(appUrlWithTag, 302);
  }

  // If NO tag found, show a "Smart Bootloader" that tries to find it from the browser side
  if (!tagid && !isCrawler) {
    const bootloaderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Onyx Smart Hub</title>
  <style>
    body { background: #000; color: #444; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .loader { text-align: center; }
    .spinner { border: 2px solid #222; border-top: 2px solid #00f0ff; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 15px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <div>Synchronizing Artifact...</div>
  </div>
  <script>
    // Force a check of parent URL for Google Sites
    try {
      const parentUrl = document.referrer || window.parent.location.href;
      const match = parentUrl.match(/tagid[=\-: ]*([A-Z]{2}[0-9A-Z\-]+)/i);
      if (match && match[1]) {
        window.location.href = window.location.pathname + "?tagid=" + match[1];
      } else {
        // Fallback to login if truly missing
        setTimeout(() => { window.location.href = "${appUrlWithTag}"; }, 2000);
      }
    } catch(e) {
      window.location.href = "${appUrlWithTag}";
    }
  </script>
</body>
</html>`;
    return new Response(bootloaderHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // FALLBACK: Metadata for Crawlers
  const title = tagid || "Onyx Artifact";
  let description = "Secure Traceability Hub";
  if (inventoryItem) {
    const shape = (inventoryItem.shape || "").toUpperCase();
    const type = (inventoryItem.item_type || inventoryItem.type || "ITEM").toUpperCase();
    const color = (inventoryItem.color || inventoryItem.material || "").toUpperCase();
    description = `${shape} | ${type} | ${color}`.replace(/^ \| | \| $/g, '');
  }

  const imageUrl = (inventoryItem?.media_urls || inventoryItem?.main_image || "https://jouhayerk-cloud.github.io/onyx.mx/OnyxMini.svg").split(',')[0].trim();

  const html = `<!DOCTYPE html><html><head>
    <title>${title}</title>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
    <meta http-equiv="refresh" content="0;url=${appUrlWithTag}">
  </head><body>Redirecting to ${title}...</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
})
