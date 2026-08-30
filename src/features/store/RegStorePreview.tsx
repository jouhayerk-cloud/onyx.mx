import React, { useState, useMemo } from 'react';
import { useAtomValue } from 'jotai/react';
import { storeInventoryAtom, inventoryAtom } from '../../lib/atoms';
import { normalizeInventoryData, getCleanImageUrl, calculateCodesAndPrices, cmToImperial } from '../../lib/utils';
import { RARE_EARTH_LOGO } from '../../lib/rareEarthLogo';
import { 
    Search, Mic, User, ShoppingCart, Phone, MapPin, ChevronRight, ChevronLeft, 
    Plus, Minus, Check, Sparkles, ArrowLeft, Grid, Box, Ruler, Scale, 
    Truck, Info, ShieldCheck, Tag, ExternalLink 
} from 'lucide-react';
import toast from 'react-hot-toast';

export const RegStorePreview: React.FC = () => {
    // Inventory state
    const storeItems = useAtomValue(storeInventoryAtom);
    const allInventory = useAtomValue(inventoryAtom);
    const items = storeItems && storeItems.length > 0 ? storeItems : allInventory;

    // UI state
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [onlyGenerated, setOnlyGenerated] = useState(true);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [activeTab, setActiveTab] = useState<'desc' | 'specs'>('desc');
    const [qty, setQty] = useState(1);

    // Filter helper: check if an item has AI generated content
    const isFullyGenerated = (item: any) => {
        const norm = normalizeInventoryData(item.data);
        const hasTitle = Boolean(norm.generatedDescription || norm.description || item.data.title || item.data.generatedTitle || item.data.generated_title);
        const hasBody = Boolean(norm.detailedDescription || item.data.detailedDescription || item.data.detailed_description || item.data.marketing_description || norm.generatedDescription);
        const hasImages = Boolean(item.images && item.images.length > 0);
        const hasSpatial = Boolean(norm.spatialBoxes2d || norm.spatialBoxes3d || norm.spatialMasks || (norm.lengthCm && norm.widthCm && norm.heightCm));
        return hasTitle && hasBody && hasImages && hasSpatial;
    };

    const generatedCount = useMemo(() => {
        return items.filter(isFullyGenerated).length;
    }, [items]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const norm = normalizeInventoryData(item.data);
            if (onlyGenerated && !isFullyGenerated(item)) return false;
            
            if (selectedCategory !== 'All' && selectedCategory !== 'New Arrivals') {
                const cat = (item.data.category || norm.workbook || norm.shape || '').toLowerCase();
                if (!cat.includes(selectedCategory.toLowerCase())) return false;
            }

            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase();
                const title = (item.data.title || norm.description || norm.generatedDescription || '').toLowerCase();
                const sku = (item.codes?.bookBarcodeDisplay || norm.sku || item.id || '').toLowerCase();
                const color = (norm.color || norm.material || '').toLowerCase();
                if (!title.includes(q) && !sku.includes(q) && !color.includes(q)) return false;
            }

            return true;
        });
    }, [items, onlyGenerated, selectedCategory, searchTerm]);

    const handleSelectCard = (item: any) => {
        setSelectedItem(item);
        setActiveImageIndex(0);
        setActiveTab('desc');
        setQty(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAddToCart = () => {
        const norm = selectedItem ? normalizeInventoryData(selectedItem.data) : {};
        const titleStr = selectedItem?.data?.title || norm.description || norm.generatedDescription || 'Onyx Luminary';
        toast.success(`Added ${qty}x "${titleStr}" to Simulated Cart!`, {
            icon: '🛒',
            style: {
                borderRadius: '10px',
                background: '#111827',
                color: '#fff',
            },
        });
    };

    // PDP Data computation
    const pdpData = useMemo(() => {
        if (!selectedItem) return null;
        const norm = normalizeInventoryData(selectedItem.data);
        const codes = calculateCodesAndPrices(selectedItem.data, 0, selectedItem.id);
        const titleStr = selectedItem.data.title || norm.description || norm.generatedDescription || `${norm.shape || 'Onyx'} Piece`;
        const skuStr = selectedItem.codes?.bookBarcodeDisplay || codes.tagId || norm.sku || 'OL-Aqua';
        const priceDollars = Math.round(codes.retailPrice || 3660).toLocaleString();
        const priceNum = codes.retailPrice || 3660;
        const images = selectedItem.images || [];
        const currentImgUrl = images.length > 0 ? getCleanImageUrl(images[activeImageIndex]) : '/RareEarthGallery.png';
        const catStr = selectedItem.data.category || norm.workbook || norm.shape || 'Lighting';

        // Dimensions
        const wCm = parseFloat(norm.widthCm) || 0;
        const hCm = parseFloat(norm.heightCm) || 0;
        const dCm = parseFloat(norm.lengthCm) || 0;
        const wtKg = parseFloat(norm.weightKg) || 0;
        const dimsImp = (wCm && hCm && dCm) ? cmToImperial(wCm, hCm, dCm) : 'Dimensions TBD';

        return {
            norm, codes, titleStr, skuStr, priceDollars, priceNum, images, 
            currentImgUrl, catStr, wCm, hCm, dCm, wtKg, dimsImp
        };
    }, [selectedItem, activeImageIndex]);

    const categories = [
        'Gemstone Jewelry', 'Crystals & Minerals', 'Crystal Decor', 
        'Gift Shop', 'Statement Art', 'Sound & Wellness', 'Fountains', 'New Arrivals'
    ];

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans flex flex-col selection:bg-red-100 selection:text-red-900">
            {/* Top Store Header */}
            <header className="border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-md z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
                    {/* Brand Logo */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedItem(null)}>
                        <img 
                            src={RARE_EARTH_LOGO} 
                            alt="Rare Earth Gallery" 
                            className="h-12 w-auto object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/REG_Logo.png'; }}
                        />
                    </div>

                    {/* Search Bar */}
                    <div className="flex-1 max-w-xl relative hidden md:block">
                        <div className="relative flex items-center">
                            <Search className="absolute left-4 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search for c..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-100 border border-transparent focus:border-gray-300 rounded-full py-2.5 pl-12 pr-12 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:bg-white transition-all"
                            />
                            <Mic className="absolute right-4 w-5 h-5 text-gray-500 cursor-pointer hover:text-gray-900 transition-colors" />
                        </div>
                    </div>

                    {/* Account & Cart Icons */}
                    <div className="flex items-center space-x-6 text-gray-700">
                        <button className="hover:text-black transition-colors flex items-center gap-1.5" title="User Profile">
                            <User className="w-6 h-6 stroke-[1.5]" />
                        </button>
                        <button onClick={handleAddToCart} className="hover:text-black transition-colors relative flex items-center" title="Shopping Cart">
                            <ShoppingCart className="w-6 h-6 stroke-[1.5]" />
                            <span className="absolute -top-1.5 -right-2 bg-red-600 text-white font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                                {qty > 1 ? qty : 2}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Secondary Navigation Bar */}
                <div className="bg-white border-t border-gray-100 overflow-x-auto no-scrollbar">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between whitespace-nowrap text-sm font-medium h-12">
                        <nav className="flex items-center space-x-6 pr-6">
                            <button 
                                onClick={() => { setSelectedCategory('All'); setSelectedItem(null); }}
                                className={`transition-colors hover:text-black ${selectedCategory === 'All' ? 'text-black font-bold underline underline-offset-8' : 'text-gray-700'}`}
                            >
                                All Stone Catalog
                            </button>
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => { setSelectedCategory(cat); setSelectedItem(null); }}
                                    className={`transition-colors flex items-center gap-1 hover:text-black ${
                                        cat === 'New Arrivals' ? 'text-red-600 font-semibold hover:text-red-700' : 
                                        selectedCategory === cat ? 'text-black font-bold underline underline-offset-8' : 'text-gray-700'
                                    }`}
                                >
                                    {cat}
                                    {cat !== 'New Arrivals' && cat !== 'Fountains' && <span className="text-xs text-gray-400">∨</span>}
                                </button>
                            ))}
                        </nav>

                        <div className="flex items-center space-x-6 pl-4 border-l border-gray-200 py-1">
                            <a href="#directions" onClick={(e) => { e.preventDefault(); toast.info('Rare Earth Gallery: Cave Creek, AZ 85331'); }} className="text-gray-600 hover:text-black transition-colors flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> Directions
                            </a>
                            <a href="tel:4805754360" className="bg-gray-900 hover:bg-gray-800 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm">
                                <Phone className="w-3 h-3 fill-current" /> Call Us
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            {/* Onyx.mx-REG Value-Add Bar */}
            <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white py-3 px-4 sm:px-6 lg:px-8 shadow-inner">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                        <span className="bg-red-600 text-white px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider text-[10px]">
                            Onyx.mx-REG
                        </span>
                        <span className="text-gray-300 font-medium">Rare Earth Gallery Store UI Clone & AI Preview</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setOnlyGenerated(!onlyGenerated)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-semibold ${
                                onlyGenerated 
                                ? 'bg-amber-400/20 border-amber-400 text-amber-300 hover:bg-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.2)]' 
                                : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            {onlyGenerated ? `100% AI Generated Content (${generatedCount})` : `All Inventory (${items.length})`}
                        </button>

                        {selectedItem && (
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="flex items-center gap-1 px-3 py-1 rounded-full bg-white text-gray-900 font-bold hover:bg-gray-100 transition-colors shadow-sm"
                            >
                                <Grid className="w-3.5 h-3.5" /> Back to Catalog Grid
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedItem && pdpData ? (
                    /* --- PRODUCT DETAIL PAGE (PDP) CLONE --- */
                    <div className="animate-fadeIn">
                        {/* Breadcrumbs */}
                        <nav className="flex items-center text-xs text-gray-500 mb-6 space-x-2">
                            <a href="#home" onClick={(e) => { e.preventDefault(); setSelectedItem(null); }} className="hover:text-black">Home</a>
                            <span>›</span>
                            <a href="#cat" onClick={(e) => { e.preventDefault(); setSelectedItem(null); }} className="hover:text-black">{pdpData.catStr}</a>
                            <span>›</span>
                            <span className="text-gray-800 font-medium truncate max-w-xs sm:max-w-md">{pdpData.titleStr}</span>
                        </nav>

                        {/* PDP Two-Column Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
                            
                            {/* Left Column: Image Viewer & Tabs (7 cols) */}
                            <div className="lg:col-span-7 flex flex-col space-y-6">
                                {/* Big Square Image Viewer */}
                                <div className="aspect-square w-full bg-black rounded-lg overflow-hidden relative flex items-center justify-center p-8 shadow-2xl border border-gray-800 group">
                                    <img
                                        src={pdpData.currentImgUrl}
                                        alt={pdpData.titleStr}
                                        className="max-h-full max-w-full object-contain drop-shadow-[0_20px_35px_rgba(255,255,255,0.1)] transition-transform duration-500 group-hover:scale-105"
                                    />

                                    {/* Navigation Arrows */}
                                    {pdpData.images.length > 1 && (
                                        <>
                                            <button
                                                onClick={() => setActiveImageIndex((prev) => (prev - 1 + pdpData.images.length) % pdpData.images.length)}
                                                className="absolute left-4 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-gray-900 flex items-center justify-center shadow-md transition-all hover:scale-110"
                                                title="Previous Image"
                                            >
                                                <ChevronLeft className="w-6 h-6 stroke-[2]" />
                                            </button>
                                            <button
                                                onClick={() => setActiveImageIndex((prev) => (prev + 1) % pdpData.images.length)}
                                                className="absolute right-4 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-gray-900 flex items-center justify-center shadow-md transition-all hover:scale-110"
                                                title="Next Image"
                                            >
                                                <ChevronRight className="w-6 h-6 stroke-[2]" />
                                            </button>
                                        </>
                                    )}

                                    {/* Image Counter Pill */}
                                    <div className="absolute bottom-4 right-4 bg-white text-gray-900 text-xs font-bold px-3 py-1 rounded-full shadow-lg font-mono">
                                        {activeImageIndex + 1} / {Math.max(1, pdpData.images.length)}
                                    </div>

                                    {/* AI Background Removed Badge */}
                                    {pdpData.norm.generatedPngUrl && (
                                        <div className="absolute top-4 left-4 bg-gray-900/90 text-amber-300 text-[11px] font-semibold px-3 py-1 rounded-full border border-gray-700 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> WebP Background Removed
                                        </div>
                                    )}
                                </div>

                                {/* Thumbnails Grid */}
                                {pdpData.images.length > 1 && (
                                    <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
                                        {pdpData.images.map((img: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => setActiveImageIndex(idx)}
                                                className={`relative w-20 h-20 rounded-md overflow-hidden bg-black flex-shrink-0 border-2 transition-all ${
                                                    activeImageIndex === idx ? 'border-white ring-2 ring-black shadow-md scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                                                }`}
                                            >
                                                <img src={getCleanImageUrl(img)} alt={`Thumbnail ${idx+1}`} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Tabs Section (Description / Specifications) */}
                                <div className="border-t border-gray-200 pt-6">
                                    <div className="flex items-center space-x-8 border-b border-gray-200 mb-6">
                                        <button
                                            onClick={() => setActiveTab('desc')}
                                            className={`pb-3 font-serif text-lg font-semibold transition-colors relative ${
                                                activeTab === 'desc' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        >
                                            Description
                                            {activeTab === 'desc' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"></span>}
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('specs')}
                                            className={`pb-3 font-serif text-lg font-semibold transition-colors relative ${
                                                activeTab === 'specs' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        >
                                            Specifications & Minerals
                                            {activeTab === 'specs' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"></span>}
                                        </button>
                                    </div>

                                    {/* Tab Content */}
                                    {activeTab === 'desc' ? (
                                        <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700">
                                            {pdpData.norm.detailedDescription || pdpData.norm.generatedDescription ? (
                                                <div dangerouslySetInnerHTML={{ __html: pdpData.norm.detailedDescription || pdpData.norm.generatedDescription }} />
                                            ) : (
                                                <p>
                                                    Elevate your space with this striking {pdpData.titleStr}, a sculptural piece that merges natural stone beauty with functional elegance. Crafted from genuine Mexican stone, this pedestal features clean geometric lines and a luminous quality that transforms any room into a sanctuary of calm, sophisticated light. Perfect for entryways, meditation spaces, or as a statement accent in contemporary interiors, this handcrafted piece brings earthy luxury and ambient warmth to your home.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 space-y-4 text-sm">
                                            <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-3">
                                                <span className="text-gray-500 font-medium flex items-center gap-2"><Ruler className="w-4 h-4 text-gray-400" /> Dimensions:</span>
                                                <span className="font-semibold text-gray-900">{pdpData.dimsImp} ({pdpData.wCm} x {pdpData.hCm} x {pdpData.dCm} cm)</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-3">
                                                <span className="text-gray-500 font-medium flex items-center gap-2"><Scale className="w-4 h-4 text-gray-400" /> Weight:</span>
                                                <span className="font-semibold text-gray-900">{pdpData.wtKg ? `${pdpData.wtKg} kg` : 'Weight TBD'}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-3">
                                                <span className="text-gray-500 font-medium flex items-center gap-2"><Box className="w-4 h-4 text-gray-400" /> Material & Origin:</span>
                                                <span className="font-semibold text-gray-900">{pdpData.norm.material || 'Natural Onyx'} · Sonora, Mexico</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <span className="text-gray-500 font-medium flex items-center gap-2"><Tag className="w-4 h-4 text-gray-400" /> AI Classification:</span>
                                                <span className="font-semibold text-gray-900">{pdpData.norm.generatedType || pdpData.catStr}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Product Info & Buy Box (5 cols) */}
                            <div className="lg:col-span-5 flex flex-col">
                                <div className="sticky top-28 bg-white p-2">
                                    {/* Product Title */}
                                    <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight leading-snug mb-2">
                                        {pdpData.titleStr}
                                    </h1>

                                    {/* SKU */}
                                    <p className="text-xs text-gray-500 font-mono mb-6">
                                        SKU: {pdpData.skuStr}
                                    </p>

                                    {/* Price Display */}
                                    <div className="flex items-baseline gap-1 mb-2">
                                        <span className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                                            ${pdpData.priceDollars}
                                        </span>
                                        <span className="text-lg font-bold text-gray-900 align-top">00</span>
                                    </div>

                                    {/* Shipping & Financing Text */}
                                    <p className="text-xs text-gray-600 underline cursor-pointer mb-2">
                                        Shipping calculated at checkout.
                                    </p>
                                    <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                                        From <span className="font-bold text-gray-900">${Math.max(15, Math.round(pdpData.priceNum / 20))}/mo</span> or 0% APR with <span className="font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded text-[11px]">shop pay</span>. <a href="#sample" onClick={(e) => { e.preventDefault(); toast('0% APR financing available up to 24 mos.'); }} className="underline font-medium hover:text-black">View sample plans</a>
                                    </p>

                                    <hr className="border-gray-200 mb-6" />

                                    {/* Quantity Selector & Add to Cart Row */}
                                    <div className="flex items-center gap-4 mb-6">
                                        {/* QTY Pill Box */}
                                        <div className="flex items-center border border-gray-300 rounded-full px-5 py-3.5 space-x-5 text-gray-900 font-semibold shadow-sm select-none bg-white">
                                            <button onClick={() => setQty(Math.max(1, qty - 1))} className="hover:text-gray-500 transition-colors text-lg font-bold">
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="text-sm font-bold min-w-[12px] text-center">{qty}</span>
                                            <button onClick={() => setQty(qty + 1)} className="hover:text-gray-500 transition-colors text-lg font-bold">
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Add to Cart Button */}
                                        <button
                                            onClick={handleAddToCart}
                                            className="flex-1 bg-[#222222] hover:bg-black text-white font-bold py-4 px-8 rounded-full shadow-lg hover:shadow-xl transition-all text-xs tracking-widest uppercase flex items-center justify-center gap-2"
                                        >
                                            ADD TO CART
                                        </button>
                                    </div>

                                    {/* Buy It Now Button */}
                                    <button
                                        onClick={() => toast.success('Simulated Express Buy It Now!', { icon: '⚡' })}
                                        className="w-full bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold py-3.5 px-8 rounded-full shadow-md transition-all text-xs tracking-widest uppercase mb-8"
                                    >
                                        BUY IT NOW WITH SHOP PAY
                                    </button>

                                    {/* Pickup Info Block */}
                                    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200 flex items-start gap-3 text-xs text-gray-700">
                                        <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold">
                                            ✓
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <p className="font-semibold text-gray-900">
                                                Pickup available at <span className="font-bold">Rare Earth Gallery</span>
                                            </p>
                                            <p className="text-gray-500">Usually ready in 24 hours</p>
                                            <a 
                                                href="#info" 
                                                onClick={(e) => { e.preventDefault(); toast.info('6401 E Cave Creek Rd, Cave Creek, AZ 85331'); }} 
                                                className="text-gray-700 font-semibold underline block pt-1 hover:text-black"
                                            >
                                                View store information
                                            </a>
                                        </div>
                                    </div>

                                    {/* AI Confidence & Metadata Footer overlay */}
                                    <div className="mt-8 pt-6 border-t border-gray-100 space-y-2 text-[11px] text-gray-500">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> AI Metadata Verified:</span>
                                            <span className="font-mono text-gray-700 font-bold">100% Complete</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Spatial Axonometric Box:</span>
                                            <span className="font-mono text-gray-700">{pdpData.norm.spatialBoxes2d ? 'Generated' : 'Manual Metric'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                ) : (
                    /* --- CATALOG GRID VIEW --- */
                    <div className="animate-fadeIn space-y-6">
                        {/* Header Title for Grid */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-6">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight">
                                    {selectedCategory === 'All' ? 'Natural Stone & Onyx Collection' : selectedCategory}
                                </h2>
                                <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                    Showing {filteredItems.length} museum-grade handcrafted stone items ready for digital storefronts.
                                </p>
                            </div>
                        </div>

                        {/* Product Grid */}
                        {filteredItems.length === 0 ? (
                            <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-gray-700">No matching items found</h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                                    {onlyGenerated 
                                        ? 'No items currently match the 100% AI Generated filter with this category or search term.'
                                        : 'Try clearing your search query or selecting a different category tab.'}
                                </p>
                                {onlyGenerated && (
                                    <button 
                                        onClick={() => setOnlyGenerated(false)}
                                        className="mt-6 bg-gray-900 text-white px-5 py-2.5 rounded-full text-xs font-bold hover:bg-gray-800 transition-colors shadow-sm"
                                    >
                                        Show All Inventory Items ({items.length})
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                                {filteredItems.map((item: any, idx: number) => {
                                    const norm = normalizeInventoryData(item.data);
                                    const codes = calculateCodesAndPrices(item.data, 0, item.id);
                                    const title = item.data.title || norm.description || norm.generatedDescription || `${norm.shape || 'Onyx'} Piece`;
                                    const price = Math.round(codes.retailPrice || 3660).toLocaleString();
                                    const imgUrl = item.images && item.images.length > 0 ? getCleanImageUrl(item.images[0]) : '/RareEarthGallery.png';

                                    return (
                                        <div
                                            key={item.id || idx}
                                            onClick={() => handleSelectCard(item)}
                                            className="group cursor-pointer flex flex-col bg-white rounded-lg overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-xl transition-all duration-300"
                                        >
                                            {/* Square Image Box */}
                                            <div className="aspect-square w-full bg-black relative overflow-hidden flex items-center justify-center p-6 border-b border-gray-100">
                                                <img
                                                    src={imgUrl}
                                                    alt={title}
                                                    className="max-h-full max-w-full object-contain drop-shadow-md transition-transform duration-500 group-hover:scale-105"
                                                />

                                                {/* AI Verified Pill */}
                                                {isFullyGenerated(item) && (
                                                    <div className="absolute top-2.5 left-2.5 bg-gray-900/80 text-amber-300 text-[9px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm border border-gray-700 flex items-center gap-1 shadow-sm">
                                                        <Sparkles className="w-2.5 h-2.5 text-amber-400" /> 100% AI Ready
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info Area */}
                                            <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                                                <div>
                                                    <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                                                        {item.codes?.bookBarcodeDisplay || codes.tagId || norm.sku || 'OL-Aqua'}
                                                    </p>
                                                    <h3 className="font-serif font-bold text-gray-900 text-sm sm:text-base group-hover:text-amber-800 transition-colors line-clamp-2 mt-0.5 leading-snug">
                                                        {title}
                                                    </h3>
                                                </div>

                                                <div className="pt-2 flex items-center justify-between border-t border-gray-50">
                                                    <div className="text-lg font-extrabold text-gray-900 tracking-tight">
                                                        ${price}<span className="text-xs align-super">00</span>
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-gray-900 group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
                                                        View Details ›
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Store Footer Clone */}
            <footer className="bg-gray-900 text-white mt-auto py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-xs text-gray-400">
                    <div className="space-y-3">
                        <img src={RARE_EARTH_LOGO} alt="REG Logo" className="h-10 w-auto brightness-200 grayscale" onError={(e) => { (e.target as HTMLImageElement).src = '/REG_Logo.png'; }} />
                        <p className="leading-relaxed">
                            The 8th Wonder of the World. Offering museum-grade mineral specimens, gemstone jewelry, and custom stone furnishings.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-white font-bold uppercase tracking-wider mb-3 text-sm">Gallery Location</h4>
                        <p>6401 E. Cave Creek Rd.</p>
                        <p>Cave Creek, AZ 85331</p>
                        <p className="mt-2">Phone: (480) 575-4360</p>
                    </div>
                    <div>
                        <h4 className="text-white font-bold uppercase tracking-wider mb-3 text-sm">Customer Care</h4>
                        <ul className="space-y-1.5">
                            <li><a href="#shipping" onClick={(e) => e.preventDefault()} className="hover:text-white transition-colors">Shipping & Delivery</a></li>
                            <li><a href="#returns" onClick={(e) => e.preventDefault()} className="hover:text-white transition-colors">Return Policy</a></li>
                            <li><a href="#faq" onClick={(e) => e.preventDefault()} className="hover:text-white transition-colors">Frequently Asked Questions</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-bold uppercase tracking-wider mb-3 text-sm">Onyx.mx AI Engine</h4>
                        <p className="leading-relaxed">
                            Powered by Google DeepMind Advanced Agentic Coding. Generating automated spatial masks, background removal, and marketing copy for natural stone artifacts.
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-amber-400 font-mono text-[11px]">
                            <Sparkles className="w-4 h-4" /> v2.4-REG Production Preview
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};
