

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import {
    acquisitionsVersionAtom,
    isDashboardStatsVisibleAtom,
    dashboardSearchTermAtom,
    dashboardStatusFilterAtom,
    userAtom,
    SelectedItemDataAtom,
    SelectedItemRowAtom,
    isDetailsPanelOpenAtom,
    detailsPanelModeAtom,
    exchangeRateAtom
} from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { InventoryItem, InventoryItemData } from '../../lib/Types';
import { imageCache, fetchImageBatch, getTextColorForBg, numberToCypher, calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { useNotify, useTranslation, useDatabase } from '../../lib/hooks';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { ItemThumbnail } from '../../components/ItemThumbnail';
import { InventoryImageItem } from '../catalog/InventoryImages';

interface AcquisitionsViewProps {
    mode?: 'live' | 'archive';
}

export const AcquisitionsView: React.FC<AcquisitionsViewProps> = ({ mode = 'archive' }) => {
    const [version, setVersion] = useAtom(acquisitionsVersionAtom);
    const [allAcquisitions, setAllAcquisitions] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeVendor, setActiveVendor] = useState<string | null>(null);
    const isStatsVisible = useAtomValue(isDashboardStatsVisibleAtom);
    const searchTerm = useAtomValue(dashboardSearchTermAtom);
    const statusFilter = useAtomValue(dashboardStatusFilterAtom);
    const notify = useNotify();
    const user = useAtomValue(userAtom);
    const [exchangeRate, setExchangeRate] = useAtom(exchangeRateAtom);

    const [workbookPrefix, setWorkbookPrefix] = useState('825');
    const [expandedRow, setExpandedRow] = useState<number | string | null>(null);
    const [selectedRows, setSelectedRows] = useState<(number | string)[]>([]);

    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);
    const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);

    const db = useDatabase();

    const apiCall = useCallback(async (action: string, payload: any) => {
        setIsSaving(true);
        try {
            if (!db) throw new Error("Database not ready");
            if (action === 'batchUpdateItems') {
                const updates = payload.updates.map((u: any) => ({
                    ...u.itemData,
                    id: u.row, // row is now ID in our refactored world
                    updatedAt: new Date().toISOString()
                }));
                await db.inventory.bulkUpsert(updates);
            }
            return { status: 'success' };
        } catch (error: any) {
            notify.error(`Error: ${error.message}`);
            throw error;
        } finally {
            setIsSaving(false);
        }
    }, [notify, db]);

    useEffect(() => {
        if (!db) {
            setIsLoading(false);
            return;
        }
        const sub = db.inventory.find().$.subscribe((docs: any) => {
            setAllAcquisitions(docs.map((doc: any) => {
                const norm = normalizeInventoryData(doc.toJSON());
                return {
                    row: doc.id,
                    label: `${norm.shape || '?'} #${norm.itemNumber || '?'}`,
                    imageUrl: norm.generatedPngUrl || (norm.mediaUrls ? norm.mediaUrls.split(',')[0].trim() : null),
                    data: norm
                };
            }));
            setIsLoading(false);
        });
        return () => sub.unsubscribe();
    }, [db, version]);

    const uniqueVendors = useMemo(() => {
        const vendorSet = new Set(allAcquisitions.map(item => item.data.itemId?.split('-')[0]));
        return Array.from(vendorSet).filter(Boolean).sort() as string[];
    }, [allAcquisitions]);

    const filteredAcquisitions = useMemo(() => {
        return allAcquisitions.filter((item) => {
            const { data } = item;

            if (mode === 'live') {
                const { status, payReq, payDate, sentDate } = data;

                const isFinished = !!payDate && !!sentDate;
                if (isFinished) return false;
            } else {

                if (data.status !== 'Acquired' && data.status !== 'Acquisitions') return false;
            }

            const vendorMatch = !activeVendor || data.itemId?.startsWith(activeVendor);
            const searchMatch = !searchTerm || Object.values(data).some(value =>
                String(value).toLowerCase().includes(searchTerm.toLowerCase())
            );

            const { status, payReq, payDate, dispersal_status } = item.data;
            const statusMatch = (() => {
                switch (statusFilter) {
                    case 'RED': return (status === 'Acquired' || status === 'Acquisitions') && !dispersal_status;
                    case 'YELLOW': return dispersal_status === 'Requested' || dispersal_status === 'Sent';
                    case 'GREEN': return dispersal_status === 'Dispersed' || !!payDate;
                    case 'ALL':
                    default: return true;
                }
            })();

            return vendorMatch && searchMatch && statusMatch;
        });
    }, [searchTerm, allAcquisitions, activeVendor, statusFilter, mode]);

    const handleToggleRow = (row: number | string) => {
        setSelectedRows(prev => prev.includes(row) ? prev.filter(r => r !== row) : [...prev, row]);
    };

    const handleToggleAll = () => {
        if (selectedRows.length === filteredAcquisitions.length) {
            setSelectedRows([]);
        } else {
            setSelectedRows(filteredAcquisitions.map(item => item.row));
        }
    };

    const handleCommitSelected = async () => {
        if (selectedRows.length === 0) return;
        const toastId = notify.loading(`Committing ${selectedRows.length} items...`);

        const updates = allAcquisitions
            .filter(item => selectedRows.includes(item.row))
            .map(item => {
                const calculated = calculateCodesAndPrices(item.data, exchangeRate, workbookPrefix);
                const itemData: Partial<InventoryItemData> = {
                    printDate: new Date().toISOString(),
                    ...calculated
                };
                return { row: item.row, itemData };
            });

        try {
            await apiCall('batchUpdateItems', { updates });
            notify.success(`${selectedRows.length} items committed!`, { id: toastId });
            setVersion(v => v + 1);
            setSelectedRows([]);
        } catch (e) {
            notify.error('Commit failed.', { id: toastId });
        }
    };

    const handleGetItem = async (item: InventoryItem) => {
        const toastId = notify.loading(`Approving ${item.data.shape} #${item.data.itemNumber}...`);
        try {
            await apiCall('batchUpdateItems', {
                updates: [{ row: item.row, itemData: { status: 'Acquired', acquired_at: new Date().toISOString(), acquired_by: user?.email } }]
            });
            notify.success('Item approved for payment!', { id: toastId });
            setVersion(v => v + 1);
        } catch (e) {
            notify.error('Failed to approve item.', { id: toastId });
        }
    };

    const handleViewDetails = (item: InventoryItem) => {
        setSelectedItemRow(item.row);
        setSelectedItemData(item.data);
        setDetailsPanelMode('view');
        setIsDetailsPanelOpen(true);
    };

    const getStatusClass = (data: InventoryItemData) => {
        if (data.dispersal_status === 'Dispersed' || data.payDate) return 'GREEN'; // Paid/Dispersed
        if (data.dispersal_status === 'Requested' || data.dispersal_status === 'Sent') return 'YELLOW'; // In Progress
        if (data.status === 'Acquired' || data.status === 'Acquisitions') return 'RED'; // Acquired, pending payment
        return ''; // Default
    };

    const gridTemplateColumns = '40px 50px 30px 128px 3fr 1.5fr';

    return (
        <div className="flex flex-col h-full overflow-hidden bg-(--bg-color-main)">
            {mode === 'archive' && (
                <div className="dashboard-stats py-2 px-4 border-b border-white/5 bg-black/20">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] uppercase font-bold text-white/30 tracking-widest" htmlFor="exchange-rate">MXN/USD</label>
                            <input id="exchange-rate" className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs w-16" type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} step="0.1" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] uppercase font-bold text-white/30 tracking-widest" htmlFor="workbook-prefix">Book</label>
                            <input id="workbook-prefix" className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs w-16 uppercase" type="text" value={workbookPrefix} onChange={e => setWorkbookPrefix(e.target.value)} />
                        </div>
                    </div>
                </div>
            )}
            <div className="dashboard-tabs">
                <button onClick={() => setActiveVendor(null)} className={`tab-button ${!activeVendor ? 'active' : ''}`}>All<span className="count">{allAcquisitions.filter(i => i.data.status !== 'Pending Deletion').length}</span></button>
                {uniqueVendors.map(vendor => {
                    const vendorColor = vendors[vendor as keyof typeof vendors]?.color;
                    const textColor = getTextColorForBg(vendorColor);
                    return (
                        <button key={vendor} onClick={() => setActiveVendor(vendor)} className={`tab-button vendor-tab ${activeVendor === vendor ? 'active' : ''}`}
                            style={activeVendor === vendor ? { backgroundColor: vendorColor, color: textColor, borderColor: vendorColor } : {}}>
                            {vendor}
                            <span className="count" style={activeVendor === vendor ? { backgroundColor: 'rgba(0,0,0,0.2)', color: textColor } : {}}>{allAcquisitions.filter(i => i.data.itemId?.startsWith(vendor) && i.data.status !== 'Pending Deletion').length}</span>
                        </button>
                    )
                })}
            </div>

            {isLoading ? (
                <div className="grow flex items-center justify-center"><LoadingIndicator /></div>
            ) : (
                <div className="dashboard-content">
                    <div className="projects-section">
                        <div className="projects-section-header">
                            <p className="text-sm font-semibold">
                                {activeVendor ? `${activeVendor} Acquisitions` : 'All Acquisitions'}
                                <span className="ml-2 text-xs font-normal text-(--secondary-text-color)">({filteredAcquisitions.length} items)</span>
                            </p>
                            {selectedRows.length > 0 && (
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-bold">{selectedRows.length} selected</span>
                                    <button onClick={handleCommitSelected} className="button secondary min-h-0! text-xs py-1 px-3" disabled={isSaving}>
                                        {isSaving ? 'Committing...' : 'Commit Selected'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full mt-4">
                            {filteredAcquisitions.map((item) => (
                                <InventoryImageItem
                                    key={item.row}
                                    item={item}
                                    onClick={(i) => handleViewDetails(i)}
                                    isSelectMode={true}
                                    isSelected={selectedRows.includes(item.row)}
                                    onToggleSelect={(i) => handleToggleRow(i.row)}
                                    exchangeRate={exchangeRate}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
};