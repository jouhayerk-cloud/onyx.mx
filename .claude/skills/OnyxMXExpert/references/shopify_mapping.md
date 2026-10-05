# Shopify Export Mapping Reference (Matrixify Format)

## XLSX Column Mappings

| # | Shopify Column | Internal Source Field | Transformation |
|---|---------------|----------------------|----------------|
| 1 | Handle | `title` or `tagId` | Lowercase, spaces → hyphens |
| 2 | Title | `shape`, `shortDesc`, `color`, `material` | `${shape} ${shortDesc} ${color} ${material}` + optional `partSuffix` |
| 3 | Body (HTML) | `marketingDescription` / `detailedDescription` | AI-generated HTML or fallback |
| 4 | Vendor | `vendorName` | Direct mapping from vendor registry |
| 5 | Type | `generatedType` | Via `getProductCategoryAndType()` |
| 6 | Tags | Multiple fields | Comma-separated: `tagId, color, material, shape, shortDesc, heightCm, widthCm` |
| 7 | Published | — | Default: `TRUE` |
| 8 | Variant Position | Sequential | Auto-assigned per product |
| 9 | Variant SKU | `tagId`, `vendorSku`, `costMxn` | Combined: `${tagId}-${vendorSku}${costMxn}` |
| 10 | Variant Barcode | `tagId` / `bookBarcode` | Direct |
| 11 | Variant Cost | `bookLanded` | Landed cost in USD |
| 12 | Variant Price | `bookRetail` | Retail price in USD (or `(costMxn/rate)*1.4*12`) |
| 13 | Variant Grams | `weightKg` | `weightKg * 1000` |
| 14 | Image Src | `mediaUrls` | Multi-image matrix (1st = MERGE, rest sequential) |
| 15 | Image Position | Sequential | 1, 2, 3... per product |
| 16 | Variant Image | `mediaUrls[0]` | First image gets Variant Image assignment |

## Metafield Mappings

| Metafield Namespace.Key | Value Source | Logic |
|------------------------|-------------|-------|
| `custom.polish_type` | Vendor prefix | `JM` → "Fully Polished", `TE/EM/ML` → "Partially Polished", else → "Matte" |
| `Measurements` | Dimensions | `D{depthInches}×W{widthInches}×H{heightInches}` |
| `custom.variety` | Constant | "Mexican Onyx" (default) |

## Allowed Shopify Color Options
```
Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green,
Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold,
Silver, Tan, Turquoise/Aqua, White, Yellow
```

## Shopify Product Taxonomy Categories
```
Home Decor > Pendant Lights
Home Decor > Decorative Bowls
Home Decor > Decorative Trays
Home Decor > Sculptures
Outdoor Decor > Fountains
```

## Multi-Image Logic (Matrixify)
- First image row: Gets `MERGE` command + `Variant Image`
- Subsequent image rows: Populate `Image Src` + sequential `Image Position`
- All images associated to same Handle via repeating Handle column

## Price Calculation for Export
```
Variant Cost = bookLanded = (price_mxn / exchangeRate) * 1.4
Variant Price = bookRetail = bookLanded * 12
```
