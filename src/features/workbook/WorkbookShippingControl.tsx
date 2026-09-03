
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useAtom, useSetAtom, useAtomValue, useStore } from 'jotai/react';
import { InventoryItem, Crate, PackedItem } from '../../lib/Types';
import {
    workbookShippingCratesAtom,
    workbookDataAtom,
    workbookSelectedCrateIdAtom,
    workbookAreCrateInfoLabelsVisibleAtom,
    userAtom,
    workbookShippingViewModeAtom,
    workbookCratesVersionAtom,
    workbookTriggerWarehouseOrganizationAtom,
    workbookTruckViewSelectedWarehouseCrateIdAtom,
    workbookTempCratePositionAtom,
    shippingTruckDimsAtom,
    WAREHOUSE_DIMS,
    workbookAtom,
} from '../../lib/atoms';
import { vendors, SCRIPT_URL } from '../../lib/consts';
import { exportToXLSX } from '../../lib/xlsxUtils';
import toast from 'react-hot-toast';
import { tr } from '../../lib/i18n';

const getTextColorForBg = (hexColor: string | undefined): string => {
    if (!hexColor) return '#000000';
    const rgb = parseInt(hexColor.substring(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#FFFFFF' : '#000000';
}

const calculateNextWarehousePosition = (warehouseCrates: Crate[], newCrateDims: { w: number, d: number }, warehouseDims: { width: number, depth: number }) => {
    const PADDING = 0.1;
    const HALF_WIDTH = warehouseDims.width / 2;
    const HALF_DEPTH = warehouseDims.depth / 2;
    const START_X = -HALF_WIDTH;
    const START_Z = -HALF_DEPTH;

    if (warehouseCrates.length === 0) {
        return { x: START_X + newCrateDims.w / 2, z: START_Z + newCrateDims.d / 2 };
    }

    const sortedCrates = [...warehouseCrates].sort((a, b) => a.z - b.z || a.x - b.x);
    let lastCrate = sortedCrates[sortedCrates.length - 1];
    let nextX = lastCrate.x + lastCrate.w / 2 + PADDING + newCrateDims.w / 2;
    let nextZ = lastCrate.z;

    if (nextX + newCrateDims.w / 2 > HALF_WIDTH) {
        const cratesInLastRow = sortedCrates.filter(c => c.z === lastCrate.z);
        const maxDepthInRow = Math.max(...cratesInLastRow.map(c => c.d));
        nextZ = lastCrate.z - lastCrate.d / 2 + maxDepthInRow + PADDING + newCrateDims.d / 2;
        nextX = START_X + newCrateDims.w / 2;
    }

    if (nextZ + newCrateDims.d / 2 > HALF_DEPTH) {
        const maxX = Math.max(...sortedCrates.map(c => c.x + c.w / 2));
        nextX = maxX + PADDING + newCrateDims.w / 2;
        nextZ = START_Z + newCrateDims.d / 2;
    }

    return { x: nextX, z: nextZ };
};

const findNextTruckPosition = (cratesInTruck: Crate[], newCrate: Crate, truckDims: { length: number, width: number, height: number }): { x: number; z: number } | null => {
    const truckHalfLength = truckDims.length / 2;
    const truckHalfWidth = truckDims.width / 2;
    const PADDING = 0.05;

    const isRotated = newCrate.rotationY && Math.abs(newCrate.rotationY - Math.PI / 2) < 0.01;
    const crateW = isRotated ? newCrate.d : newCrate.w;
    const crateD = isRotated ? newCrate.w : newCrate.d;

    for (let x = -truckHalfLength + crateW / 2; x <= truckHalfLength - crateW / 2; x += 0.01) {
        for (let z = -truckHalfWidth + crateD / 2; z <= truckHalfWidth - crateD / 2; z += 0.01) {
            const newBox = new THREE.Box2(
                new THREE.Vector2(x - crateW / 2 - PADDING, z - crateD / 2 - PADDING),
                new THREE.Vector2(x + crateW / 2 + PADDING, z + crateD / 2 + PADDING)
            );

            const collision = cratesInTruck.some(existingCrate => {
                const existingIsRotated = existingCrate.rotationY && Math.abs(existingCrate.rotationY - Math.PI / 2) < 0.01;
                const existingW = existingIsRotated ? existingCrate.d : existingCrate.w;
                const existingD = existingIsRotated ? existingCrate.w : existingCrate.d;

                const existingBox = new THREE.Box2(
                    new THREE.Vector2(existingCrate.x - existingW / 2, existingCrate.z - existingD / 2),
                    new THREE.Vector2(existingCrate.x + existingW / 2, existingCrate.z + existingD / 2)
                );
                return newBox.intersectsBox(existingBox);
            });

            if (!collision) return { x, z };
        }
    }
    return null;
};

const WarehouseViewControls = ({ saveCratesToBackend }: { saveCratesToBackend: (crates: Crate[], message: string) => Promise<void> }) => {
    const [crates, setCrates] = useAtom(workbookShippingCratesAtom);
    const workbookData = useAtomValue(workbookDataAtom);
    const workbook = useAtomValue(workbookAtom);
    const [selectedCrateId, setSelectedCrateId] = useAtom(workbookSelectedCrateIdAtom);
    const user = useAtomValue(userAtom);
    const warehouseDims = useAtomValue(WAREHOUSE_DIMS);

    const [newCrateDesc, setNewCrateDesc] = useState('');
    const [newCrateDims, setNewCrateDims] = useState({ w: 120, h: 120, d: 120 });
    const [newCrateBaseWeight, setNewCrateBaseWeight] = useState('5');
    const [selectedVendor, setSelectedVendor] = useState('All');
    const [selectedItemRows, setSelectedItemRows] = useState<number[]>([]);

    const warehouseCrates = useMemo(() => crates.filter(c => c.location === 'warehouse'), [crates]);
    const selectedCrate = useMemo(() => crates.find(c => c.id === selectedCrateId), [crates, selectedCrateId]);


    const itemsToShip = useMemo(() => {
        const packedItemRows = new Set(crates.flatMap(c => c.inventoryItems.map(i => i.row)));
        const items = workbookData.map((wbItem, index) => {
            const row = wbItem.data;
            const sheetName = wbItem.sheetName;
            const sheet = workbook?.Sheets[sheetName];
            const vendorIdRaw = sheet ? (sheet['A1'] ? sheet['A1'].v : '') : '';
            let vendorKey = String(vendorIdRaw).trim();
            if (!vendors[vendorKey as keyof typeof vendors]) {
                vendorKey = Object.keys(vendors).find(k => sheetName.includes(k) || k === sheetName) || '';
            }

            return {
                row: index,
                sheetName,
                vendorId: vendorKey,
                data: {
                    itemId: vendorKey,
                    itemNumber: row[0] ? String(row[0]) : '',
                    shape: row[2] ? String(row[2]) : 'Unknown',
                    weightKg: row[5] ? String(row[5]) : '0',
                    widthCm: row[7] ? String(row[7]) : '0',
                    heightCm: row[6] ? String(row[6]) : '0',
                    lengthCm: row[8] ? String(row[8]) : '0',
                    price: row[9] ? String(row[9]) : '0',
                    bookBardcode: row[3] ? String(row[3]) : '',
                }
            };
        });

        return items
            .filter(item => !packedItemRows.has(item.row))
            .filter(item => selectedVendor === 'All' || item.vendorId === selectedVendor);
    }, [workbookData, workbook, crates, selectedVendor]);

    const handleUnloadItem = async (itemToUnload: PackedItem) => {
        if (!selectedCrate) return;
        const orginalCrates = crates;

        const updatedCrates = crates.map(c => {
            if (c.id === selectedCrateId) {
                const newItems = c.inventoryItems.filter(i => i.row !== itemToUnload.row);
                const newWeight = c.baseWeight + newItems.reduce((sum, i) => sum + parseFloat(i.weightKg || '0'), 0);
                const newVendorId = newItems.length > 0 ? newItems[0].itemId : undefined;
                return { ...c, inventoryItems: newItems, weight: newWeight, vendorId: newVendorId };
            }
            return c;
        });

        setCrates(updatedCrates); // Optimistic UI update
        const toastId = toast.loading(tr("Unloading item..."));

        try {
            const res = await fetch(SCRIPT_URL, {
                method: 'POST', body: JSON.stringify({ action: 'batchUpdateCrates', crates: updatedCrates, user, source: 'workbook' }),
            });
            const result = await res.json();

            if (result.status !== 'success') {
                throw new Error(result.message);
            }

            toast.success(`Unloaded item from ${selectedCrateId}.`, { id: toastId });
        } catch (error: any) {
            toast.error(`Unload failed: ${error.message}`, { id: toastId });
            setCrates(orginalCrates);
        }
    };

    const handleCreateCrate = () => {
        if (!newCrateDesc.trim()) return toast.error(tr("Description is required."));
        const newId = `WB-CRATE-${Date.now().toString().slice(-6)}`;
        const crateDimsMeters = { w: newCrateDims.w / 100, d: newCrateDims.d / 100 };
        const { x, z } = calculateNextWarehousePosition(warehouseCrates, crateDimsMeters, warehouseDims);
        const newCrate: Crate = {
            id: newId, desc: newCrateDesc, weight: parseFloat(newCrateBaseWeight) || 5, baseWeight: parseFloat(newCrateBaseWeight) || 5,
            w: crateDimsMeters.w, h: newCrateDims.h / 100, d: crateDimsMeters.d,
            x, y: 0, z, inventoryItems: [], location: 'warehouse', rotationY: 0,
        };
        saveCratesToBackend([...crates, newCrate], `Crate ${newId} created.`);
        setNewCrateDesc('');
    };

    const handlePackItems = async () => {
        if (!selectedCrateId || selectedItemRows.length === 0) return;
        const itemsToPack = itemsToShip.filter(i => selectedItemRows.includes(i.row));
        if (itemsToPack.length === 0) return;

        const packedItems: PackedItem[] = itemsToPack.map(item => ({
            row: item.row, itemId: item.data.itemId, itemNumber: item.data.itemNumber, shape: item.data.shape,
            material: 'Workbook Item', weightKg: item.data.weightKg, color: '',
            widthCm: item.data.widthCm, heightCm: item.data.heightCm, lengthCm: item.data.lengthCm, price: Math.round(parseFloat(item.data.price || '0')).toString(),
            bookBardcode: item.data.bookBardcode,
        }));

        const updatedCrates = crates.map(c => {
            if (c.id === selectedCrateId) {
                const newItems = [...c.inventoryItems, ...packedItems];
                const newWeight = c.baseWeight + newItems.reduce((sum, i) => sum + parseFloat(i.weightKg || '0'), 0);
                const newVendorId = newItems.length > 0 ? newItems[0].itemId : c.vendorId;
                return { ...c, inventoryItems: newItems, weight: newWeight, vendorId: newVendorId };
            }
            return c;
        });

        try {
            await saveCratesToBackend(updatedCrates, `Packed ${itemsToPack.length} items into ${selectedCrateId}.`);
            setSelectedItemRows([]);
        } catch (error: any) {
            toast.error(`Packing failed: ${error.message}`);
        }
    };
    const uniqueVendors = ['All', ...new Set(itemsToShip.map(i => i.vendorId))];
    return (
        <>
            <div className="shipping-sidebar-section">
                <h2>{tr("Ready to Ship (Workbook)")}</h2>
                <div className="vendor-filter-buttons">
                    {uniqueVendors.map(vendor => (
                        <button key={vendor} onClick={() => setSelectedVendor(vendor)}
                            className={`vendor-filter-button ${selectedVendor === vendor ? 'active' : ''}`}
                            style={{ color: vendors[vendor as keyof typeof vendors]?.color || '#888' }}
                        >{vendor}</button>
                    ))}
                </div>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2">
                    {itemsToShip.map(item => (
                        <label key={item.row} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/10 text-xs cursor-pointer">
                            <input type="checkbox" checked={selectedItemRows.includes(item.row)} onChange={() => setSelectedItemRows(p => p.includes(item.row) ? p.filter(r => r !== item.row) : [...p, item.row])} />
                            <span className="font-bold">{item.data.itemId}-{item.data.itemNumber}</span>
                            <span className="truncate">{item.data.shape}</span>
                            <span className="ml-auto font-mono shrink-0">{item.data.weightKg}kg</span>
                        </label>
                    ))}
                </div>
                <button className="button" onClick={handlePackItems} disabled={!selectedCrateId || selectedItemRows.length === 0}>
                    Pack ({selectedItemRows.length}) items into {selectedCrateId || '...'}
                </button>
            </div>
            <div className="shipping-sidebar-section">
                <h2>{tr("Crate Manager")}</h2>
                <div className="space-y-2 p-2 border border-[var(--border-color)] rounded-lg">
                    <h3 className="font-bold text-sm">{tr("Create New Crate")}</h3>
                    <input type="text" value={newCrateDesc} onChange={e => setNewCrateDesc(e.target.value)} placeholder={tr("New Crate Name...")} />
                    <div className="grid grid-cols-3 gap-2">
                        <input type="number" value={newCrateDims.w} onChange={e => setNewCrateDims(d => ({ ...d, w: Number(e.target.value) }))} placeholder={tr("W (cm)")} />
                        <input type="number" value={newCrateDims.h} onChange={e => setNewCrateDims(d => ({ ...d, h: Number(e.target.value) }))} placeholder={tr("H (cm)")} />
                        <input type="number" value={newCrateDims.d} onChange={e => setNewCrateDims(d => ({ ...d, d: Number(e.target.value) }))} placeholder={tr("D (cm)")} />
                    </div>
                    <input type="number" value={newCrateBaseWeight} onChange={e => setNewCrateBaseWeight(e.target.value)} placeholder={tr("Base Wt (kg)")} />
                    <button className="button w-full" onClick={handleCreateCrate}>{tr("Create")}</button>
                </div>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2">
                    {warehouseCrates.map(crate => (
                        <div key={crate.id} onClick={() => setSelectedCrateId(crate.id)}
                            className={`crate-item ${selectedCrateId === crate.id ? 'selected' : ''}`}>
                            <p className="font-bold text-sm">{crate.id}</p>
                            <p className="text-xs opacity-80">{crate.inventoryItems.length} items, {crate.weight.toFixed(1)} kg</p>
                        </div>
                    ))}
                </div>
            </div>
            {selectedCrate && selectedCrate.location === 'warehouse' && selectedCrate.inventoryItems.length > 0 && (
                <div className="shipping-sidebar-section">
                    <h2>{tr("Contents:")} {selectedCrate.id}</h2>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2">
                        {selectedCrate.inventoryItems.map(item => (
                            <div key={item.row} className="flex items-center justify-between gap-2 p-2 rounded-md bg-black/20 text-xs">
                                <div className="truncate">
                                    <span className="font-bold">{item.itemId}-{item.itemNumber}</span>
                                    <span className="opacity-80 ml-2">{item.shape}</span>
                                </div>
                                <button
                                    onClick={() => handleUnloadItem(item)}
                                    className="button danger !p-1 !min-h-0 !text-xs !py-0.5 shrink-0"
                                    title={`Unload ${item.itemId}-${item.itemNumber}`}
                                >
                                    {tr("Unload")}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};

const TruckViewControls = ({ saveCratesToBackend }: { saveCratesToBackend: (crates: Crate[], message: string) => Promise<void> }) => {
    const crates = useAtomValue(workbookShippingCratesAtom);
    const [selectedCrateId, setSelectedCrateId] = useAtom(workbookSelectedCrateIdAtom);
    const [truckCrateId, setTruckCrateId] = useAtom(workbookTruckViewSelectedWarehouseCrateIdAtom);
    const [tempPosition, setTempPosition] = useAtom(workbookTempCratePositionAtom);
    const truckDims = useAtomValue(shippingTruckDimsAtom);
    const warehouseDims = useAtomValue(WAREHOUSE_DIMS);
    const store = useStore();

    const warehouseCrates = useMemo(() => crates.filter(c => c.location === 'warehouse'), [crates]);
    const truckCrates = useMemo(() => crates.filter(c => c.location === 'truck'), [crates]);
    const selectedCrateInTruck = useMemo(() => truckCrates.find(c => c.id === selectedCrateId), [truckCrates, selectedCrateId]);
    const truckPositionZ = (warehouseDims.depth / 2) + (truckDims.width / 2) + 0.5;

    useEffect(() => {
        if (selectedCrateInTruck) {
            setTempPosition({
                x: selectedCrateInTruck.x,
                y: selectedCrateInTruck.y,
                z: selectedCrateInTruck.z - truckPositionZ
            });
        } else {
            setTempPosition(null);
        }
    }, [selectedCrateInTruck, setTempPosition, truckDims.width, warehouseDims.depth, truckPositionZ]);

    const handleLoadToTruck = async () => {
        if (!truckCrateId) return;
        const crateToLoad = crates.find(c => c.id === truckCrateId);
        if (!crateToLoad) return;

        const nextPosition = findNextTruckPosition(truckCrates, crateToLoad, truckDims);
        if (!nextPosition) {
            return toast.error(tr("No available space in truck."));
        }

        const updatedCrates = crates.map(c => c.id === truckCrateId ? { ...c, location: 'truck' as 'truck', x: nextPosition.x, z: nextPosition.z + truckPositionZ, y: 0 } : c);
        await saveCratesToBackend(updatedCrates, `${truckCrateId} loaded into truck.`);
        setTruckCrateId(null);
    };

    const handleUnloadFromTruck = async () => {
        if (!selectedCrateId) return;
        const crateToUnload = crates.find(c => c.id === selectedCrateId);
        if (!crateToUnload) return;

        const warehouseCrates = crates.filter(c => c.location === 'warehouse');
        const nextPos = calculateNextWarehousePosition(warehouseCrates, { w: crateToUnload.w, d: crateToUnload.d }, store.get(WAREHOUSE_DIMS));

        const updatedCrates = crates.map(c => c.id === selectedCrateId ? { ...c, location: 'warehouse' as 'warehouse', x: nextPos.x, z: nextPos.z, y: 0, rotationY: 0 } : c);
        await saveCratesToBackend(updatedCrates, `${selectedCrateId} unloaded to warehouse.`);
        setSelectedCrateId(null);
    };

    const handleSavePosition = async () => {
        if (!selectedCrateId || !tempPosition) return;
        const updatedCrates = crates.map(c => c.id === selectedCrateId ? { ...c, x: tempPosition.x, y: tempPosition.y, z: tempPosition.z + truckPositionZ } : c);
        await saveCratesToBackend(updatedCrates, 'Position saved!');
    };

    const handleRotateCrate = async () => {
        if (!selectedCrateId) return;
        const updatedCrates = crates.map(c => {
            if (c.id === selectedCrateId) {
                const newRotation = (c.rotationY || 0) + Math.PI / 2;
                return { ...c, rotationY: newRotation % (Math.PI * 2) };
            }
            return c;
        });
        await saveCratesToBackend(updatedCrates, 'Crate rotated!');
    };

    return (
        <>
            <div className="shipping-sidebar-section">
                <h2>{tr("Warehouse Crates")}</h2>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2">
                    {warehouseCrates.map(crate => (
                        <div key={crate.id} onClick={() => setTruckCrateId(crate.id)}
                            className={`crate-item ${truckCrateId === crate.id ? 'selected' : ''}`}>
                            <p className="font-bold text-sm">{crate.id}</p>
                            <p className="text-xs opacity-80">{crate.inventoryItems.length} items, {crate.weight.toFixed(1)} kg</p>
                        </div>
                    ))}
                </div>
                <button className="button" onClick={handleLoadToTruck} disabled={!truckCrateId}>{tr("Load to Truck")}</button>
            </div>
            <div className="shipping-sidebar-section">
                <h2>{tr("Crates in Truck")}</h2>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2">
                    {truckCrates.map(crate => (
                        <div key={crate.id} onClick={() => setSelectedCrateId(crate.id)}
                            className={`crate-item ${selectedCrateId === crate.id ? 'selected' : ''}`}>
                            <p className="font-bold text-sm">{crate.id}</p>
                        </div>
                    ))}
                </div>
                {selectedCrateInTruck && tempPosition && (
                    <div className="space-y-2 p-2 border border-[var(--main-color)] rounded-lg">
                        <h3 className="font-bold text-sm">{tr("Position:")} {selectedCrateId}</h3>
                        <div>
                            <label className="text-xs">{tr("X (Front/Back):")} {tempPosition.x.toFixed(2)}m</label>
                            <input type="range" min={-truckDims.length / 2 + selectedCrateInTruck.w / 2} max={truckDims.length / 2 - selectedCrateInTruck.w / 2} step="0.01" value={tempPosition.x} onChange={e => setTempPosition(p => p ? ({ ...p, x: parseFloat(e.target.value) }) : null)} />
                        </div>
                        <div>
                            <label className="text-xs">{tr("Z (Left/Right):")} {tempPosition.z.toFixed(2)}m</label>
                            <input type="range" min={-truckDims.width / 2 + selectedCrateInTruck.d / 2} max={truckDims.width / 2 - selectedCrateInTruck.d / 2} step="0.01" value={tempPosition.z} onChange={e => setTempPosition(p => p ? ({ ...p, z: parseFloat(e.target.value) }) : null)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button className="button secondary" onClick={handleUnloadFromTruck}>{tr("Unload")}</button>
                            <button className="button secondary" onClick={handleRotateCrate}>{tr("Rotate Crate")}</button>
                            <button className="button col-span-2" onClick={handleSavePosition}>{tr("Save Position")}</button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export const WorkbookShippingControl = ({ isVisible }: { isVisible: boolean }) => {
    const viewMode = useAtomValue(workbookShippingViewModeAtom);
    const [crates, setCrates] = useAtom(workbookShippingCratesAtom);
    const [isSaving, setIsSaving] = useState(false);
    const [areLabelsVisible, setAreLabelsVisible] = useAtom(workbookAreCrateInfoLabelsVisibleAtom);
    const user = useAtomValue(userAtom);
    const setCratesVersion = useSetAtom(workbookCratesVersionAtom);
    const triggerOrganization = useAtomValue(workbookTriggerWarehouseOrganizationAtom);
    const warehouseDims = useAtomValue(WAREHOUSE_DIMS);

    const saveCratesToBackend = useCallback(async (updatedCrates: Crate[], successMessage: string) => {
        setIsSaving(true);
        const toastId = toast.loading(tr("Saving..."));
        try {
            const res = await fetch(SCRIPT_URL, {
                method: 'POST', body: JSON.stringify({ action: 'batchUpdateCrates', crates: updatedCrates, user, source: 'workbook' }),
            });
            const result = await res.json();
            if (result.status !== 'success') throw new Error(result.message);
            toast.success(successMessage, { id: toastId });
            setCrates(updatedCrates); // Optimistic update
            setCratesVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Save failed: ${error.message}`, { id: toastId });
            throw error;
        } finally {
            setIsSaving(false);
        }
    }, [setCrates, setCratesVersion, setIsSaving, user]);

    useEffect(() => {
        if (triggerOrganization === 0) return;
        const organize = async () => {
            const warehouseCrates = crates.filter(c => c.location === 'warehouse');
            if (warehouseCrates.length === 0) return;
            const groupedByVendor = warehouseCrates.reduce<Record<string, Crate[]>>((acc, crate) => {
                const vendorId = crate.vendorId || 'UNKNOWN';
                if (!acc[vendorId]) {
                    acc[vendorId] = [];
                }
                acc[vendorId].push(crate);
                return acc;
            }, {});

            Object.values(groupedByVendor).forEach(group => {
                group.sort((a, b) => (b.w * b.d) - (a.w * a.d));
            });

            const sortedCrates = Object.keys(groupedByVendor).sort().flatMap(vendorId => groupedByVendor[vendorId]);
            const newPositions: Crate[] = [];
            let currentX = -warehouseDims.width / 2;
            let currentZ = -warehouseDims.depth / 2;
            let rowMaxDepth = 0;

            sortedCrates.forEach(crate => {
                const w = crate.w;
                const d = crate.d;
                if (currentX + w > warehouseDims.width / 2) {
                    currentZ += rowMaxDepth + 0.1;
                    currentX = -warehouseDims.width / 2;
                    rowMaxDepth = 0;
                }
                newPositions.push({ ...crate, x: currentX + w / 2, z: currentZ + d / 2, y: 0 });
                currentX += w + 0.1;
                if (d > rowMaxDepth) rowMaxDepth = d;
            });

            const updatedCrates = crates.map(c => {
                const newPosCrate = newPositions.find(nc => nc.id === c.id);
                return newPosCrate || c;
            });
            await saveCratesToBackend(updatedCrates, "Warehouse organized!");
        };
        organize();
    }, [triggerOrganization, crates, warehouseDims, saveCratesToBackend]);


    const handleExportPackingList = async () => {
        if (crates.length === 0) return toast.error(tr("No crates to export."));
        const dataForExport: any[][] = [];
        const styles: { [key: string]: { bgColor?: string, bold?: boolean, textColor?: string } } = {};
        dataForExport.push(['Crate ID', 'Vendor', 'Item ID', 'Shape', 'Material', 'Dimensions (cm)', 'Weight (kg)', 'Barcode', 'Color']);
        const groupedByVendor: { [key: string]: { crate: Crate, item: PackedItem }[] } = {};
        crates.forEach((crate: Crate) => {
            crate.inventoryItems.forEach(item => {
                const vendorId = crate.vendorId || item.itemId || 'UNKNOWN';
                if (!groupedByVendor[vendorId]) groupedByVendor[vendorId] = [];
                groupedByVendor[vendorId].push({ crate, item });
            });
        });
        Object.keys(groupedByVendor).sort().forEach(vendorId => {
            const vendorColor = vendors[vendorId as keyof typeof vendors]?.color;
            const styleKey = `vendor-${vendorId}`;
            if (vendorColor && !styles[styleKey]) {
                styles[styleKey] = { bgColor: vendorColor, textColor: getTextColorForBg(vendorColor), bold: true };
            }
            groupedByVendor[vendorId].forEach(({ crate, item }) => {
                const dimensions = `${item.widthCm || '?'}x${item.heightCm || '?'}x${item.lengthCm || '?'}`;
                dataForExport.push([
                    { value: crate.id, styleKey }, { value: vendorId, styleKey },
                    { value: `${item.itemId}-${item.itemNumber}`, styleKey },
                    { value: item.shape, styleKey }, { value: item.material, styleKey },
                    { value: dimensions, styleKey }, { value: item.weightKg, styleKey },
                    { value: item.bookBardcode, styleKey }, { value: item.color, styleKey },
                ]);
            });
        });
        await exportToXLSX(`packing_list_workbook_${new Date().toISOString().slice(0, 10)}`, [{ name: 'Packing List', data: dataForExport }], styles);
    };

    if (!isVisible) return null;
    return (
        <aside className="shipping-sidebar">
            <div className="shipping-sidebar-content">
                {viewMode === 'warehouse' ? <WarehouseViewControls saveCratesToBackend={saveCratesToBackend} /> : <TruckViewControls saveCratesToBackend={saveCratesToBackend} />}
            </div>
            <div className="shipping-sidebar-footer">
                <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={areLabelsVisible} onChange={() => setAreLabelsVisible(v => !v)} /> {tr("Show Labels")}
                    </label>
                </div>
                <div className="shipping-actions-grid">
                    <button className="button export" onClick={handleExportPackingList}>{tr("Export List")}</button>
                    <button className="button ship col-span-2" disabled={isSaving}>{tr("Ship Truck")}</button>
                </div>
            </div>
        </aside>
    );
};
