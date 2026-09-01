import React, { useState, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { picoDevicesAtom, activePicoSessionAtom, picoRssiThresholdAtom, PicoDevice, PicoScanEvent } from '../../lib/picoAtoms';
import { PicoRoleHardwareCard } from './components/PicoRoleHardwareCard';
import { PicoDeviceRegistry } from './components/PicoDeviceRegistry';
import { StackChanSimulator, StackChanExpression, SimulatorTheme } from './components/StackChanSimulator';
import { PicoWorkflowManager } from './components/PicoWorkflowManager';
import { PicoLiveLog } from './components/PicoLiveLog';
import { PicoRealtimeController } from './components/PicoRealtimeController';
import { PicoDualChannelMonitor } from './components/PicoDualChannelMonitor';
import { PicoBleModal } from './components/PicoBleModal';
import { PicoVendorCardModal } from './components/PicoVendorCardModal';
import { PicoInventoryCardModal } from './components/PicoInventoryCardModal';
import { PicoSimulatorModal } from './components/PicoSimulatorModal';
import {
  Terminal, Plus, Zap, Sliders, Radio, Shield, RefreshCw, Unplug, AlertCircle, Bot, Maximize2,
  Minimize2, Bluetooth, Compass, Volume2, Sparkles, MessageSquare, Send, RotateCw, Eye, EyeOff,
  Palette, Play, CheckCircle2
} from 'lucide-react';
import { useDeviceControl, OnyxChanFace, VENDOR_COLORS } from './useDeviceControl';
import { useBleDevice } from './useBleDevice';
import { tr } from '../../lib/i18n';

const ALL_EXPRESSIONS: StackChanExpression[] = [
  'Neutral', 'Happy', 'Angry', 'Sad', 'Sleepy', 'Doubt',
  'Thinking', 'Shy', 'Smug', 'Alert', 'Speaking', 'Listening', 'Error'
];

const PRESET_PHRASES = [
  { label: '👋 Greeting', text: '¡Hola! Bienvenido al sistema Onyx.mx', lang: 'es' as const },
  { label: '✅ Verified', text: 'Pieza de inventario verificada con éxito', lang: 'es' as const },
  { label: '📦 Crate Packed', text: 'Caja manifestada y asegurada en el almacén', lang: 'es' as const },
  { label: '⚡ System Ready', text: 'OnyxChan robotics edge terminal online', lang: 'en' as const },
];

export function PicoBridgeView() {
  const [devices, setDevices] = useAtom(picoDevicesAtom);
  const [activeSession, setActiveSession] = useAtom(activePicoSessionAtom);
  const [rssiThreshold, setRssiThreshold] = useAtom(picoRssiThresholdAtom);

  // Modals state
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isBleModalOpen, setIsBleModalOpen] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [activeVendorCardScan, setActiveVendorCardScan] = useState<(PicoScanEvent & { actionTaken?: string }) | null>(null);
  const [activeInventoryCardScan, setActiveInventoryCardScan] = useState<(PicoScanEvent & { actionTaken?: string }) | null>(null);

  // Simulator controls
  const [showSettings, setShowSettings] = useState(false);
  const [simExpanded, setSimExpanded] = useState(false);
  const [simExpression, setSimExpression] = useState<StackChanExpression>('Neutral');
  const [simTts, setSimTts] = useState('');
  const [ttsInput, setTtsInput] = useState('');
  const [ttsLanguage, setTtsLanguage] = useState<'es' | 'en' | 'ja'>('es');
  const [simTheme, setSimTheme] = useState<SimulatorTheme>('classic');
  const [mirrorMode, setMirrorMode] = useState(false);

  // Live Servo Angles
  const [panAngle, setPanAngle] = useState(0);   // -90 to 90
  const [tiltAngle, setTiltAngle] = useState(0);  // 0 to 90 (or -45 to 45)

  // Live Scan Logs
  const [scanLogs, setScanLogs] = useState<(PicoScanEvent & { actionTaken?: string })[]>([]);

  const activeDevicesList = devices;
  const primaryStackChan = activeDevicesList.find(d => d.hardware_model.includes('StackChan')) || activeDevicesList[0];

  // Web Bluetooth Device Hook
  const { state: bleState, sendBleCommand, pair: pairBle } = useBleDevice((event) => {
    handleLogScan({ ...event, actionTaken: `BLE_UART_INTERCEPT (${event.tagId})` });
  });

  // Device Controller (Triple Channel: WS + Supabase RT + BLE)
  const { setFace, say, move, showVendorCard, directSocket, isDirectConnected, reconnectDirect, sendRaw } = useDeviceControl(
    primaryStackChan?.device_mac || primaryStackChan?.id || 'unknown',
    primaryStackChan?.local_ip || '192.168.1.137',
    sendBleCommand
  );

  const mapExpressionToFace = (expr: StackChanExpression): OnyxChanFace => {
    switch (expr) {
      case 'Happy': return 'happy';
      case 'Angry': return 'alert';
      case 'Sad': return 'pouty';
      case 'Sleepy': return 'sleepy';
      case 'Doubt': return 'thinking';
      case 'Thinking': return 'thinking';
      case 'Shy': return 'shy';
      case 'Smug': return 'smug';
      case 'Alert': return 'alert';
      case 'Speaking': return 'speaking';
      case 'Listening': return 'listening';
      case 'Error': return 'error';
      default: return 'calm';
    }
  };

  const handleSimExpressionChange = (expr: StackChanExpression) => {
    setSimExpression(expr);
    setFace(mapExpressionToFace(expr));
  };

  const handlePanTiltChange = (newPan: number, newTilt: number) => {
    setPanAngle(newPan);
    setTiltAngle(newTilt);
    move(newPan, newTilt);
  };

  const handleRegisterDevice = (newDev: Omit<PicoDevice, 'id' | 'last_seen_at' | 'is_active'>) => {
    const created: PicoDevice = {
      ...newDev,
      id: 'pico-' + Math.random().toString(36).substr(2, 9),
      is_active: true,
      last_seen_at: new Date().toISOString(),
    };
    setDevices([...activeDevicesList, created]);
    setIsRegistryOpen(false);
  };

  const handleDisconnect = (deviceId: string) => {
    if (activeSession && activeSession.device_id === deviceId) {
      setActiveSession(null);
    }
    setDevices(activeDevicesList.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
  };

  // Intercept and Log Scans
  const handleLogScan = (log: PicoScanEvent & { actionTaken?: string }) => {
    setScanLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 scans

    // Check if it's an NFC or vendor card scan to trigger the holographic vendor card modal
    const tag = (log.tagId || '').toUpperCase();

    if (tag.startsWith('INV-')) {
      setActiveInventoryCardScan(log);
      return;
    }

    if (
      log.scanType === 'NFC' ||
      tag.includes('SEC') ||
      tag.includes('MARTHA') ||
      tag.includes('RAMSES') ||
      tag.includes('ALEJANDRA') ||
      tag.includes('CAROLINA') ||
      tag.startsWith('SU')
    ) {
      setActiveVendorCardScan(log);
    }
  };

  const handleSendFeedback = (payload: { beep?: string; ledColor?: string; displayMsg?: string }) => {
    console.log('[PicoBridge Broadcast] Transmitting feedback to M5Stack terminals:', payload);
    const simulatedResponseLog: PicoScanEvent & { actionTaken?: string } = {
      deviceId: activeDevicesList[0]?.id || 'global-broadcast',
      scanType: 'NFC',
      tagId: `CMD: ${payload.displayMsg || payload.beep}`,
      timestamp: Date.now(),
      actionTaken: `TRANSMITTED_FEEDBACK (${payload.ledColor || 'BEEP'})`,
    };
    handleLogScan(simulatedResponseLog);
  };

  const handleSpeakSubmit = (textToSend?: string) => {
    const text = textToSend || ttsInput;
    if (!text.trim()) return;

    setSimTts(text.trim());
    say(text.trim(), ttsLanguage);
    handleSimExpressionChange('Happy');
    setTtsInput('');

    setTimeout(() => {
      handleSimExpressionChange('Neutral');
    }, Math.max(3000, text.length * 75));
  };

  // Servo Motion Presets
  const handlePresetMotion = (preset: 'center' | 'nod' | 'shake' | 'curious' | 'sweep') => {
    switch (preset) {
      case 'center':
        handlePanTiltChange(0, 0);
        break;
      case 'nod':
        handlePanTiltChange(0, 30);
        setTimeout(() => handlePanTiltChange(0, -20), 400);
        setTimeout(() => handlePanTiltChange(0, 15), 800);
        setTimeout(() => handlePanTiltChange(0, 0), 1200);
        break;
      case 'shake':
        handlePanTiltChange(45, 0);
        setTimeout(() => handlePanTiltChange(-45, 0), 400);
        setTimeout(() => handlePanTiltChange(25, 0), 800);
        setTimeout(() => handlePanTiltChange(0, 0), 1200);
        break;
      case 'curious':
        handlePanTiltChange(30, 20);
        handleSimExpressionChange('Thinking');
        setTimeout(() => handlePanTiltChange(0, 0), 2000);
        break;
      case 'sweep':
        handlePanTiltChange(-75, 10);
        setTimeout(() => handlePanTiltChange(75, 10), 800);
        setTimeout(() => handlePanTiltChange(0, 0), 1600);
        break;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-transparent text-white p-4 sm:p-6 space-y-4 animate-fade-in">
      {/* Background Realtime Interceptor */}
      <PicoRealtimeController onLogScan={handleLogScan} />

      {/* Floating HUD Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center">
            <Terminal size={24} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-black tracking-widest text-white uppercase">{tr("Device Management")}</h1>
              <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">
                {tr("PicoBridge v2.5")}
              </span>
            </div>
            <p className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
              {tr("onyx.mx/app/ pico bridge • Dual-Channel Active")}
            </p>
          </div>
        </div>

        {/* Top Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Record Voice Button */}
          <button
            onClick={() => sendRaw({ type: 'touch', event: 'recording_start' })}
            disabled={!isDirectConnected}
            className={`text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 ${isDirectConnected ? 'text-white hover:text-purple-400' : 'text-neutral-600 cursor-not-allowed'}`}
          >
            <Volume2 size={15} />
            {tr("Record")}
          </button>

          {/* Stop Recording Button */}
          <button
            onClick={() => sendRaw({ type: 'touch', event: 'recording_stop' })}
            disabled={!isDirectConnected}
            className={`text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 ${isDirectConnected ? 'text-rose-400 hover:text-rose-300' : 'text-neutral-600 cursor-not-allowed'}`}
          >
            <Unplug size={15} />
            {tr("Stop")}
          </button>

          <div className="mx-1 text-white/20 font-light select-none">|</div>

          {/* Web Bluetooth Button */}
          <button
            onClick={() => setIsBleModalOpen(true)}
            className="text-neutral-400 hover:text-white text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2"
          >
            <Bluetooth size={15} className={bleState.status === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-neutral-400'} />
            <span>{bleState.status === 'connected' ? tr("BLE Paired") : tr("Pair BLE")}</span>
          </button>

          {/* Test Harness Modal Button */}
          <button
            onClick={() => setIsSimModalOpen(true)}
            className="text-neutral-400 hover:text-white text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2"
          >
            <Zap size={15} className="text-neutral-400" />
            <span>{tr("Test Harness")}</span>
          </button>

          {/* Signal Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title={tr("Antenna & Signal Settings")}
            className={`transition-all ${
              showSettings 
                ? 'text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders size={18} />
          </button>

          {/* Link Device Button */}
          <button
            onClick={() => setIsRegistryOpen(true)}
            className="text-white hover:text-neutral-300 text-xs font-black tracking-widest uppercase transition-all flex items-center gap-2"
          >
            <Plus size={16} className="text-neutral-700" />
            {tr("Link Device")}
          </button>
        </div>
      </div>

      {/* Dual-Channel Status Monitor Banner */}
      <PicoDualChannelMonitor
        directSocket={directSocket}
        isDirectConnected={isDirectConnected}
        localIp={primaryStackChan?.local_ip || '192.168.1.137'}
        onReconnectDirect={reconnectDirect}
        supabaseChannelStatus="connected"
        eventCount={scanLogs.length}
      />

      {/* RSSI Cutoff & Antenna Settings Floating Panel */}
      {showSettings && (
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Radio size={22} className="text-cyan-400 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">{tr("UHF RFID Signal Cutoff (RSSI Threshold)")}</h4>
              <p className="text-[11px] font-mono text-neutral-400">
                {tr("Ignore UHF RFID tag reads below this signal strength to prevent reading distant warehouse crates.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 min-w-[240px]">
            <input
              type="range"
              min="-90"
              max="-40"
              value={rssiThreshold}
              onChange={e => setRssiThreshold(Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-cyan-400 min-w-[50px]">{rssiThreshold} {tr("dBm")}</span>
          </div>
        </div>
      )}

      {/* ── STACKCHAN SIMULATOR & RICH INTERACTIVE CONTROLS ── */}
      <div className={`relative transition-all duration-500 ${simExpanded ? 'min-h-[640px]' : 'min-h-[460px]'}`}>
        
        {/* Simulator Top Nav Bar */}
        <div className="flex items-center justify-between py-2 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center text-neutral-400">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">{tr("Simulator & Gimbal")}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500">
                  {tr("Interactive Core")}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">
                {primaryStackChan ? `${primaryStackChan.device_name} (${primaryStackChan.device_mac})` : tr("Standalone Web Simulator")}
              </span>
            </div>
          </div>

          {/* Top Quick Settings */}
          <div className="flex items-center gap-2">
            {/* Mirror Mode Toggle */}
            <button
              onClick={() => setMirrorMode(!mirrorMode)}
              className={`text-[10px] font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                mirrorMode 
                  ? 'text-purple-400' 
                  : 'text-neutral-400 hover:text-white'
              }`}
              title={tr("Mirror Mode (Invert Avatar Gaze / Camera)")}
            >
              {mirrorMode ? <Eye size={13} className="text-purple-300" /> : <EyeOff size={13} />}
              <span>{tr("Mirror:")} {mirrorMode ? tr("ON") : tr("OFF")}</span>
            </button>

            {/* Theme Selector */}
            <div className="flex items-center gap-1">
              <Palette size={13} className="text-neutral-400 ml-1.5" />
              {(['classic', 'cyber', 'ramses', 'martha', 'alejandra', 'carolina'] as SimulatorTheme[]).map(th => (
                <button
                  key={th}
                  onClick={() => setSimTheme(th)}
                  className={`w-4 h-4 transition-all ${
                    simTheme === th ? 'scale-125' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: th === 'cyber' ? '#10B981' : th === 'ramses' ? '#EAB308' : th === 'martha' ? '#A855F7' : th === 'alejandra' ? '#14B8A6' : th === 'carolina' ? '#F43F5E' : '#FFFFFF'
                  }}
                  title={`Theme: ${th}`}
                />
              ))}
            </div>

            {/* Expand / Minimize */}
            <button
              onClick={() => setSimExpanded(!simExpanded)}
              className="text-neutral-400 hover:text-white transition-colors"
              title={simExpanded ? 'Minimize' : 'Expand'}
            >
              {simExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Simulator Core Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
          
          {/* Center Stage: StackChan Face Canvas */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center p-4 min-h-[300px] relative">
            <div className="w-full max-w-[400px] aspect-[4/3] relative">
              <StackChanSimulator
                expression={simExpression}
                ttsText={simTts}
                pitch={tiltAngle}
                yaw={panAngle}
                mirrorMode={mirrorMode}
                theme={simTheme}
                showGimbalOverlay={true}
              />
            </div>

            {/* Sub-HUD Gaze Info */}
            <div className="mt-3 flex items-center justify-between w-full max-w-[400px] text-[10px] font-mono text-neutral-400">
              <span>{tr("👁 Interactive cursor tracking active")}</span>
              <span className="text-purple-300">{mirrorMode ? tr("🪞 Mirror Mode") : tr("Direct View")}</span>
            </div>

            <div className="mt-2 w-full max-w-[400px]">
              <button
                onClick={() => sendRaw({ type: 'vision', state: true })}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors text-[11px] font-bold uppercase tracking-wider"
              >
                <Eye size={14} />
                {tr("Enable Camera Stream")}
              </button>
            </div>
          </div>

          {/* Right Controls Panel */}
          <div className="lg:col-span-6 py-4 flex flex-col gap-4">
            
            {/* 1. Expression Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={12} className="text-purple-400" />
                  Facial Expressions ({ALL_EXPRESSIONS.length})
                </label>
                <span className="text-[10px] font-mono text-purple-400 font-bold">{simExpression}</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {ALL_EXPRESSIONS.map(expr => {
                  const isSelected = simExpression === expr;
                  return (
                    <button
                      key={expr}
                      onClick={() => handleSimExpressionChange(expr)}
                      className={`py-1 text-[10px] font-mono font-bold tracking-wider transition-all text-center ${
                        isSelected
                          ? 'text-white'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {expr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Live Pan & Tilt Dual-Servo Gimbal Sliders */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Compass size={12} className="text-cyan-400" />
                  {tr("Pan & Tilt Dual Servo Gimbal")}
                </label>
                <button
                  onClick={() => handlePresetMotion('center')}
                  className="text-[9px] font-mono text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1"
                >
                  <RotateCw size={10} />
                  {tr("Reset (0°,0°)")}
                </button>
              </div>

              {/* Yaw (Pan) Slider */}
              <div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-400 mb-1">
                  <span>{tr("Pan / Yaw (Horizontal):")}</span>
                  <span className="text-cyan-400 font-bold">{panAngle}° {panAngle < 0 ? tr("(Left)") : panAngle > 0 ? tr("(Right)") : tr("(Center)")}</span>
                </div>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  value={panAngle}
                  onChange={e => handlePanTiltChange(Number(e.target.value), tiltAngle)}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Pitch (Tilt) Slider */}
              <div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-400 mb-1">
                  <span>{tr("Tilt / Pitch (Vertical):")}</span>
                  <span className="text-purple-400 font-bold">{tiltAngle}° {tiltAngle > 0 ? tr("(Up)") : tiltAngle < 0 ? tr("(Down)") : tr("(Level)")}</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="60"
                  value={tiltAngle}
                  onChange={e => handlePanTiltChange(panAngle, Number(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              {/* Preset Motion Buttons */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                <button
                  onClick={() => handlePresetMotion('nod')}
                  className="text-[10px] font-mono font-bold text-neutral-400 hover:text-white text-left transition-colors"
                >
                  {tr("Nod Head")}
                </button>
                <button
                  onClick={() => handlePresetMotion('shake')}
                  className="text-[10px] font-mono font-bold text-neutral-400 hover:text-white text-left transition-colors"
                >
                  {tr("Shake Head")}
                </button>
                <button
                  onClick={() => handlePresetMotion('curious')}
                  className="text-[10px] font-mono font-bold text-neutral-400 hover:text-white text-left transition-colors"
                >
                  {tr("Curious")}
                </button>
                <button
                  onClick={() => handlePresetMotion('sweep')}
                  className="text-[10px] font-mono font-bold text-neutral-400 hover:text-white text-left transition-colors"
                >
                  {tr("Sweep 360")}
                </button>
              </div>
            </div>

            {/* 3. Text to Speech (TTS) Prompt Suite */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Volume2 size={12} className="text-amber-400" />
                  {tr("Text to Speech Synthesizer")}
                </label>
                {/* Language Selector */}
                <div className="flex items-center gap-2 text-[9px] font-mono">
                  {(['es', 'en', 'ja'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setTtsLanguage(lang)}
                      className={`uppercase font-bold transition-colors ${
                        ttsLanguage === lang ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Phrase Chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setTtsInput(phrase.text);
                      setTtsLanguage(phrase.lang);
                      handleSpeakSubmit(phrase.text);
                    }}
                    className="text-[10px] font-mono text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1"
                  >
                    <span>{phrase.label}</span>
                  </button>
                ))}
              </div>

              {/* Text Input & Send */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={ttsInput}
                    onChange={e => setTtsInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSpeakSubmit();
                    }}
                    placeholder={tr("Type words for the robot to speak aloud...")}
                    className="w-full bg-transparent pl-8 py-1 text-xs text-white placeholder:text-neutral-600 focus:outline-none font-mono"
                  />
                </div>
                <button
                  onClick={() => handleSpeakSubmit()}
                  className="text-purple-400 hover:text-purple-300 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
                >
                  <Send size={13} />
                  <span>{tr("Speak")}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Grid Section: Linked Terminals & Roles */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
            <Shield size={16} className="text-purple-400" />
            Linked Hardware Terminals ({activeDevicesList.length})
          </h2>
          <span className="text-[11px] font-mono text-neutral-500">
            {tr("Role-mapped permissions active")}
          </span>
        </div>

        {activeDevicesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 flex items-center justify-center mb-4">
              <Bot size={32} className="text-purple-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{tr("No Devices Linked Yet")}</h3>
            <p className="text-sm text-neutral-400 max-w-md mb-6">
              {tr("Link your")} <strong>{tr("StackChan AI Desktop Robot")}</strong>{tr(", M5StickS3, or ATOM scanner to receive real-time inventory telemetry and command hardware remotely.")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setIsBleModalOpen(true)}
                className="text-purple-400 hover:text-purple-300 text-sm font-bold tracking-wider uppercase transition-all flex items-center gap-2"
              >
                <Bluetooth size={18} />
                {tr("Pair via Web Bluetooth")}
              </button>
              <button
                onClick={() => setIsRegistryOpen(true)}
                className="text-neutral-400 hover:text-white text-sm font-bold tracking-wider uppercase transition-all flex items-center gap-2"
              >
                <Bot size={18} />
                {tr("Manual Link")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeDevicesList.map(device => (
              <PicoRoleHardwareCard
                key={device.id}
                device={device}
                session={
                  device.id === activeDevicesList[0]?.id 
                    ? {
                        session_id: 'sess-active',
                        device_id: device.id,
                        user_id: device.owner_user_id,
                        active_workflow: 'idle',
                        workflow_metadata: {},
                        status: device.is_active ? 'connected' : 'disconnected',
                        battery: 88,
                        rssi: -48,
                        activeAccessory: device.accessories[0],
                        connected_at: new Date().toISOString(),
                      }
                    : null
                }
                onDisconnect={handleDisconnect}
                currentExpression={simExpression}
                onExpressionChange={(expr) => setSimExpression(expr as StackChanExpression)}
                onTtsSend={(text) => {
                  setSimTts(text);
                  say(text, ttsLanguage);
                  setSimExpression('Happy');
                  setTimeout(() => setSimExpression('Neutral'), 3000);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Grid Section: Workflow Manager & Realtime Telemetry Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
        <div className="lg:col-span-7">
          <PicoWorkflowManager onSendFeedback={handleSendFeedback} />
        </div>
        <div className="lg:col-span-5">
          <PicoLiveLog logs={scanLogs} onClearLogs={() => setScanLogs([])} />
        </div>
      </div>

      {/* ── MODALS ── */}
      {/* 1. Device Registry Modal */}
      {isRegistryOpen && (
        <PicoDeviceRegistry
          onRegisterDevice={handleRegisterDevice}
          onClose={() => setIsRegistryOpen(false)}
        />
      )}

      {/* 2. Web Bluetooth Modal */}
      {isBleModalOpen && (
        <PicoBleModal
          isOpen={isBleModalOpen}
          onClose={() => setIsBleModalOpen(false)}
          onDevicePaired={(dev) => {
            setDevices([...activeDevicesList, dev]);
            setIsBleModalOpen(false);
          }}
        />
      )}

      {/* 3. Hardware Test Harness Modal */}
      {isSimModalOpen && (
        <PicoSimulatorModal
          onClose={() => setIsSimModalOpen(false)}
          deviceId={primaryStackChan?.id || 'sim-onyxchan'}
        />
      )}

      {/* 4. Real-time Vendor Card Scan Popup Modal */}
      {activeVendorCardScan && (
        <PicoVendorCardModal
          scanEvent={activeVendorCardScan}
          onClose={() => setActiveVendorCardScan(null)}
          deviceId={primaryStackChan?.device_mac || primaryStackChan?.id}
          localIp={primaryStackChan?.local_ip}
        />
      )}

      {/* 5. Inventory Card Scan Popup Modal */}
      {activeInventoryCardScan && (
        <PicoInventoryCardModal
          scanEvent={activeInventoryCardScan}
          onClose={() => setActiveInventoryCardScan(null)}
          deviceId={primaryStackChan?.device_mac || primaryStackChan?.id}
          localIp={primaryStackChan?.local_ip}
        />
      )}
    </div>
  );
}
