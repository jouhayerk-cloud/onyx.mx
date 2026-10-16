import React, { useState } from 'react';
import {
    Laptop,
    Smartphone,
    Tablet,
    Bot,
    Radio,
    Sparkles,
    Cpu,
    Zap,
    Activity,
} from 'lucide-react';
import { HairlineLaptop } from './HairlineLaptop';
import { HairlinePhone } from './HairlinePhone';
import { HairlineTablet } from './HairlineTablet';
import { HairlineStackChan } from './HairlineStackChan';
import { HairlineM5StickS3 } from './HairlineM5StickS3';
import { HairlineM5StickCPlus2 } from './HairlineM5StickCPlus2';
import { tr } from '../../../lib/i18n';
import './hairlineDeviceGallery.css';

export type HairlineDeviceKey = 'laptop' | 'phone' | 'tablet' | 'stackchan' | 'm5s3' | 'm5cplus';

interface HairlineDeviceGalleryProps {
    initialDevice?: HairlineDeviceKey;
    className?: string;
}

export const HairlineDeviceGallery: React.FC<HairlineDeviceGalleryProps> = ({
    initialDevice = 'laptop',
    className = '',
}) => {
    const [activeKey, setActiveKey] = useState<HairlineDeviceKey>(initialDevice);

    return (
        <div className={`hl-gallery-panel ${className}`} aria-label="Interactive Hairline Devices Gallery">
            {/* Header with Title and Segmented Device Switcher */}
            <div className="hl-gallery-header">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black tracking-wide text-(--text-color) uppercase">
                                {tr("Hairline Edge Hardware Studio")}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                3D Vector Math
                            </span>
                        </div>
                        <p className="text-xs text-(--text-color-secondary)">
                            {tr("Mathematical isometric figures with spring physics & interactive telemetry")}
                        </p>
                    </div>
                </div>

                {/* Segmented Device Switcher Tabs */}
                <div className="hl-gallery-tabs">
                    <button
                        type="button"
                        onClick={() => setActiveKey('laptop')}
                        className={`hl-gallery-tab ${activeKey === 'laptop' ? 'is-active' : ''}`}
                    >
                        <Laptop size={14} />
                        <span>Laptop</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveKey('phone')}
                        className={`hl-gallery-tab ${activeKey === 'phone' ? 'is-active' : ''}`}
                    >
                        <Smartphone size={14} />
                        <span>Phone</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveKey('tablet')}
                        className={`hl-gallery-tab ${activeKey === 'tablet' ? 'is-active' : ''}`}
                    >
                        <Tablet size={14} />
                        <span>Tablet</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveKey('stackchan')}
                        className={`hl-gallery-tab ${activeKey === 'stackchan' ? 'is-active' : ''}`}
                    >
                        <Bot size={14} />
                        <span>StackChan</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveKey('m5s3')}
                        className={`hl-gallery-tab ${activeKey === 'm5s3' ? 'is-active' : ''}`}
                    >
                        <Radio size={14} />
                        <span>M5StickS3</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveKey('m5cplus')}
                        className={`hl-gallery-tab ${activeKey === 'm5cplus' ? 'is-active' : ''}`}
                    >
                        <Zap size={14} className="text-orange-400" />
                        <span>M5StickC Plus 2</span>
                    </button>
                </div>
            </div>

            {/* Stage Card with Active Figure */}
            <div className="mt-6 hl-stage-card">
                <div className="hl-stage-bg-grid" />

                {/* Active Rendered Figure */}
                <div className="relative z-10 w-full flex items-center justify-center">
                    {activeKey === 'laptop' && (
                        <HairlineLaptop
                            title="G7 Host Node"
                            hostName="G7-Laptop-Ramses"
                            ipAddress="192.0.2.71"
                            modelName="Colibrì MoE 35B"
                            nvmeSpeed={2850}
                        />
                    )}

                    {activeKey === 'phone' && (
                        <HairlinePhone
                            title="iOS Companion"
                            deviceName="Ramses iPhone 15 Pro"
                            ipAddress="192.0.2.100"
                            modelType="LiteRT-LM Gemma-2"
                        />
                    )}

                    {activeKey === 'tablet' && (
                        <HairlineTablet
                            title="Field Logistics Pad"
                            deviceName="Onyx Pad Pro Terminal"
                            ipAddress="192.0.2.105"
                        />
                    )}

                    {activeKey === 'stackchan' && (
                        <HairlineStackChan
                            title="StackChan Companion"
                            botName="M5Stack StackChan"
                            batteryPct={94}
                        />
                    )}

                    {activeKey === 'm5s3' && (
                        <HairlineM5StickS3
                            title="M5StickS3 Controller"
                            nodeId="pico-m5s3-edge-01"
                            heapFree={184320}
                            rssi={-58}
                        />
                    )}

                    {activeKey === 'm5cplus' && (
                        <HairlineM5StickCPlus2
                            title="M5StickC PLUS 2"
                            nodeId="pico-m5cplus2-beacon"
                            batteryPct={88}
                            tempC={33.4}
                        />
                    )}
                </div>
            </div>

            {/* Hardware Specifications HUD Strip */}
            <div className="hl-specs-hud">
                {activeKey === 'laptop' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Processor</span>
                            <span className="hl-spec-val text-cyan-400">Core i7 • RTX 2060</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">MoE Acceleration</span>
                            <span className="hl-spec-val text-purple-400">Vulkan 1.4 Native</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">NVMe Streaming</span>
                            <span className="hl-spec-val text-emerald-400">2,850 MB/s Zero-RAM</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Move mouse vertically</span>
                        </div>
                    </>
                )}

                {activeKey === 'phone' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Platform</span>
                            <span className="hl-spec-val text-blue-400">Apple A17 Pro (iOS 17+)</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Local Model</span>
                            <span className="hl-spec-val text-cyan-400">Gemma-2-740M LiteRT</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Telemetry Feed</span>
                            <span className="hl-spec-val text-emerald-400">Live Continuous Scroll</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Hover or drag to scrub</span>
                        </div>
                    </>
                )}

                {activeKey === 'tablet' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Digitizer</span>
                            <span className="hl-spec-val text-indigo-400">120Hz ProMotion Multi-Touch</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Coordinate Engine</span>
                            <span className="hl-spec-val text-cyan-400">Sub-Pixel Guideline HUD</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Touch Visualizer</span>
                            <span className="hl-spec-val text-emerald-400">Radiating Ripple Waves</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Tap & drag across glass</span>
                        </div>
                    </>
                )}

                {activeKey === 'stackchan' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Controller</span>
                            <span className="hl-spec-val text-amber-400">ESP32-D0WDQ6-V3</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Servos</span>
                            <span className="hl-spec-val text-cyan-400">Dual SG90 Pan / Tilt</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Emotive Engine</span>
                            <span className="hl-spec-val text-rose-400">Autonomous Blink & Smile</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Follows cursor • Click to pet</span>
                        </div>
                    </>
                )}

                {activeKey === 'm5s3' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">SoC</span>
                            <span className="hl-spec-val text-cyan-400">ESP32-S3 Dual-Core</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Display</span>
                            <span className="hl-spec-val text-blue-400">1.14" TFT ST7789v2</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Expansion</span>
                            <span className="hl-spec-val text-amber-400">8-Pin GPIO + USB-C</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Click M5 to toggle modes</span>
                        </div>
                    </>
                )}

                {activeKey === 'm5cplus' && (
                    <>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">SoC</span>
                            <span className="hl-spec-val text-orange-400">ESP32-PICO-V3-02</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">IMU Sensor</span>
                            <span className="hl-spec-val text-cyan-400">MPU6886 6-Axis Gyro</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Simulation</span>
                            <span className="hl-spec-val text-emerald-400">Artificial Horizon Tilt</span>
                        </div>
                        <div className="hl-spec-tile">
                            <span className="hl-spec-label">Interactive</span>
                            <span className="hl-spec-val text-white/90">Move mouse to tilt horizon</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
