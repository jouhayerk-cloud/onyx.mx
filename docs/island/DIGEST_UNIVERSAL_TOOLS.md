# UniversalToolsBar.tsx structure digest (script-generated)

```
101: const ActiveRequestGridItem: React.FC<{
154: const UpcomingGridItem: React.FC<{
190: const SectionHeader: React.FC<{
251: const SmartFilterGroup: React.FC<{
273:                         title={tr("Clear this filter")}>
290:                                     title={`Filter by ${node.label}`}
304:                                         aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
306:                                         title={`${node.children.length} sub-filter${node.children.length !== 1 ? 's' : ''}`}
322:                                             title={`Filter by ${node.label} / ${child.label}`}
339: export const UniversalToolsBar: React.FC = () => {
340:     const activeView = useAtomValue(activeViewAtom);
341:     const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
344:     const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
345:     const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
346:     const [invMode, setInvMode] = useAtom(inventoryViewModeAtom);
347:     const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
348:     const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
354:     const toolsOpen = useAtomValue(inventoryToolsOpenAtom);
355:     const smartOpen = useAtomValue(isInventorySmartFiltersOpenAtom);
356:     const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
357:     const [materialColorOpen, setMaterialColorOpen] = useAtom(isInventoryMaterialColorFilterOpenAtom);
358:     const [shapeFilterOpen, setShapeFilterOpen] = useAtom(isInventoryShapeFilterOpenAtom);
359:     const [shapeSel, setShapeSel] = useAtom(inventoryShapeFilterAtom);
360:     const [materialColorSel, setMaterialColorSel] = useAtom(inventoryMaterialColorFilterAtom);
361:     const inventoryRows = useAtomValue(inventoryAtom);
369:     const [invSearchTerm, setInvSearchTerm] = useAtom(inventorySearchTermAtom);
370:     const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
371:     const invCategoryFilter = useAtomValue(inventoryCategoryFilterAtom);
372:     const invMaterialFilter = useAtomValue(inventoryMaterialFilterAtom);
373:     const filteredIds = useAtomValue(filteredInventoryIdsAtom);
374:     const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
388:     const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
391:     const [isFinSearchOpen, setIsFinSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
392:     const [finSearchTerm, setFinSearchTerm] = useAtom(financeSearchTermAtom);
393:     const [isFinFiltersOpen, setIsFinFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
394:     const [isFinActionOpen, setIsFinActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
395:     const [isFinQueueOpen, setIsFinQueueOpen] = useAtom(isPaymentQueueOpenAtom);
396:     const [isFinUpcomingOpen, setIsFinUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
398:     const [finCategoryFilter, setFinCategoryFilter] = useAtom(paymentCategoryFilterAtom);
399:     const [finDestFilter, setFinDestFilter] = useAtom(paymentDestinationFilterAtom);
400:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
401:     const financeTotals = useAtomValue(financeTotalsAtom);
402:     const financeDocs = useAtomValue(financeDataAtom);
403:     const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
404:     const setInvArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
405:     const liveEx = useAtomValue(liveExchangeRateAtom);
406:     const fixedEx = useAtomValue(exchangeRateAtom);
410:     const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
411:     const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
412:     const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
413:     const [showReadyWizard, setShowReadyWizard] = useAtom(truckShowReadyWizardAtom);
414:     const truckBusy = useAtomValue(truckIsBusyAtom);
415:     const showPanels = useAtomValue(truckShowPanelsAtom);
416:     const topBarState = useAtomValue(truckTopBarStateAtom);
417:     const [positions, setPositions] = useAtom(truckingPositionsAtom);
418:     const [recalledShipment, setRecalledShipment] = useAtom(truckingRecalledShipmentAtom);
419:     const dockCrates = useAtomValue(truckingDockCratesAtom);
420:     const allCrates = useAtomValue(truckingAllCratesAtom);
421:     const allLogistics = useAtomValue(logisticsDocsAtom);
422:     const allInventory = useAtomValue(inventoryAtom);
423:     const totalWeight = useAtomValue(truckingTotalWeightAtom);
424:     const floorPct = useAtomValue(truckingFloorPctAtom);
425:     const [isDockCompact, setIsDockCompact] = useAtom(truckDockIsCompactAtom);
426:     const [isStatsCompact, setIsStatsCompact] = useAtom(truckStatsIsCompactAtom);
427:     const readyFields = useAtomValue(truckingReadyFieldsAtom);
431:         if (activeView === 'trucking' && topBarState === 'trailers') {
461:     const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
462:     const [invSortKey, setInvSortKey] = useAtom(inventorySortKeyAtom);
463:     const [invSortOrder, setInvSortOrder] = useAtom(inventorySortOrderAtom);
464:     const activeVendors = useAtomValue(activeVendorsAtom);
588:     const isInventory = activeView === 'inventory';
589:     const isFinance = activeView === 'finance';
590:     const isTrucking = activeView === 'trucking';
604:                                 <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder={tr("SEARCH INVENTORY...
675:                                                 title={sort.label}
695:                                 <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder={tr("SEARCH PAYMENTS..."
767:                                             <button aria-pressed={isActive} title={s.id} onClick={() => setFinCategoryFilter(s.id as any)}
788:                             <SectionHeader icon={Heartbeat} title={tr("Requested")} count={activeQueueRecords.length} amount={activeQueueTotal} isOpen={isFinQueueOpen} on
794:                                         return <ActiveRequestGridItem key={r.id} label={r.description || v} amount={r.amount} color={color} type={r.subcategory} currencyM
808:                         title={tr("Upcoming Payments")}
829:                                             label={r.description || v}
894:                             title={tr("Material / Colour — main filter")}
903:                             title={tr("Shape — sub filter")}
913:                                 title={tr("Material / Colour — Main Filter")}
926:                                 title={tr("Shape — Sub Filter")}
961:                                         <button aria-pressed={isActive} title={s.id} onClick={() => setInvStatusFilter(s.id as any)}
1001:                                         title={tr(f.hint)}
1014:                                 title={tr("Clear content filter")}>
1028:                                         <button aria-pressed={isActive} title={v}
```
