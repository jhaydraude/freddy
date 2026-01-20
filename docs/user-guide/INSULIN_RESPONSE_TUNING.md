# User Guide: Insulin Response Tuning

Freddy's **Insulin Response Optimizer** uses your historical Nightscout data to calculate your personalized metabolic parameters. It helps optimize your **Duration of Insulin Action (DIA)**, **Peak Time**, and **Insulin Sensitivity Factor (ISF)**.

## How it Works

The optimizer analyzes "time windows" where your glucose was primarily influenced by insulin (and potentially carbs/activity). It uses a mathematical optimization algorithm (L-BFGS-B) to find the parameter values that best explain your observed glucose drops.

## Getting Started

1.  Navigate to the **Tuning** tab in the Freddy Dashboard.
2.  Locate the **Insulin Response** card and click **Tune Parameters**.
3.  Set your **Analysis Period**:
    *   **Recommended**: 14 days.
    *   **Longer (30+ days)**: Provides higher statistical reliability but may miss recent lifestyle or hormonal changes.
    *   **Shorter (7 days)**: Reflects very recent trends but may have lower confidence if there aren't enough stable data points.
4.  Click **Run Optimization Analysis**. The process typically takes 30-60 seconds.

## Interpreting Results

Once complete, you will see a comparison between your **Current** profile and the **Optimized** recommendations.

### 1. Reliability (Confidence)
Each recommendation comes with a reliability rating:
*   **🟢 High**: The data is very consistent, and the optimizer is confident in this value.
*   **🟡 Medium**: Likely accurate, but with some variation in the underlying data.
*   **🔴 Low**: Limited data points or high noise. Use caution when applying these values.

### 2. Parameter Details
*   **DIA (Insulin Duration)**: How many hours the insulin stays active in your body.
*   **Peak Time**: How many minutes after injection the insulin reaches its maximum effect.
*   **ISF (Insulin Sensitivity)**: How many mg/dL (or mmol/L) your glucose drops per 1 unit of insulin. This is broken down into **6 time blocks** to capture diurnal variations.

### 3. ISF Chart
The chart visualizes your current ISF schedule vs. Freddy's recommendation. The **dashed areas** represent the "Confidence Interval"—the range where your true sensitivity likely falls.

## Selective Application

You don't have to apply everything! Freddy allows you to pick and choose:
*   Click the cards for DIA, Peak, or specific ISF blocks to **toggle** them on/off.
*   Only selected parameters (highlighted with a checkmark) will be synced.

## Applying & Syncing

When you are ready, click **Apply & Sync to Nightscout**. This will:
1.  **Update Freddy's Engine**: Your local predictions (IOB, glucose alerts) will immediately use the new values.
2.  **Update Nightscout**: A new profile record will be created in your Nightscout site with the updated parameters.
3.  **Recalculate Predictions**: Freddy will clear its recent cache to ensure your dashboard reflects the new insulin curves immediately.

---
*Note: Always consult with your healthcare provider before making significant changes to your diabetes management settings.*
