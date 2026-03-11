/**
 * domain-knowledge.ts
 *
 * Portable diabetes domain knowledge and interpretation guidelines.
 * Imported into the agent system prompt to help contextualize data results.
 */

export const DOMAIN_KNOWLEDGE_PROMPT = `
## Diabetes Domain Knowledge

### Time in Range (TIR) — Clinical Targets
| Metric | Target | Notes |
|--------|--------|-------|
| Time in Range (70–180 mg/dL / 3.9–10.0 mmol/L) | >70% | Primary goal for most people with diabetes |
| Time Below Range (<70 / <3.9) | <4% | Hypoglycaemia — safety-critical |
| Time Below 54 mg/dL / 3.0 mmol/L | <1% | Clinically significant hypoglycaemia |
| Time Above Range (>180 / >10.0) | <25% | Hyperglycaemia |
| Time Above 250 mg/dL / 13.9 mmol/L | <5% | Clinically significant hyperglycaemia |

### Glucose Variability
- **Coefficient of Variation (CV)**: target <36%. A CV ≥36% indicates unstable glucose and higher hypo risk.
- **Standard Deviation**: useful alongside CV but depends on the mean, so CV is the preferred variability metric.
- **Glucose Management Indicator (GMI / estimated HbA1c)**: calculated from mean glucose. An HbA1c <7% (53 mmol/mol) is a general target, but individual goals vary.

### Insulin Metrics
- **Total Daily Dose (TDD)**: varies widely by individual. Typical range 0.3–1.0 U/kg/day.
- **Basal/Bolus Split**: a common starting point is ~50/50. A split >60% basal may indicate missed boluses or under-carbing. A split >60% bolus may indicate excess snacking corrections.
- **Super Micro Boluses (SMB)**: Automated, repeated tiny boluses given by a closed-loop pump. These should be considered part of the user's **basal** delivery, not food boluses.
- **Insulin Sensitivity Factor (ISF)**: how much 1 unit of insulin drops glucose. Lower ISF = more insulin resistant.
- **Insulin-to-Carb Ratio (ICR)**: grams of carbs covered by 1 unit of insulin.
- **Duration of Insulin Action (DIA)**: typically 3–5 hours for rapid-acting insulin.

### Common Glucose Patterns
- **Dawn Phenomenon**: glucose rises in the early morning (4–8 AM) due to hormonal surges, even without carbs. Often visible as an upward trend in hour-by-hour history between hours 4–8.
- **Foot-on-the-Floor**: a sharp rise immediately after waking/getting out of bed. Distinguished from dawn phenomenon by timing — happens on wake, not gradually overnight.
- **Post-Meal Spike**: glucose peaks 60–90 minutes after eating. A spike >60 mg/dL (3.3 mmol/L) above pre-meal suggests timing or dosing issues.
- **Post-Exercise Drop**: glucose often drops during or after aerobic exercise. Can be delayed 2–6 hours. Look for correlation between step/HR data and glucose dips.
- **Compression Lows**: false low readings caused by sleeping on the CGM sensor arm. Often appear as sudden isolated dips at night that recover without treatment.
- **Overnight Basals**: if glucose drifts up or down steadily overnight (midnight–6 AM) with no food or corrections, basal rates may need adjustment.

### Interpreting Results — Guidelines
When presenting statistics to the user, add brief context:
- If TIR is >70%, note that this meets the clinical target.
- If TIR is <70%, mention it's below target and note where the time is being lost (high vs low).
- If CV is ≥36%, flag it as high variability and note the hypo risk.
- If average daily steps are below ~7,000, note this is below typical recommendations for active health.
- When comparing weekday vs weekend, note any significant difference (>10% change in TDD or carbs) as it may signal routine differences.
- When the user asks about patterns, proactively check if the data shows dawn phenomenon, post-meal spikes, or exercise-related trends.
`;

