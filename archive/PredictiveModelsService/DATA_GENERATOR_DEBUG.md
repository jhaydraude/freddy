# Data Generator Troubleshooting

## Issue
The data generator (`scripts/prepare_glucose_training_data.ts`) runs but produces no output files, suggesting:
- No data in database for the requested date ranges
- Potential database connection issue

## Date Ranges Tested (all returned 0 samples)
- 2024-12-22 to 2025-12-22 (1 year)
- 2025-12-20 to 2025-12-22 (recent 2 days)
- 2025-12-01 to 2025-12-22 (December 2025)

## Options to Proceed

### Option 1: Use Sample Data (Quick Test)
The `sample_glucose_training_data.json` has only 2 samples but we need at least 10.

**Quick fix**: Duplicate samples with variation to get 10+

### Option 2: Find Your Actual Data Range
Check your MongoDB to see what dates have data:
```javascript
// In MongoDB shell or query tool
db.entries.find().sort({date: -1}).limit(1)  // Latest entry
db.entries.find().sort({date: 1}).limit(1)   // Earliest entry
```

Then run the generator with those actual dates.

### Option 3: Debug the Generator
Add console.log statements to see what's happening:
1. Is it connecting to the database?
2. Are there any entries found?
3. Are samples being filtered out?

## Recommended Next Step
Check which dates have data in your database, then we can generate training samples for that specific range.
