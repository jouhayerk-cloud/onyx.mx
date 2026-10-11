---
name: OnyxMX-VendorXlsx
description: "Generate a vendor upload XLSX for the app's Batch XLSX tab from a vendor's list (photo, PDF, text or sheet): map columns, apply the owner's price rules, write the file with the generator and check it with the checker. Use when asked to turn a vendor list into an upload file."
---

# OnyxMX Vendor XLSX Upload

> **Domain**: the Batch XLSX tab (Create Item), one vendor, book 826, up to 100 rows per file.
> **Spec**: `docs/import/VENDOR_XLSX_IMPORT_FORMAT.md` (read it when a rule below is not enough).
> **Tools**: `scripts/vendor-xlsx/make-vendor-xlsx.mjs` (writes the file), `scripts/vendor-xlsx/check-vendor-xlsx.mjs` (checks any file), `scripts/vendor-xlsx/example.json` (sample input).
> **Output folder**: `vendor-uploads/` in the app repo, named `<VENDOR>-<YYYY-MM-DD>-<short-name>.json` and `.xlsx`. Keep both: the JSON is the audit trail. The folder is local only (prices and vendor data): do not commit it.

## Steps

1. **Read the list.** If it is a photo or a PDF, read it row by row and write down every column the vendor gave. Do not guess a number you cannot read: ask.
2. **Ask only what the list cannot answer.** The questions that matter: which column is the MXN acquisition price (the app stores one price per piece, MXN), is a quantity more than one a pair (one row with `quantity`, never two rows), and which vendor code it is. Everything the owner has already said in the conversation stands: do not ask again.
3. **Map each row to the JSON** (fields in the table below) and write `vendor-uploads/<name>.json`.
4. **Generate and check:** `node scripts/vendor-xlsx/make-vendor-xlsx.mjs vendor-uploads/<name>.json vendor-uploads/<name>.xlsx`. It refuses to write a file the app would block (exit 1, messages on stderr) and prints warnings for what the app only flags.
5. **Cross-check the sum.** Add up `price x quantity` and compare with the total the vendor wrote on the list. A mismatch is read again or reported, never hidden. A row the vendor priced by exception keeps its price and gets a note in `description`.
6. **Report** the row count, the sum, the warnings and the file path. Send the xlsx to the owner (SendUserFile) when he is on another device. Do not push it anywhere: he uploads it in the app.

## The JSON

`{ "vendor": "GE", "book": "826", "items": [ ... ] }`. The book is always `"826"`; the vendor is one of the picker's codes (AM AN BT CA CP DH EM ET FR GE GM GS IH JM ML MM ON RF SU TE).

| Key | Header written | Meaning |
|---|---|---|
| `quantity` | cantidad | whole number, 1 or more; blank is 1 |
| `shape` | forma | the FORM, in the app's vocabulary (Squared, Cylinder, Round...) |
| `itemType` | tipo | the canonical Type (Floor Lamp, Table Lamp, Pendant, Wall Panel, Decorative Tray...) |
| `color` | color | the vendor's colour, translated to the app's English name |
| `material` | material | Onyx, Marble... |
| `widthCm` `heightCm` `lengthCm` | ancho alto fondo | centimetres; lengthCm is the depth |
| `weightKg` | kg | kilograms, when the vendor gave it |
| `price` | precio | MXN per piece, above 0 |
| `itemNumber` | # | optional; photos match by this number, so write it when photos will come |
| `description` | descripcion | the vendor note (their own words, who sent it, exceptions) |

Required on every row by this tool: `shape`, `itemType`, `price`. Numbers are JSON numbers, never text like `"1.250"` (the app reads a dot as a decimal). `total` is written by the generator, and the app ignores it.

## Rules the owner has set

- **Vocabulary is the app's, in English**: use the canonical Type and Form names (see OnyxMX-InventoryAttributes and `src/lib/inventoryTaxonomy.ts`). Tower Lamp is Floor Lamp; Luminary is Wall Panel; squared and rectangular are one form, Squared; a canoe is a Decorative Tray. Open Top or Closed Top is part of the Shape text ("Squared Open Top") when the vendor says it.
- **Price**: when the list has several money columns, ask which is the acquisition price in MXN. For the 9 Oct 2026 Gerardo list the owner said: Total is the MXN acquisition price; ignore Price MXN and the installer column.
- **One row is one item**; quantity is a field.
- **The app's own exports cannot be re-imported** (different headers, one joined Shape Type column): never take an export as the source of a vendor file. Start from the vendor's list.
- **Status, book codes and AI text are not in the file**: the app sets them. Do not write prices in any other currency.
- **Photos are not in the file**: they come from a dropped folder, named with the item number (`GE-004.jpg`).

## Pitfalls

- Over 100 rows: split into several files; the app drops the rest with a warning.
- The generator refuses the words that are JavaScript object names (`constructor`, `toString`...) as cell text; change the word.
- The checker does not know which numbers are already taken in book 826: the app's review step shows conflicts and offers Renumber.
- Do not send the file to a vendor or post it anywhere; it is an internal import file.
