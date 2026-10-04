# Island tool dock: digest of every control in the main top bar

Script-generated. Line numbers refer to the files at the time of generation. For each component: its line range, then the lines that declare controls (ToolButton, StudioAction, ModuleBadge, buttons, titles, labels, atoms, role checks).

## OnyxBar (lines 113-443, 331 lines)
```

```

## SubTabPills (lines 444-470, 27 lines)
```
455:                     <button onClick={() => onSelect(t.id)}
456:                         aria-pressed={active === t.id}
457:                         title={t.label}
458:                         className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none"
```

## StudioAction (lines 471-494, 24 lines)
```
482:         <button
483:             onClick={onClick}
484:             disabled={disabled}
485:             title={title || label}
486:             aria-pressed={active}
```

## DeployableSearch (lines 495-535, 41 lines)
```
505:             <button onClick={() => setIsOpen(true)} className="p-4 text-(--text-color)/40 hover:text-(--text-color) hover:scale-110 transition-all">
506:                 <Search size={32} strokeWidth={2} />
...
511:                 <input
512:                     autoFocus
...
521:                     <button onClick={() => onChange('')} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-colors">
522:                         <X size={32} strokeWidth={2.5} />
...
525:                 <button onClick={() => setIsOpen(false)} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-all hover:scale-125">
526:                     <X size={30} strokeWidth={3} />
```

## ModuleBadge (lines 536-544, 9 lines)
```

```

## ShippingStats (lines 545-585, 41 lines)
```
546:     const crates = useAtomValue(shippingCratesAtom);
547:     const truckDims = useAtomValue(shippingTruckDimsAtom);
548:     const maxWeight = useAtomValue(truckMaxWeightAtom);
549:     const loaded = crates.filter(c => c.location === 'truck');
```

## InfoNotch (lines 586-690, 105 lines)
```
587:     const typesCount = useAtomValue(filteredInventoryCountAtom);
588:     const totalQty = useAtomValue(filteredInventoryTotalQtyAtom);
589:     const totalValue = useAtomValue(filteredInventoryTotalValueAtom);
590:     const showFinancials = useAtomValue(showFinancialsAtom);
591:     const user = useAtomValue(userAtom);
592:     const openSettingsPortal = useSetAtom(isStudioSettingsOpenAtom);
593: 
594:     const items = useAtomValue(inventoryAtom);
595:     // Both hooks always run (a short-circuited hook breaks React's hook order).
596:     const storedRate = useAtomValue(exchangeRateAtom);
597:     const liveRate = useAtomValue(liveExchangeRateAtom);
598:     const exRate = storedRate || liveRate || DEFAULT_EXCHANGE_RATE;
...
600:     const setInvVersion = useSetAtom(InventoryVersionAtom);
601:     const [isSyncingCalc, setIsSyncingCalc] = useState(false);
...
632:         <button
633:             onClick={handleSyncCalculatedFields}
634:             disabled={isSyncingCalc}
635:             title={tr("Sync calculated fields to the database")}
636:             className={`info-notch-stats grid grid-rows-2 grid-flow-col auto-cols-max items-center gap-x-3.5 gap-y-1 px-3.5 py-1.5 ${isSyncingCalc ? 'animate-pulse' : ''}
...
652:         <button
653:             onClick={() => openSettingsPortal(true)}
654:             title={tr("Settings")}
655:             className="info-notch-user grid grid-rows-2 auto-cols-max items-center gap-y-1 px-3.5 py-1.5 text-left"
```

## ToolButton (lines 691-716, 26 lines)
```
701:         <button
702:             onClick={onClick}
703:             disabled={disabled}
...
705:             title={title || label}
706:             className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
```

## SeasonToggles (lines 717-759, 43 lines)
```
718:     const [visible, setVisible] = useAtom(visibleWorkbooksAtom);
719:     const flip = (id: WorkbookId) =>
...
727:                     <button
728:                         key={id}
729:                         onClick={() => flip(id)}
730:                         aria-pressed={on}
...
732:                         title={`${on ? 'Hide' : 'Show'} season ${id.replace('v', '')}`}
733:                     >
```

## InventoryAddButton (lines 760-774, 15 lines)
```
761:     const setView = useSetAtom(activeViewAtom);
762:     return (
763:         <ToolButton
764:             icon={Plus}
765:             label={tr("Add")}
766:             title={tr("Add Entry")}
767:             onClick={() => {
768:                 window.scrollTo({ top: 0, behavior: 'smooth' });
```

## SheetsUploadButton (lines 775-843, 69 lines)
```
776:     const items = useAtomValue(inventoryAtom);
777:     // Both hooks always run (a short-circuited hook breaks React's hook order).
778:     const storedRate = useAtomValue(exchangeRateAtom);
779:     const liveRate = useAtomValue(liveExchangeRateAtom);
780:     const exRate = storedRate || liveRate || DEFAULT_EXCHANGE_RATE;
781:     const user = useAtomValue(userAtom);
782:     const handleGoogleSheetsUpload = async () => {
...
832:     if (user?.role !== 'Admin' && user?.role !== 'Developer') return null;
833: 
...
835:         <ToolButton
836:             icon={FileSpreadsheet}
837:             label={tr("Sheets")}
838:             title={tr("Upload inventory to Google Sheets")}
839:             onClick={handleGoogleSheetsUpload}
840:         />
```

## InventoryBar (lines 844-908, 65 lines)
```
845:     const [search, setSearch] = useAtom(inventorySearchTermAtom);
846:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
847:     const [isViewSliderOpen, setIsViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
848:     const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
849:     const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
850:     const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
851:     const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
852:     const [isSearchOpen, setIsSearchOpen] = useAtom(isInventorySearchOpenAtom);
853:     const setView = useSetAtom(activeViewAtom);
854: 
...
860:     const [viewSlider] = useAtom(inventoryViewSliderAtom);
861:     const ViewIcon = LayoutTemplate; // Updated icon per request
862:     const [showTools, setShowTools] = useAtom(inventoryToolsOpenAtom);
863:     const [showSmart, setShowSmart] = useAtom(isInventorySmartFiltersOpenAtom);
864:     const user = useAtomValue(userAtom);
865: 
...
875:                 <ToolButton icon={Pointer} label={tr("Actions")} active={isSelectionMode}
876:                     title={tr("Select items to act on")}
877:                     onClick={handleToggleSelectionMode} />
878: 
...
883:                 <ToolButton icon={Wrench} label={tr("Tools")} active={showTools}
884:                     onClick={() => setShowTools(!showTools)} />
885: 
...
888:                         <ToolButton icon={ViewIcon} label={tr("View")} active={isViewSliderOpen}
889:                             onClick={() => setIsViewSliderOpen(!isViewSliderOpen)} />
890:                         <ToolButton icon={Filter} label={tr("Filter")} active={isFiltersOpen}
891:                             onClick={() => setIsFiltersOpen(!isFiltersOpen)} />
892:                         <ToolButton icon={Search} label={tr("Search")} active={isSearchOpen || !!search}
893:                             onClick={() => setIsSearchOpen(!isSearchOpen)} />
894: 
...
897:                         <ToolButton icon={Tag} label={tr("Tags")} active={showSmart}
898:                             title={tr("Smart filters — type, shape, material, colour")}
899:                             onClick={() => setShowSmart(!showSmart)} />
900:                     </div>
```

## StoreBar (lines 909-971, 63 lines)
```
910:     const [search, setSearch] = useAtom(storeSearchTermAtom);
911:     const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
912:     const vendorOptions = useAtomValue(storeVendorOptionsAtom);
913:     const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
914:     const [isSearchOpen, setIsSearchOpen] = useState(false);
...
934:                                 <button
935:                                     key={v}
936:                                     onClick={() => setVendorFilter(v)}
937:                                     className={`shrink-0 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.2em] transition-all border
...
954:                         <StudioAction
955:                             icon={viewMode === 'grid' ? LayoutGrid : viewMode === 'gallery' ? Layout : LayoutList}
956:                             label={viewMode.toUpperCase()}
957:                             active={true}
958:                             onClick={() => {
959:                                 const modes: ('grid' | 'gallery' | 'list')[] = ['grid', 'gallery', 'list'];
```

## FinanceBar (lines 972-1029, 58 lines)
```
973:     const [search, setSearch] = useAtom(financeSearchTermAtom);
974:     const [isSearchOpen, setIsSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
975:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
976:     const [isActionOpen, setIsActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
977:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
978:     const toggleCurrency = () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN');
979:     const [isUpcomingOpen, setIsUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
980: 
...
983:             <button
984:                 onClick={() => setIsSearchOpen(!isSearchOpen)}
985:                 className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isSearchOpen || search ? 'text-(--color-finance) drop-sha
986:                 title={tr("Search Payments")}
987:             >
...
992:                 <button
993:                     onClick={() => setIsFiltersOpen(!isFiltersOpen)}
994:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isFiltersOpen ? 'text-(--color-finance) drop-shadow-[
995:                     title={tr("Filter Payments")}
996:                 >
...
999:                 <button
1000:                     onClick={() => setIsActionOpen(!isActionOpen)}
1001:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isActionOpen ? 'text-(--color-finance) drop-shadow-[0
1002:                     title={tr("Settings & Logic")}
1003:                 >
...
1007:                 <button
1008:                     onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
1009:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 ${isUpcomingOpen ? 'text-amber-400 drop-shadow-[0_0_10p
1010:                     title={tr("Upcoming Payments")}
1011:                 >
...
1017:                 <button
1018:                     onClick={toggleCurrency}
1019:                     className={`flex items-center justify-center transition-all duration-300 group hover:scale-110 text-white/50 hover:text-white`}
1020:                     title={`Switch to ${currencyMode === 'MXN' ? 'USD' : 'MXN'}`}
1021:                 >
```

## LogisticsBar (lines 1030-1230, 201 lines)
```
1031:     const [activeView] = useAtom(activeViewAtom);
1032:     const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
1033:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1034:     const [isSearchOpen, setIsSearchOpen] = useState(false);
1035:     const [isPackingFiltersOpen, setIsPackingFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1036:     const setTruckReady = useSetAtom(truckReadyTriggerAtom);
1037:     const truckBusy = useAtomValue(truckIsBusyAtom);
1038:     const [truckView, setTruckView] = useAtom(truckViewModeAtom);
1039:     const [showPanels, setShowPanels] = useAtom(truckShowPanelsAtom);
1040:     const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
1041:     const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
1042:     const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
1043:     const setShowReadyWizard = useSetAtom(truckShowReadyWizardAtom);
1044: 
1045:     const setIsCrateModalOpen = useSetAtom(isCrateCreationModalOpenAtom);
1046:     const [isWarehouseSearchOpen, setIsWarehouseSearchOpen] = useState(false);
...
1048:     const [isWarehouseSelectionMode, setIsWarehouseSelectionMode] = useAtom(isWarehouseSelectionModeAtom);
1049:     const warehouseSelectedIds = useAtomValue(warehouseSelectedIdsAtom);
1050:     const setShowWarehouseExportWizard = useSetAtom(showWarehouseExportWizardAtom);
1051: 
...
1053:         if (activeView === 'warehouse' && (subTab === 'crates' || !['empty', 'packed', 'boxes', 'packing'].includes(subTab))) {
1054:             setSubTab('empty');
...
1056:     }, [activeView, subTab, setSubTab]);
1057: 
1058:     const tabs = activeView === 'warehouse' ? [
1059:         { id: 'empty', label: 'Empty', icon: 'package' },
...
1062:     ] : activeView === 'trucking' ? [
1063:         { id: 'shipping', label: 'PLAN', icon: 'truck' },
...
1085:             {(!isSearchOpen || activeView === 'warehouse' || activeView === 'trucking') && (
1086:                 <div className="flex items-center gap-4 animate-in fade-in duration-300">
...
1089:                         active={subTab}
1090:                         onSelect={(id) => { setSubTab(id as any); if (id !== 'packing') setSearch(''); }}
...
1094:                     {activeView === 'warehouse' && (
1095:                         <>
...
1097:                             <button
1098:                                 onClick={() => setIsCrateModalOpen(true)}
1099:                                 className="flex flex-col items-center justify-center w-16 h-16 text-(--main-color) hover:text-white transition-all cursor-pointer hover:bg
1100:                                 title={tr("Initialize Storage Protocol")}
1101:                             >
...
1105:                             <button
1106:                                 onClick={() => setIsWarehouseSearchOpen(!isWarehouseSearchOpen)}
1107:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer hover:bg-white/5 rounded-2xl group/search ${
1108:                                 title={tr("Search Units")}
1109:                             >
...
1114:                             {subTab === 'packed' && (
1115:                                 <>
...
1117:                                     <button
1118:                                         onClick={() => {
1119:                                             if (isWarehouseSelectionMode) {
...
1129:                                         title={isWarehouseSelectionMode ? 'Cancel Selection' : 'Select Crates'}
1130:                                     >
...
1136:                                         <button
1137:                                             onClick={() => setShowWarehouseExportWizard(true)}
1138:                                             className="ml-2 flex items-center gap-2 px-6 py-2 rounded-xl transition-all font-black text-[10px] tracking-widest uppercase s
...
1162:                     {subTab === 'packing' && (
1163:                         <>
...
1165:                             <button
1166:                                 onClick={() => setIsPackingFiltersOpen(!isPackingFiltersOpen)}
1167:                                 className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isPackingFiltersOpen ? 'text-(--main-color)' : 'tex
1168:                                 title={tr("Configuration")}
1169:                             >
...
1175:                     {(subTab === 'shipping' || subTab === 'deployed') && (
1176:                         <>
...
1178:                             <button
1179:                                 onClick={() => setShowPanels(s => !s)}
1180:                                 title={showPanels ? 'Hide all panels' : 'Show all panels'}
1181:                                 className={`flex items-center justify-center w-12 h-12 transition-all cursor-pointer rounded-2xl hover:bg-white/5 ${showPanels ? 'text-(--
...
1188:                     {activeView === 'trucking' && (
1189:                         <>
...
1191:                                 <button onClick={() => setShowOpenDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group" tit
1192:                                     <Archive size={22} className="group-hover:scale-110 transition-transform" />
...
1195:                                 <button onClick={() => setShowSaveDraft(true)} className="flex items-center gap-2 text-white/30 hover:text-white transition-all group px-2
1196:                                     <Save size={22} className="group-hover:scale-110 transition-transform" />
...
1199:                                 <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 text-white/30 hover:text-(--main-color) transition-all
1200:                                     <SlidersHorizontal size={22} className="group-hover:scale-110 transition-transform" />
...
1203:                                 <button
1204:                                     disabled={truckBusy}
1205:                                     onClick={() => setShowReadyWizard(true)}
1206:                                     className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all font-black text-[9px] tracking-widest uppercase shadow-xl
...
1215:                             <button
1216:                                 onClick={() => setSubTab('crates')}
1217:                                 title={tr("Deployed Crates Library")}
1218:                                 className={`flex flex-col items-center justify-center w-16 h-16 transition-all cursor-pointer rounded-2xl hover:bg-white/5 group/library $
1219:                             >
```

## PackingBar (lines 1231-1306, 76 lines)
```
1232:     const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
1233:     const [isSearchOpen, setIsSearchOpen] = useState(false);
...
1235:     const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
1236:     const [isPrintOpen, setIsPrintOpen] = useAtom(isPackingPrintWizardOpenAtom);
1237:     const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
1238:     const setExportPDF = useSetAtom(packingExportPDFTriggerAtom);
1239:     const setExportXLSX = useSetAtom(packingExportXLSXTriggerAtom);
1240:     const setExportJSON = useSetAtom(packingExportJSONTriggerAtom);
1241:     const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
1242:     const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);
1243: 
...
1255:                         <button
1256:                             onClick={() => setSelectedIds(new Set())}
1257:                             className="text-[9px] font-bold underline uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity text-left"
...
1276:                     <StudioAction
1277:                         icon={ViewIcon}
1278:                         label={viewMode.toUpperCase()}
1279:                         active={true}
1280:                         onClick={cycleView}
1281:                         title={tr("Toggle View Mode")}
1282:                     />
1283:                     <button
1284:                         onClick={() => setIsFiltersOpen(!isFiltersOpen)}
1285:                         className={`flex items-center justify-center w-10 h-10 transition-all cursor-pointer ${isFiltersOpen ? 'text-(--main-color)' : 'text-white/20 hove
1286:                         title={tr("Configuration")}
1287:                     >
...
1293:                     <StudioAction icon={Printer} label={tr("PRINT")} onClick={() => setIsPrintOpen(true)} title={tr("Generate High-Fidelity Labels")} />
1294:                     <StudioAction icon={QrCode} label="NFC" onClick={() => setIsNFCWizardOpen(true)} title={tr("Hardware Sync Handshake")} />
1295: 
...
1298:                     <StudioAction icon={FileText} label="PDF" onClick={() => setExportPDF(1)} title={tr("Export PDF Catalog")} />
1299:                     <StudioAction icon={Table} label="XLSX" onClick={() => setExportXLSX(1)} title={tr("Export Spreadsheet")} />
1300:                     <StudioAction icon={Database} label="JSON" onClick={() => setExportJSON(1)} title={tr("Developer Data Dump")} />
1301:                 </div>
```

## ProcessBar (lines 1307-1344, 38 lines)
```
1308:     const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);
1309: 
...
1312:             <button
1313:                 onClick={() => setActiveTab('workspace')}
1314:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
...
1316:                 title={tr("Engine Workspace")}
1317:             >
...
1321:             <button
1322:                 onClick={() => setActiveTab('vault')}
1323:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
...
1325:                 title={tr("Inventory Vault")}
1326:             >
...
1330:             <button
1331:                 onClick={() => setActiveTab('batch')}
1332:                 className={`flex items-center justify-center p-1 transition-all active:scale-90 group relative
...
1334:                 title={tr("Batch Telemetry")}
1335:             >
```

## UploadBar (lines 1345-1380, 36 lines)
```
1346:     const setItemData = useSetAtom(uploadItemDataAtom);
1347:     const [, setUploadWizardOpen] = useAtom(isUploadWizardOpenAtom);
1348:     const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);
1349: 
...
1359:             <ModuleBadge icon="upload" label={tr("Add Entry")} color="var(--color-upload)" />
1360: 
...
1362:                 <StudioAction
1363:                     icon={FolderUp}
1364:                     label={tr("Add Entry")}
1365:                     active={false}
1366:                     onClick={openEntryModal}
1367:                 />
...
1369:                 <StudioAction
1370:                     icon={Brain}
1371:                     label={tr("AI PROCESSES")}
1372:                     active={aiEnabled}
1373:                     onClick={() => setAiEnabled(!aiEnabled)}
1374:                     color={aiEnabled ? '#38bdf8' : '#777'}
```

## ControlBar (lines 1381-4551, 3171 lines)
```
1383:         <ModuleBadge icon="shield" label={tr("Control")} color="var(--color-control)" />
1384:         <div className="ml-auto">
...
1392:     const [activeView, setView] = useAtom(activeViewAtom);
1393:     const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
1394:     const [isSettingsOpen, setIsSettingsOpen] = useState(false);
1395:     const [performanceMode, setPerformanceMode] = useAtom(performanceModeAtom);
1396:     const [appLanguage, setAppLanguage] = useAtom(languageAtom);
1397:     const [theme, setTheme] = useAtom(themeAtom);
1398:     const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
1399:     const bagCount = useAtomValue(storeShoppingBagAtom).length;
1400:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
1401:     const [sentTruckId, setSentTruckId] = useAtom(sentTruckIdAtom);
1402:     const [onyxApiKey, setOnyxApiKey] = useAtom(onyxApiKeyAtom);
1403:     const [artifactConfig, setArtifactConfig] = useAtom(inventoryArtifactConfigAtom);
1404:     const [isBotOrbOpen, setIsBotOrbOpen] = useAtom(isBotOrbOpenAtom);
1405:     const statusSets = useAtomValue(inventoryStatusSetsAtom);
1406: 
1407:     const inventory = useAtomValue(inventoryAtom);
1408:     const financeDocs = useAtomValue(financeDataAtom);
1409:     const logisticsDocs = useAtomValue(logisticsDataAtom);
1410:     const exchangeRate = useAtomValue(exchangeRateAtom);
1411:     const liveExchangeRateValue = useAtomValue(liveExchangeRateAtom);
1412:     const [isExporting, setIsExporting] = useState(false);
...
1414:     const activeVendors = useAtomValue(activeVendorsAtom);
1415:     const logout = useLogout();
1416:     const user = useAtomValue(userAtom);
1417:     const isSearchOpen = useAtomValue(isInventorySearchOpenAtom);
1418:     const isFiltersOpen = useAtomValue(isInventoryFiltersPanelOpenAtom);
1419:     const isViewSliderOpen = useAtomValue(isInventoryViewSliderOpenAtom);
1420:     const selectedIds = useAtomValue(selectedInventoryIdsAtom);
1421:     const exportSelectedTrigger = useAtomValue(inventoryExportSelectedXLSXTriggerAtom);
1422: 
...
4293:     const openSettingsPortal = useSetAtom(isStudioSettingsOpenAtom);
4294:     const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;
...
4297:     const isInventory = activeView === 'inventory';
4298:     const isArchived = activeView === 'workbook' && (user?.role === 'Developer' || user?.role === 'Admin');
4299:     const isToolsBarOpen = isInventory && (isSearchOpen || isFiltersOpen || isViewSliderOpen);
4300: 
...
4313:                 readout={activeView === 'inventory'
4314:                     ? { left: <InfoNotch part="stats" />, right: <InfoNotch part="user" /> }
...
4324:                         <button
4325:                             onClick={() => {
4326:                                 const isMobile = window.innerWidth <= 768;
...
4338:                             title={tr("Onyx.mx Menu")}
4339:                         >
...
4363:                         {activeView === 'inventory' && <InventoryBar />}
4364:                         {activeView === 'store' && <StoreBar />}
4365:                         {activeView === 'finance' && <FinanceBar />}
4366:                         {(activeView === 'logistics' || activeView === 'warehouse' || activeView === 'trucking') && <LogisticsBar />}
4367:                         {activeView === 'packing' && <PackingBar />}
4368:                         {activeView === 'upload' && <UploadBar />}
4369:                         {activeView === 'process' && <ProcessBar />}
4370:                         {activeView === 'control' && <ControlBar />}
4371:                         {activeView === 'onyx' && <OnyxBar />}
4372:                         {isArchived && <ArchivedBar />}
4373:                         {activeView === 'overview' && (
4374:                             <div className="flex items-center gap-1 sm:gap-4">
4375:                                 <ModuleBadge icon="layout-dashboard" label="" color="var(--main-color)" />
4376:                                 <StudioAction
4377:                                     icon={DollarSign}
4378:                                     label={currencyMode}
4379:                                     active={true}
4380:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4381:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
...
4383:                                 <StudioAction
4384:                                     icon={Download}
4385:                                     label={tr("EXPORT")}
4386:                                     onClick={handleMasterExportXLSX}
4387:                                     disabled={isExporting}
...
4392:                         {activeView === 'dashboard' && (
4393:                             <div className="flex items-center gap-1 sm:gap-4">
4394:                                 <ModuleBadge icon="layout-grid" label={tr("Analytics")} color="var(--color-analytics)" />
4395:                                 <StudioAction
4396:                                     icon={DollarSign}
4397:                                     label={currencyMode}
4398:                                     active={true}
4399:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4400:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
...
4404:                         {(activeView === 'create' || !activeView) && (
4405:                             <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
...
4417:                             <button
4418:                                 onClick={() => setView('trucking')}
4419:                                 className="w-11 h-11 flex items-center justify-center text-(--main-color) animate-pulse drop-shadow-[0_0_10px_var(--main-color)] hover:sca
4420:                                 title={tr("Active Crate Deployment")}
4421:                             >
...
4427:                             <button
4428:                                 onClick={() => setArtifactConfig(prev => ({ ...prev, isOpen: !prev.isOpen }))}
4429:                                 className={`w-11 h-11 flex items-center justify-center transition-all active:scale-90 hover:scale-110 ${artifactConfig.isOpen ? 'text-(--m
4430:                                 title={tr("Toggle Neural Manifest")}
4431:                             >
...
4436:                         {activeView === 'onyx' && (
4437:                             <>
...
4439:                                 <button
4440:                                     onClick={() => setAppLanguage(prev => prev === 'en' ? 'es' : 'en')}
4441:                                     className="px-2 h-10 flex items-center justify-center text-[11px] font-black tracking-[0.3em] text-white/40 hover:text-white transitio
4442:                                     title={tr("Toggle Neural Language")}
4443:                                 >
...
4448:                                 <button
4449:                                     onClick={() => {
4450:                                         if (confirm(tr("Reset Neural Link credentials to system default?"))) {
...
4456:                                     title={tr("Reset Neural Credentials")}
4457:                                 >
...
4467:                             <ToolButton icon={DatabaseBackup} label="Workbook" disabled={isExporting}
4468:                                 title="Download Workbook V2 (Rare Earth Format)" onClick={handleMasterExportXLSX_V2} />
4469:                         */}
...
4472:                             <button
4473:                                 onClick={handleShopifyExportXLSX}
4474:                                 disabled={isShopifyExporting}
...
4478:                                 title={tr("Download Shopify XLSX")}
4479:                             >
... (capped at 130 lines)
```

## MainHeader() main component, lines 1391-end (header row, right-hand cluster: export, currency, language, user, settings, cart, logout, season toggles)
```
1392:     const [activeView, setView] = useAtom(activeViewAtom);
1393:     const [sidebarState, setSidebarState] = useAtom(sidebarStateAtom);
1394:     const [isSettingsOpen, setIsSettingsOpen] = useState(false);
1395:     const [performanceMode, setPerformanceMode] = useAtom(performanceModeAtom);
1396:     const [appLanguage, setAppLanguage] = useAtom(languageAtom);
1397:     const [theme, setTheme] = useAtom(themeAtom);
1398:     const [isBagOpen, setIsBagOpen] = useAtom(isStoreBagOpenAtom);
1399:     const bagCount = useAtomValue(storeShoppingBagAtom).length;
1400:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
1401:     const [sentTruckId, setSentTruckId] = useAtom(sentTruckIdAtom);
1402:     const [onyxApiKey, setOnyxApiKey] = useAtom(onyxApiKeyAtom);
1403:     const [artifactConfig, setArtifactConfig] = useAtom(inventoryArtifactConfigAtom);
1404:     const [isBotOrbOpen, setIsBotOrbOpen] = useAtom(isBotOrbOpenAtom);
1405:     const statusSets = useAtomValue(inventoryStatusSetsAtom);
1406: 
1407:     const inventory = useAtomValue(inventoryAtom);
1408:     const financeDocs = useAtomValue(financeDataAtom);
1409:     const logisticsDocs = useAtomValue(logisticsDataAtom);
1410:     const exchangeRate = useAtomValue(exchangeRateAtom);
1411:     const liveExchangeRateValue = useAtomValue(liveExchangeRateAtom);
1412:     const [isExporting, setIsExporting] = useState(false);
...
1414:     const activeVendors = useAtomValue(activeVendorsAtom);
1415:     const logout = useLogout();
1416:     const user = useAtomValue(userAtom);
1417:     const isSearchOpen = useAtomValue(isInventorySearchOpenAtom);
1418:     const isFiltersOpen = useAtomValue(isInventoryFiltersPanelOpenAtom);
1419:     const isViewSliderOpen = useAtomValue(isInventoryViewSliderOpenAtom);
1420:     const selectedIds = useAtomValue(selectedInventoryIdsAtom);
1421:     const exportSelectedTrigger = useAtomValue(inventoryExportSelectedXLSXTriggerAtom);
1422: 
...
1425:             handleExportSelectedXLSX();
1426:         }
...
1433:     const handleExportSelectedXLSX = async () => {
1434:         if (selectedIds.length === 0) {
...
1621:     const handleMasterExportXLSX = async () => {
1622:         setIsExporting(true);
...
2724:     const handleMasterExportXLSX_V2 = async () => {
2725:         setIsExporting(true);
...
4289:     const handleLogout = () => {
4290:         logout();
...
4293:     const openSettingsPortal = useSetAtom(isStudioSettingsOpenAtom);
4294:     const UserIcon = user ? userIcons[user.id as keyof typeof userIcons] : null;
...
4297:     const isInventory = activeView === 'inventory';
4298:     const isArchived = activeView === 'workbook' && (user?.role === 'Developer' || user?.role === 'Admin');
4299:     const isToolsBarOpen = isInventory && (isSearchOpen || isFiltersOpen || isViewSliderOpen);
4300: 
...
4313:                 readout={activeView === 'inventory'
4314:                     ? { left: <InfoNotch part="stats" />, right: <InfoNotch part="user" /> }
...
4324:                         <button
4325:                             onClick={() => {
4326:                                 const isMobile = window.innerWidth <= 768;
...
4338:                             title={tr("Onyx.mx Menu")}
4339:                         >
...
4363:                         {activeView === 'inventory' && <InventoryBar />}
4364:                         {activeView === 'store' && <StoreBar />}
4365:                         {activeView === 'finance' && <FinanceBar />}
4366:                         {(activeView === 'logistics' || activeView === 'warehouse' || activeView === 'trucking') && <LogisticsBar />}
4367:                         {activeView === 'packing' && <PackingBar />}
4368:                         {activeView === 'upload' && <UploadBar />}
4369:                         {activeView === 'process' && <ProcessBar />}
4370:                         {activeView === 'control' && <ControlBar />}
4371:                         {activeView === 'onyx' && <OnyxBar />}
4372:                         {isArchived && <ArchivedBar />}
4373:                         {activeView === 'overview' && (
4374:                             <div className="flex items-center gap-1 sm:gap-4">
4375:                                 <ModuleBadge icon="layout-dashboard" label="" color="var(--main-color)" />
4376:                                 <StudioAction
4377:                                     icon={DollarSign}
4378:                                     label={currencyMode}
4379:                                     active={true}
4380:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4381:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
...
4383:                                 <StudioAction
4384:                                     icon={Download}
4385:                                     label={tr("EXPORT")}
4386:                                     onClick={handleMasterExportXLSX}
4387:                                     disabled={isExporting}
...
4392:                         {activeView === 'dashboard' && (
4393:                             <div className="flex items-center gap-1 sm:gap-4">
4394:                                 <ModuleBadge icon="layout-grid" label={tr("Analytics")} color="var(--color-analytics)" />
4395:                                 <StudioAction
4396:                                     icon={DollarSign}
4397:                                     label={currencyMode}
4398:                                     active={true}
4399:                                     onClick={() => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')}
4400:                                     color={currencyMode === 'USD' ? '#10b981' : '#38bdf8'}
...
4404:                         {(activeView === 'create' || !activeView) && (
4405:                             <span className="text-[11px] font-black text-(--text-color) opacity-20 uppercase tracking-[0.4em]">ONYX.MX</span>
...
4417:                             <button
4418:                                 onClick={() => setView('trucking')}
4419:                                 className="w-11 h-11 flex items-center justify-center text-(--main-color) animate-pulse drop-shadow-[0_0_10px_var(--main-color)] hover:sca
4420:                                 title={tr("Active Crate Deployment")}
4421:                             >
...
4427:                             <button
4428:                                 onClick={() => setArtifactConfig(prev => ({ ...prev, isOpen: !prev.isOpen }))}
4429:                                 className={`w-11 h-11 flex items-center justify-center transition-all active:scale-90 hover:scale-110 ${artifactConfig.isOpen ? 'text-(--m
4430:                                 title={tr("Toggle Neural Manifest")}
4431:                             >
...
4436:                         {activeView === 'onyx' && (
4437:                             <>
...
4439:                                 <button
4440:                                     onClick={() => setAppLanguage(prev => prev === 'en' ? 'es' : 'en')}
4441:                                     className="px-2 h-10 flex items-center justify-center text-[11px] font-black tracking-[0.3em] text-white/40 hover:text-white transitio
4442:                                     title={tr("Toggle Neural Language")}
4443:                                 >
...
4448:                                 <button
4449:                                     onClick={() => {
4450:                                         if (confirm(tr("Reset Neural Link credentials to system default?"))) {
...
4456:                                     title={tr("Reset Neural Credentials")}
4457:                                 >
...
4467:                             <ToolButton icon={DatabaseBackup} label="Workbook" disabled={isExporting}
4468:                                 title="Download Workbook V2 (Rare Earth Format)" onClick={handleMasterExportXLSX_V2} />
4469:                         */}
...
4472:                             <button
4473:                                 onClick={handleShopifyExportXLSX}
4474:                                 disabled={isShopifyExporting}
...
4478:                                 title={tr("Download Shopify XLSX")}
4479:                             >
...
4485:                         <button
4486:                             onClick={handleMasterExportXLSX}
4487:                             disabled={isExporting}
...
4492:                             title="Download Full Workbook XLSX"
4493:                         >
...
4503:                         <button
4504:                             onClick={handleMasterExportXLSX_V2}
4505:                             disabled={isExporting}
...
4510:                             title={tr("Download Workbook V2 (Rare Earth Format)")}
4511:                         >
...
4520:                         {activeView === 'inventory' && <InventoryAddButton />}
4521: 
...
4523:                         <ToolButton icon={FolderUp} label={tr("Export")} active={showExport}
4524:                             title={tr("Export tools")} onClick={() => setShowExport(!showExport)} />
4525:                     </div>
...
4528:                 {activeView === 'store' && (
4529:                     <div className="flex items-center gap-1 mx-2 relative">
4530:                         <button
4531:                             onClick={() => setIsBagOpen(!isBagOpen)}
4532:                             className="w-16 h-16 flex items-center justify-center text-(--main-color) transition-all relative group/bag"
```

## UniversalToolsBar.tsx (second row of the top bar, panels per module)
```
101: const ActiveRequestGridItem: React.FC<{
102:     label: string;
...
154: const UpcomingGridItem: React.FC<{
155:     label: string;
...
190: const SectionHeader: React.FC<{
191:     icon: any;
...
251: const SmartFilterGroup: React.FC<{
252:     title: string;
...
273:                         title={tr("Clear this filter")}>
274:                         {tr("Clear")} {activeCount}
...
290:                                     title={`Filter by ${node.label}`}
291:                                 >
...
304:                                         aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
305:                                         className="smart-expand flex items-center justify-center px-1.5 rounded-r-lg"
306:                                         title={`${node.children.length} sub-filter${node.children.length !== 1 ? 's' : ''}`}
307:                                     >
...
322:                                             title={`Filter by ${node.label} / ${child.label}`}
323:                                         >
...
339: export const UniversalToolsBar: React.FC = () => {
340:     const activeView = useAtomValue(activeViewAtom);
...
431:         if (activeView === 'trucking' && topBarState === 'trailers') {
432:             const fetchRecent = async () => {
...
588:     const isInventory = activeView === 'inventory';
589:     const isFinance = activeView === 'finance';
590:     const isTrucking = activeView === 'trucking';
591: 
...
604:                                 <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder={tr("SEARCH INVENTORY...
605:                                 {invSearchTerm && <button onClick={() => setInvSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={28} s
...
675:                                                 title={sort.label}
676:                                                 onClick={() => {
...
695:                                 <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder={tr("SEARCH PAYMENTS..."
696:                                 {finSearchTerm && <button onClick={() => setFinSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={28} s
...
767:                                             <button aria-pressed={isActive} title={s.id} onClick={() => setFinCategoryFilter(s.id as any)}
768:                                                 className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all">
...
788:                             <SectionHeader icon={Heartbeat} title={tr("Requested")} count={activeQueueRecords.length} amount={activeQueueTotal} isOpen={isFinQueueOpen} on
789:                             {isFinQueueOpen && (
...
794:                                         return <ActiveRequestGridItem key={r.id} label={r.description || v} amount={r.amount} color={color} type={r.subcategory} currencyM
795:                                     })}
...
808:                         title={tr("Upcoming Payments")}
809:                         count={combinedUpcoming.length}
...
829:                                             label={r.description || v}
830:                                             amount={r.amount}
...
894:                             title={tr("Material / Colour — main filter")}
895:                         >
...
903:                             title={tr("Shape — sub filter")}
904:                         >
...
913:                                 title={tr("Material / Colour — Main Filter")}
914:                                 tree={materialColorTree}
...
926:                                 title={tr("Shape — Sub Filter")}
927:                                 tree={shapeTree}
...
961:                                         <button aria-pressed={isActive} title={s.id} onClick={() => setInvStatusFilter(s.id as any)}
962:                                             className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
...
1001:                                         title={tr(f.hint)}
1002:                                         className="smart-chip flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.1em]"
...
1014:                                 title={tr("Clear content filter")}>
1015:                                 {tr("Clear")} {(contentSel || []).length}
...
1028:                                         <button aria-pressed={isActive} title={v}
1029:                                             onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : 
```