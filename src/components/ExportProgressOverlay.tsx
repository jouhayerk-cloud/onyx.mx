import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface ExportProgressOverlayProps {
  progress: number;
  isOpen: boolean;
  title?: string;
  message?: string;
}

export const ExportProgressOverlay: React.FC<ExportProgressOverlayProps> = ({ 
  progress, 
  isOpen, 
  title = "Generating PDF",
  message = "Please wait while we prepare your high-fidelity manifest."
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-2xl animate-in fade-in duration-300">
      <div className="w-[420px] p-10 rounded-[48px] bg-white/[0.03] border border-white/10 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
        {/* Top accent line */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-(--main-color) to-transparent shadow-[0_0_15px_rgba(var(--main-color),0.3)]" />
        
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{title}</h2>
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">{message}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black text-(--main-color) uppercase tracking-widest">Processing Manifest</span>
            <span className="text-2xl font-black text-white font-mono">{Math.round(progress)}%</span>
          </div>
          
          <div className="h-3 w-full bg-white/5 rounded-full p-1 border border-white/5 relative overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-(--main-color) to-[#AEE6F5] transition-all duration-300 shadow-[0_0_15px_rgba(var(--main-color),0.4)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 px-6 py-4 rounded-3xl bg-white/5 border border-white/5">
          <div className="p-2 rounded-xl bg-(--main-color)/10 text-(--main-color)">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">
              High-Res Asset Assembly
            </span>
            <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider mt-0.5">
              Optimizing layout & image vectors...
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
