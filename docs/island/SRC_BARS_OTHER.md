# Source of the other modules top bar controls (extracted from src/features/core/MainHeader.tsx)

Script-extracted, verbatim, with MainHeader.tsx line numbers. First the import block (every atom, icon and helper name), then each bar component.

## Import block (lines 1-112)
```ts
1: import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
2: import type { InventoryItemData } from '../../lib/Types';
3: // Navigation Modernization - Atomic Sync Force
4: import React, { useState, useMemo, useEffect } from 'react';
5: import { createPortal } from 'react-dom';
6: import {
7:     activeViewAtom,
8:     inventoryAtom,
9:     inventoryActiveFilterAtom,
10:     inventorySearchTermAtom,
11:     TOP_BAR_SEARCH_ATOM,
12:     inventoryStatusFilterAtom,
13:     showFinancialsAtom,
14:     dashboardStatusFilterAtom,
15:     dashboardSearchTermAtom,
16:     userAtom,
17:     isDetailsPanelOpenAtom,
18:     SelectedItemDataAtom,
19:     TrafficLightStatus,
20:     logisticsSubTabAtom,
21:     financeSubTabAtom,
22:     uploadItemDataAtom,
23:     shippingCameraViewAtom,
24:     shippingCratesAtom,
25:     shippingTruckDimsAtom,
26:     truckMaxWeightAtom,
27:     shippingViewModeAtom,
28:     sidebarStateAtom,
29:     triggerWarehouseOrganizationAtom,
30:     exchangeRateAtom,
31:     InventoryVersionAtom,
32:     inventoryViewModeAtom,
33:     filteredInventoryCountAtom,
34:     filteredInventoryTotalQtyAtom,
35:     filteredInventoryTotalValueAtom,
36:     filteredInventoryIdsAtom,
37:     inventoryArtifactConfigAtom,
38:     financeDataAtom,
39:     isUploadWizardOpenAtom,
40:     languageAtom,
41:     themeAtom,
42:     performanceModeAtom,
43:     paymentsOverviewModeAtom,
44:     paymentDestinationFilterAtom,
45:     liveExchangeRateAtom,
46:     currencyModeAtom,
47:     logisticsDataAtom,
48:     storeSearchTermAtom,
49:     storeActiveVendorFilterAtom,
50:     storeViewModeAtom,
51:     storeVendorOptionsAtom,
52:     storeShoppingBagAtom,
53:     isStoreBagOpenAtom,
54:     activeVendorsAtom,
55:     inventoryVendorFilterAtom,
56:     isInventoryVendorFilterOpenAtom,
57:     isInventoryFiltersPanelOpenAtom,
58:     isInventoryViewSliderOpenAtom,
59:     isInventorySelectionModeAtom,
60:     selectedInventoryIdsAtom,
61:     inventoryViewSliderAtom,
62:     isInventorySearchOpenAtom,
63:     isInventorySortMenuOpenAtom,
64:     inventoryExportSelectedXLSXTriggerAtom,
65:     financeSearchTermAtom,
66:     paymentVendorFilterAtom,
67:     isPaymentVendorFilterOpenAtom,
68:     isPaymentDestinationFilterOpenAtom,
69:     paymentCategoryFilterAtom,
70:     isPaymentCategoryFilterOpenAtom,
71:     PaymentCategory,
72:     paymentFilterBarModeAtom,
73:     processActiveTabAtom,
74:     packingViewModeAtom,
75:     packingVendorFilterAtom,
76:     packingLabelSizeAtom,
77:     isPackingPrintWizardOpenAtom,
78:     packingExportPDFTriggerAtom,
79:     packingExportXLSXTriggerAtom,
80:     packingExportJSONTriggerAtom,
81:     isPackingFiltersOpenAtom,
82:     isPackingNFCWizardOpenAtom,
83:     truckReadyTriggerAtom,
84:     truckIsBusyAtom,
85:     truckViewModeAtom,
86:     truckShowSaveDraftAtom,
87:     truckShowOpenDraftAtom,
88:     truckShowExportModalAtom,
89:     truckShowReadyWizardAtom,
90:     truckShowPanelsAtom,
91:     packingSelectedIdsAtom,
92:     isStudioSettingsOpenAtom,
93:     isPaymentsSearchOpenAtom,
94:     isPaymentFiltersOpenAtom,
95:     isPaymentActionPanelOpenAtom,
96:     isPaymentUpcomingOpenAtom,
97:     isPaymentWizardOpenAtom,
98:     isCrateCreationModalOpenAtom,
99:     isBotOrbOpenAtom,
100:     sentTruckIdAtom,
101:     onyxApiKeyAtom,
102:     isWarehouseSelectionModeAtom,
103:     warehouseSelectedIdsAtom,
104:     showWarehouseExportWizardAtom,
105:     visibleWorkbooksAtom,
106:     inventoryToolsOpenAtom,
107:     isInventorySmartFiltersOpenAtom
108: } from '../../lib/atoms';
109: import { isAiProcessingEnabledAtom } from '../../lib/atoms';
110: import { WORKBOOK_IDS, type WorkbookId } from '../../lib/seasons';
111: // Consolidated imports to prevent duplicates
112: 
```

## OnyxBar (lines 113-170)
```tsx
113: const OnyxBar: React.FC = () => null;
114: 
115: import { vendors , DEFAULT_EXCHANGE_RATE} from '../../lib/consts';
116: import { missingShopifyFields, SHOPIFY_REQUIRED_FIELDS, type ShopifyField } from '../../lib/aiContent';
117: import { calculateCodesAndPrices, normalizeInventoryData, collectAllImages, collectExportImages, getProductCategoryAndType, isAllowedProductType, formatProductTitle, normalizeBrandTerms, formatDimensionsImperial, formatWeightImperial, formatDimensionsMetricOnly, formatDimensionsImperialOnly, formatWeightMetricOnly, formatWeightImperialOnly, getStatusClass, getCleanImageUrl, toDriveDownloadUrl, syncAllCalculatedFieldsToDB } from '../../lib/utils';
118: import { getStoneStyleColors, generateFallbackMarketingHtml, ALLOWED_SHOPIFY_COLORS } from '../../lib/colorExtractor';
119: import { lookupCanonicalColors } from '../../lib/colorVocabulary';
120: import { inventoryStatusSetsAtom } from '../../lib/inventoryStatusAtom';
121: import { destinationsConfig } from '../../lib/paymentConfig';
122: import { useTranslation, useLogout, useDatabase } from '../../lib/hooks';
123: 
124: import { CameraView } from '../../lib/Types';
125: import ExcelJS from 'exceljs';
126: import { getStatusColor, getCategoryColor, getVendorColor, getContrastColor, EXCEL_STYLES } from '../../lib/excelStyles';
127: import { sanitizeExcelRow } from '../../lib/xlsxUtils';
128: import { saveAs } from 'file-saver';
129: import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
130: import toast from '../onyxIsland/notify/toast';
131: import userIcons from '../../components/userIcons';
132: import { supabase } from '../../lib/supabase';
133: 
134: import {
135:     ArrowUpDown, ArrowUp, ArrowDown, Share2, Copy, ExternalLink, Layout, ShoppingBag,
136:     CreditCard, Truck, Upload, Shield, Search, RefreshCw, LogOut, LayoutGrid, 
137:     LayoutDashboard, List, Bookmark, Sun, Moon, Layers, Camera, Zap, Settings, 
138:     Download, DownloadCloud, Filter, ArrowUpRight, Check, X, ChevronRight, 
139:     ChevronLeft, Plus, Trash2, Grid, FileText, Database, Calendar, DollarSign, 
140:     Globe, Languages, Cpu, Clock, ArrowRight, Lock, Unlock, Printer,
141:     Landmark, Wallet, Play, Store, Package, MapPin, LayoutList,
142:     Target, Library, FolderKanban, FileJson, FileSpreadsheet, Nfc, ListFilter,
143:     Grid3x3, PanelTop, PanelTopClose, FolderOpen, Save, SlidersHorizontal, Archive,
144:     PackagePlus, Boxes, PackageOpen, History, Bot, Brain, Hourglass, SquareLibrary, Activity, FolderUp, DatabaseBackup, CloudUpload,
145:     Wrench, ClipboardClock, LayoutTemplate, Tag, Pointer, QrCode, Table,
146:     PanelLeftOpen
147: } from 'lucide-react';
148: 
149: // ⚡ Dynamic import — themes-assets.ts is 878KB of base64 images.
150: // Loading it asynchronously prevents it from blocking the initial JS parse.
151: // The swatch images are non-critical (shown in the settings sidebar only).
152: 
153: import { ShoppingBagDrawer } from '../store/ShoppingBagDrawer';
154: import { tr } from '../../lib/i18n';
155: import { IslandBand } from '../onyxIsland/IslandBand';
156: import { ArchivedBar, ArchivedReadout } from '../archived/ArchivedChrome';
157: import { ArchivedToolsRegistrar } from '../archived/archivedTools';
158: import { InventoryToolsRegistrar } from './inventoryTools';
159: import { islandCommandsEnabledAtom, useRegisterTools } from '../../lib/toolRegistry';
160: import { StoreToolsRegistrar } from '../store/storeTools';
161: import { FinanceToolsRegistrar } from '../finance/financeTools';
162: import { LogisticsToolsRegistrar, logisticsReadout } from '../logistics/logisticsTools';
163: import { PackingToolsRegistrar } from '../logistics/packingTools';
164: import { ProcessToolsRegistrar } from '../process/processTools';
165: import { UploadToolsRegistrar } from '../upload/uploadTools';
166: import { ControlToolsRegistrar } from '../control/controlTools';
167: import { MiscViewToolsRouter } from './miscViewTools';
168: import { PrintToolsRegistrar } from '../print/printTools';
169: 
170: // logisticsReadout() is a hook (it reads the crate atoms): one small component per side keeps it unconditional
```

## SubTabPills (lines 460-486)
```tsx
460: const SubTabPills: React.FC<{
461:     tabs: { id: string; label: string; icon?: string }[];
462:     active: string;
463:     onSelect: (id: string) => void;
464:     accentColor?: string;
465: }> = ({ tabs, active, onSelect, accentColor = 'var(--main-color)' }) => (
466:     <div className="flex items-end gap-1">
467:         {tabs.map(t => {
468:             const TabIcon = t.icon ? iconToLucide[t.icon] : null;
469:             return (
470:                 <div key={t.id} className="tool-cell flex flex-col items-center gap-1 shrink-0">
471:                     <button onClick={() => onSelect(t.id)}
472:                         aria-pressed={active === t.id}
473:                         title={t.label}
474:                         className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none"
475:                         style={active === t.id ? { color: accentColor } : {}}>
476:                         {TabIcon ? <TabIcon size={18} strokeWidth={2.2} /> : <span className="text-[10px] font-black">{t.label}</span>}
477:                     </button>
478:                     {TabIcon && (
479:                         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">{t.label}</span>
480:                     )}
481:                 </div>
482:             );
483:         })}
484:     </div>
485: );
486: 
```

## StudioAction (lines 487-510)
```tsx
487: const StudioAction: React.FC<{
488:     icon: any;
489:     label: string;
490:     onClick: () => void;
491:     active?: boolean;
492:     title?: string;
493:     color?: string;
494:     disabled?: boolean;
495:     className?: string;
496: }> = ({ icon: Icon, label, onClick, active, title, color = 'var(--main-color)', disabled, className = "" }) => (
497:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
498:         <button
499:             onClick={onClick}
500:             disabled={disabled}
501:             title={title || label}
502:             aria-pressed={active}
503:             className={`tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none disabled:opacity-30 disabled:pointer-events-none ${className}`}
504:         >
505:             <Icon size={18} strokeWidth={2.2} style={{ color: active ? color : undefined }} />
506:         </button>
507:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">{label}</span>
508:     </div>
509: );
510: 
```

## ModuleBadge (lines 552-560)
```tsx
552: const ModuleBadge: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => {
553:     const BadgeIcon = iconToLucide[icon] || Store;
554:     return (
555:         <div className="hidden sm:flex items-center gap-4 pr-6 border-r border-white/5 shrink-0 truncate">
556:             <BadgeIcon size={32} strokeWidth={2} style={{ color }} />
557:         </div>
558:     );
559: };
560: 
```

## ShippingStats (lines 561-601)
```tsx
561: const ShippingStats: React.FC = () => {
562:     const crates = useAtomValue(shippingCratesAtom);
563:     const truckDims = useAtomValue(shippingTruckDimsAtom);
564:     const maxWeight = useAtomValue(truckMaxWeightAtom);
565:     const loaded = crates.filter(c => c.location === 'truck');
566:     const weight = loaded.reduce((s, c) => s + c.weight, 0);
567:     const pct = Math.min(100, Math.round((weight / maxWeight) * 100));
568:     const vol = loaded.reduce((s, c) => s + c.w * c.h * c.d, 0);
569:     const truckVol = truckDims.length * truckDims.width * truckDims.height;
570:     const volPct = truckVol > 0 ? Math.round((vol / truckVol) * 100) : 0;
571: 
572:     return (
573:         <div className="hidden lg:flex items-center gap-6 text-[12px] font-mono text-(--text-color)/40">
574:             <span className="flex items-center gap-2"><span className="text-(--text-color)/70 font-black text-sm">{loaded.length}</span> crates</span>
575:             <div className="flex items-center gap-2.5">
576:                 <div className="w-24 h-2 bg-(--text-color)/10 rounded-full overflow-hidden">
577:                     <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
578:                 </div>
579:                 <span>{pct}{tr("% wt")}</span>
580:             </div>
581:             <div className="flex items-center gap-1.5">
582:                 <div className="w-20 h-1.5 bg-(--text-color)/10 rounded-full overflow-hidden">
583:                     <div className="h-full bg-[#6BCEBB] rounded-full transition-all" style={{ width: `${volPct}%` }} />
584:                 </div>
585:                 <span>{volPct}{tr("% vol")}</span>
586:             </div>
587:         </div>
588:     );
589: };
590: 
591: 
592: /**
593:  * The info notch: a readout indented into the top-centre edge of the header,
594:  * the way an instrument is let into a panel rather than sitting on it.
595:  *
596:  * It absorbed two controls that used to be separate buttons. Pressing the
597:  * figures runs the database sync — the readout is what that sync updates, so
598:  * the number you want refreshed is the thing you press. The user block moved
599:  * in beside it and still opens Settings; it stops the notch from being a bare
600:  * strip of digits and gives the right half of it a purpose.
601:  */
```

## ToolButton (lines 707-732)
```tsx
707: const ToolButton: React.FC<{
708:     icon: any;
709:     label: string;
710:     onClick: () => void;
711:     active?: boolean;
712:     title?: string;
713:     disabled?: boolean;
714:     tone?: string;
715: }> = ({ icon: Icon, label, onClick, active, title, disabled, tone }) => (
716:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
717:         <button
718:             onClick={onClick}
719:             disabled={disabled}
720:             aria-pressed={active}
721:             title={title || label}
722:             className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
723:             style={active && tone ? { color: tone } : undefined}
724:         >
725:             <Icon size={18} strokeWidth={2.2} />
726:         </button>
727:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">
728:             {label}
729:         </span>
730:     </div>
731: );
732: 
```

## StoreBar (lines 925-987)
```tsx
925: const StoreBar: React.FC = () => {
926:     const [search, setSearch] = useAtom(storeSearchTermAtom);
927:     const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
928:     const vendorOptions = useAtomValue(storeVendorOptionsAtom);
929:     const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
930:     const [isSearchOpen, setIsSearchOpen] = useState(false);
931: 
932:     return (
933:         <div className={`flex flex-1 items-center gap-1 shrink-0 min-w-max ${isSearchOpen ? '' : 'sm:gap-2'}`}>
934:             <DeployableSearch 
935:                 value={search} 
936:                 onChange={setSearch} 
937:                 isOpen={isSearchOpen} 
938:                 setIsOpen={setIsSearchOpen} 
939:                 accentColor="var(--color-store)"
940:                 placeholder={tr("FIND ON STORE...")}
941:             />
942: 
943:             {!isSearchOpen && (
944:                 <>
945:                     <div className="flex items-center gap-1.5 py-1 pr-2 border-r border-white/5 mr-1 shrink-0">
946:                         {vendorOptions.map(v => {
947:                             const vColor = vendors[v as keyof typeof vendors]?.color || 'var(--text-color)';
948:                             const isActive = vendorFilter === v;
949:                             return (
950:                                 <button
951:                                     key={v}
952:                                     onClick={() => setVendorFilter(v)}
953:                                     className={`shrink-0 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.2em] transition-all border
954:                                         ${isActive 
955:                                             ? 'text-black shadow-lg' 
956:                                             : 'bg-white/3 border-white/3 text-(--text-color)/30 hover:text-(--text-color) hover:bg-white/10'}`}
957:                                     style={{ 
958:                                         borderColor: isActive ? vColor : (v !== 'All' ? `${vColor}40` : ''),
959:                                         backgroundColor: isActive ? vColor : '',
960:                                         color: isActive ? 'black' : (v !== 'All' ? vColor : '')
961:                                     }}
962:                                 >
963:                                     {v}
964:                                 </button>
965:                             );
966:                         })}
967:                     </div>
968: 
969:                     <div className="flex items-center gap-0.5 px-2">
970:                         <StudioAction 
971:                             icon={viewMode === 'grid' ? LayoutGrid : viewMode === 'gallery' ? Layout : LayoutList}
972:                             label={viewMode.toUpperCase()}
973:                             active={true}
974:                             onClick={() => {
975:                                 const modes: ('grid' | 'gallery' | 'list')[] = ['grid', 'gallery', 'list'];
976:                                 const nextIdx = (modes.indexOf(viewMode) + 1) % modes.length;
977:                                 setViewMode(modes[nextIdx]);
978:                             }}
979:                             color="var(--color-store)"
980:                         />
981:                     </div>
982:                 </>
983:             )}
984:         </div>
985:     );
986: };
987: 
```

## FinanceBar (lines 988-1045)
```tsx
988: const FinanceBar: React.FC = () => {
989:     const [search, setSearch] = useAtom(financeSearchTermAtom);
990:     const [isSearchOpen, setIsSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
991:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
992:     const [isActionOpen, setIsActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
993:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
994:     const toggleCurrency = () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN');
995:     const [isUpcomingOpen, setIsUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
996: 
997:     return (
998:         <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
999:             <button 
1000:                 onClick={() => setIsSearchOpen(!isSearchOpen)}
1001:                 className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isSearchOpen || search ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
1002:                 title={tr("Search Payments")}
1003:             >
1004:                 <Search size={32} strokeWidth={2} />
1005:             </button>
1006: 
1007:             <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
1008:                 <button 
1009:                     onClick={() => setIsFiltersOpen(!isFiltersOpen)}
1010:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isFiltersOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
1011:                     title={tr("Filter Payments")}
1012:                 >
1013:                     <Filter size={32} strokeWidth={2} />
1014:                 </button>
1015:                 <button 
1016:                     onClick={() => setIsActionOpen(!isActionOpen)}
1017:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isActionOpen ? 'text-(--color-finance) drop-shadow-[0_0_10px_rgba(var(--color-finance-rgb),0.5)]' : 'text-white/50 hover:text-white'}`}
1018:                     title={tr("Settings & Logic")}
1019:                 >
1020:                     <SlidersHorizontal size={32} strokeWidth={2} />
1021:                 </button>
1022: 
1023:                 <button 
1024:                     onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
1025:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isUpcomingOpen ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-white/50 hover:text-white'}`}
1026:                     title={tr("Upcoming Payments")}
1027:                 >
1028:                     <Hourglass size={32} strokeWidth={2} className={isUpcomingOpen ? 'animate-pulse' : ''} />
1029:                 </button>
1030: 
1031:                 <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />
1032: 
1033:                 <button 
1034:                     onClick={toggleCurrency}
1035:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 text-white/50 hover:text-white`}
1036:                     title={`Switch to ${currencyMode === 'MXN' ? 'USD' : 'MXN'}`}
1037:                 >
1038:                     <DollarSign size={32} strokeWidth={2} className={currencyMode === 'USD' ? 'text-emerald-400' : 'text-sky-400'} />
1039:                 </button>
1040:             </div>
1041:         </div>
1042:     );
1043: };
1044: 
1045: 
```

## LogisticsBar (lines 1046-1246)
```tsx
1046: const LogisticsBar: React.FC = () => {
1047:     const [activeView] = useAtom(activeViewAtom);
1048:     const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
1049:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1050:     const [isSearchOpen, setIsSearchOpen] = useState(false);
1051:     const [isPackingFiltersOpen, setIsPackingFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1052:     const setTruckReady = useSetAtom(truckReadyTriggerAtom);
1053:     const truckBusy = useAtomValue(truckIsBusyAtom);
1054:     const [truckView, setTruckView] = useAtom(truckViewModeAtom);
1055:     const [showPanels, setShowPanels] = useAtom(truckShowPanelsAtom);
1056:     const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
1057:     const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
1058:     const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
1059:     const setShowReadyWizard = useSetAtom(truckShowReadyWizardAtom);
1060: 
1061:     const setIsCrateModalOpen = useSetAtom(isCrateCreationModalOpenAtom);
1062:     const [isWarehouseSearchOpen, setIsWarehouseSearchOpen] = useState(false);
1063:     
1064:     const [isWarehouseSelectionMode, setIsWarehouseSelectionMode] = useAtom(isWarehouseSelectionModeAtom);
1065:     const warehouseSelectedIds = useAtomValue(warehouseSelectedIdsAtom);
1066:     const setShowWarehouseExportWizard = useSetAtom(showWarehouseExportWizardAtom);
1067: 
1068:     useEffect(() => {
1069:         if (activeView === 'warehouse' && (subTab === 'crates' || !['empty', 'packed', 'boxes', 'packing'].includes(subTab))) {
1070:             setSubTab('empty');
1071:         }
1072:     }, [activeView, subTab, setSubTab]);
1073: 
1074:     const tabs = activeView === 'warehouse' ? [
1075:         { id: 'empty', label: 'Empty', icon: 'package' },
1076:         { id: 'packed', label: 'Packed', icon: 'boxes' },
1077:         { id: 'packing', label: 'Packing', icon: 'package-open' },
1078:     ] : activeView === 'trucking' ? [
1079:         { id: 'shipping', label: 'PLAN', icon: 'truck' },
1080:         { id: 'deployed', label: 'DPLYD', icon: 'history' },
1081:     ] : [
1082:         { id: 'empty', label: 'Empty', icon: 'package' },
1083:         { id: 'packed', label: 'Packed', icon: 'boxes' },
1084:         { id: 'packing', label: 'Packing', icon: 'package-open' },
1085:         { id: 'shipping', label: 'TRK', icon: 'truck' },
1086:     ];
1087: 
1088:     return (
1089:         <div className="relative flex flex-1 items-center gap-1 sm:gap-4 ml-1">
1090:             {(activeView !== 'warehouse' && activeView !== 'trucking') && (
1091:                 <DeployableSearch 
1092:                     value={search} 
1093:                     onChange={setSearch} 
1094:                     isOpen={isSearchOpen} 
1095:                     setIsOpen={setIsSearchOpen} 
1096:                     accentColor="var(--color-logistics)"
1097:                     placeholder={tr("FIND CRATES...")}
1098:                 />
1099:             )}
1100: 
1101:             {(!isSearchOpen || activeView === 'warehouse' || activeView === 'trucking') && (
1102:                 <div className="flex items-center gap-4 animate-in fade-in duration-300">
1103:                     <SubTabPills
1104:                         tabs={tabs}
1105:                         active={subTab}
1106:                         onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
1107:                         accentColor="var(--color-logistics)"
1108:                     />
1109: 
1110:                     {activeView === 'warehouse' && (
1111:                         <>
1112:                             <div className="w-px h-6 bg-white/5 mx-1" />
1113:                             <button 
1114:                                 onClick={() => setIsCrateModalOpen(true)}
1115:                                 className="flex flex-col items-center justify-center w-16 h-16 text-(--main-color) hover:text-white transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/action"
1116:                                 title={tr("Initialize Storage Protocol")}
1117:                             >
1118:                                 <PackagePlus size={32} strokeWidth={2} className="group-hover/action:scale-110 transition-transform mb-1" />
1119:                                 <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("New Unit")}</span>
1120:                             </button>
1121:                             <button 
1122:                                 onClick={() => setIsWarehouseSearchOpen(!isWarehouseSearchOpen)}
1123:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/search ${isWarehouseSearchOpen || search ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1124:                                 title={tr("Search Units")}
1125:                             >
1126:                                 <Search size={32} strokeWidth={2} className="group-hover/search:scale-110 transition-transform mb-1" />
1127:                                 <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("Search")}</span>
1128:                             </button>
1129: 
1130:                             {subTab === 'packed' && (
1131:                                 <>
1132:                                     <div className="w-px h-6 bg-white/5 mx-1" />
1133:                                     <button 
1134:                                         onClick={() => {
1135:                                             if (isWarehouseSelectionMode) {
1136:                                                 // Clear selection when disabling
1137:                                                 setIsWarehouseSelectionMode(false);
1138:                                                 // In a real app we'd also clear the selected ids, but we only have a read-only view of it here.
1139:                                                 // Actually, let's just let the CratesInventoryView clear it if needed, or we can just hide it.
1140:                                             } else {
1141:                                                 setIsWarehouseSelectionMode(true);
1142:                                             }
1143:                                         }}
1144:                                         className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/select ${isWarehouseSelectionMode ? 'text-amber-500' : 'text-white/20 hover:text-white'}`}
1145:                                         title={isWarehouseSelectionMode ? 'Cancel Selection' : 'Select Crates'}
1146:                                     >
1147:                                         <FolderUp size={32} strokeWidth={2} className="group-hover/select:scale-110 transition-transform mb-1" />
1148:                                         <span className="text-[8px] font-black uppercase tracking-widest leading-none">{tr("Select")}</span>
1149:                                     </button>
1150: 
1151:                                     {isWarehouseSelectionMode && warehouseSelectedIds.size > 0 && (
1152:                                         <button 
1153:                                             onClick={() => setShowWarehouseExportWizard(true)}
1154:                                             className="ml-2 flex items-center gap-2 px-6 py-2 rounded-xl transition-all font-black text-[10px] tracking-widest uppercase shadow-xl bg-amber-500 text-black hover:scale-105 active:scale-95 animate-in slide-in-from-left-4"
1155:                                         >
1156:                                             <Download size={24} strokeWidth={3} />
1157:                                             <span>Start Exportation ({warehouseSelectedIds.size})</span>
1158:                                         </button>
1159:                                     )}
1160:                                 </>
1161:                             )}
1162: 
1163:                             {isWarehouseSearchOpen && (
1164:                                 <div className="animate-in slide-in-from-left duration-300">
1165:                                     <DeployableSearch 
1166:                                         value={search} 
1167:                                         onChange={setSearch} 
1168:                                         isOpen={true} 
1169:                                         setIsOpen={setIsWarehouseSearchOpen} 
1170:                                         accentColor="var(--color-logistics)"
1171:                                         placeholder={tr("FIND UNITS...")}
1172:                                     />
1173:                                 </div>
1174:                             )}
1175:                         </>
1176:                     )}
1177: 
1178:                     {subTab === 'packing' && (
1179:                         <>
1180:                             <div className="w-px h-6 bg-white/5 mx-1" />
1181:                             <button 
1182:                                 onClick={() => setIsPackingFiltersOpen(!isPackingFiltersOpen)}
1183:                                 className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isPackingFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1184:                                 title={tr("Configuration")}
1185:                             >
1186:                                 <ListFilter size={32} />
1187:                             </button>
1188:                         </>
1189:                     )}
1190: 
1191:                     {(subTab === 'shipping' || subTab === 'deployed') && (
1192:                         <>
1193:                             <div className="w-px h-6 bg-white/5 mx-1" />
1194:                             <button
1195:                                 onClick={() => setShowPanels(s => !s)}
1196:                                 title={showPanels ? 'Hide all panels' : 'Show all panels'}
1197:                                 className={`flex items-center justify-center w-12 h-12 transition-all cursor-pointer rounded-2xl hover:bg-white/5 ${showPanels ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1198:                             >
1199:                                 {showPanels ? <PanelTopClose size={32} /> : <PanelTop size={32} />}
1200:                             </button>
1201:                         </>
1202:                     )}
1203: 
1204:                     {activeView === 'trucking' && (
1205:                         <>
1206:                             <div className="flex items-center gap-2 px-4 border-l border-white/5">
1207:                                 <button onClick={() => setShowOpenDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group" title={tr("Load Draft")}>
1208:                                     <Archive size={22} className="group-hover:scale-110 transition-transform" />
1209:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Drafts")}</span>
1210:                                 </button>
1211:                                 <button onClick={() => setShowSaveDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group px-2" title={tr("Save Draft")}>
1212:                                     <Save size={22} className="group-hover:scale-110 transition-transform" />
1213:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Save")}</span>
1214:                                 </button>
1215:                                 <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 text-white/30 hover:text-(--main-color) transition-all group pr-2" title={tr("Export Manifest")}>
1216:                                     <SlidersHorizontal size={22} className="group-hover:scale-110 transition-transform" />
1217:                                     <span className="text-[9px] font-black uppercase tracking-widest hidden lg:block">{tr("Export")}</span>
1218:                                 </button>
1219:                                 <button 
1220:                                     disabled={truckBusy} 
1221:                                     onClick={() => setShowReadyWizard(true)} 
1222:                                     className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all font-black text-[9px] tracking-widest uppercase shadow-xl
1223:                                         ${truckBusy ? 'bg-white/5 text-white/20' : 'bg-(--main-color) text-black hover:scale-105 active:scale-95'}`}
1224:                                 >
1225:                                     {truckBusy ? <Activity size={22} className="animate-spin" /> : <Truck size={22} strokeWidth={3} />}
1226:                                     <span className="hidden sm:block">{truckBusy ? tr("Processing...") : tr("Ready Truck")}</span>
1227:                                 </button>
1228:                             </div>
1229: 
1230:                             <div className="w-px h-6 bg-white/5 mx-1" />
1231:                             <button
1232:                                 onClick={() => setSubTab('crates')}
1233:                                 title={tr("Deployed Crates Library")}
1234:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer rounded-2xl hover:bg-white/5 group/library ${subTab === 'crates' ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1235:                             >
1236:                                 <SquareLibrary size={32} strokeWidth={1.5} className="group-hover/library:scale-110 transition-transform" />
1237:                                 <span className="text-[7px] font-black tracking-widest mt-1 opacity-40 group-hover/library:opacity-100 uppercase">{tr("Library")}</span>
1238:                             </button>
1239:                         </>
1240:                     )}
1241:                 </div>
1242:             )}
1243:         </div>
1244:     );
1245: };
1246: 
```

## PackingBar (lines 1247-1322)
```tsx
1247: const PackingBar: React.FC = () => {
1248:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1249:     const [isSearchOpen, setIsSearchOpen] = useState(false);
1250:     
1251:     const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
1252:     const [isPrintOpen, setIsPrintOpen] = useAtom(isPackingPrintWizardOpenAtom);
1253:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1254:     const setExportPDF = useSetAtom(packingExportPDFTriggerAtom);
1255:     const setExportXLSX = useSetAtom(packingExportXLSXTriggerAtom);
1256:     const setExportJSON = useSetAtom(packingExportJSONTriggerAtom);
1257:     const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
1258:     const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);
1259: 
1260:     const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : 'list');
1261:     const ViewIcon = viewMode === 'list' ? LayoutList : LayoutGrid;
1262: 
1263:     return (
1264:         <div className="flex flex-1 items-center gap-1 sm:gap-4 ml-1">
1265:             {selectedIds.size > 0 ? (
1266:                 <div className="flex items-center gap-6 animate-in slide-in-from-left duration-500 pr-4 border-r border-white/5 mr-2">
1267:                     <div className="flex flex-col">
1268:                         <span className="text-[10px] font-black uppercase tracking-[0.3em] text-(--main-color) whitespace-nowrap">
1269:                             {selectedIds.size} {tr("ARTIFACTS SELECTED")}
1270:                         </span>
1271:                         <button 
1272:                             onClick={() => setSelectedIds(new Set())} 
1273:                             className="text-[9px] font-bold underline uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity text-left"
1274:                         >
1275:                             {tr("Clear Selection")}
1276:                         </button>
1277:                     </div>
1278:                 </div>
1279:             ) : (
1280:                 <DeployableSearch 
1281:                     value={search} 
1282:                     onChange={setSearch} 
1283:                     isOpen={isSearchOpen} 
1284:                     setIsOpen={setIsSearchOpen} 
1285:                     accentColor="var(--main-color)"
1286:                     placeholder={tr("FIND INVENTORY...")}
1287:                 />
1288:             )}
1289: 
1290:             {!isSearchOpen && (
1291:                 <div className="flex items-center gap-0.5 animate-in fade-in duration-300">
1292:                     <StudioAction 
1293:                         icon={ViewIcon}
1294:                         label={viewMode.toUpperCase()}
1295:                         active={true}
1296:                         onClick={cycleView}
1297:                         title={tr("Toggle View Mode")}
1298:                     />
1299:                     <button 
1300:                         onClick={() => setIsFiltersOpen(!isFiltersOpen)}
1301:                         className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hover:text-white'}`}
1302:                         title={tr("Configuration")}
1303:                     >
1304:                         <ListFilter size={32} />
1305:                     </button>
1306: 
1307:                     <div className="w-px h-5 bg-white/10 mx-2" />
1308: 
1309:                     <StudioAction icon={Printer} label={tr("PRINT")} onClick={() => setIsPrintOpen(true)} title={tr("Generate High-Fidelity Labels")} />
1310:                     <StudioAction icon={QrCode} label="NFC" onClick={() => setIsNFCWizardOpen(true)} title={tr("Hardware Sync Handshake")} />
1311:                     
1312:                     <div className="w-px h-5 bg-white/10 mx-2" />
1313:                     
1314:                     <StudioAction icon={FileText} label="PDF" onClick={() => setExportPDF(1)} title={tr("Export PDF Catalog")} />
1315:                     <StudioAction icon={Table} label="XLSX" onClick={() => setExportXLSX(1)} title={tr("Export Spreadsheet")} />
1316:                     <StudioAction icon={Database} label="JSON" onClick={() => setExportJSON(1)} title={tr("Developer Data Dump")} />
1317:                 </div>
1318:             )}
1319:         </div>
1320:     );
1321: };
1322: 
```

## ProcessBar (lines 1323-1360)
```tsx
1323: const ProcessBar: React.FC = () => {
1324:     const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);
1325:     
1326:     return (
1327:         <div className="flex items-center gap-6 px-4 animate-in fade-in duration-500">
1328:             <button 
1329:                 onClick={() => setActiveTab('workspace')}
1330:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1331:                     ${activeTab === 'workspace' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1332:                 title={tr("Engine Workspace")}
1333:             >
1334:                 <Target size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1335:                 {activeTab === 'workspace' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1336:             </button>
1337:             <button 
1338:                 onClick={() => setActiveTab('vault')}
1339:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1340:                     ${activeTab === 'vault' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1341:                 title={tr("Inventory Vault")}
1342:             >
1343:                 <Library size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1344:                 {activeTab === 'vault' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1345:             </button>
1346:             <button 
1347:                 onClick={() => setActiveTab('batch')}
1348:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
1349:                     ${activeTab === 'batch' ? 'text-amber-400' : 'text-white/30 hover:text-white'}`}
1350:                 title={tr("Batch Telemetry")}
1351:             >
1352:                 <FolderKanban size={32} strokeWidth={1.5} className="group-hover:scale-110 transition-transform" />
1353:                 {activeTab === 'batch' && <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
1354:             </button>
1355:         </div>
1356:     );
1357: };
1358: 
1359: // The Single / Batch switch is the page's own (CreateItem's Segmented); a
1360: // second copy here drove the same atom.
```

## UploadBar (lines 1361-1396)
```tsx
1361: const UploadBar: React.FC = () => {
1362:     const setItemData = useSetAtom(uploadItemDataAtom);
1363:     const [, setUploadWizardOpen] = useAtom(isUploadWizardOpenAtom);
1364:     const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);
1365: 
1366:     // The Add Entry screen as a modal (UploadWizard), on a clean slate. It
1367:     // takes every book; v326 is only the starting choice.
1368:     const openEntryModal = () => {
1369:         setItemData({ vendorId: '', workbook: 'v326' });
1370:         setUploadWizardOpen(true);
1371:     };
1372: 
1373:     return (
1374:         <div className="flex items-center gap-4 w-full">
1375:             <ModuleBadge icon="upload" label={tr("Add Entry")} color="var(--color-upload)" />
1376:             
1377:             <div className="flex items-center gap-1.5 ml-2">
1378:                 <StudioAction 
1379:                     icon={FolderUp}
1380:                     label={tr("Add Entry")}
1381:                     active={false}
1382:                     onClick={openEntryModal}
1383:                 />
1384:                 <div className="w-px h-6 bg-white/10 mx-2" />
1385:                 <StudioAction 
1386:                     icon={Brain}
1387:                     label={tr("AI PROCESSES")}
1388:                     active={aiEnabled}
1389:                     onClick={() => setAiEnabled(!aiEnabled)}
1390:                     color={aiEnabled ? '#38bdf8' : '#777'}
1391:                 />
1392:             </div>
1393:         </div>
1394:     );
1395: };
1396: 
```

## ControlBar (lines 1397-1408)
```tsx
1397: const ControlBar: React.FC = () => (
1398:     <>
1399:         <ModuleBadge icon="shield" label={tr("Control")} color="var(--color-control)" />
1400:         <div className="ml-auto">
1401:             <span className="text-[11px] font-black text-(--text-color)/15 uppercase tracking-widest">{tr("Developer Only")}</span>
1402:         </div>
1403:     </>
1404: );
1405: 
1406: 
1407: export function MainHeader() {
1408:     const [activeView, setView] = useAtom(activeViewAtom);
```

## MainHeader() left cluster: inline blocks per view (lines 4411-4458)
```tsx
4411:                     <div className="flex items-end gap-2 sm:gap-6 flex-nowrap min-w-max pr-4">
4412:                         {activeView === 'inventory' && !islandOn && <InventoryBar />}
4413:                         {!islandOn && activeView === 'store' && <StoreBar />}
4414:                         {!islandOn && activeView === 'finance' && <FinanceBar />}
4415:                         {!islandOn && (activeView === 'logistics' || activeView === 'warehouse' || activeView === 'trucking') && <LogisticsBar />}
4416:                         {!islandOn && activeView === 'packing' && <PackingBar />}
4417:                         {!islandOn && activeView === 'upload' && <UploadBar />}
4418:                         {!islandOn && activeView === 'process' && <ProcessBar />}
4419:                         {!islandOn && activeView === 'control' && <ControlBar />}
4420:                         {activeView === 'onyx' && <OnyxBar />}
4421:                         {isArchived && !islandOn && <ArchivedBar />}
4422:                         {activeView === 'overview' && (
4423:                             <div className="flex items-center gap-1 sm:gap-4">
4424:                                 <ModuleBadge icon="layout-dashboard" label="" color="var(--main-color)" />
4425:                                 <StudioAction 
4426:                                     icon={DollarSign}
4427:                                     label={currencyMode}
4428:                                     active={true}
4429:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4430:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
4431:                                 />
4432:                                 <StudioAction 
4433:                                     icon={Download}
4434:                                     label={tr("EXPORT")}
4435:                                     onClick={handleMasterExportXLSX}
4436:                                     disabled={isExporting}
4437:                                     className={isExporting ? 'animate-bounce' : ''}
4438:                                 />
4439:                             </div>
4440:                         )}
4441:                         {activeView === 'dashboard' && (
4442:                             <div className="flex items-center gap-1 sm:gap-4">
4443:                                 <ModuleBadge icon="layout-grid" label={tr("Analytics")} color="var(--color-analytics)" />
4444:                                 <StudioAction 
4445:                                     icon={DollarSign}
4446:                                     label={currencyMode}
4447:                                     active={true}
4448:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4449:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
4450:                                 />
4451:                             </div>
4452:                         )}
4453:                         {(activeView === 'create' || !activeView) && (
4454:                             <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
4455:                         )}
4456:                     </div>
4457:                 </div>
4458: 
```
