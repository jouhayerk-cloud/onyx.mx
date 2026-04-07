9/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { colors } from './consts';

import {
  BoundingBox2DType,
  BoundingBoxMaskType,
  CameraView,
  Crate,
  InventoryItem,
  InventoryItemData,
  PaymentDestination,
  PointingType,
  UploadedFile,
} from './Types';

export type UserRole = 'Developer' | 'Admin' | 'Client' | 'Vendor';

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
export const exchangeRateAtom = atomWithStorage<number>('exchangeRate', 18.0);
export type CurrencyMode = 'MXN' | 'USD';
export const currencyModeAtom = atomWithStorage<CurrencyMode>('currencyMode', 'MXN');

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
export const sidebarStateAtom = atomWithStorage<SidebarState>('sidebarState', 'expanded');
export const isUploadWizardOpenAtom = atom<boolean>(false);

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
);
export const SelectedItemDataAtom = atomWithStorage<InventoryItemData | null>(
  'selectedItemData',
  null,
);

export const isInventoryPanelOpenAtom = atom(true);
export const InventoryVersionAtom = atom(0);
export const IsImageGeneratorPanelOpenAtom = atom(false);
export const editingMaskIndexAtom = atom(null as number | null);
export const editedMaskPointsAtom = atom(
  null as { x: number; y: number }[] | null,
);
export const imageDimensionsAtom = atom({ width: 1, height: 1 });
export const activeSubMenuAtom = atomWithStorage<string | null>('activeSubMenu', 'catalog');

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

export const activeViewAtom = atomWithStorage<'create' | 'inventory' | 'logistics' | 'packing' | 'finance' | 'upload' | 'control' | 'dashboard' | 'overview' | 'store' | 'process' | 'viewer'>('activeView', 'inventory');
export const createViewActiveTabAtom = atom<'new' | 'voice' | 'batch' | 'video' | 'videoBatch' | 'batchEntry'>('new');
export const inventoryStatusFilterAtom = atomWithStorage<'All' | 'Partial' | 'Requested' | 'Paid' | 'Production' | 'Acquired' | 'New'>('inventoryStatusFilter', 'All');
export const inventorySortKeyAtom = atomWithStorage<'Date' | 'Vendor' | 'Status' | 'Number' | 'Shape+Type' | 'Color+Material'>('inventorySortKey', 'Date');
export const inventorySortOrderAtom = atomWithStorage<'asc' | 'desc'>('inventorySortOrder', 'desc');
export const inventoryCategoryFilterAtom = atomWithStorage<string>('inventoryCategoryFilter', 'All');
export const isInventoryCategoryFilterOpenAtom = atom<boolean>(false);
export const inventoryMaterialFilterAtom = atomWithStorage<string>('inventoryMaterialFilter', 'All');
export const isInventoryMaterialFilterOpenAtom = atom<boolean>(false);
export const isInventorySortMenuOpenAtom = atom<boolean>(false);
export const inventoryViewModeAtom = atomWithStorage<'grid' | 'list' | 'gallery'>('inventoryViewMode', 'list');
export const showFinancialsAtom = atomWithStorage<boolean>('showFinancials', true);
export const logisticsSubTabAtom = atomWithStorage<'crates' | 'packing' | 'shipping'>('logisticsSubTab', 'crates');
export const financeSubTabAtom = atomWithStorage<'payments' | 'tracking' | 'expenses'>('financeSubTab', 'payments');
export const isDashboardOpenAtom = atom(false);
export const isCatalogViewOpenAtom = atom(false);
export const catalogMarketViewModeAtom = atomWithStorage<'catalog' | 'market'>('catalogMarketViewMode', 'catalog');
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

export const dashboardActiveTabAtom = atomWithStorage<'acquisitions' | 'payments' | 'shipping'>('dashboardActiveTab', 'acquisitions');
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
export type PaymentCategory = 'All' | 'ACQ' | 'PROD' | 'MONTHLY' | 'SPPL' | 'LABR' | 'PACK' | 'OPRT';
export const paymentCategoryFilterAtom = atom<PaymentCategory>('All');
export const isPaymentCategoryFilterOpenAtom = atom<boolean>(false);
export const paymentFilterBarModeAtom = atom<'left' | 'right' | 'off'>('right');


export const dashboardExpDataAtom = atom<Record<string, any[]>>({});

export const is3DViewerOpenAtom = atom(false);
export const is3DWorkspaceOpenAtom = atom(false);
export const is3DWorkspaceInventoryOpenAtom = atom(true);
export const is3DWorkspaceDetailsOpenAtom = atom(false);

export const inventoryAtom = atom<InventoryItem[]>([]);
export const inventorySearchTermAtom = atom('');
export const inventoryActiveFilterAtom = atom('All');
export const filteredInventoryCountAtom = atom(0);
export const filteredInventoryIdsAtom = atom<(string | number)[]>([]);
export const isInventorySelectionModeAtom = atom<boolean>(false);
export const selectedInventoryIdsAtom = atom<(string | number)[]>([]);
export const activeVendorsAtom = atom<string[]>([]);

export const storeInventoryAtom = atom<any[]>([]);
export const storeShoppingBagAtom = atom<any[]>([]);
export const storeActiveUserAtom = atom<string | null>(null); // To view someone's store
export const isDummyModeAtom = atom<boolean>(false);

export const workbookVersionAtom = atom<'825' | '326'>('825');
export const workbookSearchTermAtom = atom('');
export const storeSearchTermAtom = atom('');
export const storeActiveVendorFilterAtom = atomWithStorage<string>('storeActiveVendorFilter', 'All');
export const storeViewModeAtom = atomWithStorage<'grid' | 'gallery' | 'list'>('storeViewMode', 'grid');
export const storeVendorOptionsAtom = atom((get) => {
  const inventory = get(storeInventoryAtom);
  const detected = new Set<string>();
  inventory.forEach(item => {
    const d = item.data || {};
    // Extract vendor prefix (priority: vendor_id > item prefix)
    const rawId = d.vendor_id || d.vendorId || item.label || d.itemId || d.item_id || d.tag_id || '';
    const prefixId = (typeof rawId === 'string' && rawId.length >= 2) ? rawId.substring(0, 2).toUpperCase() : '';
    if (prefixId) detected.add(prefixId);
  });
  return ['All', ...Array.from(detected).sort()];
});

export const filtersPanelOpenAtom = atom<boolean>(false);
export const workbookSelectedItemsAtom = atom<Set<string>>(new Set<string>());
export const workbookActiveTabAtom = atomWithStorage<'inventory' | 'archive' | 'finance' | 'production' | 'logistics' | 'database'>('workbookActiveTab', 'inventory');
export const workbookViewModeAtom = atomWithStorage<'table' | 'gallery' | 'kanban'>('workbookViewMode', 'table');
export const workbookDensityAtom = atomWithStorage<'compact' | 'comfortable'>('workbookDensity', 'compact');
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
export const isInventoryVendorFilterOpenAtom = atomWithStorage<boolean>('invVendorFilter', false);
export const inventoryVendorFilterAtom = atomWithStorage<string>('inventoryVendorFilter', 'All');
export const isInventoryFiltersPanelOpenAtom = atomWithStorage<boolean>('invFiltersPanel', false);
export const isInventoryStatusFilterOpenAtom = atomWithStorage<boolean>('invStatusFilter', false);
export const isPaymentsSearchOpenAtom = atom<boolean>(false);
export const isPaymentsDestFilterOpenAtom = atom<boolean>(false);
export const isPaymentsDispFilterOpenAtom = atom<boolean>(false);
export const isPaymentsAddPanelOpenAtom = atom<boolean>(false);
export const isPaymentsDetailOpenAtom = atomWithStorage<boolean>('paymentsDetail', false);
export const paymentsSearchTermAtom = atom<string>('');
export const isStoreBagOpenAtom = atom<boolean>(false);
export const controlPanelAtom = atomWithStorage<'users' | 'db' | 'store'>('controlPanel', 'users');
export const TOP_BAR_SEARCH_ATOM = atom<string>('');

// Process Module Atoms
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
};
export const inventoryArtifactConfigAtom = atom<InventoryArtifactConfig>({
  isOpen: false,
  itemIds: [],
  title: 'Inventory Artifact',
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
export const viewerSearchQueryAtom = atomWithStorage<string>('viewerSearchQuery', '');
export const tagIdAtom = atom<string | null, [string | null], void>(null, (get, set, update) => set(tagIdAtom, update));
const getInitialUniversalView = (): 'app' | 'tag' | 'viewer' => {
  if (typeof window === 'undefined') return 'app';
  const params = new URLSearchParams(window.location.search);
  if (params.get('tagid') || params.get('tagID')) return 'tag';
  if (params.get('viewer') === 'true' || window.location.hash.includes('viewer')) return 'viewer';
  return 'app';
};
export const universalViewAtom = atom<'app' | 'tag' | 'viewer', ['app' | 'tag' | 'viewer'], void>(getInitialUniversalView(), (get, set, update) => set(universalViewAtom, update));
