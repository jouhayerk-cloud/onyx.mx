# UniversalToolsBar.tsx structure digest (script-generated)

```
86: const ActiveRequestGridItem: React.FC<{
139: const UpcomingGridItem: React.FC<{
175: const SectionHeader: React.FC<{
221: export const UniversalToolsBar: React.FC = () => {
222:     const activeView = useAtomValue(activeViewAtom);
223:     const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
224:     const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
227:     const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
228:     const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
229:     const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
230:     const toolsOpen = useAtomValue(inventoryToolsOpenAtom);
231:     const [smartOpen, setSmartOpen] = useAtom(isInventorySmartFiltersOpenAtom);
236:     const invCategoryFilter = useAtomValue(inventoryCategoryFilterAtom);
237:     const invMaterialFilter = useAtomValue(inventoryMaterialFilterAtom);
238:     const filteredIds = useAtomValue(filteredInventoryIdsAtom);
239:     const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
241:     const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
244:     const [isFinSearchOpen, setIsFinSearchOpen] = useAtom(isPaymentsSearchOpenAtom);
245:     const [finSearchTerm, setFinSearchTerm] = useAtom(financeSearchTermAtom);
246:     const [isFinFiltersOpen, setIsFinFiltersOpen] = useAtom(isPaymentFiltersOpenAtom);
247:     const [isFinActionOpen, setIsFinActionOpen] = useAtom(isPaymentActionPanelOpenAtom);
248:     const [isFinQueueOpen, setIsFinQueueOpen] = useAtom(isPaymentQueueOpenAtom);
249:     const [isFinUpcomingOpen, setIsFinUpcomingOpen] = useAtom(isPaymentUpcomingOpenAtom);
251:     const [finCategoryFilter, setFinCategoryFilter] = useAtom(paymentCategoryFilterAtom);
252:     const [finDestFilter, setFinDestFilter] = useAtom(paymentDestinationFilterAtom);
253:     const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
254:     const financeTotals = useAtomValue(financeTotalsAtom);
255:     const financeDocs = useAtomValue(financeDataAtom);
256:     const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
257:     const setInvArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
258:     const liveEx = useAtomValue(liveExchangeRateAtom);
259:     const fixedEx = useAtomValue(exchangeRateAtom);
263:     const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
264:     const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
265:     const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
266:     const [showReadyWizard, setShowReadyWizard] = useAtom(truckShowReadyWizardAtom);
267:     const truckBusy = useAtomValue(truckIsBusyAtom);
268:     const showPanels = useAtomValue(truckShowPanelsAtom);
269:     const topBarState = useAtomValue(truckTopBarStateAtom);
270:     const [positions, setPositions] = useAtom(truckingPositionsAtom);
271:     const [recalledShipment, setRecalledShipment] = useAtom(truckingRecalledShipmentAtom);
272:     const dockCrates = useAtomValue(truckingDockCratesAtom);
273:     const allCrates = useAtomValue(truckingAllCratesAtom);
274:     const allLogistics = useAtomValue(logisticsDocsAtom);
275:     const allInventory = useAtomValue(inventoryAtom);
276:     const totalWeight = useAtomValue(truckingTotalWeightAtom);
277:     const floorPct = useAtomValue(truckingFloorPctAtom);
278:     const [isDockCompact, setIsDockCompact] = useAtom(truckDockIsCompactAtom);
279:     const [isStatsCompact, setIsStatsCompact] = useAtom(truckStatsIsCompactAtom);
280:     const readyFields = useAtomValue(truckingReadyFieldsAtom);
284:         if (activeView === 'trucking' && topBarState === 'trailers') {
437:     const isInventory = activeView === 'inventory';
438:     const isFinance = activeView === 'finance';
439:     const isTrucking = activeView === 'trucking';
450:             <input autoFocus type="text" value={finSearchTerm} onChange={(e) => setFinSearchTerm(e.target.value)} placeholder={tr("SEARCH PAYMENTS...")} className="bg-tra
513:                             <button aria-pressed={isActive} title={s.id} onClick={() => setFinCategoryFilter(s.id as any)}
535:             <SectionHeader icon={Heartbeat} title={tr("Requested")} count={activeQueueRecords.length} amount={activeQueueTotal} isOpen={isFinQueueOpen} onToggle={() => se
541:                         return <ActiveRequestGridItem key={r.id} label={r.description || v} amount={r.amount} color={color} type={r.subcategory} currencyMode={currencyMod
552:                 title={tr("Upcoming Payments")}
573:                                     label={r.description || v}
616:         if (isInventory && toolsOpen && isInvSearchOpen) docks.push(<SubmenuCard key="inv-search" id="inv-search" title={tr("Search")} onClose={() => setIsInvSearchOpen(f
617:         if (isInventory && toolsOpen && isInvViewSliderOpen) docks.push(<SubmenuCard key="inv-view" id="inv-view" title={tr("View")} onClose={() => setIsInvViewSliderOpen
618:         if (isInventory && toolsOpen && isInvFiltersOpen) docks.push(<SubmenuCard key="inv-filters" id="inv-filters" title={tr("Filters")} onClose={() => setIsInvFiltersO
619:         if (isInventory && toolsOpen && smartOpen) docks.push(<SubmenuCard key="inv-smart" id="inv-smart" title={tr("Smart Filters")} onClose={() => setSmartOpen(false)}>
620:         if (isInventory && isSelectionMode) docks.push(<SubmenuCard key="inv-select" id="inv-select" title={tr("Batch Management")} onClose={() => setIsSelectionMode(fals
621:         if (isFinance && isFinSearchOpen) docks.push(<SubmenuCard key="fin-search" id="fin-search" title={tr("Search Payments")} onClose={() => setIsFinSearchOpen(false)}
622:         if (isFinance && isFinFiltersOpen) docks.push(<SubmenuCard key="fin-filters" id="fin-filters" title={tr("Filters")} onClose={() => setIsFinFiltersOpen(false)}>{re
623:         if (isFinance && isFinActionOpen) docks.push(<SubmenuCard key="fin-action" id="fin-action" title={tr("Requested Payments")} onClose={() => setIsFinActionOpen(fals
624:         if (isFinance && isFinUpcomingOpen) docks.push(<SubmenuCard key="fin-upcoming" id="fin-upcoming" title={tr("Upcoming Payments")} onClose={() => setIsFinUpcomingOp
```
