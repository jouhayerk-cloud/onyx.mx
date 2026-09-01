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
};
