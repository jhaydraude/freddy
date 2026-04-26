# Freddy: Intelligent Diabetes Management Platform — Context Document

## What Is Freddy?

Freddy is a personal AI-powered diabetes management dashboard for people with Type 1 diabetes who use [Nightscout](https://nightscout.github.io/) for glucose monitoring. It sits on top of Nightscout as a read-only analytics and intelligence layer, adding:

- **Real-time metabolic attribution** — why is my glucose rising/falling right now? (insulin, carbs, activity, basal, unexplained)
- **Machine-learning glucose prediction** — 4-hour forecasts via XGBoost trained on the user's own data
- **Profile tuning** — data-driven suggestions for ISF, ICR, basal rates, and activity coefficients
- **Conversational AI** — natural-language queries over the user's diabetes data via Google Gemini

---

## Architecture: Two Services, Two Databases

```
┌──────────────────────────────────────────────────────────────┐
│  packages/webapp  (Next.js 16 — UI + REST API)               │
│    ├── React dashboard (glucose chart, IOB, COB, attribution) │
│    ├── Chat interface (Gemini-powered AI assistant)           │
│    ├── Profile manager & tuning dashboard                     │
│    └── /app/api/* route handlers → lib/logic/*               │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼──────────────────────────────────────┐
│  packages/predictive-models  (Python FastAPI)                 │
│    └── XGBoost glucose predictor, profile estimator,         │
│        holistic profile analyzer, meal/activity optimizer     │
└──────────────────────────────────────────────────────────────┘

MongoDB (Freddy DB)         ← ComputedStatus, SystemConfig, FreddyProfile,
                               UserBaseline, MealActivityTuning, ActivityRecord

MongoDB (Nightscout DB)     ← entries (glucose), treatments, devicestatus,
  [read-only direct access]    profile

Google Gemini API           ← chat responses + explain endpoint
```

The webapp maintains **two simultaneous Mongoose connections** via a lazy Proxy pattern in `lib/db/models.ts`: all reads from Nightscout collections go through the `NIGHTSCOUT_MONGO_URI` connection; Freddy-owned data goes through `MONGO_URI`.

---

## Data Flow

```
Nightscout WebSocket (Socket.IO)
        ↓
  SyncWorker (lib/ns/sync-worker.ts)
        ↓  invalidates stale buckets
  ComputedStatus cache (5-min buckets, TTL 7 days)
        ↓  API hits cache or computes fresh
  HTTP API → React dashboard
```

On a cache miss (or after invalidation), `getStatus()` runs the full calculation stack: fetch NS data → IOB → COB → attribution → prediction → upsert ComputedStatus. Recalculations are chunked (10 parallel) to avoid exhausting the Mongoose connection pool.

---

## Core Business Logic (`lib/logic/`)

### IOB — `iob-logic.ts`
Fetches all boluses within the DIA window (default 5h) and applies an exponential decay curve with polynomial tail per insulin type (Fiasp peak 45 min, Humalog peak 55 min). Splits into `bolusIOB`, `smbIOB` (≤ 0.7U threshold), `basalIOB`. Outputs `glucoseImpact = totalIOB × ISF` and a 5-min resolution timeseries.

### COB — `cob-logic.ts`
Models each carb event with a triangle S-curve absorption profile (peak at 25% of absorption duration). Absorption rate is dynamic based on sensitivity. Outputs `cob`, `activeCOB`, `pendingCOB`, `glucoseImpact = absorption × (ISF/ICR)`, and timeseries.

### Attribution — `attribution-logic.ts`
For each timeframe (5m, 10m, 15m, 30m), decomposes the actual glucose delta into:
- **Insulin impact** = IOB activity × ISF
- **Carb impact** = COB absorption × (ISF/ICR)
- **Basal impact** = temp basal deviation × ISF
- **Activity impact** = steps/min × coefficient + HR delta × coefficient
- **Unexplained** = actual − (insulin + carbs + basal + activity)

Activity coefficients (steps_per_minute, hr_spike, stress_hr, post_meal_multiplier) are stored in the profile extension and tunable.

### Prediction — `prediction-logic.ts`
Two-tier:
1. **Primary**: calls FastAPI `/api/v1/predict/glucose` with 60 min of 5-min status snapshots (24 features including glucose stats, IOB, COB, temporal sin/cos, attribution components). Returns XGBoost 60-min prediction.
2. **Fallback**: local IOB/COB timeseries projection + decaying unexplained momentum (85% decay per 5 min).

### Profile Tuning — `profile-tuning-logic.ts`
Analyzes historical windows to estimate parameters:
- **ISF**: isolation windows (insulin active, no carbs/activity) → observed mg/dL drop per unit
- **ICR**: meal windows → observed rise vs. expected
- **Basal**: overnight drift detection
- **Activity**: HR/steps coefficients from activity windows

Returns confidence levels (high > 10 samples, medium 5–10, low < 5).

---

## Key Data Models

### Freddy-Owned (Freddy DB)
| Collection | Purpose |
|---|---|
| `computedstatuses` | 5-min bucketed pre-computed status results |
| `systemconfigs` | Runtime config (SMB threshold, AI model, etc.) |
| `freddyprofiles` | Alternative profiles (can override NS profile) |
| `userbaselines` | Resting HR, max HR, typical daily steps |
| `mealactivitytunings` | Results from tuning runs |
| `activityrecords` | Steps, calories, HR from wearables |
| `userpreferences` | Units, theme, AI consent flag |

### Nightscout-Owned (NS DB, read-only)
| Collection | Key Fields |
|---|---|
| `entries` | `sgv`, `date`, `trend`, `heartrate`, `steps`, `type` |
| `treatments` | `eventType`, `insulin`, `carbs`, `created_at`, `duration` |
| `devicestatus` | `pump.reservoir`, `openaps.iob`, pump battery |
| `profile` | `dia`, `sens`, `carbratio`, `basal`, `target_low/high` |

### ComputedStatus Shape
```typescript
{
  status_date: Date,         // bucketed to 5-min
  glucose: { sgv, delta5m, delta10m, delta15m, trend, sensorAge },
  iob: { totalIOB, bolusIOB, smbIOB, basalIOB, glucoseImpact, timeseries },
  cob: { cob, activeCOB, pendingCOB, glucoseImpact, timeseries },
  attribution: { [timeframe]: { insulin, carbs, basal, activity, unexplained } },
  pump: { basal, pumpAge, reservoir, status },
  profile: { dia, sens, carbratio, basal, targets },
  prediction: { values: [{ time, glucose }] }
}
```

---

## AI / Agent Layer (`lib/logic/agent/`)

**Framework**: Vercel AI SDK + Google Gemini 2.5-flash-lite  
**Config**: max 120s, max 25 tool steps, 2048-token thinking budget

### Tools Available to the Agent
| Tool | What It Does |
|---|---|
| `analyze_glucose` | Current status, statistical summary, hourly percentile history, or prediction. Supports timeframe + hour-of-day filters |
| `analyze_treatments` | Insulin TDD/split, carb totals, or active profile schedule |
| `analyze_activities` | Steps, HR, calories relative to user baseline |
| `analyze_explain` | Full attribution breakdown + LLM narrative for a time window |
| `analyze_status` | IOB/COB/attribution snapshot (current or historical) |

The system prompt injects user context (units, thresholds, SMB threshold, timezone), domain knowledge (IOB/COB math, ISF/ICR conventions, DIA), tool selection guidance, and AG format conventions.

---

## UI Pages

| Route | Purpose |
|---|---|
| `/` | Main dashboard: live glucose + IOB/COB chart, impact breakdown, activity, point-click attribution tile |
| `/chat` | Conversational AI interface with streaming, tool call badges, collapsible reasoning |
| `/profile` | List/edit/create profiles; import from Nightscout; compare profiles |
| `/profile/analysis` | View tuning analysis results: confidence intervals, estimated vs. configured params |
| `/tuning` | Trigger tuning runs (meal / activity / combined / unified foundation), view history |
| `/statistics` | Aggregate stats: mean, TIR, HbA1c, TDD breakdown, carb/activity distribution |
| `/settings` | Units, targets, theme, AI consent, sync settings |
| `/guide` | Feature walkthroughs, FAQ |

---

## Python ML Service (`packages/predictive-models/`)

FastAPI app on port 8000. Key modules:

| Module | Role |
|---|---|
| `glucose_predictor.py` | Feature extraction (24 features from status history) |
| `glucose_model_service.py` | XGBoost training + 60-min inference |
| `profile_estimator.py` | ISF/ICR/basal estimation with confidence intervals |
| `holistic_profile_analyzer.py` | Cross-timeframe comprehensive profile analysis |
| `meal_activity_optimizer.py` | Ridge regression for ISF/ICR + activity coefficient optimization |
| `unified_foundation_optimizer.py` | Joint optimization of all profile parameters |

Models serialized as `.joblib` files in `/models/`.

---

## Key Environment Variables

```env
MONGO_URI                  # Freddy MongoDB
NIGHTSCOUT_MONGO_URI       # Nightscout MongoDB (read-only)
GEMINI_API_KEY             # Google Gemini
PREDICTION_SERVICE_URL     # ML service (default: http://localhost:8000)
NIGHTSCOUT_URL             # NS HTTP API (future)
NIGHTSCOUT_API_KEY         # NS token (future)
```

---

## Domain Terminology Quick Reference

| Term | Meaning |
|---|---|
| IOB | Insulin On Board — active insulin, drives glucose down |
| COB | Carbs On Board — active carbs, drives glucose up |
| ISF | Insulin Sensitivity Factor — mg/dL drop per unit insulin |
| ICR | Insulin-to-Carb Ratio — grams carbs covered per unit |
| DIA | Duration of Insulin Action — hours until bolus is 99% absorbed |
| SMB | Super Micro Bolus — small automated bolus from closed-loop (≤ 0.7U) |
| TIR | Time in Range — % readings within target (typically 70–180 mg/dL) |
| Attribution | Component breakdown of what caused a glucose change |
| Temp Basal | Temporary override of background insulin rate |
| Autosens | Automatic sensitivity detection (currently disabled in Freddy) |

---

## Codebase Map

```
packages/webapp/
  app/                      # Next.js pages + API routes
    api/                    # Route handlers (delegate to lib/logic/)
    (dashboard pages)/
  lib/
    logic/                  # All business logic
      iob-logic.ts
      cob-logic.ts
      attribution-logic.ts
      prediction-logic.ts
      status-logic.ts       # Assembles full status context
      profile-logic.ts      # NS profile resolution
      profile-tuning-logic.ts
      cache-logic.ts        # ComputedStatus bulk ops
      llm-service.ts        # Gemini calls
      agent/                # AI SDK tools + prompts
        tools.ts
        prompts.ts
    db/
      connection.ts         # Dual MongoDB setup
      models.ts             # Lazy Proxy model binding
    ns/
      sync-worker.ts        # NS WebSocket + cache invalidation
    config/
      config-manager.ts     # Singleton config (env → DB override)

packages/predictive-models/
  app/
    routers/                # FastAPI route handlers
    services/               # ML service implementations
  models/                   # Saved .joblib model files
```

---

## Privacy & Data Residency

Freddy is a personal health tool — all data stays local (Freddy DB + NS DB on your own infrastructure). The only external calls are to Google Gemini for LLM responses. No user health data is sent to Anthropic or any other third party.
