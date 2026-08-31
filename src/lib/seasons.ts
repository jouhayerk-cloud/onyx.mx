/**
 * Season resolution shared by the Inventory and Finance modules.
 *
 * The app syncs two generations of tables at once:
 *   - the 826 season  → inventory_826 / finance_826 / logistics_826
 *   - legacy seasons  → inventory / finance / logistics  (workbook v326, v825)
 *
 * The *_826 tables have no workbook column and the finance tables have no season
 * column at all, so every row is stamped with its season at sync time based on the
 * table it came from (see getSeasonSources in database.ts).
 */

export type Season = '826' | 'legacy';

/** Workbook values belonging to the archived seasons. */
const LEGACY_WORKBOOKS = new Set(['v325', 'v326', 'v825', '325', '326', '825']);

/** Normalises a raw workbook value ("v326", "326", "V326") to a Season. */
export const seasonFromWorkbook = (workbook: unknown): Season | null => {
    if (workbook == null) return null;
    const wb = String(workbook).trim().toLowerCase();
    if (!wb) return null;
    if (wb === 'v826' || wb === '826') return '826';
    return LEGACY_WORKBOOKS.has(wb) ? 'legacy' : null;
};

/**
 * Season of a synced row. The row's own workbook wins when it is conclusive — a
 * v826 row sitting in the legacy table is still 826 — otherwise we fall back to
 * the season of the table it was pulled from.
 */
export const resolveSeason = (row: any, sourceSeason: Season): Season =>
    seasonFromWorkbook(row?.workbook) ?? sourceSeason;

/**
 * Season of a row already in the local database. Rows written before the season
 * stamp existed are inferred from their workbook, defaulting to legacy.
 */
export const rowSeason = (row: any): Season => {
    const stamped = row?.season;
    if (stamped === '826' || stamped === 'legacy') return stamped;
    return seasonFromWorkbook(row?.workbook) ?? 'legacy';
};

/** True when a row belongs to an archived season (825/326). */
export const isLegacyRow = (row: any): boolean => rowSeason(row) === 'legacy';

/* ── Per-workbook visibility ──────────────────────────────────────────────
   The single "hide archive" boolean collapsed three seasons into two states:
   826-only, or everything. These let each workbook be toggled on its own, so
   825 can be reviewed without dragging 326 along with it. */

export type WorkbookId = 'v825' | 'v326' | 'v826';

export const WORKBOOK_IDS: WorkbookId[] = ['v825', 'v326', 'v826'];

/**
 * Which workbook a synced row belongs to. The row's own workbook value wins
 * when it is conclusive; otherwise the season stamp decides, exactly as
 * rowSeason does. 325 folds into 326 — it is the same archived season under an
 * older label and has never been shown separately.
 */
export const rowWorkbook = (row: any): WorkbookId => {
    const wb = String(row?.workbook ?? '').trim().toLowerCase().replace(/^v/, '');
    if (wb === '826') return 'v826';
    if (wb === '825') return 'v825';
    if (wb === '326' || wb === '325') return 'v326';
    return rowSeason(row) === '826' ? 'v826' : 'v326';
};
