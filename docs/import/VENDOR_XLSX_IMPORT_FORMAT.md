# Vendor XLSX import: format spec (Batch XLSX tab)

Written 2026-10-11 from the app code in `src/` (read only, not changed). Line numbers refer to those files.
Tools: `scripts/vendor-xlsx/make-vendor-xlsx.mjs` (writes a file) and `scripts/vendor-xlsx/check-vendor-xlsx.mjs` (checks one). Sample input: `scripts/vendor-xlsx/example.json`.

## 1. Short answer

- **Sheet:** the sheet named exactly as the vendor code (case and surrounding spaces ignored). If there is none, the **first sheet** of the file is read.
- **Header:** the **first row of the sheet's used range** (row 1 in a normal file). Data starts on the next row.
- **One row = one inventory item.** `cantidad` is a field on that item. A row with cantidad 2 is not two items.
- **Vendor and book are not in the file.** The vendor is picked on the screen. The book is always **826**.
- **Photos are not in the file.** They come from a dropped folder, matched by the item number in each file name.
- **Header set:** the app reads the Crear.xlsx headers, plus `#`, `descripcion` and `kg`. It does **not** read the headers of the app's own workbook exports (Shape Type, Colo Material, Quantity, Per Piece Pesos...). See section 9.

## 2. Sheet and header row (question 1)

| Point | Behaviour | Evidence |
|---|---|---|
| Sheet picked | Name trimmed and upper-cased equals the vendor code; otherwise `SheetNames[0]` (first tab in file order) | batchSheet.ts:170-172 |
| Header row | First row of the used range (`sheet_to_json`, `header: 1`, from `!ref`) | batchSheet.ts:175-176, 178 |
| Data rows | Every row after the header. Fully empty rows are skipped and not counted | batchSheet.ts:192-194 |
| Row numbers in messages | `sheetRow = index + 1` counted from the first row of the used range. If the used range starts at Excel row 3, the app's "row 2" is Excel row 4 (tested) | batchSheet.ts:195 |
| Other sheets | Ignored without a message | batchSheet.ts:172 |
| Fewer than 2 rows in range | "No data rows found in the spreadsheet." | batchSheet.ts:176 |

## 3. Columns (question 2)

**Header matching.** The header is lower-cased, accents removed, spaces collapsed (`foldHeader`, batchSheet.ts:66-73). It is then matched as is, then without a bracketed unit such as "(MXN)", then with punctuation turned into spaces (`mapHeader`, batchSheet.ts:76-86). So "Precio (MXN)", "Descripción", "D-cm" and "Tag - ID" all match.

**Required** in the table below means required by this spec. The app itself requires less (section 5).

| Header to write | Also accepted (after folding) | Required | Type | Cleaning | Goes to (inventory column) |
|---|---|---|---|---|---|
| `cantidad` | `qty`, `q` | no (blank = 1) | whole number, 1 or more | number cleaning (3.1), then truncated. A `0` is stored as 1; `2,5` is stored as 2. Silent | `quantity` (`quantity`), batchSheet.ts:33, 233; inventoryCreate.ts:366, 384 |
| `forma` | `shape` | **yes** (spec) | text | trimmed; translated Spanish to English by Gemini when "Translate ES → EN" is on (shape and material only) | `shape`, inventoryCreate.ts:374 |
| `tipo` | `type` | **yes** (spec) | text | trimmed; never translated | `itemType`, stored in `short_description` (manual Type), inventoryCreate.ts:375 |
| `color` | | no | text | trimmed; never translated | `color` (vendor colour), inventoryCreate.ts:376 |
| `material` | | no | text | trimmed; translated when Translate is on | `material`, inventoryCreate.ts:377 |
| `ancho` | `width`, `w cm` | no | cm, number | number cleaning | `width_cm`, inventoryCreate.ts:379 |
| `alto` | `height`, `h cm` | no | cm, number | number cleaning | `height_cm`, inventoryCreate.ts:380 |
| `fondo` | `depth`, `d cm` | no | cm, number (depth) | number cleaning | `length_cm`, inventoryCreate.ts:381 |
| `precio` | `price`, `per piece mxn`, `per piece mxn$` | **yes** (spec) | MXN per piece, number above 0 | number cleaning | `price_mxn` (inventoryCreate.ts:383) and the book codes at rate 17 (395-430) |
| `total` | `total pesos` | no | ignored | read and dropped | none (batchSheet.ts:42) |
| `#` | | no (blank = the app numbers the row) | whole number 1 to 9999; prefix allowed only if it is the vendor code (`EM-004`) | parseItemNumberCell, batchSheet.ts:111-122 | `item_number` and `item_id` = VENDOR-NNN (formatItemId, inventoryCreate.ts:131-134) |
| `descripcion` | `description`, `description color - object type` | no | text | trimmed; kept as typed | `description` (vendor note), inventoryCreate.ts:378 |
| `kg` | `peso` | no | kg, number | number cleaning | `weight_kg`, inventoryCreate.ts:382 |
| `date`, `fecha`, `tag-id`, `tag id`, `aqc`, `lc` | | no | ignored | | none (batchSheet.ts:45-48) |

Any other header is not read, and the review lists it as "Columns not read: ..." (BatchCreateWizard.tsx:781).

### 3.1 Number cleaning (`cleanNumberCell`, batchSheet.ts:95-105)

- Removes `mxn`, `usd`, `peso(s)`, `kg(s)`, `cm(s)`, `$` and spaces.
- A lone comma before 1 or 2 digits is a decimal comma: `12,5` = 12.5.
- Any other comma is a thousands mark and is dropped: `2,850` = 2850, `2,850.00` = 2850.
- **Dots are never thousands marks.** `1.250` = 1.25. `1.250,50` = 1.2505. Both are silent.
- A cell that is still not a number keeps its text, and the row blocks Create (section 7).
- Real Excel numbers are used as they are.

## 4. From a row to items (question 3)

- **One batch row becomes one inventory row.** One insert per row (batchImport.ts:257; inventoryCreate.ts:508-522). `cantidad` goes into `quantity`. The review adds up Qty for its totals line (BatchCreateWizard.tsx:644) but creates no extra items.
- **Item numbers** (batchSheet.ts:111-122; BatchCreateWizard.tsx:264-268):
  - Typed numbers are kept. `4`, `004` and `EM-004` (vendor EM) are all 4. `TE-004` on vendor EM, `4a`, `0` and `10000` are refused.
  - Blank numbers are assigned when the book loads: next after the book's highest number for this vendor, skipping numbers typed in this file (`assignNumbers`, batchSheet.ts:249-260). Gaps are not filled.
  - A number typed on two rows: the first row keeps it, the others are blocked (`numberConflicts`, batchSheet.ts:263-276).
  - A number already taken in the book: blocked. "Renumber" gives the next free numbers to the conflicting rows only (renumberConflicts, batchSheet.ts:279-284; BatchCreateWizard.tsx:655-659).
  - At import the book is read again. A number taken meanwhile fails that row only (batchImport.ts:219-247).
- **Vendor:** not in the file. Picked in the Batch XLSX screen (CreateItem.tsx:43-51, `batchVendor`). A Vendor-role user is locked to their own vendor (CreateItem.tsx:29). The codes offered are `VENDOR_CODES` (entryModel.ts:78-81; list in consts.tsx:27-48).
- **Book:** always 826. `BATCH_WORKBOOK = 'v826'` (batchImport.ts:35), and the picker is fixed to "826" (CreateItem.tsx:48). Books 326 and 825 cannot come through this tab. `ENTRY_BOOKS` (inventoryCreate.ts:52) is for Single Item only.
- **Written for each row** (`buildInventoryRow`, inventoryCreate.ts:354-467): `item_id`, `item_number`, `vendor_id`, `workbook` = v826, `status` = Acquisition (always; DEFAULT_ENTRY_STATUS, inventoryCreate.ts:49, 373), the file's text and numbers (section 3), `book_aq_code`, `book_land_code`, `book_acquisition`, `book_landed`, `book_retail`, `book_barcode` (rate 17), `media_urls` (photos, in order), `created_by` (the user), `timestamp` and `updated_at` (now), a new uuid as `id`.
- **Not from the file:** status, the AI texts. AI processes picked in the review run afterwards in the Catalog Hub (BatchCreateWizard.tsx:1092-1094 and 1129-1134).

## 5. Required fields (and why the spec differs from the app)

- The app keeps a row when **any** of precio, forma, tipo or descripcion is filled (batchSheet.ts:203). A row with only a shape is an item.
- Missing price: a warning only ("no book codes until one is entered", BatchCreateWizard.tsx:215). Missing photo: a warning only (216).
- Create is blocked only by item-number problems (352) and non-number cells (353).
- **This spec requires forma, tipo and precio on every row, and precio above 0** (`REQUIRED_FIELDS` in check-vendor-xlsx.mjs). Reason: a row without a price gets no book codes, and a row without forma and tipo has no name. This is a stricter rule than the app. See open question 2.

## 6. Photos (question 4)

- Photos are **not** in the workbook. The vendor export's "Image 1..N" columns are not read.
- **Folder drop** (BatchCreateWizard.tsx:789-797, 596-620; rules in batchPhotoMatch.ts:106-158):
  - An image is a file with an image MIME type or one of the extensions jpg, jpeg, png, webp, heic, heif, gif, bmp, tif, tiff (IMAGE_EXT line 37; isImageFile 41-43). Other files are skipped without a message (125-126).
  - The name without its extension must be: optional letters (1 to 6, the vendor prefix), optional separators (space, `.`, `_`, `-`), 1 to 4 digits (leading zeros allowed), then an optional suffix: `(2)`, `-2`, `2`, or a letter (NAME_RE, line 38; parsePhotoName 45-54).
  - A prefix must equal the vendor code (case ignored). Otherwise the file goes to the tray: "IMG is not vendor EM" (140-143). A file with no prefix matches any vendor.
  - The number must be a row of this batch. Otherwise: "No row #9 in this batch" (145). No number at all: "No item number in the name" (139).
  - Order within a row: the suffix number; a letter counts a=1, b=2; no suffix = 0. Ties by file name, numeric (154). The first photo is the hero (BatchCreateWizard.tsx:1016).
  - Subfolder named after an item (`EM-004/`, `004/`): holds that row's photos, ordered by each file's own number. Any other subfolder, or deeper nesting, is ignored and counted (127-138; BatchCreateWizard.tsx:819).
  - Same row, same file name and same size as an attached photo: skipped as already attached (146-148).
  - Unmatched files: tray. Drag one onto a row, or pick it and press "Attach picked photo" (BatchCreateWizard.tsx:823-843).
  - "Add photos" on a row and dropping files on a row take any image, with no name rule (577-582).
- **Upload:** every photo goes to Drive through the Apps Script `uploadMedia` action (utils.tsx:136-175). Four at a time (batchImport.ts:39, 195). Two attempts each (199). A row whose photo still fails is created without it and marked partial (262).

Tested results of the name rule (batchPhotoMatch.ts, run as shipped):

| File name | Result |
|---|---|
| `EM-004.jpg` | row 4, order 0 |
| `em_004b.jpg` | row 4, order 2 |
| `004.jpg` | row 4 (no prefix) |
| `EM-004 (2).jpg`, `EM-004-2.jpg` | row 4, order 2 |
| `EM 4.jpeg`, `EM-0004.jpg`, `EM-004a.png` | row 4 |
| `EM-004-2026.jpg`, `EM-004.final.jpg`, `photo.jpg` | not matched (tray) |
| `IMG_1234.jpg` | not matched: "IMG is not vendor EM" |
| `TE-004.jpg` (vendor EM) | not matched: "TE is not vendor EM" |
| `1234.jpg` | **row 1234** (a bare number matches) |

## 7. Validation and messages (question 5)

**Whole file** (BatchCreateWizard.tsx:110-115; the app shows these in English):

| Code | Message | Cause |
|---|---|---|
| unreadable | Could not read the file. It may be open in another program, or not be an xlsx. | XLSX.read fails (batchSheet.ts:167) |
| no_rows | No data rows found in the spreadsheet. | fewer than 2 rows in range (176) |
| no_headers | Could not recognise any column headers. Expected: cantidad, forma, tipo, color, material, ancho, alto, fondo, precio. | no header maps to a field (185). Happens when row 1 of the range is empty |
| no_valid_rows | No row has a price, shape, type or description. | every row was skipped (240) |

Also: "Choose a vendor first" (BatchCreateWizard.tsx:398) and "Please drop an .xlsx file" (399).

**Per row, shown in the review** (rowIssues, BatchCreateWizard.tsx:200-218):

| Level | Message | Blocks Create? |
|---|---|---|
| error | "{n}" is not an item number / No item number yet | yes |
| error | {id} is already taken in book 826 | yes |
| error | #{n} is on another row of this batch too | yes |
| error | {field}: "{value}" is not a number (fields: Qty, W cm, H cm, D cm, Kg, Price MXN) | yes (353) |
| warn | No price: the row gets no book codes until one is entered | no |
| warn | No photo: image processes skip it; Write From Similar can write its copy | no |

**In the file, skipped or noted** (BatchCreateWizard.tsx:778-783):
- "No sheet is named EM; read "Sheet1"." (778)
- "{n} rows had no price, shape, type or description and were skipped." (780)
- "{n} more rows were not imported: the limit is 100 per batch. Split the sheet to load the rest." (779; toast at 431)
- "Columns not read: ..." (781)
- "Not translated: ..." (782-783)

**At import** (batchImport.ts): "Could not check the book’s numbers: {error}" (223); "{id} was taken in book 826 meanwhile" (245); "Stopped before it was created" (236); "The insert failed" (271); "{n} photo(s) did not upload" (265).

**Create refused** (BatchCreateWizard.tsx:344-353): "Could not read the book’s numbers, so nothing was created..." (349); "{n} rows have a number that cannot be used. Renumber or fix them first." (352); "Some cells are not numbers. Fix them first." (353).

**Checker messages** (check-vendor-xlsx.mjs) add these, marked `[spec]` when the spec requires them: forma / tipo / precio is required; precio must be above 0; cantidad must be a whole number, 1 or more; ancho, alto, fondo or kg must be above 0 when filled; "header ... makes the app's column map fail"; "column X has values but no header"; "A and B are both read as ...; the app keeps the last one"; "the used range starts at Excel row N"; and the warnings for ambiguous numbers (3.1).

## 8. Limits (question 6)

- **Rows:** 100 item rows per file (`MAX_ITEMS`, batchSheet.ts:51, 206). Blank rows do not count. Rows past 100 are counted and not imported, with a warning.
- **File size:** no limit found in the batch path. The whole workbook is read into memory (batchSheet.ts:166). `.xlsx` and `.xls` are accepted (BatchCreateWizard.tsx:443). Not tested with large files.
- **Photos:** no count or size limit found in the batch path. Upload goes through the Apps Script endpoint, whose own limits were not checked.
- **Text:** no length limit in the parse. The Excel cell limit still applies.

## 9. Vendor exports against the importer (question 7)

The app's own exports use the Workbook V2 layout built by `vendorSheetColumns` (MainHeader.tsx:881-909), used by the Selected Items export (MainHeader.tsx:1615) and the Workbook V2 export (3002), and repeated for the "Not Shopify Ready (V2)" sheet (4239-4260). Their headers, and whether the importer reads them:

| Export header | Read by the importer? | What it would need |
|---|---|---|
| Date | ignored | nothing |
| Shape Type | **no** | `forma` and `tipo` as two columns (the export joins them, MainHeader.tsx:4288) |
| Colo Material | **no** | `color` and `material` as two columns (joined, 4289) |
| Tag - ID with LC | **no** | `#` (e.g. `4` or `EM-004`) |
| Quantity | **no** | `cantidad` (without it, Qty becomes 1) |
| Weight | **no** | `kg` |
| H Cm | yes | alto |
| W cm | yes | ancho |
| D cm | yes | fondo |
| Pounds, L inch, W Inch, D Inch | no | cm columns (or kg) |
| Per Piece Pesos | **no** | `precio` |
| Total in Pesos | no | not needed |
| Per Piece US$, Total in US$ Dollars | no | the app works in MXN |
| ACQ Code, LND Code, RETAIL, TRK | no | computed by the app |
| Image 1..N | no | photos from the folder |

**The sheet name is the vendor's full name**, not the code: `(vMeta?.name || vid)` (MainHeader.tsx:2737, 2997), e.g. "EMMANUEL DE LOS SANTOS" (consts.tsx:30). The importer looks for "EM", so it reads the first sheet, which can belong to another vendor.

Result, tested: the export layout is not importable. Its only read columns are H Cm, W cm and D cm, so every row is skipped and the file stops with "No row has a price, shape, type or description." **The importer accepts only the Crear.xlsx-style headers** (with the English aliases in section 3).

**The template** `public/Crear.xlsx` has one sheet, `Sheet1`, a header row only, and no data or validation. Its ten headers are `cantidad, forma, tipo, color, material, ancho, alto, fondo, precio, total`. No code path serves it by name (a search of `src/` for "Crear.xlsx" finds nothing). The only reference is a legacy catalogue entry, "Vendor Batch Import (XLSX)" (templateCatalogue.ts:213-221), which TemplatesTab shows as text only.

## 10. Minimal valid example (5 rows)

The writer produces this layout: sheet `EM`, header row `cantidad | forma | tipo | color | material | ancho | alto | fondo | precio | total | # | descripcion | kg`, values as numbers. Source: `scripts/vendor-xlsx/example.json`.

| cantidad | forma | tipo | color | material | ancho | alto | fondo | precio | total | # | descripcion | kg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Large | Bowl | Blue Argentina | Onyx | 32 | 12 | 32 | 2850 | 2850 | 1 | Hand carved, one piece | 4.2 |
| 2 | Round | Table lamp | Honey | Onyx | 18 | 34 | 18 | 3900 | 7800 | 2 | Pair, same veining | 2.6 |
| 1 | Oval | Mirror | Green Mexican | Marble | 60 | 90 | 3 | 6400 | 6400 | 3 | Frame in one piece | 14 |
| 1 | Long | Canoe | Black | Wood | 40 | 25 | 180 | 48000 | 48000 | 4 | Decorative, not for water | 70 |
| 1 | Square | Wine rack | Natural | Mahogany | 45 | 90 | 30 | 4200 | 4200 | 5 | Holds 12 bottles | 22 |

In the app this becomes five inventory items, EM-001 to EM-005 in book 826. The table lamp (EM-002) is one item with Qty 2, not two items. `total` is not read by the app; the writer fills it as precio times cantidad for readability.

## 11. Pitfalls found

1. **Exports cannot be re-imported** (section 9). Their sheets are named by the vendor's full name, so the app takes the first sheet, which may be another vendor's. Today that sheet has no mapped price or shape, so it is refused. A future export that does map those columns would import the wrong vendor's rows without a message.
2. **"Quantity" is ignored.** Every row becomes Qty 1, with no warning.
3. **Quantity 0 is stored as 1; 2.5 as 2.** Silent (batchSheet.ts:233; inventoryCreate.ts:384).
4. **Thousands marks.** `1.250` reads as 1.25. `1.250,50` reads as 1.2505. `1,250` reads as 1250 (3.1).
5. **Two headers for one field** (for example `Q` and `Cantidad`, or `precio` and `Precio (MXN)`): the last column wins, no error (forEach overwrite, batchSheet.ts:198-200).
6. **The header row must be the first row of the used range.** A formatted but empty row 1, which Excel often creates, gives "Could not recognise any column headers" (tested with a styled empty A1).
7. **Row numbers** in messages count from the first row of the used range, not from Excel row 1 (tested: range starting at row 3).
8. **Totals rows:** a totals row that has a price is read as an item, because nothing detects totals rows. The checker flags it (no forma or tipo).
9. **Translation:** shape and material are sent to Gemini when Translate is on and a key exists (BatchCreateWizard.tsx:179). The stored text can differ from the file. Type, colour and note stay as typed.
10. **Dimension-only or colour-only rows** are skipped without an error. They are counted in one message (780).
11. **Item-number prefixes:** another vendor's prefix is refused. With no vendor chosen, every prefix is refused.
12. **Book unreadable:** rows without `#` stay blank and Create is blocked (BatchCreateWizard.tsx:349, 352).
13. **Bare numbers in photo names** match rows: `1234.jpg` is row 1234.
14. **Header named `constructor`** (or another JavaScript property name) crashes the importer with "field.startsWith is not a function" (tested). `mapHeader` looks names up in a plain object (batchSheet.ts:76-86).
15. **A CSV renamed to `.xlsx`** is read as CSV without any message (tested).
16. **Only one sheet is read.** Others are ignored without a message.
17. **Writer side (ExcelJS, used by the generator):** a cell whose text equals a JavaScript property name (`constructor`, `toString`, `valueOf`, `__proto__`, ...) makes ExcelJS drop the whole sheet (tested). The generator refuses those words. The app's reader is not affected.

## 12. Open questions

1. **Should the importer accept the workbook export headers** (Shape Type, Colo Material, Quantity, Per Piece Pesos, Weight, Tag - ID...), or should vendors be given the Crear.xlsx layout only? This is a code decision, not a format one.
2. **Are forma, tipo and precio the right required set?** The app requires none of them strictly (section 5). Confirm, or tell me which to drop.
3. **Vendor names as sheet names:** should the importer also accept the vendor's full name (`EMMANUEL DE LOS SANTOS`)?
4. **Photo upload limits:** the Apps Script `uploadMedia` size, quota and timeout were not checked. What is the largest photo a vendor sends?
5. **Book numbers:** the checker does not read the book, so numbers taken there are only caught in the app. Should the checker be given read access to check them?
6. **Vendor numbering:** do vendors send `4`, `004` or `EM-004`? The importer accepts all three; the photo names must match the same number.
7. **`Crear.xlsx`:** who uses it? No code links it. Is it sent to vendors outside this repo (for example from `/Crear.xlsx` on the site)?
8. **Limits:** is 100 rows per file enough? Is there a file-size limit wanted?
9. **Totals rows:** should the importer skip rows whose forma and tipo are both empty but precio is set?
10. **Translation of English files:** Translate ES to EN is on by default. Should it skip rows that are already in English?

## 13. How the tools work

**`make-vendor-xlsx.mjs input.json output.xlsx`**
- Checks every row against section 3 and the required set in section 5. Refuses (exit 1, nothing written) on any error; messages go to stderr with the item index and sheet row.
- Refuses: a missing required field; a price of 0 or a non-number; a number that would be misread (`1.250`); a quantity that is not a whole number of 1 or more; an item number with a foreign prefix or a repeat; an unknown key; a book other than 826; a vendor outside the 20 codes; more than 100 items; a word ExcelJS cannot write.
- Writes the sheet named after the vendor, the header row in the order above, numbers as numbers, price and total with two decimals.
- Runs the checker's rules on the finished workbook before writing. Writes only if the check passes.
- Prints one summary line: `wrote N rows to PATH · sheet "EM" · book 826 · check OK · W warning(s)`. Warnings (no `#`, no colour, no material, no full size) go to stderr.
- Exit codes: 0 written, 1 refused, 2 usage.

**`check-vendor-xlsx.mjs file.xlsx [--vendor EM]`**
- Reads the file the way the app does (SheetJS, the same library). Without `--vendor` it reads the first sheet, as the app does with no vendor chosen.
- Prints the sheet, the columns read, one line per problem as `row N  ERROR|WARN  [spec] message`, then `OK: N item row(s), 0 errors, ...` or `FAILED: ...`.
- Exit codes: 0 no error (warnings may print), 1 an error or unreadable file, 2 bad usage.
- The rules are copied from batchSheet.ts with line references (no import, because that file is TypeScript inside the app). Test run on 2026-10-11: 192 function comparisons (header names, number cells, item numbers, `COLUMN_MAP`, vendor codes against consts.tsx) and 24 whole-file comparisons against the app's `parseSheet` (bundled from source), all equal. The test harness is in the session scratchpad, not in the repo. If batchSheet.ts changes, update the copies and re-run that comparison.
