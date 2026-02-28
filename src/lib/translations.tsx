/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export const translations = {
  en: {
    // Sidebar
    create: 'Create',
    catalog: 'Catalog',
    workbook: 'Workbook',
    dashboard: 'Dashboard',
    newFastEntry: 'New',
    videoAnalysis: 'Video Analysis',
    batchEntry: 'Batch',
    inventory: 'Inventory',
    market: 'Market',
    acquisitions: 'Acquisitions',
    payments: 'Payments',
    shipping: 'Shipping',
    dispersal: 'Dispersal',
    bankAccounts: 'Bank Accounts',
    warehouse: 'Warehouse',
    truck: 'Truck',
    maxWeight: 'Max Weight',

    // Header
    searchInventory: 'Search inventory...',
    searchAcquisitions: 'Search acquisitions...',
    search: 'Search...',
    all: 'All',

    // Language
    language: 'Language',

    // Performance Mode
    perfModeOn: 'Performance Mode: On',
    perfModeOff: 'Performance Mode: Off',

    // TopBar (Legacy) & Common
    toggleInventory: 'Toggle Inventory Panel',
    addItemManually: 'Add Item Manually',
    addNewItemAI: 'Add New Item with AI',
    cancel: 'Cancel',
    logout: 'Logout',

    // ImageInputPanel (Legacy)
    createWithAI: 'Create with AI',
    uploadPhoto: 'Upload / Photo',
    imageBatch: 'Image Batch',
    clearAll: 'Clear All',
    selectVendor: 'Vendor',

    // ActionPanel
    step1Title: 'Step 1: Detect & Tag',
    step2Title: 'Step 2: Generate Masks',
    step3Title: 'Step 3: Review',
    promptPlaceholderItems: 'items',
    promptPlaceholderFeatures: 'key features',
    promptPlaceholderObjects: 'all objects',
    thingsToIgnore: 'Things to ignore...',
    buttonDetectAndTag: 'Detect & Tag',
    buttonGenerate: 'Generate Masks',
    processing: 'Processing...',
    skip: 'Skip',
    editMasks: 'Edit Masks',
    noMasksToEdit: 'No masks were generated to edit.',
    finishAndReview: 'Finish & Review',
    ignoreFollowing: 'Ignore the following',

    // AI Prompts
    detectAndTagPromptPrefix: 'Detect and tag',
    detectAndTagPromptSuffix:
      '. Output a single JSON object with two keys: "boxes" and "points". The "boxes" key should be a list where each entry has "box_2d" and "label". The "points" key should be a list where each entry has "point" (in [y,x] format normalized to 1000) and "label".',
    generateMaskPromptPrefix: 'Give the segmentation masks for',
    generateMaskPromptSuffix:
      '. Output a JSON list of segmentation masks where each entry contains "box_2d", "mask" (as a base64 string), and "label".',

    // ExtraModeControls
    exportPNG: 'Export PNG',
    exporting: 'Exporting...',
    exportSVG: 'Export SVG',
    savingSVG: 'Saving SVG...',
    cancelEdit: 'Cancel',
    saveChanges: 'Save Changes',
    selectMaskToEdit: 'Select Mask to Edit:',
    maskLabel: 'Mask',
    maskSavedSuccess: 'Mask saved. Analyzing item details with AI...',

    // DetailsPanel
    createNewItem: 'Create New Item',
    reviewDetails: 'Review Details',
    itemDetails: 'Item Details',
    saveItemToSheet: 'Save Item to Sheet',
    saving: 'Saving...',
    saveFailed: 'Save failed:',
    itemSavedSuccess: 'Item saved successfully!',
    autofillLoading: 'AI is analyzing item details...',
    autofillSuccess: 'AI autofill complete!',
    autofillError: 'AI autofill failed:',
    editItem: 'Edit Item',
    deleteItem: 'Delete Item',
    deleteConfirm: (itemName: string) =>
      `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`,
    deleteSuccess: 'Item deleted.',
    deleteError: 'Failed to delete item:',

    // InventoryForm
    aiSuggestions: 'AI Suggestions',
    details: 'Details',
    formID: 'ID',
    formItemNum: 'Num',
    formDate: 'Date',
    formShape: 'Shape',
    formMaterial: 'Mat',
    formDescription: 'Desc',
    formWeight: 'Weight',
    formHeight: 'H',
    formWidth: 'W',
    formLength: 'L',
    formPrice: 'Price',
    formQuantity: 'Qty',
    pickFromPic: 'Pick from Pic',
    generateGradient: 'Generate from Mask',
    generateGradientError: 'Could not generate gradient.',
    noMasksForGradient: 'No saved masks found for this item.',
    brightness: 'Brightness',
    temperature: 'Temperature',
    saturation: 'Saturation',

    // InventoryImages / Panel
    searchPlaceholder: 'Search...',
    loadingInventory: 'Loading inventory...',
    noInventoryFound: 'No inventory items found.',
    select: 'Select',
    clear: 'Clear',
    batchActions: 'Batch Actions',

    // Login
    welcome: 'Welcome Back',
    signInPrompt: 'Sign in to continue to Onyx.mx.',
    selectProfilePrompt: 'Select your profile',
    enterPinPrompt: 'Enter your 5-digit PIN',
    incorrectPin: 'Incorrect PIN',

    // Admin
    deleteDatabaseContents: 'DELETE DATABASE CONTENTS',
    resetDatabaseConfirm:
      'Are you sure you want to permanently delete ALL inventory data? This cannot be undone.',

    // Toasts
    pngExportSuccess: 'PNG downloaded!',
    pngExportError: 'PNG Export failed:',
    svgExportSuccess: 'SVG downloaded!',
    svgExportError: 'SVG Export failed:',
    noMasksToExport: 'No masks selected to export.',
    gradientExtracted: 'Gradient extracted!',
    gradientError: 'Could not auto-extract color.',

    // Batch Actions Modal
    batchActionsTitle: (count: number) => `Batch Actions for ${count} Item${count > 1 ? 's' : ''}`,
    batchActionsPrompt: 'Select one or more actions to apply to all selected items.',
    start: 'Start',
    deleteItems: 'Delete Items',
  },
  es: {
    // Sidebar
    create: 'Crear',
    catalog: 'Catálogo',
    workbook: 'Workbook',
    dashboard: 'Dashboard',
    newFastEntry: 'Nuevo',
    videoAnalysis: 'Análisis de Video',
    batchEntry: 'Lote',
    inventory: 'Inventario',
    market: 'Mercado',
    acquisitions: 'Adquisiciones',
    payments: 'Pagos',
    shipping: 'Envíos',
    dispersal: 'Dispersión',
    bankAccounts: 'Cuentas Bancarias',
    warehouse: 'Almacén',
    truck: 'Camión',
    maxWeight: 'Peso Máx.',

    // Header
    searchInventory: 'Buscar en inventario...',
    searchAcquisitions: 'Buscar en adquisiciones...',
    search: 'Buscar...',
    all: 'Todos',

    // Language
    language: 'Idioma',

    // Performance Mode
    perfModeOn: 'Modo Rendimiento: Activado',
    perfModeOff: 'Modo Rendimiento: Desactivado',

    // TopBar (Legacy) & Common
    toggleInventory: 'Alternar Inventario',
    addItemManually: 'Agregar Artículo Manualmente',
    addNewItemAI: 'Agregar Nuevo Artículo con IA',
    cancel: 'Cancelar',
    logout: 'Cerrar sesión',

    // ImageInputPanel (Legacy)
    createWithAI: 'Crear con IA',
    uploadPhoto: 'Subir / Foto',
    imageBatch: 'Lote de Imágenes',
    clearAll: 'Limpiar Todo',
    selectVendor: 'Vendedor',

    // ActionPanel
    step1Title: 'Paso 1: Detectar y Etiquetar',
    step2Title: 'Paso 2: Generar Máscaras',
    step3Title: 'Paso 3: Revisar',
    promptPlaceholderItems: 'objetos',
    promptPlaceholderFeatures: 'características clave',
    promptPlaceholderObjects: 'todos los objetos',
    thingsToIgnore: 'Cosas para ignorar...',
    buttonDetectAndTag: 'Detectar y Etiquetar',
    buttonGenerate: 'Generar Máscaras',
    processing: 'Procesando...',
    skip: 'Omitir',
    editMasks: 'Editar Máscaras',
    noMasksToEdit: 'No se generaron máscaras para editar.',
    finishAndReview: 'Finalizar y Revisar',
    ignoreFollowing: 'Ignora lo siguiente',

    // AI Prompts
    detectAndTagPromptPrefix: 'Detecta y etiqueta',
    detectAndTagPromptSuffix:
      '. Emite un único objeto JSON con dos claves: "boxes" y "points". La clave "boxes" debe ser una lista donde cada entrada tiene "box_2d" y "label". La clave "points" debe ser una lista donde cada entrada tiene "point" (en formato [y,x] normalizado a 1000) y "label".',
    generateMaskPromptPrefix: 'Dame las máscaras de segmentación para',
    generateMaskPromptSuffix:
      '. Emite una lista JSON de máscaras de segmentación donde cada entrada contiene "box_2d", "mask" (como cadena base64) y "label".',

    // ExtraModeControls
    exportPNG: 'Exportar PNG',
    exporting: 'Exportando...',
    exportSVG: 'Exportar SVG',
    savingSVG: 'Guardando SVG...',
    cancelEdit: 'Cancelar',
    saveChanges: 'Guardar Cambios',
    selectMaskToEdit: 'Seleccionar Máscara para Editar:',
    maskLabel: 'Máscara',
    maskSavedSuccess:
      'Máscara guardada. Analizando detalles del artículo con IA...',

    // DetailsPanel
    createNewItem: 'Crear Nuevo Artículo',
    reviewDetails: 'Revisar Detalles',
    itemDetails: 'Detalles del Artículo',
    saveItemToSheet: 'Guardar en la Hoja',
    saving: 'Guardando...',
    saveFailed: 'El guardado falló:',
    itemSavedSuccess: '¡Artículo guardado con éxito!',
    autofillLoading: 'La IA está analizando los detalles del artículo...',
    autofillSuccess: '¡Autocompletado por IA finalizado!',
    autofillError: 'El autocompletado por IA falló:',
    editItem: 'Editar Artículo',
    deleteItem: 'Eliminar Artículo',
    deleteConfirm: (itemName: string) =>
      `¿Estás seguro de que quieres eliminar permanentemente "${itemName}"? Esta acción no se puede deshacer.`,
    deleteSuccess: 'Artículo eliminado.',
    deleteError: 'Error al eliminar el artículo:',

    // InventoryForm
    aiSuggestions: 'Sugerencias de la IA',
    details: 'Detalles',
    formID: 'ID',
    formItemNum: 'Núm',
    formDate: 'Fecha',
    formShape: 'Forma',
    formMaterial: 'Mat',
    formDescription: 'Desc',
    formWeight: 'Peso',
    formHeight: 'AL',
    formWidth: 'AN',
    formLength: 'LA',
    formPrice: 'Precio',
    formQuantity: 'Cant',
    pickFromPic: 'Elegir de Foto',
    generateGradient: 'Generar de Máscara',
    generateGradientError: 'No se pudo generar el gradiente.',
    noMasksForGradient:
      'No se encontraron máscaras guardadas para este artículo.',
    brightness: 'Brillo',
    temperature: 'Temperatura',
    saturation: 'Saturación',

    // InventoryImages / Panel
    searchPlaceholder: 'Buscar...',
    loadingInventory: 'Cargando inventario...',
    noInventoryFound: 'No se encontraron artículos en el inventario.',
    select: 'Seleccionar',
    clear: 'Limpiar',
    batchActions: 'Acciones en Lote',

    // Login
    welcome: 'Bienvenido de Nuevo',
    signInPrompt: 'Inicia sesión para continuar a Onyx.mx.',
    selectProfilePrompt: 'Selecciona tu perfil',
    enterPinPrompt: 'Ingresa tu PIN de 5 dígitos',
    incorrectPin: 'PIN Incorrecto',

    // Admin
    deleteDatabaseContents: 'BORRAR CONTENIDO DE LA BASE DE DATOS',
    resetDatabaseConfirm:
      '¿Estás seguro de que quieres eliminar permanentemente TODOS los datos del inventario? Esta acción no se puede deshacer.',

    // Toasts
    pngExportSuccess: '¡PNG descargado!',
    pngExportError: 'La exportación de PNG falló:',
    svgExportSuccess: '¡SVG descargado!',
    svgExportError: 'La exportación de SVG falló:',
    noMasksToExport: 'No hay máscaras seleccionadas para exportar.',
    gradientExtracted: '¡Gradiente extraído!',
    gradientError: 'No se pudo auto-extraer el color.',

    // Batch Actions Modal
    batchActionsTitle: (count: number) => `Acciones en Lote para ${count} Artículo${count > 1 ? 's' : ''}`,
    batchActionsPrompt: 'Selecciona una o más acciones para aplicar a todos los artículos seleccionados.',
    start: 'Iniciar',
    deleteItems: 'Eliminar Artículos',
  },
};