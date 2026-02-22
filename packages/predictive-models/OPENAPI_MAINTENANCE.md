# OpenAPI Specification - Maintenance Guide

## Overview

The `openapi.json` file in `packages/predictive-models/` contains the complete OpenAPI 3.1.0 specification for the Predictive Models Service API.

## Current Status

✅ **Up to date** as of 2026-01-18

The spec includes all endpoints, including the newly added:
- `POST /api/v1/tune/insulin-response` - Insulin response parameter tuning

## How to Update

### Automatic Generation (Recommended)

The OpenAPI spec is automatically generated from FastAPI's schema. To regenerate:

```bash
cd packages/predictive-models
python generate_openapi.py
```

This script:
1. Imports the FastAPI app
2. Calls `app.openapi()` to generate the spec
3. Writes to `openapi.json`

### Manual Verification

After generation, verify the spec:

```powershell
# Check for new endpoint
Select-String -Path "openapi.json" -Pattern "insulin-response"

# Validate JSON
$json = Get-Content "openapi.json" -Raw | ConvertFrom-Json
Write-Host "Valid JSON with $($json.paths.Count) endpoints"
```

## When to Update

Update the OpenAPI spec whenever you:

1. **Add new endpoints** (routers)
2. **Modify request/response schemas** (Pydantic models)
3. **Change endpoint descriptions** or metadata
4. **Update API version** or service info

## Included Endpoints

Current endpoints in the spec:

### Training
- `POST /api/v1/train` - Train a new model

### Prediction
- `POST /api/v1/predict` - Make predictions

### Glucose Prediction
- `POST /api/v1/glucose/predict` - Glucose predictions

### Profile Tuning
- `POST /api/v1/profile/tune` - Profile parameter tuning

### Profile Estimation
- `POST /api/v1/profile/estimate` - Estimate profile parameters

### Profile Analysis
- `POST /api/v1/analyze/profile` - Holistic profile analysis



### **Insulin Response Tuning** ✅ NEW
- `POST /api/v1/tune/insulin-response` - Optimize DIA, Peak, ISF

## Schema Validation

The spec includes complete schemas for:

### Request Models
- `InsulinResponseTuningRequest`
  - `windows`: Array of time window data
  - `current_dia`: Current DIA value (hours)
  - `current_peak`: Current peak time (minutes)
  - `current_isf`: Current ISF schedule (6 blocks)
  - `optimize_dia`: Whether to optimize DIA
  - `optimize_peak`: Whether to optimize peak
  - `optimize_isf`: Whether to optimize ISF
  - `lambda_l2`: L2 regularization strength
  - `lambda_smooth`: Smoothness penalty strength

### Response Models
- `InsulinResponseTuningResponse`
  - `dia`: Optimized DIA
  - `peak`: Optimized peak time
  - `isf`: Optimized ISF schedule (6 blocks)
  - `dia_confidence`: 95% confidence interval for DIA
  - `peak_confidence`: 95% confidence interval for peak
  - `isf_confidence`: 95% confidence intervals for ISF
  - `r_squared`: Model fit quality
  - `rmse`: Root mean squared error
  - `mae`: Mean absolute error
  - `windows_analyzed`: Number of windows used
  - `total_windows`: Total windows provided
  - `stable_windows`: Count of stable periods
  - `meal_windows`: Count of meal periods
  - `activity_windows`: Count of activity periods
  - `data_quality_score`: Overall data quality (0-1)
  - `recommendation`: Human-readable recommendation text

## Integration

The OpenAPI spec can be used for:

1. **API Documentation** - Auto-generated docs at `/docs` and `/redoc`
2. **Client Generation** - Generate TypeScript/Python clients
3. **Testing** - Validate requests/responses
4. **Contract Testing** - Ensure API compatibility

## Troubleshooting

### Issue: Logging output in JSON file

**Problem**: The generated file starts with logging output instead of `{`

**Solution**: The `generate_openapi.py` script now handles this automatically, but if needed:

```powershell
$content = Get-Content "openapi.json" -Raw
$jsonStart = $content.IndexOf('{')
$cleanJson = $content.Substring($jsonStart)
Set-Content "openapi.json" -Value $cleanJson -NoNewline
```

### Issue: Import errors when generating

**Problem**: Python can't import the app

**Solution**: Ensure you're in the correct directory and dependencies are installed:

```bash
cd packages/predictive-models
pip install -r requirements.txt
python generate_openapi.py
```

## Automation

Consider adding to CI/CD:

```yaml
# .github/workflows/update-openapi.yml
name: Update OpenAPI Spec
on:
  push:
    paths:
      - 'packages/predictive-models/app/**/*.py'
jobs:
  update-spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Generate OpenAPI spec
        run: |
          cd packages/predictive-models
          python generate_openapi.py
      - name: Commit if changed
        run: |
          git diff --quiet openapi.json || \
          (git add openapi.json && \
           git commit -m "Update OpenAPI spec" && \
           git push)
```

---

**Last Updated**: 2026-01-18  
**Spec Version**: 3.1.0  
**Service Version**: 1.0.0
