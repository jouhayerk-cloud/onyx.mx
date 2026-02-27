import React, { useState, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { userAtom, notificationsAtom } from '../../lib/atoms';
import { readFileAsDataURL, loadImage } from '../../lib/utils';
// Replaced @google/genai with direct fetch to avoid Vite build/browser parser crashes
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

async function generateContent(model: string, parts: any[], config?: any) {
    if (!API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: config ? { responseMimeType: config.responseMimeType } : undefined })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
}

const lbl = "text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1.5";
const inp = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/15 focus:outline-none focus:border-[var(--main-color)]/50 transition-all";

type AITab = 'describe' | 'detect' | 'colors' | 'masks';

const AI_TABS: { id: AITab; label: string; emoji: string }[] = [
    { id: 'describe', label: 'AI Describe', emoji: '✨' },
    { id: 'detect', label: 'Detect & Tag', emoji: '📦' },
    { id: 'colors', label: 'Color Codes', emoji: '🎨' },
    { id: 'masks', label: 'Masks / BG', emoji: '✂️' },
];

// ─── Color Swatch ─────────────────────────────────────────────────────────────
const ColorSwatch: React.FC<{ hex: string; name: string }> = ({ hex, name }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => { navigator.clipboard.writeText(hex); setCopied(true); setTimeout(() => setCopied(false), 1500); };
    return (
        <div onClick={copy} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] cursor-pointer hover:bg-white/[0.08] transition-all group">
            <div className="w-8 h-8 rounded-lg shrink-0 border border-white/10" style={{ backgroundColor: hex }} />
            <div className="min-w-0">
                <p className="text-[9px] font-black font-mono text-white/80 truncate">{hex}</p>
                <p className="text-[8px] text-white/30 truncate">{name}</p>
            </div>
            <span className="ml-auto text-[8px] font-black text-white/20 group-hover:text-[var(--main-color)] transition-colors shrink-0">
                {copied ? '✓' : 'COPY'}
            </span>
        </div>
    );
};

// ─── Result panel ─────────────────────────────────────────────────────────────
const ResultPanel: React.FC<{ content: string; onCopy?: () => void }> = ({ content, onCopy }) => (
    <div className="relative bg-black/20 border border-white/[0.06] rounded-xl p-4">
        <pre className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed font-mono overflow-auto max-h-60">{content}</pre>
        {onCopy && (
            <button onClick={onCopy} className="absolute top-2 right-2 text-[8px] font-black text-white/20 hover:text-white/60 tracking-widest uppercase transition-colors">COPY</button>
        )}
    </div>
);

// ─── Sub-panels per AI tab ────────────────────────────────────────────────────

const DescribePanel: React.FC<{ imageSrc: string | null }> = ({ imageSrc }) => {
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const run = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setResult(null);
        try {
            const prompt = `Analyze this product image. Return a JSON object with these keys:
- "shape": object shape/form (string)
- "material": primary material (string)
- "color": main color description (string)
- "item_type": product type or style (string)
- "widthCm": estimated width in cm (string number)
- "heightCm": estimated height in cm (string number)
- "lengthCm": estimated depth/length in cm (string number)
- "weightKg": estimated weight in kg (string number)
- "shortDescription": one-sentence description (string)
- "description": 2-3 sentence detailed description (string)`;
            const response = await generateContent(
                'gemini-2.0-flash',
                [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt }],
                { responseMimeType: 'application/json' }
            );
            setResult(JSON.parse(response.text));
        } catch (e: any) { setResult({ error: e.message }); }
        setLoading(false);
    };

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[10px] text-white/30">Gemini analyzes the image and fills form fields automatically.</p>
            <button onClick={run} disabled={!imageSrc || loading}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-[var(--main-color)] text-black text-[10px] font-black tracking-widest rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {loading ? '⏳ Analyzing…' : '✨ Generate Description'}
            </button>
            {result && !result.error && (
                <div className="flex flex-col gap-2">
                    {Object.entries(result).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest min-w-[80px] pt-0.5">{k}</span>
                            <span className="text-xs text-white/70 flex-1">{String(v)}</span>
                        </div>
                    ))}
                    <button onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                        className="text-[9px] font-black text-white/20 hover:text-white/60 uppercase tracking-widest self-end transition-colors mt-1">
                        Copy JSON
                    </button>
                </div>
            )}
            {result?.error && <p className="text-xs text-red-400">{result.error}</p>}
        </div>
    );
};

const DetectPanel: React.FC<{ imageSrc: string | null }> = ({ imageSrc }) => {
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [prompt, setPrompt] = useState('product objects');
    const run = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setResult('');
        try {
            const p = `Detect and tag all ${prompt} in the image. Return JSON with: "boxes" (list of {box_2d:[y_min,x_min,y_max,x_max], label}) and "points" (list of {point:[y,x], label}). Coordinates normalized 0-1000.`;
            const response = await generateContent(
                'gemini-2.0-flash',
                [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: p }],
                { responseMimeType: 'application/json' }
            );
            setResult(JSON.stringify(JSON.parse(response.text), null, 2));
        } catch (e: any) { setResult(`Error: ${e.message}`); }
        setLoading(false);
    };
    return (
        <div className="flex flex-col gap-3">
            <div>
                <label className={lbl}>Detect prompt</label>
                <input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="product objects" className={inp} />
            </div>
            <button onClick={run} disabled={!imageSrc || loading}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-[#00AEEF] text-black text-[10px] font-black tracking-widest rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {loading ? '⏳ Detecting…' : '📦 Run Detection'}
            </button>
            {result && <ResultPanel content={result} onCopy={() => navigator.clipboard.writeText(result)} />}
        </div>
    );
};

const ColorPanel: React.FC<{ imageSrc: string | null }> = ({ imageSrc }) => {
    const [swatches, setSwatches] = useState<{ hex: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const run = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setSwatches([]);
        try {
            const prompt = `Extract the 6 most dominant colors from this image. Return a JSON array of objects with "hex" (CSS hex color like "#A3B4C5") and "name" (descriptive color name). Order by dominance.`;
            const response = await generateContent(
                'gemini-2.0-flash',
                [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt }],
                { responseMimeType: 'application/json' }
            );
            setSwatches(JSON.parse(response.text));
        } catch (e: any) { setSwatches([{ hex: '#ff0000', name: `Error: ${(e as any).message}` }]); }
        setLoading(false);
    };
    return (
        <div className="flex flex-col gap-3">
            <p className="text-[10px] text-white/30">Extract dominant colors with HEX codes. Click any swatch to copy.</p>
            <button onClick={run} disabled={!imageSrc || loading}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-[#F7941D] text-black text-[10px] font-black tracking-widest rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {loading ? '⏳ Extracting…' : '🎨 Extract Colors'}
            </button>
            {swatches.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {swatches.map((s, i) => <ColorSwatch key={i} hex={s.hex} name={s.name} />)}
                </div>
            )}
        </div>
    );
};

const MaskPanel: React.FC<{ imageSrc: string | null }> = ({ imageSrc }) => {
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [task, setTask] = useState<'segment' | 'describe'>('segment');
    const run = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setResult('');
        try {
            const prompt = task === 'segment'
                ? `Generate segmentation masks for the main product objects. Return a JSON list of masks, each with "box_2d" ([y_min, x_min, y_max, x_max] normalized to 1000), "mask" (base64 PNG), and "label".`
                : `Describe what is in the background of this product photo that should be removed to isolate the subject. Return JSON with "background_description", "subject_description", "removal_advice".`;
            const response = await generateContent(
                'gemini-2.0-flash',
                [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt }],
                { responseMimeType: 'application/json' }
            );
            const parsed = JSON.parse(response.text);
            setResult(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
        } catch (e: any) { setResult(`Error: ${e.message}`); }
        setLoading(false);
    };
    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
                {(['segment', 'describe'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTask(t)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all
                            ${task === t ? 'bg-[#8DC63F]/15 border-[#8DC63F]/50 text-[#8DC63F]' : 'border-white/10 text-white/30 hover:text-white/60'}`}>
                        {t === 'segment' ? '✂️ Segment' : '💡 BG Analysis'}
                    </button>
                ))}
            </div>
            <button onClick={run} disabled={!imageSrc || loading}
                className="flex items-center justify-center gap-2 py-2.5 px-5 bg-[#8DC63F] text-black text-[10px] font-black tracking-widest rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {loading ? '⏳ Processing…' : '✂️ Run Analysis'}
            </button>
            {result && <ResultPanel content={result} onCopy={() => navigator.clipboard.writeText(result)} />}
        </div>
    );
};

// ─── Main AI Panel ─────────────────────────────────────────────────────────────
export function UploadAIPanel() {
    const user = useAtomValue(userAtom);
    const [activeTab, setActiveTab] = useState<AITab>('describe');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Guard — Admin / Developer only
    if (user?.role !== 'Developer' && user?.role !== 'Admin') {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
                <svg className="w-10 h-10 text-white/10"><use href="#lock" /></svg>
                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Admin / Developer Only</p>
            </div>
        );
    }

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const url = await readFileAsDataURL(f, 'image');
        setImageSrc(url);
    };

    return (
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-5 pb-8">
            <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">AI Processing Tools</p>
                <p className="text-xs text-white/30">Upload an image to process with Gemini AI. Results can be copied and used manually or pasted into the entry form.</p>
            </div>

            {/* Image picker */}
            <div>
                <label className={lbl}>Source Image</label>
                <label className="flex items-center gap-3 border border-dashed border-white/[0.12] rounded-xl px-4 py-3 cursor-pointer hover:border-white/25 hover:bg-white/[0.02] transition-all">
                    <svg className="w-5 h-5 text-white/20 shrink-0"><use href="#camera" /></svg>
                    <span className="text-xs text-white/30">
                        {imageSrc ? '✓ Image loaded — click to change' : 'Upload image for AI processing'}
                    </span>
                    <input ref={fileRef} type="file" className="sr-only" accept="image/*" onChange={handleFile} />
                </label>
                {imageSrc && (
                    <div className="mt-2 flex gap-3 items-start">
                        <img src={imageSrc} alt="AI source" className="w-24 h-24 object-cover rounded-xl border border-white/10 shrink-0" />
                        <button onClick={() => setImageSrc(null)}
                            className="text-[9px] font-black text-white/20 hover:text-white/50 uppercase tracking-widest transition-colors mt-1">
                            Remove
                        </button>
                    </div>
                )}
            </div>

            {/* AI Tool tabs */}
            <div className="flex gap-2 flex-wrap">
                {AI_TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
                            ${activeTab === t.id
                                ? 'bg-[var(--main-color)]/15 border-[var(--main-color)]/60 text-[var(--main-color)]'
                                : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:text-white/60 hover:border-white/20'}`}>
                        {t.emoji} {t.label}
                    </button>
                ))}
            </div>

            {/* Panel content */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                {activeTab === 'describe' && <DescribePanel imageSrc={imageSrc} />}
                {activeTab === 'detect' && <DetectPanel imageSrc={imageSrc} />}
                {activeTab === 'colors' && <ColorPanel imageSrc={imageSrc} />}
                {activeTab === 'masks' && <MaskPanel imageSrc={imageSrc} />}
            </div>
        </div>
    );
}
