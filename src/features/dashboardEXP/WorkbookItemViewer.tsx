import React, { useState } from 'react';
import { ItemThumbnail } from '../../components/ItemThumbnail';
import { vendors } from '../../lib/consts';
import { getTextColorForBg, numberToCypher, calculateCodesAndPrices } from '../../lib/utils';

export const WorkbookItemViewer = ({ item, vendor, exchangeRate, workbookPrefix }: { item: any, vendor: string, exchangeRate: number, workbookPrefix: string }) => {
    const [expanded, setExpanded] = useState(false);
    
    const vendorColor = vendors[vendor as keyof typeof vendors]?.color || '#888';
    
    const [itemColor, objectType] = item['Description Color - Object Type']?.split(' - ') || ['', ''];

    const calculated = calculateCodesAndPrices({
        price: item['Per piece MXN$'],
        itemId: item['#ID'], // Use #ID for itemId
        itemNumber: item['TAG-ID'], // Use TAG-ID for itemNumber
    }, exchangeRate, workbookPrefix);

    const weightKg = parseFloat(item['KG']) || 0;
    const weightLbs = parseFloat(item['POUNDS']) || (weightKg * 2.20462); // Use POUNDS if available, else calculate
    const widthCm = parseFloat(item['W CM']) || 0;
    const heightCm = parseFloat(item['H CM']) || 0;
    const depthCm = parseFloat(item['D CM']) || 0;
    const widthIn = parseFloat(item['W Inches']) || (widthCm / 2.54);
    const heightIn = parseFloat(item['H Inches']) || (heightCm / 2.54);
    const depthIn = parseFloat(item['D Incbes']) || (depthCm / 2.54);

    // Dynamic grid template columns for the main project-box
    // Adding more columns for #ID, Date, Q, and better description display
    const gridTemplateColumns = '128px 1.5fr 2fr 1.5fr'; 

    return (
        <div className="project-box-wrapper">
            <div className="project-box" style={{ gridTemplateColumns, gap: '1rem', alignItems: 'center' }} onClick={() => setExpanded(!expanded)}>
                {/* Thumbnail and Vendor Tag */}
                <div className="relative h-20">
                    <ItemThumbnail 
                        imageUrl={null} // imageUrl is not available in the workbook data
                        color={itemColor}
                        shape={objectType}
                        material={objectType} // Use objectType for material
                    />
                    <div 
                        className="vendor-tag !text-xs !px-2 !py-1 absolute bottom-0 right-0 !rounded-none rounded-tl-lg z-10" 
                        style={{ backgroundColor: vendorColor, color: getTextColorForBg(vendorColor) }}
                    >
                        {vendor}
                    </div>
                </div>

                {/* Main Item Information (ID, Date, Quantity, Description) */}
                <div className="box-content-line gap-1 overflow-hidden">
                    <p className="text-xs font-semibold">#{item['#ID'] || '-'} <span className="opacity-60 ml-2">{item['Date'] || '-'}</span></p>
                    <p className="text-sm font-bold truncate">{objectType || '-'}</p>
                    <p className="text-xs truncate italic opacity-60">{item['Description Color - Object Type'] || '-'}</p>
                    <p className="text-xs font-semibold mt-1">Qty: {item['Q'] || '0'}</p>
                </div>

                {/* Codes and Barcode */}
                <div className="box-content-line gap-1 overflow-hidden">
                     <div className="codes-panel flex gap-4 text-xs">
                        <div className="flex items-baseline gap-1.5"><strong>AQC:</strong> <span>{calculated.bookAqCode || item['AQC'] || '-'}</span></div>
                        <div className="flex items-baseline gap-1.5"><strong>LC:</strong> <span>{calculated.bookLandCode || item['LC'] || '-'}</span></div>
                    </div>
                    <p className="font-mono text-base font-bold opacity-90 pt-1" title="Barcode">SKU: {item['TAG-ID'] || '-'}</p>
                    <p className="font-mono text-xs opacity-70" title="Generated Barcode">{calculated.bookBardcode || 'N/A'}</p>
                </div>

                {/* Dimensions Panel */}
                <div className="dimensions-panel">
                    <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 text-xs">
                        <strong></strong><span className="text-right opacity-70">Metric</span><span className="text-right opacity-70">Imperial</span>
                        <strong>W:</strong> <span className="text-right">{widthCm > 0 ? `${widthCm.toFixed(1)}cm` : '-'}</span> <span className="text-right">{widthIn > 0 ? `${widthIn.toFixed(1)}"` : '-'}</span>
                        <strong>H:</strong> <span className="text-right">{heightCm > 0 ? `${heightCm.toFixed(1)}cm` : '-'}</span> <span className="text-right">{heightIn > 0 ? `${heightIn.toFixed(1)}"` : '-'}</span>
                        <strong>D:</strong> <span className="text-right">{depthCm > 0 ? `${depthCm.toFixed(1)}cm` : '-'}</span> <span className="text-right">{depthIn > 0 ? `${depthIn.toFixed(1)}"` : '-'}</span>
                        <strong>Wt:</strong> <span className="text-right">{weightKg > 0 ? `${weightKg.toFixed(1)}kg` : '-'}</span> <span className="text-right">{weightLbs > 0 ? `${weightLbs.toFixed(1)}lb`: '-'}</span>
                    </div>
                </div>
            </div>

            {/* Expanded Details (Prices) */}
            {expanded && (
                <div className="expanded-details price-panel">
                    <div className="price-total price-mxn">
                        <span className="label">Cost (MXN) / piece</span>
                        <span className="value">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(item['Per piece MXN$'] || '0'))}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Total MXN</span>
                        <span className="value">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(item['TOTAL PESOS'] || '0'))}</span>
                    </div>
                    <div className="price-total price-landed">
                        <span className="label">Landed (USD) / piece</span>
                        <span className="value">{calculated.bookLanded !== '-' ? `$${calculated.bookLanded}`: '-'}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Retail (USD) / piece</span>
                        <span className="value">{calculated.bookRetail !== '-' ? `$${calculated.bookRetail}`: '-'}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Acq. Price (USD) / piece</span>
                        <span className="value">{item['AQ'] !== undefined ? `$${parseFloat(item['AQ']).toFixed(2)}` : '-'}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Acq. Price Rounded (USD)</span>
                        <span className="value">{item['AQ ROUND'] !== undefined ? `$${parseFloat(item['AQ ROUND']).toFixed(2)}` : '-'}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Landed Price (USD) / piece</span>
                        <span className="value">{item['LND'] !== undefined ? `$${parseFloat(item['LND']).toFixed(2)}` : '-'}</span>
                    </div>
                    <div className="price-total">
                        <span className="label">Landed Price Rounded (USD)</span>
                        <span className="value">{item['LND ROUND'] !== undefined ? `$${parseFloat(item['LND ROUND']).toFixed(2)}` : '-'}</span>
                    </div>
                     <div className="price-total">
                        <span className="label">Total USD</span>
                        <span className="value">{item['TOTAL USD'] !== undefined ? `$${parseFloat(item['TOTAL USD']).toFixed(2)}` : '-'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}