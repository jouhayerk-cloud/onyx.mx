import React, { useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface EChartProps {
    option: EChartsOption;
    style?: React.CSSProperties;
    className?: string;
    onEvents?: Record<string, Function>;
}

export const EChart: React.FC<EChartProps> = ({ option, style, className, onEvents }) => {
    const chartRef = useRef<any>(null);

    // Apply theme-aware colors if needed, but usually we pass them in option
    const defaultStyle = {
        height: '300px',
        width: '100%',
        ...style
    };

    return (
        <ReactECharts
            ref={chartRef}
            option={option}
            style={defaultStyle}
            className={className}
            onEvents={onEvents}
            opts={{ renderer: 'svg' }} // SVG renderer often looks cleaner for glass UIs
            notMerge={true}
            lazyUpdate={true}
        />
    );
};
