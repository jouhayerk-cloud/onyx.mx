import { SeasonToggles } from './SeasonToggles';
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

    // A plain input: the smart search itself lives in the inventory filter that reads inventorySearchTermAtom
    return (
        <div className="utb-row utb-search-row">
            <div className="utb-search-container">
                <Search size={16} strokeWidth={3} className="utb-search-icon" aria-hidden="true" />
                <input
                    autoFocus
                    type="text"
                    value={invSearchTerm}
                    onChange={(e) => setInvSearchTerm(e.target.value)}
                    placeholder={tr("SEARCH INVENTORY...")}
                    aria-label={tr("Search")}
                    className="utb-search-input"
                />
                {invSearchTerm && (
                    <button onClick={() => setInvSearchTerm('')} className="utb-control utb-clear-btn utb-icon-only" aria-label={tr("Clear")} title={tr("Clear")}>
                        <X size={16} strokeWidth={3} />
                    </button>
                )}
            </div>
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

    const densityLabel = invSlider <= 33 ? tr("Compact") : invSlider <= 66 ? tr("Standard") : tr("Spacious");
    const DensityIcon = invSlider <= 33 ? LayoutList : invSlider <= 66 ? LayoutGrid : Layout;

    return (
        <div className="utb-row utb-view-row">
            <button onClick={handleToggleDensity} className="utb-control utb-view-density" aria-label={tr("Density")} title={tr("Density") + ': ' + densityLabel}>
                <DensityIcon size={16} strokeWidth={2.4} />
                <span className="utb-view-density-text">{densityLabel}</span>
            </button>

            <input
                type="range" min="1" max="100" step="1" value={invSlider}
                aria-label={tr("Size")}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setInvSlider(val);
                    if (val <= 33) setInvMode('list');
                    else if (val <= 66) setInvMode('grid');
                    else setInvMode('gallery');
                }}
                className="utb-view-slider"
                style={{ ['--utb-fill' as string]: `${invSlider}%` } as React.CSSProperties}
            />

            <div className="utb-divider shrink-0" aria-hidden="true" />

            <div className="utb-view-sort" role="group" aria-label={tr("SORT BY")}>
                <ArrowUpDown size={14} className="utb-view-sort-icon" aria-hidden="true" />
                {[
                    { key: 'Date', label: tr("DATE") },
                    { key: 'Vendor', label: tr("VENDOR") },
                    { key: 'Status', label: tr("STATUS") },
                    { key: 'Number', label: tr("NUM") },
                    { key: 'Value', label: tr("VALUE") },
                    { key: 'Qty', label: tr("QTY") }
                ].map(sort => {
                    const on = invSortKey === sort.key;
                    return (
                        <button
                            key={sort.key}
                            aria-pressed={on}
                            title={sort.label}
                            onClick={() => {
                                if (on) setInvSortOrder(invSortOrder === 'asc' ? 'desc' : 'asc');
                                else { setInvSortKey(sort.key as any); setInvSortOrder('desc'); }
                            }}
                            className="utb-control utb-sort-chip"
                        >
                            <span>{sort.label}</span>
                            {on && (invSortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />)}
                        </button>
                    );
                })}
            </div>

            <div className="utb-divider shrink-0" aria-hidden="true" />

            {/* the workbook (season) toggles 825, 326 and 826 live here, not in the island */}
            <SeasonToggles />
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

// Dark text on a light vendor colour, white text on a dark one (relative luminance of the hex colour)
const readableOn = (hex: string): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return '#0b1118';
    const n = parseInt(m[1], 16);
    const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum > 0.35 ? '#0b1118' : '#ffffff';
};

export const InventoryFiltersPanel: React.FC = () => {
    const [invStatusFilter, setInvStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const [contentSel, setContentSel] = useAtom(inventoryContentFilterAtom);
    const [invVendorFilter, setInvVendorFilter] = useAtom(inventoryVendorFilterAtom);
    const activeVendors = useAtomValue(activeVendorsAtom);
    const inventoryRows = useAtomValue(inventoryAtom);

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

            {/* vendors: one row, each in its own colour; with ALL active every vendor shows its colour */}
            <div className="utb-row">
                <div className="utb-scroll-row utb-vendor-row" role="group" aria-label={tr("ALL VENDORS")}>
                    <button
                        onClick={() => setInvVendorFilter(['All'])}
                        aria-pressed={invVendorFilter.includes('All')}
                        title={tr("ALL VENDORS")}
                        aria-label={tr("ALL VENDORS")}
                        className="utb-control utb-vendor-chip utb-vendor-all"
                    >
                        <span>{tr("ALL")}</span>
                    </button>

                    {activeVendors.map(v => {
                        const vendorColor = (vendors as any)[v]?.color || '#ffffff';
                        const isAll = invVendorFilter.includes('All');
                        const isActive = isAll || invVendorFilter.includes(v);
                        return (
                            <button
                                key={v}
                                aria-pressed={isActive}
                                title={v}
                                aria-label={v}
                                onClick={() => setInvVendorFilter(invVendorFilter.includes(v) ? invVendorFilter.filter(x => x !== v).length === 0 ? ['All'] : invVendorFilter.filter(x => x !== v) : [...invVendorFilter.filter(x => x !== 'All'), v])}
                                className="utb-control utb-vendor-chip"
                                data-solo={isActive && !isAll ? 'true' : 'false'}
                                style={{ ['--vc' as string]: vendorColor, ['--vt' as string]: readableOn(vendorColor) } as React.CSSProperties}
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

