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
}> = ({ tree, selected, onToggle, onClear, renderIcon }) => {
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    const sel = new Set(selected || []);
    const activeCount = (selected || []).length;

    if (tree.length === 0) return null;

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            {tree.map(node => {
                const isOpen = expanded.has(node.key);
                const isSel = sel.has(node.key);
                return (
                    <React.Fragment key={node.key}>
                        <div className="flex items-center shrink-0">
                            <button
                                onClick={() => onToggle(node.key)}
                                aria-pressed={isSel}
                                className={`utb-control utb-smart-chip ${node.children.length > 0 ? 'rounded-r-none border-r-0' : ''}`}
                                title={`Filter by ${node.label}`}
                                aria-label={`Filter by ${node.label}`}
                            >
                                {renderIcon?.(node)}
                                <span>{node.label}</span>
                                <span className="utb-count-badge tabular-nums opacity-50">{node.count}</span>
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
                                    className="utb-control utb-expand-btn rounded-l-none"
                                    title={`${node.children.length} sub-filter${node.children.length !== 1 ? 's' : ''}`}
                                >
                                    <ChevronDown size={12} strokeWidth={3} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                </button>
                            )}
                        </div>

                        {isOpen && node.children.map(child => (
                            <button
                                key={child.key}
                                onClick={() => onToggle(child.key)}
                                aria-pressed={sel.has(child.key)}
                                className="utb-control utb-smart-chip utb-smart-child"
                                title={`Filter by ${node.label} / ${child.label}`}
                                aria-label={`Filter by ${node.label} / ${child.label}`}
                            >
                                <span>{child.label}</span>
                                <span className="utb-count-badge tabular-nums opacity-50">{child.count}</span>
                            </button>
                        ))}
                    </React.Fragment>
                );
            })}

            {activeCount > 0 && (
                <button
                    onClick={onClear}
                    className="utb-control utb-clear-btn shrink-0"
                    title={tr("Clear this filter")}
                    aria-label={tr("Clear this filter")}
                >
                    <X size={12} strokeWidth={2.5} />
                    <span>{tr("Clear")}</span>
                    <span className="utb-count-badge tabular-nums">{activeCount}</span>
                </button>
            )}
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

    const totalSmartCount = (materialColorSel || []).length + (shapeSel || []).length;
    const handleClearAllSmart = () => {
        setMaterialColorSel([]);
        setShapeSel([]);
    };

    return (
        <div className="utb-row">
            <div className="utb-scroll-row">
                <button
                    onClick={() => setMaterialColorOpen(!materialColorOpen)}
                    aria-pressed={materialColorOpen}
                    className="utb-control utb-smart-deploy"
                    title={tr("Material / Colour — main filter")}
                    aria-label={tr("Material / Colour — main filter")}
                >
                    <Palette size={14} strokeWidth={2.4} className="shrink-0" />
                    <span>{tr("Material / Colour")}</span>
                    {(materialColorSel || []).length > 0 && (
                        <span className="utb-count-badge tabular-nums">{(materialColorSel || []).length}</span>
                    )}
                </button>

                {materialColorOpen && (
                    <SmartFilterGroup
                        title={tr("Material / Colour — Main Filter")}
                        tree={materialColorTree}
                        selected={materialColorSel}
                        onToggle={(k: string) => setMaterialColorSel(prev => toggleKey(prev || [], k))}
                        onClear={() => setMaterialColorSel([])}
                        primary
                    />
                )}

                <div className="utb-divider shrink-0" aria-hidden="true" />

                <button
                    onClick={() => setShapeFilterOpen(!shapeFilterOpen)}
                    aria-pressed={shapeFilterOpen}
                    className="utb-control utb-smart-deploy"
                    title={tr("Shape — sub filter")}
                    aria-label={tr("Shape — sub filter")}
                >
                    <Shapes size={14} strokeWidth={2.4} className="shrink-0" />
                    <span>{tr("Shape")}</span>
                    {(shapeSel || []).length > 0 && (
                        <span className="utb-count-badge tabular-nums">{(shapeSel || []).length}</span>
                    )}
                </button>

                {shapeFilterOpen && (
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
                )}
            </div>

            <button
                onClick={handleClearAllSmart}
                disabled={totalSmartCount === 0}
                aria-label={tr("Clear Filters")}
                title={tr("Clear Filters")}
                className={`utb-control utb-clear-btn shrink-0 ${totalSmartCount === 0 ? 'opacity-30 cursor-default' : ''}`}
            >
                <X size={14} strokeWidth={2.5} />
                <span className="utb-label-desktop">{tr("Clear")}</span>
                {totalSmartCount > 0 && (
                    <span className="utb-count-badge tabular-nums">{totalSmartCount}</span>
                )}
            </button>
        </div>
    );
};

const STATUS_FILTERS = [
    { id: 'All', icon: LayoutGrid, color: '#FFFFFF' },
    { id: 'New', icon: Plus, color: '#38bdf8' },
    { id: 'Packed', icon: PackageCheck, color: '#eab308' },
    { id: 'Not Packed', icon: PackageOpen, color: '#a1a1aa' },
    { id: 'Shipped', icon: Send, color: '#06b6d4' },
    { id: 'Not Shipped', icon: PackageX, color: '#f43f5e' },
    { id: 'Acquired', icon: Tag, color: '#10b981' },
    { id: 'Requested', icon: Activity, color: '#f59e0b' },
    { id: 'Paid', icon: DollarSign, color: '#10b981' }
];

export const InventoryFiltersPanel: React.FC = () => {
    const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
    const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    const inventoryRows = useAtomValue(inventoryAtom);
    const contentCounts = React.useMemo(() => countContent(inventoryRows || []), [inventoryRows]);

    const isStatusActive = invStatusFilter !== 'All';
    const aiActiveCount = (contentSel || []).length;
    const isVendorActive = !invVendorFilter.includes('All');
    const vendorActiveCount = isVendorActive ? invVendorFilter.length : 0;
    const totalActiveCount = (isStatusActive ? 1 : 0) + aiActiveCount + vendorActiveCount;

    const handleClearAll = () => {
        setInvStatusFilter('All');
        setContentSel([]);
        setInvVendorFilter(['All']);
    };

    return (
        <div className="utb-filters-panel">
            <div className="utb-row">
                <div className="utb-scroll-row">
                    {STATUS_FILTERS.map(s => {
                        const Icon = s.icon;
                        const isActive = invStatusFilter === s.id;
                        return (
                            <button
                                key={s.id}
                                aria-pressed={isActive}
                                aria-label={tr(s.id)}
                                title={tr(s.id)}
                                onClick={() => setInvStatusFilter(s.id as any)}
                                className="utb-control utb-status-chip"
                                style={{
                                    color: isActive ? s.color : undefined,
                                    borderColor: isActive ? `color-mix(in srgb, ${s.color} 50%, transparent)` : undefined,
                                    backgroundColor: isActive ? `color-mix(in srgb, ${s.color} 20%, transparent)` : undefined
                                }}
                            >
                                <Icon size={14} strokeWidth={isActive ? 3 : 2.2} className="shrink-0" />
                                <span className="utb-status-text">{tr(s.id)}</span>
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={handleClearAll}
                    disabled={totalActiveCount === 0}
                    aria-label={tr("Clear Filters")}
                    title={tr("Clear Filters")}
                    className={`utb-control utb-clear-btn shrink-0 ${totalActiveCount === 0 ? 'opacity-30 cursor-default' : ''}`}
                >
                    <X size={14} strokeWidth={2.5} />
                    <span className="utb-label-desktop">{tr("Clear")}</span>
                    {totalActiveCount > 0 && (
                        <span className="utb-count-badge tabular-nums">{totalActiveCount}</span>
                    )}
                </button>
            </div>

            <div className="utb-row">
                <div className="utb-scroll-row">
                    <span className="utb-label shrink-0">{tr("AI")}</span>
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
                                aria-label={tr(f.hint)}
                                className="utb-control utb-ai-chip"
                            >
                                <span>{tr(f.label)}</span>
                                <span className="utb-count-badge tabular-nums opacity-60">{n}</span>
                            </button>
                        );
                    })}

                    <div className="utb-divider shrink-0" aria-hidden="true" />

                    <button
                        onClick={() => setInvVendorFilter(['All'])}
                        aria-pressed={invVendorFilter.includes('All')}
                        title={tr("ALL VENDORS")}
                        aria-label={tr("ALL VENDORS")}
                        className="utb-control utb-vendor-chip"
                    >
                        <span>{tr("ALL")}</span>
                    </button>

                    {activeVendors.map(v => {
                        const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                        const isActive = invVendorFilter.includes(v) || invVendorFilter.includes('All');
                        return (
                            <button
                                key={v}
                                aria-pressed={isActive}
                                title={v}
                                aria-label={v}
                                onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])}
                                className="utb-control utb-vendor-chip"
                                style={{
                                    color: isActive ? '#000' : vendorColor,
                                    backgroundColor: isActive ? vendorColor : 'transparent',
                                    borderColor: isActive ? 'transparent' : `${vendorColor}40`,
                                    boxShadow: isActive ? `0 0 12px ${vendorColor}66` : 'none'
                                }}
                            >
                                <span className="tabular-nums tracking-wider">{v}</span>
                            </button>
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

