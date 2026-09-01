
import React, { useEffect, useState } from 'react';
import { OnyxLogo } from '../../components/OnyxLogo';
import { CheckCircle, ArrowRight, Zap } from 'lucide-react';
import gsap from 'gsap';
import { tr } from '../../lib/i18n';

export function WelcomePage({ onComplete }: { onComplete: () => void }) {
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onComplete();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        gsap.from(".welcome-animate", {
            y: 30,
            opacity: 0,
            duration: 1,
            stagger: 0.2,
            ease: "power4.out"
        });

        return () => clearInterval(timer);
    }, [onComplete]);

    return (
        <div className="relative w-full h-screen flex items-center justify-center overflow-hidden bg-black selection:bg-[var(--main-color)] selection:text-black">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(243,111,33,0.05),transparent_70%)]" />

            <div className="w-full max-w-lg p-12 glass-panel z-10 text-center relative border-white/10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-[var(--main-color)] rounded-full blur-[80px] opacity-20" />

                <div className="welcome-animate mb-8 inline-flex items-center justify-center w-24 h-24 rounded-full bg-[var(--main-color)]/10 border border-[var(--main-color)]/30 shadow-[0_0_50px_rgba(243,111,33,0.1)]">
                    <CheckCircle className="w-12 h-12 text-[var(--main-color)]" strokeWidth={1.5} />
                </div>

                <h1 className="welcome-animate text-4xl font-black text-white mb-4 tracking-tighter italic" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {tr("Activation")} <span className="text-[var(--main-color)]">{tr("Successful")}</span>
                </h1>

                <p className="welcome-animate text-white/50 text-lg mb-12 leading-relaxed">
                    Your secure enterprise account has been verified. Welcome to the <span className="text-white font-bold">Onyx.mx</span> {tr("network.")}
                </p>

                <div className="welcome-animate p-6 rounded-3xl bg-white/5 border border-white/10 mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[var(--main-color)] flex items-center justify-center shadow-lg">
                            <Zap className="w-5 h-5 text-black" strokeWidth={2.5} />
                        </div>
                        <div className="text-left">
                            <span className="block text-[10px] font-black text-white/30 uppercase tracking-widest">{tr("Protocol")}</span>
                            <span className="text-sm font-bold text-white uppercase tracking-tighter font-mono">{tr("Full Access Granted")}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="block text-[10px] font-black text-white/30 uppercase tracking-widest">{tr("Redirecting")}</span>
                        <span className="text-sm font-black text-[var(--main-color)]">{countdown}s</span>
                    </div>
                </div>

                <button
                    onClick={onComplete}
                    className="welcome-animate w-full py-5 rounded-full bg-white text-black font-black text-sm tracking-[0.2em] uppercase flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl"
                >
                    {tr("Enter System Now")}
                    <ArrowRight className="w-4 h-4" />
                </button>

                <div className="mt-12 pt-8 border-t border-white/5 welcome-animate">
                    <OnyxLogo className="w-8 h-8 mx-auto opacity-20" />
                </div>
            </div>
        </div>
    );
}
