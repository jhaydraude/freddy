# Situation Modeller User Guide

The **Situation Modeller** is a machine learning training tool that helps Freddy understand your unique metabolic patterns. By labeling specific time windows, you're teaching the system to recognize different situations that affect your glucose levels.

## What It Does

The Situation Modeller scans your historical glucose, insulin, carb, and activity data to identify potentially interesting 45-minute windows. Your job is to review these windows and label what was happening at the time.

**Examples of situations you might label:**
- 🏃 **Activity**: Exercise, walking, sports
- 🍕 **Eating**: Meals, digestion patterns
- 🔬 **Sensor Issues**: Compression lows, sensor startup, failures
- 💊 **Physiological**: Illness, stress, site failures, dawn phenomenon
- 🥤 **Nutrition**: Slow/rapid carb absorption, under-reported carbs, alcohol

> **Note**: This data is currently being collected for training purposes. Once the model learns your patterns, it will be used to improve glucose predictions and identify situations automatically in real-time.

## How It Works

### 1. Window Generation
The system automatically scans your history for "interesting" windows based on:
- **Unexplained glucose drift** (glucose changing faster than insulin/carbs would predict)
- **High volatility** (rapid ups and downs)
- **Extreme values** (very high or low glucose)
- **Sensor gaps** (missing data that needs context)
- **Random sampling** (to capture "normal" baseline patterns)

### 2. Machine Learning
As you label windows, the system:
- Extracts 40+ features from each window (glucose stats, IOB, COB, activity impacts, etc.)
- Trains a classification model to predict situation tags
- Learns to recognize patterns you've labeled

### 3. Model-Assisted Labeling
Once trained with enough data (~50+ labels), the model can:
- **Pre-label** windows with its best guesses
- **Show confidence scores** so you know which predictions are reliable
- **Save you time** by letting you confirm correct predictions with a single click

## How to Use It

### Accessing the Modeller
1. Navigate to **Situation Modeller** from the main dashboard
2. The system will load the top 100 most interesting windows from the queue

### Labeling a Window
1. **Review the graph**: Look at glucose, IOB, COB, and the highlighted 45-minute window
2. **Check the metadata**: Examine stats like "Unexplained Drift," "Volatility," and "Activity Impact"
3. **Select situation tags** that apply:
   - Click tags in the sidebar to add them
   - Multiple tags can be selected (e.g., "Eating" + "Slow Absorption")
4. **Submit your labels**:
   - **Add Label**: Confirms your selections and moves to the next window
   - **Normal**: Marks the window as baseline with no special situations
   - **Skip**: Ignore this window (e.g., too ambiguous or bad data)

### Navigation
- **Previous / Next** buttons above the graph let you move through the queue
- **Window X of 100** shows your progress
- The queue automatically prioritizes high-anomaly windows

### Queue Management

#### Training Progress Card
Shows your labeling progress:
- **Samples labeled** vs. **pending** in the queue
- **Coverage percentage** of your data
- **Auto-Label Queue**: Runs the ML model to pre-label pending windows

#### Queue Controls
- **Clear Queue**: Removes all pending windows (useful if you want to start fresh)
- **Regenerate**: Clears and rescans history for new windows
  - **3 Days**: Recent, high-density scan
  - **7 Days**: Standard depth
  - **30 Days**: Broader coverage
  - **90 Days**: Sparse historical scan for rare patterns

### Model Training
1. **Label at least 10 windows** to enable initial training
2. Click **Train Model** or **Retrain Model** in the Model Confidence card
3. Wait for training to complete (usually <30 seconds)
4. Check the **F1-Score** to see model accuracy per tag

## Tips for Effective Labeling

### Be Consistent
- Label similar situations the same way each time
- If unsure, use **Skip** rather than guessing

### Use Multiple Tags
- Many situations overlap (e.g., "Eating" + "Under-reported Carbs")
- Tags like "Activity" can occur during meals

### Focus on Clarity
- Prioritize windows where you're confident about what happened
- The model learns faster from clear examples

### Let the Model Help
- After training, use **Auto-Label Queue** to get predictions
- Review and confirm (or edit) the model's suggestions
- This speeds up labeling dramatically once the model is trained

## Understanding the UI

### Graph Controls
- **Pan**: Use the left/right arrows to shift the time window
- **Zoom**: Plus/minus buttons adjust the time range (1h to 12h)
- **Center**: Returns to the default view centered on the window

### Window Metadata
Key stats that help identify situations:
- **Unexplained Drift**: How much glucose changed beyond what insulin/carbs explain
- **Volatility**: How erratic the glucose readings are
- **Activity Impact**: Estimated effect of recent exercise (1h, 3h, 6h, 12h lookback)
- **Sensor Age**: How old the sensor is (affects reliability)

### Selection Reason Badge
- **Anomaly**: Window flagged for unusual patterns
- **Random**: Sampled to capture "normal" baseline data

## Current Status

The Situation Modeller is currently in **training mode**. Your labels are being collected and used to build a robust classification model. 

**Future capabilities** (once the model is production-ready):
- Real-time situation detection on your live glucose data
- Improved prediction accuracy by adjusting for detected situations
- Automated alerts for specific patterns (e.g., "Compression Low detected")
- Historical analysis to show how often different situations occur

For now, focus on labeling diverse examples to help Freddy learn your unique metabolic fingerprint!
