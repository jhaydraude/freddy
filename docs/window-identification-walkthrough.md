# Profile Analysis Window Identification - Complete Walkthrough

This document explains how time windows are created and classified for holistic profile analysis.

---

## Overview

**Location**: [`profile-analysis-logic.ts`](file:///D:/Dev/NightManager/src/lib/profile-analysis-logic.ts)  
**Purpose**: Generate fixed 2-hour time windows, calculate glucose/insulin/carb metrics for each window  
**Output**: Array of `ITimeWindow` objects used by Python optimizer

---

## Step 1: Initialization (Lines 51-63)

```typescript
const {
    endDate = new Date(),       // Default: now
    daysBack = 30,              // Default: 30 days
    windowHours = 2             // Default: 2-hour windows
} = options;

// Calculate start date from end date and days back
const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);
```

**What happens**: Parse options with defaults. Calculate startDate from endDate looking back daysBack days.

**Example**:
- `endDate`: 2025-12-23 (now)
- `daysBack`: 30
- Calculated `startDate`: 2025-11-23 (30 days ago)

---

## Step 2: Batch Data Fetch (Lines 63-84)

```typescript
const [glucoseEntries, treatments] = await Promise.all([
    Entry.find({
        type: 'sgv',
        date: { $gte: startDate.getTime(), $lte: endDate.getTime() }
    }).sort({ date: 1 }).lean(),
    
    Treatment.find({
        created_at: { $gte: startDate.toISOString(), $lte: endDate.toISOString() }
    }).sort({ created_at: 1 }).lean()
]);
```

**What happens**: Fetch ALL data upfront for the entire date range (performance optimization).

**Example output**:
```
📦 Fetching all data...
  Loaded 154,629 glucose readings
  Loaded 8,303 treatments
```

**Why batch?** Originally queried per-window (~6 queries each), which was extremely slow. Batching reduced processing from ~4 minutes to ~30 seconds for 128 windows.

---

## Step 3: Generate Fixed Time Windows (Lines 86-94)

```typescript
let currentTime = startDate.getTime();
const endTime = endDate.getTime();

while (currentTime < endTime) {
    const windowStart = new Date(currentTime);
    const windowEnd = new Date(Math.min(currentTime + windowMs, endTime));
    
    // ... process window ...
    
    currentTime += windowMs;  // Move to next window
}
```

**What happens**: Create non-overlapping windows covering the entire period.

**Example for 6 months with 2-hour windows**:
- Total duration: 184 days
- Hours: 184 × 24 = 4,416 hours
- Windows: 4,416 ÷ 2 = **2,208 windows**
- Actual generated: **6,403 windows** (every 2 hours, non-overlapping)

---

## Step 4: Find Glucose at Window Boundaries (Lines 100-108)

```typescript
const glucoseAtStart = findClosestGlucose(glucoseEntries, windowStart);
const glucoseAtEnd = findClosestGlucose(glucoseEntries, windowEnd);

if (!glucoseAtStart || !glucoseAtEnd) {
    currentTime += windowMs;
    continue; // Skip if no glucose data
}
```

**Helper function `findClosestGlucose` (lines 197-219)**:
```typescript
function findClosestGlucose(
    glucoseEntries: any[],
    timestamp: Date,
    maxDeltaMinutes: number = 15  // Must be within 15 minutes
): { sgv: number, date: number } | null
```

**What happens**: 
1. Find glucose reading closest to window start/end timestamp
2. Must be within **15 minutes** of the target time
3. If no glucose within 15 min, skip this window entirely

**Why skip?** Can't calculate glucose change without both endpoints.

---

## Step 5: Count Glucose Readings in Window (Lines 110-113)

```typescript
const glucoseInWindow = glucoseEntries.filter(e =>
    e.date >= windowStart.getTime() && e.date <= windowEnd.getTime()
);
```

**What happens**: Count how many CGM readings fall within this window.

**Typical**: 
- CGM samples every 5 minutes
- 2-hour window = 24 readings (ideally)
- Used for quality assessment

---

## Step 6: Filter Treatments in Window (Lines 115-119)

```typescript
const treatmentsInWindow = treatments.filter(t => {
    const tTime = new Date(t.created_at).getTime();
    return tTime >= windowStart.getTime() && tTime <= windowEnd.getTime();
});
```

**What happens**: Find all insulin/carb treatments that occurred during this window.

---

## Step 7: Accumulate Insulin and Carbs (Lines 121-143)

### Initialize Counters (Lines 121-125)
```typescript
let bolusInsulin = 0;
let carbsConsumed = 0;
let carbEvents = 0;
let hasMeals = false;
let hasCorrections = false;
```

### Process Each Treatment (Lines 127-143)
```typescript
for (const t of treatmentsInWindow) {
    // INSULIN DETECTION
    if (t.insulin && t.insulin > 0) {
        bolusInsulin += t.insulin;
        
        if (t.carbs && t.carbs > 0) {
            hasMeals = true;  // Insulin WITH carbs = meal bolus
        } else {
            hasCorrections = true;  // Insulin WITHOUT carbs = correction
        }
    }
    
    // CARB DETECTION
    if (t.carbs && t.carbs > 0) {
        carbsConsumed += t.carbs;
        carbEvents++;
        hasMeals = true;  // ANY carbs = meal window (fixed!)
    }
}
```

**Classification Logic**:

| Treatment Type | `bolusInsulin` | `carbsConsumed` | `hasMeals` | `hasCorrections` |
|---|---|---|---|---|
| Insulin only (2.5U) | +2.5 | 0 | false | ✅ true |
| Carbs only (45g) | 0 | +45 | ✅ true | false |
| Insulin + Carbs (3U + 60g) | +3.0 | +60 | ✅ true | false |
| Multiple treatments | Σ all | Σ all | true if ANY carbs | true if ANY insulin-only |

---

## Step 8: Estimate Basal Insulin (Lines 145-148)

```typescript
// TODO: Get actual basal delivery from treatments or calculate from profile
const basalRate = 1.0; // Placeholder - should get from profile
const basalInsulin = basalRate * windowHours;
```

**Current behavior**: Hardcoded to 1.0 U/hr  
**Problem**: Doesn't use actual basal rate!  
**Impact**: Affects net insulin calculation in optimizer

**For 2-hour window**: `basalInsulin = 1.0 × 2 = 2.0 U`

---

## Step 9: Calculate Totals and Classify (Lines 150-154)

```typescript
const totalInsulin = bolusInsulin + basalInsulin;
const glucoseChange = glucoseAtEnd.sgv - glucoseAtStart.sgv;

// Determine if stable (glucose change < 20 mg/dL)
const isStable = Math.abs(glucoseChange) < 20;
```

**Classifications**:
- **Stable**: Glucose change < 20 mg/dL (in either direction)
- **Unstable**: Glucose change ≥ 20 mg/dL

**Example**:
- Start: 120 mg/dL, End: 135 mg/dL → Change: +15 → Stable ✅
- Start: 120 mg/dL, End: 145 mg/dL → Change: +25 → Unstable ❌

---

## Step 10: Create Window Object (Lines 156-177)

```typescript
windows.push({
    start: windowStart,              // 2024-06-23T00:00:00.000Z
    end: windowEnd,                  // 2024-06-23T02:00:00.000Z
    duration_hours: windowHours,     // 2
    
    // GLUCOSE
    glucose_start: glucoseAtStart.sgv,        // 120
    glucose_end: glucoseAtEnd.sgv,            // 135
    glucose_change: glucoseChange,            // +15
    glucose_readings_count: glucoseInWindow.length,  // 24
    
    // INSULIN
    bolus_insulin: bolusInsulin,              // 3.5 U
    basal_insulin_delivered: basalInsulin,    // 2.0 U (hardcoded)
    total_insulin: totalInsulin,              // 5.5 U
    
    // CARBS
    carbs_consumed: carbsConsumed,            // 45 g
    carb_events_count: carbEvents,            // 1
    
    // CLASSIFICATION
    hour_of_day: windowStart.getHours(),      // 0 (midnight)
    is_stable: isStable,                      // true
    has_meals: hasMeals,                      // true
    has_corrections: hasCorrections           // false
});
```

---

## Step 11: Error Handling (Lines 179-181)

```typescript
} catch (error) {
    console.error(`Error processing window starting at ${windowStart.toISOString()}:`, error);
}
```

**What happens**: If any error occurs (e.g., malformed data), log it and continue to next window.

---

## Step 12: Summary Statistics (Lines 186-189)

```typescript
console.log(`\n✅ Generated ${windows.length} time windows`);
console.log(`  Stable windows: ${windows.filter(w => w.is_stable).length}`);
console.log(`  Windows with meals: ${windows.filter(w => w.has_meals).length}`);
console.log(`  Windows with corrections: ${windows.filter(w => w.has_corrections).length}\n`);
```

**Example output (6 months)**:
```
✅ Generated 6403 time windows
  Stable windows: 2981 (47%)
  Windows with meals: 0 → NOW FIXED!
  Windows with corrections: 10
```

---

## Key Issues & Improvements

### ⚠️ Issue 1: Hardcoded Basal Rate (Line 147)
**Current**: `const basalRate = 1.0;`  
**Problem**: Uses 1.0 U/hr for ALL windows  
**Impact**: Inaccurate net insulin calculation  
**Fix needed**: Fetch actual basal rate from active profile for each window's hour

### ✅ Fixed: Meal Window Detection (Line 141)
**Was**: Only detected meals if insulin+carbs in same entry  
**Now**: Detects ANY carb entry  
**Impact**: Should now properly classify meal windows

### 📊 Window Quality Filtering
**Location**: Python service (`holistic_profile_analyzer.py`)  
**After generation**: Additional filtering removes windows with unexplained glucose increases  
**6-month analysis**: 6,403 generated → 5,751 used (652 filtered)

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────┐
│ 1. Batch fetch ALL glucose + treatments for date range │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 2. Loop: Create 2-hour windows (non-overlapping)       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 3. Find glucose at start/end (within 15 min)           │
│    → Skip window if missing                             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 4. Filter treatments in window                          │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 5. Sum: insulin, carbs, classify meal/correction        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 6. Add hardcoded basal (TODO: use actual rate)          │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 7. Calculate glucose change, classify stable            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 8. Create ITimeWindow object                            │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ 9. Send windows to Python for optimization              │
│    → Quality filter removes unexplained glucose spikes  │
│    → Bootstrap confidence intervals                      │
│    → Parameter estimates                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps / TODOs

1. **Fix hardcoded basal rate** (line 147) - fetch from profile
2. **Test meal window detection** - re-run analysis to verify fix
3. **Consider variable window sizes** - maybe 3-4 hours for more stable estimates?
4. **Add temp basal handling** - account for temporary basal rate changes
