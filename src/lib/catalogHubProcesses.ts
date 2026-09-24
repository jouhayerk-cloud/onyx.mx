export interface CatalogProcess {
    id: 'img_clean' | 'title_desc' | 'marketing_desc' | 'dominant_colors'
      | 'hex_map' | 'product_type' | 'video_proc' | 'variation_donor' | 'image_segmentation';
    label: string;              // English. UI strings in this app are English.
    writes: readonly string[];  // REAL column names only — grep them first
    requiresMedia: boolean;     // img_clean/hex_map/dominant_colors need a photo
    requiresVideo: boolean;     // video_proc only
    defaultChecked: boolean;
}

export const CATALOG_PROCESSES: readonly CatalogProcess[] = [
    {
        id: 'img_clean',
        label: 'Background Clean & Replacement',
        writes: ['processed_media_urls', 'generated_png_url', 'generated_svg_url', 'axo_icon_url'],
        requiresMedia: true,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'title_desc',
        label: 'AI Title Description',
        // CANONICAL MAP (corrected 2026-09-23). Every writes[] below matches
        // BatchProcessingWizard's handleSaveDescription — the writer that has
        // processed ~497 items and that the Shopify export, aiContent.ts and
        // the inventory card all read back:
        //   AI title          -> detailed_description (formatProductTitle)
        //   marketing HTML    -> generated_description
        //   dominant colours  -> generated_color   (color = the vendor's own)
        //   product category  -> generated_type
        // description and short_description are MANUAL fields: the vendor's
        // text and the Type input. No AI process writes either.
        // History: the 2026-09-21 plan mapped marketing HTML to
        // detailed_description and the 2026-09-22 fix sent the title to
        // description and colours to color. Both checked that the columns
        // EXISTED; neither checked what the canonical writer MEANT by them.
        writes: ['detailed_description'],
        requiresMedia: false,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'marketing_desc',
        label: 'Marketing Description (HTML)',
        writes: ['generated_description'],
        requiresMedia: false,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'dominant_colors',
        label: 'Dominant Colors Classification',
        writes: ['generated_color'],
        requiresMedia: true,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'hex_map',
        label: '20x20 Spatial Hex Color Map',
        writes: ['spatial_points'],
        requiresMedia: true,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'product_type',
        label: 'Product Type Categorization',
        writes: ['generated_type'],
        requiresMedia: false,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'image_segmentation',
        label: 'Vector Cutout & PNG Generation',
        writes: ['svg_data', 'cutout_png_file_id', 'contour_points'],
        requiresMedia: true,
        requiresVideo: false,
        defaultChecked: true
    },
    {
        id: 'video_proc',
        label: 'Video AI Analysis',
        writes: ['processed_media_urls'],
        requiresMedia: false,
        requiresVideo: true,
        defaultChecked: false
    },
    {
        id: 'variation_donor',
        label: 'Write From Similar (Donor)',
        writes: ['detailed_description', 'generated_description', 'generated_color', 'generated_type'],
        requiresMedia: false,
        requiresVideo: false,
        defaultChecked: false
    }
];

/**
 * CatalogHubProcessesPanel reads its `results` prop by process id —
 * `results['marketing_desc']`, `results['dominant_colors']`, etc. (see
 * hasResult = !!results[p.id] in the panel). The pipeline's own BatchOp.result
 * shape uses completely different field names — `marketingDescription`,
 * `dominantColors`, `generatedType`, `cleanedUrl`... — and no key in it is
 * ever literally named after a process id. Passing that raw object straight
 * through as `results` (as all three Add Entry call sites did) meant
 * `results[p.id]` was undefined for every row: the checkmarks, the HTML
 * preview, the colour chips and the cleaned-image thumbnail never rendered,
 * independently of whether the underlying save was correct.
 *
 * One adapter, called from every surface that mounts the panel, so the two
 * shapes cannot drift apart three separate ways again.
 */
export function mapResultsByProcessId(ai: Record<string, any>): Record<string, any> {
    return {
        title_desc: ai.description || undefined,
        marketing_desc: ai.marketingDescription || undefined,
        dominant_colors: ai.dominantColors,
        product_type: ai.generatedType || undefined,
        img_clean: ai.cleanedUrl || undefined,
        image_segmentation: ai.segmentation || undefined,
        hex_map: ai.bitmapUrl || undefined,
        video_proc: ai.videoGen || undefined
        // variation_donor has no result field of its own in BatchOp — it
        // fills the same description/marketingDescription/dominantColors/
        // generatedType fields as the text processes, which the canonical
        // writer maps to detailed_description / generated_description /
        // generated_color / generated_type. No distinct signal to check a box
        // for, so it is left unmapped rather than guessed.
        // (image_segmentation writes to the item_segmentation TABLE, not to
        // inventory — its writes[] name that table's columns.)
    };
}
