'use client';

import {
    ComposedChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceArea
} from 'recharts';
import { format } from 'date-fns';
import { CHART_LAYOUT } from '@/lib/chartUtils';

export interface VisibleLines {
    glucose: boolean;
    iob: boolean;
    cob: boolean;
    insulinImpact: boolean;
    carbImpact: boolean;
    basal: boolean;
}

export interface HighlightRange {
    start: string;
    end: string;
    label?: string;
}

interface GlucoseChartProps {
    data: any[];
    isLoading?: boolean;
    loadingType?: 'fetch' | 'recalculate';
    visibleLines: VisibleLines;
    onClick?: (data: any) => void;
    highlightRange?: HighlightRange;
    timeDomain?: [number, number];
    targetLow?: number;
    targetHigh?: number;
    units?: string;
}

export default function GlucoseChart({ data, isLoading, visibleLines, timeDomain, targetLow = 70, targetHigh = 180, units = 'mg/dL' }: GlucoseChartProps) {

    // Helper to detect if data is in mg/dL based on values
    // If values are generally > 30, it is likely mg/dL
    const isDataMgDl = data.length > 0 && data.some(d => d.sgv > 30);
    const shouldConvert = units === 'mmol/L' && isDataMgDl;

    // Transform data if unit conversion is needed
    const chartData = shouldConvert
        ? data.map(d => ({ ...d, sgv: d.sgv ? d.sgv / 18 : null }))
        : data;

    // Filter data to match the visible time domain for accurate gradient calculation
    // The SVG gradient is applied to the rendered path's bounding box, which corresponds
    // to the visible data range, not the full dataset.
    const visibleData = timeDomain
        ? chartData.filter(d => d.timestamp >= timeDomain[0] && d.timestamp <= timeDomain[1])
        : chartData;

    // Calculate gradient offsets based on VISIBLE data
    const glucoseValues = visibleData.map(d => d.sgv).filter(v => v != null);

    // For gradient usage, we need the min/max of the ACTUAL DATA visible on the chart
    // because the linearGradient with objectBoundingBox is applied to the path's bounding box.
    const dataMax = Math.max(...glucoseValues);
    const dataMin = Math.min(...glucoseValues);

    // Calculate Insulin and COB domains for Y=0 alignment
    const insulinValues = visibleData.flatMap(d => [d.iob, d.basal, d.activeBasal].filter(v => v != null));
    const cobValues = visibleData.map(d => d.cob).filter(v => v != null);

    const insulinMax = Math.max(...insulinValues, 0);
    const insulinMin = Math.min(...insulinValues, 0); // Allow negative IOB if present
    const cobMaxData = Math.max(...cobValues, 0);

    // Standard headroom
    const cobMax = cobMaxData > 0 ? cobMaxData * 1.1 : 100;

    // Align Zero Lines:
    // We want the ratio (0 - min) / (max - min) to be identical for both axes.
    // insulinRatio = -insulinMin / (insulinMax - insulinMin)
    // cobRatio = -cobMin / (cobMax - cobMin)
    // Solve for cobMin: cobMin = - (cobMax * insulinRatio) / (1 - insulinRatio)
    // Simpler: cobMin = (insulinMin / insulinMax) * cobMax  (if purely proportional)
    // Actually: 0 position percent P = 1 - (0 - min)/(max - min) = 1 + min/(max-min).
    // Let's just equate the ratios of "negative range" to "positive range".
    // |min| / max  should be same?
    // Let's calculate the required cobMin to match insulin's zero placement.

    let cobDomain = [0, 'auto'];
    let insulinDomain = [insulinMin, insulinMax * 1.1]; // Add headroom

    if (insulinMin < 0 && insulinMax > 0) {
        // Insulin spans zero.
        const insulinRange = insulinMax - insulinMin;
        const zeroRatio = -insulinMin / insulinRange; // % height from bottom for 0 line

        // We want COB 0 to be at zeroRatio too.
        // COB Max is fixed (with headroom). We need to find cobMin.
        // -cobMin / (cobMax - cobMin) = zeroRatio
        // -cobMin = zeroRatio * cobMax - zeroRatio * cobMin
        // cobMin * (zeroRatio - 1) = zeroRatio * cobMax
        // cobMin = (zeroRatio * cobMax) / (zeroRatio - 1)

        const calculatedCobMin = (zeroRatio * cobMax) / (zeroRatio - 1);
        cobDomain = [calculatedCobMin, cobMax];
    } else if (insulinMin >= 0) {
        // Insulin is all positive. Base is 0.
        // COB is usually all positive. Base is 0.
        // Natural alignment at bottom.
        cobDomain = [0, cobMax];
        insulinDomain = [0, insulinMax * 1.1];
    }


    const calculateOffset = (target: number) => {
        if (dataMax === dataMin) return 0;
        const offset = (dataMax - target) / (dataMax - dataMin);
        return Math.max(0, Math.min(1, offset));
    };

    const offsetHigh = calculateOffset(targetHigh);
    const offsetLow = calculateOffset(targetLow);

    // For axis scaling (headroom), we still use the previous logic
    const axisMax = Math.max(dataMax, targetHigh);
    const yMax = axisMax > 0 ? axisMax * 1.1 : (units === 'mmol/L' ? 22 : 400);

    // Simple, standard Recharts tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dateStr = label ? format(new Date(label), 'HH:mm') : '--:--';
            return (
                <div className="bg-zinc-900 border border-zinc-700 p-2 rounded shadow-lg text-xs text-zinc-300">
                    <p className="font-bold mb-1 border-b border-zinc-800 pb-1">{dateStr}</p>
                    <div className="space-y-1">
                        {payload.map((p: any) => (
                            <div key={p.name} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
                                <span className="font-medium">{p.name}:</span>
                                <span className="text-white">{Number(p.value).toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };


    if (isLoading && data.length === 0) {
        return (
            <div className="w-full h-[350px] flex items-center justify-center bg-zinc-900/40 rounded-xl border border-zinc-800/50">
                <span className="text-zinc-500">Loading...</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[350px] bg-zinc-900/40 rounded-xl border border-zinc-800/50 p-4">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                    data={chartData}
                    // Using standard chart layout margins for consistency, but keeping it simple
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={0} stopColor="#eab308" stopOpacity={1} />
                            <stop offset={offsetHigh} stopColor="#eab308" stopOpacity={1} />
                            <stop offset={offsetHigh} stopColor="#10b981" stopOpacity={1} />
                            <stop offset={offsetLow} stopColor="#10b981" stopOpacity={1} />
                            <stop offset={offsetLow} stopColor="#f43f5e" stopOpacity={1} />
                            <stop offset={1} stopColor="#f43f5e" stopOpacity={1} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={timeDomain || ['auto', 'auto']}
                        tickFormatter={(t) => format(new Date(t), 'HH:mm')}
                        stroke="#71717a"
                        tick={{ fontSize: 11 }}
                        scale="time"
                        allowDataOverflow
                    />

                    {/* Left Axis: Glucose */}
                    <YAxis
                        yAxisId="glucose"
                        orientation="left"
                        stroke="#10b981"
                        domain={[0, yMax]}
                        tick={{ fontSize: 10 }}
                        width={40}
                        axisLine={false}
                        tickLine={false}
                    />

                    {/* Right Axes */}
                    <YAxis
                        yAxisId="insulin"
                        orientation="right"
                        stroke="#3b82f6"
                        domain={insulinDomain}
                        tick={{ fontSize: 10 }}
                        width={30}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="cob"
                        orientation="right"
                        stroke="#f97316"
                        domain={cobDomain}
                        tick={{ fontSize: 10 }}
                        width={30}
                        axisLine={false}
                        tickLine={false}
                    />

                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />

                    {/* Target Range Band */}
                    <ReferenceArea
                        yAxisId="glucose"
                        y1={targetLow}
                        y2={targetHigh}
                        fill="#10b981"
                        fillOpacity={0.05}
                    />

                    {/* Active Basal (Deep Layer) */}
                    {visibleLines.basal && (
                        <Area
                            yAxisId="insulin"
                            type="stepAfter"
                            dataKey="activeBasal"
                            name="Actual Basal"
                            stroke="#0ea5e9"
                            strokeWidth={2}
                            fill="#0ea5e9"
                            fillOpacity={0.2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.basal && (
                        <Line
                            yAxisId="insulin"
                            type="stepAfter"
                            dataKey="basal"
                            name="Scheduled Basal"
                            stroke="#ffffff"
                            strokeWidth={2}
                            strokeOpacity={0.6}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.glucose && (
                        <Line
                            yAxisId="glucose"
                            type="monotone"
                            dataKey="sgv"
                            name="Glucose"
                            stroke="url(#splitColor)"
                            strokeWidth={4}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.iob && (
                        <Line
                            yAxisId="insulin"
                            type="monotone"
                            dataKey="iob"
                            name="IOB"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}

                    {visibleLines.cob && (
                        <Line
                            yAxisId="cob"
                            type="monotone"
                            dataKey="cob"
                            name="COB"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
