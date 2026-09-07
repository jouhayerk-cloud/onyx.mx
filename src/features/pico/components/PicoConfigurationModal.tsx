import React from 'react';
import { tr } from '../../../lib/i18n';

export const PicoConfigurationModal = () => {
  return (
    <div className="flex flex-col gap-6 p-4 w-full max-w-sm mx-auto bg-[#F0F5FA] rounded-2xl">
      {/* Wi-Fi Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Wi-Fi")}</span>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Change Wi-Fi")}
        </button>
      </div>

      {/* Device Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Device")}</span>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Brightness")}
        </button>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Volume")}
        </button>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Timezone")}
        </button>
      </div>

      {/* Hardware Test Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Hardware Test")}</span>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Servo")}
        </button>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("RGB Strip")}
        </button>
      </div>

      {/* Account Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Account")}</span>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Unbind & Reset")}
        </button>
      </div>

      {/* Firmware Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Firmware")}</span>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Version: V1.2.3")}
        </button>
        <button type="button" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Check for Updates")}
        </button>
      </div>
    </div>
  );
};
