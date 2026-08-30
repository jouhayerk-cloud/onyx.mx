import React from 'react';
import { Button } from '@/components/ui/button';

export const PicoConfigurationModal = () => {
  return (
    <div className="flex flex-col gap-6 p-4 w-full max-w-sm mx-auto bg-[#F0F5FA] rounded-2xl">
      {/* Wi-Fi Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">Wi-Fi</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          Change Wi-Fi
        </Button>
      </div>

      {/* Device Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">Device</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          Brightness
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          Volume
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          Timezone
        </Button>
      </div>

      {/* Hardware Test Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">Hardware Test</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          Servo
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          RGB Strip
        </Button>
      </div>

      {/* Account Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">Account</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          Unbind & Reset
        </Button>
      </div>

      {/* Firmware Section */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-slate-500 font-medium">Firmware</span>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm mb-1">
          Version: V1.2.3
        </Button>
        <Button variant="secondary" className="w-full bg-[#C2D3FA] hover:bg-[#A5BCF5] text-slate-800 rounded-xl h-12 text-lg shadow-sm">
          Check for Updates
        </Button>
      </div>
    </div>
  );
};
