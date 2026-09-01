/**
 * Spanish UI catalog. Keys are the exact English source strings as they appear
 * in the JSX — including capitalisation and trailing punctuation, because the
 * lookup is literal. `TOTAL` and `Total` are two different keys on purpose:
 * the UPPERCASE forms are visual design (tracking-widest chips and headers) and
 * the Spanish has to keep the same shape.
 *
 * A string with no entry here falls back to English, so this file is always
 * safe to extend and never a source of runtime errors.
 *
 * NOT in this file, by design:
 *   · Item data from the DB (description, material, colour, shape, vendor)
 *   · Exported documents, manifests, packing lists, labels, posters
 *   · Wire values compared with `===` or written to Supabase — see i18nEnums.ts
 *     for the display labels those get instead.
 *   · Codes and units that are the same in both languages: AQ, LD, SKU, dBm,
 *     MXN, USD, kg, cm. These are simply absent, so they fall through as-is.
 *
 * GLOSSARY — fixed renderings, applied consistently across all ~1,800 entries.
 * The domain vocabulary repeats constantly, so drift here is very visible:
 *
 *   acquisition   → adquisición        item / unit   → artículo / unidad
 *   crate         → caja               inventory     → inventario
 *   truck         → camión             warehouse     → almacén
 *   trailer       → tráiler            packing       → embalaje
 *   shipment      → embarque           manifest      → manifiesto
 *   vendor        → proveedor          draft         → borrador
 *   batch         → lote               label         → etiqueta
 *   payment       → pago               expense       → gasto
 *   supplies      → suministros        store         → tienda
 *   settings      → ajustes            weight        → peso
 *   dispersal     → dispersión         nesting       → anidado
 */

export const esCatalog: Record<string, string> = {
  // ── Shared chrome — strings that appear in more than one feature ──────────
  // Actions
  'Save': 'Guardar',
  'Save Draft': 'Guardar Borrador',
  'Save Position': 'Guardar Posición',
  'Cancel': 'Cancelar',
  'Close': 'Cerrar',
  'Clear': 'Limpiar',
  'Reset': 'Restablecer',
  'Remove': 'Quitar',
  'Removed': 'Quitado',
  'Add': 'Agregar',
  'Add Entry': 'Agregar Entrada',
  'Create': 'Crear',
  'Create New Crate': 'Crear Caja Nueva',
  'New': 'Nuevo',
  'Back': 'Atrás',
  'BACK': 'ATRÁS',
  'Abort': 'Abortar',
  'Dismiss': 'Descartar',
  'Download': 'Descargar',
  'Export': 'Exportar',
  'EXPORT': 'EXPORTAR',
  'Export List': 'Exportar Lista',
  'COPY': 'COPIAR',
  'Copy Trace Link': 'Copiar Enlace de Rastreo',
  'Trace Link Copied': 'Enlace de Rastreo Copiado',
  'Select': 'Seleccionar',
  'Select...': 'Seleccionar...',
  'View': 'Ver',
  'More': 'Más',
  'Preview': 'Vista Previa',
  'Print Labels': 'Imprimir Etiquetas',
  'PRINT': 'IMPRIMIR',
  'Show Labels': 'Mostrar Etiquetas',
  'Start Generation': 'Iniciar Generación',
  'DONE': 'LISTO',
  'WAIT': 'ESPERE',
  'Sync': 'Sincronizar',
  'SYNC REGISTRY': 'SINCRONIZAR REGISTRO',
  'Synchronization': 'Sincronización',
  'Syncing...': 'Sincronizando...',
  'Saving...': 'Guardando...',

  // Navigation / sections
  'Inventory': 'Inventario',
  'Logistics': 'Logística',
  'Control': 'Control',
  'Registry': 'Registro',
  'Settings': 'Ajustes',
  'Account': 'Cuenta',
  'Security': 'Seguridad',
  'Tutorial': 'Tutorial',
  'Details': 'Detalles',
  'Notes': 'Notas',
  'Results': 'Resultados',
  'Showing': 'Mostrando',
  'Media Gallery': 'Galería de Medios',
  'Crate Manager': 'Gestor de Cajas',
  'Nesting Wizard': 'Asistente de Anidado',
  'Documentation Engine': 'Motor de Documentación',
  'Documentation Offline': 'Documentación Sin Conexión',

  // Item / inventory vocabulary
  'Item': 'Artículo',
  'Items': 'Artículos',
  'ITEMS': 'ARTÍCULOS',
  'UNIT': 'UNIDAD',
  'Units': 'Unidades',
  'UNITS': 'UNIDADES',
  'Quantity': 'Cantidad',
  'Qty': 'Cant',
  'QTY': 'CANT',
  'Qty:': 'Cant:',
  'Type': 'Tipo',
  'TYPE': 'TIPO',
  'Shape': 'Forma',
  'SHAPE': 'FORMA',
  'Material': 'Material',
  'MATERIAL': 'MATERIAL',
  'Mat': 'Mat',
  'Color': 'Color',
  'COLOR': 'COLOR',
  'Description': 'Descripción',
  'DESCRIPTION': 'DESCRIPCIÓN',
  'Category': 'Categoría',
  'Status': 'Estado',
  'Date': 'Fecha',
  'Barcode': 'Código de Barras',
  'Masks': 'Máscaras',
  'Points': 'Puntos',
  'Num': 'Núm',
  'Vendor': 'Proveedor',
  'ALL VENDORS': 'TODOS LOS PROVEEDORES',
  'All': 'Todos',
  'Active': 'Activo',
  'Verified': 'Verificado',

  // Dimensions & weight
  'Dimensions': 'Dimensiones',
  'Dims': 'Dims',
  'Weight': 'Peso',
  'Net Weight': 'Peso Neto',
  'Base Wt (kg)': 'Peso Base (kg)',
  'Brute Weight (KG)': 'Peso Bruto (KG)',
  'Volume': 'Volumen',
  'Volumetric Fill': 'Llenado Volumétrico',
  'Utilization': 'Utilización',
  'W (cm)': 'An (cm)',
  'W (CM)': 'AN (CM)',
  'H (cm)': 'Al (cm)',
  'H (CM)': 'AL (CM)',
  'D (cm)': 'Pr (cm)',
  'D (CM)': 'PR (CM)',

  // Money
  'Price': 'Precio',
  'Price (MXN)': 'Precio (MXN)',
  'Price / Qty': 'Precio / Cant',
  'Unit Price': 'Precio Unitario',
  'Amount (MXN)': 'Monto (MXN)',
  'Cost': 'Costo',
  'Total': 'Total',
  'Total:': 'Total:',
  'Total MXN': 'Total MXN',
  'Balance': 'Saldo',
  'Retail': 'Menudeo',
  'Landed': 'Costo en Destino',
  'Taxes/Fees': 'Impuestos/Cargos',
  'Net Paid': 'Neto Pagado',
  'Paid': 'Pagado',
  'PAID': 'PAGADO',
  'Paid on': 'Pagado el',
  'Pending': 'Pendiente',
  'Requested': 'Solicitado',
  'Acquisition': 'Adquisición',
  'ACQ MXN': 'ADQ MXN',
  'Mark as Paid': 'Marcar como Pagado',
  'Marking as paid...': 'Marcando como pagado...',
  'Payment marked as paid.': 'Pago marcado como pagado.',
  'Upcoming Payments': 'Próximos Pagos',
  'Select Payment Destination': 'Seleccionar Destino de Pago',

  // Logistics
  'Warehouse': 'Almacén',
  'Warehouse Crates': 'Cajas en Almacén',
  'Crates in Truck': 'Cajas en Camión',
  'Load to Truck': 'Cargar al Camión',
  'Ship Truck': 'Enviar Camión',
  'Unload': 'Descargar',
  'Unloading item...': 'Descargando artículo...',
  'Rotate Crate': 'Rotar Caja',
  'Security Seal': 'Sello de Seguridad',
  'Sender Name': 'Nombre del Remitente',
  'Senders Information': 'Información del Remitente',
  'Tag ID': 'ID de Tag',
  'TAG ID': 'ID DE TAG',
  'Tag:': 'Tag:',
  'Position:': 'Posición:',
  'Contents:': 'Contenido:',
  'Initialize Storage Protocol': 'Inicializar Protocolo de Almacenamiento',
  'Protocol': 'Protocolo',
  'PROTOCOL': 'PROTOCOLO',
  'Protocol Status': 'Estado del Protocolo',
  'Nesting unit...': 'Anidando unidad...',
  'Unit successfully nested': 'Unidad anidada con éxito',
  'Unit nested (Demo Mode)': 'Unidad anidada (Modo Demo)',
  'Crate deleted (Demo Mode)': 'Caja eliminada (Modo Demo)',
  'Crate permanently deleted': 'Caja eliminada permanentemente',
  'Nesting packed boxes maintains their inventory and status within the parent unit':
    'Anidar cajas embaladas mantiene su inventario y estado dentro de la unidad principal',
  'No available space in truck.': 'No hay espacio disponible en el camión.',
  'X (Front/Back):': 'X (Frente/Atrás):',
  'Z (Left/Right):': 'Z (Izquierda/Derecha):',

  // Documents produced from the UI (the button label is chrome; the document
  // itself stays English — see i18n.ts)
  'Manifest': 'Manifiesto',
  'All Crates Manifesto': 'Manifiesto de Todas las Cajas',
  'Master Packing List': 'Lista Maestra de Embalaje',
  'Interactive HTML Manifest': 'Manifiesto HTML Interactivo',
  'Catalog Grid': 'Cuadrícula de Catálogo',
  'Multi-image rows': 'Filas de múltiples imágenes',
  'Per Image': 'Por Imagen',
  'Generating Manifesto PDF...': 'Generando PDF del Manifiesto...',
  'Manifesto PDF Downloaded': 'PDF del Manifiesto Descargado',
  'Failed to generate PDF': 'No se pudo generar el PDF',

  // Hardware / device
  'Battery': 'Batería',
  'Firmware': 'Firmware',
  'Channel': 'Canal',
  'Latency': 'Latencia',
  'Link Device': 'Vincular Dispositivo',
  'Push to LCD': 'Enviar a LCD',
  'Robot Speak': 'Voz del Robot',
  'Comm:': 'Com:',

  // Status & feedback
  'Awaiting Analysis': 'Esperando Análisis',
  'Queue Empty': 'Cola Vacía',
  'Item saved!': '¡Artículo guardado!',
  'Description saved!': '¡Descripción guardada!',
  'Description is required.': 'La descripción es obligatoria.',
  'Batch Acquisition Complete!': '¡Adquisición por Lote Completada!',
  'Restored your unsaved entry': 'Restauramos tu entrada sin guardar',
  'Removed from bag': 'Quitado de la bolsa',
  'Failed to update status': 'No se pudo actualizar el estado',
  'No Artifacts Found': 'No se Encontraron Artículos',
  'No media found for this item.': 'No se encontraron medios para este artículo.',
  'Error:': 'Error:',
  'ID:': 'ID:',
  'New Crate Name...': 'Nombre de la Caja Nueva...',
};
