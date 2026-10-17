import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Check, AlertTriangle, Grid, List, X } from 'lucide-react';
import { inventoryAtom } from '../../../lib/atoms';
import { ItemTag } from '../../../components/ui/ItemTag';
import {
    renderAxoIconDataUrl,
    type AxoRenderParams,
} from '../../../lib/axo/axoIcon';
import './axoIconPreview.css';

// Reference axo icons from section 7 of HAIRLINE_SPEC.md
import jm024Ref from '../../../../docs/_inputs/refs/JM-024_axo.jpg';
import jm033Ref from '../../../../docs/_inputs/refs/JM-033_axo.jpg';
import jm036Ref from '../../../../docs/_inputs/refs/JM-036_axo.jpg';
import jm049Ref from '../../../../docs/_inputs/refs/JM-049_axo.jpg';
import rf038Ref from '../../../../docs/_inputs/refs/RF-038_axo.jpg';
import rf049Ref from '../../../../docs/_inputs/refs/RF-049_axo.jpg';

interface ReferenceItem {
    id: string;
    type: string;
    shape: string;
    w: number;
    l: number;
    h: number;
    shopifyType: string;
    variety: string;
    color: string;
    refAxoUrl: string;
}

const REFERENCE_ITEMS: readonly ReferenceItem[] = [
    {
        id: 'JM-049',
        type: 'canoe',
        shape: 'Large',
        w: 100,
        l: 23,
        h: 10,
        shopifyType: 'Canoe Tray (Home Decor > Decorative Trays)',
        variety: 'Nacar onyx',
        color: '#71717A',
        refAxoUrl: jm049Ref,
    },
    {
        id: 'JM-036',
        type: 'canoe',
        shape: 'Small',
        w: 70,
        l: 23,
        h: 10,
        shopifyType: 'Canoe (Home Decor > Decorative Bowls)',
        variety: 'Pearlescent onyx',
        color: '#71717A',
        refAxoUrl: jm036Ref,
    },
    {
        id: 'JM-024',
        type: 'bowl',
        shape: 'Medium',
        w: 50,
        l: 48,
        h: 36,
        shopifyType: 'Decorative Bowls',
        variety: 'Pearlescent onyx',
        color: '#71717A',
        refAxoUrl: jm024Ref,
    },
    {
        id: 'JM-033',
        type: 'floor-lamp',
        shape: 'Squared',
        w: 30,
        l: 30,
        h: 200,
        shopifyType: 'Floor Lamps',
        variety: 'Pearlescent onyx',
        color: '#71717A',
        refAxoUrl: jm033Ref,
    },
    {
        id: 'RF-038',
        type: 'mirror',
        shape: 'Rectangular',
        w: 80,
        l: 10,
        h: 120,
        shopifyType: 'Mirrors',
        variety: 'Fluorite (purple green)',
        color: '#4E7857',
        refAxoUrl: rf038Ref,
    },
    {
        id: 'RF-049',
        type: 'fountain',
        shape: 'fountain',
        w: 30,
        l: 30,
        h: 140,
        shopifyType: 'Outdoor Decor > Fountains',
        variety: 'Calcite (blue)',
        color: '#567A8A',
        refAxoUrl: rf049Ref,
    },
];

interface SpecItem826 {
    num: number;
    tag: string;
    canonType: string;
    shape: string;
    w: number;
    l: number;
    h: number;
    figureUsed: string;
    figureExistsToday: boolean;
    topNeeded: boolean;
}

// Canonical 71 items from Section 6 of HAIRLINE_SPEC.md
const SPEC_826_ITEMS: readonly SpecItem826[] = [
    { num: 1, tag: '826-AM-001', canonType: 'painted-wall-panel', shape: 'Bobcats', w: 161, l: 10, h: 75, figureUsed: 'painted-wall-panel', figureExistsToday: true, topNeeded: false },
    { num: 2, tag: '826-EM-001', canonType: 'wall-panel', shape: 'Free Form', w: 56, l: 2, h: 94, figureUsed: 'wall-panel', figureExistsToday: true, topNeeded: false },
    { num: 3, tag: '826-EM-002', canonType: 'bowl', shape: 'Medium', w: 36, l: 32, h: 13, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 4, tag: '826-EM-003', canonType: 'bowl', shape: 'Medium', w: 39, l: 34, h: 16, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 5, tag: '826-EM-004', canonType: 'bowl', shape: 'Large', w: 42, l: 38, h: 20, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 6, tag: '826-EM-005', canonType: 'bowl', shape: 'Large', w: 47, l: 33, h: 19, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 7, tag: '826-EM-006', canonType: 'bowl', shape: 'Large', w: 48, l: 36, h: 18, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 8, tag: '826-EM-007', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 180, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 9, tag: '826-EM-008', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 150, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 10, tag: '826-EM-009', canonType: 'mirror', shape: 'Rectangular', w: 60, l: 10, h: 120, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 11, tag: '826-EM-010', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 150, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 12, tag: '826-EM-011', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 150, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 13, tag: '826-EM-012', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 150, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 14, tag: '826-EM-013', canonType: 'mirror', shape: 'Rectangular', w: 60, l: 10, h: 80, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 15, tag: '826-EM-014', canonType: 'mirror', shape: 'Rectangular', w: 80, l: 10, h: 90, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 16, tag: '826-EM-015', canonType: 'mirror', shape: 'Rectangular', w: 71, l: 10, h: 102, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 17, tag: '826-EM-016', canonType: 'mirror', shape: 'Squared', w: 100, l: 10, h: 100, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 18, tag: '826-EM-017', canonType: 'mirror', shape: 'Round', w: 100, l: 10, h: 100, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 19, tag: '826-EM-018', canonType: 'mirror', shape: 'Round', w: 100, l: 10, h: 100, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 20, tag: '826-EM-019', canonType: 'mirror', shape: 'Round', w: 100, l: 10, h: 100, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 21, tag: '826-EM-020', canonType: 'mirror', shape: 'Round', w: 80, l: 10, h: 80, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 22, tag: '826-EM-021', canonType: 'mirror', shape: 'Round', w: 80, l: 10, h: 80, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 23, tag: '826-EM-022', canonType: 'mirror', shape: 'Round', w: 80, l: 10, h: 80, figureUsed: 'mirror', figureExistsToday: true, topNeeded: false },
    { num: 24, tag: '826-EM-023', canonType: 'floor-lamp', shape: 'Squared', w: 29, l: 29, h: 160, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 25, tag: '826-EM-024', canonType: 'floor-lamp', shape: 'Squared', w: 29, l: 29, h: 149, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 26, tag: '826-EM-025', canonType: 'floor-lamp', shape: 'Squared', w: 29, l: 29, h: 110, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 27, tag: '826-EM-026', canonType: 'floor-lamp', shape: 'Squared', w: 28, l: 28, h: 99, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 28, tag: '826-EM-027', canonType: 'floor-lamp', shape: 'Squared', w: 29, l: 29, h: 90, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 29, tag: '826-EM-028', canonType: 'table', shape: 'Diamond', w: 107, l: 107, h: 43, figureUsed: 'table', figureExistsToday: true, topNeeded: false },
    { num: 30, tag: '826-EM-029', canonType: 'bowl', shape: 'Large', w: 42, l: 36, h: 15, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 31, tag: '826-EM-030', canonType: 'bowl', shape: 'Medium', w: 36, l: 32, h: 17, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 32, tag: '826-EM-031', canonType: 'bowl', shape: 'Large', w: 41, l: 34, h: 18, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 33, tag: '826-EM-032', canonType: 'bowl', shape: 'Large', w: 41, l: 33, h: 15, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 34, tag: '826-EM-033', canonType: 'bowl', shape: 'Large', w: 41, l: 32, h: 18, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 35, tag: '826-EM-034', canonType: 'bowl', shape: 'Large', w: 41, l: 41, h: 19, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 36, tag: '826-EM-035', canonType: 'bowl', shape: 'Large', w: 39, l: 28, h: 20, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 37, tag: '826-EM-036', canonType: 'bowl', shape: 'Large', w: 41, l: 29, h: 22, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 38, tag: '826-EM-037', canonType: 'bowl', shape: 'Large', w: 43, l: 36, h: 15, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 39, tag: '826-EM-038', canonType: 'bowl', shape: 'Medium', w: 36, l: 36, h: 15, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 40, tag: '826-EM-039', canonType: 'bowl', shape: 'Medium', w: 37, l: 25, h: 13, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 41, tag: '826-EM-040', canonType: 'bowl', shape: 'Medium', w: 30, l: 29, h: 15, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 42, tag: '826-EM-041', canonType: 'bowl', shape: 'Medium', w: 29, l: 24, h: 12, figureUsed: 'bowl', figureExistsToday: true, topNeeded: true },
    { num: 43, tag: '826-EM-042', canonType: 'canoe', shape: 'Large', w: 110, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 44, tag: '826-EM-043', canonType: 'canoe', shape: 'Large', w: 110, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 45, tag: '826-EM-044', canonType: 'canoe', shape: 'Large', w: 110, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 46, tag: '826-EM-045', canonType: 'canoe', shape: 'Large', w: 110, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 47, tag: '826-EM-046', canonType: 'canoe', shape: 'Large', w: 100, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 48, tag: '826-EM-047', canonType: 'canoe', shape: 'Large', w: 90, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 49, tag: '826-EM-048', canonType: 'canoe', shape: 'Large', w: 90, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 50, tag: '826-EM-049', canonType: 'canoe', shape: 'Medium', w: 61, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 51, tag: '826-EM-050', canonType: 'canoe', shape: 'Medium', w: 51, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 52, tag: '826-EM-051', canonType: 'canoe', shape: 'Medium', w: 51, l: 23, h: 10, figureUsed: 'canoe', figureExistsToday: true, topNeeded: true },
    { num: 53, tag: '826-GE-001', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 200, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 54, tag: '826-GE-002', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 170, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 55, tag: '826-GE-003', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 150, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 56, tag: '826-GE-004', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 120, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 57, tag: '826-GE-005', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 110, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 58, tag: '826-GE-006', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 100, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 59, tag: '826-GE-007', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 150, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 60, tag: '826-GE-008', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 160, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 61, tag: '826-GE-009', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 240, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 62, tag: '826-GE-010', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 220, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 63, tag: '826-GE-011', canonType: 'floor-lamp', shape: 'Squared', w: 30, l: 30, h: 220, figureUsed: 'floor-lamp', figureExistsToday: true, topNeeded: true },
    { num: 64, tag: '826-IH-001', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 30, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 65, tag: '826-IH-002', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 25, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 66, tag: '826-IH-003', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 30, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 67, tag: '826-IH-004', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 25, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 68, tag: '826-IH-005', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 30, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 69, tag: '826-IH-006', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 25, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 70, tag: '826-IH-007', canonType: 'pendant', shape: 'squared', w: 10, l: 10, h: 30, figureUsed: 'pendant', figureExistsToday: true, topNeeded: true },
    { num: 71, tag: '826-IH-008', canonType: 'table-lamp', shape: 'Squared Open Top', w: 10, l: 10, h: 30, figureUsed: 'table-lamp', figureExistsToday: true, topNeeded: true },
];

function makeTagItem(tag: string, localRow?: any) {
    if (localRow && (localRow.book_barcode || localRow.vendor_id || localRow.vendorId)) {
        return localRow;
    }
    const parts = tag.split('-');
    let vendor = 'EM';
    let num = '001';
    if (parts.length >= 3) {
        vendor = parts[1];
        num = parts[2];
    } else if (parts.length === 2) {
        vendor = parts[0];
        num = parts[1];
    }
    return {
        id: tag,
        vendorId: `${vendor}-${num}`,
        itemId: `${vendor}-${num}`,
        workbook: '826',
        item_number: num,
        ...localRow,
    };
}

export interface AxoIconPreviewProps {
    onClose?: () => void;
}

export const AxoIconPreview: React.FC<AxoIconPreviewProps> = ({ onClose }) => {
    const rows = useAtomValue(inventoryAtom);

    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [bgMode, setBgMode] = useState<'white' | 'dark' | 'check'>('white');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<{
        tag: string;
        type: string;
        shape: string;
        dims: string;
        iconUrl: string | null;
        color: string;
        figureExists: boolean;
    } | null>(null);

    // Map local inventory rows by tag or vendorId for workbook 826
    const localRowsMap = useMemo(() => {
        const map = new Map<string, any>();
        if (!rows || !Array.isArray(rows)) return map;

        for (const r of rows) {
            const rawWb = String(r.workbook ?? r.data?.workbook ?? '').toLowerCase().replace('v', '');
            const rawId = String(r.id ?? r.item_id ?? r.data?.vendor_id ?? r.data?.itemId ?? '').toUpperCase();
            if (rawWb === '826' || rawId.startsWith('826-') || rawId.includes('826')) {
                // Key by normal tag
                const tagMatch = rawId.match(/826-[A-Z]+-\d+/);
                if (tagMatch) {
                    map.set(tagMatch[0], r);
                } else {
                    map.set(rawId, r);
                }
            }
        }
        return map;
    }, [rows]);

    // Build items with rendered axo icons
    const itemsWithIcons = useMemo(() => {
        return SPEC_826_ITEMS.map(spec => {
            const localRow = localRowsMap.get(spec.tag);
            const tagItem = makeTagItem(spec.tag, localRow);

            // Compute axo icon params
            const params: AxoRenderParams = {
                typeId: spec.canonType,
                shape: spec.shape,
                w: spec.w,
                l: spec.l,
                h: spec.h,
                top: spec.topNeeded ? 'open' : undefined,
                background: bgMode === 'dark' ? 'transparent' : 'white',
            };

            const iconDataUrl = renderAxoIconDataUrl(params);
            const figureExists = iconDataUrl !== null;

            return {
                spec,
                localRow,
                tagItem,
                iconDataUrl,
                figureExists,
                dimsStr: `${spec.w} x ${spec.l} x ${spec.h} cm`,
            };
        });
    }, [localRowsMap, bgMode]);

    // Available canonical types for filtering
    const typeFilters = useMemo(() => {
        const set = new Set<string>();
        SPEC_826_ITEMS.forEach(i => set.add(i.canonType));
        return Array.from(set).sort();
    }, []);

    // Filter items
    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return itemsWithIcons.filter(item => {
            if (selectedType !== 'all' && item.spec.canonType !== selectedType) {
                return false;
            }
            if (!query) return true;
            return (
                item.spec.tag.toLowerCase().includes(query) ||
                item.spec.canonType.toLowerCase().includes(query) ||
                item.spec.shape.toLowerCase().includes(query) ||
                item.spec.figureUsed.toLowerCase().includes(query)
            );
        });
    }, [itemsWithIcons, selectedType, searchQuery]);

    // Render reference comparisons
    const renderedReferences = useMemo(() => {
        return REFERENCE_ITEMS.map(ref => {
            const generatedUrl = renderAxoIconDataUrl({
                typeId: ref.type,
                shape: ref.shape,
                w: ref.w,
                l: ref.l,
                h: ref.h,
                color: ref.color,
                background: bgMode === 'dark' ? 'transparent' : 'white',
            });
            return {
                ...ref,
                generatedUrl,
                figureExists: generatedUrl !== null,
            };
        });
    }, [bgMode]);

    const totalCount = SPEC_826_ITEMS.length;
    const okCount = itemsWithIcons.filter(i => i.figureExists).length;
    const missingCount = totalCount - okCount;

    return (
        <div className="aip-wrap">
            {/* Header Toolbar */}
            <header className="aip-header">
                <div className="aip-topbar">
                    <div className="aip-title-group">
                        <span className="aip-badge-pill">Dev Preview</span>
                        <h1 className="aip-title">Axo Icons 826</h1>
                    </div>

                    <div className="aip-actions">
                        {/* Background swatch */}
                        <div className="aip-segmented">
                            <button
                                type="button"
                                className={bgMode === 'white' ? 'active' : ''}
                                onClick={() => setBgMode('white')}
                                title="White canvas"
                            >
                                White
                            </button>
                            <button
                                type="button"
                                className={bgMode === 'dark' ? 'active' : ''}
                                onClick={() => setBgMode('dark')}
                                title="Transparent on dark"
                            >
                                Dark
                            </button>
                            <button
                                type="button"
                                className={bgMode === 'check' ? 'active' : ''}
                                onClick={() => setBgMode('check')}
                                title="Checkerboard"
                            >
                                Grid
                            </button>
                        </div>

                        {/* View mode toggle */}
                        <div className="aip-segmented">
                            <button
                                type="button"
                                className={viewMode === 'table' ? 'active' : ''}
                                onClick={() => setViewMode('table')}
                                title="Table view"
                            >
                                <List size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                                Table
                            </button>
                            <button
                                type="button"
                                className={viewMode === 'grid' ? 'active' : ''}
                                onClick={() => setViewMode('grid')}
                                title="Card grid view"
                            >
                                <Grid size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                                Grid
                            </button>
                        </div>

                        {onClose && (
                            <button type="button" className="aip-segmented" onClick={onClose}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Metrics bar */}
                <div className="aip-metrics">
                    <div className="aip-metric">
                        <span className="aip-metric-label">Book 826 Items</span>
                        <span className="aip-metric-val">{totalCount}</span>
                    </div>
                    <div className="aip-metric">
                        <span className="aip-metric-label">Figures OK</span>
                        <span className="aip-metric-val" style={{ color: 'var(--aip-ok-ink)' }}>
                            {okCount} / {totalCount}
                        </span>
                    </div>
                    <div className="aip-metric">
                        <span className="aip-metric-label">Missing Figures</span>
                        <span
                            className="aip-metric-val"
                            style={{ color: missingCount > 0 ? 'var(--aip-warn-ink)' : 'inherit' }}
                        >
                            {missingCount}
                        </span>
                    </div>
                    <div className="aip-metric">
                        <span className="aip-metric-label">Local DB Rows</span>
                        <span className="aip-metric-val">{localRowsMap.size}</span>
                    </div>
                </div>
            </header>

            {/* Section 1: Reference Items Comparison */}
            <section className="aip-section">
                <header className="aip-section-head">
                    <div>
                        <h2 className="aip-section-title">Reference Items (325/326 Benchmark)</h2>
                        <p className="aip-section-desc">
                            Real stored axo icons compared against pure deterministic hairline renderer output.
                        </p>
                    </div>
                </header>

                <div className="aip-ref-grid">
                    {renderedReferences.map(ref => (
                        <article className="aip-ref-card" key={ref.id}>
                            <header className="aip-ref-head">
                                <span className="aip-ref-id">{ref.id}</span>
                                <span className="aip-ref-type">{ref.type} · {ref.shape}</span>
                            </header>

                            <div className="aip-ref-compare">
                                <div className="aip-ref-tile">
                                    <span className="aip-ref-tile-label">Stored JPG</span>
                                    <div
                                        className={`aip-img-box ${bgMode === 'dark' ? 'bg-dark' : bgMode === 'check' ? 'bg-check' : ''}`}
                                        onClick={() =>
                                            setInspectedItem({
                                                tag: ref.id,
                                                type: ref.type,
                                                shape: ref.shape,
                                                dims: `${ref.w} x ${ref.l} x ${ref.h} cm`,
                                                iconUrl: ref.refAxoUrl,
                                                color: ref.color,
                                                figureExists: true,
                                            })
                                        }
                                    >
                                        <img src={ref.refAxoUrl} alt={`${ref.id} stored icon`} loading="lazy" />
                                    </div>
                                </div>

                                <div className="aip-ref-tile">
                                    <span className="aip-ref-tile-label">Generated PNG</span>
                                    <div
                                        className={`aip-img-box ${bgMode === 'dark' ? 'bg-dark' : bgMode === 'check' ? 'bg-check' : ''}`}
                                        onClick={() =>
                                            setInspectedItem({
                                                tag: `${ref.id} (rendered)`,
                                                type: ref.type,
                                                shape: ref.shape,
                                                dims: `${ref.w} x ${ref.l} x ${ref.h} cm`,
                                                iconUrl: ref.generatedUrl,
                                                color: ref.color,
                                                figureExists: ref.figureExists,
                                            })
                                        }
                                    >
                                        {ref.generatedUrl ? (
                                            <img src={ref.generatedUrl} alt={`${ref.id} generated icon`} />
                                        ) : (
                                            <span className="aip-flag-missing">No figure</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <dl className="aip-ref-meta">
                                <dt>Dimensions</dt>
                                <dd>{ref.w} x {ref.l} x {ref.h} cm</dd>
                                <dt>Variety / Color</dt>
                                <dd title={ref.color}>{ref.variety}</dd>
                            </dl>
                        </article>
                    ))}
                </div>
            </section>

            {/* Section 2: Catalog 826 Inventory Items */}
            <section className="aip-section">
                <header className="aip-section-head">
                    <div>
                        <h2 className="aip-section-title">Book 826 Catalog (71 items)</h2>
                        <p className="aip-section-desc">
                            Axonometric icons generated from item proportions (W x L x H) using hairline figure geometry. Read-only preview.
                        </p>
                    </div>
                </header>

                {/* Filter and search bar */}
                <div className="aip-filter-bar">
                    <input
                        type="search"
                        className="aip-search-input"
                        placeholder="Filter by tag, type, or shape..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />

                    <div className="aip-filter-chips">
                        <button
                            type="button"
                            className={`aip-filter-chip ${selectedType === 'all' ? 'active' : ''}`}
                            onClick={() => setSelectedType('all')}
                        >
                            All ({itemsWithIcons.length})
                        </button>
                        {typeFilters.map(t => {
                            const count = itemsWithIcons.filter(i => i.spec.canonType === t).length;
                            return (
                                <button
                                    type="button"
                                    key={t}
                                    className={`aip-filter-chip ${selectedType === t ? 'active' : ''}`}
                                    onClick={() => setSelectedType(t)}
                                >
                                    {t} ({count})
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* View rendering: Table or Card Grid */}
                {viewMode === 'table' ? (
                    <div className="aip-table-box">
                        <table className="aip-table">
                            <thead>
                                <tr>
                                    <th className="aip-table-num">#</th>
                                    <th>Tag</th>
                                    <th>Icon</th>
                                    <th>Canonical Type</th>
                                    <th>Shape</th>
                                    <th>Size (W x L x H)</th>
                                    <th>Figure Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map(item => (
                                    <tr key={item.spec.tag}>
                                        <td className="aip-table-num">{item.spec.num}</td>
                                        <td>
                                            <ItemTag item={item.tagItem} workbook="826" />
                                        </td>
                                        <td>
                                            <div
                                                className={`aip-table-icon-thumb ${bgMode === 'dark' ? 'bg-dark' : bgMode === 'check' ? 'bg-check' : ''}`}
                                                onClick={() =>
                                                    setInspectedItem({
                                                        tag: item.spec.tag,
                                                        type: item.spec.canonType,
                                                        shape: item.spec.shape,
                                                        dims: item.dimsStr,
                                                        iconUrl: item.iconDataUrl,
                                                        color: '#71717A',
                                                        figureExists: item.figureExists,
                                                    })
                                                }
                                                title="Click to inspect 400x400 icon"
                                            >
                                                {item.iconDataUrl ? (
                                                    <img src={item.iconDataUrl} alt={item.spec.tag} />
                                                ) : (
                                                    <AlertTriangle size={16} color="var(--aip-warn-ink)" />
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{item.spec.canonType}</td>
                                        <td style={{ color: 'var(--aip-ink-muted)' }}>{item.spec.shape}</td>
                                        <td className="aip-table-dims">{item.dimsStr}</td>
                                        <td>
                                            {item.figureExists ? (
                                                <span className="aip-flag-ok">
                                                    <Check size={12} />
                                                    Figure OK
                                                </span>
                                            ) : (
                                                <span className="aip-flag-missing">
                                                    <AlertTriangle size={12} />
                                                    MISSING FIGURE
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="aip-item-grid">
                        {filteredItems.map(item => (
                            <article className="aip-item-card" key={item.spec.tag}>
                                <div className="aip-card-row">
                                    <ItemTag item={item.tagItem} workbook="826" />
                                    {item.figureExists ? (
                                        <span className="aip-flag-ok">
                                            <Check size={11} /> OK
                                        </span>
                                    ) : (
                                        <span className="aip-flag-missing">
                                            <AlertTriangle size={11} /> MISSING
                                        </span>
                                    )}
                                </div>

                                <div
                                    className={`aip-card-thumb ${bgMode === 'dark' ? 'bg-dark' : bgMode === 'check' ? 'bg-check' : ''}`}
                                    onClick={() =>
                                        setInspectedItem({
                                            tag: item.spec.tag,
                                            type: item.spec.canonType,
                                            shape: item.spec.shape,
                                            dims: item.dimsStr,
                                            iconUrl: item.iconDataUrl,
                                            color: '#71717A',
                                            figureExists: item.figureExists,
                                        })
                                    }
                                >
                                    {item.iconDataUrl ? (
                                        <img src={item.iconDataUrl} alt={item.spec.tag} />
                                    ) : (
                                        <AlertTriangle size={24} color="var(--aip-warn-ink)" />
                                    )}
                                </div>

                                <div className="aip-card-meta">
                                    <div className="aip-card-type">{item.spec.canonType}</div>
                                    <div className="aip-card-shape">{item.spec.shape}</div>
                                    <div className="aip-card-dims">{item.dimsStr}</div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {/* Inspection Modal */}
            {inspectedItem && (
                <div className="aip-modal-overlay" onClick={() => setInspectedItem(null)}>
                    <div className="aip-modal-card" onClick={e => e.stopPropagation()}>
                        <header className="aip-modal-head">
                            <h3 className="aip-modal-title">{inspectedItem.tag}</h3>
                            <button
                                type="button"
                                className="aip-modal-close"
                                onClick={() => setInspectedItem(null)}
                            >
                                Close
                            </button>
                        </header>
                        <div className="aip-modal-body">
                            <div className={`aip-modal-preview ${bgMode === 'dark' ? 'bg-dark' : bgMode === 'check' ? 'bg-check' : ''}`}>
                                {inspectedItem.iconUrl ? (
                                    <img src={inspectedItem.iconUrl} alt={inspectedItem.tag} />
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                        <span className="aip-flag-missing">Figure geometry not found</span>
                                    </div>
                                )}
                            </div>
                            <dl className="aip-modal-details">
                                <dt>Canonical Type</dt>
                                <dd>{inspectedItem.type}</dd>
                                <dt>Shape</dt>
                                <dd>{inspectedItem.shape}</dd>
                                <dt>Dimensions</dt>
                                <dd>{inspectedItem.dims}</dd>
                                <dt>Stroke Outline</dt>
                                <dd>{inspectedItem.color}</dd>
                                <dt>Figure Status</dt>
                                <dd>
                                    {inspectedItem.figureExists ? (
                                        <span className="aip-flag-ok">
                                            <Check size={11} /> Figure OK
                                        </span>
                                    ) : (
                                        <span className="aip-flag-missing">
                                            <AlertTriangle size={11} /> MISSING FIGURE
                                        </span>
                                    )}
                                </dd>
                            </dl>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
