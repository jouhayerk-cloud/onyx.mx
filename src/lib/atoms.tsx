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
export const themeAtom = atomWithStorage<string>('appTheme', 'obsidian');
export const performanceModeAtom = atomWithStorage<boolean>('performanceMode', true);
export const exchangeRateAtom = atomWithStorage<number>('exchangeRate', 18.0);

export const workflowStepAtom = atom<
  | 'idle'
  | 'processing'
  | 'fullscreenEdit'
  | 'formReview'
  | 'fastEntry'
  | 'fastEntryPendingUpload'
  | 'voiceEntryPendingUpload'
  | 'voiceEntry'
>('idle');

export const ImageSrcAtom = atomWithStorage<string | null>('imageSrc', null);
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
export const activeSubMenuAtom = atom<string | null>('catalog');
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
export const activeViewAtom = atom<'create' | 'inventory' | 'logistics' | 'finance' | 'upload' | 'control' | 'dashboard' | 'overview' | 'store'>('inventory');
export const createViewActiveTabAtom = atom<'new' | 'voice' | 'batch' | 'video' | 'videoBatch' | 'batchEntry'>('new');
export const inventoryStatusFilterAtom = atom<'All' | 'Available' | 'Production' | 'Acquisition'>('All');
export const inventoryViewModeAtom = atomWithStorage<'grid' | 'list'>('inventoryViewMode', 'list');
export const showFinancialsAtom = atomWithStorage<boolean>('showFinancials', true);
export const logisticsSubTabAtom = atom<'packing' | 'trucking' | 'shipping'>('packing');
export const financeSubTabAtom = atom<'payments' | 'tracking' | 'expenses'>('payments');
export const isDashboardOpenAtom = atom(false);
export const isCatalogViewOpenAtom = atom(false);
export const catalogMarketViewModeAtom = atom<'catalog' | 'market'>('catalog');
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
export const dashboardActiveTabAtom = atom<'acquisitions' | 'payments' | 'shipping'>('acquisitions');
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
export const dispersalStatusFilterAtom = atom<'Requested' | 'Sent' | 'Dispersed' | 'All'>('All');
export type PaymentsOverviewMode = 'extended' | 'minimal' | 'collapsed';
export const paymentsOverviewModeAtom = atom<PaymentsOverviewMode>('extended');
export const liveExchangeRateAtom = atom<number | null>(null);
export const dashboardExpDataAtom = atom<Record<string, any[]>>({});
export const is3DViewerOpenAtom = atom(false);
export const is3DWorkspaceOpenAtom = atom(false);
export const is3DWorkspaceInventoryOpenAtom = atom(true);
export const is3DWorkspaceDetailsOpenAtom = atom(false);
export const inventoryAtom = atom<InventoryItem[]>([]);
export const inventorySearchTermAtom = atom('');
export const inventoryActiveFilterAtom = atom('All');
export const filteredInventoryCountAtom = atom(0);
export const storeShoppingBagAtom = atom<any[]>([]);
export const storeActiveUserAtom = atom<string | null>(null); // To view someone's store
export const workbookVersionAtom = atom<'825' | '326'>('825');
export const workbookSearchTermAtom = atom('');
export const storeSearchTermAtom = atom('');

export const filtersPanelOpenAtom = atom<boolean>(false);
export const workbookSelectedItemsAtom = atom<Set<string>>(new Set<string>());
export const workbookActiveTabAtom = atom<'inventory' | 'archive' | 'finance' | 'production' | 'logistics' | 'database'>('inventory');
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
