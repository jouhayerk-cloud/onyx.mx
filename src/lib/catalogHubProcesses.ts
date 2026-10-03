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
