import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai/react';
import { workbookPropertiesDataAtom } from '../../lib/atoms';
import { WorkbookPaymentTrackingView } from './WorkbookPaymentTrackingView';
import { findHeaderRowIndex } from './workbookUtils';

export const WorkbookPropertiesView: React.FC = () => {
    const propertiesData = useAtomValue(workbookPropertiesDataAtom);
    const sortedData = useMemo(() => {
        return [...propertiesData].sort((a, b) => {
            if (a.sheetName === '-vPayment') return -1;
            if (b.sheetName === '-vPayment') return 1;
            return a.sheetName.localeCompare(b.sheetName);
        });
    }, [propertiesData]);

    return (
        <div className="flex flex-col gap-6 h-full p-4 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {sortedData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[var(--text-color-secondary)]">
                    No Property/Expense sheets loaded (-v*).
                </div>
            ) : (
                <div className="flex flex-col gap-8 w-full">
                    {sortedData.map((sheet, index) => {
                        if (sheet.sheetName === '-vPayment') {
                            return (
                                <div key={sheet.sheetName} className="flex-none h-[600px] flex flex-col">
                                    <WorkbookPaymentTrackingView />
                                </div>
                            );
                        }
                        const headerIdx = findHeaderRowIndex(sheet.data);
                        const headers = sheet.data[headerIdx] || [];
                        const rows = sheet.data.slice(headerIdx + 1);

                        return (
                            <div key={sheet.sheetName} className="glass-panel p-6 rounded-xl border border-[var(--border-color)] flex-none flex flex-col gap-4">
                                <h3 className="text-xl font-bold text-[var(--text-color)] font-display uppercase tracking-wider border-b border-[var(--border-color)] pb-2 flex justify-between items-center">
                                    <span>{sheet.sheetName.replace(/^-v/, '')}</span>
                                    <span className="text-xs opacity-50 font-mono text-[var(--text-color-secondary)] lowercase">({sheet.sheetName})</span>
                                </h3>

                                <div className="overflow-auto max-h-[500px]">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-[var(--glass-bg)] text-left text-xs uppercase tracking-wider text-[var(--text-color-secondary)] backdrop-blur-md">
                                                {headers.map((header: any, i: number) => (
                                                    <th key={i} className="p-3 font-semibold whitespace-nowrap border-b border-[var(--border-color)]">
                                                        {header !== null && header !== undefined ? String(header) : ''}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono text-xs">
                                            {rows.map((row: any[], rIndex: number) => (
                                                <tr key={rIndex} className="border-b border-[var(--border-color)] hover:bg-[var(--glass-bg)] transition-colors">
                                                    {row.map((cell: any, cIndex: number) => (
                                                        <td key={cIndex} className="p-3 text-[var(--text-color)] whitespace-nowrap">
                                                            {cell !== undefined ? String(cell) : ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
