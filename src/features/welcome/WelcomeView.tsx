import React, { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, activeViewAtom, sidebarStateAtom } from '../../lib/atoms';
import { Album, ArrowRight, Lightbulb } from 'lucide-react';
import { Cabinet, Query } from '@lucasmarkes/hairline/react';
import { Mascot } from 'page-mascot';
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

            <div className="absolute top-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
                <div className="pointer-events-auto translate-y-[-20px]">
                    <Mascot directions={`${import.meta.env.BASE_URL}cube-directions.webp`} reactions={`${import.meta.env.BASE_URL}cube-reactions.webp`} size={160} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-12 flex flex-col items-center justify-center gap-12 w-full px-6 md:px-12 z-10 relative mt-16">
                <div className="text-center animate-in slide-in-from-bottom-8 fade-in fill-mode-both duration-700">
                    <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4">
                        {getGreeting()}, <span className="text-(--main-color)">{displayName}</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/60 font-medium tracking-tight max-w-2xl mx-auto">
                        {tr("Welcome to Onyx. Access your inventory, manage operations, and explore your workspace.")}
                    </p>
                </div>

                <div className="flex justify-center max-w-md w-full mt-8 animate-in slide-in-from-bottom-12 fade-in fill-mode-both duration-700 delay-200">
                    <button
                        onClick={() => navigateTo('inventory')}
                        className="group w-full relative overflow-hidden rounded-[32px] bg-white/5 border border-white/10 p-1 transition-all hover:scale-[1.02] active:scale-[0.98] hover:bg-white/10"
                    >
                        <div className="flex flex-col items-center p-10">
                            <div className="w-32 h-32 rounded-[2rem] bg-(--main-color)/10 flex items-center justify-center mb-8 text-(--main-color) group-hover:scale-110 transition-transform">
                                <Cabinet intensity={0.65} style={{width: '90%', height: '90%', stroke: 'currentColor'}} />
                            </div>
                            <h3 className="text-3xl font-bold text-white mb-3 text-center">{tr("Inventory")}</h3>
                            <p className="text-center text-base text-white/50 mb-10">{tr("Manage and track your products, edit items, and view collections.")}</p>
                            
                            <div className="mt-auto flex items-center gap-2 text-(--main-color) font-bold text-sm uppercase tracking-wider group-hover:gap-4 transition-all">
                                {tr("Open Module")} <ArrowRight size={16} />
                            </div>
                        </div>
                    </button>
                </div>
            </div>
            {showTutorial && <InventoryTutorial onClose={() => setShowTutorial(false)} />}
        </div>
    );
}
