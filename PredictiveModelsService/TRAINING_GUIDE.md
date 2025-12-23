# Glucose Prediction Model - Training Guide

## Overview

This guide walks through generating training data and training the glucose prediction model.

## Prerequisites

1. **NightManager** running with database access
2. **PredictiveModelsService** installed and running
   ```bash
   cd d:\Dev\NightManager\PredictiveModelsService
   pip install -r requirements.txt
   python -m app.main
   ```

## Step 1: Generate Training Data

Run the data generator from the NightManager directory:

```bash
cd d:\Dev\NightManager

# Generate training data for the last 7 days
npx tsx scripts/prepare_glucose_training_data.ts

# Or with custom options:
npx tsx scripts/prepare_glucose_training_data.ts \
  --start 2024-01-01 \
  --end 2024-01-31 \
  --interval 30 \
  --output my_training_data.json
```

### Options

- `--start <date>` - Start date (default: 7 days ago)
- `--end <date>` - End date (default: 2 hours ago)
- `--interval <minutes>` - Time between training points (default: 30)
- `--output <path>` - Output file (default: glucose_training_data.json)
- `--include-interventions` - Include samples where carbs/insulin occurred
- `--min-samples <n>` - Minimum samples to generate (default: 100)

### How It Works

For each training point T:
1. **Collects input**: status_history from T-60min to T
2. **Checks interventions**: Looks for carbs/insulin from T to T+60min
3. **Gets label**: Actual glucose at T+60min
4. **Filters**: By default, excludes samples with interventions

### Output Format

```json
{
  "generated_at": "2024-01-15T10:00:00Z",
  "options": { ... },
  "summary": {
    "total_samples": 200,
    "with_interventions": 50,
    "without_interventions": 150
  },
  "samples": [
    {
      "training_point": "2024-01-10T14:30:00Z",
      "status_history": [ ... ],
      "actual_glucose_60min": 125.5,
      "had_intervention": false
    }
  ]
}
```

## Step 2: Train the Model

Use the training script to send data to the API:

```bash
cd d:\Dev\NightManager\PredictiveModelsService

# Train with default parameters
python scripts/train_glucose_model.py --data ../glucose_training_data.json

# Or customize:
python scripts/train_glucose_model.py \
  --data ../glucose_training_data.json \
  --model-name glucose_predictor_v1 \
  --test-size 0.2 \
  --max-depth 8 \
  --n-estimators 150 \
  --learning-rate 0.05
```

### Training Options

- `--data <path>` - Training data file (default: glucose_training_data.json)
- `--model-name <name>` - Model name (default: glucose_predictor_v1)
- `--api-url <url>` - API URL (default: http://localhost:8000)
- `--test-size <float>` - Validation fraction (default: 0.2)
- `--max-depth <int>` - XGBoost max depth (default: 6)
- `--n-estimators <int>` - Number of trees (default: 100)
- `--learning-rate <float>` - Learning rate (default: 0.1)

### Expected Output

```
Loading training data from: glucose_training_data.json
Loaded 200 samples
Training model 'glucose_predictor_v1' with 200 samples...

=== Training Complete ===
Model: glucose_predictor_v1
Status: success
Message: Model trained with 200 samples. Test MAE: 12.35 mg/dL

Metrics:
  train_mae: 8.52
  train_rmse: 11.23
  train_r2: 0.82
  test_mae: 12.35
  test_rmse: 16.45
  test_r2: 0.75

Top 5 Features by Importance:
  current_glucose: 0.2845
  glucose_trend_slope: 0.1923
  iob: 0.1456
  delta_5m: 0.1234
  cob: 0.0892
```

## Step 3: Make Predictions

Use the trained model via API or create a prediction script:

```bash
# Via curl
curl -X POST http://localhost:8000/api/v1/predict/glucose \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "glucose_predictor_v1",
    "status_history": [ ... ]
  }'
```

Or integrate into NightManager for real-time predictions.

## Interpreting Results

### Metrics

- **MAE (Mean Absolute Error)**: Average prediction error in mg/dL
  - Good: < 15 mg/dL
  - Acceptable: 15-25 mg/dL
  - Needs improvement: > 25 mg/dL

- **RMSE (Root Mean Squared Error)**: Penalizes large errors
  - Should be close to MAE for consistent predictions

- **R² Score**: Correlation (0-1, higher is better)
  - Good: > 0.7
  - Acceptable: 0.5-0.7
  - Poor: < 0.5

### Feature Importance

Shows which features most influence predictions:
- High importance: Model relies heavily on this feature
- Low importance: Feature adds little value

Use this to understand model behavior and refine features.

## Troubleshooting

### Not Enough Samples

If you get < 100 samples:
- Expand date range with `--start` and `--end`
- Use `--include-interventions` to include all samples
- Reduce `--interval` to generate more points

### Poor Accuracy

If test_mae > 25 mg/dL:
- Need more training data
- Tune hyperparameters (max_depth, learning_rate)
- Check for data quality issues
- Consider adding more features

### Model Not Found

Ensure PredictiveModelsService is running:
```bash
cd d:\Dev\NightManager\PredictiveModelsService
python -m app.main
```

Check it's accessible at http://localhost:8000/docs
