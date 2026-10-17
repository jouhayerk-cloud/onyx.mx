/**
 * PackagingStudio.tsx
 * Unified Onyx Packaging Design & Visualization Studio (Wave 1)
 * Integrates FEFCO 0201 Corrugated Cartons, ISPM-15 Cleated Crates, and GMA/EUR Pallets.
 * Zero external CLI dependency — pure in-browser parametric math + Hairline 3D + BOM exports.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  inventoryAtom,
  exchangeRateAtom,
  cratesVersionAtom,
  selectedInventoryIdsAtom
} from '../../lib/atoms';
import {
  Box,
  Package,
  Layers,
  Download,
  Sparkles,
  Sliders,
  X,
  ChevronRight,
  Check,
  Copy,
  FileText,
  Scissors,
  Shield,
  Truck,
  Info,
  ExternalLink,
  Eye,
  RefreshCw,
  Ruler,
  Weight,
  DollarSign
} from 'lucide-react';
import { normalizeInventoryData, getCleanImageUrl } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import { vendors, DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import toast from '../onyxIsland/notify/toast';
import { supabase } from '../../lib/supabase';
import { svgToDataUri } from '../../lib/logistics/boxesBridge';
import {
  PackagingSpec,
  PackagingKind,
  PackagingStyle,
  DimensionBasis,
  CARDBOARD_MATERIALS,
  PLYWOOD_MATERIALS,
  PALLET_STANDARDS
} from './types';
import {
  resolvePackagingDimensions,
  computePackagingMetrics,
  generateBomCutList,
  generateDielineSvg,
  recommendPackaging,
  downloadSvgFile,
  exportPackagingPdf,
  exportPackagingXlsx,
  generateBoxesCliRecipe
} from './generators';
import { Packaging3D } from './Packaging3D';
import './packagingStudio.css';

export interface PackagingStudioProps {
  initialSpec?: PackagingSpec | null;
  initialStagedItems?: any[];
  onClose?: () => void;
  onSave?: (savedCrate: any) => void;
  embedded?: boolean;
}

export const PackagingStudio: React.FC<PackagingStudioProps> = ({
  initialSpec,
  initialStagedItems = [],
  onClose,
  onSave,
  embedded = false
}) => {
  const allInventory = useAtomValue(inventoryAtom);
  const exchangeRate = useAtomValue(exchangeRateAtom) || DEFAULT_EXCHANGE_RATE;
  const setCratesVersion = useSetAtom(cratesVersionAtom);
  const [selectedInventoryIds] = useAtom(selectedInventoryIdsAtom);

  // Staged items list
  const stagedItems = useMemo(() => {
    if (initialStagedItems && initialStagedItems.length > 0) return initialStagedItems;
    if (selectedInventoryIds && selectedInventoryIds.length > 0) {
      return (allInventory || []).filter((item: any) =>
        selectedInventoryIds.includes(String(item.row || item.id))
      );
    }
    return [];
  }, [initialStagedItems, selectedInventoryIds, allInventory]);

  // Primary Parametric Spec State
  const [kind, setKind] = useState<PackagingKind>(initialSpec?.kind || 'cardboard');
  const [style, setStyle] = useState<PackagingStyle>(initialSpec?.style || 'fefco_0201');
  const [dimBasis, setDimBasis] = useState<DimensionBasis>(initialSpec?.dimBasis || 'inside');

  const [inputW, setInputW] = useState<number>(initialSpec ? (initialSpec.dimBasis === 'inside' ? initialSpec.innerCm.w : initialSpec.outerCm.w) : 40);
  const [inputL, setInputL] = useState<number>(initialSpec ? (initialSpec.dimBasis === 'inside' ? initialSpec.innerCm.l : initialSpec.outerCm.l) : 40);
  const [inputH, setInputH] = useState<number>(initialSpec ? (initialSpec.dimBasis === 'inside' ? initialSpec.innerCm.h : initialSpec.outerCm.h) : 40);

  const [materialId, setMaterialId] = useState<string>(initialSpec?.materialId || 'flute_bc_7');
  const [foamPaddingMm, setFoamPaddingMm] = useState<number>(initialSpec?.foamPaddingMm ?? 15);
  const [skidCount, setSkidCount] = useState<number>(initialSpec?.skidMm?.count ?? 3);
  const [ispm15Ht, setIspm15Ht] = useState<boolean>(initialSpec?.ispm15Ht ?? true);
  const [laserDividersEnabled, setLaserDividersEnabled] = useState<boolean>(initialSpec?.laserDividersEnabled ?? false);

  // Viewport and Tabs State
  const [mobileTab, setMobileTab] = useState<'3d' | '2d' | 'bom'>('3d');
  const [rightViewportTab, setRightViewportTab] = useState<'dieline' | 'bom' | 'boxes'>('dieline');
  const [explodeProgress, setExplodeProgress] = useState<number>(30);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedRecipe, setCopiedRecipe] = useState<boolean>(false);

  // Auto-fit to staged items on mount if items present and no initial spec
  useEffect(() => {
    if (stagedItems.length > 0 && !initialSpec) {
      const rec = recommendPackaging(stagedItems);
      setKind(rec.kind);
      setStyle(rec.style);
      setDimBasis(rec.dimBasis);
      setInputW(rec.dimBasis === 'inside' ? rec.innerCm.w : rec.outerCm.w);
      setInputL(rec.dimBasis === 'inside' ? rec.innerCm.l : rec.outerCm.l);
      setInputH(rec.dimBasis === 'inside' ? rec.innerCm.h : rec.outerCm.h);
      setMaterialId(rec.materialId);
      setFoamPaddingMm(rec.foamPaddingMm);
      setIspm15Ht(rec.ispm15Ht);
    }
  }, [stagedItems, initialSpec]);

  // Handle kind switch
  const handleKindSwitch = (newKind: PackagingKind) => {
    setKind(newKind);
    if (newKind === 'cardboard') {
      setStyle('fefco_0201');
      setMaterialId('flute_bc_7');
      setFoamPaddingMm(15);
      setIspm15Ht(false);
    } else if (newKind === 'crate') {
      setStyle('crate_cleated');
      setMaterialId('ply_12_ht_pine');
      setFoamPaddingMm(25);
      setIspm15Ht(true);
    } else {
      setStyle('pallet_gma');
      setMaterialId('pine_ht_solid');
      setFoamPaddingMm(0);
      setIspm15Ht(true);
    }
  };

  // One-tap Auto-fit
  const handleAutoFit = () => {
    if (stagedItems.length === 0) {
      toast.error(tr('No items staged for packaging'));
      return;
    }
    const rec = recommendPackaging(stagedItems);
    setKind(rec.kind);
    setStyle(rec.style);
    setDimBasis(rec.dimBasis);
    setInputW(rec.dimBasis === 'inside' ? rec.innerCm.w : rec.outerCm.w);
    setInputL(rec.dimBasis === 'inside' ? rec.innerCm.l : rec.outerCm.l);
    setInputH(rec.dimBasis === 'inside' ? rec.innerCm.h : rec.outerCm.h);
    setMaterialId(rec.materialId);
    setFoamPaddingMm(rec.foamPaddingMm);
    setIspm15Ht(rec.ispm15Ht);
    toast.success(tr('Auto-fitted packaging specifications to staged items'));
  };

  // Compute Full Packaging Spec
  const resolvedSpec: PackagingSpec = useMemo(() => {
    const rawInner = dimBasis === 'inside' ? { w: inputW, l: inputL, h: inputH } : undefined;
    const rawOuter = dimBasis === 'outside' ? { w: inputW, l: inputL, h: inputH } : undefined;

    const boardThick = kind === 'cardboard'
      ? (CARDBOARD_MATERIALS.find(m => m.id === materialId)?.thicknessMm || 7.0)
      : kind === 'crate'
      ? (PLYWOOD_MATERIALS.find(m => m.id === materialId)?.thicknessMm || 12.0)
      : 20.0;

    const resolved = resolvePackagingDimensions({
      kind,
      style,
      dimBasis,
      innerCm: rawInner,
      outerCm: rawOuter,
      boardThicknessMm: boardThick,
      foamPaddingMm,
      cleatMm: { thick: 19, width: 89 },
      skidMm: { height: kind === 'crate' ? 89 : 140, width: 89, count: skidCount, chamfered: true },
      deckboards: { countTop: 7, countBottom: 5, thickMm: 20, widthMm: 95, fourWayNotched: true }
    });

    const spec: PackagingSpec = {
      kind,
      style,
      dimBasis,
      innerCm: resolved.innerCm,
      outerCm: resolved.outerCm,
      materialId,
      boardThicknessMm: resolved.boardThicknessMm,
      cleatMm: { thick: 19, width: 89 },
      skidMm: { height: kind === 'crate' ? 89 : 140, width: 89, count: skidCount, chamfered: true },
      deckboards: { countTop: 7, countBottom: 5, thickMm: 20, widthMm: 95, fourWayNotched: true },
      foamPaddingMm: resolved.foamPaddingMm,
      ispm15Ht,
      tareWeightKg: 0,
      estimatedCostMxn: 0,
      laserDividersEnabled
    };

    const metrics = computePackagingMetrics(spec);
    spec.tareWeightKg = metrics.tareWeightKg;
    spec.estimatedCostMxn = metrics.estimatedCostMxn;
    return spec;
  }, [kind, style, dimBasis, inputW, inputL, inputH, materialId, foamPaddingMm, skidCount, ispm15Ht, laserDividersEnabled]);

  // Derived BOM & SVG Dieline
  const bomCutList = useMemo(() => generateBomCutList(resolvedSpec), [resolvedSpec]);
  const dielineSvgString = useMemo(() => generateDielineSvg(resolvedSpec), [resolvedSpec]);
  const dielineDataUri = useMemo(() => svgToDataUri(dielineSvgString), [dielineSvgString]);

  // Staged Items Total Weight
  const stagedWeightKg = useMemo(() => {
    return stagedItems.reduce((acc, item) => {
      const d = item.data || item;
      const wt = Number(d.weight_kg || d.weightKg || 0);
      const qty = Number(d.quantity || 1);
      return acc + wt * qty;
    }, 0);
  }, [stagedItems]);

  const grossWeightKg = Number((resolvedSpec.tareWeightKg + stagedWeightKg).toFixed(1));
  const grossWeightLbs = Number((grossWeightKg * 2.20462).toFixed(1));
  const costUsd = Math.round(resolvedSpec.estimatedCostMxn / exchangeRate);

  // Copy Boxes.py CLI command
  const handleCopyBoxesRecipe = () => {
    const cmd = generateBoxesCliRecipe(resolvedSpec);
    navigator.clipboard.writeText(cmd);
    setCopiedRecipe(true);
    setTimeout(() => setCopiedRecipe(false), 2000);
    toast.success(tr('Copied Boxes.py laser recipe to clipboard'));
  };

  // Save Container Action (Wave 1: zero-migration, embedded JSON in description)
  const handleSaveContainer = async () => {
    setIsSaving(true);
    try {
      const invIdsString = stagedItems.map(item => `${item.row || item.id}:1`).join(',');
      const descTag = JSON.stringify({
        packaging_spec: resolvedSpec,
        generator_version: 'wave_1.0',
        created_at: new Date().toISOString()
      });

      const containerType = kind === 'cardboard' ? 'box' : kind === 'crate' ? 'crate' : 'pallet';
      const label = `${kind === 'cardboard' ? 'BOX' : kind === 'crate' ? 'CRT' : 'PAL'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('logistics')
        .insert({
          type: containerType,
          status: 'Empty',
          width_cm: resolvedSpec.outerCm.w,
          length_cm: resolvedSpec.outerCm.l,
          height_cm: resolvedSpec.outerCm.h,
          weight_kg: resolvedSpec.tareWeightKg,
          cost_mxn: resolvedSpec.estimatedCostMxn,
          inventory_ids: invIdsString,
          description: descTag,
          location: 'Packaging Hub'
        })
        .select()
        .single();

      if (error) throw error;

      setCratesVersion((v: number) => v + 1);
      toast.success(tr('Container registered in warehouse logistics!'));
      onSave?.(data);
      if (!embedded && onClose) onClose();
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className="packaging-studio-root flex flex-col w-full h-full min-h-0 bg-[#090b0e] text-white">
      {/* ── HEADER & WORKSPACE TOOLBAR ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-white/15 flex items-center justify-center text-cyan-300 shadow-md">
            <Package size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white">
                {tr('Packaging Studio')}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                WAVE 1
              </span>
              {resolvedSpec.ispm15Ht && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                  <Shield size={10} />
                  ISPM-15 HT
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/50 hidden sm:block">
              {tr('Parametric dielines, ISPM-15 export crates, and freight pallets')}
            </p>
          </div>
        </div>

        {/* Packaging Kind Segmented Control */}
        <div className="flex items-center bg-black/60 p-1 rounded-full border border-white/10">
          <button
            type="button"
            onClick={() => handleKindSwitch('cardboard')}
            className={`hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              kind === 'cardboard'
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>📦</span>
            <span>{tr('Cardboard')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleKindSwitch('crate')}
            className={`hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              kind === 'crate'
                ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>🪵</span>
            <span>{tr('Wood Crate')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleKindSwitch('pallet')}
            className={`hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              kind === 'pallet'
                ? 'bg-sky-500/30 text-sky-300 border border-sky-400/50 shadow-sm'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <span>🚚</span>
            <span>{tr('Pallet')}</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {stagedItems.length > 0 && (
            <button
              type="button"
              onClick={handleAutoFit}
              className="hig-touch-target px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-500/30 transition-all cursor-pointer shadow-sm"
              title={tr('Auto-fit packaging dimensions to current staged items')}
            >
              <Sparkles size={13} />
              <span>{tr('Auto-Fit')}</span>
            </button>
          )}

          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center border border-white/10 transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* ── STYLE SELECTOR PRESET BAR ── */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-black/30 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 shrink-0">
          {tr('Style Preset:')}
        </span>

        {kind === 'cardboard' && (
          <>
            <button
              type="button"
              onClick={() => setStyle('fefco_0201')}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
                style === 'fefco_0201'
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 shadow-sm'
                  : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              FEFCO 0201 RSC (Standard Shipping)
            </button>
            <button
              type="button"
              onClick={() => {
                setStyle('fefco_0427');
                toast(tr('FEFCO 0427 RETF Mailer dieline scheduled in Wave 2'), { icon: 'ℹ️' });
              }}
              className="px-3 py-1 rounded-full text-xs font-medium shrink-0 bg-white/5 text-white/50 hover:text-white border border-white/10"
            >
              FEFCO 0427 Mailer (Wave 2)
            </button>
            <button
              type="button"
              onClick={() => {
                setStyle('fefco_0300');
                toast(tr('FEFCO 0300 Telescope Box scheduled in Wave 2'), { icon: 'ℹ️' });
              }}
              className="px-3 py-1 rounded-full text-xs font-medium shrink-0 bg-white/5 text-white/50 hover:text-white border border-white/10"
            >
              FEFCO 0300 Telescope (Wave 2)
            </button>
          </>
        )}

        {kind === 'crate' && (
          <>
            <button
              type="button"
              onClick={() => setStyle('crate_cleated')}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
                style === 'crate_cleated'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40 shadow-sm'
                  : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              ISPM-15 Cleated Plywood Crate (4×4" Skids)
            </button>
            <button
              type="button"
              onClick={() => setStyle('crate_slatted')}
              className="px-3 py-1 rounded-full text-xs font-medium shrink-0 bg-white/5 text-white/50 hover:text-white border border-white/10"
            >
              Slatted Open Lumber Crate
            </button>
          </>
        )}

        {kind === 'pallet' && (
          <>
            <button
              type="button"
              onClick={() => {
                setStyle('pallet_gma');
                setInputW(PALLET_STANDARDS.gma.widthCm);
                setInputL(PALLET_STANDARDS.gma.lengthCm);
                setInputH(PALLET_STANDARDS.gma.heightCm);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
                style === 'pallet_gma'
                  ? 'bg-sky-500/25 text-sky-300 border border-sky-400/40 shadow-sm'
                  : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              GMA North America (48×40")
            </button>
            <button
              type="button"
              onClick={() => {
                setStyle('pallet_eur');
                setInputW(PALLET_STANDARDS.eur.widthCm);
                setInputL(PALLET_STANDARDS.eur.lengthCm);
                setInputH(PALLET_STANDARDS.eur.heightCm);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
                style === 'pallet_eur'
                  ? 'bg-sky-500/25 text-sky-300 border border-sky-400/40 shadow-sm'
                  : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              EUR / EPAL 1 (1200×800mm)
            </button>
            <button
              type="button"
              onClick={() => setStyle('pallet_custom')}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${
                style === 'pallet_custom'
                  ? 'bg-sky-500/25 text-sky-300 border border-sky-400/40 shadow-sm'
                  : 'bg-white/5 text-white/70 hover:text-white border border-white/10'
              }`}
            >
              Custom Freight Skid
            </button>
          </>
        )}
      </div>

      {/* ── LIVE TELEMETRY RIBBON ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 px-4 sm:px-6 py-2 bg-black/50 border-b border-white/10 text-xs shrink-0 font-mono">
        {/* Usable Cavity */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Inner Cavity')}</span>
          <span className="font-bold text-white tabular-figures">
            {resolvedSpec.innerCm.w}×{resolvedSpec.innerCm.l}×{resolvedSpec.innerCm.h} cm
          </span>
          <span className="text-[10px] text-cyan-400">{((resolvedSpec.innerCm.w * resolvedSpec.innerCm.l * resolvedSpec.innerCm.h) / 1000).toFixed(1)} L</span>
        </div>

        {/* Outer Footprint */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Outer Footprint')}</span>
          <span className="font-bold text-white tabular-figures">
            {resolvedSpec.outerCm.w}×{resolvedSpec.outerCm.l}×{resolvedSpec.outerCm.h} cm
          </span>
          <span className="text-[10px] text-amber-400">{((resolvedSpec.outerCm.w * resolvedSpec.outerCm.l * resolvedSpec.outerCm.h) / 1000000).toFixed(3)} m³</span>
        </div>

        {/* Tare Weight */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Tare Weight')}</span>
          <span className="font-bold text-white tabular-figures">{resolvedSpec.tareWeightKg} kg</span>
          <span className="text-[10px] text-white/50">{(resolvedSpec.tareWeightKg * 2.20462).toFixed(1)} lbs</span>
        </div>

        {/* Gross Weight */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Gross Weight')}</span>
          <span className="font-bold text-emerald-300 tabular-figures">{grossWeightKg} kg</span>
          <span className="text-[10px] text-white/50">{grossWeightLbs} lbs ({stagedItems.length} items)</span>
        </div>

        {/* Estimated Cost */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Material Cost')}</span>
          <span className="font-bold text-white tabular-figures">${resolvedSpec.estimatedCostMxn.toLocaleString()} MXN</span>
          <span className="text-[10px] text-cyan-400 font-bold">${costUsd} USD</span>
        </div>

        {/* Standards Compliance */}
        <div className="flex flex-col">
          <span className="text-[10px] text-white/40 uppercase tracking-widest">{tr('Standard')}</span>
          <span className="font-bold text-white">
            {kind === 'cardboard' ? 'FEFCO 0201' : kind === 'crate' ? 'IPPC ISPM-15' : 'NWPCA GMA'}
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">100% EXPORT READY</span>
        </div>
      </div>

      {/* ── MAIN WORKSPACE VIEWPORT ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* ── LEFT / MAIN: 3D HAIRLINE VIEWPORT (55% desktop) ── */}
        <div className={`flex-1 flex flex-col p-3 sm:p-4 min-h-0 ${mobileTab === '3d' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="flex-1 min-h-[350px] relative rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <Packaging3D
              spec={resolvedSpec}
              stagedItems={stagedItems}
              explodeProgress={explodeProgress}
              onExplodeChange={setExplodeProgress}
            />
          </div>
        </div>

        {/* ── RIGHT: PARAMETRIC INSPECTOR & 2D DIELINE / BOM CUT LIST (45% desktop) ── */}
        <div className={`w-full lg:w-[480px] xl:w-[540px] flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 bg-black/40 backdrop-blur-xl shrink-0 min-h-0 ${
          mobileTab !== '3d' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Right Header: Segmented Tabs */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-full border border-white/10">
              <button
                type="button"
                onClick={() => setRightViewportTab('dieline')}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  rightViewportTab === 'dieline'
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Scissors size={12} />
                <span>2D Dieline</span>
              </button>
              <button
                type="button"
                onClick={() => setRightViewportTab('bom')}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  rightViewportTab === 'bom'
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-400/40 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <FileText size={12} />
                <span>BOM Cut List</span>
              </button>
              <button
                type="button"
                onClick={() => setRightViewportTab('boxes')}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  rightViewportTab === 'boxes'
                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Box size={12} />
                <span>Boxes.py</span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-white/50">
              {resolvedSpec.kind.toUpperCase()}
            </span>
          </div>

          {/* Form Inspector (Collapsible / Scrollable Top) */}
          <div className="p-4 border-b border-white/10 flex flex-col gap-3.5 bg-black/20 shrink-0">
            {/* Dimension Basis Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-white/60 uppercase tracking-widest">
                {tr('Dimension Input Basis:')}
              </span>
              <div className="flex items-center bg-black/60 p-0.5 rounded-full border border-white/10">
                <button
                  type="button"
                  onClick={() => setDimBasis('inside')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    dimBasis === 'inside'
                      ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Inside Cavity
                </button>
                <button
                  type="button"
                  onClick={() => setDimBasis('outside')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    dimBasis === 'outside'
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-400/40 shadow-sm'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Outside Footprint
                </button>
              </div>
            </div>

            {/* Width, Length, Height Steppers */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/40 uppercase">Width (cm)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={inputW}
                  onChange={e => setInputW(Math.max(5, Number(e.target.value) || 10))}
                  className="bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/40 uppercase">Length (cm)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={inputL}
                  onChange={e => setInputL(Math.max(5, Number(e.target.value) || 10))}
                  className="bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/40 uppercase">Height (cm)</label>
                <input
                  type="number"
                  min="8"
                  max="300"
                  value={inputH}
                  onChange={e => setInputH(Math.max(5, Number(e.target.value) || 10))}
                  className="bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-cyan-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Material & Foam Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/40 uppercase">Board Material</label>
                <select
                  value={materialId}
                  onChange={e => setMaterialId(e.target.value)}
                  className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {kind === 'cardboard' &&
                    CARDBOARD_MATERIALS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  {kind === 'crate' &&
                    PLYWOOD_MATERIALS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  {kind === 'pallet' && (
                    <option value="pine_ht_solid">Solid Pine HT (ISPM-15)</option>
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/40 uppercase">Foam Cushioning</label>
                <select
                  value={foamPaddingMm}
                  onChange={e => setFoamPaddingMm(Number(e.target.value))}
                  className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value={0}>0 mm (No Foam)</option>
                  <option value={15}>15 mm (Light Cushioning)</option>
                  <option value={25}>25 mm (Standard Stone Cushion)</option>
                  <option value={50}>50 mm (Heavy Sculpture Foam)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Tab Content Viewport */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 packaging-scrollbar">
            {/* TAB A: 2D Dieline / Layout Diagram */}
            {rightViewportTab === 'dieline' && (
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white/80">
                    {kind === 'cardboard' ? 'Unfolded Blank Geometry' : 'Panel Fabrication Diagram'}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadSvgFile(`${kind}_${style}_dieline`, dielineSvgString)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 text-[11px] font-mono border border-white/10 transition-all cursor-pointer"
                  >
                    <Download size={11} />
                    <span>SVG</span>
                  </button>
                </div>

                <div className="flex-1 min-h-[280px] bg-[#07090c] rounded-2xl border border-white/10 p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={dielineDataUri}
                    alt="Packaging 2D Dieline"
                    className="max-w-full max-h-full object-contain pointer-events-auto"
                  />
                </div>
              </div>
            )}

            {/* TAB B: Bill of Materials (BOM) Cut List */}
            {rightViewportTab === 'bom' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white/80">Workshop Fabrication BOM</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => exportPackagingPdf(resolvedSpec, bomCutList)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300 text-[11px] font-mono border border-white/10 transition-all cursor-pointer"
                    >
                      <Download size={11} />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPackagingXlsx(resolvedSpec, bomCutList)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-emerald-300 text-[11px] font-mono border border-white/10 transition-all cursor-pointer"
                    >
                      <Download size={11} />
                      <span>XLSX</span>
                    </button>
                  </div>
                </div>

                {/* BOM Items Table */}
                <div className="rounded-xl border border-white/10 overflow-hidden bg-black/40">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-white/5 border-b border-white/10 text-white/50 text-[10px] uppercase">
                      <tr>
                        <th className="p-2">Part</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Dimensions (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-white/80">
                      {bomCutList.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="p-2 font-bold text-white">{item.part}</td>
                          <td className="p-2 text-cyan-300 font-bold">{item.qty}×</td>
                          <td className="p-2 text-white/70 text-[11px]">{item.dimsMm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary Card */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col gap-1 text-[11px] font-mono">
                  {bomCutList.totalPlywoodM2 > 0 && (
                    <div className="flex justify-between text-white/70">
                      <span>Total Plywood Area:</span>
                      <span className="font-bold text-white">{bomCutList.totalPlywoodM2} m²</span>
                    </div>
                  )}
                  {bomCutList.totalLumberM > 0 && (
                    <div className="flex justify-between text-white/70">
                      <span>Total HT Lumber:</span>
                      <span className="font-bold text-white">{bomCutList.totalLumberM} linear meters</span>
                    </div>
                  )}
                  {bomCutList.totalCardboardM2 > 0 && (
                    <div className="flex justify-between text-white/70">
                      <span>Corrugated Blank Area:</span>
                      <span className="font-bold text-white">{bomCutList.totalCardboardM2} m²</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white/70 pt-1 border-t border-white/10">
                    <span>Estimated Material Cost:</span>
                    <span className="font-bold text-emerald-400">${resolvedSpec.estimatedCostMxn.toLocaleString()} MXN</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB C: Boxes.py Laser Divider Recipe */}
            {rightViewportTab === 'boxes' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white/80">Boxes.py Workshop Laser Recipe</span>
                  <button
                    type="button"
                    onClick={handleCopyBoxesRecipe}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-mono border border-emerald-400/40 hover:bg-emerald-500/30 transition-all cursor-pointer"
                  >
                    {copiedRecipe ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedRecipe ? 'Copied!' : 'Copy CLI'}</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-black/80 border border-white/10 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                  <pre>{generateBoxesCliRecipe(resolvedSpec)}</pre>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex flex-col gap-1 text-[11px] text-white/60">
                  <span className="font-bold text-white">Workshop Laser Note:</span>
                  <p>
                    Paste this command into the laser cutting workstation terminal to cut slotted Baltic Birch partition grids for internal cavity organization.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MOBILE VIEWPORT SELECTOR (<1024px) ── */}
      <div className="lg:hidden flex items-center justify-around py-2 px-4 border-t border-white/10 bg-black/80 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('3d')}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold text-center transition-all ${
            mobileTab === '3d' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/50'
          }`}
        >
          3D View
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab('2d');
            setRightViewportTab('dieline');
          }}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold text-center transition-all ${
            mobileTab === '2d' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/50'
          }`}
        >
          2D Dieline
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab('bom');
            setRightViewportTab('bom');
          }}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold text-center transition-all ${
            mobileTab === 'bom' ? 'bg-cyan-500/30 text-cyan-300' : 'text-white/50'
          }`}
        >
          Cut List
        </button>
      </div>

      {/* ── BOTTOM ACTION FOOTER ── */}
      <footer className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-white/10 bg-black/60 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportPackagingPdf(resolvedSpec, bomCutList)}
            className="hig-touch-target px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download size={13} />
            <span className="hidden sm:inline">{tr('Export PDF Spec')}</span>
            <span className="sm:hidden">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => exportPackagingXlsx(resolvedSpec, bomCutList)}
            className="hig-touch-target px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download size={13} />
            <span className="hidden sm:inline">{tr('Export XLSX BOM')}</span>
            <span className="sm:hidden">XLSX</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveContainer}
            className="hig-touch-target px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            <Box size={16} />
            <span>{isSaving ? tr('Saving...') : tr('Save Container to Warehouse')}</span>
          </button>
        </div>
      </footer>
    </div>
  );

  if (embedded) {
    return content;
  }

  // Standalone Fullscreen Portal Sheet
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 backdrop-blur-2xl p-2 sm:p-6 overflow-hidden">
      <div className="w-full h-full max-w-7xl max-h-[96vh] rounded-3xl overflow-hidden border border-white/15 shadow-2xl flex flex-col bg-[#090b0e]">
        {content}
      </div>
    </div>
  );
};
