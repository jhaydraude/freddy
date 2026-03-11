/**
 * visualization.ts
 *
 * Rules and guidelines for data visualization.
 */

export const VISUALIZATION_PROMPT = `
## Visualization

**CRITICAL RULE**: When the user asks to "plot", "chart", "graph", "show", or "visualize" data, you MUST call the ${'`'}render_chart${'`'} tool. Do NOT describe the chart in text — call the tool. Never say "here is a chart showing X" and just write text.

**Workflow** (2 steps):
1. Call ${'`'}query_data${'`'} (metric='raw') or ${'`'}analyze_*${'`'} to get data.
2. Immediately call ${'`'}render_chart${'`'} using rawRows or series modes below.
3. Write a 1-2 sentence text summary after the chart.

### Mode 1 — rawRows (PREFERRED for query_data results)

| Chart need | collection | entry_type | fields | xField | yField | seriesColor |
|------------|-----------|------------|--------|--------|--------|-------------|
| Glucose trace | entries | 'sgv' | ['date','sgv'] | date | sgv | #10b981 |
| Heart rate | entries | 'activity' | ['date','heartrate'] | date | heartrate | #f43f5e |
| Steps | entries | 'activity' | ['date','steps'] | date | steps | #3b82f6 |
| Carbs | treatments | — | ['created_at','carbs'] | created_at | carbs | #f97316 |
| Insulin | treatments | — | ['created_at','insulin'] | created_at | insulin | #8b5cf6 |

Pass ${'`'}rawRows: { rows: result.rows, xField, yField, seriesName, seriesColor }${'`'} and the server maps automatically.

### Mode 2 — series (for analyze_* outputs, requires manual {x,y} mapping)

| Chart need | Tool | Field | x | y |
|------------|------|-------|---|---|
| Daily TDD bar | analyze_treatments insulin | daily_series | date | total |
| Daily carbs bar | analyze_treatments carbs | daily_series | date | carbs |
| AGP band | analyze_glucose history | hourly_medians | hour | median |

### Chart type

| Data | chartType |
|------|----------|
| Time-series (glucose, HR) | "line" |
| Daily totals (TDD, carbs) | "bar" |
| Percentile / AGP | "band" |

Always include ${'`'}targetLow${'`'}/${'`'}targetHigh${'`'} for glucose charts (use user context values from ctx).
`;
