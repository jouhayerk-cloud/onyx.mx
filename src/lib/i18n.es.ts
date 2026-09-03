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
  // Main top bar. 'Acciones' rather than 'Seleccionar': the key opens the
  // mode where rows are chosen and then acted on, and the Spanish noun
  // carries that better than the verb does.
  'Actions': 'Acciones',
  'Select items to act on': 'Selecciona artículos para trabajar',

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

  // ── Core shell: header, sidebar, tool bar, settings ───────────────────────
  'Welcome': 'Bienvenido',
  'Onyx.mx Menu': 'Menú de Onyx.mx',
  'Onyx.mx Studio': 'Estudio de Onyx.mx',
  'Navigation': 'Navegación',
  'Tools': 'Herramientas',
  'Filter': 'Filtro',
  'Search': 'Buscar',
  'Tags': 'Etiquetas',
  'TAGS': 'ETIQUETAS',
  'Types': 'Tipos',
  'Colors': 'Colores',
  'Library': 'Biblioteca',
  'Drafts': 'Borradores',
  'Devices': 'Dispositivos',
  'Analytics': 'Analítica',
  'Finances': 'Finanzas',
  'Trucking': 'Transporte',
  'Viewer': 'Visor',
  'Labs': 'Labs',
  'Memory': 'Memoria',
  'Repository': 'Repositorio',
  'Theme': 'Tema',
  'Operator': 'Operador',
  'Admin': 'Administrador',
  'ALL': 'TODOS',
  'VENDORS': 'PROVEEDORES',
  'SORT BY': 'ORDENAR POR',
  'Select All': 'Seleccionar Todo',
  'Clear List': 'Limpiar Lista',
  'Clear Selection': 'Limpiar Selección',
  'Selection Cleared': 'Selección Limpiada',
  'Clear this filter': 'Limpiar este filtro',
  'Toggle Sidebar': 'Alternar Barra Lateral',
  'Toggle View Mode': 'Alternar Modo de Vista',
  'Toggle Neural Language': 'Alternar Idioma Neural',
  'Toggle Neural Manifest': 'Alternar Manifiesto Neural',
  'Configuration': 'Configuración',
  'Settings & Logic': 'Ajustes y Lógica',
  'Studio Settings & Manifesto': 'Ajustes del Estudio y Manifiesto',
  'Engine Workspace': 'Espacio de Trabajo del Motor',
  'Inventory Vault': 'Bóveda de Inventario',
  'Inventory Logic': 'Lógica de Inventario',
  'Batch Telemetry': 'Telemetría de Lote',
  'Deployed Crates Library': 'Biblioteca de Cajas Desplegadas',
  'Active Crate Deployment': 'Despliegue de Cajas Activo',
  'Open Module': 'Abrir Módulo',
  'Open Document': 'Abrir Documento',
  'New Unit': 'Unidad Nueva',
  'Artifact': 'Artículo',
  'ARTIFACTS SELECTED': 'ARTÍCULOS SELECCIONADOS',
  'Items Selected': 'Artículos Seleccionados',
  'Items Captured': 'Artículos Capturados',
  'Vendor Mapping': 'Mapeo de Proveedores',
  'Regional Hub': 'Centro Regional',
  'System Log': 'Registro del Sistema',
  'System Logs': 'Registros del Sistema',
  'Technical Preview': 'Vista Previa Técnica',
  'Developer Only': 'Solo Desarrollador',
  'Developer Data Dump': 'Volcado de Datos de Desarrollador',

  // Search placeholders — uppercase is the design, keep it
  'FIND INVENTORY...': 'BUSCAR INVENTARIO...',
  'FIND CRATES...': 'BUSCAR CAJAS...',
  'FIND UNITS...': 'BUSCAR UNIDADES...',
  'FIND ON STORE...': 'BUSCAR EN TIENDA...',
  'SEARCH INVENTORY...': 'BUSCAR INVENTARIO...',
  'SEARCH PAYMENTS...': 'BUSCAR PAGOS...',
  'INPUT BARCODES...': 'INGRESAR CÓDIGOS DE BARRAS...',
  'Search Units': 'Buscar Unidades',
  'Search Payments': 'Buscar Pagos',
  'Filter Payments': 'Filtrar Pagos',

  // Smart filters
  'Smart filters — type, shape, material, colour':
    'Filtros inteligentes — tipo, forma, material, color',
  'Material / Colour': 'Material / Color',
  'Material / Colour — main filter': 'Material / Color — filtro principal',
  'Material / Colour — Main Filter': 'Material / Color — Filtro Principal',
  'Shape — sub filter': 'Forma — subfiltro',
  'Shape — Sub Filter': 'Forma — Subfiltro',

  // Export / sheets
  'Export Catalog': 'Exportar Catálogo',
  'Export Manifest': 'Exportar Manifiesto',
  'Export PDF Catalog': 'Exportar Catálogo PDF',
  'Export Spreadsheet': 'Exportar Hoja de Cálculo',
  'Export XLSX': 'Exportar XLSX',
  'Export Title': 'Título de Exportación',
  'Export tools': 'Herramientas de exportación',
  'Document Branding': 'Marca del Documento',
  'Include Images': 'Incluir Imágenes',
  'High fidelity cards': 'Tarjetas de alta fidelidad',
  'Layout Methodology': 'Metodología de Diseño',
  'Manifest Ready': 'Manifiesto Listo',
  'Add manifest notes...': 'Agregar notas al manifiesto...',
  'Catalog exported successfully': 'Catálogo exportado con éxito',
  'Your export has been successfully generated': 'Tu exportación se generó con éxito',
  'Failed to generate PDF. Please try again.': 'No se pudo generar el PDF. Inténtalo de nuevo.',
  'Generating preview...': 'Generando vista previa...',
  'Optimizing vector layouts and image layers...':
    'Optimizando diseños vectoriales y capas de imagen...',
  'Processing Assets': 'Procesando Recursos',
  'High-Res Assembly': 'Ensamblaje de Alta Resolución',
  'Sheets': 'Sheets',
  'Upload inventory to Google Sheets': 'Subir inventario a Google Sheets',
  'Preparing Google Sheets payload...': 'Preparando datos para Google Sheets...',
  'Sync calculated fields to the database': 'Sincronizar campos calculados con la base de datos',
  'Syncing calculated fields to database...':
    'Sincronizando campos calculados con la base de datos...',
  'Download Shopify XLSX': 'Descargar XLSX de Shopify',
  'Download Workbook V2 (Rare Earth Format)': 'Descargar Workbook V2 (Formato Rare Earth)',

  // Scanning / NFC / hardware
  'Scanner Center': 'Centro de Escaneo',
  'Open QR Scanner': 'Abrir Escáner QR',
  'QR Reader': 'Lector QR',
  'QR Scan': 'Escaneo QR',
  'NFC Scan': 'Escaneo NFC',
  'NFC Link': 'Enlace NFC',
  'Scan NFC Tag': 'Escanear Etiqueta NFC',
  'Write NFC': 'Escribir NFC',
  'Manage Tags': 'Gestionar Etiquetas',
  'Copy Tag IDs': 'Copiar IDs de Etiquetas',
  'No tags scanned yet': 'Aún no se han escaneado etiquetas',
  'Hold device near NFC tag': 'Acerca el dispositivo a la etiqueta NFC',
  'Hold the tag near the top-back of your device to establish secure handshake.':
    'Acerca la etiqueta a la parte superior trasera de tu dispositivo para establecer una conexión segura.',
  'Awaiting Proximity': 'Esperando Proximidad',
  'Hardware Sync Handshake': 'Sincronización con el Hardware',
  'Generate High-Fidelity Labels': 'Generar Etiquetas de Alta Fidelidad',
  'Failed to initialize camera scanner.': 'No se pudo iniciar el escáner de cámara.',
  'Camera permission denied. Please allow access in your browser settings.':
    'Permiso de cámara denegado. Permite el acceso en los ajustes de tu navegador.',
  'Mismatch Error': 'Error de Coincidencia',

  // Auth / access
  'Access Denied': 'Acceso Denegado',
  'Secure Enterprise Access': 'Acceso Empresarial Seguro',
  'Full Access Granted': 'Acceso Total Concedido',
  'Email Address': 'Correo Electrónico',
  'Security Key': 'Clave de Seguridad',
  'Enter System': 'Entrar al Sistema',
  'Authenticating...': 'Autenticando...',
  'Return to Login': 'Volver al Inicio de Sesión',
  'TERMINATE SESSION': 'TERMINAR SESIÓN',
  'Redirecting': 'Redirigiendo',
  'Activation': 'Activación',
  'Activate Link': 'Activar Enlace',
  'Need access? Contact your administrator.':
    '¿Necesitas acceso? Contacta a tu administrador.',
  'Your email is not registered for Onyx.mx access. Contact your system administrator.':
    'Tu correo no está registrado para acceder a Onyx.mx. Contacta al administrador del sistema.',
  'Welcome to Onyx. Access your inventory, manage operations, and explore your workspace.':
    'Bienvenido a Onyx. Accede a tu inventario, gestiona operaciones y explora tu espacio de trabajo.',

  // Onyx AI / neural link
  'Onyx Neural Link': 'Enlace Neural de Onyx',
  'Onyx Intelligence Context': 'Contexto de Inteligencia de Onyx',
  'Neural Core Sync': 'Sincronización del Núcleo Neural',
  'Neural Query...': 'Consulta neural...',
  'NEURAL QUERY...': 'CONSULTA NEURAL...',
  'NEURAL CAPTURE ACTIVE...': 'CAPTURA NEURAL ACTIVA...',
  'Stop Neural Response': 'Detener Respuesta Neural',
  'Start Listening': 'Empezar a Escuchar',
  'Hold Orb to Talk': 'Mantén Presionada la Esfera para Hablar',
  'Sync Intelligence': 'Sincronizar Inteligencia',
  'Grounding & Logic Rules': 'Reglas de Fundamento y Lógica',
  'Hard Rules': 'Reglas Estrictas',
  'Financial Context': 'Contexto Financiero',
  'CONFIGURE LINK': 'CONFIGURAR ENLACE',
  'PASTE NEURAL KEY...': 'PEGAR CLAVE NEURAL...',
  'Enter Gemini AI Credentials to activate Link':
    'Ingresa las credenciales de Gemini AI para activar el Enlace',
  'Reset Neural Credentials': 'Restablecer Credenciales Neurales',
  'Reset Neural Link credentials to system default?':
    '¿Restablecer las credenciales del Enlace Neural a los valores del sistema?',
  '⚠️ SYSTEM NEURAL KEY ACTIVE • RESTRICT KEY IN CLOUD CONSOLE FOR PRODUCTION':
    '⚠️ CLAVE NEURAL DEL SISTEMA ACTIVA • RESTRINGE LA CLAVE EN CLOUD CONSOLE PARA PRODUCCIÓN',
  'AI Batch Process': 'Proceso por Lote con IA',
  'AI GEN': 'GEN IA',

  // Media / crop studio
  'Media Viewer': 'Visor de Medios',
  'Operational Media Gallery': 'Galería de Medios Operativa',
  'Upload Additional Media': 'Subir Medios Adicionales',
  'Select an image from the Media Gallery to view it here.':
    'Selecciona una imagen de la Galería de Medios para verla aquí.',
  '1:1 Crop Studio & Pixel Stretch Background Generator':
    'Estudio de Recorte 1:1 y Generador de Fondo por Estiramiento de Píxeles',
  '1:1 Preview': 'Vista Previa 1:1',
  '1:1 Square (100%)': 'Cuadrado 1:1 (100%)',
  '1:1 Square Output Preview': 'Vista Previa de Salida Cuadrada 1:1',
  'Apply 1:1 Crop': 'Aplicar Recorte 1:1',
  'Crop target': 'Objetivo de recorte',
  'Aspect Ratio:': 'Relación de Aspecto:',
  'Output Resolution:': 'Resolución de Salida:',
  'Background Fill Mode': 'Modo de Relleno de Fondo',
  'Background Mode:': 'Modo de Fondo:',
  'Pixel Stretch': 'Estiramiento de Píxeles',
  'Proportion Stretching:': 'Estiramiento de Proporción:',
  'Soft Studio Blur:': 'Desenfoque Suave de Estudio:',
  'Solid Color': 'Color Sólido',
  'Custom Color': 'Color Personalizado',
  'Density': 'Densidad',
  '0% (Zero Distortion)': '0% (Sin Distorsión)',
  'Drag crop box freely anywhere across panel (allows extended background margins!).':
    'Arrastra el recuadro de recorte libremente por el panel (¡permite márgenes de fondo extendidos!).',
  'No generated image to download.': 'No hay imagen generada para descargar.',
  'Image downloaded!': '¡Imagen descargada!',
  'Images': 'Imágenes',

  // Scene composer
  'Scene': 'Escena',
  'Save Scene': 'Guardar Escena',
  'Saving scene to Drive...': 'Guardando escena en Drive...',
  'Scene saved successfully!': '¡Escena guardada con éxito!',
  'No scene to save or no initial product selected.':
    'No hay escena que guardar o no se seleccionó un producto inicial.',
  'Upload a scene image to begin': 'Sube una imagen de escena para comenzar',
  'Dropped outside of the scene image.': 'Se soltó fuera de la imagen de la escena.',
  'Generate Results': 'Generar Resultados',
  'New Preview': 'Nueva Vista Previa',
  'Use the "Select" button in the inventory to choose products.':
    'Usa el botón "Seleccionar" en el inventario para elegir productos.',

  // Batch / capture
  'Batch ID Capture': 'Captura de IDs por Lote',
  'Batch List': 'Lista de Lotes',
  'Batch Management': 'Gestión de Lotes',
  'Batch Search Active': 'Búsqueda por Lote Activa',
  'Finalize Batch': 'Finalizar Lote',
  'Captured:': 'Capturado:',
  'Bypass Sync': 'Omitir Sincronización',
  'changes queued': 'cambios en cola',
  'QUEUE EMPTY': 'COLA VACÍA',

  // Payments legend / status chips
  'PAY': 'PAGAR',
  'Payment Workflow': 'Flujo de Pago',
  'NO UPCOMING PAYMENTS': 'SIN PAGOS PRÓXIMOS',
  'NEW = BLUE': 'NUEVO = AZUL',
  'PAID = GREEN': 'PAGADO = VERDE',
  'PARTIAL = RED': 'PARCIAL = ROJO',
  'USD Retail': 'Menudeo USD',
  'Successful': 'Exitoso',
  'ACTIVE': 'ACTIVO',
  'EXIT': 'SALIR',

  // Shipments
  'Delete this shipment record permanently?':
    '¿Eliminar este registro de embarque permanentemente?',
  'Shipment deleted': 'Embarque eliminado',
  'Failed to delete shipment': 'No se pudo eliminar el embarque',
  'Total cargo mass...': 'Masa total de carga...',
  'Pack Items': 'Embalar Artículos',
  'Close 3D Viewer': 'Cerrar Visor 3D',

  // Tutorial
  'Start Tutorial': 'Iniciar Tutorial',
  'Learn the basics of using the Inventory module and its features.':
    'Aprende lo básico del módulo de Inventario y sus funciones.',
  'Manage and track your products, edit items, and view collections.':
    'Gestiona y rastrea tus productos, edita artículos y consulta colecciones.',

  // ── Trucking / trailer loading ───────────────────────────────────────────
  // Absent on purpose, so they fall through unchanged: plate and ID example
  // placeholders (TR-000, ABC-123-X, XYZ-789-Y, TRK-ID-000), the .truckload
  // file extension, 53FT, SKU, ONYX CORE, ONYX-LOG-2.5, and the en-US locale.
  'Trailer': 'Tráiler',
  'Tractor': 'Tractor',
  'Tractor Number': 'Número de Tractor',
  'Trailer Number': 'Número de Tráiler',
  'Trailer Plates': 'Placas del Tráiler',
  'Truck Plates': 'Placas del Camión',
  'Seal Number': 'Número de Sello',
  'NO PLATES': 'SIN PLACAS',
  'Bulkhead': 'Mamparo',
  'Floor': 'Piso',
  'Rear Deck': 'Plataforma Trasera',
  'FRONT (CAB)': 'FRENTE (CABINA)',
  '◀ Rear': '◀ Atrás',
  'Front ▶': 'Frente ▶',
  'Trailer Matrix —': 'Matriz del Tráiler —',
  'cm ×': 'cm ×',

  // Loading actions
  'Load': 'Cargar',
  'Load Payload': 'Cargar Contenido',
  'Load Weight': 'Peso de Carga',
  'Load Previous': 'Cargar Anterior',
  'Load Drafts': 'Cargar Borradores',
  'Recall Load': 'Recuperar Carga',
  'Flush Payload': 'Vaciar Contenido',
  'Eject (Unload)': 'Expulsar (Descargar)',
  'Back to Warehouse': 'Volver al Almacén',
  'Reverting to Warehouse...': 'Regresando al Almacén...',
  'Reverted to Warehouse': 'Regresado al Almacén',
  'Failed to revert': 'No se pudo regresar',
  'Nest Unit': 'Anidar Unidad',
  'Successfully nested': 'Anidado con éxito',
  'Stack on Top': 'Apilar Encima',
  'Add Box': 'Agregar Caja',
  'Select container for box': 'Selecciona el contenedor para la caja',
  'No compatible containers available': 'No hay contenedores compatibles disponibles',
  'Deselect': 'Deseleccionar',
  'Unit': 'Unidad',
  'Active Units': 'Unidades Activas',
  'Total Payload': 'Carga Total',
  'Estimated': 'Estimado',
  'Vol': 'Vol',
  'Vol:': 'Vol:',
  'Liters': 'Litros',
  'Weight KG': 'Peso KG',
  'KG LOADED': 'KG CARGADOS',
  'KG FREE': 'KG LIBRES',
  'High Density': 'Alta Densidad',
  'Balanced Load': 'Carga Balanceada',
  'Axle Load Distribution': 'Distribución de Carga por Eje',
  'Packing Items (Cardboard Boxes)': 'Artículos de Embalaje (Cajas de Cartón)',
  'No extra packing items added': 'No se agregaron artículos de embalaje extra',
  'BOX DESCRIPTION (E.G. TOOLS, WRAPPING...)':
    'DESCRIPCIÓN DE LA CAJA (P. EJ. HERRAMIENTAS, EMBALAJE...)',

  // Positioning
  'Move Up': 'Mover Arriba',
  'Move Down': 'Mover Abajo',
  'Move Front': 'Mover al Frente',
  'Move Rear': 'Mover Atrás',
  'Transform (Rotate)': 'Transformar (Rotar)',
  'Zoom Out': 'Alejar',

  // Shipment lifecycle
  'Dispatch': 'Despacho',
  'Ready for In-Transit': 'Listo para Tránsito',
  'Ready for Finalization Sequence': 'Listo para la Secuencia de Finalización',
  'System Ready for Finalization': 'Sistema Listo para Finalizar',
  'Validating shipment integrity...': 'Validando la integridad del embarque...',
  'Synchronizing shipment data...': 'Sincronizando datos del embarque...',
  'Shipment Live in Registry': 'Embarque Activo en el Registro',
  'Shipment record deleted': 'Registro de embarque eliminado',
  'Deleting shipment record...': 'Eliminando registro de embarque...',
  'Failed to recall shipment': 'No se pudo recuperar el embarque',
  'Save Truck': 'Guardar Camión',
  'Trailer cleared': 'Tráiler vaciado',
  'Crate updated': 'Caja actualizada',
  'Update failed': 'La actualización falló',
  'Updating': 'Actualizando',
  'Building...': 'Construyendo...',
  'Loading...': 'Cargando...',
  'Generate': 'Generar',
  'Import': 'Importar',
  'Delete': 'Eliminar',
  'Delete Record': 'Eliminar Registro',
  'No Records': 'Sin Registros',
  'No saved drafts': 'No hay borradores guardados',
  'Draft Name': 'Nombre del Borrador',
  'e.g. Monday AM Load': 'p. ej. Carga del lunes AM',
  'Expand Fleet': 'Expandir Flota',
  'Cancel Protocol': 'Cancelar Protocolo',

  'Are you sure you want to clear all loaded units from the trailer?':
    '¿Seguro que quieres quitar todas las unidades cargadas del tráiler?',
  'Are you sure you want to finalize this shipment and synchronize with the cloud?':
    '¿Seguro que quieres finalizar este embarque y sincronizarlo con la nube?',
  'Are you sure you want to permanently delete this shipment record? This action cannot be undone.':
    '¿Seguro que quieres eliminar permanentemente este registro de embarque? Esta acción no se puede deshacer.',

  // 3D viewer / sharing
  'View 3D': 'Ver en 3D',
  'Launch 3D Viewer': 'Abrir el Visor 3D',
  'Share 3D Visualizer': 'Compartir el Visor 3D',
  'Onyx 3D Visualizer': 'Visor 3D de Onyx',
  '3D Digital Mirror Created': 'Espejo Digital 3D Creado',
  '3D Lidar Point-Cloud': 'Nube de Puntos Lidar 3D',
  'Active Mirror Sync': 'Sincronización de Espejo Activa',
  'Trailer Isometric': 'Isométrica del Tráiler',
  'Visual Manifesto': 'Manifiesto Visual',
  'Consolidated Manifesto': 'Manifiesto Consolidado',
  'Trailer Packing List': 'Lista de Embalaje del Tráiler',
  'Crate Spreadsheets': 'Hojas de Cálculo de Cajas',
  'Exportation Wizard': 'Asistente de Exportación',
  'Export as .truckload file (includes thumbnail)':
    'Exportar como archivo .truckload (incluye miniatura)',
  'Exports as .truckload - includes map thumbnail':
    'Exporta como .truckload — incluye miniatura del mapa',
  'Import a .truckload file': 'Importar un archivo .truckload',
  'Import a .truckload file to get started':
    'Importa un archivo .truckload para comenzar',
  'Invalid .truckload file': 'Archivo .truckload inválido',
  'COPY MANIFESTO LINK': 'COPIAR ENLACE DEL MANIFIESTO',
  'Copy Share Link': 'Copiar Enlace para Compartir',
  'Copy URL': 'Copiar URL',
  'Cloud Registry Link': 'Enlace del Registro en la Nube',
  'Registry Link Copied': 'Enlace del Registro Copiado',
  'Public URL copied to clipboard': 'URL pública copiada al portapapeles',
  'View Deployment': 'Ver Despliegue',
  'View All Deployed Crates': 'Ver Todas las Cajas Desplegadas',
  'No Individual Deployed Crates': 'Sin Cajas Desplegadas Individuales',
  'Ready Trailer': 'Preparar Tráiler',
  'VIEW': 'VER',
  'OPEN': 'ABRIR',

  // Protocol / status readouts
  'Protocol ID': 'ID del Protocolo',
  'Protocol Stable': 'Protocolo Estable',
  'Manifest Clean': 'Manifiesto Limpio',
  'Manifest Identity': 'Identidad del Manifiesto',
  'Network Topology': 'Topología de Red',
  'LOCK VERIFIED': 'BLOQUEO VERIFICADO',
  'Advanced Logistics Protocol v2.5': 'Protocolo de Logística Avanzada v2.5',
  'Onyx Logistics Protocol · Nesting v1.2': 'Protocolo de Logística Onyx · Anidado v1.2',
  'Pending Dispatch · Registry Offline': 'Despacho Pendiente · Registro Sin Conexión',
  'Sync Active · Publicly Accessible': 'Sincronización Activa · Accesible Públicamente',
  'saved ·': 'guardado ·',

  // ── AI batch image pipeline (background replacement) ─────────────────────
  'Replacing background...': 'Reemplazando el fondo...',
  'RE-CLEAN IMAGES': 'RE-LIMPIAR IMÁGENES',
  'No images in the queue to re-clean.': 'No hay imágenes en la cola para re-limpiar.',
  'All images queued for re-cleaning. Click START ENGINE to begin.':
    'Todas las imágenes están en cola para re-limpieza. Pulsa START ENGINE para comenzar.',
  'AI Batch Processing Complete!': '¡Procesamiento por Lote con IA Completado!',
  'Image Processing OFF for all items (Using original images)':
    'Procesamiento de Imágenes DESACTIVADO para todos los artículos (usando las imágenes originales)',
  'Image Processing ON for all items (Masks enabled)':
    'Procesamiento de Imágenes ACTIVADO para todos los artículos (máscaras habilitadas)',
  'Finding masks to optimize...': 'Buscando máscaras para optimizar...',
  'No masks found!': '¡No se encontraron máscaras!',
  'All masks are already optimized!': '¡Todas las máscaras ya están optimizadas!',
  'Generating Catalog PDF...': 'Generando el PDF del catálogo...',
  'PDF generated! Click Download PDF to save.':
    '¡PDF generado! Pulsa Descargar PDF para guardarlo.',
  'Generating Shopify XLSX...': 'Generando el XLSX de Shopify...',
  'Hexadecimal pixel map copied to clipboard!':
    '¡Mapa de píxeles hexadecimal copiado al portapapeles!',
  '1:1 Square crop applied!': '¡Recorte cuadrado 1:1 aplicado!',

  // ── Export toasts ────────────────────────────────────────────────────────
  // These fire from inside handleExportSelectedXLSX and friends. They are
  // messages to the person at the screen, not content of the exported file —
  // the workbook's own sheet names and headers stay English.
  'No items selected': 'No hay artículos seleccionados',
  'WorkBook Ready': 'Workbook Listo',
  'Workbook V2 Ready': 'Workbook V2 Listo',
  'Selected Items WorkBook Ready': 'Workbook de Artículos Seleccionados Listo',
  'Ready Truck': 'Preparar Camión',
  'Load Draft': 'Cargar Borrador',
  'Processing...': 'Procesando...',
  'Manifest Export Failed': 'La Exportación del Manifiesto Falló',
  'Selected Items Export Failed': 'La Exportación de Artículos Seleccionados Falló',
  'Shopify Export Failed': 'La Exportación a Shopify Falló',
  'V2 Export Failed': 'La Exportación V2 Falló',
  '% vol': '% vol',
  '% wt': '% peso',
  // VITE_GOOGLE_SHEETS_WEBHOOK... is a developer configuration error, not user
  // copy — left untranslated on purpose.

  // ── Payment tracking ─────────────────────────────────────────────────────
  // Absent on purpose: BASE_VAL and en-US (internal tokens), and the abbreviated
  // column stubs "Acquis"/"Produc"/"Operat"/"Supply" — those are truncated to
  // fit a fixed column and Spanish equivalents would not fit the same width.
  'PAYMENTS': 'PAGOS',
  'PAYMENTS ·': 'PAGOS ·',
  'PAYMENT DETAILS': 'DETALLES DEL PAGO',
  'Payment updated!': '¡Pago actualizado!',
  'Payment deleted': 'Pago eliminado',
  'Delete Payment': 'Eliminar Pago',
  'Edit Payment': 'Editar Pago',
  'Editing Payment Record': 'Editando el Registro de Pago',
  'Are you sure you want to delete this payment record?':
    '¿Seguro que quieres eliminar este registro de pago?',
  'Launch Payment Wizard': 'Abrir el Asistente de Pagos',
  'Reference Payments': 'Pagos de Referencia',
  'New Request': 'Nueva Solicitud',
  'REQUEST': 'SOLICITUD',
  'CONFIRM': 'CONFIRMAR',
  'CONFIRM REQUEST': 'CONFIRMAR SOLICITUD',
  'CONFIRM LIQUIDATION': 'CONFIRMAR LIQUIDACIÓN',
  'CONFIRM DISBURSEMENT PAYMENTS': 'CONFIRMAR PAGOS DE DESEMBOLSO',
  'TOTAL LIQUIDATION PAYMENTS': 'TOTAL DE PAGOS DE LIQUIDACIÓN',
  'LIQUIDATION': 'LIQUIDACIÓN',
  'Select disbursement node': 'Selecciona el nodo de desembolso',
  'Select disbursement payments': 'Selecciona los pagos de desembolso',
  'DELTA TO DISBURSE': 'DIFERENCIA POR DESEMBOLSAR',
  'RECURRING DISBURSEMENT': 'DESEMBOLSO RECURRENTE',
  'ARTIFACT TOTAL': 'TOTAL DEL ARTÍCULO',
  'ARTIFACT TOTAL DISBURSEMENT': 'DESEMBOLSO TOTAL DEL ARTÍCULO',
  'CONTRACT TOTAL': 'TOTAL DEL CONTRATO',
  'Line Total': 'Total de Línea',
  'Volume (MXN)': 'Volumen (MXN)',
  'AMOUNT (MXN)': 'MONTO (MXN)',
  'Enter valid amount': 'Ingresa un monto válido',
  'Mark as': 'Marcar como',
  'PENDING': 'PENDIENTE',
  'PARTIAL': 'PARCIAL',
  'STAKED': 'COMPROMETIDO',
  'UNKNOWN': 'DESCONOCIDO',
  'TERMINATE': 'TERMINAR',
  'ADJUST': 'AJUSTAR',
  'ADJUSTMENTS': 'AJUSTES',
  'FACTORS': 'FACTORES',
  'BASE': 'BASE',
  'SOURCE': 'ORIGEN',
  'REFERENCE': 'REFERENCIA',
  'DETAILS': 'DETALLES',
  'OTHER': 'OTRO',

  // Taxes and fees
  'Tax': 'Impuesto',
  'Taxes': 'Impuestos',
  'CONTINUE TO TAXES': 'CONTINUAR A IMPUESTOS',
  'CONTINUE TO SOURCE →': 'CONTINUAR AL ORIGEN →',
  'PROCEED_TO_SOURCE →': 'CONTINUAR_AL_ORIGEN →',
  'CALIBRATE_ADJUSTMENTS →': 'CALIBRAR_AJUSTES →',
  'ADD 16% IVA': 'AGREGAR 16% DE IVA',
  '+ IVA': '+ IVA',
  '+ FEE': '+ COMISIÓN',
  '+ BNK': '+ BANCO',
  'Value added tax': 'Impuesto al valor agregado',
  'Value added tax calculation': 'Cálculo del impuesto al valor agregado',
  'Tax & fee calibration': 'Calibración de impuestos y comisiones',
  'Fiscal & platform calibration': 'Calibración fiscal y de plataforma',
  'BANK (10%)': 'BANCO (10%)',
  'BANK FEE (10%)': 'COMISIÓN BANCARIA (10%)',
  'BANK COMISION (10%)': 'COMISIÓN BANCARIA (10%)',
  'MANUAL FEE (MXN)': 'COMISIÓN MANUAL (MXN)',
  'Manual commission / fee (MXN)': 'Comisión manual (MXN)',
  'MANUAL COMMISSION / FEE (MXN)': 'COMISIÓN MANUAL (MXN)',
  'Platform processing fee': 'Comisión de procesamiento de la plataforma',
  'Processing overhead': 'Sobrecosto de procesamiento',

  // Progress
  '% PAID': '% PAGADO',
  '% COMPLETE': '% COMPLETADO',
  'TARGET PERCENTAGE': 'PORCENTAJE OBJETIVO',
  'CUMULATIVE PROGRESS': 'PROGRESO ACUMULADO',
  'No balance remaining at this percentage.':
    'No queda saldo en este porcentaje.',

  // Categories
  'MERCHANDISE': 'MERCANCÍA',
  'ACQUISITIONS': 'ADQUISICIONES',
  'OPERATIONS': 'OPERACIONES',
  'LABOR': 'MANO DE OBRA',
  'PACKAGING': 'EMBALAJE',
  'LOGISTICS UNIT': 'UNIDAD LOGÍSTICA',
  'Transit Materials': 'Materiales de Tránsito',
  'Tools & Assets': 'Herramientas y Activos',
  'Workforce Cycles': 'Ciclos de Mano de Obra',
  'Service General': 'Servicio General',
  'Pallet': 'Tarima',
  'Asset': 'Activo',
  'ASSET COUNT': 'CONTEO DE ACTIVOS',
  'Size / Weight': 'Tamaño / Peso',

  // Recurring
  'Fixed Recurring': 'Recurrente Fijo',
  'Automatic monthly persistence': 'Persistencia mensual automática',
  'MONTHLY PERSISTENCE DAY': 'DÍA DE PERSISTENCIA MENSUAL',
  'Persistence Window Day': 'Día de la Ventana de Persistencia',

  // Context / notes
  'NOTES / CONTEXT': 'NOTAS / CONTEXTO',
  'Transactional Context': 'Contexto Transaccional',
  'Transactional Description': 'Descripción Transaccional',
  'Refine transactional metadata': 'Refinar los metadatos de la transacción',
  'Additional context…': 'Contexto adicional…',
  'Brief summary': 'Resumen breve',
  'Session summary': 'Resumen de la sesión',
  'No additional notes.': 'Sin notas adicionales.',
  'Optional #': '# Opcional',
  'Optional identifier': 'Identificador opcional',
  'Unnamed Transaction': 'Transacción sin nombre',
  'Fill in description, amount, and select an account.':
    'Completa la descripción, el monto y selecciona una cuenta.',

  // Traceability
  'Linked Assets & Traceability': 'Activos Vinculados y Trazabilidad',
  'No direct items linked': 'No hay artículos vinculados directamente',
  'No artifacts pending request': 'No hay artículos pendientes de solicitud',
  'No Records Found': 'No se Encontraron Registros',
  'AQ Code': 'Código AQ',
  'LD Code': 'Código LD',

  // In-flight states
  'Saving artifact…': 'Guardando artículo…',
  'RECORDING ARTIFACT…': 'REGISTRANDO ARTÍCULO…',
  'Sending request…': 'Enviando solicitud…',
  'Updating payment…': 'Actualizando el pago…',
  'UPDATING…': 'ACTUALIZANDO…',
  'Record added!': '¡Registro agregado!',

  // ── Crates inventory / storage units ─────────────────────────────────────
  // "UNK" left as-is: a truncated placeholder shown where a vendor code is
  // missing, sized to a fixed 3-character slot.
  'Logistics Units (Crates, Pallets & Boxes)':
    'Unidades Logísticas (Cajas, Tarimas y Cajas de Cartón)',
  'Unit Type': 'Tipo de Unidad',
  'Unit Protocol': 'Protocolo de la Unidad',
  'Parent Unit': 'Unidad Principal',
  'UNITS AVAILABLE': 'UNIDADES DISPONIBLES',
  'Box': 'Caja de Cartón',
  'Boxes': 'Cajas de Cartón',
  'BOXES': 'CAJAS DE CARTÓN',
  'Internal': 'Interno',
  'Internal References': 'Referencias Internas',
  'Matrix': 'Matriz',
  'Configuration Matrix': 'Matriz de Configuración',
  'Initializing Matrix...': 'Inicializando la matriz...',
  'Syncing with logistics matrix...': 'Sincronizando con la matriz logística...',
  'Protocol version 3.2.6 · Jouhayerk Matrix':
    'Protocolo versión 3.2.6 · Matriz Jouhayerk',

  // Dimensions & weight
  'Width (CM)': 'Ancho (CM)',
  'Height (CM)': 'Alto (CM)',
  'Length (CM)': 'Largo (CM)',
  'Enter all three dimensions.': 'Ingresa las tres dimensiones.',
  'BRUTE KG': 'KG BRUTOS',
  'BRUTE WEIGHT': 'PESO BRUTO',
  'Saving weight...': 'Guardando el peso...',
  'Weight recorded': 'Peso registrado',
  'Batch Quantity': 'Cantidad del Lote',
  'Total Resource Allocation': 'Asignación Total de Recursos',

  // Crate lifecycle
  'Initialize Storage': 'Inicializar Almacenamiento',
  'Deploy Storage Protocol': 'Desplegar Protocolo de Almacenamiento',
  'Edit Crate Details': 'Editar Detalles de la Caja',
  'Edit Storage Unit': 'Editar Unidad de Almacenamiento',
  'Delete Crate': 'Eliminar Caja',
  'Delete All Units': 'Eliminar Todas las Unidades',
  'Sync Unit Changes': 'Sincronizar Cambios de la Unidad',
  'Logistics protocol updated': 'Protocolo logístico actualizado',
  'Crate is empty': 'La caja está vacía',
  'Nested': 'Anidado',
  'Nest this Box': 'Anidar esta Caja de Cartón',
  'Nesting Protocol': 'Protocolo de Anidado',
  'Packed Inside:': 'Empacado Dentro de:',
  'Assign': 'Asignar',
  'Remove from unit': 'Quitar de la unidad',
  'Remove item from this unit?': '¿Quitar el artículo de esta unidad?',
  'Removing item...': 'Quitando el artículo...',
  'Marked as Partial': 'Marcado como Parcial',
  'Marking as Partial...': 'Marcando como Parcial...',
  'Re-opening crate for packing...': 'Reabriendo la caja para embalaje...',
  'Crate re-opened — add more items in packing view':
    'Caja reabierta — agrega más artículos en la vista de embalaje',
  'Crate re-opened (Demo Mode)': 'Caja reabierta (Modo Demo)',
  'Returning crate to packing state...': 'Regresando la caja al estado de embalaje...',
  'Crate returned to Packed Crates': 'Caja devuelta a Cajas Empacadas',
  'Crate returned to Packed (Demo Mode)': 'Caja devuelta a Empacada (Modo Demo)',
  'Send to Warehouse': 'Enviar al Almacén',
  'WARNING: Are you sure you want to SEND THIS UNIT BACK TO THE WAREHOUSE? This will reset its deployment status to PACKED and clear its truck and dispatch data.':
    'ADVERTENCIA: ¿Seguro que quieres DEVOLVER ESTA UNIDAD AL ALMACÉN? Esto restablecerá su estado de despliegue a EMPACADA y borrará sus datos de camión y despacho.',
  'Record updated (Demo Mode)': 'Registro actualizado (Modo Demo)',
  'Group purged (Demo Mode)': 'Grupo purgado (Modo Demo)',
  'Failed to remove': 'No se pudo quitar',
  'Failed to save': 'No se pudo guardar',

  // Acquisition & sourcing
  'Acquisition Protocol': 'Protocolo de Adquisición',
  'Acquisition Cost (MXN)': 'Costo de Adquisición (MXN)',
  'Acquisition Price (MXN)': 'Precio de Adquisición (MXN)',
  'Source Provider': 'Proveedor de Origen',
  'Protocol Source': 'Origen del Protocolo',
  'Primary Vendor': 'Proveedor Principal',
  'Senders': 'Remitentes',
  'Deployment Date': 'Fecha de Despliegue',
  'PAY:': 'PAGO:',
  'No': 'No',

  // Notes
  'Label / Notes': 'Etiqueta / Notas',
  'Contents / Notes': 'Contenido / Notas',
  'Notes / Reference Code': 'Notas / Código de Referencia',
  'No notes provided': 'No se proporcionaron notas',

  // Empty states
  'No units found matching this criteria.':
    'No se encontraron unidades que coincidan con este criterio.',
  'No deployed units found in the registry.':
    'No se encontraron unidades desplegadas en el registro.',
  'No deployed units found in the shipping registry.':
    'No se encontraron unidades desplegadas en el registro de embarques.',
  'No empty units available. Create new storage to begin packing.':
    'No hay unidades vacías disponibles. Crea un almacenamiento nuevo para comenzar a embalar.',

  '— Packing List': '— Lista de Embalaje',
  'Export Manifesto': 'Exportar Manifiesto',

  // ── AI content filters ───────────────────────────────────────────────────
  // CONTENT_FILTERS and SHOPIFY_REQUIRED_FIELDS in aiContent.ts hold these as
  // plain English and are translated where they are READ, not where they are
  // declared. Those are module-level consts, evaluated once at import — a
  // tr() inside them would freeze at load and go stale on a language switch,
  // because the remount re-renders components but does not re-run module code.
  'Metadata': 'Metadatos',
  'Described': 'Descrito',
  'Cleaned': 'Limpiado',
  'Cutout': 'Recorte',
  'No AI': 'Sin IA',
  'Colour and type extracted — text-derived, no photo needed':
    'Color y tipo extraídos — derivados del texto, sin necesidad de foto',
  'Written up: descriptions, masks and points':
    'Redactado: descripciones, máscaras y puntos',
  'A background-removed image exists': 'Existe una imagen sin fondo',
  'Transparent PNG rendered': 'PNG transparente generado',
  'Never processed': 'Nunca procesado',

  'AI Title': 'Título IA',
  'Body (HTML)': 'Cuerpo (HTML)',
  'Colour': 'Color',
  'Product Type': 'Tipo de Producto',

  // ── AI batch processing wizard ───────────────────────────────────────────
  // Left as-is: AIzaSy... (an API-key placeholder), IMG/MASK/CLIP (fixed-width
  // chips), and the two gallery brand names ART OF DECOR / RARE EARTH GALLERY.
  // The processing-mode chips STUDIO / LOCAL / CLOUD / HYBRID are also left
  // alone — they label wire values that are compared, and the words are read
  // the same in Spanish.
  'Start Engine': 'Iniciar Motor',
  'Save & Start': 'Guardar e Iniciar',
  'Total Progress': 'Progreso Total',
  'ABORT': 'ABORTAR',
  'Abort Processing': 'Abortar el Procesamiento',
  'Processing is active. Are you sure you want to abort and close?':
    'El procesamiento está activo. ¿Seguro que quieres abortarlo y cerrar?',
  'Batch segmentation & description logic':
    'Lógica de segmentación y descripción por lote',

  // Image stage
  'Toggle Image Processing': 'Alternar el Procesamiento de Imágenes',
  'Toggle Image Processing (Masks & Transparency) ON/OFF for ALL items':
    'Activar o desactivar el procesamiento de imágenes (máscaras y transparencia) para TODOS los artículos',
  'Toggle Studio / Local / Cloud / Hybrid Processing':
    'Alternar el procesamiento Studio / Local / Cloud / Hybrid',
  'IMG PROCESSING: ON (MASKS)': 'PROC. DE IMAGEN: ACTIVO (MÁSCARAS)',
  'IMG PROCESSING: OFF (ORIGINALS)': 'PROC. DE IMAGEN: INACTIVO (ORIGINALES)',
  'CLEAN IMAGES ONLY': 'SOLO LIMPIAR IMÁGENES',
  'Clean Images only — the run skips descriptions, colours and type, and does the image stage alone':
    'Solo limpiar imágenes — la ejecución omite descripciones, colores y tipo, y hace únicamente la etapa de imagen',
  'IMAGES + DESCRIPTIONS': 'IMÁGENES + DESCRIPCIONES',
  'ALL IMAGES': 'TODAS LAS IMÁGENES',
  'HERO IMAGE ONLY': 'SOLO LA IMAGEN PRINCIPAL',
  'All images per item, or only the first. Hero-only is cheaper — roughly half the images — but leaves the rest uncleaned.':
    'Todas las imágenes de cada artículo, o solo la primera. Solo la principal es más económico —aproximadamente la mitad de las imágenes— pero deja el resto sin limpiar.',
  'Re-clean ALL images (force a new background replacement on every image of every item, not just the first)':
    'Re-limpiar TODAS las imágenes (fuerza un nuevo reemplazo de fondo en cada imagen de cada artículo, no solo en la primera)',
  'Cleaned image': 'Imagen limpiada',
  'No Image': 'Sin Imagen',
  'Re-Generate Mask': 'Regenerar Máscara',
  'Optimize Legacy PNG Masks to WebP': 'Optimizar máscaras PNG antiguas a WebP',
  '1:1 CROP': 'RECORTE 1:1',
  '1:1 Square Crop Tool': 'Herramienta de Recorte Cuadrado 1:1',
  'Copy Map': 'Copiar Mapa',
  'Colors:': 'Colores:',
  'AI:': 'IA:',

  // Description stage
  'Title Description': 'Descripción del Título',
  'AI generated title description...': 'Descripción del título generada por IA...',
  'AI generated HTML marketing description...':
    'Descripción de marketing en HTML generada por IA...',
  'Marketing Description (Embedded HTML Review)':
    'Descripción de Marketing (Revisión de HTML Incrustado)',
  'Edit Source HTML': 'Editar el HTML de Origen',
  'View Styled Preview': 'Ver la Vista Previa con Estilo',
  'AI Generated Video': 'Video Generado por IA',
  'RE-GEN INFO': 'REGENERAR INFO',
  'RE-GENERATE': 'REGENERAR',
  'Re-Generate AI Info': 'Regenerar la Info de IA',
  'REGENERATE DESCRIPTIONS': 'REGENERAR DESCRIPCIONES',
  'Regenerate ALL Descriptions (Force AI body descriptions and color info for all active items)':
    'Regenerar TODAS las descripciones (fuerza descripciones y color por IA en todos los artículos activos)',
  'All items enabled for AI description & color regeneration! Click START ENGINE to begin.':
    '¡Todos los artículos habilitados para regenerar descripción y color con IA! Pulsa INICIAR MOTOR para comenzar.',
  'Clear AI Generated Data': 'Borrar los Datos Generados por IA',
  'Incomplete Data: Missing Description, Colors, Hex Map, or Type':
    'Datos incompletos: falta la descripción, los colores, el mapa hexadecimal o el tipo',

  // Saving
  'Save Description & Colors': 'Guardar Descripción y Colores',
  'Saving description...': 'Guardando la descripción...',
  'SAVE TO DB': 'GUARDAR EN LA BD',
  'SAVED TO DB': 'GUARDADO EN LA BD',
  'Saving to DB...': 'Guardando en la BD...',
  'Saved successfully to database!': '¡Guardado con éxito en la base de datos!',
  'Please export to database first.': 'Primero exporta a la base de datos.',

  // Export
  'Generate PDF': 'Generar PDF',
  'Download PDF': 'Descargar PDF',
  'Generate XLSX': 'Generar XLSX',
  'Download XLSX': 'Descargar XLSX',
  'XLSX generated! Click Download XLSX to save.':
    '¡XLSX generado! Pulsa Descargar XLSX para guardarlo.',
  'No completed items to export.': 'No hay artículos completados para exportar.',
  'PDF BRAND': 'MARCA DEL PDF',
  'Onyx.mx - Catalog Hub': 'Onyx.mx - Centro de Catálogo',
  'Upload': 'Subir',

  // API key
  'API Settings': 'Ajustes de la API',
  'API Key Required': 'Se Requiere una Clave de API',
  'Please enter your Gemini API Key. It will be stored securely in your local device storage.':
    'Ingresa tu clave de API de Gemini. Se guardará de forma segura en el almacenamiento local de tu dispositivo.',

  // ── Store / storefront preview ───────────────────────────────────────────
  // The store module mirrors Rare Earth Gallery's US storefront. Left English
  // on purpose: the gallery's own name and branding, its Cave Creek address and
  // phone number, the Shop Pay payment brand, internal codes (Onyx.mx-REG,
  // OL-Aqua, REG Logo, v2.4-REG), and the material names Onyx / Natural Onyx,
  // which are item data rather than interface text.
  'Shopping Cart': 'Carrito de Compras',
  'Acquisition Bag': 'Bolsa de Adquisición',
  'Bag is currently empty': 'La bolsa está vacía',
  'ADD TO BAG': 'AGREGAR A LA BOLSA',
  'ADD TO CART': 'AGREGAR AL CARRITO',
  'IN BAG': 'EN LA BOLSA',
  'Added to bag': 'Agregado a la bolsa',
  'GET THIS!': '¡LLÉVATELO!',
  'GET IT!': '¡LLÉVATELO!',
  'Item Acquired!': '¡Artículo Adquirido!',
  'Item removed from store': 'Artículo quitado de la tienda',
  'Shipping calculated at checkout.': 'El envío se calcula al pagar.',
  'Simulated Express Buy It Now!': '¡Compra Rápida Simulada!',
  'Total: $': 'Total: $',
  'Usually ready in 24 hours': 'Normalmente listo en 24 horas',
  '0% APR financing available up to 24 mos.':
    'Financiamiento a 0% de interés hasta 24 meses.',
  'View sample plans': 'Ver planes de ejemplo',

  // Storefront navigation
  'Home': 'Inicio',
  'All Stone Catalog': 'Catálogo Completo de Piedra',
  'Natural Stone & Onyx Collection': 'Colección de Piedra Natural y Ónix',
  'Back to Catalog Grid': 'Volver a la Cuadrícula del Catálogo',
  'View Details ›': 'Ver Detalles ›',
  'Next Image': 'Imagen Siguiente',
  'Previous Image': 'Imagen Anterior',
  'Customer Care': 'Atención al Cliente',
  'Frequently Asked Questions': 'Preguntas Frecuentes',
  'Return Policy': 'Política de Devoluciones',
  'Shipping & Delivery': 'Envíos y Entregas',
  'Gallery Location': 'Ubicación de la Galería',
  'Call Us': 'Llámanos',
  'Directions': 'Cómo Llegar',
  'User Profile': 'Perfil de Usuario',
  'View store information': 'Ver información de la tienda',
  'Store Details Editor': 'Editor de Detalles de la Tienda',

  // Product detail
  'Specifications & Minerals': 'Especificaciones y Minerales',
  'Dimensions & Mass': 'Dimensiones y Masa',
  'Dimensions:': 'Dimensiones:',
  'Material & Origin:': 'Material y Origen:',
  'Weight:': 'Peso:',
  'Weight TBD': 'Peso por definir',
  'Unit Val.': 'Val. Unitario',
  'Inventory Total': 'Total del Inventario',
  'Spatial Axonometric Box:': 'Caja Axonométrica Espacial:',
  'Zoom:': 'Zoom:',
  'Scroll': 'Desplazar',
  'Return': 'Volver',
  'Elevate your space with this striking': 'Eleva tu espacio con esta impresionante',

  // Manual entry form
  'MANUAL ENTRY FORM': 'FORMULARIO DE ENTRADA MANUAL',
  'ENTRY STATUS': 'ESTADO DE LA ENTRADA',
  'VENDOR SELECTION': 'SELECCIÓN DE PROVEEDOR',
  'ITEM QUANTITY': 'CANTIDAD DEL ARTÍCULO',
  'MEDIA ATTACHMENTS': 'ARCHIVOS ADJUNTOS',
  'ATTACH NEW MEDIA (IMAGES / VIDEO)': 'ADJUNTAR NUEVO CONTENIDO (IMÁGENES / VIDEO)',
  'Uploading Media...': 'Subiendo contenido...',
  'NUM': 'NÚM',
  'MAT': 'MAT',
  'WEIGHT (KG)': 'PESO (KG)',
  'PRICE (MXN)': 'PRECIO (MXN)',
  'FINANCIAL INTEGRITY': 'INTEGRIDAD FINANCIERA',
  'Artifact values are stored in MXN and calculated against active exchange rates for global parity.':
    'Los valores se almacenan en MXN y se calculan con los tipos de cambio vigentes para mantener la paridad global.',
  'Enter custom title...': 'Ingresa un título personalizado...',
  'Identify class...': 'Identificar clase...',
  'Identify geometry...': 'Identificar geometría...',
  'Identify mineral...': 'Identificar mineral...',
  'Identify pigment...': 'Identificar pigmento...',
  'Manual Metric': 'Métrica Manual',

  // Sync
  'Syncing Artifact...': 'Sincronizando artículo...',
  'SYNCING ARTIFACT...': 'SINCRONIZANDO ARTÍCULO...',
  'Artifact Synced': 'Artículo Sincronizado',
  'Sync Complete': 'Sincronización Completa',
  'ABORT SYNC': 'ABORTAR SINCRONIZACIÓN',
  'Updating Registry...': 'Actualizando el registro...',
  'Updating status...': 'Actualizando el estado...',
  'COMMIT CHANGES →': 'CONFIRMAR CAMBIOS →',
  'Commit Acquisition →': 'Confirmar Adquisición →',
  'These items will be migrated to the Inventory Workforce':
    'Estos artículos se migrarán al Inventario',

  // Deletion
  'Secure Protocol Deletion': 'Eliminación Segura por Protocolo',
  'Confirm Erasure': 'Confirmar Borrado',
  'Cancel Operation': 'Cancelar Operación',
  'Discard': 'Descartar',
  'Artifact?': '¿Artículo?',

  // Selection
  'SELECT ALL': 'SELECCIONAR TODO',
  'DESELECT ALL': 'DESELECCIONAR TODO',
  'SELECTED': 'SELECCIONADO',
  'Selected Artifacts': 'Artículos Seleccionados',
  'CLEAR': 'LIMPIAR',

  // PDF export
  'EXPORT PDF': 'EXPORTAR PDF',
  'Export Configuration': 'Configuración de la Exportación',
  'Export Methodology': 'Metodología de Exportación',
  'Export Scope & Financials': 'Alcance y Finanzas de la Exportación',
  'Export Selected Items to PDF Catalog':
    'Exportar los artículos seleccionados al catálogo PDF',
  'Customize your catalog': 'Personaliza tu catálogo',
  'PDF Title (Cover & Filename)': 'Título del PDF (portada y nombre de archivo)',
  'Regular Export': 'Exportación Normal',
  'Catalog Mode': 'Modo Catálogo',
  'Full-page view': 'Vista de página completa',
  'Internal · Full Costs': 'Interno · Costos Completos',
  'External · Codes only': 'Externo · Solo Códigos',
  'PDF Exporting': 'Exportando PDF',
  'PDF generated successfully!': '¡PDF generado con éxito!',
  'Ready for download': 'Listo para descargar',
  'No items selected for PDF.': 'No hay artículos seleccionados para el PDF.',

  // AI status
  'AI Classification:': 'Clasificación por IA:',
  'AI Metadata Verified:': 'Metadatos de IA verificados:',
  'Onyx.mx AI Engine': 'Motor de IA de Onyx.mx',
  'WebP Background Removed': 'Fondo eliminado en WebP',
  'Generated': 'Generado',
  '100% AI Ready': '100% Listo con IA',
  '100% Complete': '100% Completo',
  'Powered by Google DeepMind Advanced Agentic Coding. Generating automated spatial masks, background removal, and marketing copy for natural stone artifacts.':
    'Impulsado por Google DeepMind Advanced Agentic Coding. Genera máscaras espaciales automáticas, eliminación de fondo y textos de marketing para artículos de piedra natural.',
  'museum-grade handcrafted stone items ready for digital storefronts.':
    'artículos de piedra tallados a mano, de calidad museo, listos para tiendas digitales.',

  // Empty states
  'No artifacts found': 'No se encontraron artículos',
  'No matching items found': 'No se encontraron artículos que coincidan',
  'No items currently match the 100% AI Generated filter with this category or search term.':
    'Ningún artículo coincide actualmente con el filtro 100% Generado por IA en esta categoría o término de búsqueda.',
  'Try clearing your search query or selecting a different category tab.':
    'Prueba a limpiar la búsqueda o a elegir otra categoría.',

  // ── Greeting ─────────────────────────────────────────────────────────────
  'Good morning': 'Buenos días',
  'Good afternoon': 'Buenas tardes',
  'Good evening': 'Buenas noches',
};
