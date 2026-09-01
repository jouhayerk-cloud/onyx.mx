

import { useAtom, useAtomValue } from 'jotai/react';
import React from 'react';
import toast from 'react-hot-toast';
import { catalogMarketViewModeAtom, marketActiveTabAtom, SelectedItemDataAtom, isInventoryPanelOpenAtom } from '../../lib/atoms';
import { DetailsPanel } from './DetailsPanel';
import { SceneComposerView } from '../market/SceneComposerView';
import { useItemImage } from '../../lib/hooks';
import { MarketInventoryView } from './MarketInventoryView';
import { InventoryImages } from './InventoryImages';
import { tr } from '../../lib/i18n';

const DescriptionView = () => {
    const itemData = useAtomValue(SelectedItemDataAtom);
    const { imageUrl } = useItemImage(itemData);

    if (!itemData) return <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">{tr("Select an item to see details.")}</div>;

    return (
        <div className="p-4 md:p-8 overflow-y-auto h-full space-y-6">
            {imageUrl && <img src={imageUrl} alt={itemData.shape} className="w-full h-auto max-h-96 object-contain rounded-lg bg-black/20" />}
            <div className="prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: itemData.detailedDescription || itemData.description || 'No description available.' }}></div>
        </div>
    );
};

const MarketBottomBar = () => {
    const [activeTab, setActiveTab] = useAtom(marketActiveTabAtom);
    const itemData = useAtomValue(SelectedItemDataAtom);

    const TABS = [
        { id: 'description', label: 'Description' },
        { id: 'images', label: 'Images' },
    ];

    const handleTabClick = (tabId: string) => {
        if (!itemData) {
            toast.error(tr("Please select an item first."));
            return;
        }
        setActiveTab(tabId as any);
    };

    return (
        <div className="shrink-0 glass-panel">
            <div className="p-2 flex items-center justify-center gap-2">
                {TABS.map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => handleTabClick(tab.id)} 
                        className={`px-4 py-1.5 text-xs rounded-full font-semibold transition-colors ${
                            activeTab === tab.id ? 
                            'bg-[var(--accent-color)] text-white' : 
                            'bg-black/20 text-[var(--text-color-secondary)] hover:bg-white/10'
                        }`}
                        disabled={!itemData}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export function CatalogMarketView() {
    const [mode] = useAtom(catalogMarketViewModeAtom);
    const [activeTab] = useAtom(marketActiveTabAtom);
    const [isInventoryPanelOpen] = useAtom(isInventoryPanelOpenAtom);

    if (mode === 'market') {
        const renderMainContent = () => {
            switch (activeTab) {
                case 'description':
                    return <DescriptionView />;
                case 'images':
                    return <SceneComposerView />;
                default:
                    return <SceneComposerView />;
            }
        };

        return (
            <div className="flex flex-col md:flex-row grow overflow-hidden relative m-4 mt-0 gap-4 h-full">
                {/* Inventory Panel - shows on desktop, or on mobile if isInventoryPanelOpen */}
                <div className={` ${isInventoryPanelOpen ? 'flex' : 'hidden'} flex-col w-full h-full md:flex md:w-[280px] md:shrink-0`}>
                    <MarketInventoryView />
                </div>

                {/* Main Content Area */}
                <div className={` ${!isInventoryPanelOpen ? 'flex' : 'hidden'} md:flex flex-grow h-full flex-col gap-4`}>
                    <div className="flex-grow h-full glass-panel overflow-hidden">
                        {renderMainContent()}
                    </div>
                    <MarketBottomBar />
                </div>
                
                <DetailsPanel />
            </div>
        );
    } 

    return (
         <div className="flex flex-col md:flex-row grow overflow-hidden relative m-4 mt-0 gap-4 h-full">
            {/* Main Content: Inventory Grid */}
            <div className="flex-grow h-full glass-panel overflow-hidden p-4">
              <InventoryImages mode="catalog" />
            </div>

            {/* Details Panel */}
            <DetailsPanel />
        </div>
    );
}