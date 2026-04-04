import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

serve(async (req) => {
  const url = new URL(req.url)
  const tagid = url.searchParams.get('tagid')

  if (!tagid) {
    return new Response("Missing tagid", { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  // Try inventory first
  let { data: item, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('book_barcode', tagid)
    .maybeSingle()

  // Try production if not found
  if (!item) {
    const { data: prodData } = await supabase
      .from('production')
      .select('*')
      .eq('tag_id', tagid)
      .maybeSingle()
    item = prodData
  }

  if (!item) {
    return new Response("Item not found", { status: 404 })
  }

  // Extract metadata
  const title = `${item.shape || 'Artifact'} - ${item.short_description || item.description || tagid}`
  const description = `${item.color || ''} ${item.material || ''} | Onyx.mx Artifact Traceability`.trim()
  
  // Get image URL - using raw snake_case columns
  let imageUrl = item.generated_png_url || item.media_urls?.split(',')[0] || item.generated_image_urls?.split(',')[0]
  if (imageUrl && !imageUrl.startsWith('http')) {
      // Handle relative or storage paths if necessary
  }

  const redirectUrl = `https://jouhayerk-cloud.github.io/onyx.mx/?tagid=${tagid}`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${title}</title>
  <meta name="title" content="${title}">
  <meta name="description" content="${description}">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${req.url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="${req.url}">
  <meta property="twitter:title" content="${title}">
  <meta property="twitter:description" content="${description}">
  <meta property="twitter:image" content="${imageUrl}">

  <!-- Redirect to app -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}">
  <script>window.location.href = "${redirectUrl}";</script>
</head>
<body>
  <p>Redirecting to Onyx.mx Artifact Viewer...</p>
</body>
</html>
  `

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  })
})
