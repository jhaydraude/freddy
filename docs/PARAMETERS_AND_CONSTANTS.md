# Freddy Parameters, Constants, and Functions Reference

This document catalogs all parameters, constants, and functions used in Freddy's analysis, profile analyzer, IOB/COB calculations, activity calculations, and insulin/carb activity calculations. For each item, we document:
- **What it is**: Description and purpose
- **Where it comes from**: Source (user profile, calculated, hardcoded constant, etc.)
- **Tunability**: Whether it can be tuned or calculated from data

---

## Table of Contents

1. [Profile Parameters](#profile-parameters)
2. [IOB (Insulin on Board) Calculations](#iob-insulin-on-board-calculations)
3. [COB (Carbs on Board) Calculations](#cob-carbs-on-board-calculations)
4. [Activity Impact Calculations](#activity-impact-calculations)
5. [Profile Analysis & Optimization](#profile-analysis--optimization)
6. [Insulin Activity Curves](#insulin-activity-curves)
7. [Carb Absorption Curves](#carb-absorption-curves)
8. [Time Window Analysis](#time-window-analysis)

---

## Profile Parameters

### 1. **DIA (Duration of Insulin Action)**
- **What**: Total duration (in hours) that insulin remains active in the body
- **Where**: User's Nightscout profile (`profile.store[name].dia`)
- **Default**: 5 hours
- **Tunability**: ⚠️ **Semi-tunable** - Generally set based on insulin type, but can be refined through data analysis
- **Used in**: 
  - IOB calculations (`iob-logic.ts`)
  - Insulin activity curves (`iob-curves.ts`)
  - Profile analysis windows (`profile-analysis-logic.ts`)

### 2. **Peak Time**
- **What**: Time (in minutes) when insulin activity reaches maximum
- **Where**: Derived from insulin curve type in profile
- **Values**:
  - `55` minutes for rapid-acting (Humalog/Novolog)
  - `45` minutes for ultra-rapid (Fiasp/Lyumjev)
- **Default**: 45 minutes (assumes Fiasp if unknown)
- **Tunability**: ⚠️ **Semi-tunable** - Primarily insulin-type dependent, but individual variation exists
- **Used in**:
  - IOB decay function (`insulin-math.ts`)
  - Insulin activity calculations (`profile-analysis-logic.ts`)

### 3. **ISF (Insulin Sensitivity Factor)**
- **What**: How much 1 unit of insulin lowers blood glucose (mg/dL per unit)
- **Where**: User's Nightscout profile (`profile.store[name].sens`)
- **Format**: Time-based schedule array `[{ time: "HH:mm", value: number }]`
- **Default**: 50 mg/dL per unit
- **Tunability**: ✅ **Highly tunable** - Primary target of profile analysis
- **Used in**:
  - IOB glucose impact calculation
  - COB glucose impact calculation
  - Profile analyzer optimization (`holistic_profile_analyzer.py`)
  - **Bounds in optimizer**: [10, 200] mg/dL per unit

### 4. **ICR (Insulin to Carb Ratio)**
- **What**: Grams of carbs covered by 1 unit of insulin
- **Where**: User's Nightscout profile (`profile.store[name].carbratio`)
- **Format**: Time-based schedule array `[{ time: "HH:mm", value: number }]`
- **Default**: 10 grams per unit
- **Tunability**: ✅ **Highly tunable** - Primary target of profile analysis
- **Used in**:
  - COB calculations
  - Profile analyzer optimization (`holistic_profile_analyzer.py`)
  - **Bounds in optimizer**: [3, 50] grams per unit

### 5. **Basal Rates**
- **What**: Continuous background insulin delivery rate (units per hour)
- **Where**: User's Nightscout profile (`profile.store[name].basal`)
- **Format**: Time-based schedule array `[{ time: "HH:mm", value: number }]`
- **Default**: 1.0 U/hr
- **Tunability**: ✅ **Highly tunable** - Primary target of profile analysis
- **Used in**:
  - Basal IOB calculations (`iob-basal.ts`)
  - Profile analyzer optimization (`holistic_profile_analyzer.py`)
  - **Bounds in optimizer**: [0.1, 5.0] U/hr

### 6. **Autosens Ratio**
- **What**: Dynamic sensitivity adjustment factor (1.0 = baseline)
- **Where**: Latest DeviceStatus document (`openaps.suggested.sensitivityRatio`)
- **Default**: 1.0
- **Tunability**: ❌ **Not tunable** - Calculated by OpenAPS autosens algorithm
- **Used in**:
  - Effective ISF calculation: `effectiveISF = ISF / autosensRatio`
  - Glucose impact calculations (`iob-logic.ts`)

### 7. **Target Range**
- **What**: Desired blood glucose range (low and high targets)
- **Where**: User's Nightscout profile (`target_low`, `target_high`)
- **Format**: Time-based schedule arrays
- **Tunability**: ⚠️ **User preference** - Not calculated, set by user/clinician
- **Used in**: Recommendations and UI display

### 8. **Units**
- **What**: Glucose measurement units (mg/dL or mmol/L)
- **Where**: User's Nightscout profile (`profile.store[name].units`)
- **Default**: 'mg/dL'
- **Tunability**: ❌ **Not tunable** - User preference
- **Used in**: Unit conversions throughout system

---

## IOB (Insulin on Board) Calculations

### Constants

#### 1. **INTERVAL_MINUTES**
- **What**: Time resolution for IOB calculations
- **Value**: `5` minutes
- **Where**: `iob-curves.ts`
- **Tunability**: ❌ **Fixed** - Matches Nightscout's standard resolution
- **Used in**: All timeseries IOB calculations

### Functions

#### 1. **decayIOB(t, dia, peak)**
- **What**: Exponential IOB decay using integrated Gamma-style activity curve
- **Formula**: `IOB(t) = 1 - (activityIntegral(t) * normalization)`
  - Where `activityIntegral(t) = 1 - (1 + t/tau) * exp(-t/tau)`
  - `tau = peak` (in minutes)
  - `normalization = 1 / activityIntegral(dia * 60)`
- **Properties**:
  - `IOB(0) = 1` (100% at injection)
  - `IOB(DIA) = 0` (fully absorbed)
- **Where**: `insulin-math.ts`
- **Tunability**: ⚠️ **Formula-based** - Could be replaced with empirical curves

#### 2. **calculateInsulinEventCurve()**
- **What**: Generates IOB timeseries for a single insulin event
- **Parameters**:
  - `initialInsulin`: Insulin amount (units)
  - `eventTime`: When insulin was delivered
  - `targetTime`: Reference time ("now")
  - `dia`: Duration of insulin action
  - `peak`: Peak activity time
  - `includeFuture`: Whether to project future IOB
- **Returns**: Array of IOB values at 5-minute intervals
- **Where**: `iob-curves.ts`
- **Tunability**: ❌ **Calculation method** - Uses decayIOB function

#### 3. **getBasalIOB()**
- **What**: Calculates IOB from basal insulin (both delivered and scheduled)
- **Method**: Creates "basal buckets" at 5-minute intervals, applies decay curve to each
- **Returns**: 
  - `deliveredIOB`: IOB from actual basal delivery
  - `scheduledIOB`: IOB from scheduled basal rates
- **Where**: `iob-basal.ts`
- **Tunability**: ❌ **Calculation method**

#### 4. **calculateInsulinActivityRate()**
- **What**: Insulin absorption rate (units being absorbed in next 5 minutes)
- **Method**: `activity = max(0, IOB(now) - IOB(now+5min))`
- **Where**: `iob-logic.ts`
- **Tunability**: ❌ **Derived from IOB**

### Calculated Values

#### 1. **Net IOB**
- **Formula**: `netIOB = (bolusIOB + deliveredBasalIOB) - scheduledBasalIOB`
- **What**: Total insulin "excess" relative to basal needs
- **Tunability**: ❌ **Calculated**

#### 2. **Glucose Impact from IOB**
- **Formula**: `glucoseImpact = insulinActivityRate * (ISF / autosensRatio)`
- **What**: Expected glucose drop from insulin activity (mg/dL)
- **Tunability**: ✅ **Via ISF tuning**

#### 3. **SMB Threshold**
- **What**: Insulin amount threshold to classify as Super Micro Bolus
- **Value**: `0.7` units (hardcoded in `iob-logic.ts`)
- **Tunability**: ⚠️ **Could be made configurable**

---

## COB (Carbs on Board) Calculations

### Constants

#### 1. **DEFAULT_ABSORPTION_RATE_G_PER_HOUR**
- **Value**: `30` grams per hour
- **Where**: `cob-logic.ts`
- **Tunability**: ⚠️ **Could be personalized** - Literature suggests 20-40 g/hr range
- **Used in**: Fallback when profile-based rate unavailable

#### 2. **MAX_LOOKBACK_HOURS**
- **Value**: `12` hours
- **Where**: `cob-logic.ts`
- **Tunability**: ⚠️ **Could be adjusted** - Extended for long distributed meals
- **Used in**: COB calculation window

#### 3. **Min Carb Impact (openaps_smb_min_5m_carbimpact)**
- **What**: Minimum glucose impact from carbs per 5 minutes (mg/dL)
- **Where**: DeviceStatus configuration (`configuration.sensitivityConfiguration.openaps_smb_min_5m_carbimpact`)
- **Default**: `8` mg/dL per 5 minutes
- **Tunability**: ✅ **Configurable in OpenAPS** - Affects absorption rate calculation
- **Used in**: `calculateMinAbsorptionRate()`

### Functions

#### 1. **calculateMinAbsorptionRate(isf, cr, minCarbImpact)**
- **What**: Calculates minimum carb absorption rate based on sensitivity
- **Formula**: 
  ```
  sensitivity = ISF / CR
  rate = max(minCarbImpact / sensitivity, (5 g/hr / 60) * 5)
  ```
- **Returns**: Grams per 5 minutes
- **Where**: `cob-logic.ts`
- **Tunability**: ✅ **Via ISF, ICR, and minCarbImpact**

#### 2. **getTriangleParameters(carbs, absorbRate)**
- **What**: Calculates S-curve absorption parameters
- **Method**:
  - `effectiveRate = max(absorbRate, 10g/hr base)`
  - `linearDuration = (carbs / effectiveRate) * 5`
  - `duration = min(360, max(60, linearDuration * 1.2))` minutes
  - `peakTime = max(15, duration * 0.25)` minutes
- **Where**: `cob-logic.ts`
- **Tunability**: ⚠️ **Formula constants** - Could be personalized
  - **Duration cap**: 360 minutes (6 hours)
  - **Duration floor**: 60 minutes
  - **Peak ratio**: 0.25 (25% of duration)

#### 3. **getInstantBolusDynamics(t, carbs, duration, peak)**
- **What**: Calculates absorption rate and cumulative absorbed carbs at time t
- **Method**: Triangular absorption curve with linear ramp-up and decay
- **Formula**:
  - `peakRate = (2 * carbs) / duration`
  - Ramp-up (t < peak): `rate = peakRate * (t / peak)`
  - Decay (t >= peak): `rate = peakRate * ((duration - t) / (duration - peak))`
- **Returns**: `{ rate: g/min, absorbed: g }`
- **Where**: `cob-logic.ts`
- **Tunability**: ⚠️ **Geometric model** - Could be replaced with empirical curves

#### 4. **getBolusAbsorption(t, carbs, distributionDuration, absorbRate)**
- **What**: Handles both instant and distributed/extended carb entries
- **Method**:
  - Instant (duration < 5 min): Uses `getInstantBolusDynamics`
  - Distributed: Numerical superposition of multiple instant boluses
- **Returns**: `{ rate: g/5min, absorbed: g }`
- **Where**: `cob-logic.ts`
- **Tunability**: ❌ **Calculation method**

### Calculated Values

#### 1. **COB (Carbs on Board)**
- **Formula**: Sum of `(totalCarbs - absorbed)` for all carb events
- **What**: Total unabsorbed carbohydrates
- **Tunability**: ✅ **Via absorption rate parameters**

#### 2. **Pending COB vs Active COB**
- **Pending**: Carbs in distributed meal not yet "entered" system
  - `pending = carbs * (1 - timeSinceEvent / duration)` for distributed meals
- **Active**: `active = totalCOB - pendingCOB`
- **Tunability**: ❌ **Calculated from meal timing**

#### 3. **Glucose Impact from COB**
- **Formula**: `glucoseImpact = carbAbsorptionRate * (ISF / CR)`
- **What**: Expected glucose rise from carb absorption (mg/dL)
- **Tunability**: ✅ **Via ISF and ICR tuning**

---

## Activity Impact Calculations

### Constants (DEFAULT_ACTIVITY_COEFFICIENTS)

#### 1. **STEPS_PER_MINUTE**
- **Value**: `-1.0` mg/dL per step/min above baseline
- **What**: Glucose lowering effect of aerobic activity
- **Where**: `activity-impact.ts`
- **Tunability**: ✅ **Highly tunable** - Estimated by profile analyzer
- **Bounds in optimizer**: [-5.0, 0.0] mg/dL per step/min

#### 2. **CALORIES**
- **Value**: `-0.4` mg/dL per kcal
- **What**: Glucose lowering effect per calorie burned
- **Where**: `activity-impact.ts`
- **Tunability**: ⚠️ **Could be tuned** - Currently not in optimizer
- **Note**: Redundant with steps metric, may be removed

#### 3. **STAIRS (Floors)**
- **Value**: `+10.0` mg/dL per floor
- **What**: Initial glucose spike from anaerobic stress
- **Where**: `activity-impact.ts`
- **Tunability**: ⚠️ **Could be tuned** - Currently not in optimizer
- **Note**: Captures short-term anaerobic effect

#### 4. **HR_SPIKE**
- **Value**: `+15.0` mg/dL for 50% HR elevation
- **What**: Glucose spike from high heart rate elevation
- **Where**: `activity-impact.ts`
- **Tunability**: ✅ **Highly tunable** - Estimated by profile analyzer
- **Bounds in optimizer**: [0.0, 50.0] mg/dL per unit elevation

### Thresholds

#### 1. **Baseline Steps Per Minute**
- **Default**: `100` steps/min (when user baseline unavailable)
- **What**: Threshold for "moderate activity"
- **Tunability**: ✅ **Calculated from user data** via `calculateUserBaseline()`

#### 2. **Resting Heart Rate**
- **Default**: `70` bpm
- **What**: Baseline for HR elevation calculation
- **Tunability**: ✅ **Calculated from user data** via `calculateUserBaseline()`

#### 3. **HR Elevation Threshold**
- **Value**: `0.3` (30% above resting)
- **What**: Minimum elevation to apply HR impact
- **Where**: `activity-impact.ts` line 99
- **Tunability**: ⚠️ **Could be made configurable**

### Intensity Classification Thresholds

#### Steps Per Minute
- **Low**: < 60 steps/min
- **Moderate**: 60-100 steps/min
- **High**: 100-120 steps/min
- **Very High**: > 120 steps/min

#### Heart Rate Elevation
- **Low**: < 20% above resting
- **Moderate**: 20-40% above resting
- **High**: 40-60% above resting
- **Very High**: > 60% above resting

#### Stairs (Floors)
- **Low**: 0-2 floors
- **Moderate**: 2-5 floors
- **High**: > 5 floors

**Tunability**: ⚠️ **Hardcoded thresholds** - Could be personalized

### Functions

#### 1. **calculateActivityImpact()**
- **What**: Calculates total glucose impact from activity in a time window
- **Formula**:
  ```
  totalImpact = stepsImpact + caloriesImpact + stairsImpact + hrImpact
  ```
- **Where**: `activity-impact.ts`
- **Tunability**: ✅ **Via coefficient tuning**

#### 2. **calculateStepsImpact()**
- **Formula**:
  ```
  stepsPerMin = totalSteps / intervalMinutes
  intensity = (stepsPerMin - baseline) / baseline
  impact = intensity * STEPS_PER_MINUTE * intervalMinutes  (if intensity > 0)
  ```
- **Tunability**: ✅ **Via STEPS_PER_MINUTE coefficient**

#### 3. **calculateHRImpact()**
- **Formula**:
  ```
  hrElevation = (avgHR - restingHR) / restingHR
  impact = hrElevation * HR_SPIKE  (if elevation > 0.3)
  ```
- **Tunability**: ✅ **Via HR_SPIKE coefficient and threshold**

---

## Profile Analysis & Optimization

### Optimizer Configuration

#### 1. **Number of Time Blocks**
- **Value**: `6` blocks (4-hour blocks covering 24 hours)
- **What**: Temporal resolution for ISF, ICR, and basal rate estimation
- **Where**: `holistic_profile_analyzer.py`
- **Tunability**: ⚠️ **Could be increased** - Trade-off between precision and overfitting

#### 2. **Initial Guesses**
- **ISF**: `[50.0] * 6` mg/dL per unit
- **ICR**: `[10.0] * 6` grams per unit
- **Basal**: `[1.0] * 6` U/hr
- **Steps coefficient**: `-1.0` mg/dL per step/min
- **HR spike coefficient**: `15.0` mg/dL per unit elevation
- **Where**: `holistic_profile_analyzer.py` lines 126-134
- **Tunability**: ⚠️ **Starting points** - Optimizer finds optimal values

#### 3. **Parameter Bounds**
- **ISF**: [10, 200] mg/dL per unit
- **ICR**: [3, 50] grams per unit
- **Basal**: [0.1, 5.0] U/hr
- **Steps coefficient**: [-5.0, 0.0] mg/dL per step/min
- **HR spike coefficient**: [0.0, 50.0] mg/dL per unit
- **Where**: `holistic_profile_analyzer.py` lines 142-143
- **Tunability**: ⚠️ **Safety constraints** - Could be widened for edge cases

#### 4. **Regularization Parameters**

##### Lambda L2 (L2 Regularization Strength)
- **Value**: `0.1`
- **What**: Penalizes large deviations from initial guess
- **Purpose**: Prevents overfitting on small datasets
- **Where**: `holistic_profile_analyzer.py` line 148
- **Tunability**: ✅ **Tunable hyperparameter**
- **Effect**: Higher values → more conservative estimates

##### Lambda Smooth (Smoothness Penalty)
- **Value**: `0.05`
- **What**: Encourages gradual transitions between adjacent time blocks
- **Purpose**: Makes parameters more physiologically plausible
- **Where**: `holistic_profile_analyzer.py` line 149
- **Tunability**: ✅ **Tunable hyperparameter**
- **Effect**: Higher values → smoother 24-hour profiles

#### 5. **Optimization Method**
- **Algorithm**: L-BFGS-B (Limited-memory Broyden–Fletcher–Goldfarb–Shanno with Bounds)
- **Max Iterations**: 1000 (main), 500 (bootstrap)
- **Where**: `holistic_profile_analyzer.py` lines 151-158
- **Tunability**: ⚠️ **Could try other optimizers** (e.g., SLSQP, trust-constr)

### Window Weighting

#### 1. **Base Weight**
- **Value**: `1.0`
- **What**: Default weight for high-quality windows
- **Tunability**: ❌ **Reference value**

#### 2. **Quality Penalties**

##### Few Glucose Readings
- **< 6 readings**: Weight × 0.3
- **< 10 readings**: Weight × 0.6
- **Where**: `holistic_profile_analyzer.py` lines 267-272
- **Tunability**: ⚠️ **Could be adjusted**

##### Unexplained Glucose Increases (Unreported Meals)
- **> 80 mg/dL rise with < 40g carbs**: Weight × 0.2
- **> 50 mg/dL rise with < 20g carbs**: Weight × 0.4
- **Heuristic**: 1g carb ≈ 3-5 mg/dL rise
- **Where**: `holistic_profile_analyzer.py` lines 275-286
- **Tunability**: ⚠️ **Heuristic thresholds** - Could be refined

#### 3. **Quality Bonuses**

##### Stable Windows
- **Bonus**: Weight × 1.3
- **Definition**: Glucose change < 20 mg/dL
- **Where**: `holistic_profile_analyzer.py` line 290
- **Tunability**: ⚠️ **Could be adjusted**

##### Good Data Quality
- **Bonus**: Weight × 1.1
- **Condition**: >= 12 glucose readings
- **Where**: `holistic_profile_analyzer.py` line 294
- **Tunability**: ⚠️ **Could be adjusted**

### Confidence Intervals

#### 1. **Bootstrap Iterations**
- **Value**: `100` resampling iterations
- **What**: Number of bootstrap samples for confidence interval estimation
- **Where**: `holistic_profile_analyzer.py` line 312
- **Tunability**: ⚠️ **Trade-off** - More iterations = better CI, slower computation

#### 2. **Confidence Level**
- **Value**: `0.95` (95% confidence)
- **What**: Statistical confidence level for parameter intervals
- **Where**: `holistic_profile_analyzer.py` line 313
- **Tunability**: ⚠️ **Could use 90% or 99%**

---

## Insulin Activity Curves

### Mathematical Model

#### 1. **Activity Integral Function**
- **Formula**: `activityIntegral(t) = 1 - (1 + t/tau) * exp(-t/tau)`
- **What**: Cumulative insulin absorption from 0 to t
- **Where**: `insulin-math.ts`, `profile-analysis-logic.ts`
- **Properties**:
  - Monotonically increasing
  - Approaches 1.0 as t → ∞
  - Derivative is the Gamma-style activity curve
- **Tunability**: ❌ **Mathematical model** - Could be replaced with empirical data

#### 2. **Normalization Factor**
- **Formula**: `normalization = 1 / activityIntegral(DIA * 60)`
- **What**: Ensures 100% absorption at DIA
- **Tunability**: ❌ **Derived from model**

#### 3. **Activity in Time Window**
- **Formula**: `absorbed = (activityIntegral(t2) - activityIntegral(t1)) * normalization`
- **What**: Fraction of insulin absorbed between t1 and t2
- **Where**: `profile-analysis-logic.ts` lines 330-345
- **Tunability**: ❌ **Calculation method**

---

## Carb Absorption Curves

### S-Curve Model Parameters

#### 1. **Minimum Base Rate**
- **Value**: `10` g/hr
- **What**: Floor for absorption rate calculation
- **Where**: `cob-logic.ts` line 45
- **Tunability**: ⚠️ **Could be personalized**

#### 2. **Duration Multiplier**
- **Value**: `1.2`
- **What**: Extends linear duration for S-curve shape
- **Where**: `cob-logic.ts` line 49
- **Tunability**: ⚠️ **Curve shape parameter**

#### 3. **Duration Constraints**
- **Maximum**: `360` minutes (6 hours)
- **Minimum**: `60` minutes (1 hour)
- **Where**: `cob-logic.ts` line 49
- **Tunability**: ⚠️ **Physiological limits**

#### 4. **Peak Time Ratio**
- **Value**: `0.25` (25% of total duration)
- **Minimum**: `15` minutes
- **Where**: `cob-logic.ts` line 50
- **Tunability**: ⚠️ **Curve shape parameter**

### Distributed Meal Handling

#### 1. **Instant Threshold**
- **Value**: `5` minutes
- **What**: Duration below which meal is treated as instant bolus
- **Where**: `cob-logic.ts` line 87
- **Tunability**: ❌ **Implementation detail**

#### 2. **Superposition Step Size**
- **Value**: `1` minute
- **What**: Time resolution for distributed meal simulation
- **Where**: `cob-logic.ts` line 96
- **Tunability**: ⚠️ **Accuracy vs performance trade-off**

---

## Time Window Analysis

### Window Configuration

#### 1. **Window Duration**
- **Default**: `2` hours
- **What**: Size of analysis windows for profile optimization
- **Where**: `profile-analysis-logic.ts`
- **Tunability**: ⚠️ **Could be adjusted** - Trade-off between data points and resolution

#### 2. **Lookback Period**
- **Default**: `30` days
- **What**: Historical period for profile analysis
- **Where**: `profile-analysis-logic.ts`
- **Tunability**: ✅ **User configurable** - More data = better estimates

#### 3. **Treatment Lookback Margin**
- **DIA Margin**: `7` hours
- **Carb/Basal Margin**: `24` hours
- **What**: Extra lookback for treatment tails
- **Where**: `profile-analysis-logic.ts` lines 92-94
- **Tunability**: ⚠️ **Safety margin**

### Data Quality Thresholds

#### 1. **Minimum Windows for Analysis**
- **Value**: `10` windows
- **What**: Minimum data required for profile analysis
- **Where**: `holistic_profile_analyzer.py` line 105
- **Tunability**: ⚠️ **Statistical minimum**

#### 2. **Glucose Reading Proximity**
- **Value**: `15` minutes
- **What**: Maximum time difference for "closest" glucose reading
- **Where**: `profile-analysis-logic.ts` line 380
- **Tunability**: ⚠️ **Data quality threshold**

#### 3. **Stability Threshold**
- **Value**: `20` mg/dL
- **What**: Maximum glucose change for "stable" window
- **Where**: `profile-analysis-logic.ts` line 243
- **Tunability**: ⚠️ **Could be adjusted based on user variability**

---

## Summary: Tunability Matrix

| Parameter | Current Value | Tunability | Priority | Method |
|-----------|--------------|------------|----------|--------|
| **ISF** | Profile-based | ✅ High | 🔴 Critical | Profile analyzer optimization |
| **ICR** | Profile-based | ✅ High | 🔴 Critical | Profile analyzer optimization |
| **Basal Rates** | Profile-based | ✅ High | 🔴 Critical | Profile analyzer optimization |
| **Activity: Steps/min** | -1.0 mg/dL | ✅ High | 🟡 Important | Profile analyzer optimization |
| **Activity: HR Spike** | +15.0 mg/dL | ✅ High | 🟡 Important | Profile analyzer optimization |
| **DIA** | 5 hours | ⚠️ Semi | 🟡 Important | Literature + empirical validation |
| **Peak Time** | 45/55 min | ⚠️ Semi | 🟡 Important | Insulin type + empirical validation |
| **Min Carb Impact** | 8 mg/dL/5min | ✅ Medium | 🟢 Low | OpenAPS configuration |
| **Absorption Rate** | 30 g/hr base | ⚠️ Semi | 🟢 Low | Could be personalized |
| **Lambda L2** | 0.1 | ✅ Medium | 🟢 Low | Hyperparameter tuning |
| **Lambda Smooth** | 0.05 | ✅ Medium | 🟢 Low | Hyperparameter tuning |
| **Window Duration** | 2 hours | ⚠️ Semi | 🟢 Low | Analysis configuration |
| **Time Blocks** | 6 (4-hr each) | ⚠️ Semi | 🟢 Low | Could increase resolution |

### Legend
- ✅ **High**: Actively tuned by system or highly configurable
- ⚠️ **Semi**: Could be tuned but requires careful validation
- ❌ **Not tunable**: Fixed by design, calculation, or external source
- 🔴 **Critical**: Core parameters affecting all predictions
- 🟡 **Important**: Significant impact on specific scenarios
- 🟢 **Low**: Fine-tuning or edge case parameters

---

## Recommendations for Future Tuning

### High Priority
1. **Expand activity coefficient estimation** to include calories and stairs
2. **Personalize carb absorption rates** based on historical data
3. **Add meal type classification** (high-fat, high-protein) with different absorption curves
4. **Implement circadian rhythm detection** for time-of-day ISF variations

### Medium Priority
5. **Tune DIA and Peak** using empirical IOB decay curves from CGM data
6. **Optimize regularization parameters** (lambda_l2, lambda_smooth) via cross-validation
7. **Increase time block resolution** from 6 to 12 or 24 blocks for finer control
8. **Add stress/illness detection** with temporary ISF adjustments

### Low Priority
9. **Personalize stability thresholds** based on user's typical glucose variability
10. **Optimize window weighting** penalties and bonuses using validation data
11. **Add meal complexity scoring** (simple carbs vs complex carbs)
12. **Implement adaptive lookback periods** based on data availability

---

## Data Sources Summary

### From User Profile (Nightscout)
- ISF (sens)
- ICR (carbratio)
- Basal rates
- DIA
- Target ranges
- Units

### From DeviceStatus
- Autosens ratio
- Min carb impact
- Reported IOB/COB

### From Treatments
- Insulin doses (boluses)
- Carb entries
- Temp basals
- Profile switches

### From Entries
- Glucose readings (SGV)
- Activity data (steps, heart rate)

### Calculated/Derived
- IOB (from insulin + decay curve)
- COB (from carbs + absorption curve)
- Activity impact (from biometrics + coefficients)
- Insulin activity rate
- Carb absorption rate
- Glucose impacts

### Hardcoded Constants
- Interval resolution (5 min)
- Default values (DIA=5, ISF=50, etc.)
- Optimizer bounds
- Quality thresholds
- Intensity classifications

---

*Document Version: 1.0*  
*Last Updated: 2026-01-17*  
*Maintainer: Freddy Development Team*
