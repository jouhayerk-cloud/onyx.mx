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
}

export const NFCTagCard = ({ item, scale = 1 }: LabelVisualsProps) => {
    const { normData, codes } = item;
    
    // Format dimensions
    const dims = [normData.lengthCm, normData.widthCm, normData.heightCm].filter(Boolean).join('*');
    const dimsStr = dims ? `${dims} CM` : '';
    
    // Retail Tag (ACQ-Workbook-Retail)
    const retailTag = `${codes.bookAqCode || '??'}-${codes.bookLandCode || '???????'}`;

    return (
        <div 
            className="w-[400px] h-[250px] bg-white text-black p-4 flex flex-col relative font-sans shadow-2xl border border-black/10 select-none"
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
        >
            {/* Left Vertical text */}
            <div className="absolute left-1 top-0 bottom-0 flex items-center justify-center">
                <span className="text-[10px] font-black uppercase tracking-[0.6em] rotate-180 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
                    MADE IN MEXICO
                </span>
            </div>

            <div className="flex-1 ml-8 flex flex-col">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                        <span className="text-2xl font-black tracking-tighter leading-none">{retailTag}</span>
                        <span className="text-base font-bold leading-tight mt-1 truncate max-w-[240px]">{normData.shape} {normData.shortDescription}</span>
                        <span className="text-base font-medium leading-tight truncate max-w-[240px]">{normData.color} {normData.material}</span>
                        <span className="text-base font-bold leading-tight mt-1">{dimsStr}</span>
                    </div>
                    <div className="shrink-0 bg-white p-1">
                        <QRCodeSVG value={codes.bookBarcode} size={80} level="H" includeMargin={false} />
                    </div>
                </div>

                <div className="mt-auto flex flex-col items-center">
                    <div className="w-full flex justify-center">
                        <Barcode 
                            value={codes.bookBarcode} 
                            format="CODE128" 
                            width={1.5} 
                            height={50} 
                            displayValue={false} 
                            margin={0}
                            background="transparent"
                        />
                    </div>
                    <span className="text-lg font-black tracking-[0.4em] uppercase mt-1">{codes.bookBarcode}</span>
                </div>
            </div>
        </div>
    );
};
