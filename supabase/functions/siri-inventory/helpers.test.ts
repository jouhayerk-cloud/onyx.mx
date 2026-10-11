// =============================================================================
// Unit Tests for Siri Inventory Helpers & Pure Security Logic
// =============================================================================
// Run via: deno test supabase/functions/siri-inventory/helpers.test.ts
// Date: 2026-10-10
// =============================================================================

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  FINANCE_ROLES,
  INTERNAL_STAFF,
  COST_COLUMNS,
} from "../_shared/onyxDataTools.ts";
import {
  SIRI_FINANCE_ROLES,
  stripMoneyFields,
  isFinancialQuery,
  extractImageUrl,
  parseRequestPayload,
  isValidIntent,
  parseVendorQuery,
  buildFinancialRefusalResponse,
  buildItemFields,
  buildItemResponse,
  buildGeneralCountResponse,
  buildFilteredCountResponse,
  buildSearchResponse,
  buildVendorCountSpokenText,
  buildVendorCountResponse,
  buildVendorNotFoundSpokenText,
  buildVendorNotFoundResponse,
} from "./helpers.ts";

// ── Test 1: stripMoneyFields removes every key in COST_COLUMNS ────────────────
Deno.test("stripMoneyFields removes every key in COST_COLUMNS at root level", () => {
  const input = {
    id: "uuid-123",
    item_id: "EM-0042",
    material: "onyx",
    shape: "cylinder",
    price_mxn: 1500,
    book_acquisition: 1200,
    book_landed: 1350,
    book_aq_code: "AQ-XYZ",
    book_land_code: "LD-XYZ",
  };
  const result = stripMoneyFields(input);
  for (const col of COST_COLUMNS) {
    assertEquals((result as Record<string, unknown>)[col], undefined);
  }
  assertEquals(result.id, "uuid-123");
  assertEquals(result.item_id, "EM-0042");
  assertEquals(result.material, "onyx");
  assertEquals(result.shape, "cylinder");
});

// ── Test 2: stripMoneyFields deep stripping with pattern matching ─────────────
Deno.test("stripMoneyFields removes pattern-matched money fields at arbitrary nesting depths", () => {
  const input = {
    id: "item-1",
    financials: {
      retail_usd: 250,
      estimated_cost: 100,
      margin_rate: 0.25,
      valuation_amount: 1000,
      nested: {
        item_price: 300,
        acquisition_date: "2026-01-01",
        safe_key: "hello",
      },
    },
    tag: "tag-1",
  };
  const result = stripMoneyFields(input);
  assertEquals(result.id, "item-1");
  assertEquals(result.tag, "tag-1");
  assertEquals((result.financials.nested as Record<string, unknown>).safe_key, "hello");
  assertEquals((result.financials as Record<string, unknown>).retail_usd, undefined);
  assertEquals((result.financials as Record<string, unknown>).estimated_cost, undefined);
  assertEquals((result.financials as Record<string, unknown>).margin_rate, undefined);
  assertEquals((result.financials as Record<string, unknown>).valuation_amount, undefined);
  assertEquals((result.financials.nested as Record<string, unknown>).item_price, undefined);
  assertEquals((result.financials.nested as Record<string, unknown>).acquisition_date, undefined);
});

// ── Test 3: stripMoneyFields with arrays and array of objects ──────────────────
Deno.test("stripMoneyFields recursively strips arrays and nested objects within arrays", () => {
  const input = [
    { item_id: "A", price_mxn: 100, valid: true },
    { item_id: "B", book_retail: 200, nested: [{ cost_val: 50, label: "raw" }] },
  ];
  const result = stripMoneyFields(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].item_id, "A");
  assertEquals(result[0].valid, true);
  assertEquals((result[0] as Record<string, unknown>).price_mxn, undefined);
  assertEquals(result[1].item_id, "B");
  assertEquals((result[1] as Record<string, unknown>).book_retail, undefined);
  const nested = (result[1] as { nested: Array<Record<string, unknown>> }).nested;
  assertEquals(nested[0]?.label, "raw");
  assertEquals(nested[0]?.cost_val, undefined);
});

// ── Test 4: stripMoneyFields primitives and edge cases ────────────────────────
Deno.test("stripMoneyFields handles primitives, null, and undefined safely", () => {
  assertEquals(stripMoneyFields(null), null);
  assertEquals(stripMoneyFields(undefined), undefined);
  assertEquals(stripMoneyFields("text"), "text");
  assertEquals(stripMoneyFields(42), 42);
  assertEquals(stripMoneyFields(true), true);
});

// ── Test 5: isFinancialQuery English patterns ─────────────────────────────────
Deno.test("isFinancialQuery returns true for English financial queries", () => {
  const englishQueries = [
    "price",
    "pricing",
    "cost",
    "costs",
    "how much is EM-0042",
    "total value of inventory",
    "what is the retail price",
    "landed cost for batch",
    "acquisition cost",
    "margin calculation",
  ];
  for (const q of englishQueries) {
    assert(isFinancialQuery(q), `Expected "${q}" to be detected as financial query`);
  }
});

// ── Test 6: isFinancialQuery Spanish patterns ─────────────────────────────────
Deno.test("isFinancialQuery returns true for Spanish financial queries", () => {
  const spanishQueries = [
    "precio",
    "precios",
    "costo",
    "costos",
    "cuanto cuesta la pieza",
    "cuánto cuesta esto",
    "cuanto vale el lote",
    "cuánto vale",
    "valor total del almacen",
  ];
  for (const q of spanishQueries) {
    assert(isFinancialQuery(q), `Expected "${q}" to be detected as financial query`);
  }
});

// ── Test 7: isFinancialQuery non-financial questions ──────────────────────────
Deno.test("isFinancialQuery returns false for plain inventory questions", () => {
  const nonFinancialQueries = [
    "where is EM-0042",
    "show me marble basins",
    "fluorite status",
    "dimensions of SU-100",
    "items in crate CRATE-001",
    "how many pieces are in stock",
    "buscar cuarzo",
    "medidas de la pieza",
    "artículos de Ramses",
  ];
  for (const q of nonFinancialQueries) {
    assert(!isFinancialQuery(q), `Expected "${q}" NOT to be detected as financial query`);
  }
});

// ── Test 8: FINANCE_ROLES definition and exclusions ───────────────────────────
Deno.test("FINANCE_ROLES contains expected roles and excludes non-finance roles", () => {
  assertEquals(FINANCE_ROLES, ["Developer", "Admin", "ClientBoss", "ClientAccounting"]);
  assertEquals(SIRI_FINANCE_ROLES, FINANCE_ROLES);

  assert(FINANCE_ROLES.includes("Developer"));
  assert(FINANCE_ROLES.includes("Admin"));
  assert(FINANCE_ROLES.includes("ClientBoss"));
  assert(FINANCE_ROLES.includes("ClientAccounting"));

  assert(!FINANCE_ROLES.includes("ClientViewer"));
  assert(!FINANCE_ROLES.includes("Vendor"));
  assert(!FINANCE_ROLES.includes("Client"));
});

// ── Test 9: Section 6 Test Case 1: Vendor Cost Redaction ──────────────────────
Deno.test("Section 6 Test Case 1: inventory_get_item cost redaction for Vendor role", () => {
  const rawItem = {
    id: "00000000-0000-0000-0000-000000000042",
    item_id: "EM-0042",
    vendor_id: "EM",
    material: "onyx",
    shape: "cylinder",
    dimensions: "10x10x20 cm",
    weight_kg: 5.2,
    status: "Inventory",
    price_mxn: 1850,
    book_acquisition: 1200,
    book_landed: 1450,
    book_aq_code: "AQ-826-01",
    book_land_code: "LD-826-01",
  };

  const isFinance = FINANCE_ROLES.includes("Vendor");
  assertEquals(isFinance, false);

  const sanitized = stripMoneyFields(rawItem);

  assertEquals(sanitized.id, "00000000-0000-0000-0000-000000000042");
  assertEquals(sanitized.item_id, "EM-0042");
  assertEquals(sanitized.vendor_id, "EM");
  assertEquals(sanitized.material, "onyx");
  assertEquals(sanitized.shape, "cylinder");
  assertEquals(sanitized.dimensions, "10x10x20 cm");
  assertEquals(sanitized.weight_kg, 5.2);

  assertEquals((sanitized as Record<string, unknown>).price_mxn, undefined);
  assertEquals((sanitized as Record<string, unknown>).book_acquisition, undefined);
  assertEquals((sanitized as Record<string, unknown>).book_landed, undefined);
  assertEquals((sanitized as Record<string, unknown>).book_aq_code, undefined);
  assertEquals((sanitized as Record<string, unknown>).book_land_code, undefined);
});

// ── Test 10: Section 6 Test Case 2: Developer Full Pricing ────────────────────
Deno.test("Section 6 Test Case 2: inventory_get_item full pricing for Developer role", () => {
  const rawItem = {
    id: "00000000-0000-0000-0000-000000000042",
    item_id: "EM-0042",
    vendor_id: "EM",
    material: "onyx",
    shape: "cylinder",
    dimensions: "10x10x20 cm",
    weight_kg: 5.2,
    status: "Inventory",
    price_mxn: 1850,
    book_acquisition: 1200,
    book_landed: 1450,
    book_aq_code: "AQ-826-01",
    book_land_code: "LD-826-01",
    book_retail: 310,
  };

  const isFinance = FINANCE_ROLES.includes("Developer");
  assertEquals(isFinance, true);

  const fields = buildItemFields(rawItem, isFinance);
  const priceField = fields.find((f) => f.label === "Price MXN");
  const retailField = fields.find((f) => f.label === "Retail USD");

  assert(priceField !== undefined);
  assertEquals(priceField?.value, "$1850 MXN");
  assert(retailField !== undefined);
  assertEquals(retailField?.value, "$310 USD");
  assertEquals(rawItem.price_mxn, 1850);
  assertEquals(rawItem.book_acquisition, 1200);
  assertEquals(rawItem.book_landed, 1450);
  assertEquals(rawItem.book_aq_code, "AQ-826-01");
  assertEquals(rawItem.book_land_code, "LD-826-01");
});

// ── Test 11: Section 6 Test Case 3: Client Role Authorization Failure ─────────
Deno.test("Section 6 Test Case 3: inventory_list_by_crate role authorization fails for Client", () => {
  const callerRole = "Client";
  const isAuthorized = INTERNAL_STAFF.includes(callerRole);
  assertEquals(isAuthorized, false);

  assert(INTERNAL_STAFF.includes("Developer"));
  assert(INTERNAL_STAFF.includes("Admin"));
  assert(INTERNAL_STAFF.includes("ClientBoss"));
  assert(INTERNAL_STAFF.includes("ClientAccounting"));
  assert(INTERNAL_STAFF.includes("ClientViewer"));
  assert(!INTERNAL_STAFF.includes("Client"));
  assert(!INTERNAL_STAFF.includes("Vendor"));
});

// ── Test 12: Section 6 Test Case 4: ClientViewer Search Redaction ──────────────
Deno.test("Section 6 Test Case 4: inventory_search scoping and redaction for ClientViewer role", () => {
  const isFinance = FINANCE_ROLES.includes("ClientViewer");
  assertEquals(isFinance, false);

  const rawSearchResults = [
    {
      item_id: "FL-001",
      material: "fluorite",
      status: "Inventory",
      price_mxn: 800,
      book_acquisition: 500,
      book_landed: 600,
      book_aq_code: "AQ-1",
      book_land_code: "LD-1",
    },
    {
      item_id: "FL-002",
      material: "fluorite",
      status: "Inventory",
      price_mxn: 1200,
      book_acquisition: 750,
      book_landed: 900,
      book_aq_code: "AQ-2",
      book_land_code: "LD-2",
    },
  ];

  const sanitized = stripMoneyFields(rawSearchResults);
  assertEquals(sanitized.length, 2);

  for (const item of sanitized) {
    assertEquals(item.material, "fluorite");
    assertEquals(item.status, "Inventory");
    for (const col of COST_COLUMNS) {
      assertEquals((item as Record<string, unknown>)[col], undefined);
    }
  }
});

// ── Test 13: Section 6 Test Case 5: Siri Refusal for Non-Finance Caller ────────
Deno.test("Section 6 Test Case 5: Siri refuses pricing for ClientViewer but allows for ClientBoss and ClientAccounting", () => {
  const input = { intent: "item", query: "EM-0042 price", lang: "en" };
  const parsed = parseRequestPayload(input);
  assertEquals(parsed.intent, "item");
  assertEquals(parsed.query, "EM-0042 price");

  const isViewerFinance = FINANCE_ROLES.includes("ClientViewer");
  assertEquals(isViewerFinance, false);
  const isMoneyQ = isFinancialQuery(parsed.query);
  assertEquals(isMoneyQ, true);

  const refusal = buildFinancialRefusalResponse(parsed.isEs);
  assertEquals(refusal.ok, true);
  assertEquals(refusal.spoken_text, "Prices and financial data are only available to Onyx finance roles.");
  assertEquals(refusal.title, "Restricted");
  assertEquals(refusal.fields.length, 0);
  assert(!refusal.spoken_text.includes("$"));
  assert(!refusal.spoken_text.includes("MXN"));
  assert(!refusal.spoken_text.includes("USD"));

  const refusalEs = buildFinancialRefusalResponse(true);
  assertEquals(refusalEs.ok, true);
  assertEquals(refusalEs.spoken_text, "Los precios y datos financieros solo están disponibles para los roles de finanzas de Onyx.");
  assertEquals(refusalEs.title, "Restringido");
  assertEquals(refusalEs.fields.length, 0);

  assertEquals(FINANCE_ROLES.includes("ClientBoss"), true);
  assertEquals(FINANCE_ROLES.includes("ClientAccounting"), true);
  assertEquals(FINANCE_ROLES.includes("Admin"), true);
  assertEquals(FINANCE_ROLES.includes("Developer"), true);
});

// ── Test 14: parseRequestPayload parsing & sanitization ───────────────────────
Deno.test("parseRequestPayload normalizes intent, query, and language defaults", () => {
  const req1 = parseRequestPayload({ intent: "  ITEM  ", query: "  EM-0042 ", lang: "es" });
  assertEquals(req1.intent, "item");
  assertEquals(req1.query, "EM-0042");
  assertEquals(req1.lang, "es");
  assertEquals(req1.isEs, true);

  const req2 = parseRequestPayload({ intent: "SEARCH", query: "onyx" });
  assertEquals(req2.intent, "search");
  assertEquals(req2.query, "onyx");
  assertEquals(req2.lang, "en");
  assertEquals(req2.isEs, false);

  const req3 = parseRequestPayload(null);
  assertEquals(req3.intent, "");
  assertEquals(req3.query, "");
  assertEquals(req3.lang, "en");
  assertEquals(req3.isEs, false);
});

// ── Test 15: isValidIntent validation ─────────────────────────────────────────
Deno.test("isValidIntent validates allowed intents", () => {
  assert(isValidIntent("item"));
  assert(isValidIntent("count"));
  assert(isValidIntent("search"));
  assert(isValidIntent("vendor"));
  assert(!isValidIntent("delete"));
  assert(!isValidIntent("pricing"));
  assert(!isValidIntent("crate"));
  assert(!isValidIntent(""));
});

// ── Test 16: extractImageUrl priority order ───────────────────────────────────
Deno.test("extractImageUrl extracts first valid http image URL across formats", () => {
  const it1 = {
    generated_png_url: "https://example.com/cutout.png",
    image_urls: ["https://example.com/raw.jpg"],
  };
  assertEquals(extractImageUrl(it1), "https://example.com/cutout.png");

  const it2 = {
    image_urls: ["https://example.com/first.jpg", "https://example.com/second.jpg"],
  };
  assertEquals(extractImageUrl(it2), "https://example.com/first.jpg");

  const it3 = {
    processed_media_urls: JSON.stringify({
      hero: "https://example.com/hero.jpg",
      _thumb: "https://example.com/thumb.jpg",
    }),
  };
  assertEquals(extractImageUrl(it3), "https://example.com/hero.jpg");

  const it4 = {
    media_urls: "https://example.com/m1.jpg, https://example.com/m2.jpg",
  };
  assertEquals(extractImageUrl(it4), "https://example.com/m1.jpg");

  assertEquals(extractImageUrl({}), null);
});

// ── Test 17: buildItemResponse formatting ─────────────────────────────────────
Deno.test("buildItemResponse formats response with and without financial privileges in EN and ES", () => {
  const item = {
    item_id: "EM-0042",
    status: "Inventory",
    dimensions: "10x10x20 cm",
    material: "onyx",
    price_mxn: 1500,
    book_retail: 250,
  };

  const resFinance = buildItemResponse(item, "EM-0042", true, false);
  assertEquals(resFinance.ok, true);
  assertEquals(resFinance.title, "EM-0042");
  assertEquals(resFinance.spoken_text, "EM-0042: Inventory. Dimensions: 10x10x20 cm. Material: onyx.");
  const priceField = resFinance.fields.find((f) => f.label === "Price MXN");
  const retailField = resFinance.fields.find((f) => f.label === "Retail USD");
  assert(priceField !== undefined);
  assert(retailField !== undefined);

  const resViewer = buildItemResponse(item, "EM-0042", false, true);
  assertEquals(resViewer.ok, true);
  assertEquals(resViewer.spoken_text, "EM-0042: Inventory. Medidas: 10x10x20 cm. Material: onyx.");
  const viewerPrice = resViewer.fields.find((f) => f.label === "Price MXN");
  const viewerRetail = resViewer.fields.find((f) => f.label === "Retail USD");
  assertEquals(viewerPrice, undefined);
  assertEquals(viewerRetail, undefined);
});

// ── Test 18: buildSearchResponse formatting ───────────────────────────────────
Deno.test("buildSearchResponse handles empty results, small batches, and truncated batches", () => {
  const emptyRes = buildSearchResponse("pyrite", 0, [], false, false);
  assertEquals(emptyRes.ok, true);
  assertEquals(emptyRes.spoken_text, 'No items found matching "pyrite".');
  assertEquals(emptyRes.truncated, false);

  const twoItems = [
    { item_id: "EM-01", short_description: "Small bowl", status: "Inventory" },
    { item_id: "EM-02", short_description: "Tall vase", status: "Sold" },
  ];
  const smallRes = buildSearchResponse("bowl", 2, twoItems, false, true);
  assertEquals(smallRes.ok, true);
  assertEquals(smallRes.spoken_text, "Se encontraron 2 artículos: EM-01, EM-02.");
  assertEquals(smallRes.truncated, false);
  assertEquals(smallRes.fields.length, 2);

  const manyItems = Array.from({ length: 6 }, (_, i) => ({
    item_id: `EM-${i + 1}`,
    short_description: `Item ${i + 1}`,
    status: "Inventory",
  }));
  const truncRes = buildSearchResponse("onyx", 12, manyItems, false, false);
  assertEquals(truncRes.ok, true);
  assertEquals(truncRes.truncated, true);
  assertEquals(truncRes.fields.length, 5);
  assert(truncRes.spoken_text.includes("Showing 5: EM-1, EM-2, EM-3, EM-4, EM-5"));
  assert(truncRes.spoken_text.includes("7 more items exist"));
});

// ── Test 19: Count responses ──────────────────────────────────────────────────
Deno.test("buildGeneralCountResponse and buildFilteredCountResponse format inventory counts accurately", () => {
  const byStatus = {
    Inventory: { items: 40, quantity: 120 },
    Sold: { items: 10, quantity: 15 },
  };
  const countEn = buildGeneralCountResponse(byStatus, 50, 135, false);
  assertEquals(countEn.ok, true);
  assertEquals(countEn.spoken_text, "Total inventory: 50 items across 135 units.");
  assertEquals(countEn.fields.length, 2);

  const countEs = buildGeneralCountResponse(byStatus, 50, 135, true);
  assertEquals(countEs.ok, true);
  assertEquals(countEs.spoken_text, "Total en inventario: 50 artículos en 135 unidades.");

  const filtered = buildFilteredCountResponse("travertine", 8, [], false, false);
  assertEquals(filtered.ok, true);
  assertEquals(filtered.spoken_text, 'Found 8 items for "travertine".');
});

// ── Test 20: parseVendorQuery English phrases ─────────────────────────────────
Deno.test("parseVendorQuery extracts vendor code from English spoken phrases", () => {
  const cases: Array<[string, string]> = [
    ["how many pieces from vendor EM", "EM"],
    ["how many pieces from vendor SU?", "SU"],
    ["vendor em", "EM"],
    ["vendor: rf", "RF"],
    ["how many pieces does vendor ML have", "ML"],
    ["how many pieces for vendor GE", "GE"],
    ["vendor: AM.", "AM"],
    ["how many pieces from vendor TE?", "TE"],
    ["vendor jm", "JM"],
    ["pieces from vendor EM", "EM"],
  ];
  for (const [phrase, expected] of cases) {
    assertEquals(
      parseVendorQuery(phrase),
      expected,
      `Expected "${phrase}" to parse to "${expected}"`
    );
  }
});

// ── Test 21: parseVendorQuery Spanish phrases ─────────────────────────────────
Deno.test("parseVendorQuery extracts vendor code from Spanish spoken phrases", () => {
  const cases: Array<[string, string]> = [
    ["cuantas piezas del proveedor JM", "JM"],
    ["cuántas piezas del proveedor JM", "JM"],
    ["proveedor TE", "TE"],
    ["¿cuántas piezas del proveedor JM?", "JM"],
    ["proveedor: te", "TE"],
    ["cuantas piezas tiene el proveedor SU?", "SU"],
    ["del proveedor RF", "RF"],
    ["proveedor ml.", "ML"],
    ["cuántas piezas del proveedor GE", "GE"],
    ["piezas del proveedor am", "AM"],
  ];
  for (const [phrase, expected] of cases) {
    assertEquals(
      parseVendorQuery(phrase),
      expected,
      `Expected "${phrase}" to parse to "${expected}"`
    );
  }
});

// ── Test 22: parseVendorQuery direct codes, punctuation, whitespace, invalid ───
Deno.test("parseVendorQuery handles direct codes, punctuation, whitespace, and invalid inputs", () => {
  assertEquals(parseVendorQuery("EM"), "EM");
  assertEquals(parseVendorQuery("em"), "EM");
  assertEquals(parseVendorQuery("  JM  "), "JM");
  assertEquals(parseVendorQuery("TE."), "TE");
  assertEquals(parseVendorQuery("¿su?"), "SU");
  assertEquals(parseVendorQuery(""), "");
  assertEquals(parseVendorQuery("how many pieces in total"), "");
  assertEquals(parseVendorQuery("cuantas piezas hay"), "");
  assertEquals(parseVendorQuery("unknown text with no vendor code"), "");
});

// ── Test 23: buildVendorCountSpokenText singular & plural (EN & ES) ───────────
Deno.test("buildVendorCountSpokenText formats singular and plural in EN and ES", () => {
  // English
  assertEquals(buildVendorCountSpokenText("EM", 163, false), "Vendor EM has 163 pieces.");
  assertEquals(buildVendorCountSpokenText("EM", 1, false), "Vendor EM has 1 piece.");

  // Spanish
  assertEquals(buildVendorCountSpokenText("EM", 163, true), "El proveedor EM tiene 163 piezas.");
  assertEquals(buildVendorCountSpokenText("EM", 1, true), "El proveedor EM tiene 1 pieza.");
});

// ── Test 24: buildVendorNotFoundSpokenText & buildVendorNotFoundResponse ──────
Deno.test("buildVendorNotFoundSpokenText and buildVendorNotFoundResponse format not-found states", () => {
  assertEquals(buildVendorNotFoundSpokenText("EM", false), "Vendor EM was not found.");
  assertEquals(buildVendorNotFoundSpokenText("EM", true), "No se encontró el proveedor EM.");

  const resEn = buildVendorNotFoundResponse("EM", false);
  assertEquals(resEn.ok, false);
  assertEquals(resEn.title, "Vendor Not Found");
  assertEquals(resEn.spoken_text, "Vendor EM was not found.");
  assertEquals(resEn.fields.length, 0);

  const resEs = buildVendorNotFoundResponse("EM", true);
  assertEquals(resEs.ok, false);
  assertEquals(resEs.title, "Proveedor no encontrado");
  assertEquals(resEs.spoken_text, "No se encontró el proveedor EM.");
  assertEquals(resEs.fields.length, 0);
});

// ── Test 25: buildVendorCountResponse payload structure ───────────────────────
Deno.test("buildVendorCountResponse builds complete SiriResponse in EN and ES", () => {
  const resEn = buildVendorCountResponse("EM", 163, false, 45);
  assertEquals(resEn.ok, true);
  assertEquals(resEn.title, "Vendor: EM");
  assertEquals(resEn.spoken_text, "Vendor EM has 163 pieces.");
  assertEquals(resEn.fields.length, 3);
  assertEquals(resEn.fields[0], { label: "Vendor", value: "EM" });
  assertEquals(resEn.fields[1], { label: "Pieces", value: "163" });
  assertEquals(resEn.fields[2], { label: "Items", value: "45" });
  assertEquals(resEn.image_url, null);
  assertEquals(resEn.truncated, false);

  const resEs = buildVendorCountResponse("JM", 1, true, 1);
  assertEquals(resEs.ok, true);
  assertEquals(resEs.title, "Proveedor: JM");
  assertEquals(resEs.spoken_text, "El proveedor JM tiene 1 pieza.");
  assertEquals(resEs.fields.length, 3);
  assertEquals(resEs.fields[0], { label: "Vendor", value: "JM" });
  assertEquals(resEs.fields[1], { label: "Piezas", value: "1" });
  assertEquals(resEs.fields[2], { label: "Artículos", value: "1" });
});
