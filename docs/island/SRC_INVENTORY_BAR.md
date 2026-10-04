# Source of the Inventory top bar controls (extracted from src/features/core/MainHeader.tsx)

Script-extracted, verbatim, with the line numbers of MainHeader.tsx. Imports of MainHeader.tsx (atoms, icons, helpers) are listed first so you know every name.

## Import block of MainHeader.tsx (lines 1-112)
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

## StudioAction (lines 471-494)
```tsx
471: const StudioAction: React.FC<{
472:     icon: any;
473:     label: string;
474:     onClick: () => void;
475:     active?: boolean;
476:     title?: string;
477:     color?: string;
478:     disabled?: boolean;
479:     className?: string;
480: }> = ({ icon: Icon, label, onClick, active, title, color = 'var(--main-color)', disabled, className = "" }) => (
481:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
482:         <button
483:             onClick={onClick}
484:             disabled={disabled}
485:             title={title || label}
486:             aria-pressed={active}
487:             className={`tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all select-none disabled:opacity-30 disabled:pointer-events-none ${className}`}
488:         >
489:             <Icon size={18} strokeWidth={2.2} style={{ color: active ? color : undefined }} />
490:         </button>
491:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">{label}</span>
492:     </div>
493: );
494: 
```

## DeployableSearch (lines 495-535)
```tsx
495: const DeployableSearch: React.FC<{
496:     value: string;
497:     onChange: (v: string) => void;
498:     isOpen: boolean;
499:     setIsOpen: (o: boolean) => void;
500:     placeholder?: string;
501:     accentColor?: string;
502: }> = ({ value, onChange, isOpen, setIsOpen, placeholder = "SEARCH...", accentColor = "var(--main-color)" }) => (
503:     <div className={`relative flex items-center transition-all duration-500 ease-out ${isOpen ? 'flex-1 max-w-xl' : 'w-auto'}`}>
504:         {!isOpen ? (
505:             <button onClick={() => setIsOpen(true)} className="p-4 text-(--text-color)/40 hover:text-(--text-color) hover:scale-110 transition-all">
506:                 <Search size={32} strokeWidth={2} />
507:             </button>
508:         ) : (
509:             <div className="flex-1 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
510:                 <Search size={32} strokeWidth={2.5} style={{ color: accentColor }} className="shrink-0 opacity-80" />
511:                 <input
512:                     autoFocus
513:                     type="text"
514:                     value={value}
515:                     onChange={e => onChange(e.target.value)}
516:                     onBlur={() => { if (!value) setIsOpen(false); }}
517:                     placeholder={placeholder}
518:                     className="flex-1 bg-transparent border-none text-[15px] font-black text-(--text-color) outline-none placeholder-(--text-color)/15 uppercase tracking-[0.25em] py-4"
519:                 />
520:                 {value && (
521:                     <button onClick={() => onChange('')} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-colors">
522:                         <X size={32} strokeWidth={2.5} />
523:                     </button>
524:                 )}
525:                 <button onClick={() => setIsOpen(false)} className="p-3 text-(--text-color)/30 hover:text-(--text-color) transition-all hover:scale-125">
526:                     <X size={30} strokeWidth={3} />
527:                 </button>
528:             </div>
529:         )}
530:     </div>
531: );
532: 
533: 
534: 
535: 
```

## ToolButton (lines 691-716)
```tsx
691: const ToolButton: React.FC<{
692:     icon: any;
693:     label: string;
694:     onClick: () => void;
695:     active?: boolean;
696:     title?: string;
697:     disabled?: boolean;
698:     tone?: string;
699: }> = ({ icon: Icon, label, onClick, active, title, disabled, tone }) => (
700:     <div className="tool-cell flex flex-col items-center gap-1 shrink-0">
701:         <button
702:             onClick={onClick}
703:             disabled={disabled}
704:             aria-pressed={active}
705:             title={title || label}
706:             className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
707:             style={active && tone ? { color: tone } : undefined}
708:         >
709:             <Icon size={18} strokeWidth={2.2} />
710:         </button>
711:         <span className="tool-label text-[8px] font-black uppercase tracking-[0.14em] leading-none whitespace-nowrap">
712:             {label}
713:         </span>
714:     </div>
715: );
716: 
```

## SeasonToggles (lines 717-759)
```tsx
717: const SeasonToggles: React.FC = () => {
718:     const [visible, setVisible] = useAtom(visibleWorkbooksAtom);
719:     const flip = (id: WorkbookId) =>
720:         setVisible(prev => ({ ...prev, [id]: !(prev?.[id] ?? true) }));
721: 
722:     return (
723:         <div className="season-toggles flex items-center gap-2 shrink-0">
724:             {WORKBOOK_IDS.map(id => {
725:                 const on = visible?.[id] ?? true;
726:                 return (
727:                     <button
728:                         key={id}
729:                         onClick={() => flip(id)}
730:                         aria-pressed={on}
731:                         className={`season-toggle flex flex-col items-center gap-1 transition-all ${on ? 'text-(--main-color)' : 'text-(--text-color)/35'}`}
732:                         title={`${on ? 'Hide' : 'Show'} season ${id.replace('v', '')}`}
733:                     >
734:                         <span className="season-track relative w-7 h-3.5 rounded-full shrink-0 block">
735:                             <span className="season-knob absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-all" />
736:                         </span>
737:                         <span className="text-[9px] font-black uppercase tracking-[0.1em] leading-none">
738:                             {id.replace('v', '')}
739:                         </span>
740:                     </button>
741:                 );
742:             })}
743:         </div>
744:     );
745: };
746: 
747: /**
748:  * The two bulk-upload actions, lifted out of InventoryBar so they can sit in
749:  * the header's right-hand column beneath the workbook tools. Self-contained:
750:  * it owns the atoms and state both handlers need, so nothing has to be threaded
751:  * down. Role gating is unchanged — Sheets stays Admin/Developer only, the
752:  * database sync stays open to anyone who can reach it.
753:  */
754: /**
755:  * Add Entry, lifted out of the left tool cluster so it can sit beside the
756:  * export group. It is deliberately NOT inside the export disclosure: adding
757:  * an item is the most frequent action in this view and must never be one
758:  * click behind a toggle.
759:  */
```

## InventoryAddButton (lines 760-774)
```tsx
760: const InventoryAddButton: React.FC = () => {
761:     const setView = useSetAtom(activeViewAtom);
762:     return (
763:         <ToolButton
764:             icon={Plus}
765:             label={tr("Add")}
766:             title={tr("Add Entry")}
767:             onClick={() => {
768:                 window.scrollTo({ top: 0, behavior: 'smooth' });
769:                 setView('upload');
770:             }}
771:         />
772:     );
773: };
774: 
```

## SheetsUploadButton (lines 775-843)
```tsx
775: const SheetsUploadButton: React.FC = () => {
776:     const items = useAtomValue(inventoryAtom);
777:     // Both hooks always run (a short-circuited hook breaks React's hook order).
778:     const storedRate = useAtomValue(exchangeRateAtom);
779:     const liveRate = useAtomValue(liveExchangeRateAtom);
780:     const exRate = storedRate || liveRate || DEFAULT_EXCHANGE_RATE;
781:     const user = useAtomValue(userAtom);
782:     const handleGoogleSheetsUpload = async () => {
783:         const webhookUrl = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK;
784:         if (!webhookUrl) {
785:             toast.error(tr("VITE_GOOGLE_SHEETS_WEBHOOK is not defined in .env.local"));
786:             return;
787:         }
788: 
789:         const tid = toast.loading(tr("Preparing Google Sheets payload..."));
790:         try {
791:             const payloadItems = items.map(item => {
792:                 const itemData = normalizeInventoryData(item.data);
793:                 const calculated = calculateCodesAndPrices(itemData, exRate, '326');
794:                 
795:                 return {
796:                     vendor: itemData.vendor_id || itemData.vendorId || '',
797:                     item_id: itemData.itemId || itemData.item_id || itemData.tag_id || '',
798:                     description: `${itemData.shape || itemData.shape_type || ''} ${itemData.shortDescription || itemData.short_description || itemData.description || ''}`.trim(),
799:                     color_material: `${itemData.color || ''} ${itemData.material || ''}`.trim(),
800:                     quantity: parseFloat(itemData.quantity) || 1,
801:                     price_mxn: calculated.bookAcquisition !== '-' ? (parseFloat(itemData.price || itemData.price_mxn) || 0) : 0,
802:                     price_usd: calculated.bookAcquisition !== '-' ? ((parseFloat(itemData.price || itemData.price_mxn) || 0) / exRate) : 0,
803:                     acq_code: calculated.bookAqCode || '-',
804:                     landed_code: calculated.bookLandCode || '-',
805:                     retail: calculated.bookRetail || 0,
806:                     image_url: itemData.generatedPngUrl || itemData.generated_png_url || itemData.image_url || ''
807:                 };
808:             }).filter(i => i.item_id); // Only send items with valid IDs
809: 
810:             toast.loading(`Uploading ${payloadItems.length} items to Google Sheets...`, { id: tid });
811: 
812:             const res = await fetch(webhookUrl, {
813:                 method: 'POST',
814:                 body: JSON.stringify({ items: payloadItems }),
815:                 headers: {
816:                     'Content-Type': 'application/json'
817:                 }
818:             });
819: 
820:             const result = await res.json();
821:             if (result.success) {
822:                 toast.success(`Google Sheets updated! (${result.message})`, { id: tid });
823:             } else {
824:                 throw new Error(result.error || 'Failed to update Google Sheets');
825:             }
826:         } catch (error: any) {
827:             console.error('Google Sheets Upload Error:', error);
828:             toast.error(`Google Sheets Upload failed: ${error.message}`, { id: tid });
829:         }
830:     };
831: 
832:     if (user?.role !== 'Admin' && user?.role !== 'Developer') return null;
833: 
834:     return (
835:         <ToolButton
836:             icon={FileSpreadsheet}
837:             label={tr("Sheets")}
838:             title={tr("Upload inventory to Google Sheets")}
839:             onClick={handleGoogleSheetsUpload}
840:         />
841:     );
842: };
843: 
```

## InventoryBar (lines 844-908)
```tsx
844: const InventoryBar: React.FC = () => {
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
855:     const handleToggleSelectionMode = () => {
856:         setIsSelectionMode(!isSelectionMode);
857:         if (isSelectionMode) setSelectedIds([]);
858:     };
859: 
860:     const [viewSlider] = useAtom(inventoryViewSliderAtom);
861:     const ViewIcon = LayoutTemplate; // Updated icon per request
862:     const [showTools, setShowTools] = useAtom(inventoryToolsOpenAtom);
863:     const [showSmart, setShowSmart] = useAtom(isInventorySmartFiltersOpenAtom);
864:     const user = useAtomValue(userAtom);
865: 
866: 
867:     return (
868:         <div className="flex items-center justify-between w-full gap-4 sm:gap-8">
869:             <div className="flex items-end gap-1 sm:gap-2 shrink-0 animate-in fade-in duration-300">
870:                 {/* Named for what it does, not for the mode it enters. The key
871:                     turns the list into something you act ON — select rows, then
872:                     pack, pay, print or export them — and "Select" described only
873:                     the first half of that. The pointing hand carries the same
874:                     idea without needing the word. */}
875:                 <ToolButton icon={Pointer} label={tr("Actions")} active={isSelectionMode}
876:                     title={tr("Select items to act on")}
877:                     onClick={handleToggleSelectionMode} />
878: 
879:                 {/* TOOLS — a disclosure for the whole tool set. Off hides the
880:                     buttons AND any bars they deployed; on brings back every
881:                     button plus whichever bars were active. State is gated, not
882:                     cleared, so nothing is lost by collapsing the group. */}
883:                 <ToolButton icon={Wrench} label={tr("Tools")} active={showTools}
884:                     onClick={() => setShowTools(!showTools)} />
885: 
886:                 {showTools && (
887:                     <div className="flex items-end gap-1 sm:gap-2 animate-in fade-in slide-in-from-left-4 duration-300 ml-1">
888:                         <ToolButton icon={ViewIcon} label={tr("View")} active={isViewSliderOpen}
889:                             onClick={() => setIsViewSliderOpen(!isViewSliderOpen)} />
890:                         <ToolButton icon={Filter} label={tr("Filter")} active={isFiltersOpen}
891:                             onClick={() => setIsFiltersOpen(!isFiltersOpen)} />
892:                         <ToolButton icon={Search} label={tr("Search")} active={isSearchOpen || !!search}
893:                             onClick={() => setIsSearchOpen(!isSearchOpen)} />
894: 
895:                         {/* Smart filters: the auto-generated Type/Shape and
896:                             Material/Colour hierarchies. */}
897:                         <ToolButton icon={Tag} label={tr("Tags")} active={showSmart}
898:                             title={tr("Smart filters — type, shape, material, colour")}
899:                             onClick={() => setShowSmart(!showSmart)} />
900:                     </div>
901:                 )}
902:             </div>
903:             
904:         </div>
905:     );
906: };
907: 
908: 
```

## UniversalToolsBar.tsx: the atoms behind the inventory panels (lines 339-378)
```tsx
339: export const UniversalToolsBar: React.FC = () => {
340:     const activeView = useAtomValue(activeViewAtom);
341:     const logisticsSubTab = useAtomValue(logisticsSubTabAtom);
342:     
343:     // Inventory States
344:     const [isInvViewSliderOpen, setIsInvViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
345:     const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
346:     const [invMode, setInvMode] = useAtom(inventoryViewModeAtom);
347:     const [isInvFiltersOpen, setIsInvFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
348:     const [isInvSearchOpen, setIsInvSearchOpen] = useAtom(isInventorySearchOpenAtom);
349:     // The Tools disclosure gates these bars without clearing their state, so
350:     // collapsing the group hides them and reopening restores what was active.
351:     // smartOpen is the master ("Tags") switch; the two bars below then deploy
352:     // independently under it, each with its own open atom, so showing one
353:     // never forces the other onto the screen.
354:     const toolsOpen = useAtomValue(inventoryToolsOpenAtom);
355:     const smartOpen = useAtomValue(isInventorySmartFiltersOpenAtom);
356:     const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
357:     const [materialColorOpen, setMaterialColorOpen] = useAtom(isInventoryMaterialColorFilterOpenAtom);
358:     const [shapeFilterOpen, setShapeFilterOpen] = useAtom(isInventoryShapeFilterOpenAtom);
359:     const [shapeSel, setShapeSel] = useAtom(inventoryShapeFilterAtom);
360:     const [materialColorSel, setMaterialColorSel] = useAtom(inventoryMaterialColorFilterAtom);
361:     const inventoryRows = useAtomValue(inventoryAtom);
362: 
363:     // Both hierarchies are derived from the live rows, so a new material,
364:     // colour or shape appears as a filter the moment an item using it is
365:     // saved — nothing to configure and nothing to keep in sync with the data.
366:     const shapeTree = React.useMemo(() => buildGeometryTree(inventoryRows || []), [inventoryRows]);
367:     const materialColorTree = React.useMemo(() => buildMaterialColorTree(inventoryRows || []), [inventoryRows]);
368:     const contentCounts = React.useMemo(() => countContent(inventoryRows || []), [inventoryRows]);
369:     const [invSearchTerm, setInvSearchTerm] = useAtom(inventorySearchTermAtom);
370:     const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
371:     const invCategoryFilter = useAtomValue(inventoryCategoryFilterAtom);
372:     const invMaterialFilter = useAtomValue(inventoryMaterialFilterAtom);
373:     const filteredIds = useAtomValue(filteredInventoryIdsAtom);
374:     const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
375: 
376:     const handleToggleDensity = () => {
377:         if (invSlider <= 33) {
378:             setInvSlider(50);
```
