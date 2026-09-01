/**
 * Display labels for enum values.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an enum's *value* is wire protocol —
 * it is compared with `===`, held as filter state, and written back to
 * Supabase. Its *label* is what a person reads. Only the label is translated,
 * and only at the point it is rendered.
 *
 *   ✅  <span>{el(crate.status)}</span>        label — translated
 *   ❌  crate.status === el('In Transit')      comparison — would break
 *   ❌  .update({ status: el(next) })          DB write — would corrupt data
 *
 * `WorkbookView` is the cautionary example: the string 'In Transit' appears
 * there five times in twenty lines — as a member of LOGISTICS_STATUSES, as
 * filter state, in a `d.status === 'In Transit'` comparison, in a Supabase
 * update, and as a visible chip. Only the last of those may be translated.
 *
 * Unknown values pass through unchanged, so a status added later renders as
 * its English value rather than blank.
 *
 * Deliberately absent — internal tokens a user never sees: UHF_RFID, TRK1-4,
 * REVIEW_PACK, SELECT_CRATE, TAG-ID, AQC, LC, LND, voiceEntry, itemType,
 * fullscreenView, NULL, UNDEFINED, and operator names (JUAN, SIMONA).
 */

import { getI18nLang } from './i18nLang';

export const ENUM_LABELS: Record<string, string> = {
  // ── Inventory / logistics status ─────────────────────────────────────────
  'Available': 'Disponible',
  'Acquired': 'Adquirido',
  'ACQUIRED': 'ADQUIRIDO',
  'Requested': 'Solicitado',
  'Packed': 'Empacado',
  'Not Packed': 'Sin Empacar',
  'Packing': 'Embalaje',
  'Shipped': 'Enviado',
  'SHIPPED': 'ENVIADO',
  'T SHIPPED': 'T ENVIADO',
  'Not Shipped': 'Sin Enviar',
  'In Transit': 'En Tránsito',
  'Delivered': 'Entregado',
  'Deployed': 'Desplegado',
  'Warehouse': 'Almacén',
  'WAREHOUSE': 'ALMACÉN',
  'Empty': 'Vacío',
  'Partial': 'Parcial',
  'Archive': 'Archivo',
  'Catalog': 'Catálogo',
  'Pending Deletion': 'Pendiente de Eliminación',
  'Production': 'Producción',
  'PRODUCTION': 'PRODUCCIÓN',
  'Processing': 'Procesando',
  'New': 'Nuevo',
  'Active': 'Activo',

  // ── Payments ─────────────────────────────────────────────────────────────
  'Paid': 'Pagado',
  'Acquisition': 'Adquisición',
  'ACQUISITION': 'ADQUISICIÓN',
  'Expense': 'Gasto',
  'EXPENSE': 'GASTO',
  'Monthly': 'Mensual',
  'MONTHLY': 'MENSUAL',
  'Supplies': 'Suministros',
  'SUPPLIES': 'SUMINISTROS',
  'Labor': 'Mano de Obra',
  'vendor payment': 'pago a proveedor',

  // Abbreviated subcategory codes — these are the SUBCATEGORIES filter
  // vocabulary, shown as chips. Kept short so the chips stay the same width.
  'Acq': 'Adq',
  'Prod': 'Prod',
  'Sppl': 'Sumin',
  'Labr': 'Obra',
  'Oprt': 'Oper',

  // ── Containers ───────────────────────────────────────────────────────────
  'Crate': 'Caja',
  'Crates': 'Cajas',
  'CRATES': 'CAJAS',

  // ── Roles ────────────────────────────────────────────────────────────────
  'Admin': 'Administrador',
  'Client': 'Cliente',
  'Vendor': 'Proveedor',
  'VENDOR': 'PROVEEDOR',
  'Developer': 'Desarrollador',
  'ClientBoss': 'Cliente (Dirección)',
  'ClientAccounting': 'Cliente (Contabilidad)',
  'ClientViewer': 'Cliente (Consulta)',

  // ── Store categories ─────────────────────────────────────────────────────
  'New Arrivals': 'Novedades',
  'Fountains': 'Fuentes',

  // ── OnyxChan face expressions ────────────────────────────────────────────
  // The <select> in PicoRoleHardwareCard was given explicit English `value`
  // attributes so its onChange comparisons and the hardware protocol keep
  // seeing English while these labels are shown.
  'Neutral': 'Neutral',
  'Happy': 'Feliz',
  'Angry': 'Enojado',
  'Sad': 'Triste',
  'Sleepy': 'Somnoliento',
  'Doubt': 'Duda',

  // ── Connection / capacity state ──────────────────────────────────────────
  'ONLINE': 'EN LÍNEA',
  'OPTIMAL': 'ÓPTIMO',
  'Credentials': 'Credenciales',
  'ALL': 'TODOS',
  'All': 'Todos',

  // Load-severity colours double as status words in the trucking view.
  'GREEN': 'VERDE',
  'YELLOW': 'AMARILLO',
  'RED': 'ROJO',
  'BLUE': 'AZUL',

  // ── Column headers in the workbook item viewer ───────────────────────────
  'Date': 'Fecha',
  'Status': 'Estado',
  'Number': 'Número',
  'Value': 'Valor',
  'Qty': 'Cant',
  'QTY': 'CANT',
  'TOTAL': 'TOTAL',
  'TOTAL PESOS': 'TOTAL PESOS',
  'TOTAL USD': 'TOTAL USD',
  'AQ ROUND': 'ADQ REDONDEADO',
  'LND ROUND': 'DESTINO REDONDEADO',
  'Per piece MXN$': 'Por pieza MXN$',
  'Description Color - Object Type': 'Descripción Color - Tipo de Objeto',
  'BARCODE': 'CÓDIGO DE BARRAS',
  'DELETE': 'ELIMINAR',
};

/**
 * Label for an enum value. Safe to call with anything — unknown values,
 * `null` and `undefined` come back untouched.
 *
 * Named `el` (enum label) to keep call sites short enough to sit inline in
 * JSX without reflowing the markup around them.
 */
export function el<T>(value: T): T | string {
  if (getI18nLang() === 'en') return value;
  if (typeof value !== 'string') return value;
  return ENUM_LABELS[value] ?? value;
}

/** True when a value has a Spanish label — useful for tests and audits. */
export function hasEnumLabel(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENUM_LABELS, value);
}
