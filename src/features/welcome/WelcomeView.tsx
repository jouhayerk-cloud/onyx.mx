import React, { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, activeViewAtom, sidebarStateAtom, logisticsSubTabAtom, inventoryVendorFilterAtom } from '../../lib/atoms';
import { ArrowRight } from 'lucide-react';
import { Vault, Slow } from '@lucasmarkes/hairline/react';
import { Mascot } from 'page-mascot';
import { InventoryTutorial } from '../inventory/InventoryTutorial';
import { FileCabinet } from './hairline/FileCabinet';
import { Truck } from './hairline/Truck';
import { tr } from '../../lib/i18n';
import './welcome.css';

type Area = 'inv' | 'fin' | 'log' | 'shp';

interface TileProps {
    area: Area;
    title: string;
    sub: string;
    onOpen: () => void;
    /** The figure; it calls onRead with the few characters that name what is under the pointer. */
    figure: (onRead: (text: string) => void) => React.ReactNode;
    /** The figure handles clicks itself (the cabinet opens a vendor); otherwise the whole plate is the link. */
    ownClicks?: boolean;
}

const Tile: React.FC<TileProps> = ({ area, title, sub, onOpen, figure, ownClicks }) => {
    const [read, setRead] = useState('');
    return (
        <section className="wl-tile" data-area={area} aria-label={title}>
            <div className="wl-fig" onClick={ownClicks ? undefined : onOpen}>
                {figure(setRead)}
                {read && <span className="wl-read" aria-hidden="true">{read}</span>}
            </div>
            <div className="wl-meta">
                <div>
                    <h3 className="wl-title">{title}</h3>
                    <p className="wl-sub">{sub}</p>
                </div>
                <button type="button" className="wl-go" onClick={onOpen}>
                    {tr('Open')} <ArrowRight size={14} />
                </button>
            </div>
        </section>
    );
};

const ROLES = {
    inventory: ['Developer', 'Admin', 'ClientBoss', 'ClientViewer', 'Vendor'],
    finance: ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting'],
    logistics: ['Developer', 'Admin', 'ClientBoss'],
} as const;

export function WelcomeView() {
    const user = useAtomValue(userAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const setSidebarState = useSetAtom(sidebarStateAtom);
    const setLogisticsSubTab = useSetAtom(logisticsSubTabAtom);
    const setVendorFilter = useSetAtom(inventoryVendorFilterAtom);
    const [showTutorial, setShowTutorial] = useState(false);

    const displayName = (user?.name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.name))
        ? user.name.split(' ')[0]
        : user?.email?.split('@')[0] || 'User';

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return tr('Good morning');
        if (hour < 18) return tr('Good afternoon');
        return tr('Good evening');
    };

    const navigateTo = (view: any) => {
        setActiveView(view);
        if (window.innerWidth <= 768) setSidebarState('hidden');
    };

    // Same rules as the sidebar. A role that is not known yet keeps the one entry the page always had.
    const role = user?.role as string | undefined;
    const can = (roles: readonly string[]) => !role ? false : roles.includes(role);
    const canInventory = !role || can(ROLES.inventory);

    const openInventory = (vendor: string | null) => {
        setVendorFilter(vendor ? [vendor] : ['All']);
        navigateTo('inventory');
    };

    return (
        <div className="wl-root flex flex-col h-full w-full overflow-hidden custom-scrollbar bg-black/20 relative">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-(--main-color) opacity-10 blur-[120px]" />
                <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-(--main-color) opacity-10 blur-[100px]" />
            </div>

            <div className="flex-1 overflow-y-auto py-8 flex flex-col items-center w-full px-5 md:px-10 z-10 relative">
                <div className="wl-grid">
                    <div className="wl-face">
                        <div className="wl-halo">
                            <Mascot directions={`${import.meta.env.BASE_URL}chan-directions.webp`} reactions={`${import.meta.env.BASE_URL}chan-reactions.webp`} size={176} />
                        </div>
                        <h1 className="wl-hello">{getGreeting()}, <b>{displayName}</b></h1>
                        <p className="wl-lede">{tr("Welcome to Onyx. Access your inventory, manage operations, and explore your workspace.")}</p>
                    </div>

                    {canInventory && (
                        <Tile
                            area="inv"
                            title={tr('Inventory')}
                            sub={tr('One folder per vendor. Pick a folder to see its pieces.')}
                            onOpen={() => openInventory(null)}
                            ownClicks
                            figure={onRead => <FileCabinet onOpen={openInventory} onRead={onRead} />}
                        />
                    )}
                    {can(ROLES.finance) && (
                        <Tile
                            area="fin"
                            title={tr('Finances')}
                            sub={tr('Payments, expenses and accounts.')}
                            onOpen={() => navigateTo('finance')}
                            figure={() => <Vault intensity={0.65} label={tr('Finances vault')} />}
                        />
                    )}
                    {can(ROLES.logistics) && (
                        <Tile
                            area="log"
                            title={tr('Logistics')}
                            sub={tr('Warehouse, crates and pallets.')}
                            onOpen={() => { setLogisticsSubTab('empty'); navigateTo('warehouse'); }}
                            figure={() => <Slow intensity={0.65} label={tr('Logistics conveyor')} />}
                        />
                    )}
                    {can(ROLES.logistics) && (
                        <Tile
                            area="shp"
                            title={tr('Shipping')}
                            sub={tr('Trucking, manifests and loads.')}
                            onOpen={() => { setLogisticsSubTab('shipping'); navigateTo('trucking'); }}
                            ownClicks
                            figure={onRead => <Truck onOpen={() => { setLogisticsSubTab('shipping'); navigateTo('trucking'); }} onRead={onRead} />}
                        />
                    )}
                </div>
            </div>
            {showTutorial && <InventoryTutorial onClose={() => setShowTutorial(false)} />}
        </div>
    );
}
