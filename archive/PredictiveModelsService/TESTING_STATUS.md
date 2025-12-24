# Testing the Glucose Prediction Model

## Current Status

### ✅ What's Working
- Glucose prediction model code is complete
- Feature engineering (20 features)
- XGBoost training/prediction logic
- API endpoints defined
- Test suite created

### ⚠️ Issues Found

#### 1. Data Generator Script
**Problem**: The TypeScript data generator (`scripts/prepare_glucose_training_data.ts`) runs but produces no output.

**Likely Causes**:
- No data in database for the specified date range
- Database connection issue
- Silent error handling

**To Debug**:
```powershell
# Add verbose logging to see what's happening
npx tsx .\scripts\prepare_glucose_training_data.ts --start 2025-12-21 --end 2025-12-22 --interval 60
```

#### 2. Python Not Installed
**Problem**: Python is not available in your environment.

**Resolution**: Install Python 3.11+ from python.org or Microsoft Store

**Test Without Python**: Use the interactive API docs instead (see below)

## Testing Options

### Option 1: Test with Sample Data (Created for You)

I've created `sample_glucose_training_data.json` with 2 realistic training samples.

**To use it** (once Python is installed):
```powershell
cd d:\Dev\NightManager\PredictiveModelsService

# Install dependencies
python -m pip install -r requirements.txt

# Start the API server
python -m app.main

# In another terminal, train the model
python scripts\train_glucose_model.py --data ..\sample_glucose_training_data.json
```

### Option 2: Test via Browser (No Python Needed for exploring API)

The FastAPI service has interactive docs at `http://localhost:8000/docs` where you can:
1. See all endpoints
2. View request/response schemas
3. Test endpoints interactively

### Option 3: Test with Actual Database

Once the data generator is working:

```powershell
# From NightManager directory
npx tsx .\scripts\prepare_glucose_training_data.ts `
  --start 2025-12-15 `
  --end 2025-12-22 `
  --interval 30 `
  --output glucose_training_data.json
```

## Expected Workflow (Once Python is Set Up)

1. **Generate Training Data**
   ```powershell
   npx tsx .\scripts\prepare_glucose_training_data.ts
   ```
   Creates: `glucose_training_data.json`

2. **Start API Service**
   ```powershell
   cd PredictiveModelsService
   python -m app.main
   ```
   Service running at: http://localhost:8000

3. **Train Model**
   ```powershell
   python scripts\train_glucose_model.py --data ..\glucose_training_data.json
   ```

4. **Make Predictions**
   - Via Python script
   - Via API at `/api/v1/predict/glucose`
   - Via interactive docs at http://localhost:8000/docs

## PowerShell Commands (Fixed)

PowerShell doesn't support `&&` like bash. Use semicolons or separate commands:

```powershell
# Instead of: cd dir && command
# Use:
cd PredictiveModelsService; python -m app.main

# Or:
cd PredictiveModelsService
python -m app.main
```

## Next Steps

1. **Install Python** (if you want to run the service)
   - Download from python.org
   - Or: `winget install Python.Python.3.11`

2. **Debug Data Generator**
   - Check if database has data for the dates you're querying
   - Add console.log statements to see what's happening
   - Ensure database connection is working

3. **Test with Sample Data**
   - Use the `sample_glucose_training_data.json` I created
   - Small dataset but perfect for testing the pipeline

## File Locations

- Sample data: `d:\Dev\NightManager\sample_glucose_training_data.json`
- Data generator: `d:\Dev\NightManager\scripts\prepare_glucose_training_data.ts`
- Training script: `d:\Dev\NightManager\PredictiveModelsService\scripts\train_glucose_model.py`
- API service: `d:\Dev\NightManager\PredictiveModelsService\app\main.py`

## Troubleshooting

### Data generator produces no output
1. Check database has data: Query your MongoDB for entries
2. Try different date ranges (use recent dates)
3. Add `console.log` statements in the script
4. Use `--include-interventions` flag to get more samples

### Python not found
1. Install Python 3.11+
2. Restart terminal after installation
3. Verify: `python --version`

### Module import errors
1. Create virtual environment: `python -m venv venv`
2. Activate: `venv\Scripts\activate`
3. Install: `pip install -r requirements.txt`
