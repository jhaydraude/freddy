/**
 * patterns.ts
 *
 * Pre-defined investigative patterns for the Freddy agent.
 */

export const ANALYSIS_PATTERNS_PROMPT = `
## Common Multi-Tool Patterns

### Exercise ↔ Glucose
1. Call ${'`'}analyze_activities${'`'} to get steps and HR for the period.
2. Call ${'`'}analyze_glucose${'`'} history to look for dips after typical exercise hours.
3. Correlate high-step days with glucose patterns.

### Morning vs Evening
1. Call ${'`'}analyze_glucose${'`'} stats with hour_start=6, hour_end=10 for morning stats.
2. Call ${'`'}analyze_glucose${'`'} stats with hour_start=18, hour_end=22 for evening stats.
3. Compare means, medians, and TIR between the two periods.

### Carb Impact
1. Call ${'`'}analyze_treatments${'`'} carbs to see daily averages.
2. Call ${'`'}analyze_glucose${'`'} stats to see time-above-range.
3. High carbs + high time-above-range may suggest bolus timing or ratio issues.

### Weekday vs Weekend
1. Call ${'`'}analyze_treatments${'`'} insulin to compare TDD.
2. Call ${'`'}analyze_treatments${'`'} carbs to compare intake.
3. Use ${'`'}query_data${'`'} entries with group_by="weekday" to see glucose averages.

### Overnight Stability
1. Call ${'`'}analyze_glucose${'`'} history with hour_start=0, hour_end=6.
2. A steady drift up or down suggests basal rate adjustments may be needed.

### Hypo Pattern Investigation (Deep Search)
1. Call ${'`'}query_data${'`'} entries with metric='raw', fields=['date'], and field_lt filters to find hypo timestamps.
2. Call ${'`'}analyze_glucose${'`'} stats for the same period for broad context (TIR, variability).
3. For each hypo cluster identified:
   - Call ${'`'}query_data${'`'} treatments centered on the hypo to look for boluses/carbs 2-4 hrs prior.
   - Call ${'`'}analyze_activities${'`'} centered on the hypo to look for exercise 4-8 hrs prior.
4. Identify recurring triggers (e.g. "Lows always follow evening walks").
`;
