# Freddy — Deep Dive Q&A

Answers to follow-up questions on the architecture, LLM integration, attribution model, and data patterns.

---

## 1. `analyze_explain` vs the profile explain button

**`analyze_explain` (tools.ts:688–763)** — this is a **data-only** tool. It does NOT call the LLM. It:
1. Calls `getStatus()` + `attributeGlucoseChange()` + `getGlucosePrediction(240)`
2. Pulls the 30m attribution timeframe
3. Returns a structured JSON object to Gemini with: `glucose`, `active_influencers` (IOB/COB), `attribution_last_30m` (actual/predicted/unexplained/breakdown), `forecast` (30m, 4hr, min/max), `device_status`

Gemini then synthesizes that data into a response — so the LLM call is the outer chat loop, not inside this tool.

---

**Dashboard `/api/explain` → `explain-logic.ts`** — this DOES call the LLM directly. It:
1. Gathers: `getStatus()`, `getStatusHistory(60min lookback)`, `calculateProjectedGlucose(30m)`, `getGlucosePrediction(240m)`
2. Extracts attribution 30m timeframe
3. Calls `generateExplanation()` with:

**System prompt** (`EXPLAIN_SYSTEM_PROMPT` in `prompts.ts:1–10`):
```
You are a specialized expert in Type 1 Diabetes management...
1. Identify the Trend
2. Explain the 'Why': Use Attribution data. Highly emphasize Activity impact if contributing.
3. Absorption Insights: active vs pending carbs and insulin/activity intensity
4. Foresight: Use Long-term Prediction to warn about future highs/lows
5. Concise: 1-2 sentences. Avoid medical advice.
```

**User prompt**: `Here is the data snapshot for [time]: {JSON.stringify(dataContext)}` — dumps the whole context object inline.

---

**Profile Analysis `/api/profile/explain` → `profile-explain-logic.ts`** — also calls LLM directly. It:
1. Fetches a `ProfileAnalysis` document from DB
2. Formats ISF/ICR/basal estimates into 6 four-hour blocks (`00:00-04:00`, `04:00-08:00`, ...) with `[lower, upper]` confidence intervals per block
3. Bundles `model_quality` (R², RMSE, MAE + interpretation string), `activity_analysis`, `data_quality` (window counts, quality score)

**System prompt** (`PROFILE_EXPLAIN_SYSTEM_PROMPT` in `prompts.ts:19–34`):
```
Split response into 2 parts:
1. Test summary: Summary → Confidence Assessment → Top 2-3 Recommendations → Data Quality Suggestions
2. Profile recommendations: Conservative changes supported by data, explain why each is/isn't suggested.
3-4 sentences each. Avoid medical advice.
```

**User prompt**: `Profile Analysis Results: {JSON.stringify(dataContext)}\n\nExplain these results and provide actionable recommendations.`

---

## 2. Full system prompt (`lib/logic/agent/prompts.ts`)

`buildSystemPrompt(ctx)` composes these 5 modules:

**Core header** (inline):
- Identity: "You are Freddy, a personal diabetes data analyst."
- Always call a tool before answering — never guess
- User context block: glucoseUnits, timezone, lowThreshold, highThreshold, smbThreshold + domain note about SMBs being basal

**Tool Selection table** (inline): maps 14 question types to tool + parameter combinations

**`ANALYSIS_PATTERNS_PROMPT`** (`patterns.ts`): 5 pre-defined multi-tool investigative patterns (Exercise↔Glucose, Morning vs Evening, Carb Impact, Weekday vs Weekend, Overnight Stability, Hypo Pattern Investigation)

**`VISUALIZATION_PROMPT`** (`visualization.ts`): Critical rule to call `render_chart` on any "plot/chart/graph" request. Two modes (rawRows for query_data, series for analyze_*). Chart type table. "Always include targetLow/targetHigh for glucose charts."

**`buildGuidelinesPrompt(units)`** (`guidelines.ts`): Lead with answer, cite numbers, timezone handling, charting source rules (glucose/IOB/COB → analyze_status; carbs/insulin → query_data; activity → analyze_activities). Error handling (retry up to 3x). Follow-up awareness. Constraints (read-only, not a clinician).

**`DATA_SCHEMA_PROMPT`** (`data-schema.ts`): Field-level schema tables for `entries`, `treatments`, `activity_records` including date type caveats (epoch ms vs ISO string vs Date object per collection).

**`DOMAIN_KNOWLEDGE_PROMPT`** (`domain-knowledge.ts`): TIR clinical targets table, glucose variability (CV <36%), insulin metrics (TDD, basal/bolus split, SMB definition, ISF, ICR, DIA), 6 common glucose patterns (dawn phenomenon, foot-on-floor, post-meal spike, post-exercise drop, compression lows, overnight basal drift), and interpreting-results guidelines.

---

## 3. LLM service and model config

**`llm-service.ts`** is minimal — 37 lines:
- Uses `@google/generative-ai` SDK directly (not the agent AI SDK)
- Model is **hardcoded**: `"gemini-2.5-flash-lite"` at line 19 — not read from config
- Concatenates `system + "\n\nUser Input:\n" + user` into a single string (no native system instruction support wired up)
- No streaming, no retry, no token counting

**`SystemConfig` schema** (`models.ts:263–269`) is a flat key/value store:
```typescript
{ key: string (unique), value: Mixed, updated_at: Date }
```
There is no structured AI model config field. Any `ai_model` key would be a runtime KV entry, but the actual model used in `llm-service.ts` ignores it — it's hardcoded. The agent chat path uses Vercel AI SDK with a separate Google Generative AI provider config (in the `/api/chat` route, not llm-service.ts).

---

## 4. Attribution output shape

Full TypeScript type reconstructed from `attribution-logic.ts`:

```typescript
// Top-level return from attributeGlucoseChange()
IAttributionResult {
  timestamp: string,          // ISO of the status date
  timeframes: IAttributionTimeframe[],  // one entry per [5, 10, 15, 30] minutes
  history: IAttributionHistoryPoint[]   // per-interval breakdown for past 30m
}

IAttributionTimeframe {
  timeframe: '5min' | '10min' | '15min' | '30min',
  minutes: number,
  glucoseChange: {
    actual: number,     // rounded to 1 decimal, mg/dL
    predicted: number   // rounded to 1 decimal
  },
  components: {
    insulin: { value: number, activity: number, isf: number },
    carbs:   { value: number, absorption: number, carbRatio: number },
    basal:   { value: number, deviation: number },
    activity: {
      value: number,
      steps: number,
      calories: number,
      stairs: number,
      heartRate: number,
      stressHeartRate: number,
      intensity: string,
      dataAvailable: boolean
    },
    unexplained: number   // scalar: actual − (insulin + carbs + basal + activity)
  }
}

IAttributionHistoryPoint {
  timestamp: string,   // ISO, one point per 5-min interval in last 30m
  actual: number,
  predicted: number,
  unexplained: number,
  components: {
    insulin: number,
    carbs: number,
    basal: number,    // always 0 in history (not calculated per-interval)
    activity: number
  }
}
```

**`unexplained` is a single scalar** — the residual delta in mg/dL not accounted for by the model. It's stored at per-timeframe granularity (4 snapshots: 5m/10m/15m/30m) plus a per-5min history array for the past 30m. The entire attribution object is stored in `ComputedStatus.attribution` as `Schema.Types.Mixed` — no enforced shape.

---

## 5. Pattern persistence today

**No.** There is nothing that tracks patterns across buckets beyond storing the individual ComputedStatus documents.

What exists:
- **`ComputedStatus`**: individual 5-min buckets. No aggregation, no rolling windows, no time-of-day summaries.
- **`ProfileAnalysis`**: stores a completed analysis run (estimated ISF/ICR/basal by 6 four-hour blocks + confidence intervals + R²/RMSE/MAE). This is a point-in-time snapshot of a Python ML analysis run, not an ongoing accumulation.
- **`MealActivityTuning`**: same — stores one completed tuning run result.

What happens at query time (in-memory only, not persisted):
- `analyze_glucose(type='history')` buckets entries by hour-of-day on the fly
- `recalculateStatusRange` iterates a time range but writes individual status buckets, not summaries
- `calculateStatistics()` computes TIR/mean/HbA1c on the fly from raw entries

**Nothing detects recurring signals.** Dawn phenomenon, post-meal spike patterns, exercise correlation — all of this requires the user to ask the agent, which then runs the computation on demand. There is no background process accumulating or flagging these patterns.

---

## 6. Tuning run document shape (`IMealActivityTuning`)

```typescript
{
  tuning_id: string,           // UUID
  user_id: string,
  created_at: Date,
  status: 'syncing' | 'running' | 'completed' | 'failed' | 'applied',
  mode: 'meal' | 'activity' | 'combined',

  config: {
    analysis_period_days: number,
    window_hours: number,
    include_activity: boolean,
    min_windows_required: number,
    baseline_tuning_id?: string   // optional ref to a foundation run
  },

  current_values: {             // snapshot of profile at time of run
    dia: number,
    peak: number,
    isf: number[],    // 6 blocks
    basal: number[],  // 12 blocks
    cr: number[],     // 6 blocks
    activity_coefficients: { steps: number, heartRate: number },
    units: 'mg/dL' | 'mmol/L',
    source: 'profile' | 'foundation_run'
  },

  optimized_values?: {          // only present when status='completed'
    dia: number,
    peak: number,
    isf: number[],              // 6 blocks
    cr: number[],               // 6 blocks
    basal: number[],            // 12 blocks
    activity_coefficients: { steps: number, heartRate: number },

    isf_confidence:      [number, number][],   // [lower, upper] per block
    cr_confidence:       [number, number][],
    basal_confidence:    [number, number][],
    activity_confidence: {
      steps:     [number, number],
      heartRate: [number, number]
    },

    r_squared: number,
    rmse: number,
    mae: number,
    windows_analyzed: number
  },

  analysis_summary?: {
    total_windows: number,
    meal_windows: number,
    activity_windows: number,
    data_quality_score: number,
    window_distribution?: number[]
  },

  logs?: string[],
  error_message?: string,
  applied_at?: Date,
  applied_by?: string
}
```

**What the profile explain button receives**: The explain endpoint at `/api/profile/explain` takes a `ProfileAnalysis` document (not `MealActivityTuning`). `MealActivityTuning` has **no explain endpoint** currently. The profile analysis explain bundles estimated params by time block + confidence intervals + model quality + activity coefficients + window counts.

---

## 7. Chat tool routing today

**No routing logic in code.** All 7 tools are passed to Gemini simultaneously via the `agentTools` object (`tools.ts:800–808`):

```typescript
export const agentTools = {
  analyze_glucose, analyze_treatments, analyze_activities,
  analyze_status, analyze_explain, query_data, render_chart,
};
```

The agent route passes them all to the AI SDK `streamText()` call. Tool selection is entirely prompt-driven — the system prompt's Tool Selection table tells Gemini which tool to use for which question type. There's no pre-classification, no intent detection, no routing function. Gemini reads the user message and the 7 tool descriptions and decides. `maxSteps: 25` caps the chain length.

---

## 8. Most complex ComputedStatus query / longest lookback

**Most complex query** is in `cache-logic.ts:57–90` — the global context build for `recalculateStatusRange`. It fires 9 parallel queries, some with very long lookbacks:

| Data | Lookback |
|---|---|
| treatments | 48h |
| deviceStatuses | 7 days |
| sgvEntries | 2h |
| activityEntries | 2h |
| sensorChanges | 7 days |
| calibrations | 7 days |

**Longest lookback used anywhere**: **7 days** (`maxGlobalLookback`), applied to device status, sensor changes, and calibrations during bulk cache recalculation — because it needs to find the "last known" event before the recalculation window starts.

**On ComputedStatus itself**: no aggregation pipeline is ever run against it. All queries are `find({ timestamp: { $gte, $lte } }).sort().lean()` with in-memory downsampling. The history fetch in `analyze_status(mode='history')` is the most common query pattern — simple range scan, then bucket-medians in JS. There are no `$group`, `$match`, or `$aggregate` stages on the ComputedStatus collection.
