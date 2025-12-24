# 6-Month Profile Analysis Results

**Analysis Date**: December 23, 2024  
**Data Period**: June 23, 2024 - December 23, 2024 (6 months)  
**Window Size**: 2 hours  
**Total Windows Generated**: 6,403  
**Windows After Quality Filtering**: 5,751 (652 filtered out for unexplained glucose increases)

---

## Data Quality

- **Windows Analyzed**: 5,751
- **Stable Windows**: 2,981 (52%)
- **Meal Windows**: 0
- **Model Fit (R²)**: **0.056** ⚠️ Low
- **RMSE**: 33.3 mg/dL
- **MAE**: 24.7 mg/dL

> ⚠️ **Note**: The low R² score (0.056) indicates the simple linear model doesn't explain much variance in the data. This suggests:
> - High variability in real-world glucose response
> - Possible need for more complex model (time-of-day specific ISF/ICR, activity factors, etc.)
> - Data quality issues (unreported carbs still present despite filtering)

---

## Current vs Recommended Profile

### Insulin Sensitivity Factor (ISF)
- **Current**: 7.6 mmol/L per unit
- **Recommended**: **11.5 mmol/L per unit** 
- **Change**: +51.3% (less sensitive / higher ISF)

### Insulin-to-Carb Ratio (ICR)
- **Current**: 16 g per unit
- **Recommended**: **8.5 g per unit**
- **Change**: -46.9% (need more insulin per gram of carbs)

### Basal Rates

| Hour | Current | Recommended | Change |
|------|---------|-------------|--------|
| 00:00-03:59 | 0.45 U/hr | 0.21-0.55 U/hr | Variable |
| 04:00-07:59 | 0.40 U/hr | 0.62-0.90 U/hr | +55-125% |
| 08:00-13:59 | 0.40 U/hr | 0.74-1.09 U/hr | +85-173% |
| 14:00-19:59 | 0.35 U/hr | 0.10-0.77 U/hr | Variable |
| 20:00-23:59 | 0.40 U/hr | 0.10-0.87 U/hr | Variable |

**Current Average**: 0.40 U/hr  
**Recommended Average**: 0.61 U/hr (+52.5%)

---

## Notable Patterns

### High Basal Need (4am-1pm)
The model suggests significantly higher basal rates during morning and midday hours (0.62-1.09 U/hr), possibly indicating:
- Dawn phenomenon (4am-8am peak at 0.85-0.90 U/hr)
- Increased insulin resistance during daylight hours
- Possible meal impact not captured in carb entries

### Low Basal Need (3pm-11pm)
Very low recommended basal rates in the afternoon/evening (some as low as 0.10 U/hr):
- May indicate increased insulin sensitivity
- Could reflect activity patterns
- Possible over-correction from earlier high glucose

---

## Recommendations

### ⚠️ Caution on Implementation

Given the **low confidence** (R²=0.056), these recommendations should be:
1. **Validated** against known patterns in your CGM data
2. **Tested incrementally** - don't change all parameters at once
3. **Monitored closely** - especially the dramatic basal changes

### Suggested Next Steps

1. **Improve Data Quality**
   - More consistent carb logging
   - Note exercise/activity in treatments
   - Track stress, illness, hormonal factors

2. **Refine Analysis**
   - Run analysis on specific time periods (e.g., last month only)
   - Exclude periods of illness or unusual activity
   - Consider splitting analysis by time of day

3. **Incremental Testing**
   - Test ISF adjustment first (small change: 7.6 → 9.0)
   - Validate ICR with meal tests (try 12 g/U as intermediate)
   - Adjust basal rates one time block at a time

4. **Model Improvements**
   - Consider time-of-day specific ISF/ICR
   - Add activity/exercise factors
   - Incorporate COB (carbs on board) decay

---

## Data Summary

- **Glucose Readings**: 154,629
- **Treatments**: 8,303
- **Analysis Duration**: 30 seconds (window generation) + minimal optimization time

---

## Full Profile Export

### Current Profile
```json
{
  "dia": 7,
  "carbratio": [{"time": "00:00", "value": 16}],
  "sens": [{"time": "00:00", "value": 7.6}],
  "basal": [
    {"time": "00:00", "value": 0.45},
    {"time": "04:00", "value": 0.40},
    {"time": "14:00", "value": 0.35},
    {"time": "20:00", "value": 0.40}
  ],
  "units": "mmol"
}
```

### Recommended Profile (Complete)
See `profile-analysis-result.json` for the full recommended profile with 24 hourly basal rates.

---

**Confidence**: Low  
**Recommendation**: Use as exploratory analysis, not definitive guidance. Validate with clinical data and testing.
