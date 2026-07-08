import { vendors } from '../../lib/consts';

export function generateCratesListHtml(manifestId: string, metadata: any, payload: any) {
    const { crates, timestamp } = payload;
    const totalWeight = crates.reduce((sum: number, c: any) => {
        return sum + (c.items?.reduce((s: number, i: any) => s + ((i.weightKg || 0) * (i.qty || 1)), 0) || 0);
    }, 0);
    
    const crateRows = crates.map((c: any) => {
        const crateColor = c.color || (vendors as any)[c.subtitle]?.color || '#adb5bd';
        
        const itemRows = (c.items || []).map((it: any, idx: number) => `
            <tr>
                <td style="padding: 15px 0; font-size: 10px; font-weight: 900; color: #e2e8f0; vertical-align: top;">
                    ${String(idx + 1).padStart(2, '0')}
                </td>
                <td style="padding: 15px 0; vertical-align: top;">
                    <div style="display: inline-flex; border: 1px solid #000; border-left: 8px solid ${it.tagColor || (vendors as any)[it.vendorPrefix]?.color || '#000'}; border-radius: 6px; padding: 6px 12px; background: #fff; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 900; margin-bottom: 8px;">
                        ${it.itemId}
                    </div>
                </td>
                <td style="padding: 15px 15px; vertical-align: top;">
                    <div style="font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 6px;">
                        ${it.name}
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${it.type || 'Unit'}</span>
                        <span style="font-size: 8px; font-weight: 900; text-transform: uppercase; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #64748b; letter-spacing: 0.1em;">${it.desc || '—'}</span>
                    </div>
                </td>
                <td style="padding: 15px 0; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; vertical-align: top;">
                    ${it.combinedAttr || '—'}
                </td>
                <td style="padding: 15px 0; font-size: 24px; font-weight: 900; text-align: right; vertical-align: top;">
                    ${it.qty}
                </td>
            </tr>
        `).join('');

        return `
            <div style="margin-bottom: 60px; page-break-inside: avoid;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 15px; border-bottom: 1px solid #000; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${crateColor};"></div>
                        <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">${c.label}</span>
                        <span style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 10px;">${c.subtitle}</span>
                    </div>
                    <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">
                        ${c.l}×${c.w}×${c.h} CM &nbsp;·&nbsp; ${(c.items?.reduce((s:number,i:any)=>s+((i.weightKg||0)*(i.qty||1)),0) || 0).toFixed(1)} KG
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #000;">
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 40px;">Seq</th>
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 140px;">Barcode ID</th>
                            <th style="text-align: left; padding: 10px 15px; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8;">Description / Attributes</th>
                            <th style="text-align: left; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 160px;">Color & Material</th>
                            <th style="text-align: right; padding: 10px 0; font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; width: 60px;">Qty</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Crates Manifest - ${manifestId}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700;900&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 60px; background: #fff; color: #111827; line-height: 1.4; }
        @media print {
            body { padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div style="max-width: 1000px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 40px; margin-bottom: 40px;">
            <div>
                <h1 style="font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0 0 5px 0; letter-spacing: -0.01em;">Onyx Logistics Crates Manifest</h1>
                <p style="font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.3em; margin: 0;">Digital Mirror Protocol v2.8 · Exported ${timestamp}</p>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 32px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: -0.03em;">${manifestId}</div>
            </div>
        </div>

        <!-- Metrics -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 60px;">
            <div>
                <label style="font-size: 9px; font-weight: 900; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.15em; display: block; margin-bottom: 12px;">Total Weight</label>
                <div style="font-size: 42px; font-weight: 900; letter-spacing: -0.04em;">
                    ${Math.round(totalWeight).toLocaleString()} <span style="font-size: 14px; color: #cbd5e1;">KG</span>
                </div>
                <div style="font-size: 9px; font-weight: 900; color: #059669; text-transform: uppercase; margin-top: 5px;">${crates.length} Units exported</div>
            </div>
            
            <div style="border-left: 1px solid #f1f5f9; padding-left: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div style="grid-column: span 2;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Reference</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.shipmentRef || '—'}</span>
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Senders Information</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${(metadata?.senders || []).filter(Boolean).join(' / ') || '—'}</span>
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Truck Plates</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.truckPlates || '—'}</span>
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 8px; font-weight: 900; text-transform: uppercase; color: #94a3b8; margin-bottom: 5px; display: block;">Additional Notes</label>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${metadata?.notes || '—'}</span>
                </div>
            </div>
        </div>

        <!-- Inventory Breakdown -->
        <h2 style="font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4em; color: #cbd5e1; margin-bottom: 40px; display: flex; align-items: center; gap: 20px;">
            Inventory Breakdown <div style="flex: 1; height: 1px; background: #f1f5f9;"></div>
        </h2>
        
        ${crateRows}

        <div style="margin-top: 100px; padding-top: 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; color: #e2e8f0;">
            <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em;">Secure Mirror Protocol · ${new Date().getFullYear()}</div>
            <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3em;">End of Document</div>
        </div>
    </div>
</body>
</html>
    `;
}
