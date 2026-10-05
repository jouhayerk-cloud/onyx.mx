import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { 
    Search, X, LayoutList, LayoutGrid, Layout, ArrowUpDown, ArrowUp, ArrowDown, 
    Palette, Shapes, Plus, PackageCheck, PackageOpen, Send, PackageX, Tag, Activity, DollarSign,
    ChevronDown, Filter, LayoutTemplate
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import { CONTENT_FILTERS, countContent, type ContentKey } from '../../lib/aiContent';
import { buildGeometryTree, buildMaterialColorTree, toggleKey, type SmartFilterNode } from '../../lib/smartFilters';
import { GEOMETRIES, GEOMETRY_LABELS, type Geometry } from '../../lib/geometry';
import { GeometryIcon } from './shapeIcons';
import { vendors } from '../../lib/consts';
import { islandCommandsEnabledAtom } from '../../lib/toolRegistry';

import {
    isInventoryViewSliderOpenAtom,
    inventoryViewSliderAtom,
    inventoryViewModeAtom,
    inventorySortKeyAtom,
    inventorySortOrderAtom,
    inventorySearchTermAtom,
    isInventorySearchOpenAtom,
    inventoryToolsOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    inventoryStatusFilterAtom,
    inventoryContentFilterAtom,
    inventoryVendorFilterAtom,
    activeVendorsAtom,
    inventoryAtom,
    isInventorySmartFiltersOpenAtom,
    isInventoryMaterialColorFilterOpenAtom,
    isInventoryShapeFilterOpenAtom,
    inventoryMaterialColorFilterAtom,
    inventoryShapeFilterAtom
} from '../../lib/atoms';

const LABEL_TO_GEOMETRY = new Map<string, Geometry>(GEOMETRIES.map(g => [GEOMETRY_LABELS[g], g]));

const SmartFilterGroup: React.FC<{
    title: string;
    tree: SmartFilterNode[];
    selected: string[];
    onToggle: (key: string) => void;
    onClear: () => void;
    renderIcon?: (node: SmartFilterNode) => React.ReactNode;
    primary?: boolean;
}> = ({ title, tree, selected, onToggle, onClear, renderIcon, primary }) => {
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    const sel = new Set(selected || []);
    const activeCount = (selected || []).length;

    if (tree.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-3 flex-wrap">
                <span className={`font-black uppercase tracking-[0.2em] opacity-40 leading-none ${primary ? 'text-[9px]' : 'text-[8px]'}`}>{title}</span>
                {activeCount > 0 && (
                    <button onClick={onClear}
                        className="smart-clear text-[8px] font-black uppercase tracking-[0.16em] px-2 py-0.5 rounded-md"
                        title={tr("Clear this filter")}>
                        {tr("Clear")} {activeCount}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-start gap-1.5 w-full">
                {tree.map(node => {
                    const isOpen = expanded.has(node.key);
                    const isSel = sel.has(node.key);
                    return (
                        <div key={node.key} className="flex flex-col gap-1">
                            <div className="flex items-stretch">
                                <button
                                    onClick={() => onToggle(node.key)}
                                    aria-pressed={isSel}
                                    className={`smart-chip flex items-center gap-1.5 rounded-l-lg font-black uppercase tracking-[0.1em] ${primary ? 'smart-chip-primary px-3 py-2 text-[10px]' : 'px-2.5 py-1.5 text-[9px]'}`}
                                    title={`Filter by ${node.label}`}
                                >
                                    {renderIcon?.(node)}
                                    {node.label}
                                    <span className="smart-count tabular-nums opacity-50">{node.count}</span>
                                </button>
                                {node.children.length > 0 && (
                                    <button
                                        onClick={() => setExpanded(p => {
                                            const n = new Set(p);
                                            n.has(node.key) ? n.delete(node.key) : n.add(node.key);
                                            return n;
                                        })}
                                        aria-pressed={isOpen}
                                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`}
                                        className="smart-expand flex items-center justify-center px-1.5 rounded-r-lg"
                                        title={`${node.children.length} sub-filter${node.children.length !== 1 ? 's' : ''}`}
                                    >
                                        <ChevronDown size={13} strokeWidth={3}
                                            className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                    </button>
                                )}
                            </div>

                            {isOpen && (
                                <div className="smart-children flex flex-wrap gap-1 pl-2 ml-1 animate-in fade-in duration-200">
                                    {node.children.map(child => (
                                        <button
                                            key={child.key}
                                            onClick={() => onToggle(child.key)}
                                            aria-pressed={sel.has(child.key)}
                                            className="smart-chip smart-chip-child flex items-center gap-1.5 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-[0.08em]"
                                            title={`Filter by ${node.label} / ${child.label}`}
                                        >
                                            {child.label}
                                            <span className="smart-count tabular-nums opacity-50">{child.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const InventorySearchPanel: React.FC = () => {
    const [invSearchTerm, setInvSearchTerm] = useAtom(inventorySearchTermAtom);

    return (
        <div className="flex items-center gap-6 group transition-all w-full flex-wrap p-4">
            <Search size={28} strokeWidth={3} className="text-(--main-color) drop-shadow-[0_0_10px_rgba(var(--main-color-rgb),0.5)]" />
            <input autoFocus type="text" value={invSearchTerm} onChange={(e) => setInvSearchTerm(e.target.value)} placeholder={tr("SEARCH INVENTORY...")} className="bg-transparent border-none text-white text-2xl font-black placeholder:text-white/10 outline-none flex-1 tracking-tight min-w-[200px]" />
            {invSearchTerm && <button onClick={() => setInvSearchTerm('')} className="text-white hover:text-red-500 transition-all p-2"><X size={28} strokeWidth={3} /></button>}
        </div>
    );
};

export const InventoryViewPanel: React.FC = () => {
    const [invSlider, setInvSlider] = useAtom(inventoryViewSliderAtom);
    const [, setInvMode] = useAtom(inventoryViewModeAtom);
    const [invSortKey, setInvSortKey] = useAtom(inventorySortKeyAtom);
    const [invSortOrder, setInvSortOrder] = useAtom(inventorySortOrderAtom);

    const handleToggleDensity = () => {
        if (invSlider <= 33) {
            setInvSlider(50);
            setInvMode('grid');
        } else if (invSlider <= 66) {
            setInvSlider(85);
            setInvMode('gallery');
        } else {
            setInvSlider(15);
            setInvMode('list');
        }
    };

    return (
        <div className="flex flex-col w-full animate-in slide-in-from-top-4 duration-500 py-2 gap-6 p-4">
            <div className="flex flex-wrap items-center gap-8 w-full justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                    <button 
                        onClick={handleToggleDensity}
                        className="relative w-12 h-12 flex items-center justify-center overflow-hidden group/view transition-transform active:scale-90"
                    >
                        <div className="transition-all duration-300 ease-out flex items-center justify-center"
                             style={{ 
                                 transform: `scale(${1 + (invSlider / 100) * 0.8})`,
                                 color: invSlider > 66 ? 'var(--main-color)' : 'white'
                             }}>
                            {invSlider <= 33 ? <LayoutList size={24} strokeWidth={2.5} /> : 
                             invSlider <= 66 ? <LayoutGrid size={24} strokeWidth={2.5} /> : 
                             <Layout size={24} strokeWidth={2.5} />}
                        </div>
                        <div className="absolute inset-0 opacity-20 transition-all duration-500"
                             style={{ 
                                 background: `radial-gradient(circle, var(--main-color) 0%, transparent 70%)`,
                                 opacity: (invSlider / 100) * 0.3
                             }} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] leading-none mb-1">{tr("Density")}</span>
                        <span className="text-[14px] font-black text-white uppercase tracking-tighter">
                            {invSlider <= 33 ? tr("Compact") : invSlider <= 66 ? tr("Standard") : tr("Spacious")}
                        </span>
                    </div>
                </div>
                <div className="flex-1 relative flex items-center group px-4 min-w-[200px]">
                    <div className="absolute left-4 right-4 h-1.5 bg-white/5 rounded-full" />
                    <div className="absolute left-4 h-1.5 bg-white/20 rounded-full transition-all duration-300" 
                         style={{ width: `calc(${(invSlider / 100) * 100}% - 8px)` }} />
                    <input 
                        type="range" min="1" max="100" step="1" value={invSlider} 
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setInvSlider(val);
                            if (val <= 33) setInvMode('list');
                            else if (val <= 66) setInvMode('grid');
                            else setInvMode('gallery');
                        }}
                        className="w-full h-8 bg-transparent appearance-none cursor-pointer relative z-10 
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 
                                   [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(255,255,255,0.5)]
                                   [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:transition-transform"
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 w-full">
                <div className="flex items-center gap-2 text-white/20 uppercase font-black text-[9px] tracking-[0.2em]">
                    <ArrowUpDown size={17} />
                    <span>{tr("SORT BY")}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { key: 'Date', label: tr("DATE") },
                        { key: 'Vendor', label: 'VENDOR' },
                        { key: 'Status', label: tr("STATUS") },
                        { key: 'Number', label: tr("NUM") },
                        { key: 'Value', label: tr("VALUE") },
                        { key: 'Qty', label: 'QTY' }
                    ].map(sort => (
                    <div key={sort.key} className="tool-cell flex flex-col items-center gap-1">
                        <button
                            aria-pressed={invSortKey === sort.key}
                            title={sort.label}
                            onClick={() => {
                                if (invSortKey === sort.key) setInvSortOrder(invSortOrder === 'asc' ? 'desc' : 'asc');
                                else { setInvSortKey(sort.key as any); setInvSortOrder('desc'); }
                            }}
                            className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all">
                            {invSortKey === sort.key
                                ? (invSortOrder === 'asc' ? <ArrowUp size={18} strokeWidth={3} /> : <ArrowDown size={18} strokeWidth={3} />)
                                : <ArrowUpDown size={18} strokeWidth={2.2} />}
                        </button>
                        <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none">{sort.label}</span>
                    </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const InventorySmartFiltersPanel: React.FC = () => {
    const [materialColorOpen, setMaterialColorOpen] = useAtom(isInventoryMaterialColorFilterOpenAtom);
    const [shapeFilterOpen, setShapeFilterOpen] = useAtom(isInventoryShapeFilterOpenAtom);
    const [shapeSel, setShapeSel] = useAtom(inventoryShapeFilterAtom);
    const [materialColorSel, setMaterialColorSel] = useAtom(inventoryMaterialColorFilterAtom);
    const inventoryRows = useAtomValue(inventoryAtom);

    const shapeTree = React.useMemo(() => buildGeometryTree(inventoryRows || []), [inventoryRows]);
    const materialColorTree = React.useMemo(() => buildMaterialColorTree(inventoryRows || []), [inventoryRows]);

    return (
        <div className="smart-filters w-full animate-in slide-in-from-top duration-300 flex flex-col p-4">
            <div className="smart-filter-deploy flex flex-wrap items-center gap-4 pb-2">
                <button
                    onClick={() => setMaterialColorOpen(!materialColorOpen)}
                    aria-pressed={materialColorOpen}
                    className="smart-deploy-key flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.16em]"
                    title={tr("Material / Colour — main filter")}
                >
                    <Palette size={13} strokeWidth={2.4} />
                    {tr("Material / Colour")}
                </button>
                <button
                    onClick={() => setShapeFilterOpen(!shapeFilterOpen)}
                    aria-pressed={shapeFilterOpen}
                    className="smart-deploy-key flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.16em]"
                    title={tr("Shape — sub filter")}
                >
                    <Shapes size={13} strokeWidth={2.4} />
                    {tr("Shape")}
                </button>
            </div>

            {materialColorOpen && (
                <div className="smart-filters-main py-2 w-full">
                    <SmartFilterGroup
                        title={tr("Material / Colour — Main Filter")}
                        tree={materialColorTree}
                        selected={materialColorSel}
                        onToggle={(k: string) => setMaterialColorSel(prev => toggleKey(prev || [], k))}
                        onClear={() => setMaterialColorSel([])}
                        primary
                    />
                </div>
            )}

            {shapeFilterOpen && (
                <div className="smart-filters-shape py-2 w-full">
                    <SmartFilterGroup
                        title={tr("Shape — Sub Filter")}
                        tree={shapeTree}
                        selected={shapeSel}
                        onToggle={(k: string) => setShapeSel(prev => toggleKey(prev || [], k))}
                        onClear={() => setShapeSel([])}
                        renderIcon={(node) => {
                            const geom = LABEL_TO_GEOMETRY.get(node.label);
                            return geom ? <GeometryIcon geom={geom} size={13} strokeWidth={2.4} /> : null;
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export const InventoryFiltersPanel: React.FC = () => {
    const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
    const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    const inventoryRows = useAtomValue(inventoryAtom);
    const contentCounts = React.useMemo(() => countContent(inventoryRows || []), [inventoryRows]);

    return (
        <div className="flex flex-col w-full min-h-0 gap-4 p-4">
            <div className="w-full flex flex-wrap items-center gap-5 animate-in slide-in-from-top-4 duration-500">
                <div className="flex flex-wrap items-center gap-5">
                    {[
                        { id: 'All', icon: LayoutGrid, color: '#FFFFFF' },
                        { id: 'New', icon: Plus, color: '#38bdf8' },
                        { id: 'Packed', icon: PackageCheck, color: '#eab308' },
                        { id: 'Not Packed', icon: PackageOpen, color: '#a1a1aa' },
                        { id: 'Shipped', icon: Send, color: '#06b6d4' },
                        { id: 'Not Shipped', icon: PackageX, color: '#f43f5e' },
                        { id: 'Acquired', icon: Tag, color: '#10b981' },
                        { id: 'Requested', icon: Activity, color: '#f59e0b' },
                        { id: 'Paid', icon: DollarSign, color: '#10b981' }
                    ].map(s => {
                        const Icon = s.icon;
                        const isActive = invStatusFilter === s.id;
                        return (
                            <div key={s.id} className="tool-cell flex flex-col items-center gap-1">
                                <button aria-pressed={isActive} title={s.id} onClick={() => setInvStatusFilter(s.id as any)}
                                    className="tool-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
                                    style={{ color: isActive ? s.color : undefined }}>
                                    <Icon size={18} strokeWidth={isActive ? 3.5 : 2.5} />
                                </button>
                                <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none">{s.id}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="hidden sm:block h-9 w-px bg-white/10 mx-2" />

                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">
                        {tr("AI Content")}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {CONTENT_FILTERS.map(f => {
                            const on = (contentSel || []).includes(f.key);
                            const n = contentCounts[f.key as ContentKey] ?? 0;
                            return (
                                <button
                                    key={f.key}
                                    onClick={() => setContentSel(prev => {
                                        const cur = prev || [];
                                        return cur.includes(f.key)
                                            ? cur.filter(k => k !== f.key)
                                            : [...cur, f.key];
                                    })}
                                    aria-pressed={on}
                                    title={tr(f.hint)}
                                    className="smart-chip flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.1em]"
                                >
                                    {tr(f.label)}
                                    <span className="smart-count tabular-nums opacity-50">{n}</span>
                                </button>
                            );
                        })}
                        {(contentSel || []).length > 0 && (
                            <button onClick={() => setContentSel([])}
                                className="smart-clear text-[8px] font-black uppercase tracking-[0.16em] px-2 py-1 rounded-md"
                                title={tr("Clear content filter")}>
                                {tr("Clear")} {(contentSel || []).length}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="w-full flex flex-wrap items-center gap-6 animate-in slide-in-from-top-4 duration-700">
                <button onClick={() => setInvVendorFilter(['All'])} className={`text-[10px] font-black uppercase transition-all ${invVendorFilter.includes('All') ? 'text-white' : 'text-zinc-600 hover:text-white'}`}>{tr("ALL")}<br/>{tr("VENDORS")}</button>
                <div className="flex flex-wrap items-center gap-6 py-1">
                    {activeVendors.map(v => {
                        const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                        const isActive = invVendorFilter.includes(v) || invVendorFilter.includes('All');
                        return (
                            <div key={v} className="tool-cell flex flex-col items-center gap-1">
                                <button aria-pressed={isActive} title={v}
                                    onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])}
                                    className="tool-btn vendor-btn flex items-center justify-center w-11 h-11 rounded-xl transition-all"
                                    style={{ ['--vendor-color' as any]: vendorColor }} />
                                <span className="tool-label text-[8px] font-black uppercase tracking-[0.16em] leading-none" style={{ color: vendorColor }}>{v}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const InventoryPanelsRegistrar: React.FC = () => {
    // The panels are now rendered directly as SubmenuDock cards by UniversalToolsBar. Nothing to register.
    return null;
};
