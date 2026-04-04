import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ""

serve(async (req) => {
  const url = new URL(req.url);
  const referrer = req.headers.get('referer') || '';
  
  const findTag = (str: string) => {
    if (!str) return null;
    const match = str.match(/tagid[=\-:_ ]*([A-Z0-9\-]{4,20})/i);
    return match ? match[1] : null;
  }
  
  const tagid = findTag(url.search) || findTag(url.pathname) || findTag(referrer);
  const userAgent = req.headers.get('user-agent') || '';
  const isCrawler = /bot|facebookexternalhit|whatsapp|slack|twitterbot|linkedinbot/i.test(userAgent);

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

  if (!isCrawler) {
    return Response.redirect(appUrl, 302);
  }

  // CRAWLER ONLY: High-Compatibility Branding (Rare Earth Gallery)
  const title = tagid || "Rare Earth Gallery";
  const desc = inventoryItem ? (inventoryItem.shape + ' | ' + (inventoryItem.item_type || 'ITEM') + ' | ' + inventoryItem.color).toUpperCase() : 'Secure Traceability Hub';
  const img = (inventoryItem?.media_urls || '').split(',')[0] || 'https://jouhayerk-cloud.github.io/onyx.mx/OnyxMini.svg';

  const html = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>${title}</title>
    <meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
    <meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://rareearthgallerycc.com">
    <meta name="twitter:card" content="summary_large_image">
    <meta http-equiv="refresh" content="0;url=${appUrl}">
  </head><body><a href="${appUrl}">Loading Rare Earth Artifact...</a></body></html>`;

  return new Response(html, { 
    headers: { 
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff" 
    } 
  });
})
