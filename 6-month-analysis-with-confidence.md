# 6-Month Profile Analysis Results (Updated)
**4-Hour Basal Blocks + 95% Confidence Intervals**

**Analysis Date**: December 23, 2024  
**Data Period**: June 23, 2024 - December 23, 2024 (6 months)  
**Window Size**: 2 hours  
**Total Windows Generated**: 6,403  
**Windows After Quality Filtering**: 5,751 (652 filtered for unexplained glucose increases)

---

## Key Improvements

✅ **4-Hour Basal Blocks** (instead of 24 hourly rates)  
✅ **95% Confidence Intervals** for all parameters (bootstrap with 100 iterations)  
✅ **More stable estimates** with fewer parameters to optimize

---

## Estimated Parameters with Confidence Intervals

### Insulin Sensitivity Factor (ISF)
- **Estimate**: 10.0 mmol/L per unit
- **95% CI**: [10.0, 14.5]
- **Current**: 7.6 mmol/L per unit
- **Change**: +31.6% (wider confidence interval shows uncertainty)

### Insulin-to-Carb Ratio (ICR)
- **Estimate**: 7.1 g per unit
- **95% CI**: [5.4, 12.1]
- **Current**: 16 g per unit
- **Change**: -55.6% (wide range indicates high variability)

### 4-Hour Basal Blocks

| Time Block | Estimate | 95% CI | Current | Change |
|------------|----------|--------|---------|--------|
| **00-03hr** | 0.250 U/hr | [0.158, 0.447] | 0.45 U/hr | -44% |
| **04-07hr** | 0.805 U/hr | [0.733, 0.893] | 0.40 U/hr | +101% |
| **08-11hr** | 1.026 U/hr | [0.941, 1.094] | 0.40 U/hr | +157% |
| **12-15hr** | 0.683 U/hr | [0.548, 0.797] | 0.35 U/hr | +95% |
| **16-19hr** | 0.193 U/hr | [0.100, 0.425] | 0.35 U/hr | -45% |
| **20-23hr** | 0.241 U/hr | [0.100, 0.457] | 0.40 U/hr | -40% |

**Average**: 0.53 U/hr (recommended) vs 0.40 U/hr (current) = +32.5%

---

## Data Quality Metrics

- **Windows Analyzed**: 5,751
- **Stable Windows**: 2,981 (52%)
- **Meal Windows**: 0 (carb data not reliably captured)
- **Model Fit (R²)**: **0.040** ⚠️ Very Low
- **RMSE**: 33.6 mg/dL
- **MAE**: 24.9 mg/dL

> ⚠️ **Low R² Warning**: The model explains only 4% of glucose variance. This indicates:
> - High real-world variability not captured by the simple linear model
> - Likely missing factors (stress, exercise, hormones, digestion speed, etc.)
> - Unreliable carb logging significantly impacts ICR estimates

---

## Interpretation & Recommendations

### 🎯 High Confidence Parameters

**08-11hr Basal (Morning)**: [0.941, 1.094]U/hr
- Narrow confidence interval
- Consistently suggests ~1.0 U/hr
- **Recommendation**: Strong candidate for adjustment

**04-07hr Basal (Dawn)**: [0.733, 0.893] U/hr
- Relatively narrow interval
- Suggests dawn phenomenon (2x current rate)
- **Recommendation**: Consider incremental increase

### ⚠️ Low Confidence Parameters

**ISF**: [10.0, 14.5]
- Wide range (45% spread)
- Estimate less sensitive than current, but uncertain
- **Recommendation**: Test cautiously with small changes

**ICR**: [5.4, 12.1]
- Extremely wide range (125% spread)
- Unreliable carb data makes this estimate questionable
- **Recommendation**: Improve carb logging before using

**16-19hr & 20-23hr Basals**: [0.1, 0.4] U/hr
- Very wide ranges
- Lower bounds hit optimization floor (0.1 U/hr)
- **Recommendation**: May need different time blocks or more data

---

## Notable Patterns

### Strong Dawn Phenomenon (4am-11am)
- Current: 0.40 U/hr
- Recommended: 0.805-1.026 U/hr (+101% to +157%)
- Confidence intervals tight, suggesting real pattern

### Low Evening Need (4pm-midnight)
- Current: 0.35-0.40 U/hr
- Recommended: 0.193-0.241 U/hr (-40% to -45%)
- May indicate activity, insulin stacking, or overcorrection

---

## Recommended Profile (Ready to Import)

```json
{
  "dia": 7,
  "carbratio": [{"time": "00:00", "value": 7.1}],
  "sens": [{"time": "00:00", "value": 10.0}],
  "basal": [
    {"time": "00:00", "value": 0.250},
    {"time": "04:00", "value": 0.805},
    {"time": "08:00", "value": 1.026},
    {"time": "12:00", "value": 0.683},
    {"time": "16:00", "value": 0.193},
    {"time": "20:00", "value": 0.241}
  ],
  "units": "mmol"
}
```

---

## Action Plan

### Phase 1: High-Confidence Changes (Test First)
1. **Morning Basal (8am-noon)**
   - Current: 0.40 U/hr
   - Try: 0.80 U/hr (conservative, within CI)
   - Monitor for 3-5 days

2. **Dawn Basal (4am-8am)**
   - Current: 0.40 U/hr
   - Try: 0.70 U/hr (conservative, within CI)
   - Monitor for 3-5 days

### Phase 2: Data Quality Improvement
1. **Improve Carb Logging**
   - Log all meals accurately for 2 weeks
   - Re-run analysis to get better ICR estimate

2. **Activity Tracking**
   - Note exercise in treatments
   - May explain low evening basal needs

### Phase 3: Low-Confidence Changes (Last)
1. **ISF Adjustment**
   - Test with small bolus corrections
   - Only after basal is stable

2. **Evening Basals**
   - Wait for more data
   - Current wide CIs make changes risky

---

## Technical Notes

- **Bootstrap Method**: 100 resamples with replacement
- **Optimization**: L-BFGS-B bounded optimizer
- **Quality Filtering**: Removed 652 windows with large unexplained glucose increases (>50 mg/dL with <20g carbs, or >80 mg/dL with <40g carbs)
- **Parameter Count**: 8 total (ISF + ICR + 6 basal blocks) vs previous 26 (ISF + ICR + 24 hourly basals)

---

**Overall Confidence**: Low (R²=0.040)  
**Best Use**: Identify time-of-day patterns, not absolute values  
**Next Steps**: Improve data quality, test high-confidence changes incrementally
