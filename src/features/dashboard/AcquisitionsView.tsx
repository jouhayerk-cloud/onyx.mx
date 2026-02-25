/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
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
import { imageCache, fetchImageBatch, getTextColorForBg, numberToCypher, calculateCodesAndPrices } from '../../lib/utils';
import { useNotify, useTranslation, useDatabase } from '../../lib/hooks';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { ItemThumbnail } from '../../components/ItemThumbnail';

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
            setAllAcquisitions(docs.map((doc: any) => ({
                row: doc.id,
                label: `${doc.shape} #${doc.itemNumber}`,
                imageUrl: doc.generatedPngUrl || (doc.mediaUrls ? doc.mediaUrls.split(',')[0].trim() : null),
                data: doc.toJSON()
            })));
            setIsLoading(false);
        });
        return () => sub.unsubscribe();
    }, [db, version]);

    const uniqueVendors = useMemo(() => {
        const vendorSet = new Set(allAcquisitions.map(item => item.data.itemId));
        return Array.from(vendorSet).sort();
    }, [allAcquisitions]);

    const filteredAcquisitions = useMemo(() => {
        return allAcquisitions.filter((item) => {
            const { data } = item;

            // 1. Live Flow Filtering
            if (mode === 'live') {
                const { status, payReq, payDate, sentDate } = data;
                // Only show if NOT fully delivered/paid
                const isFinished = !!payDate && !!sentDate;
                if (isFinished) return false;
            } else {
                // In standard acquisitions view, only show acquired items
                if (data.status !== 'Acquired') return false;
            }

            const vendorMatch = !activeVendor || data.itemId === activeVendor;
            const searchMatch = !searchTerm || Object.values(data).some(value =>
                String(value).toLowerCase().includes(searchTerm.toLowerCase())
            );

            const { status, payReq, payDate, dispersal_status } = item.data;
            const statusMatch = (() => {
                switch (statusFilter) {
                    case 'RED': return status === 'Acquired' && !dispersal_status;
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
        if (data.status === 'Acquired') return 'RED'; // Acquired, pending payment
        return ''; // Default
    };

    const gridTemplateColumns = '40px 50px 30px 128px 3fr 1.5fr';

    return (
        <div className="flex flex-col h-full gap-4">
            {isStatsVisible && (
                <div className="dashboard-stats">
                    <div className="stat-card">
                        <label htmlFor="exchange-rate">Exchange Rate (MXN to USD)</label>
                        <input id="exchange-rate" type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} step="0.1" />
                    </div>
                    <div className="stat-card">
                        <label htmlFor="workbook-prefix">Workbook Prefix</label>
                        <input id="workbook-prefix" type="text" value={workbookPrefix} onChange={e => setWorkbookPrefix(e.target.value)} />
                    </div>
                </div>
            )}
            <div className="dashboard-tabs">
                <button onClick={() => setActiveVendor(null)} className={`tab-button ${!activeVendor ? 'active' : ''}`}>All<span className="count">{allAcquisitions.length}</span></button>
                {uniqueVendors.map(vendor => {
                    const vendorColor = vendors[vendor as keyof typeof vendors]?.color;
                    const textColor = getTextColorForBg(vendorColor);
                    return (
                        <button key={vendor} onClick={() => setActiveVendor(vendor)} className={`tab-button vendor-tab ${activeVendor === vendor ? 'active' : ''}`}
                            style={activeVendor === vendor ? { backgroundColor: vendorColor, color: textColor, borderColor: vendorColor } : {}}>
                            {vendor}
                            <span className="count" style={activeVendor === vendor ? { backgroundColor: 'rgba(0,0,0,0.2)', color: textColor } : {}}>{allAcquisitions.filter(i => i.data.itemId === vendor).length}</span>
                        </button>
                    )
                })}
            </div>

            {isLoading ? (
                <div className="flex-grow flex items-center justify-center"><LoadingIndicator /></div>
            ) : (
                <div className="dashboard-content">
                    <div className="projects-section">
                        <div className="projects-section-header">
                            <p className="text-sm font-semibold">
                                {activeVendor ? `${activeVendor} Acquisitions` : 'All Acquisitions'}
                                <span className="ml-2 text-xs font-normal text-[var(--secondary-text-color)]">({filteredAcquisitions.length} items)</span>
                            </p>
                            {selectedRows.length > 0 && (
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-bold">{selectedRows.length} selected</span>
                                    <button onClick={handleCommitSelected} className="button secondary !min-h-0 text-xs py-1 px-3" disabled={isSaving}>
                                        {isSaving ? 'Committing...' : 'Commit Selected'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="project-boxes">
                            <div className="project-box-wrapper">
                                <div className="project-box-header" style={{ gridTemplateColumns, gap: '1rem' }}>
                                    <div></div>
                                    <div className="flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={filteredAcquisitions.length > 0 && selectedRows.length === filteredAcquisitions.length}
                                            onChange={() => handleToggleAll()}
                                            disabled={filteredAcquisitions.length === 0}
                                        />
                                    </div>
                                    <div>S</div>
                                    <div></div>
                                    <div>Details</div>
                                    <div className="text-center">Dimensions</div>
                                </div>
                            </div>
                            {filteredAcquisitions.map((item) => {
                                const vendorColor = vendors[item.data.itemId as keyof typeof vendors]?.color || '#888';
                                const statusClass = getStatusClass(item.data);
                                const calculated = calculateCodesAndPrices(item.data, exchangeRate, workbookPrefix);
                                const weightKg = parseFloat(item.data.weightKg) || 0;
                                const weightLbs = weightKg * 2.20462;
                                const widthIn = (parseFloat(item.data.widthCm) || 0) / 2.54;
                                const heightIn = (parseFloat(item.data.heightCm) || 0) / 2.54;
                                const lengthIn = (parseFloat(item.data.lengthCm) || 0) / 2.54;

                                return (
                                    <div key={item.row} className="project-box-wrapper">
                                        <div className="project-box" style={{ gridTemplateColumns, gap: '1rem', alignItems: 'center' }} onClick={() => setExpandedRow(expandedRow === item.row ? null : item.row)}>
                                            <div className="flex items-center justify-center">
                                                {item.data.status !== 'Acquired' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleGetItem(item); }}
                                                        className="button !p-2 !min-h-0 !bg-transparent hover:!bg-green-500/20 text-green-400"
                                                        title="Mark as Acquired"
                                                    >
                                                        <svg className="w-5 h-5"><use href="#check-circle"></use></svg>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.includes(item.row)}
                                                    onChange={() => handleToggleRow(item.row)}
                                                />
                                            </div>
                                            <div className="flex items-center justify-center">
                                                <div className={`status-dot ${statusClass}`} title={`Status: ${statusClass || 'N/A'}`}></div>
                                            </div>
                                            <div className="relative h-20">
                                                <ItemThumbnail
                                                    imageUrl={item.data.generatedPngUrl || (item.data.mediaUrls ? item.data.mediaUrls.split(',')[0].trim() : null)}
                                                    color={item.data.color}
                                                    shape={item.data.shape}
                                                    material={item.data.material}
                                                />
                                                <div
                                                    className="vendor-tag !text-xs !px-2 !py-1 absolute bottom-0 right-0 !rounded-none rounded-tl-lg z-10"
                                                    style={{ backgroundColor: vendorColor, color: getTextColorForBg(vendorColor) }}
                                                >
                                                    {item.data.itemId}
                                                </div>
                                            </div>
                                            <div className="box-content-line gap-1 overflow-hidden">
                                                <div className="codes-panel flex gap-4 text-xs">
                                                    <div className="flex items-baseline gap-1.5"><strong>Acq:</strong> <span>{calculated.bookAqCode || '-'}</span></div>
                                                    <div className="flex items-baseline gap-1.5"><strong>Lnd:</strong> <span>{calculated.bookLandCode || '-'}</span></div>
                                                </div>
                                                <p className="text-xs truncate italic opacity-60">{item.data.description}</p>
                                                <p className="font-mono text-base font-bold opacity-90 pt-1" title="Barcode">{calculated.bookBardcode || 'N/A'}</p>
                                            </div>
                                            <div className="dimensions-panel">
                                                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 text-xs">
                                                    <strong></strong><span className="text-right opacity-70">Metric</span><span className="text-right opacity-70">Imperial</span>
                                                    <strong>W:</strong> <span className="text-right">{item.data.widthCm || '-'}</span> <span className="text-right">{widthIn > 0 ? `${widthIn.toFixed(1)}"` : '-'}</span>
                                                    <strong>H:</strong> <span className="text-right">{item.data.heightCm || '-'}</span> <span className="text-right">{heightIn > 0 ? `${heightIn.toFixed(1)}"` : '-'}</span>
                                                    <strong>L:</strong> <span className="text-right">{item.data.lengthCm || '-'}</span> <span className="text-right">{lengthIn > 0 ? `${lengthIn.toFixed(1)}"` : '-'}</span>
                                                    <strong>Wt:</strong> <span className="text-right">{weightKg > 0 ? `${weightKg.toFixed(1)}kg` : '-'}</span> <span className="text-right">{weightLbs > 0 ? `${weightLbs.toFixed(1)}lb` : '-'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {expandedRow === item.row && (
                                            <div className="expanded-details price-panel">
                                                <div className="price-total price-mxn">
                                                    <span className="label">Cost (MXN)</span>
                                                    <span className="value">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(item.data.price || '0'))}</span>
                                                </div>
                                                <div className="price-total price-landed">
                                                    <span className="label">Landed (USD)</span>
                                                    <span className="value">{calculated.bookLanded !== '-' ? `$${calculated.bookLanded}` : '-'}</span>
                                                </div>
                                                <div className="price-total price-retail">
                                                    <span className="label">Retail (USD)</span>
                                                    <span className="value">{calculated.bookRetail !== '-' ? `$${calculated.bookRetail}` : '-'}</span>
                                                </div>
                                                <div className="col-span-full flex justify-end pt-2 border-t border-[var(--border-color)] mt-2">
                                                    <button onClick={() => handleViewDetails(item)} className="button secondary !min-h-0 text-xs py-1 px-3">View Details</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
};