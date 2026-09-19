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

// Columns this function reads. Acquisition cost (price_mxn), landed cost,
// book_acquisition, vendor notes and every payment field are deliberately
// absent, so they cannot reach a response by any code path below.
//
// AQ and LD codes ARE read and published, on Ramses's instruction (19 Sep
// 2026): the public page shows the codes and USD retail, and no other price.
// Until then they were withheld because the codes encode cost — anyone who
// knows the cypher can read acquisition and landed cost back out of them.
// That trade-off is his call; this note is so nobody re-discovers it the hard
// way.
const PUBLIC_FIELDS = [
  'id', 'item_id', 'item_number', 'workbook',
  'shape', 'material', 'color', 'quantity',
  'weight_kg', 'height_cm', 'width_cm', 'length_cm',
  'short_description', 'detailed_description', 'generated_description',
  'generated_color', 'generated_type',
  'media_urls', 'processed_media_urls', 'generated_png_url', 'generated_svg_url',
  'generated_image_urls', 'axo_icon_url',
  'status', 'book_barcode', 'book_retail', 'book_aq_code', 'book_land_code'
].join(',')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

// ── Images: processed only ───────────────────────────────────────────────────
// The public page shows background-replaced photographs and nothing else — never
// a raw upload. processed_media_urls is a JSON map from each source photo to its
// processed version, mixed with "_"-prefixed metadata entries (_pixel_map_hex,
// _bitmap_url, _generated_color, _generated_type) that are not images. Keys are
// written in either the raw or the cleaned form of the source URL, so entries
// are matched to the item's photos by Drive file id — checked against the whole
// catalogue on 19 Sep 2026: all 306 processed entries match a current photo
// that way, none are stale and none are videos. generated_png_url is the
// processed hero from the older pipeline and counts as processed; it is
// de-duplicated by file id against the map.

const VIDEO_EXT = ['mov', 'mp4', 'webm', 'ogg', 'm4v', 'avi', 'mkv']
const isVideo = (u: string) => {
  const ext = String(u || '').split(/[?#&]/)[0].split('.').pop()?.toLowerCase() || ''
  return VIDEO_EXT.includes(ext)
}
const driveId = (u: string): string | null => {
  const m = String(u || '').match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/)
  return m ? m[1] : null
}
// Mirrors getCleanImageUrl in src/lib/utils.tsx for stills.
const cleanImageUrl = (u: string): string => {
  const s = String(u || '').split('&tag=')[0].trim()
  const id = driveId(s)
  if (id && /drive\.google\.com/i.test(s)) return `https://lh3.googleusercontent.com/d/${id}`
  return s
}
const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)

function processedImages(item: Record<string, unknown>): string[] {
  let map: Record<string, unknown> = {}
  const raw = item.processed_media_urls
  if (raw && typeof raw === 'object') map = raw as Record<string, unknown>
  else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try { map = JSON.parse(raw) || {} } catch (_e) { map = {} }
  }

  // Processed values keyed by the source photo's Drive id (or its exact key).
  const byId = new Map<string, string>()
  const byKey = new Map<string, string>()
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith('_') || !isHttp(v) || isVideo(v)) continue
    byKey.set(k, v)
    const id = driveId(k)
    if (id) byId.set(id, v)
  }

  const out: string[] = []
  const seen = new Set<string>()
  const push = (u: string) => {
    const clean = cleanImageUrl(u)
    const key = driveId(clean) || clean
    if (!clean || seen.has(key)) return
    seen.add(key)
    out.push(clean)
  }

  // In the item's own photo order, the processed version of each photo that has one.
  const sources = String(item.media_urls || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  for (const src of sources) {
    if (isVideo(src)) continue
    const hit = byKey.get(src) || byKey.get(cleanImageUrl(src)) || (driveId(src) ? byId.get(driveId(src) as string) : undefined)
    if (hit) push(hit)
  }
  // The older pipeline's processed hero, when it is not already among them.
  if (isHttp(item.generated_png_url) && !isVideo(item.generated_png_url)) {
    if (out.length === 0) push(item.generated_png_url)
    else if (!seen.has(driveId(item.generated_png_url) || '')) push(item.generated_png_url)
  }
  return out
}

// ── Copy ─────────────────────────────────────────────────────────────────────
// AI bodies are stored as HTML for Shopify. The public record carries TEXT, so
// no stored markup is ever served to a browser: breaks become newlines, tags
// are dropped, the common entities decoded.
function htmlToText(html: unknown): string {
  if (!html) return ''
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// The whole public record, and the only shape the tag page renders. Every field
// is chosen here, on the server: there is no "hide it in the UI" anywhere.
function publicArtifact(item: Record<string, unknown>) {
  const s = (v: unknown) => String(v ?? '').trim()
  const tag = s(item.book_barcode)
  const images = processedImages(item)
  return {
    tag,
    vendor: tag.slice(0, 2).toUpperCase(),
    workbook: s(item.workbook),
    quantity: Number(item.quantity) || 1,
    name: [s(item.shape), s(item.short_description)].filter(Boolean).join(' '),
    stone: [s(item.color), s(item.material)].filter(Boolean).join(' '),
    title: s(item.detailed_description) || null,
    body: htmlToText(item.generated_description) || null,
    type: s(item.generated_type).split('>').map(p => p.trim()).filter(Boolean),
    colors: s(item.generated_color).split(',').map(c => c.trim()).filter(Boolean),
    specs: {
      widthCm: num(item.width_cm),
      heightCm: num(item.height_cm),
      lengthCm: num(item.length_cm),
      weightKg: num(item.weight_kg),
    },
    codes: { aq: s(item.book_aq_code) || null, ld: s(item.book_land_code) || null },
    retailUsd: num(item.book_retail),
    images,
    icon: isHttp(item.axo_icon_url) ? cleanImageUrl(item.axo_icon_url) : null,
  }
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
          const [, , wb, n] = match
          const { data: pData, error: pErr } = await supabase
            .from('inventory').select(PUBLIC_FIELDS)
            .or(`workbook.eq.${wb},workbook.eq.V${wb},workbook.eq.v${wb}`)
            .eq('item_number', parseInt(n, 10))
          if (pErr) lookupError = pErr.message
          item = pData?.[0] ?? null
        }
      }
    } catch (e) {
      lookupError = String(e)
    }
  }

  if (lookupError) console.error('[artifact] lookup failed:', lookupError)

  // Retail is derived from price_mxn, which must never leave the server. All 497
  // items carry book_retail as of 19 Sep 2026, so this only runs for a record
  // saved without it; it reads the cost, computes retail, and returns only the
  // result, mirroring calculateCodesAndPrices():
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

  const artifact = item ? publicArtifact(item) : null

  // ── JSON mode: what the in-app tag page calls ──────────────────────────────
  // `artifact` is the curated public record the redesigned tag page renders.
  // `data` keeps the previous shape so the app build currently deployed keeps
  // working until the next deploy — but with its gallery narrowed to the same
  // processed-only images, and without the processing map, so no build of the
  // app can show a raw upload from this response.
  if (wantsJson) {
    let legacy: Record<string, unknown> | null = null
    if (item && artifact) {
      legacy = { ...item }
      delete legacy.processed_media_urls
      delete legacy.book_aq_code
      delete legacy.book_land_code
      legacy.media_urls = artifact.images.join(',')
      legacy.generated_png_url = null
      legacy.generated_image_urls = null
    }
    return new Response(
      JSON.stringify(item ? { found: true, data: legacy, artifact } : { found: false, data: null, artifact: null }),
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

  const title = esc(artifact?.title || tagid || 'ONYX ARTIFACT')
  const desc = artifact
    ? esc([artifact.tag, artifact.name, artifact.stone].filter(Boolean).join(' · ').toUpperCase())
    : 'Secure Traceability Hub'

  // A processed photograph, else the axonometric icon, else the logo — never a
  // raw upload, which is what this used to take from media_urls.
  const img = artifact?.images[0] || artifact?.icon || `${APP_URL}OnyxMini.svg`

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
