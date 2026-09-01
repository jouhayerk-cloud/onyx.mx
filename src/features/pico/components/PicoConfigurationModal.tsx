import React from 'react';
import { Button } from '@/components/ui/button';
import { tr } from '../../../lib/i18n';

export const PicoConfigurationModal = () => {
  return (
    <div className="flex flex-col gap-6 p-4 w-full max-w-sm mx-auto bg-[#F0F5FA] rounded-2xl">
      {/* Wi-Fi Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Wi-Fi")}</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Change Wi-Fi")}
        </Button>
      </div>

      {/* Device Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Device")}</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Brightness")}
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Volume")}
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Timezone")}
        </Button>
      </div>

      {/* Hardware Test Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Hardware Test")}</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Servo")}
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("RGB Strip")}
        </Button>
      </div>

      {/* Account Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Account")}</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Unbind & Reset")}
        </Button>
      </div>

      {/* Firmware Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">{tr("Firmware")}</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          {tr("Version: V1.2.3")}
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          {tr("Check for Updates")}
        </Button>
      </div>
    </div>
  );
};
