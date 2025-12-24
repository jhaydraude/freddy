# Meal Window Detection Issue - Diagnosis & Fix

## Problem Identified

**Current Result**: 0 meal windows detected out of 6,403 windows  
**Root Cause**: Overly restrictive detection logic

## How Window Classification Works

Location: [`profile-analysis-logic.ts`](file:///D:/Dev/NightManager/src/lib/profile-analysis-logic.ts#L127-L142)

```typescript
for (const t of treatmentsInWindow) {
    if (t.insulin && t.insulin > 0) {
        bolusInsulin += t.insulin;
        
        if (t.carbs && t.carbs > 0) {
            hasMeals = true;  // ❌ PROBLEM: Only if insulin AND carbs in SAME entry
        } else {
            hasCorrections = true;
        }
    }
    
    if (t.carbs && t.carbs > 0) {
        carbsConsumed += t.carbs;
        carbEvents++;
    }
}
```

## The Problem

**Current Logic**: `has_meals = true` **ONLY IF**:
- A single treatment entry has **both** insulin > 0 **AND** carbs > 0

**What This Misses**:
1. ❌ Carb-only entries (no insulin logged with them)
2. ❌ Separate entries for insulin and carbs
3. ❌ Manual bolus followed by separate carb entry

## Your Data Pattern (Last 30 Days)

From diagnostic script:

```
Total treatments: 1,022
  Insulin + Carbs (same entry): 0    ← Would detect as meals
  Insulin only: [most entries]
  Carbs only: [some entries]         ← Currently MISSED

✅ Would detect: 0 meal windows
❌ Would miss: All carb entries
```

**Examples of Missed Carbs**:
```
2025-11-27, 12:31:31 p.m.: 10g
2025-11-27, 3:37:26 p.m.: 10g
2025-11-28, 8:45:58 p.m.: 10g
```

## The Fix

Change detection logic to mark `has_meals = true` if **any** carb entry exists in the window, regardless of insulin:

**Current (Wrong)**:
```typescript
if (t.insulin && t.insulin > 0) {
    bolusInsulin += t.insulin;
    
    if (t.carbs && t.carbs > 0) {
        hasMeals = true;  // Only if BOTH in same entry
    } else {
        hasCorrections = true;
    }
}
```

**Fixed (Correct)**:
```typescript
for (const t of treatmentsInWindow) {
    if (t.insulin && t.insulin > 0) {
        bolusInsulin += t.insulin;
        
        if (t.carbs && t.carbs > 0) {
            hasMeals = true;
        } else {
            hasCorrections = true;
        }
    }
    
    // Mark as meal window if ANY carbs present
    if (t.carbs && t.carbs > 0) {
        carbsConsumed += t.carbs;
        carbEvents++;
        hasMeals = true;  // ← ADDED: Detect meals from carb entries
    }
}
```

## Impact of Fix

**Before Fix**: 0 meal windows  
**After Fix**: Should detect windows with carb entries

This will allow the analyzer to:
- Distinguish meal windows from corrections
- Better understand carb impact on glucose
- Potentially improve model fit (though unreported carbs still an issue)

## Implementation Status

- ✅ Issue diagnosed
- ⏳ Fix ready to apply
- ⏳ Code update needed
- ⏳ Re-run analysis to verify
