# MainAppView.tsx lines 1-600 (verbatim, script-extracted)

Contains the imports, ICON_MAP, NavItemWithSubmenu, the component state and handlers, and the sidebar JSX (about lines 395-590) followed by the app-topbar.

```tsx
1: 
2: import React, { Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
3: import './topbarOverlay.css';
4: import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
5: import {
6:     activeViewAtom,
7:     createViewActiveTabAtom,
8:     logisticsSubTabAtom,
9:     financeSubTabAtom,
10:     is3DViewerOpenAtom,
11:     is3DWorkspaceOpenAtom,
12:     isEditingMaskAtom,
13:     performanceModeAtom,
14:     themeAtom,
15:     userAtom,
16:     workflowStepAtom,
17:     activeSubMenuAtom,
18:     catalogMarketViewModeAtom,
19:     languageAtom,
20:     sidebarStateAtom,
21:     SidebarState,
22:     processIsProcessingAtom,
23:     processActiveStepLabelAtom,
24:     isDummyModeAtom,
25:     inventoryArtifactConfigAtom,
26:     paymentsArtifactConfigAtom,
27:     universalViewAtom,
28:     tagIdAtom,
29:     isStudioSettingsOpenAtom,
30:     isFinanceScrolledAtom,
31:     isBotOrbOpenAtom,
32:     UserRole
33: } from '../../lib/atoms';
34: import {
35:     Shield, Upload, Store, CreditCard, Truck, Package, MapPin,
36:     ChevronRight, ArrowLeft, Zap, Globe, LogOut, Settings, BarChart3, LayoutDashboard, Pipette, Search, Layers, ShoppingBag,
37:     Barcode, Box, Shell, Album, Cuboid, Tag, BadgeDollarSign, Rotate3d, History, Brain, Cpu
38: } from 'lucide-react';
39: 
40: import { LiquidBar } from '../../components/LiquidBar';
41: import { MainHeader } from './MainHeader';
42: import { Content } from '../../components/Content';
43: import { ExtraModeControls } from '../create/ExtraModeControls';
44: import { HeroBackground } from '../../components/HeroBackground';
45: import { useLogout, useTranslation } from '../../lib/hooks';
46: import { OnyxLogo, OnyxMiniLogo } from '../../components/OnyxLogo';
47: import userIcons from '../../components/userIcons';
48: import { DataSyncProvider } from '../../components/DataSyncProvider';
49: import { UniversalToolsBar } from './UniversalToolsBar';
50: import { ArchivedToolsBar } from '../archived/ArchivedChrome';
51: import { islandCommandsEnabledAtom } from '../../lib/toolRegistry';
52: import { InventorySelectionDock } from './InventorySelectionDock';
53: import { SyncStatusBadge } from '../../components/SyncStatusBadge';
54: import { ViewSkeleton } from '../../components/ui/ViewSkeleton';
55: import { useRemoteControl } from '../pico/useRemoteControl';
56: import { tr } from '../../lib/i18n';
57: 
58: // ── Lazy-loaded route views ────────────────────────────────────────────────────
59: // These chunks are only downloaded when the user navigates to that view.
60: // Saves ~2-3MB of JS parse time on initial load.
61: const ControlView        = React.lazy(() => import('../control/ControlView').then(m => ({ default: m.ControlView })));
62: const UploadView         = React.lazy(() => import('../upload/UploadView').then(m => ({ default: m.UploadView })));
63: const WelcomeView        = React.lazy(() => import('../welcome/WelcomeView').then(m => ({ default: m.WelcomeView })));
64: const InventoryView      = React.lazy(() => import('../inventory/InventoryView').then(m => ({ default: m.InventoryView })));
65: const LogisticsView      = React.lazy(() => import('../logistics/LogisticsView').then(m => ({ default: m.LogisticsView })));
66: const FinanceView        = React.lazy(() => import('../finance/FinanceView').then(m => ({ default: m.FinanceView })));
67: const AdminDashboard     = React.lazy(() => import('../dashboard/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
68: const ClientOverview     = React.lazy(() => import('../dashboard/ClientOverview').then(m => ({ default: m.ClientOverview })));
69: const ArchivedView       = React.lazy(() => import('../archived/ArchivedView').then(m => ({ default: m.ArchivedView })));   // replaces WorkbookView (Archived module: ARCHIVE 825 only)
70: const StoreView          = React.lazy(() => import('../store/StoreView').then(m => ({ default: m.StoreView })));
71: const RegStorePreview    = React.lazy(() => import('../store/RegStorePreview').then(m => ({ default: m.RegStorePreview })));
72: const PackingModule      = React.lazy(() => import('../logistics/PackingModule').then(m => ({ default: m.PackingModule })));
73: const DeployedView       = React.lazy(() => import('../logistics/DeployedView').then(m => ({ default: m.DeployedView })));
74: const ProcessView        = React.lazy(() => import('../process/ProcessView').then(m => ({ default: m.ProcessView })));
75: const ThreeDAppView      = React.lazy(() => import('../threed/ThreeDView').then(m => ({ default: m.ThreeDAppView })));
76: const ViewerView         = React.lazy(() => import('../viewer/ViewerView').then(m => ({ default: m.ViewerView })));
77: const OnyxAgentPage      = React.lazy(() => import('../onyxAgent/OnyxAgentPage').then(m => ({ default: m.OnyxAgentPage })));   // replaces the three.js OnyxOrbView
78: const StudioSettingsPortal = React.lazy(() => import('./StudioSettingsPortal').then(m => ({ default: m.StudioSettingsPortal })));
79: const InventoryArtifact  = React.lazy(() => import('../inventory/InventoryArtifact').then(m => ({ default: m.InventoryArtifact })));
80: const PaymentsArtifact   = React.lazy(() => import('../finance/PaymentsArtifact').then(m => ({ default: m.PaymentsArtifact })));
81: const BatchActionsModal  = React.lazy(() => import('../catalog/BatchActionsModal').then(m => ({ default: m.BatchActionsModal })));
82: const UploadWizard       = React.lazy(() => import('../inventory/UploadWizard').then(m => ({ default: m.UploadWizard })));
83: const BatchProcessingWizard = React.lazy(() => import('../inventory/BatchProcessingWizard').then(m => ({ default: m.BatchProcessingWizard })));
84: const LabelWizard        = React.lazy(() => import('../logistics/LabelWizard').then(m => ({ default: m.LabelWizard })));
85: const NFCWizard          = React.lazy(() => import('../logistics/LabelWizard').then(m => ({ default: m.NFCWizard })));
86: const PackWizard         = React.lazy(() => import('../logistics/PackWizard').then(m => ({ default: m.PackWizard })));
87: const CratePackingManager = React.lazy(() => import('../logistics/CratePackingManager').then(m => ({ default: m.CratePackingManager })));
88: const ItemsPayWizard     = React.lazy(() => import('../finance/ItemsPayWizard').then(m => ({ default: m.ItemsPayWizard })));
89: const DevicesView        = React.lazy(() => import('../pico/devices/DevicesView').then(m => ({ default: m.DevicesView })));
90: // ──────────────────────────────────────────────────────────────────────────────
91: 
92: /** Module-level constant — avoids re-creating this object on every NavItemWithSubmenu render */
93: const ICON_MAP: Record<string, React.FC<any>> = {
94:     truck: Truck,
95:     package: Package,
96:     'map-pin': MapPin,
97:     shield: Shield,
98:     'badge-dollar-sign': BadgeDollarSign,
99:     layers: Layers,
100:     box: Box,
101:     cuboid: Cuboid,
102:     zap: Zap,
103:     pipette: Pipette,
104:     'rotate-3d': Rotate3d,
105:     'bar-chart-3': BarChart3,
106:     'layout-dashboard': LayoutDashboard,
107:     'credit-card': CreditCard
108: };
109: 
110: 
111: 
112: declare const __APP_VERSION__: string;
113: 
114: interface NavItemWithSubmenuProps {
115:     viewId: string;
116:     label: string;
117:     icon: string;
118:     subItems: {
119:         id: string;
120:         label: string;
121:         action: () => void;
122:         isActive: boolean;
123:         icon: string;
124:     }[];
125: }
126: 
127: const NavItemWithSubmenu: React.FC<NavItemWithSubmenuProps> = React.memo(({ viewId, label, icon, subItems }) => {
128:     const [activeView] = useAtom(activeViewAtom);
129:     const [activeSubMenu, setActiveSubMenu] = useAtom(activeSubMenuAtom);
130:     const sidebarState = useAtomValue(sidebarStateAtom);
131: 
132:     const isOpen = activeSubMenu === viewId;
133:     const isParentActive = activeView === viewId;
134: 
135:     // Use module-level ICON_MAP — not recreated on every render
136:     const NavIcon = ICON_MAP[icon] || Truck;
137: 
138:     const handleToggle = () => {
139:         setActiveSubMenu(isOpen ? null : viewId);
140:     };
141: 
142:     return (
143:         <>
144:             <li className={`sidebar-list-item ${isParentActive ? 'active' : ''} ${isOpen ? 'open' : ''}`} onClick={handleToggle}>
145:                 <div className="sidebar-list-item-main">
146:                     <NavIcon size={20} strokeWidth={1.75} />
147:                     <span className="sidebar-list-item-text">{label}</span>
148:                 </div>
149:                 <ChevronRight size={14} strokeWidth={2} className={`chevron transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
150:                 {/* Tooltip for compact mode */}
151:                 <span className="sidebar-compact-tooltip">{label}</span>
152:                 {/* Pop-out submenu for compact mode */}
153:                 {sidebarState === 'compact' && (
154:                     <ul className="sidebar-submenu">
155:                         {subItems.map(item => {
156:                             const SubIcon = ICON_MAP[item.icon] || Package;
157:                             return (
158:                                 <li key={item.id}>
159:                                     <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
160:                                         <SubIcon size={15} strokeWidth={1.75} className="submenu-icon" />
161:                                         <span>{item.label}</span>
162:                                     </a>
163:                                 </li>
164:                             );
165:                         })}
166:                     </ul>
167:                 )}
168:             </li>
169:             {/* Standard slide-down submenu */}
170:             {sidebarState !== 'compact' && (
171:                 <ul className="sidebar-submenu">
172:                     {subItems.map(item => {
173:                         const SubIcon = ICON_MAP[item.icon] || Package;
174:                         return (
175:                             <li key={item.id}>
176:                                 <a className={`sidebar-submenu-item ${item.isActive ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); item.action(); }}>
177:                                     <SubIcon size={15} strokeWidth={1.75} className="submenu-icon" />
178:                                     <span>{item.label}</span>
179:                                 </a>
180:                             </li>
181:                         );
182:                     })}
183:                 </ul>
184:             )}
185:         </>
186:     );
187: });
188: 
189: export function MainAppView() {
190:     const t = useTranslation();
191:     const islandOn = useAtomValue(islandCommandsEnabledAtom);
192:     // Publish the top bar's height so the page can flow under it (topbarOverlay.css).
193:     const appContentRef = useRef<HTMLDivElement | null>(null);
194:     useLayoutEffect(() => {
195:         const host = appContentRef.current;
196:         const bar = host?.querySelector<HTMLElement>(':scope > .app-topbar');
197:         if (!host || !bar) return;
198:         const apply = () => host.style.setProperty('--app-topbar-h', `${bar.offsetHeight}px`);
199:         apply();
200:         const ro = new ResizeObserver(apply);
201:         ro.observe(bar);
202:         return () => ro.disconnect();
203:     }, []);
204:     const [user] = useAtom(userAtom);
205:     const [activeView, setActiveView] = useAtom(activeViewAtom);
206:     const setUniversalView = useSetAtom(universalViewAtom);
207:     const setTagId = useSetAtom(tagIdAtom);
208:     const workflowStep = useAtomValue(workflowStepAtom);
209:     const isEditingMask = useAtomValue(isEditingMaskAtom);
210:     const [is3DWorkspaceOpen, setIs3DWorkspaceOpen] = useAtom(is3DWorkspaceOpenAtom);
211:     const sidebarState = useAtomValue(sidebarStateAtom);
212:     const setSidebarState = useSetAtom(sidebarStateAtom);
213:     const [logisticsSubTab, setLogisticsSubTab] = useAtom(logisticsSubTabAtom);
214:     const [financeSubTab, setFinanceSubTab] = useAtom(financeSubTabAtom);
215:     const [isDummyMode, setIsDummyMode] = useAtom(isDummyModeAtom);
216:     const [isSettingsOpen, setIsSettingsOpen] = useAtom(isStudioSettingsOpenAtom);
217:     
218:     const setInventoryArtifactConfig = useSetAtom(inventoryArtifactConfigAtom);
219:     const setPaymentsArtifactConfig = useSetAtom(paymentsArtifactConfigAtom);
220:     const setIsFinanceScrolled = useSetAtom(isFinanceScrolledAtom);
221: 
222:     // OnyxChan Remote State Control — listens for Supabase Realtime broadcasts
223:     useRemoteControl();
224: 
225:     // Deep Link Effect
226:     useEffect(() => {
227:         const params = new URLSearchParams(window.location.search);
228:         let updated = false;
229: 
230:         const artifact = params.get('artifact');
231:         const ids = params.get('ids');
232:         const tagid = params.get('tagid');
233: 
234:         if (artifact === 'inventory' && ids) {
235:             setInventoryArtifactConfig({
236:                 isOpen: true,
237:                 itemIds: ids.split(',').filter(Boolean),
238:                 title: 'Shared Inventory Items'
239:             });
240:         } else if (tagid && user) {
241:             import('../../lib/supabase').then(async ({ supabase }) => {
242:                 const { data } = await supabase.from('inventory').select('id').eq('book_barcode', tagid).maybeSingle();
243:                 if (data) {
244:                     setInventoryArtifactConfig({
245:                         isOpen: true,
246:                         itemIds: [String(data.id)],
247:                         title: `Item: ${tagid}`
248:                     });
249:                 }
250:             });
251:         }
252: 
253:         const inventoryIds = params.get('inventoryArtifactIds');
254:         if (inventoryIds) {
255:             setInventoryArtifactConfig({
256:                 isOpen: true,
257:                 itemIds: inventoryIds.split(',').filter(Boolean),
258:                 title: 'Linked Items'
259:             });
260:             params.delete('inventoryArtifactIds');
261:             updated = true;
262:         }
263: 
264:         const paymentId = params.get('paymentsArtifactPaymentId');
265:         if (paymentId) {
266:             const vendor = params.get('paymentsArtifactVendor') || 'Vendor Details';
267:             setPaymentsArtifactConfig({
268:                 isOpen: true,
269:                 vendor,
270:                 paymentIds: [paymentId],
271:                 title: `Payment History: ${vendor}`
272:             });
273:             params.delete('paymentsArtifactPaymentId');
274:             params.delete('paymentsArtifactVendor');
275:             updated = true;
276:         }
277: 
278:         if (updated) {
279:             const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
280:             window.history.replaceState(null, '', newUrl);
281:         }
282:     }, [setInventoryArtifactConfig, setPaymentsArtifactConfig, user]);
283: 
284:     useEffect(() => {
285:         // rAF-throttled resize handler — fires at most once per frame instead of every pixel
286:         let rafId: number | null = null;
287:         const handleResize = () => {
288:             if (rafId !== null) return;
289:             rafId = requestAnimationFrame(() => {
290:                 rafId = null;
291:                 if (window.innerWidth <= 768) {
292:                     setSidebarState(current => {
293:                         if (current !== 'hidden') return 'hidden';
294:                         return current;
295:                     });
296:                 }
297:             });
298:         };
299:         window.addEventListener('resize', handleResize, { passive: true });
300:         return () => {
301:             window.removeEventListener('resize', handleResize);
302:             if (rafId !== null) cancelAnimationFrame(rafId);
303:         };
304:     }, [setSidebarState]);
305: 
306:     useEffect(() => {
307:         const clientRoles: UserRole[] = ['ClientBoss', 'ClientAccounting', 'ClientViewer'];
308:         if (clientRoles.includes(user?.role as UserRole)) {
309:             const alwaysDummy = ['upload', 'process'];
310:             const isViewerInventory = user?.role === 'ClientViewer' && activeView === 'inventory';
311:             setIsDummyMode(alwaysDummy.includes(activeView as string) || isViewerInventory);
312:         } else {
313:             setIsDummyMode(false);
314:         }
315:     }, [user, activeView, setIsDummyMode]);
316: 
317:     useEffect(() => {
318:         const handleKeyDown = (e: KeyboardEvent) => {
319:             if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p' || e.key === 'O' || e.key === 'o')) {
320:                 e.preventDefault();
321:                 setActiveView('pico-bridge');
322:             }
323:         };
324:         window.addEventListener('keydown', handleKeyDown);
325:         if (window.location.search.includes('view=pico-bridge') || window.location.pathname === '/pico-bridge') {
326:             setActiveView('pico-bridge');
327:         }
328:         return () => window.removeEventListener('keydown', handleKeyDown);
329:     }, [setActiveView]);
330: 
331:     const pageContent = (() => {
332:         if (isEditingMask || workflowStep === 'fullscreenEdit' || workflowStep === 'fullscreenView') {
333:             return (
334:                 <div className="glass-overlay-fullscreen flex flex-col p-4 md:p-12 z-[450]">
335:                     <div className="w-full h-full glass-panel flex flex-col overflow-hidden relative shadow-2xl rounded-3xl border border-white/20 bg-black/40">
336:                         <div className="flex grow flex-col overflow-hidden relative">
337:                             <Content />
338:                         </div>
339:                         <ExtraModeControls />
340:                     </div>
341:                 </div>
342:             );
343:         }
344: 
345:         // Each case is wrapped in Suspense at the switch level — chunk downloads
346:         // show the ViewSkeleton while the JS is loading.
347:         switch (activeView as string) {
348:             case 'control': return <ControlView />;
349:             case 'dashboard': return (user?.role === 'Developer' || user?.role === 'Admin') ? <AdminDashboard /> : <InventoryView />;
350:             // Overview summarises finances and inventory: Admin and Developer only (never vendors or client roles).
351:             case 'overview': return (user?.role === 'Developer' || user?.role === 'Admin') ? <AdminDashboard /> : <InventoryView />;
352:             // Workbook holds the 326 book and the ARCHIVE 825 tab (finance, production, logistics tabs inside): Admin and Developer only.
353:             case 'workbook': return (user?.role === 'Developer' || user?.role === 'Admin') ? <ArchivedView /> : <InventoryView />;
354:             case 'upload': return <UploadView />;
355:             case 'welcome': return <WelcomeView />;
356:             case 'inventory': return <InventoryView />;
357:             case 'warehouse':
358:             case 'trucking':
359:             case 'logistics': return <LogisticsView />;
360:             case 'deployed': return <DeployedView />;
361:             case 'packing': return <PackingModule />;
362:             case 'finance': return <FinanceView />;
363:             case 'store': return <StoreView />;
364:             case 'process': return <ProcessView />;
365:             case 'threed': return <ThreeDAppView />;
366:             case 'viewer':
367:                 return <ViewerView onOpenArtifact={(id) => { setUniversalView('tag'); setTagId(id); }} />;
368:             case 'onyx': return <OnyxAgentPage />;
369:             case 'onyx-reg': return <RegStorePreview />;
370:             case 'pico-bridge': return <DevicesView />;
371:             case 'devices': return <DevicesView />;
372: 
373:             default:
374:                 return <InventoryView />;
375:         }
376:     })();
377: 
378:     const handleSidebarStateToggle = () => {
379:         setSidebarState(current => {
380:             const states: SidebarState[] = ['expanded', 'compact', 'hidden'];
381:             const isMobile = window.innerWidth <= 768;
382:             if (isMobile) return current === 'hidden' ? 'compact' : 'hidden';
383:             const currentIndex = states.indexOf(current);
384:             const nextIndex = (currentIndex + 1) % states.length;
385:             return states[nextIndex];
386:         });
387:     };
388: 
389:     const sidebarWidth = sidebarState === 'expanded' ? '240px' : sidebarState === 'compact' ? '80px' : '0px';
390: 
391:     return (
392:         <>
393:             <DataSyncProvider />
394:             <HeroBackground />
395: 
396:             <div 
397:                 className={`app-container sidebar-${sidebarState}`}
398:                 style={{ '--sidebar-width': sidebarWidth } as React.CSSProperties}
399:             >
400:                 <div className="sidebar border-none bg-transparent">
401:                     <div className={`sidebar-header mb-12! border-none bg-transparent flex flex-col items-center ${sidebarState === 'expanded' ? 'pt-10' : 'pt-10 px-4'}`}>
402:                         <div
403:                             className={`sidebar-logo p-0! cursor-pointer! hover:scale-105 active:scale-95 transition-all flex items-center w-full ${sidebarState === 'expanded' ? 'flex-col gap-2' : 'justify-center'}`}
404:                             onClick={handleSidebarStateToggle}
405:                             title={tr("Toggle Sidebar")}
406:                         >
407:                             {sidebarState === 'expanded' && (
408:                                 <>
409:                                     <OnyxLogo className="w-16 h-16 transition-transform duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
410:                                     <div className="flex flex-col items-center mb-6">
411:                                         <span className="sidebar-logo-text text-[11px]! font-bold! tracking-[0.2em]! opacity-90! text-(--text-color) opacity-80">Onyx.mx</span>
412:                                     </div>
413:                                 </>
414:                             )}
415:                             {sidebarState === 'compact' && <OnyxMiniLogo className="w-12 h-12 transition-transform duration-300" />}
416:                         </div>
417:                     </div>
418:                     <ul className="sidebar-list">
419:                         {/* ── ONYX INTELLIGENCE (DISABLED) ── 
420:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
421:                             <li className={`sidebar-list-item ${activeView === 'onyx' ? 'active' : ''}`} onClick={() => { setActiveView('onyx'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
422:                                 <div className="sidebar-list-item-main">
423:                                     <Brain size={20} strokeWidth={1.75} className="text-(--main-color)" />
424:                                     <span className="sidebar-list-item-text font-bold">Onyx Intelligence</span>
425:                                 </div>
426:                                 <span className="sidebar-compact-tooltip">Onyx Intelligence</span>
427:                             </li>
428:                         )}
429:                         */}
430: 
431:                         {/* ── ADMIN ── */}
432:                         {user?.role === 'Developer' && (
433:                             <NavItemWithSubmenu 
434:                                 viewId="admin"
435:                                 label={tr("Admin")}
436:                                 icon="shield"
437:                                 subItems={[
438:                                     { id: 'control', label: 'Control Center', icon: 'shield', action: () => { setActiveView('control'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'control' }
439:                                 ]}
440:                             />
441:                         )}
442: 
443:                         {/* ── DASHBOARD (acquisition, expense and inventory graphs): Admin and Developer only ── */}
444:                         {(user?.role === 'Developer' || user?.role === 'Admin') && (
445:                             <li className={`sidebar-list-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveView('dashboard'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
446:                                 <div className="sidebar-list-item-main">
447:                                     <LayoutDashboard size={20} strokeWidth={1.75} />
448:                                     <span className="sidebar-list-item-text">{tr("Dashboard")}</span>
449:                                 </div>
450:                                 <span className="sidebar-compact-tooltip">{tr("Dashboard")}</span>
451:                             </li>
452:                         )}
453:                         {/* ── WORKBOOK (326 book, ARCHIVE 825, finance, production, logistics tabs): Admin and Developer only ── */}
454:                         {(user?.role === 'Developer' || user?.role === 'Admin') && (
455:                             <li className={`sidebar-list-item ${activeView === 'workbook' ? 'active' : ''}`} onClick={() => { setActiveView('workbook'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
456:                                 <div className="sidebar-list-item-main">
457:                                     <Layers size={20} strokeWidth={1.75} />
458:                                     <span className="sidebar-list-item-text">{tr("Archived")}</span>
459:                                 </div>
460:                                 <span className="sidebar-compact-tooltip">{tr("Archived")}</span>
461:                             </li>
462:                         )}
463: 
464:                         {/* ── FINANCES ── */}
465:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientAccounting') && (
466:                             <li className={`sidebar-list-item ${activeView === 'finance' ? 'active' : ''}`} onClick={() => { setActiveView('finance'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
467:                                 <div className="sidebar-list-item-main">
468:                                     <BadgeDollarSign size={20} strokeWidth={1.75} />
469:                                     <span className="sidebar-list-item-text">{tr("Finances")}</span>
470:                                 </div>
471:                                 <span className="sidebar-compact-tooltip">{tr("Finances")}</span>
472:                             </li>
473:                         )}
474:                         {/* ── ONYX.MX-REG (Store UI Clone) - HIDDEN ── */}
475:                         {/* 
476:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
477:                             <li className={`sidebar-list-item ${activeView === 'onyx-reg' ? 'active' : ''}`} onClick={() => { setActiveView('onyx-reg'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
478:                                 <div className="sidebar-list-item-main">
479:                                     <Store size={20} strokeWidth={1.75} className="text-amber-500" />
480:                                     <span className="sidebar-list-item-text font-bold text-amber-600">Onyx.mx-REG</span>
481:                                 </div>
482:                                 <span className="sidebar-compact-tooltip">Onyx.mx-REG</span>
483:                             </li>
484:                         )}
485:                         */}
486:                         {/* ── DEVICES ── */}
487:                         {(user?.role === 'Developer' || user?.role === 'Admin') && (
488:                             <li className={`sidebar-list-item ${activeView === 'devices' ? 'active' : ''}`} onClick={() => { setActiveView('devices'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
489:                                 <div className="sidebar-list-item-main">
490:                                     <Cpu size={20} strokeWidth={1.75} />
491:                                     <span className="sidebar-list-item-text">{tr("Devices")}</span>
492:                                 </div>
493:                                 <span className="sidebar-compact-tooltip">{tr("Devices")}</span>
494:                             </li>
495:                         )}
496:                         {/* ── INVENTORY ── */}
497:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
498:                             <li className={`sidebar-list-item ${activeView === 'inventory' ? 'active' : ''}`} onClick={() => { setActiveView('inventory'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
499:                                 <div className="sidebar-list-item-main">
500:                                     <Album size={20} strokeWidth={1.75} />
501:                                     <span className="sidebar-list-item-text">{tr("Inventory")}</span>
502:                                 </div>
503:                                 <span className="sidebar-compact-tooltip">{tr("Inventory")}</span>
504:                             </li>
505:                         )}
506: 
507: 
508: 
509:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
510:                             <li className={`sidebar-list-item ${activeView === 'warehouse' ? 'active' : ''}`} onClick={() => { setActiveView('warehouse'); setLogisticsSubTab('empty'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
511:                                 <div className="sidebar-list-item-main">
512:                                     <Package size={20} strokeWidth={1.75} />
513:                                     <span className="sidebar-list-item-text">{tr("Warehouse")}</span>
514:                                 </div>
515:                                 <span className="sidebar-compact-tooltip">{tr("Warehouse")}</span>
516:                             </li>
517:                         )}
518: 
519:                         {/* ── TRUCKING ── */}
520:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && (
521:                             <li className={`sidebar-list-item ${activeView === 'trucking' ? 'active' : ''}`} onClick={() => { setActiveView('trucking'); setLogisticsSubTab('shipping'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
522:                                 <div className="sidebar-list-item-main">
523:                                     <Truck size={20} strokeWidth={1.75} />
524:                                     <span className="sidebar-list-item-text">{tr("Trucking")}</span>
525:                                 </div>
526:                                 <span className="sidebar-compact-tooltip">{tr("Trucking")}</span>
527:                             </li>
528:                         )}
529: 
530:                         {/* ── LABS ── */}
531:                         {(user?.role === 'Developer' || user?.role === 'Admin') && (
532:                             <NavItemWithSubmenu 
533:                                 viewId="labs"
534:                                 label={tr("Labs")}
535:                                 icon="layers"
536:                                 subItems={[
537:                                     { id: 'process', label: 'Process', icon: 'pipette', action: () => { setActiveView('process'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'process' },
538:                                     { id: 'threed', label: '3D and AR', icon: 'rotate-3d', action: () => { setActiveView('threed'); if (window.innerWidth <= 768) setSidebarState('hidden'); }, isActive: activeView === 'threed' }
539:                                 ]}
540:                             />
541:                         )}
542:                         
543:                         {/* ── LEGACY VIEWER (Internal) ── */}
544:                         {(user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss' || user?.role === 'ClientViewer' || user?.role === 'Vendor') && (
545:                             <li className={`sidebar-list-item ${activeView === 'viewer' ? 'active' : ''}`} onClick={() => { setActiveView('viewer'); if (window.innerWidth <= 768) setSidebarState('hidden'); }}>
546:                                 <div className="sidebar-list-item-main">
547:                                     <Shell size={20} strokeWidth={1.75} />
548:                                     <span className="sidebar-list-item-text">{tr("Viewer")}</span>
549:                                 </div>
550:                                 <span className="sidebar-compact-tooltip">{tr("Viewer")}</span>
551:                             </li>
552:                         )}
553:                     </ul>
554: 
555:                     {/* Studio Settings Trigger at bottom of sidebar */}
556:                     <div 
557:                         className={`mt-auto flex flex-col items-center justify-center p-4 pb-8 border-t border-(--border-color) shrink-0 relative overflow-hidden cursor-pointer transition-all group ${isSettingsOpen ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'}`}
558:                         onClick={() => setIsSettingsOpen(true)}
559:                         title={tr("Studio Settings & Manifesto")}
560:                     >
561:                         {sidebarState === 'expanded' && (
562:                             <>
563:                                 <OnyxMiniLogo className={`w-8 h-8 transition-all duration-500 group-hover:scale-110 ${isSettingsOpen ? 'rotate-90' : 'opacity-80 group-hover:opacity-100'}`} />
564:                                 <div className="mt-4">
565:                                     <SyncStatusBadge />
566:                                 </div>
567:                             </>
568:                         )}
569:                         {sidebarState === 'compact' && (
570:                             <>
571:                                 <OnyxMiniLogo className={`w-7 h-7 transition-all duration-500 group-hover:scale-110 ${isSettingsOpen ? 'rotate-90' : 'opacity-80 group-hover:opacity-100'}`} />
572:                                 <div className="mt-3 scale-75 origin-center">
573:                                     <SyncStatusBadge />
574:                                 </div>
575:                             </>
576:                         )}
577:                     </div>
578:                 </div>
579:                 <div 
580:                     ref={appContentRef}
581:                     className="app-content flex-1 min-h-0 overflow-y-auto scroll-smooth p-0 m-0 relative"
582:                     onScroll={(e) => {
583:                         const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
584:                         if (activeView === 'finance') {
585:                             if (scrollTop > 100) setIsFinanceScrolled(true);
586:                             else setIsFinanceScrolled(false);
587:                         }
588:                     }}
589:                 >
590:                     {/* app-topbar: the band that paints behind the iOS status bar.
591:                         It is sticky at top:0 inside the scroller, so with
592:                         viewport-fit=cover its background already reaches the top
593:                         of the display — the class makes that explicit and pays
594:                         the inset back as padding, so the bar's CONTENT clears the
595:                         clock and the notch while its GLASS runs underneath. */}
596:                     <LiquidBar className={`app-topbar ${islandOn ? 'app-topbar--island' : ''} sticky top-0 z-[500] w-full flex flex-col bg-white/[0.01] backdrop-blur-2xl border-b border-white/10 shadow-2xl`}>
597:                         <MainHeader />
598:                         <UniversalToolsBar />
599:                         {activeView === 'workbook' && !islandOn && <ArchivedToolsBar />}
600:                     </LiquidBar>
```
