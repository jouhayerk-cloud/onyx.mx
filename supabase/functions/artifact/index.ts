import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
// Service role, not anon. This runs server-side only, so the key never reaches a
// browser — and it lets the database stay fully closed to anonymous callers while
// this function remains the single, curated public lookup path for printed QR tags.
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""

const APP_URL = 'https://jouhayerk-cloud.github.io/onyx.mx/'

// MXN per USD. Mirrors DEFAULT_EXCHANGE_RATE in src/lib/consts.tsx — keep in sync.
const DEFAULT_RATE = 17.0

// Columns safe to expose publicly. Acquisition and landed cost, vendor notes and
// payment fields are deliberately absent — a printed tag must never reveal what an
// item cost to buy.
//
// NOTE: vendor_id, generated_type and item_type exist on inventory_826 but NOT on
// the legacy inventory table. Selecting them makes PostgREST reject the whole
// query, which silently yields "not found" — keep this list in sync with the
// legacy schema.
const PUBLIC_FIELDS = [
  'id', 'item_id', 'item_number', 'workbook',
  'shape', 'material', 'color', 'quantity',
  'weight_kg', 'height_cm', 'width_cm', 'length_cm',
  'short_description', 'detailed_description', 'generated_description',
  'generated_color',
  'media_urls', 'generated_png_url', 'generated_svg_url', 'generated_image_urls',
  'status', 'book_barcode', 'book_retail'
].join(',')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = new URL(req.url)

  const findTag = (str: string) => {
    if (!str) return null
    const match = str.match(/(tagid[=\-:_ ]*([A-Z0-9\-]{4,20}))|(SU[0-9]{3,}[A-Z]{0,2})/i)
    if (!match) return null
    return match[2] || match[0]
  }

  const tagid = findTag(url.search) || findTag(url.pathname)
  const wantsJson = url.searchParams.get('format') === 'json'
  const userAgent = req.headers.get('user-agent') || ''
  const isCrawler = /bot|facebookexternalhit|whatsapp|slack|twitterbot|linkedinbot/i.test(userAgent)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  let item: Record<string, unknown> | null = null
  let lookupError: string | null = null

  if (tagid) {
    try {
      const { data, error } = await supabase
        .from('inventory').select(PUBLIC_FIELDS)
        .eq('book_barcode', tagid).maybeSingle()
      if (error) lookupError = error.message
      item = data

      if (!item) {
        // Legacy/production fallback: parse the printed barcode structure.
        const match = tagid.match(/^([A-Z]{2})([0-9]{3})([0-9]+)([A-Z]+)$/i)
        if (match) {
          const [, , wb, num] = match
          const { data: pData, error: pErr } = await supabase
            .from('inventory').select(PUBLIC_FIELDS)
            .or(`workbook.eq.${wb},workbook.eq.V${wb},workbook.eq.v${wb}`)
            .eq('item_number', parseInt(num, 10))
          if (pErr) lookupError = pErr.message
          item = pData?.[0] ?? null
        }
      }
    } catch (e) {
      lookupError = String(e)
    }
  }

  if (lookupError) console.error('[artifact] lookup failed:', lookupError)

  // Retail is derived from price_mxn, which must never leave the server. Compute
  // it here and return only the result, mirroring calculateCodesAndPrices():
  //   acquisition USD = price_mxn / rate;  landed = acq * 1.4;  retail = landed * 12
  if (item && (item.book_retail === null || item.book_retail === undefined)) {
    try {
      const { data: priced } = await supabase
        .from('inventory').select('price_mxn').eq('id', item.id as string).maybeSingle()
      const costMxn = Number(priced?.price_mxn ?? 0)
      if (costMxn > 0) {
        const r2 = (n: number) => Math.round(n * 100) / 100
        item.book_retail = r2(r2(r2(costMxn / DEFAULT_RATE) * 1.4) * 12)
      }
    } catch (_e) { /* leave retail null rather than failing the lookup */ }
  }

  // ── JSON mode: what the in-app tag viewer calls ────────────────────────────
  // Replaces the previous direct anon query against the inventory table.
  if (wantsJson) {
    return new Response(
      JSON.stringify(item ? { found: true, data: item } : { found: false, data: null }),
      {
        status: item ? 200 : 404,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
      }
    )
  }

  const appUrl = `${APP_URL}?tagid=${encodeURIComponent(tagid || '')}`

  if (!isCrawler) return Response.redirect(appUrl, 302)

  // ── Crawler metadata (link previews) ───────────────────────────────────────
  const esc = (s: unknown) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const title = esc(tagid || 'ONYX ARTIFACT')
  const desc = item
    ? esc([item.shape, item.short_description || 'ITEM', item.color].filter(Boolean).join(' | ').toUpperCase())
    : 'Secure Traceability Hub'

  let img = `${APP_URL}OnyxMini.svg`
  if (typeof item?.media_urls === 'string' && item.media_urls) {
    const first = item.media_urls.split(',')[0].trim()
    if (first.startsWith('http')) img = first
    else img = `${SUPABASE_URL}/storage/v1/object/public/inventory-media/${first}`
  }

  const html = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${esc(img)}">
    <meta property="og:image:alt" content="${title}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta http-equiv="refresh" content="0;url=${esc(appUrl)}">
  </head><body><a href="${esc(appUrl)}">Loading Artifact...</a></body></html>`

  return new Response(html, {
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }
  })
})
