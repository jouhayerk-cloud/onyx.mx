
import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai/react';
import { workbookPropertiesDataAtom } from '../../lib/atoms';
import { getTextColorForBg } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { tr } from '../../lib/i18n';
interface PaymentSummary {
    rate: string;
    totalAq: string;
    shipping: { label: string; amount: string }[];
}

interface TrackingRow {
    notes: string;
    date: string;
    vendorData: { [key: string]: { payment: string; balance: string } };
}

export const WorkbookPaymentTrackingView: React.FC = () => {
    const propertiesData = useAtomValue(workbookPropertiesDataAtom);
    const paymentSheet = useMemo(() => {
        return propertiesData.find(s => s.sheetName === '-vPayment');
    }, [propertiesData]);

    const { summary, trackingData, vendorColumns } = useMemo(() => {
        if (!paymentSheet || !paymentSheet.data || paymentSheet.data.length < 5) {
            return { summary: null, trackingData: [], vendorColumns: [] };
        }

        const data = paymentSheet.data;
        const rate = parseFloat(data[2]?.[0] || '0').toFixed(2);
        const totalAq = parseFloat(data[2]?.[1] || '0').toLocaleString('en-US', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });

        const shipping: { label: string; amount: string }[] = [];
        for (let i = 4; i < data.length; i++) {
            const label = data[i]?.[0];
            const amount = data[i]?.[1];
            if (!label) continue;

            shipping.push({
                label: String(label),
                amount: typeof amount === 'number' ? amount.toLocaleString('en-US', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : String(amount || '-')
            });

            if (String(label) === 'IN WAREHOUSE') break;
        }
        const vendorCols: { id: string; name: string; index: number }[] = [];
        let colIdx = 4;
        while (colIdx < data[0].length) {
            const vendorId = data[0][colIdx];
            if (vendorId) {
                vendorCols.push({
                    id: String(vendorId),
                    name: String(data[1][colIdx] || vendorId),
                    index: colIdx
                });
            }
            colIdx += 2; // Pairs of columns
        }
        const rows: TrackingRow[] = [];
        for (let i = 4; i < data.length; i++) {
            const rowData = data[i];
            const notes = rowData[2]; // Col C
            const date = rowData[3];  // Col D
            if (!notes && !date) continue;

            const vendorValues: { [key: string]: { payment: string; balance: string } } = {};

            vendorCols.forEach(v => {
                const pay = rowData[v.index];
                const bal = rowData[v.index + 1];
                vendorValues[v.id] = {
                    payment: typeof pay === 'number' ? pay.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : (pay || '-'),
                    balance: typeof bal === 'number' ? bal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : (bal || '-')
                };
            });

            rows.push({
                notes: String(notes || ''),
                date: String(date || ''),
                vendorData: vendorValues
            });
        }

        return {
            summary: { rate, totalAq, shipping },
            trackingData: rows,
            vendorColumns: vendorCols
        };
    }, [paymentSheet]);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

    if (!paymentSheet) return <div>{tr("No -vPayment sheet found.")}</div>;

    return (
        <div className="flex h-full gap-4 overflow-hidden p-2">
            {/* Left Panel: Summary (Collapsible) */}
            <div
                className={`shrink-0 flex flex-col gap-4 font-sans transition-all duration-300 ease-in-out relative ${isSidebarOpen ? 'w-80' : 'w-10'}`}
            >
                {/* Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute -right-3 top-6 z-50 w-6 h-6 bg-[var(--main-color)] rounded-full flex items-center justify-center text-white shadow-md hover:scale-110 transition-transform border-2 border-[#0f1115]"
                    title={isSidebarOpen ? "Collapse Summary" : "Expand Summary"}
                >
                    <svg className={`w-3 h-3 transition-transform duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Content Container - Clips content when collapsing */}
                <div className={`flex flex-col gap-4 h-full overflow-hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {/* Rate & Total */}
                    <div className="glass-panel p-6 rounded-xl flex flex-col gap-4 shrink-0 whitespace-nowrap">
                        <div>
                            <p className="text-[var(--text-color-secondary)] text-xs font-bold uppercase tracking-wider">{tr("USD / MXN Rate")}</p>
                            <p className="text-3xl font-bold font-mono text-[var(--main-color)]">{summary?.rate}</p>
                        </div>
                        <div>
                            <p className="text-[var(--text-color-secondary)] text-xs font-bold uppercase tracking-wider">{tr("Total AQ MXN")}</p>
                            <p className="text-2xl font-bold font-mono text-white">{summary?.totalAq}</p>
                        </div>
                    </div>

                    {/* Shipping Summary */}
                    <div className="glass-panel p-0 rounded-xl flex-grow overflow-hidden flex flex-col whitespace-nowrap">
                        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--glass-bg)] flex justify-between items-center">
                            <h3 className="font-bold text-[var(--text-color)] uppercase tracking-wider text-sm">{tr("Shipping Record")}</h3>
                        </div>
                        <div className="overflow-y-auto p-2">
                            <table className="w-full text-sm">
                                <tbody>
                                    {summary?.shipping.map((item, i) => {
                                        const isTotal = item.label.includes('TOTAL') || item.label.includes('SHIPPED') || item.label.includes('WAREHOUSE');
                                        const trkColors: Record<string, string> = {
                                            'TRK1': '#ff0099', // Pink/Magenta
                                            'TRK2': '#ffff00', // Yellow
                                            'TRK3': '#00b0f0', // Cyan
                                            'TRK4': '#99ff99', // Light Green
                                            'T SHIPPED': '#ffffff' // White
                                        };
                                        const trkKey = Object.keys(trkColors).find(k => item.label.includes(k));
                                        const bgColor = trkKey ? trkColors[trkKey] : undefined;

                                        return (
                                            <tr key={i} className={`border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--glass-bg)] transition-colors`}
                                                style={{ backgroundColor: bgColor }}
                                            >
                                                <td className={`p-3 font-semibold ${bgColor ? 'text-black' : (isTotal ? 'text-[var(--main-color)]' : 'text-[var(--text-color)]')}`}>
                                                    {item.label}
                                                </td>
                                                <td className={`p-3 text-right font-mono ${bgColor ? 'text-black font-bold' : (isTotal ? 'font-bold text-white' : 'text-[#a0a0a0]')}`}>
                                                    {item.amount}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Collapsed State Visual (Vertical Text) */}
                {!isSidebarOpen && (
                    <div className="absolute inset-0 flex flex-col items-center pt-20 gap-4 opacity-50 hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setIsSidebarOpen(true)}>
                        <div className="writing-mode-vertical text-[var(--text-color-secondary)] text-xs font-bold uppercase tracking-widest whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
                            {tr("Summary & Shipping")}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel: Tracking Grid */}
            <div className="flex-grow glass-panel rounded-xl overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1 relative">
                    <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 z-20 bg-[#0f1115]">
                            {/* Vendor Headers */}
                            <tr>
                                <th className="sticky left-0 z-30 p-2 min-w-[250px] bg-[#0f1115] border-b border-r border-[var(--border-color)] text-left font-bold text-[var(--text-color-secondary)] uppercase">
                                    {tr("TYPE")}
                                </th>
                                <th className="sticky left-[250px] z-30 p-2 min-w-[100px] bg-[#0f1115] border-b border-r border-[var(--border-color)] text-center font-bold text-[var(--text-color-secondary)] uppercase">
                                    {tr("Date")}
                                </th>
                                {vendorColumns.map(v => (
                                    <th key={v.id} colSpan={2} className="p-2 border-b border-r border-[var(--border-color)] text-center text-[var(--text-color)] font-bold uppercase min-w-[200px]" style={{
                                        backgroundColor: vendors[v.id as keyof typeof vendors]?.color ? `${vendors[v.id as keyof typeof vendors].color}20` : 'transparent'
                                    }}>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] opacity-70">{v.id}</span>
                                            <span>{v.name}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            {/* Subheaders */}
                            <tr>
                                <th className="sticky left-0 z-30 bg-[#0f1115] border-b border-r border-[var(--border-color)]"></th>
                                <th className="sticky left-[250px] z-30 bg-[#0f1115] border-b border-r border-[var(--border-color)]"></th>
                                {vendorColumns.map(v => (
                                    <React.Fragment key={v.id}>
                                        <th className="p-2 border-b border-r border-[var(--border-color)] text-[10px] uppercase text-[var(--text-color-secondary)] bg-[var(--glass-bg)]">{tr("Payment")}</th>
                                        <th className="p-2 border-b border-r border-[var(--border-color)] text-[10px] uppercase text-[var(--text-color-secondary)] bg-[var(--glass-bg)]">{tr("Balance")}</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {trackingData.map((row, idx) => {
                                let activeVendorId: string | null = null;
                                for (const vid in row.vendorData) {
                                    const payment = row.vendorData[vid].payment;
                                    if (payment && payment !== '-' && payment !== '0' && payment !== '0.00') {
                                        activeVendorId = vid;
                                        break; // Assuming one vendor payment per row for the main color coding
                                    }
                                }
                                const vendorColor = activeVendorId && vendors[activeVendorId as keyof typeof vendors]?.color
                                    ? vendors[activeVendorId as keyof typeof vendors].color
                                    : null;
                                const textColor = vendorColor ? '#000000' : 'var(--text-color)';
                                const secondaryTextColor = vendorColor ? '#000000' : 'var(--text-color-secondary)';

                                return (
                                    <tr key={idx} className="hover:bg-[var(--glass-bg)] transition-colors border-b border-[var(--border-color)] last:border-0 group">
                                        {/* Col C: Notes - Color coded by Vendor (Solid/High Opacity for visual connection) */}
                                        <td className="sticky left-0 z-10 p-2 border-r border-[var(--border-color)] border-l-4 font-sans text-xs"
                                            style={{
                                                backgroundColor: vendorColor || 'var(--card-bg)', // Use card bg if no color to cover scroll
                                                borderLeftColor: vendorColor || 'transparent',
                                                color: textColor,
                                                fontWeight: vendorColor ? 'bold' : 'normal'
                                            }}>
                                            <div className="truncate w-full" title={row.notes}>
                                                {row.notes}
                                            </div>
                                        </td>

                                        {/* Col D: Date - Color coded by Vendor */}
                                        <td className="sticky left-[250px] z-10 p-2 border-r border-[var(--border-color)] text-center text-[10px]"
                                            style={{
                                                backgroundColor: vendorColor || 'var(--card-bg)',
                                                color: secondaryTextColor,
                                                fontWeight: vendorColor ? 'bold' : 'normal'
                                            }}>
                                            {typeof row.date === 'number' ? new Date((row.date - 25569) * 86400 * 1000).toLocaleDateString('es-MX') : row.date}
                                        </td>

                                        {vendorColumns.map(v => {
                                            const vData = row.vendorData[v.id];
                                            const isPayment = vData.payment !== '-' && vData.payment !== '0' && vData.payment !== '0.00';
                                            const isTargetVendor = v.id === activeVendorId;

                                            return (
                                                <React.Fragment key={v.id}>
                                                    <td className={`p-2 border-r border-[var(--border-color)] text-right font-mono text-xs`}
                                                        style={{
                                                            backgroundColor: isTargetVendor && vendorColor ? vendorColor : 'transparent',
                                                            color: isTargetVendor && vendorColor ? '#000000' : (isPayment ? 'var(--main-color)' : 'var(--text-color-secondary)'),
                                                            fontWeight: isPayment ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        {vData.payment !== '-' ? `$${vData.payment}` : ''}
                                                    </td>
                                                    <td className="p-2 border-r border-[var(--border-color)] text-right text-[10px] opacity-70">
                                                        {vData.balance !== '-' ? `$${vData.balance}` : ''}
                                                    </td>
                                                </React.Fragment>
                                            )
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
