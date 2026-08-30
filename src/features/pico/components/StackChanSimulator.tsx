import React, { useRef, useEffect, useCallback, useState } from 'react';

// ── Expression Types ───────────────────────────────────────────────────────────
export type StackChanExpression =
  | 'Neutral'
  | 'Happy'
  | 'Angry'
  | 'Sad'
  | 'Sleepy'
  | 'Doubt'
  | 'Thinking'
  | 'Shy'
  | 'Smug'
  | 'Alert'
  | 'Speaking'
  | 'Listening'
  | 'Error';

export type SimulatorTheme = 'classic' | 'cyber' | 'ramses' | 'martha' | 'alejandra' | 'carolina';

export interface StackChanSimulatorProps {
  expression?: StackChanExpression;
  ttsText?: string;
  gazeX?: number; // -1 to 1
  gazeY?: number; // -1 to 1
  pitch?: number; // tilt angle: -45 to 45 (or 0 to 90)
  yaw?: number;   // pan angle: -90 to 90
  mirrorMode?: boolean;
  theme?: SimulatorTheme;
  showGimbalOverlay?: boolean;
  className?: string;
  onGazeChange?: (gx: number, gy: number) => void;
}

// ── m5stack-avatar constants (320×240 coordinate system) ───────────────────────
const CANVAS_W = 320;
const CANVAS_H = 240;
const LEFT_EYE   = { x: 90,  y: 110 };
const RIGHT_EYE  = { x: 230, y: 110 };
const MOUTH_POS  = { x: 160, y: 160 };
const LEFT_BROW  = { x: 90,  y: 70 };
const RIGHT_BROW = { x: 230, y: 70 };
const EYE_RADIUS = 16;
const BROW_W = 40;
const BROW_H = 6;
const BROW_R = 3;
const GAZE_MAX_X = 16;
const GAZE_MAX_Y = 12;

// ── Color Themes ──────────────────────────────────────────────────────────────
export const SIMULATOR_THEMES: Record<SimulatorTheme, { bg: string; fg: string; accent: string; blush: string; name: string }> = {
  classic:   { bg: '#080808', fg: '#FFFFFF', accent: '#A855F7', blush: 'rgba(255, 120, 150, 0.65)', name: 'OLED Mono' },
  cyber:     { bg: '#030D09', fg: '#34D399', accent: '#10B981', blush: 'rgba(52, 211, 153, 0.45)',  name: 'Cyber Emerald' },
  ramses:    { bg: '#100F03', fg: '#FACC15', accent: '#EAB308', blush: 'rgba(234, 179, 8, 0.45)',   name: 'Ramses Gold' },
  martha:    { bg: '#0E0416', fg: '#C084FC', accent: '#A855F7', blush: 'rgba(192, 132, 252, 0.45)', name: 'Martha Violet' },
  alejandra: { bg: '#031210', fg: '#2DD4BF', accent: '#14B8A6', blush: 'rgba(45, 212, 191, 0.45)',  name: 'Alejandra Teal' },
  carolina:  { bg: '#14030B', fg: '#FB7185', accent: '#F43F5E', blush: 'rgba(251, 113, 133, 0.45)', name: 'Carolina Rose' },
};

// ── Expression Data ───────────────────────────────────────────────────────────
interface ExprData {
  leftEyeOpen: number;   // 0..1
  rightEyeOpen: number;  // 0..1
  eyeYOffset: number;
  happyArcs: boolean;    // draw ^ ^ instead of circles
  mouthOpenRatio: number;// 0..1
  mouthWidth: number;
  mouthSmile: number;    // >0 smile, <0 frown, 0 flat
  leftBrowY: number;
  rightBrowY: number;
  leftBrowAngle: number; // degrees
  rightBrowAngle: number;
  showBlush: boolean;
  eyeShape?: 'circle' | 'arc' | 'wink' | 'x' | 'heart' | 'alert';
}

const EXPR: Record<StackChanExpression, ExprData> = {
  Neutral: {
    leftEyeOpen: 1, rightEyeOpen: 1, eyeYOffset: 0, happyArcs: false,
    mouthOpenRatio: 0, mouthWidth: 40, mouthSmile: 0,
    leftBrowY: 70, rightBrowY: 70, leftBrowAngle: 0, rightBrowAngle: 0,
    showBlush: false,
  },
  Happy: {
    leftEyeOpen: 1, rightEyeOpen: 1, eyeYOffset: 0, happyArcs: true,
    mouthOpenRatio: 0.75, mouthWidth: 46, mouthSmile: 14,
    leftBrowY: 60, rightBrowY: 60, leftBrowAngle: -6, rightBrowAngle: 6,
    showBlush: true,
  },
  Angry: {
    leftEyeOpen: 0.7, rightEyeOpen: 0.7, eyeYOffset: 2, happyArcs: false,
    mouthOpenRatio: 0, mouthWidth: 38, mouthSmile: -7,
    leftBrowY: 82, rightBrowY: 82, leftBrowAngle: 24, rightBrowAngle: -24,
    showBlush: false,
  },
  Sad: {
    leftEyeOpen: 0.85, rightEyeOpen: 0.85, eyeYOffset: 4, happyArcs: false,
    mouthOpenRatio: 0, mouthWidth: 36, mouthSmile: -9,
    leftBrowY: 64, rightBrowY: 64, leftBrowAngle: -24, rightBrowAngle: 24,
    showBlush: false,
  },
  Sleepy: {
    leftEyeOpen: 0.15, rightEyeOpen: 0.15, eyeYOffset: 8, happyArcs: false,
    mouthOpenRatio: 0.45, mouthWidth: 18, mouthSmile: 0,
    leftBrowY: 78, rightBrowY: 78, leftBrowAngle: 0, rightBrowAngle: 0,
    showBlush: false,
  },
  Doubt: {
    leftEyeOpen: 1, rightEyeOpen: 0.28, eyeYOffset: 0, happyArcs: false,
    mouthOpenRatio: 0, mouthWidth: 32, mouthSmile: -2,
    leftBrowY: 58, rightBrowY: 82, leftBrowAngle: -12, rightBrowAngle: 18,
    showBlush: false,
  },
  Thinking: {
    leftEyeOpen: 0.9, rightEyeOpen: 0.9, eyeYOffset: -4, happyArcs: false,
    mouthOpenRatio: 0.15, mouthWidth: 26, mouthSmile: 2,
    leftBrowY: 56, rightBrowY: 74, leftBrowAngle: -15, rightBrowAngle: 10,
    showBlush: false,
  },
  Shy: {
    leftEyeOpen: 0.8, rightEyeOpen: 0.8, eyeYOffset: 4, happyArcs: false,
    mouthOpenRatio: 0.1, mouthWidth: 24, mouthSmile: 5,
    leftBrowY: 68, rightBrowY: 68, leftBrowAngle: -10, rightBrowAngle: 10,
    showBlush: true,
  },
  Smug: {
    leftEyeOpen: 0.45, rightEyeOpen: 0.9, eyeYOffset: -2, happyArcs: false,
    mouthOpenRatio: 0.2, mouthWidth: 38, mouthSmile: 12,
    leftBrowY: 62, rightBrowY: 58, leftBrowAngle: 14, rightBrowAngle: -6,
    showBlush: true,
  },
  Alert: {
    leftEyeOpen: 1.15, rightEyeOpen: 1.15, eyeYOffset: -4, happyArcs: false,
    mouthOpenRatio: 0.6, mouthWidth: 24, mouthSmile: 0,
    leftBrowY: 52, rightBrowY: 52, leftBrowAngle: 0, rightBrowAngle: 0,
    showBlush: false,
  },
  Speaking: {
    leftEyeOpen: 1, rightEyeOpen: 1, eyeYOffset: 0, happyArcs: false,
    mouthOpenRatio: 0.85, mouthWidth: 44, mouthSmile: 4,
    leftBrowY: 64, rightBrowY: 64, leftBrowAngle: -4, rightBrowAngle: 4,
    showBlush: false,
  },
  Listening: {
    leftEyeOpen: 1.1, rightEyeOpen: 1.1, eyeYOffset: -2, happyArcs: false,
    mouthOpenRatio: 0.1, mouthWidth: 28, mouthSmile: 3,
    leftBrowY: 58, rightBrowY: 58, leftBrowAngle: -8, rightBrowAngle: 8,
    showBlush: true,
  },
  Error: {
    leftEyeOpen: 0.6, rightEyeOpen: 0.6, eyeYOffset: 2, happyArcs: false,
    mouthOpenRatio: 0.4, mouthWidth: 36, mouthSmile: -12,
    leftBrowY: 84, rightBrowY: 84, leftBrowAngle: 28, rightBrowAngle: -28,
    showBlush: false,
  },
};

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── Component ──────────────────────────────────────────────────────────────────
export const StackChanSimulator: React.FC<StackChanSimulatorProps> = ({
  expression = 'Neutral',
  ttsText,
  gazeX: propGazeX,
  gazeY: propGazeY,
  pitch = 0,
  yaw = 0,
  mirrorMode = false,
  theme = 'classic',
  showGimbalOverlay = true,
  className = '',
  onGazeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [displayText, setDisplayText] = useState<string | null>(null);

  const themeColors = SIMULATOR_THEMES[theme] || SIMULATOR_THEMES.classic;

  const s = useRef({
    // interpolated facial features
    leftEyeOpen: 1, rightEyeOpen: 1, eyeYOffset: 0,
    happyArcs: 0,
    mouthOpenRatio: 0, mouthWidth: 40, mouthSmile: 0,
    leftBrowY: 70, rightBrowY: 70,
    leftBrowAngle: 0, rightBrowAngle: 0,
    showBlush: 0,
    // gaze
    gazeX: 0, gazeY: 0, targetGazeX: 0, targetGazeY: 0,
    // head servo interpolation
    curYaw: 0, curPitch: 0,
    // blink
    blinkTimer: 0, nextBlink: 3200, isBlinking: false,
    blinkElapsed: 0, blinkOpenLeft: 1, blinkOpenRight: 1,
    // saccade
    saccadeTimer: 0, nextSaccade: 2000,
    saccadeTargetX: 0, saccadeTargetY: 0,
    // breathing & idle float
    breathPhase: 0,
    // talking
    isTalking: false, talkTimer: 0, talkPhase: 0,
    // audio waveform
    audioWave: 0,
    // time
    lastTime: 0,
  });

  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const lastMoveRef = useRef<number>(0);

  // Mouse tracking on container / window
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastMoveRef.current < 100) return; // 10Hz throttle
      lastMoveRef.current = now;

      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const rawX = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const rawY = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const finalX = mirrorMode ? -rawX : rawX;
      mouseRef.current.x = Math.max(-1, Math.min(1, finalX));
      mouseRef.current.y = Math.max(-1, Math.min(1, rawY));
      mouseRef.current.active = true;

      if (onGazeChange) {
        onGazeChange(mouseRef.current.x, mouseRef.current.y);
      }
    };
    const onLeave = () => { mouseRef.current.active = false; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [mirrorMode, onGazeChange]);

  // TTS Speech Trigger
  useEffect(() => {
    if (ttsText && ttsText.trim()) {
      s.current.isTalking = true;
      s.current.talkTimer = 0;
      setDisplayText(ttsText.trim());
      const timeout = setTimeout(() => {
        setDisplayText(null);
      }, Math.max(3000, ttsText.length * 75));
      return () => clearTimeout(timeout);
    }
  }, [ttsText]);

  // Main Render Loop
  const render = useCallback((time: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const st = s.current;
    const dt = st.lastTime === 0 ? 16 : Math.min(time - st.lastTime, 50);
    st.lastTime = time;

    // Resize canvas
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(rect.width * dpr);
    const ch = Math.floor(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Scale to fit 320×240 grid into container with centering
    const scaleX = rect.width / CANVAS_W;
    const scaleY = rect.height / CANVAS_H;
    const sc = Math.min(scaleX, scaleY);
    const offX = (rect.width - CANVAS_W * sc) / 2;
    const offY = (rect.height - CANVAS_H * sc) / 2;

    // Interpolate Head Pan/Tilt (Yaw & Pitch)
    st.curYaw = lerp(st.curYaw, yaw, 0.1);
    st.curPitch = lerp(st.curPitch, pitch, 0.1);

    // ── Apply 2D/3D Perspective Skew based on Servo Angles ──────────────────
    ctx.save();
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * offX, dpr * offY);

    // Servo yaw/pitch physical face offset
    const servoFaceOffsetX = (st.curYaw / 90) * 20 * (mirrorMode ? -1 : 1);
    const servoFaceOffsetY = (st.curPitch / 90) * 16;

    // Expression interpolation
    const tgt = EXPR[expression] || EXPR.Neutral;
    const lv = 0.11;
    st.leftEyeOpen = lerp(st.leftEyeOpen, tgt.leftEyeOpen, lv);
    st.rightEyeOpen = lerp(st.rightEyeOpen, tgt.rightEyeOpen, lv);
    st.eyeYOffset = lerp(st.eyeYOffset, tgt.eyeYOffset, lv);
    st.happyArcs = lerp(st.happyArcs, tgt.happyArcs ? 1 : 0, lv);
    st.mouthOpenRatio = lerp(st.mouthOpenRatio, tgt.mouthOpenRatio, lv);
    st.mouthWidth = lerp(st.mouthWidth, tgt.mouthWidth, lv);
    st.mouthSmile = lerp(st.mouthSmile, tgt.mouthSmile, lv);
    st.leftBrowY = lerp(st.leftBrowY, tgt.leftBrowY, lv);
    st.rightBrowY = lerp(st.rightBrowY, tgt.rightBrowY, lv);
    st.leftBrowAngle = lerp(st.leftBrowAngle, tgt.leftBrowAngle, lv);
    st.rightBrowAngle = lerp(st.rightBrowAngle, tgt.rightBrowAngle, lv);
    st.showBlush = lerp(st.showBlush, tgt.showBlush ? 1 : 0, lv);

    // Gaze interpolation
    if (propGazeX !== undefined) {
      st.targetGazeX = mirrorMode ? -propGazeX : propGazeX;
    } else if (mouseRef.current.active) {
      st.targetGazeX = mouseRef.current.x;
    } else {
      st.saccadeTimer += dt;
      if (st.saccadeTimer >= st.nextSaccade) {
        st.saccadeTimer = 0;
        st.nextSaccade = 1800 + Math.random() * 2600;
        st.saccadeTargetX = (Math.random() - 0.5) * 0.75;
        st.saccadeTargetY = (Math.random() - 0.5) * 0.5;
      }
      st.targetGazeX = st.saccadeTargetX;
    }

    if (propGazeY !== undefined) {
      st.targetGazeY = propGazeY;
    } else if (mouseRef.current.active) {
      st.targetGazeY = mouseRef.current.y;
    } else {
      st.targetGazeY = st.saccadeTargetY;
    }

    st.gazeX = lerp(st.gazeX, st.targetGazeX, 0.1);
    st.gazeY = lerp(st.gazeY, st.targetGazeY, 0.1);

    // Blinking
    st.blinkTimer += dt;
    if (!st.isBlinking && st.blinkTimer >= st.nextBlink) {
      st.isBlinking = true;
      st.blinkElapsed = 0;
    }
    if (st.isBlinking) {
      st.blinkElapsed += dt;
      const closeT = 60, holdT = 30, openT = 90;
      const total = closeT + holdT + openT;
      if (st.blinkElapsed < closeT) {
        const p = st.blinkElapsed / closeT;
        st.blinkOpenLeft = 1 - p;
        st.blinkOpenRight = 1 - p;
      } else if (st.blinkElapsed < closeT + holdT) {
        st.blinkOpenLeft = 0;
        st.blinkOpenRight = 0;
      } else if (st.blinkElapsed < total) {
        const p = (st.blinkElapsed - closeT - holdT) / openT;
        st.blinkOpenLeft = p;
        st.blinkOpenRight = p;
      } else {
        st.blinkOpenLeft = 1;
        st.blinkOpenRight = 1;
        st.isBlinking = false;
        st.blinkTimer = 0;
        st.nextBlink = 2200 + Math.random() * 3800;
      }
    }

    // Breathing phase
    st.breathPhase += dt * 0.002;
    const breathY = Math.sin(st.breathPhase) * 1.5;

    // Talking phase
    if (st.isTalking || expression === 'Speaking') {
      st.talkTimer += dt;
      st.talkPhase += dt * 0.022;
      st.audioWave = Math.sin(st.talkPhase * 3.5) * 0.5 + 0.5;
      if (st.talkTimer > 3500 && expression !== 'Speaking') {
        st.isTalking = false;
        st.talkPhase = 0;
      }
    } else {
      st.audioWave = 0;
    }
    const talkMouth = (st.isTalking || expression === 'Speaking')
      ? Math.abs(Math.sin(st.talkPhase * 2.8)) * 0.85
      : 0;

    // ── Draw CRT / OLED Display Background ──────────────────────────────────
    ctx.fillStyle = themeColors.bg;
    roundRect(ctx, 0, 0, CANVAS_W, CANVAS_H, 16);
    ctx.fill();

    // Subtle bezel glow
    ctx.strokeStyle = themeColors.accent;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.25;
    roundRect(ctx, 1, 1, CANVAS_W - 2, CANVAS_H - 2, 15);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Subtle grid matrix background in cyber theme
    if (theme === 'cyber') {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 20; x < CANVAS_W; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
      }
      for (let y = 20; y < CANVAS_H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
      }
    }

    // Calculate eye/gaze offsets with servo yaw & pitch
    const finalLeftOpen = st.leftEyeOpen * (st.isBlinking ? st.blinkOpenLeft : 1);
    const finalRightOpen = st.rightEyeOpen * (st.isBlinking ? st.blinkOpenRight : 1);

    const gazeOffX = st.gazeX * GAZE_MAX_X + servoFaceOffsetX;
    const gazeOffY = st.gazeY * GAZE_MAX_Y + servoFaceOffsetY;

    // ── Eyebrows ───────────────────────────────────────────────────────────
    drawBrow(
      ctx,
      LEFT_BROW.x + gazeOffX * 0.35,
      st.leftBrowY + breathY + servoFaceOffsetY * 0.5,
      st.leftBrowAngle,
      themeColors.fg
    );
    drawBrow(
      ctx,
      RIGHT_BROW.x + gazeOffX * 0.35,
      st.rightBrowY + breathY + servoFaceOffsetY * 0.5,
      st.rightBrowAngle,
      themeColors.fg
    );

    // ── Eyes ───────────────────────────────────────────────────────────────
    const eyeY = breathY + st.eyeYOffset + servoFaceOffsetY;
    if (st.happyArcs > 0.5) {
      drawHappyEye(ctx, LEFT_EYE.x + gazeOffX, LEFT_EYE.y + eyeY, themeColors.fg);
      drawHappyEye(ctx, RIGHT_EYE.x + gazeOffX, RIGHT_EYE.y + eyeY, themeColors.fg);
    } else if (expression === 'Error') {
      drawErrorEye(ctx, LEFT_EYE.x + gazeOffX, LEFT_EYE.y + eyeY, themeColors.fg);
      drawErrorEye(ctx, RIGHT_EYE.x + gazeOffX, RIGHT_EYE.y + eyeY, themeColors.fg);
    } else {
      drawEye(ctx, LEFT_EYE.x + gazeOffX, LEFT_EYE.y + eyeY, finalLeftOpen, themeColors.fg);
      drawEye(ctx, RIGHT_EYE.x + gazeOffX, RIGHT_EYE.y + eyeY, finalRightOpen, themeColors.fg);
    }

    // ── Blush Cheeks ───────────────────────────────────────────────────────
    if (st.showBlush > 0.02) {
      ctx.globalAlpha = st.showBlush * 0.7;
      ctx.fillStyle = themeColors.blush;
      ctx.beginPath();
      ctx.ellipse(LEFT_EYE.x - 4 + gazeOffX * 0.2, LEFT_EYE.y + 22 + eyeY, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(RIGHT_EYE.x + 4 + gazeOffX * 0.2, RIGHT_EYE.y + 22 + eyeY, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // ── Mouth ──────────────────────────────────────────────────────────────
    const mouthOpen = Math.max(st.mouthOpenRatio, talkMouth);
    drawMouth(
      ctx,
      MOUTH_POS.x + gazeOffX * 0.2,
      MOUTH_POS.y + breathY + st.eyeYOffset * 0.4 + servoFaceOffsetY * 0.8,
      st.mouthWidth,
      mouthOpen,
      st.mouthSmile,
      themeColors.fg
    );

    // ── HUD Servo Angles Indicator Overlay (Corner badge) ──────────────────
    if (showGimbalOverlay) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      roundRect(ctx, 10, 10, 110, 22, 6);
      ctx.fill();
      ctx.fillStyle = themeColors.fg;
      ctx.font = '9px monospace';
      ctx.fillText(`Y:${Math.round(st.curYaw)}° P:${Math.round(st.curPitch)}° ${expression.slice(0, 5)}`, 16, 24);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(render);
  }, [expression, propGazeX, propGazeY, pitch, yaw, mirrorMode, theme, showGimbalOverlay, themeColors]);

  useEffect(() => {
    s.current.lastTime = 0;
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  return (
    <div ref={containerRef} className={`relative w-full h-full select-none overflow-hidden rounded-2xl ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      {/* Dynamic TTS Speech Bubble Overlay */}
      {displayText && (
        <div className="absolute bottom-3 left-4 right-4 z-20 animate-fade-in">
          <div className="px-3.5 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-purple-500/40 text-white text-xs font-mono shadow-2xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping shrink-0" />
            <span className="truncate">{displayText}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Firmware Accurate Canvas Drawing Helpers ──────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  openRatio: number,
  fgColor: string
) {
  ctx.fillStyle = fgColor;
  if (openRatio < 0.1) {
    ctx.fillRect(cx - EYE_RADIUS, cy - 2, EYE_RADIUS * 2, 4);
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy, EYE_RADIUS, Math.max(2, EYE_RADIUS * openRatio), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHappyEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, fgColor: string) {
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 6, EYE_RADIUS, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawErrorEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, fgColor: string) {
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const size = 12;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size);
  ctx.lineTo(cx + size, cy + size);
  ctx.moveTo(cx + size, cy - size);
  ctx.lineTo(cx - size, cy + size);
  ctx.stroke();
}

function drawBrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angleDeg: number,
  fgColor: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.fillStyle = fgColor;
  roundRect(ctx, -BROW_W / 2, -BROW_H / 2, BROW_W, BROW_H, BROW_R);
  ctx.fill();
  ctx.restore();
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  openRatio: number,
  smile: number,
  fgColor: string
) {
  ctx.fillStyle = fgColor;
  ctx.strokeStyle = fgColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;

  if (openRatio < 0.06) {
    if (Math.abs(smile) > 0.5) {
      ctx.beginPath();
      ctx.moveTo(cx - width / 2, cy);
      ctx.quadraticCurveTo(cx, cy + smile, cx + width / 2, cy);
      ctx.stroke();
    } else {
      roundRect(ctx, cx - width / 2, cy - 3, width, 6, 3);
      ctx.fill();
    }
  } else {
    const h = 28 * openRatio;
    ctx.beginPath();
    ctx.ellipse(cx, cy + smile * 0.3, width / 2 * 0.72, Math.max(4, h / 2), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default StackChanSimulator;
