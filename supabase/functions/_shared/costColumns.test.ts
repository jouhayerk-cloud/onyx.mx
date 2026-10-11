import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { COST_COLUMNS } from "./onyxDataTools.ts";

// Every money column of the inventory table must be redacted for roles outside FINANCE_ROLES.
// book_retail was missing until 2026-10-10 and leaked through inventory_search.
const INVENTORY_MONEY_COLUMNS = ["price_mxn", "book_acquisition", "book_landed", "book_retail", "book_aq_code", "book_land_code"];

Deno.test("COST_COLUMNS covers every inventory money column", () => {
    for (const col of INVENTORY_MONEY_COLUMNS) {
        assert(COST_COLUMNS.includes(col), `COST_COLUMNS is missing ${col}`);
    }
});
