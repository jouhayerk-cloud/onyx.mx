/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
const sessionJSONStorage = createJSONStorage<any>(() => sessionStorage);
import { colors } from './consts';
export { inventoryStatusSetsAtom } from './inventoryStatusAtom';

import {
  BoundingBox2DType,
// Atom Registry Reload
  BoundingBoxMaskType,
  CameraView,
  Crate,
  InventoryItem,
  InventoryItemData,
  PaymentDestination,
  PointingType,
  UploadedFile,
} from './Types';

export type UserRole = 'Developer' | 'Admin' | 'ClientBoss' | 'ClientAccounting' | 'ClientViewer' | 'Vendor';

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
export const userAtom = atomWithStorage<User | null>('userSession', null);
export const languageAtom = atomWithStorage<'en' | 'es'>('appLanguage', 'en');
export const themeAtom = atomWithStorage<string>('appTheme', 'talan');
export const performanceModeAtom = atomWithStorage<boolean>('performanceMode_v2', true);
export const exchangeRateAtom = atomWithStorage<number>('exchangeRate', 17.0);
export type CurrencyMode = 'MXN' | 'USD';
export const currencyModeAtom = atomWithStorage<CurrencyMode>('currencyMode', 'MXN');

// ── Offline / Sync State ─────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'pending';
export interface SyncProgress {
    phase: 'push' | 'pull';
    done: number;
    total: number;
    label: string;
}
export const isOfflineModeAtom = atomWithStorage<boolean>('offlineMode', false);
export const syncStatusAtom = atom<SyncStatus>('idle');
export const syncQueueCountAtom = atom<number>(0);
export const lastSyncedAtAtom = atomWithStorage<string | null>('lastSyncedAt', null);
export const syncProgressAtom = atom<SyncProgress | null>(null);
// ────────────────────────────────────────────────────────────────────────────

export const workflowStepAtom = atom<
  | 'idle'
  | 'processing'
  | 'fullscreenEdit'
  | 'fullscreenView'
  | 'formReview'
  | 'fastEntry'
  | 'fastEntryPendingUpload'
  | 'voiceEntryPendingUpload'
  | 'voiceEntry'
>('idle');

export const ImageSrcAtom = atomWithStorage<string | null>('imageSrc', null);
export const ActiveGalleryMediaAtom = atom<string[]>([]);
export const ActiveGalleryIndexAtom = atom<number>(0);
export const IsUploadedImageAtom = atomWithStorage<boolean>(
  'isUploadedImage',
  false,
);

export const allAnnotationDataAtom = atom<{
  boxes: BoundingBox2DType[];
  masks: BoundingBoxMaskType[];
  points: PointingType[];
}>({ boxes: [], masks: [], points: [] });

export const BoundingBoxes2DAtom = atom(
  (get) => get(allAnnotationDataAtom).boxes,
  (get, set, update: BoundingBox2DType[]) =>
    set(allAnnotationDataAtom, (prev) => ({ ...prev, boxes: update })),
);

export const BoundingBoxMasksAtom = atom(
  (get) => get(allAnnotationDataAtom).masks,
  (get, set, update: BoundingBoxMaskType[]) =>
    set(allAnnotationDataAtom, (prev) => ({ ...prev, masks: update })),
);

export const PointsAtom = atom(
  (get) => get(allAnnotationDataAtom).points,
  (get, set, update: PointingType[]) =>
    set(allAnnotationDataAtom, (prev) => ({ ...prev, points: update })),
);

export type SidebarState = 'expanded' | 'compact' | 'hidden';
export const sidebarStateAtom = atomWithStorage<SidebarState>('sidebarState', 'expanded', sessionJSONStorage);
export const isUploadWizardOpenAtom = atom<boolean>(false);

// Studio Settings Portal
export type StudioSettingsViewMode = 'settings' | 'about';
export const isStudioSettingsOpenAtom = atom<boolean>(false);
export const studioSettingsViewModeAtom = atom<StudioSettingsViewMode>('settings');

export interface SharedToast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'loading' | 'default';
    timestamp: number;
}
export const sharedToastAtom = atomWithStorage<SharedToast | null>('sharedToast', null);

export const SelectedMasksAtom = atomWithStorage<number[]>(
  'selectedMasks',
  [],
);
export const selectedBoxesAtom = atom<number[]>([]);
export const selectedPointsAtom = atom<number[]>([]);

export const ShareStreamAtom = atom(null as MediaStream | null);
export const VideoRefAtom = atom<{ current: HTMLVideoElement | null }>({
  current: null,
});
export const InitFinishedAtom = atom(true);
export const IsLoadingAtom = atom(false);
export const SelectedItemRowAtom = atomWithStorage<number | string | null>(
  'selectedItemRow',
  null,
  sessionJSONStorage
);
export const SelectedItemDataAtom = atomWithStorage<InventoryItemData | null>(
  'selectedItemData',
  null,
  sessionJSONStorage
);

export const isInventoryPanelOpenAtom = atom(true);
export const InventoryVersionAtom = atom(0);
export const IsImageGeneratorPanelOpenAtom = atom(false);
export const editingMaskIndexAtom = atom(null as number | null);
export const editedMaskPointsAtom = atom(
  null as { x: number; y: number }[] | null,
);
export const imageDimensionsAtom = atom({ width: 1, height: 1 });
export const activeSubMenuAtom = atomWithStorage<string | null>('activeSubMenu', 'catalog', sessionJSONStorage);

export const isEditingMaskAtom = atom(
  (get) => get(editingMaskIndexAtom) !== null,
);
export const editorZoomAtom = atom(1);
export const editorPanOffsetAtom = atom<{ x: number; y: number }>({ x: 0, y: 0 });
export const selectedPointsIndicesAtom = atom<number[]>([]);
export const isPanningAtom = atom(false);
export const draggingPointInfoAtom = atom<{
  startPoints: { x: number; y: number }[] | null;
}>({ startPoints: null });

export const creationGalleryFilesAtom = atom<UploadedFile[]>([]);
export const creationGalleryIndexAtom = atom(0);
export const triggerFileUploadAtom = atom(0);
export const triggerAiAutofillAtom = atom(0);
export const newItemGeneratedFilesAtom = atom<{
  pngData: string | null;
  svgData: string | null;
}>({ pngData: null, svgData: null });
export const creationVendorIdAtom = atom(null as string | null);

export const isDetailsPanelOpenAtom = atom(false);
export const detailsPanelModeAtom = atom<'view' | 'create' | 'edit' | 'market'>('view');
export const detailsPanelDataAtom = atom(null as Partial<InventoryItemData> | null);
export const detailsPanelFilesAtom = atom(null as UploadedFile[] | null);

export const isBottomPanelCollapsedAtom = atom(false);

export const ActiveColorAtom = atom(colors[6]);

export const isCatalogBatchSelectModeAtom = atom(false);
export const catalogBatchSelectedItemsAtom = atom<(number | string)[]>([]); // stores item row numbers
export const isBatchActionsModalOpenAtom = atom(false);
export const batchActionItemsDataAtom = atom<InventoryItem[]>([]);

export const isMarketMultiSelectModeAtom = atom(false);
export const marketMultiSelectItemsAtom = atom<InventoryItem[]>([]);

export const activeViewAtom = atomWithStorage<'create' | 'inventory' | 'logistics' | 'warehouse' | 'trucking' | 'packing' | 'finance' | 'upload' | 'control' | 'dashboard' | 'overview' | 'store' | 'process' | 'viewer' | 'welcome' | 'onyx'>('activeView', 'welcome', sessionJSONStorage);
export const onyxMessagesAtom = atom<any[]>([]);
export const onyxIsListeningAtom = atom<boolean>(false);
export const onyxIsTypingAtom = atom<boolean>(false);
export const onyxApiKeyAtom = atomWithStorage<string>('onyxApiKey', '');
export const isBotOrbOpenAtom = atom<boolean>(false);
export const showFinancialsAtom = atomWithStorage<boolean>('showFinancials', true);
export const createViewActiveTabAtom = atom<'new' | 'voice' | 'batch' | 'video' | 'videoBatch' | 'batchEntry'>('new');
export const inventoryStatusFilterAtom = atomWithStorage<'All' | 'Partial' | 'Requested' | 'Paid' | 'Production' | 'Acquired' | 'New' | 'Shipped' | 'Packed' | 'Not Packed' | 'Not Shipped'>('inventoryStatusFilter', 'All', sessionJSONStorage);
export const inventorySortKeyAtom = atomWithStorage<'Date' | 'Vendor' | 'Status' | 'Number' | 'Shape+Type' | 'Color+Material' | 'Value' | 'Qty'>('inventorySortKey', 'Date', sessionJSONStorage);
export const inventorySortOrderAtom = atomWithStorage<'asc' | 'desc'>('inventorySortOrder', 'desc', sessionJSONStorage);
export const inventoryCategoryFilterAtom = atomWithStorage<string>('inventoryCategoryFilter', 'All', sessionJSONStorage);
export const isInventoryCategoryFilterOpenAtom = atom<boolean>(false);
export const inventoryMaterialFilterAtom = atomWithStorage<string>('inventoryMaterialFilter', 'All', sessionJSONStorage);
export const isInventoryMaterialFilterOpenAtom = atom<boolean>(false);
export const isInventorySortMenuOpenAtom = atom<boolean>(false);
export const inventoryViewModeAtom = atomWithStorage<'grid' | 'list' | 'gallery'>('inventoryViewMode', 'list', sessionJSONStorage);
export const inventoryViewSliderAtom = atomWithStorage<number>('inventoryViewSlider', 0, sessionJSONStorage);
export const isInventoryViewSliderOpenAtom = atom<boolean>(false);
export const logisticsSubTabAtom = atomWithStorage<'empty' | 'packed' | 'boxes' | 'packing' | 'shipping' | 'deployed' | 'crates'>('logisticsSubTab', 'empty', sessionJSONStorage);
export const isCrateCreationModalOpenAtom = atom<boolean>(false);
export const financeSubTabAtom = atomWithStorage<'overview' | 'payments' | 'tracking' | 'expenses'>('financeSubTab', 'overview', sessionJSONStorage);
export const isFinanceScrolledAtom = atom(false);
export const financeTotalsAtom = atom({ 
    queueLength: 0, 
    queueMxn: 0, 
    upcomingLength: 0, 
    upcomingMxn: 0,
    pendingGroups: [] as any[]
});
export const isDashboardOpenAtom = atom(false);
export const isCatalogViewOpenAtom = atom(false);
export const catalogMarketViewModeAtom = atomWithStorage<'catalog' | 'market'>('catalogMarketViewMode', 'catalog', sessionJSONStorage);
export const isShippingOpenAtom = atom(false);
export const marketActiveTabAtom = atom<'description' | 'images'>('images');

export const uploadTabAtom = atom<'entry' | 'ai'>('entry');
export const uploadSelectedMediaTypeAtom = atom<string | null, [string | null], void>(
  null,
  (get, set, update: string | null) => {
    set(uploadSelectedMediaTypeAtom, update);
  }
);
export const uploadMediaFilesAtom = atom<UploadedFile[]>([]);
export const uploadItemDataAtom = atom<Partial<InventoryItemData> & {
  quantity?: string;
  color?: string;
  material?: string;
  shape?: string;
  itemType?: string;
  itemNumber?: string;
  weightKg?: string;
  widthCm?: string;
  heightCm?: string;
  lengthCm?: string;
  mediaType?: string;
}>({});

export const uploadCurrentStepAtom = atom<'media' | 'details' | 'review'>('media');

export const dashboardActiveTabAtom = atomWithStorage<'acquisitions' | 'payments' | 'shipping'>('dashboardActiveTab', 'acquisitions', sessionJSONStorage);
export const acquisitionsVersionAtom = atom(0);
export const paymentsVersionAtom = atom(0);
export const withdrawalsVersionAtom = atom(0);
export const recurringVersionAtom = atom(0);
export const invoicesVersionAtom = atom(0);
export const cratesVersionAtom = atom(0);
export const isDashboardStatsVisibleAtom = atom(false);
export const dashboardSearchTermAtom = atom('');
export type TrafficLightStatus = 'ALL' | 'RED' | 'YELLOW' | 'GREEN';
export const dashboardStatusFilterAtom = atom<TrafficLightStatus>('ALL');
export const paymentDestinationFilterAtom = atom<'All' | PaymentDestination>('All');
export const paymentBankFilterAtom = atom<'All' | 'Ramses BBVA' | 'Martha BBVA' | 'BOA' | 'Direct Client Wire'>('All');
export const paymentVendorFilterAtom = atom<string>('All');
export const isPaymentVendorFilterOpenAtom = atom<boolean>(false);
export const isPaymentDestinationFilterOpenAtom = atom<boolean>(false);
export const dispersalStatusFilterAtom = atom<'Requested' | 'Sent' | 'Dispersed' | 'All'>('All');
export type PaymentsOverviewMode = 'extended' | 'minimal' | 'collapsed';
export const paymentsOverviewModeAtom = atom<PaymentsOverviewMode>('collapsed');
export const liveExchangeRateAtom = atom<number | null>(null);
export const financeSearchTermAtom = atom('');
export type PaymentCategory = 'All' | 'Acq' | 'Prod' | 'Monthly' | 'Sppl' | 'Labr' | 'Packing' | 'Oprt';
export const paymentCategoryFilterAtom = atom<PaymentCategory>('All');
export const isPaymentCategoryFilterOpenAtom = atom<boolean>(false);
export const paymentFilterBarModeAtom = atom<'left' | 'right' | 'off'>('right');
export type PaymentStatusFilter = 'All' | 'Paid' | 'Requested';
export const paymentStatusFilterAtom = atom<PaymentStatusFilter>('All');
export const isPaymentFiltersOpenAtom = atom<boolean>(false);
export const isPaymentActionPanelOpenAtom = atom<boolean>(false);
export const isPaymentQueueOpenAtom = atomWithStorage('isPaymentQueueOpen', true, sessionJSONStorage);
export const isPaymentUpcomingOpenAtom = atomWithStorage('isPaymentUpcomingOpen', true, sessionJSONStorage);
export const isPaymentPendingBarOpenAtom = atomWithStorage('isPaymentPendingBarOpen', true, sessionJSONStorage);


export const dashboardExpDataAtom = atom<Record<string, any[]>>({});

export const is3DViewerOpenAtom = atom(false);
export const is3DWorkspaceOpenAtom = atom(false);
export const is3DWorkspaceInventoryOpenAtom = atom(true);
export const is3DWorkspaceDetailsOpenAtom = atom(false);

export const inventoryAtom = atom<InventoryItem[]>([]);
export const inventorySearchTermAtom = atom('');
export const TOP_BAR_SEARCH_ATOM = atom('');
export const isInventorySearchOpenAtom = atom(false);
export const inventoryActiveFilterAtom = atom('All');
export const filteredInventoryCountAtom = atom(0);
export const filteredInventoryTotalQtyAtom = atom(0);
export const filteredInventoryTotalValueAtom = atom(0);
export const filteredInventoryIdsAtom = atom<(string | number)[]>([]);
export const isInventorySelectionModeAtom = atom<boolean>(false);
export const selectedInventoryIdsAtom = atom<(string | number)[]>([]);
export const isStoreSelectionModeAtom = atom<boolean>(false);
export const selectedStoreIdsAtom = atom<string[]>([]);
export const isWarehouseSelectionModeAtom = atom<boolean>(false);
export const warehouseSelectedIdsAtom = atom<Set<string>>(new Set<string>());
export const showWarehouseExportWizardAtom = atom<boolean>(false);
export const activeVendorsAtom = atom<string[]>([]);

export const storeInventoryAtom = atom<any[]>([]);
export const storeShoppingBagAtom = atom<any[]>([]);
export const storeActiveUserAtom = atom<string | null>(null); // To view someone's store
export const isDummyModeAtom = atom<boolean>(false);

export const workbookVersionAtom = atom<'825' | '326'>('825');
export const workbookSearchTermAtom = atom('');
export const storeSearchTermAtom = atom('');
export const storeActiveVendorFilterAtom = atomWithStorage<string>('storeActiveVendorFilter', 'All', sessionJSONStorage);
export const storeViewModeAtom = atomWithStorage<'grid' | 'gallery' | 'list'>('storeViewMode', 'grid', sessionJSONStorage);
export const storeVendorOptionsAtom = atom((get) => {
  const inventory = get(storeInventoryAtom);
  const detected = new Set<string>();
  inventory.forEach(item => {
    const d = item.data || {};
    // Only detect vendors for available items
    if (d.status === 'Available') {
      const rawId = d.vendor_id || d.vendorId || item.label || d.itemId || d.item_id || d.tag_id || '';
      const prefixId = (typeof rawId === 'string' && rawId.length >= 2) ? rawId.substring(0, 2).toUpperCase() : '';
      if (prefixId) detected.add(prefixId);
    }
  });
  return ['All', ...Array.from(detected).sort()];
});

export const filtersPanelOpenAtom = atom<boolean>(false);
export const workbookSelectedItemsAtom = atom<Set<string>>(new Set<string>());
export const workbookActiveTabAtom = atomWithStorage<'inventory' | 'archive' | 'finance' | 'production' | 'logistics' | 'database'>('workbookActiveTab', 'inventory', sessionJSONStorage);
export const workbookViewModeAtom = atomWithStorage<'table' | 'gallery' | 'kanban'>('workbookViewMode', 'table', sessionJSONStorage);
export const workbookDensityAtom = atomWithStorage<'compact' | 'comfortable'>('workbookDensity', 'compact', sessionJSONStorage);
export const workbookMetricScopeAtom = atom<'all' | 'filtered'>('all');
export const workbookAtom = atom(null as any);
export const workbookActiveSheetAtom = atom<string>('');
export const workbookDataAtom = atom<{ data: any[], sheetName: string }[]>([]);
export const workbookPropertiesDataAtom = atom<{ sheetName: string, data: any[] }[]>([]); // For -v* sheets
export const workbookShippingLogsAtom = atom<{ sheetName: string, data: any[] }[]>([]); // For -TRK* sheets
export const workbookBookVDataAtom = atom(null as any);

export const workbookLogDataAtom = atom([] as any[]);
export const workbookProductionDataAtom = atom([] as any[]);
export const workbookSuppliesDataAtom = atom([] as any[]);
export const workbookCratesFileDataAtom = atom([] as any[]);
export const workbookPayLogDataAtom = atom([] as any[]);

export const financeDataAtom = atom([] as any[]);
export const logisticsDataAtom = atom([] as any[]);

/** True until the first inventory batch arrives from DataSyncProvider.
 *  Modules can use this instead of local isLoading state for initial skeletons. */
export const isSyncingAtom = atom<boolean>(true);


export const shippingViewModeAtom = atom<'warehouse' | 'truck'>('warehouse');
export const shippingCameraViewAtom = atom<CameraView>('perspective');
export const shippingTruckDimsAtom = atom({ length: 13.6, width: 2.45, height: 2.7 });
export const WAREHOUSE_DIMS = atom({ width: 10, depth: 30 });
export const truckMaxWeightAtom = atom(24000); // kg


export const shippingCratesAtom = atom([] as Crate[]);
export const selectedCrateIdAtom = atom(null as string | null);
export const isShippingSidebarCollapsedAtom = atom(false);
export const areCrateInfoLabelsVisibleAtom = atom(true);
export const triggerWarehouseOrganizationAtom = atom(0);
export const truckViewSelectedWarehouseCrateIdAtom = atom(null as string | null);
export const tempCratePositionAtom = atom(null as { x: number; y: number; z: number } | null);
export const shippingSelectedInventoryItemIdsAtom = atom([] as (number | string)[]);

export const workbookShippingCratesAtom = atom([] as Crate[]);
export const workbookSelectedCrateIdAtom = atom(null as string | null);
export const workbookShippingViewModeAtom = atom<'warehouse' | 'truck'>('warehouse');
export const workbookShippingCameraViewAtom = atom<CameraView>('perspective');
export const workbookIsShippingSidebarCollapsedAtom = atom(false);
export const workbookAreCrateInfoLabelsVisibleAtom = atom(true);
export const workbookTriggerWarehouseOrganizationAtom = atom(0);
export const workbookTruckViewSelectedWarehouseCrateIdAtom = atom(null as string | null);
export const workbookTempCratePositionAtom = atom(null as { x: number; y: number; z: number } | null);
export const workbookCratesVersionAtom = atom(0);


export type Notification = {
  id: number;
  type: 'success' | 'error' | 'warning' | 'notice' | 'loading';
  message: string;
};
export const notificationsAtom = atom<Notification[]>([]);

// Top-bar deployable panel states
export const isInventoryVendorFilterOpenAtom = atomWithStorage<boolean>('invVendorFilter', false, sessionJSONStorage);
export const inventoryVendorFilterAtom = atomWithStorage<string[]>('inventoryVendorFilter', ['All'], sessionJSONStorage);
export const isInventoryFiltersPanelOpenAtom = atomWithStorage<boolean>('invFiltersPanel', false, sessionJSONStorage);
export const isInventoryStatusFilterOpenAtom = atomWithStorage<boolean>('invStatusFilter', false, sessionJSONStorage);
export const isPaymentsSearchOpenAtom = atom<boolean>(false);
export const isPaymentsDestFilterOpenAtom = atom<boolean>(false);
export const isPaymentsDispFilterOpenAtom = atom<boolean>(false);
export const isPaymentsAddPanelOpenAtom = atom<boolean>(false);
export const isPaymentsDetailOpenAtom = atomWithStorage<boolean>('paymentsDetail', false, sessionJSONStorage);
export const paymentsSearchTermAtom = atom<string>('');
export const isStoreBagOpenAtom = atom<boolean>(false);
export const controlPanelAtom = atomWithStorage<'users' | 'db' | 'store'>('controlPanel', 'users', sessionJSONStorage);

// Process Module Atoms
export const processActiveTabAtom = atom<'workspace' | 'vault' | 'batch'>('workspace');
export const processToolAtom = atom<'move' | 'mask' | 'point'>('move');
export const processShowTerminalAtom = atom<boolean>(false);
export const processShowVaultAtom = atom<boolean>(false);
export const processShowBatchListAtom = atom<boolean>(false);
export const processTriggerAnalyzeAtom = atom<number>(0);
export const processTriggerBatchAtom = atom<number>(0);
export const processActiveStepLabelAtom = atom<string>('ENGINE READY');
export const processIsProcessingAtom = atom<boolean>(false);
export const processLogsAtom = atom<{ id: string, msg: string, time: string, type: 'info' | 'error' | 'success' | 'warn' }[]>([]);
// Inventory Artifact Atom
export type InventoryArtifactConfig = {
  isOpen: boolean;
  itemIds: (string | number)[];
  title?: string;
  viewMode?: 'modal' | 'sidebar' | 'embedded';
  displayMode?: 'list' | 'grid' | 'gallery';
};
export const inventoryArtifactConfigAtom = atom<InventoryArtifactConfig>({
  isOpen: false,
  itemIds: [],
  title: 'Inventory Artifact',
  viewMode: 'modal',
  displayMode: 'gallery'
});

// Payments Artifact Atom
export type PaymentsArtifactConfig = {
  isOpen: boolean;
  vendor?: string;
  date?: string;
  itemIds?: (string | number)[];
  paymentIds?: string[];
  paymentType?: string;
  destination?: string;
  status?: string;
  title?: string;
};
export const paymentsArtifactConfigAtom = atom<PaymentsArtifactConfig>({
  isOpen: false,
  title: 'Payments Artifact',
});

// Viewer & Artifact Atoms
export const viewerSearchQueryAtom = atomWithStorage<string>('viewerSearchQuery', '', sessionJSONStorage);
export const tagIdAtom = atom<string | null, [string | null], void>(
  typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('tagid') || new URLSearchParams(window.location.search).get('tagID')) : null, 
  (get, set, update) => set(tagIdAtom, update)
);
export const sentTruckIdAtom = atom<string | null>(
  typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('truckid') || new URLSearchParams(window.location.search).get('manifestid')) : null
);

const getInitialUniversalView = (): 'app' | 'tag' | 'viewer' | 'truck' => {
  if (typeof window === 'undefined') return 'app';
  const params = new URLSearchParams(window.location.search);
  if (params.get('truckid') || params.get('manifestid')) return 'truck';
  if (params.get('tagid') || params.get('tagID')) return 'tag';
  if (params.get('viewer') === 'true' || window.location.hash.includes('viewer')) return 'viewer';
  return 'app';
};
export const universalViewAtom = atom<'app' | 'tag' | 'viewer' | 'truck', ['app' | 'tag' | 'viewer' | 'truck'], void>(getInitialUniversalView(), (get, set, update) => set(universalViewAtom, update));

// Packing Module Atoms
export const packingViewModeAtom = atomWithStorage<'grid' | 'list'>('packingViewMode', 'list');
export const packingVendorFilterAtom = atomWithStorage<string | null>('packingVendorFilter', null);
export const packingLabelSizeAtom = atomWithStorage<'40x30' | '50x30' | '50x50' | '50x80'>('packingLabelSize', '50x30');
export const packingSortKeyAtom = atomWithStorage<'Date' | 'Status' | 'Vendor' | '#'>('packingSortKey', 'Date');
export const packingSortOrderAtom = atomWithStorage<'asc' | 'desc'>('packingSortOrder', 'asc');
export const packingSelectedIdsAtom = atomWithStorage<Set<string>>('packingSelectedIds', new Set<string>(), {
  getItem: (key, initialValue) => {
    const saved = localStorage.getItem(key);
    try {
      return saved ? new Set(JSON.parse(saved) as string[]) : initialValue;
    } catch {
      return initialValue;
    }
  },
  setItem: (key, value) => {
    localStorage.setItem(key, JSON.stringify(Array.from(value)));
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
  },
});

export interface CrateSeparator {
    id: string;
    y: number; // height in cm
    label?: string;
}

export interface PackingItemPosition {
    x: number;
    y: number;
    z: number;
    rotation: number;
    isFlipped: boolean;
}

export const crateSeparatorsAtom = atomWithStorage<Record<string, CrateSeparator[]>>('crateSeparators', {});
export const crateItemPositionsAtom = atomWithStorage<Record<string, Record<string, PackingItemPosition>>>('crateItemPositions', {});

export const isPackingPrintWizardOpenAtom = atom<boolean>(false);
export const packingExportPDFTriggerAtom = atom<number>(0);
export const packingExportXLSXTriggerAtom = atom<number>(0);
export const packingExportJSONTriggerAtom = atom<number>(0);
export const inventoryExportSelectedXLSXTriggerAtom = atom<number>(0);
export const isPackingFiltersOpenAtom = atom<boolean>(false);
export const isPackingNFCWizardOpenAtom = atom<boolean>(false);
export const isPackingCrateWizardOpenAtom = atom<boolean>(false);
export const isCratePackingManagerOpenAtom = atom<boolean>(false);
export const packingManagerTargetCrateIdAtom = atom<string | null>(null);
export const isPaymentWizardOpenAtom = atom<boolean>(false);

// Trucking Module Atoms
export const truckReadyTriggerAtom = atom<number>(0); // increment to fire Ready Truck workflow
export const truckIsBusyAtom = atom<boolean>(false);  // true while handleReadyTruck is running
export const truckViewModeAtom = atom<'top' | 'side' | 'iso'>('top'); // trailer view: top-down, lateral, or iso
export const truckIsCompactAtom = atom<boolean>(false);       // compact dock/info panels
export const truckShowSaveDraftAtom = atom<boolean>(false);   // open Save Draft modal
export const truckShowOpenDraftAtom = atom<boolean>(false);   // open Load Drafts modal
export const truckShowExportModalAtom = atom<boolean>(false); // open Exportation wizard
export const truckShowReadyWizardAtom = atom<boolean>(false);   // open Ready Truck wizard
export const truckTopBarStateAtom = atom<'crates' | 'trailers' | 'deployed'>('crates'); // toggle between loading, history, and deployed crates
export const truckShowPanelsAtom = atomWithStorage('truck_show_panels', true); // SHOW or HIDE all controls panels
export const truckDockIsCompactAtom = atomWithStorage('truck_dock_is_compact', false);
export const truckStatsIsCompactAtom = atomWithStorage('truck_stats_is_compact', false);

export const logisticsDocsAtom = atom<any[]>([]);
export const truckingPositionsAtom = atomWithStorage<Record<string, any>>('truckingPositions', {});
export const truckingSelectedIdAtom = atom<string | null>(null);
export const truckingReadyFieldsAtom = atomWithStorage<any>('truckingReadyFields', {
    manifestId: '',
    tractorNumber: '',
    trailerNumber: '',
    sealNumber: '',
    driverName: '',
    truckPlates: '',
    trailerPlates: '',
    carrier: '',
    senders: ['ONYX CORE'],
    packingItems: [],
    destination: '326',
    notes: ''
});
export const truckingRecalledShipmentAtom = atom<any>(null);
export const truckingZoomAtom = atom<number>(1);

// Derived Trucking Stats
export const truckingAllCratesAtom = atom((get) => {
    const docs = get(logisticsDocsAtom);
    const recalled = get(truckingRecalledShipmentAtom);
    const live = docs.filter(d => {
        const s = (d.status || '').toLowerCase().trim();
        return ['packed', 'partial', 'in transit', 'deployed'].includes(s);
    });
    
    if (recalled) {
        const payload = typeof recalled.payload === 'string' ? JSON.parse(recalled.payload) : recalled.payload;
        const recalledCrates = (payload?.crates || []).filter((rc: any) => !live.some(l => l.id === rc.id));
        const virtual = recalledCrates.map((rc: any) => ({
            id: rc.id,
            type: rc.h > 40 ? 'crate' : 'pallet',
            status: 'In Transit',
            width_cm: rc.w,
            length_cm: rc.l,
            height_cm: rc.h,
            inventory_ids: (rc.items || []).map((i: any) => `${i.itemId}:${i.qty}`).join(','),
            description: `RECALLED: ${rc.label || rc.id}`,
            isVirtual: true
        }));
        return [...live, ...virtual];
    }
    return live;
});

export const truckingDockCratesAtom = atom((get) => {
    const all = get(truckingAllCratesAtom);
    const pos = get(truckingPositionsAtom);
    return all.filter(c => !pos[c.id] && !c.parent_id && ['packed', 'partial'].includes((c.status || '').toLowerCase().trim()));
});

export const truckingTruckCratesAtom = atom((get) => {
    const all = get(truckingAllCratesAtom);
    const pos = get(truckingPositionsAtom);
    return all.filter(c => !!pos[c.id]);
});

export const truckingTotalWeightAtom = atom((get) => {
    const truckCrates = get(truckingTruckCratesAtom);
    const allInventory = get(inventoryAtom);
    const allCrates = get(truckingAllCratesAtom);
    // We need to import computeCrateWeight or move it to a shared place. 
    // Since it's in TruckingModule, we might have a circular dependency if we import it here.
    // For now, let's just use a simplified version or assume it's passed.
    // Actually, let's move computeCrateWeight to utils.tsx or a new shared file.
    return truckCrates.reduce((s, c) => s + (c.weight_kg || 0), 0); 
});

export const TRUCK_L_CM = 1615;
export const TRUCK_W_CM = 244;

export const truckingFloorPctAtom = atom((get) => {
    const truckCrates = get(truckingTruckCratesAtom);
    const pos = get(truckingPositionsAtom);
    const totalArea = truckCrates.reduce((s, c) => {
        const p = pos[c.id];
        if (!p) return s;
        return s + (c.width_cm * c.length_cm);
    }, 0);
    return Math.min(100, Math.round((totalArea / (TRUCK_L_CM * TRUCK_W_CM)) * 100));
});

export const onyxRequestSendAtom = atom(0);

export const isBatchWizardOpenAtom = atom<boolean>(false);
export const batchWizardItemsAtom = atom<any[]>([]);
