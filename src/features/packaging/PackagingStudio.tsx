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

      const containerType = kind === 'cardboard' ? 'cardboard' : kind === 'crate' ? 'crate' : 'pallet';
      const label = `${kind === 'cardboard' ? 'BOX' : kind === 'crate' ? 'CRT' : 'PAL'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { data, error } = await supabase
        .from('logistics')
        .insert({
          type: containerType,
          status: stagedItems.length > 0 ? 'Packed' : 'Empty',
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
    <div className="packaging-studio-root liquid-surface relative flex flex-col w-full h-full min-h-0">
      {/* ── HEADER & WORKSPACE TOOLBAR ── */}
      <header className="ps-header flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="liquid-panel w-10 h-10 rounded-xl flex items-center justify-center text-[var(--main-color)] shrink-0">
            <Package size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] sm:text-base font-bold tracking-tight text-[var(--lq-ink)]">
                {tr('Packaging Studio')}
              </h2>
              <span className="liquid-control px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-[var(--main-color)]">
                WAVE 1
              </span>
              {resolvedSpec.ispm15Ht && (
                <span className="liquid-control px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-amber-500 flex items-center gap-1">
                  <Shield size={10} />
                  ISPM-15 HT
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--lq-ink-tertiary)] hidden sm:block">
              {tr('Parametric dielines, ISPM-15 export crates, and freight pallets')}
            </p>
          </div>
        </div>

        {/* Packaging Kind Segmented Control */}
        <div className="ps-seg-group liquid-panel flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleKindSwitch('cardboard')}
            className={`ps-seg-btn hig-touch-target px-3.5 py-1.5 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              kind === 'cardboard' ? 'is-active' : ''
            }`}
          >
            <span>📦</span>
            <span>{tr('Cardboard')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleKindSwitch('crate')}
            className={`ps-seg-btn hig-touch-target px-3.5 py-1.5 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              kind === 'crate' ? 'is-active' : ''
            }`}
          >
            <span>🪵</span>
            <span>{tr('Wood Crate')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleKindSwitch('pallet')}
            className={`ps-seg-btn hig-touch-target px-3.5 py-1.5 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              kind === 'pallet' ? 'is-active' : ''
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
              className="liquid-control hig-touch-target px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              title={tr('Auto-fit packaging dimensions to current staged items')}
            >
              <Sparkles size={13} className="text-emerald-500" />
              <span>{tr('Auto-Fit')}</span>
            </button>
          )}

          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="liquid-control hig-touch-target w-11 h-11 rounded-full flex items-center justify-center cursor-pointer"
              aria-label="Close Packaging Studio"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* ── STYLE SELECTOR PRESET BAR ── */}
      <div className="ps-preset-bar flex items-center gap-2 px-4 sm:px-6 py-2 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--lq-ink-tertiary)] shrink-0">
          {tr('Style Preset:')}
        </span>

        {kind === 'cardboard' && (
          <>
            <button
              type="button"
              onClick={() => setStyle('fefco_0201')}
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'fefco_0201' ? 'is-active' : ''
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
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 cursor-pointer opacity-75 hover:opacity-100 ${
                style === 'fefco_0427' ? 'is-active' : ''
              }`}
            >
              FEFCO 0427 Mailer (Wave 2)
            </button>
            <button
              type="button"
              onClick={() => {
                setStyle('fefco_0300');
                toast(tr('FEFCO 0300 Telescope Box scheduled in Wave 2'), { icon: 'ℹ️' });
              }}
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 cursor-pointer opacity-75 hover:opacity-100 ${
                style === 'fefco_0300' ? 'is-active' : ''
              }`}
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
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'crate_cleated' ? 'is-active' : ''
              }`}
            >
              ISPM-15 Cleated Plywood Crate (4×4" Skids)
            </button>
            <button
              type="button"
              onClick={() => setStyle('crate_slatted')}
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'crate_slatted' ? 'is-active' : ''
              }`}
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
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'pallet_gma' ? 'is-active' : ''
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
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'pallet_eur' ? 'is-active' : ''
              }`}
            >
              EUR / EPAL 1 (1200×800mm)
            </button>
            <button
              type="button"
              onClick={() => setStyle('pallet_custom')}
              className={`liquid-control hig-touch-target px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                style === 'pallet_custom' ? 'is-active' : ''
              }`}
            >
              Custom Freight Skid
            </button>
          </>
        )}
      </div>

      {/* ── LIVE TELEMETRY RIBBON ── */}
      <div className="ps-telemetry-ribbon grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 px-4 sm:px-6 py-2.5 text-xs shrink-0 font-mono">
        {/* Usable Cavity */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Inner Cavity')}</span>
          <span className="font-bold text-[var(--lq-ink)] tabular-nums">
            {resolvedSpec.innerCm.w}×{resolvedSpec.innerCm.l}×{resolvedSpec.innerCm.h} cm
          </span>
          <span className="text-[10px] text-[var(--main-color)] font-semibold">
            {((resolvedSpec.innerCm.w * resolvedSpec.innerCm.l * resolvedSpec.innerCm.h) / 1000).toFixed(1)} L
          </span>
        </div>

        {/* Outer Footprint */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Outer Footprint')}</span>
          <span className="font-bold text-[var(--lq-ink)] tabular-nums">
            {resolvedSpec.outerCm.w}×{resolvedSpec.outerCm.l}×{resolvedSpec.outerCm.h} cm
          </span>
          <span className="text-[10px] text-amber-500 font-semibold">
            {((resolvedSpec.outerCm.w * resolvedSpec.outerCm.l * resolvedSpec.outerCm.h) / 1000000).toFixed(3)} m³
          </span>
        </div>

        {/* Tare Weight */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Tare Weight')}</span>
          <span className="font-bold text-[var(--lq-ink)] tabular-nums">{resolvedSpec.tareWeightKg} kg</span>
          <span className="text-[10px] text-[var(--lq-ink-secondary)]">{(resolvedSpec.tareWeightKg * 2.20462).toFixed(1)} lbs</span>
        </div>

        {/* Gross Weight */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Gross Weight')}</span>
          <span className="font-bold text-emerald-500 tabular-nums">{grossWeightKg} kg</span>
          <span className="text-[10px] text-[var(--lq-ink-secondary)]">{grossWeightLbs} lbs ({stagedItems.length} items)</span>
        </div>

        {/* Estimated Cost */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Material Cost')}</span>
          <span className="font-bold text-[var(--lq-ink)] tabular-nums">${resolvedSpec.estimatedCostMxn.toLocaleString()} MXN</span>
          <span className="text-[10px] text-[var(--main-color)] font-bold">${costUsd} USD</span>
        </div>

        {/* Standards Compliance */}
        <div className="ps-telemetry-card liquid-panel px-3 py-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-[var(--lq-ink-tertiary)] uppercase tracking-widest">{tr('Standard')}</span>
          <span className="font-bold text-[var(--lq-ink)]">
            {kind === 'cardboard' ? 'FEFCO 0201' : kind === 'crate' ? 'IPPC ISPM-15' : 'NWPCA GMA'}
          </span>
          <span className="text-[10px] text-emerald-500 font-bold">100% EXPORT READY</span>
        </div>
      </div>

      {/* ── MAIN WORKSPACE VIEWPORT ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4">
        {/* ── LEFT / MAIN: 3D HAIRLINE VIEWPORT (55% desktop) ── */}
        <div className={`flex-1 flex flex-col min-h-0 ${mobileTab === '3d' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="flex-1 min-h-[350px] relative rounded-2xl overflow-hidden">
            <Packaging3D
              spec={resolvedSpec}
              stagedItems={stagedItems}
              explodeProgress={explodeProgress}
              onExplodeChange={setExplodeProgress}
            />
          </div>
        </div>

        {/* ── RIGHT: PARAMETRIC INSPECTOR & 2D DIELINE / BOM CUT LIST (45% desktop) ── */}
        <div className={`ps-inspector liquid-panel w-full lg:w-[480px] xl:w-[540px] flex flex-col shrink-0 min-h-0 overflow-hidden ${
          mobileTab !== '3d' ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Right Header: Segmented Tabs */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--lq-surface-border)] shrink-0 gap-2">
            <div className="ps-seg-group liquid-panel flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightViewportTab('dieline')}
                className={`ps-seg-btn hig-touch-target px-3 py-1 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  rightViewportTab === 'dieline' ? 'is-active' : ''
                }`}
              >
                <Scissors size={12} />
                <span>2D Dieline</span>
              </button>
              <button
                type="button"
                onClick={() => setRightViewportTab('bom')}
                className={`ps-seg-btn hig-touch-target px-3 py-1 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  rightViewportTab === 'bom' ? 'is-active' : ''
                }`}
              >
                <FileText size={12} />
                <span>BOM Cut List</span>
              </button>
              <button
                type="button"
                onClick={() => setRightViewportTab('boxes')}
                className={`ps-seg-btn hig-touch-target px-3 py-1 rounded-[9px] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  rightViewportTab === 'boxes' ? 'is-active' : ''
                }`}
              >
                <Box size={12} />
                <span>Boxes.py</span>
              </button>
            </div>

            <span className="text-[11px] font-mono font-bold text-[var(--lq-ink-tertiary)]">
              {resolvedSpec.kind.toUpperCase()}
            </span>
          </div>

          {/* Form Inspector (Collapsible / Scrollable Top) */}
          <div className="p-4 border-b border-[var(--lq-surface-border)] flex flex-col gap-3.5 shrink-0">
            {/* Dimension Basis Toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-[var(--lq-ink-secondary)] uppercase tracking-widest">
                {tr('Dimension Input Basis:')}
              </span>
              <div className="ps-seg-group liquid-panel flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDimBasis('inside')}
                  className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[11px] font-semibold cursor-pointer ${
                    dimBasis === 'inside' ? 'is-active' : ''
                  }`}
                >
                  Inside Cavity
                </button>
                <button
                  type="button"
                  onClick={() => setDimBasis('outside')}
                  className={`ps-seg-btn hig-touch-target px-2.5 py-1 rounded-[8px] text-[11px] font-semibold cursor-pointer ${
                    dimBasis === 'outside' ? 'is-active' : ''
                  }`}
                >
                  Outside Footprint
                </button>
              </div>
            </div>

            {/* Width, Length, Height Steppers */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[var(--lq-ink-tertiary)] uppercase">Width (cm)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={inputW}
                  onChange={e => setInputW(Math.max(5, Number(e.target.value) || 10))}
                  className="ps-input hig-touch-target px-3 py-1.5 text-xs font-mono font-bold tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[var(--lq-ink-tertiary)] uppercase">Length (cm)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={inputL}
                  onChange={e => setInputL(Math.max(5, Number(e.target.value) || 10))}
                  className="ps-input hig-touch-target px-3 py-1.5 text-xs font-mono font-bold tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[var(--lq-ink-tertiary)] uppercase">Height (cm)</label>
                <input
                  type="number"
                  min="8"
                  max="300"
                  value={inputH}
                  onChange={e => setInputH(Math.max(5, Number(e.target.value) || 10))}
                  className="ps-input hig-touch-target px-3 py-1.5 text-xs font-mono font-bold tabular-nums"
                />
              </div>
            </div>

            {/* Material & Foam Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-[var(--lq-ink-tertiary)] uppercase">Board Material</label>
                <select
                  value={materialId}
                  onChange={e => setMaterialId(e.target.value)}
                  className="ps-input hig-touch-target px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
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
                <label className="text-[10px] font-mono text-[var(--lq-ink-tertiary)] uppercase">Foam Cushioning</label>
                <select
                  value={foamPaddingMm}
                  onChange={e => setFoamPaddingMm(Number(e.target.value))}
                  className="ps-input hig-touch-target px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
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
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {/* TAB A: 2D Dieline / Layout Diagram */}
            {rightViewportTab === 'dieline' && (
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--lq-ink-secondary)]">
                    {kind === 'cardboard' ? 'Unfolded Blank Geometry' : 'Panel Fabrication Diagram'}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadSvgFile(`${kind}_${style}_dieline`, dielineSvgString)}
                    className="liquid-control hig-touch-target flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer"
                  >
                    <Download size={12} className="text-[var(--main-color)]" />
                    <span>SVG</span>
                  </button>
                </div>

                <div className="ps-stage-frame liquid-panel flex-1 min-h-[280px] p-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={dielineDataUri}
                    alt="Packaging 2D Dieline"
                    className="max-w-full max-h-full object-contain pointer-events-auto rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* TAB B: Bill of Materials (BOM) Cut List */}
            {rightViewportTab === 'bom' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--lq-ink-secondary)]">Workshop Fabrication BOM</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => exportPackagingPdf(resolvedSpec, bomCutList)}
                      className="liquid-control hig-touch-target flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer"
                    >
                      <Download size={11} className="text-[var(--main-color)]" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPackagingXlsx(resolvedSpec, bomCutList)}
                      className="liquid-control hig-touch-target flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer"
                    >
                      <Download size={11} className="text-emerald-500" />
                      <span>XLSX</span>
                    </button>
                  </div>
                </div>

                {/* BOM Items Table */}
                <div className="ps-card liquid-panel overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-[var(--lq-surface-border)] text-[var(--lq-ink-tertiary)] text-[10px] uppercase">
                      <tr>
                        <th className="p-2.5">Part</th>
                        <th className="p-2.5">Qty</th>
                        <th className="p-2.5">Dimensions (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--lq-surface-border)] text-[var(--lq-ink-secondary)]">
                      {bomCutList.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-[var(--lq-ink)]">{item.part}</td>
                          <td className="p-2.5 text-[var(--main-color)] font-bold">{item.qty}×</td>
                          <td className="p-2.5 text-[var(--lq-ink-secondary)] text-[11px]">{item.dimsMm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary Card */}
                <div className="ps-card liquid-panel p-3.5 flex flex-col gap-1.5 text-[11px] font-mono">
                  {bomCutList.totalPlywoodM2 > 0 && (
                    <div className="flex justify-between text-[var(--lq-ink-secondary)]">
                      <span>Total Plywood Area:</span>
                      <span className="font-bold text-[var(--lq-ink)]">{bomCutList.totalPlywoodM2} m²</span>
                    </div>
                  )}
                  {bomCutList.totalLumberM > 0 && (
                    <div className="flex justify-between text-[var(--lq-ink-secondary)]">
                      <span>Total HT Lumber:</span>
                      <span className="font-bold text-[var(--lq-ink)]">{bomCutList.totalLumberM} linear meters</span>
                    </div>
                  )}
                  {bomCutList.totalCardboardM2 > 0 && (
                    <div className="flex justify-between text-[var(--lq-ink-secondary)]">
                      <span>Corrugated Blank Area:</span>
                      <span className="font-bold text-[var(--lq-ink)]">{bomCutList.totalCardboardM2} m²</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[var(--lq-ink-secondary)] pt-1.5 border-t border-[var(--lq-surface-border)]">
                    <span>Estimated Material Cost:</span>
                    <span className="font-bold text-emerald-500">${resolvedSpec.estimatedCostMxn.toLocaleString()} MXN</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB C: Boxes.py Laser Divider Recipe */}
            {rightViewportTab === 'boxes' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--lq-ink-secondary)]">Boxes.py Workshop Laser Recipe</span>
                  <button
                    type="button"
                    onClick={handleCopyBoxesRecipe}
                    className="liquid-control hig-touch-target flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer"
                  >
                    {copiedRecipe ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="text-emerald-500" />}
                    <span>{copiedRecipe ? 'Copied!' : 'Copy CLI'}</span>
                  </button>
                </div>

                <div className="ps-code-well p-3.5 font-mono text-[11px] text-emerald-500 overflow-x-auto custom-scrollbar">
                  <pre>{generateBoxesCliRecipe(resolvedSpec)}</pre>
                </div>

                <div className="ps-card liquid-panel p-3.5 flex flex-col gap-1 text-[11px] text-[var(--lq-ink-secondary)]">
                  <span className="font-bold text-[var(--lq-ink)]">Workshop Laser Note:</span>
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
      <div className="ps-mobile-nav lg:hidden flex items-center justify-around gap-1.5 py-2 px-4 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('3d')}
          className={`ps-seg-btn hig-touch-target flex-1 py-1.5 rounded-xl text-xs font-bold text-center cursor-pointer ${
            mobileTab === '3d' ? 'is-active' : ''
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
          className={`ps-seg-btn hig-touch-target flex-1 py-1.5 rounded-xl text-xs font-bold text-center cursor-pointer ${
            mobileTab === '2d' ? 'is-active' : ''
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
          className={`ps-seg-btn hig-touch-target flex-1 py-1.5 rounded-xl text-xs font-bold text-center cursor-pointer ${
            mobileTab === 'bom' ? 'is-active' : ''
          }`}
        >
          Cut List
        </button>
      </div>

      {/* ── BOTTOM ACTION FOOTER ── */}
      <footer className="ps-footer flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportPackagingPdf(resolvedSpec, bomCutList)}
            className="liquid-control hig-touch-target px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={13} className="text-[var(--main-color)]" />
            <span className="hidden sm:inline">{tr('Export PDF Spec')}</span>
            <span className="sm:hidden">PDF</span>
          </button>
          <button
            type="button"
            onClick={() => exportPackagingXlsx(resolvedSpec, bomCutList)}
            className="liquid-control hig-touch-target px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={13} className="text-emerald-500" />
            <span className="hidden sm:inline">{tr('Export XLSX BOM')}</span>
            <span className="sm:hidden">XLSX</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveContainer}
            className="ps-btn-primary hig-touch-target px-5 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
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
    <div className="ps-overlay fixed inset-0 z-[600] overflow-hidden">
      <div className="ps-scrim absolute inset-0" onClick={onClose} />
      <div className="ps-modal-shell relative z-10">
        {content}
      </div>
    </div>
  );
};
