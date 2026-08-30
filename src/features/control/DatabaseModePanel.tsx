import React, { useState } from 'react';
import { getDatabase } from '../../lib/database';

export function DatabaseModePanel() {
    const [dbMode, setDbMode] = useState(localStorage.getItem('onyx_db_mode') || '826');

    const handleSwitch = (mode: string) => {
        if (mode === dbMode) return;
        if (confirm(`Are you sure you want to switch to the ${mode === '826' ? 'Workbook 826' : 'Legacy (v326/v825)'} database? The app will wipe the local cache and reload.`)) {
            localStorage.setItem('onyx_db_mode', mode);
            // Trigger a clean wipe and reload by wiping onyx_last_reload to guarantee the wipe branch runs
            localStorage.setItem('onyx_last_reload', '0'); 
            // In database.ts, we need to destroy the db
            getDatabase().then(db => {
                db.destroy().then(() => {
                    window.location.reload();
                });
            }).catch(() => {
                window.location.reload();
            });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-color-secondary) font-bold uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4"><use href="#database" /></svg>
                    DATABASE CONNECTION
                </span>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
                <p className="text-xs text-white/50 leading-relaxed">
                    Select which Supabase season schema the app should sync with. Changing this setting requires a full local cache wipe and app reload.
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => handleSwitch('826')}
                        className={`flex flex-col items-start gap-1 p-4 rounded-xl border transition-all text-left ${dbMode === '826' ? 'border-(--main-color) bg-(--main-color)/10' : 'border-white/10 bg-white/5 hover:border-white/30'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <span className={`text-sm font-bold ${dbMode === '826' ? 'text-(--main-color)' : 'text-white'}`}>Workbook 826</span>
                            {dbMode === '826' && <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full bg-(--main-color)/20 text-(--main-color)">ACTIVE</span>}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono mt-1">Schema: *_826</span>
                        <span className="text-xs text-white/60 mt-2 line-clamp-2">New optimized schemas enforcing strict vendor relationships and AI fields.</span>
                    </button>

                    <button
                        onClick={() => handleSwitch('legacy')}
                        className={`flex flex-col items-start gap-1 p-4 rounded-xl border transition-all text-left ${dbMode === 'legacy' ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-white/5 hover:border-white/30'}`}
                    >
                        <div className="flex items-center justify-between w-full">
                            <span className={`text-sm font-bold ${dbMode === 'legacy' ? 'text-orange-400' : 'text-white'}`}>Legacy (v326/v825)</span>
                            {dbMode === 'legacy' && <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">ACTIVE</span>}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono mt-1">Schema: inventory, finance</span>
                        <span className="text-xs text-white/60 mt-2 line-clamp-2">Original un-versioned tables. Read-only historical viewing recommended.</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
