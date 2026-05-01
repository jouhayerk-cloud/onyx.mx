import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';

interface LabelVisualsProps {
    item: {
        normData: {
            lengthCm?: string | number;
            widthCm?: string | number;
            heightCm?: string | number;
            shape?: string;
            shortDescription?: string;
            color?: string;
            material?: string;
        };
        codes: {
            bookAqCode?: string;
            bookLandCode?: string;
            bookBarcode: string;
        };
    };
    scale?: number;
    className?: string;
}

export const NFCTagCard = ({ item, scale = 1, className = '' }: LabelVisualsProps) => {
    const { normData, codes } = item;
    
    // Format dimensions
    const dims = [normData.lengthCm, normData.widthCm, normData.heightCm].filter(Boolean).join('*');
    const dimsStr = dims ? `${dims} CM` : '';
    
    // Retail Tag (ACQ-Workbook-Retail)
    const retailTag = `${codes.bookAqCode || '??'}-${codes.bookLandCode || '???????'}`;

    return (
        <div 
            className={`w-[400px] h-[250px] bg-white text-black p-5 flex flex-col relative font-sans select-none ${className}`}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
        >
            <div className="absolute left-0 top-0 bottom-0 w-4 transition-all duration-700" style={{ backgroundColor: codes.vendorColor || 'var(--main-color)' }} />
            
            <div className="flex-1 ml-6 flex flex-col">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1.5 flex-1">
                        <span className="text-3xl font-black tracking-tighter leading-none mt-2" style={{ color: codes.vendorColor || 'inherit' }}>{retailTag}</span>
                        <span className="text-lg font-black leading-tight mt-2 uppercase tracking-tight truncate max-w-[240px]">{normData.shape} {normData.shortDescription}</span>
                        <span className="text-sm font-bold leading-tight opacity-60 uppercase truncate max-w-[240px]">{normData.color} / {normData.material}</span>
                        <span className="text-sm font-black leading-tight mt-2 tracking-widest">{dimsStr}</span>
                    </div>
                    <div className="flex flex-col gap-4 items-end">
                        <div className="shrink-0 bg-white p-2 border border-black/5">
                            <QRCodeSVG value={codes.bookBarcode} size={70} level="H" includeMargin={false} />
                        </div>
                    </div>
                </div>

                <div className="mt-auto flex flex-col items-center gap-2">
                    <div className="w-full flex justify-center opacity-80 mix-blend-multiply">
                        <Barcode 
                            value={codes.bookBarcode} 
                            format="CODE128" 
                            width={1.6} 
                            height={45} 
                            displayValue={false} 
                            margin={0}
                            background="transparent"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-px bg-black/10" />
                        <span className="text-3xl font-black tracking-[0.3em] uppercase" style={{ color: codes.vendorColor || 'inherit' }}>{codes.bookBarcode}</span>
                        <div className="w-8 h-px bg-black/10" />
                    </div>
                </div>
            </div>
        </div>
    );
};
