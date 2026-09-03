import React, { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, activeViewAtom, sidebarStateAtom } from '../../lib/atoms';
import { Album, ArrowRight, Lightbulb } from 'lucide-react';
import { InventoryTutorial } from '../inventory/InventoryTutorial';
import { tr } from '../../lib/i18n';

export function WelcomeView() {
    const user = useAtomValue(userAtom);
    const setActiveView = useSetAtom(activeViewAtom);
    const setSidebarState = useSetAtom(sidebarStateAtom);
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

    return (
        <div className="flex flex-col h-full w-full overflow-hidden custom-scrollbar bg-black/20 relative">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-(--main-color) opacity-10 blur-[120px]" />
                <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-(--main-color) opacity-10 blur-[100px]" />
            </div>

            <div className="flex-1 overflow-y-auto py-12 flex flex-col items-center justify-center gap-12 w-full px-6 md:px-12 z-10 relative">
                <div className="text-center animate-in slide-in-from-bottom-8 fade-in fill-mode-both duration-700">
                    <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4">
                        {getGreeting()}, <span className="text-(--main-color)">{displayName}</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/60 font-medium tracking-tight max-w-2xl mx-auto">
                        {tr("Welcome to Onyx. Access your inventory, manage operations, and explore your workspace.")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 justify-center max-w-2xl gap-6 w-full mt-8 animate-in slide-in-from-bottom-12 fade-in fill-mode-both duration-700 delay-200">
                    
                    <button
                        onClick={() => navigateTo('inventory')}
                        className="group relative overflow-hidden rounded-[32px] bg-white/5 border border-white/10 p-1 transition-all hover:scale-[1.02] active:scale-[0.98] hover:bg-white/10"
                    >
                        <div className="flex flex-col items-start p-8">
                            <div className="w-14 h-14 rounded-2xl bg-(--main-color)/20 flex items-center justify-center mb-6 text-(--main-color) group-hover:scale-110 transition-transform">
                                <Album size={28} strokeWidth={2} />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">{tr("Inventory")}</h3>
                            <p className="text-left text-sm text-white/50 mb-8">{tr("Manage and track your products, edit items, and view collections.")}</p>
                            
                            <div className="mt-auto flex items-center gap-2 text-(--main-color) font-bold text-sm uppercase tracking-wider group-hover:gap-4 transition-all">
                                {tr("Open Module")} <ArrowRight size={16} />
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={() => setShowTutorial(true)}
                        className="group relative overflow-hidden rounded-[32px] bg-white/5 border border-white/10 p-1 transition-all hover:scale-[1.02] active:scale-[0.98] hover:bg-white/10"
                    >
                        <div className="flex flex-col items-start p-8 h-full">
                            <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 flex items-center justify-center mb-6 text-yellow-500 group-hover:scale-110 transition-transform">
                                <Lightbulb size={28} strokeWidth={2} />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">{tr("Tutorial")}</h3>
                            <p className="text-left text-sm text-white/50 mb-8">{tr("Learn the basics of using the Inventory module and its features.")}</p>
                            
                            <div className="mt-auto flex items-center gap-2 text-yellow-500 font-bold text-sm uppercase tracking-wider group-hover:gap-4 transition-all">
                                {tr("Start Tutorial")} <ArrowRight size={16} />
                            </div>
                        </div>
                    </button>

                </div>
            </div>
            {showTutorial && <InventoryTutorial onClose={() => setShowTutorial(false)} />}
        </div>
    );
}
