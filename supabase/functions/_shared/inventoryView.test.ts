import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  COMPACT_COLUMNS,
  KNOWN_COLUMNS,
  selectColumns,
  capPayload,
} from "./inventoryView.ts";
import { COST_COLUMNS } from "./onyxDataTools.ts";

// ── selectColumns Tests ──────────────────────────────────────────────────────

Deno.test("selectColumns compact: returns default curated columns for non-finance caller", () => {
  const resultDefault = selectColumns();
  const resultCompactExplicit = selectColumns("compact", undefined, false);

  assertEquals(resultDefault, COMPACT_COLUMNS.join(","));
  assertEquals(resultCompactExplicit, COMPACT_COLUMNS.join(","));

  // Verify none of the sensitive cost/price columns are present for non-finance callers
  for (const costCol of COST_COLUMNS) {
    const cols = resultCompactExplicit.split(",");
    assert(!cols.includes(costCol), `Non-finance compact view must not include cost column: ${costCol}`);
  }
});

Deno.test("selectColumns full: returns wildcard '*' for both finance and non-finance callers", () => {
  assertEquals(selectColumns("full", undefined, false), "*");
  assertEquals(selectColumns("full", undefined, true), "*");
  assertEquals(selectColumns("full", null, false), "*");
});

Deno.test("selectColumns fields with unknown names: drops unknown names and retains valid ones", () => {
  const fields = ["id", "unknown_foo", "shape", "non_existent_column", "material"];
  const result = selectColumns("compact", fields, false);

  assertEquals(result, "id,shape,material");

  // When all provided fields are unknown, falls back to compact view
  const allUnknown = ["totally_bogus_col", "another_unknown"];
  const fallbackResult = selectColumns("compact", allUnknown, false);
  assertEquals(fallbackResult, COMPACT_COLUMNS.join(","));
});

Deno.test("selectColumns fields with a cost column for a non-finance caller (dropped)", () => {
  // Non-finance caller requesting a mix of regular and cost columns
  const fields = ["id", "price_mxn", "shape", "book_landed", "book_acquisition", "material"];
  const resultNonFinance = selectColumns("compact", fields, false);

  assertEquals(resultNonFinance, "id,shape,material");

  // If non-finance caller requests ONLY cost columns, all are dropped and falls back to compact
  const onlyCostFields = ["price_mxn", "book_landed", "book_acquisition", "book_aq_code"];
  const fallbackResult = selectColumns("compact", onlyCostFields, false);
  assertEquals(fallbackResult, COMPACT_COLUMNS.join(","));

  // Finance caller requesting cost columns retains them
  const resultFinance = selectColumns("compact", fields, true);
  assertEquals(resultFinance, "id,price_mxn,shape,book_landed,book_acquisition,material");
});

Deno.test("selectColumns finance caller gets price_mxn and book_retail but never book_landed", () => {
  const financeCompact = selectColumns("compact", undefined, true);
  const cols = financeCompact.split(",");

  // Assert price_mxn and book_retail are included
  assert(cols.includes("price_mxn"), "Finance caller compact view must include price_mxn");
  assert(cols.includes("book_retail"), "Finance caller compact view must include book_retail");

  // Assert landed cost, acquisition cost, and cypher codes are strictly NEVER included in compact view
  assert(!cols.includes("book_landed"), "Finance compact view must never include book_landed");
  assert(!cols.includes("book_acquisition"), "Finance compact view must never include book_acquisition");
  assert(!cols.includes("book_aq_code"), "Finance compact view must never include book_aq_code");
  assert(!cols.includes("book_land_code"), "Finance compact view must never include book_land_code");

  // Must match COMPACT_COLUMNS + price_mxn + book_retail
  const expected = [...COMPACT_COLUMNS, "price_mxn", "book_retail"].join(",");
  assertEquals(financeCompact, expected);
});

// ── capPayload Tests ─────────────────────────────────────────────────────────

Deno.test("capPayload under the cap returns items unchanged with truncated: false", () => {
  const items = [
    { id: "item-1", shape: "bowl", material: "onyx" },
    { id: "item-2", shape: "cylinder", material: "marble" },
  ];

  const result = capPayload(items, 1000);
  assertEquals(result.items, items);
  assertEquals(result.truncated, false);
});

Deno.test("capPayload over the cap drops items from the end until under maxChars", () => {
  const items = [
    { id: "1", desc: "x".repeat(100) },
    { id: "2", desc: "x".repeat(100) },
    { id: "3", desc: "x".repeat(100) },
    { id: "4", desc: "x".repeat(100) },
  ];

  // Each item is ~130 chars, total ~530 chars. Cap at 300 chars.
  const result = capPayload(items, 300);
  assertEquals(result.truncated, true);
  assert(result.items.length < items.length);
  assert(result.items.length > 0);
  assert(JSON.stringify(result.items).length <= 300);

  // Verifies dropping from the end (first items preserved)
  assertEquals(result.items[0].id, "1");
  assertEquals(result.items[1].id, "2");
});

Deno.test("capPayload an empty list returns empty array with truncated: false", () => {
  const result = capPayload([], 1000);
  assertEquals(result.items, []);
  assertEquals(result.truncated, false);
});

Deno.test("capPayload with payload object containing items respects overall payload limit", () => {
  const payload = {
    total_count: 5,
    offset: 0,
    limit: 20,
    has_more: false,
    items: [
      { id: "1", text: "a".repeat(100) },
      { id: "2", text: "b".repeat(100) },
      { id: "3", text: "c".repeat(100) },
    ],
  };

  // Under the cap
  const underRes = capPayload(payload, 2000);
  assertEquals(underRes.items.length, 3);
  assertEquals(underRes.truncated, false);

  // Over the cap
  const overRes = capPayload(payload, 250);
  assertEquals(overRes.truncated, true);
  assert(overRes.items.length < 3);
  const stringified = JSON.stringify({
    ...payload,
    items: overRes.items,
    truncated: true,
    has_more: true,
  });
  assert(stringified.length <= 250);
});
