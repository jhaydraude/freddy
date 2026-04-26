# Freddy — Claude Code Handoff Document

---

## 0. North Star

Freddy is a continuously improving glucose prediction and attribution system. The **unexplained delta** is the core metric — the portion of each glucose change not accounted for by any modeled factor (insulin, carbs, basal, activity). Every engineering decision should be evaluated against whether it helps reduce the unexplained delta over time, either by improving the model or by helping the user understand and act on what the model cannot yet explain.

The parameter roadmap for reducing unexplained delta over time:
- **Current:** IOB, COB, basal deviation, activity (steps/HR)
- **Near-term:** time-of-day circadian effects, time-of-month hormonal cycle
- **Future:** physical location (altitude, temperature), stress markers, sleep quality

The LLM layer does not compute. It interprets, explains, and narrates. Statistical engines do the reasoning. The LLM translates their outputs into language the user can act on, surfaces patterns in the residual, and generates hypotheses about unmodeled factors. **The human is always in the decision loop for anything that affects insulin delivery.**

---

## 1. What Freddy Is

Freddy is a personal health tool for a single technically sophisticated user — 30+ years of well-controlled Type 1 diabetes, deep involvement in the DIY closed-loop community (early Nightscout contributor, second contributor to OmniCore). It is designed to eventually be shared with the broader Nightscout/AndroidAPS community, but is being built for one person first.

The user does not need to be protected from complexity. The LLM can be direct, technical, and honest about uncertainty. "Here's what we know, here's what we don't, here's what's worth investigating" is the right tone — not consumer-friendly oversimplification.

**Hard constraints that never change:**
- Never write to the Nightscout database
- Never suggest specific insulin dosing changes (observe, attribute, explain, ask questions — never prescribe)
- Human must explicitly approve any profile changes before they are applied
- Freddy never pushes profile changes to AAPS directly — user carries them across that gap intentionally

---

## 2. Current Architecture

### Services

```
packages/webapp/               Next.js 16 — UI + REST API + agent
packages/predictive-models/    Python FastAPI — XGBoost prediction + profile optimization

MongoDB (Freddy DB)            ComputedStatus, FreddyProfile, MealActivityTuning,
                               UserBaseline, ActivityRecord, SystemConfig, UserPreferences

MongoDB (Nightscout DB)        entries, treatments, devicestatus, profile  [READ ONLY]
```

The webapp maintains two simultaneous Mongoose connections via a lazy Proxy pattern in `lib/db/models.ts`. All Nightscout reads go through `NIGHTSCOUT_MONGO_URI`. All Freddy-owned data goes through `MONGO_URI`.

### Data Flow

```
Nightscout WebSocket (Socket.IO)
        |
  SyncWorker (lib/ns/sync-worker.ts)    -- invalidates stale 5-min buckets
        |
  ComputedStatus cache (5-min buckets, TTL 7 days)
        |
  HTTP API → React dashboard

On cache miss:
  fetch NS data → IOB → COB → attribution → prediction → upsert ComputedStatus
```

### Attribution Engine (`lib/logic/attribution-logic.ts`)

For each timeframe (5m, 10m, 15m, 30m), decomposes actual glucose delta into five components:

- **Insulin impact** = IOB activity × ISF
- **Carb impact** = COB absorption × (ISF/ICR)
- **Basal impact** = temp basal deviation × ISF
- **Activity impact** = steps/min × coefficient + HR delta × coefficient
- **Unexplained** = actual − (insulin + carbs + basal + activity)

The unexplained scalar is stored per-timeframe in `ComputedStatus.attribution` plus a per-5min history array for the past 30 minutes.

### ComputedStatus Shape (Key Fields)

```typescript
{
  status_date: Date,
  glucose: { sgv, delta5m, delta10m, delta15m, trend, sensorAge },
  iob: { totalIOB, bolusIOB, smbIOB, basalIOB, glucoseImpact, timeseries },
  cob: { cob, activeCOB, pendingCOB, glucoseImpact, timeseries },
  attribution: {
    timeframes: [{
      timeframe: '5min' | '10min' | '15min' | '30min',
      glucoseChange: { actual, predicted },
      components: {
        insulin: { value, activity, isf },
        carbs:   { value, absorption, carbRatio },
        basal:   { value, deviation },
        activity: { value, steps, heartRate, intensity, dataAvailable, ... },
        unexplained: number    // THE KEY METRIC
      }
    }],
    history: [{ timestamp, actual, predicted, unexplained, components }]  // per 5-min, last 30m
  },
  prediction: { values: [{ time, glucose }] }   // 4-hour XGBoost forecast
}
```

### Tuning Engine

Three-stage staged isolation (Python FastAPI):

1. **Stage 1 — Insulin Tuner:** Joint optimization of DIA, Basal, ISF for biological consistency
2. **Stage 2 — Meal Tuner:** Refines CR/ISF using fixed insulin baseline
3. **Stage 3 — Activity Tuner:** Refines activity coefficients (steps/HR)

Results stored as `MealActivityTuning` documents with `current_values`, `optimized_values` (including confidence intervals per block), and model quality metrics (R², RMSE, MAE).

**The statistical tuning engine is separate from the LLM.** It is not LLM-based and should not become so. The LLM explains tuning results; it does not compute them.

### Current UI Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard: live glucose + IOB/COB chart, attribution tile |
| `/chat` | Conversational AI — currently its own page |
| `/statistics` | Aggregate stats: TIR, HbA1c, TDD breakdown |
| `/profile` | List/edit/create profiles, compare |
| `/profile/analysis` | Tuning analysis results with explain button |
| `/tuning` | Trigger tuning runs, view history |
| `/settings` | Units, targets, theme, AI consent |

---

## 3. Current LLM State

### Three Separate LLM Paths (Problem)

There are currently three independent LLM invocation paths that do not share infrastructure:

```
1. Dashboard explain  →  explain-logic.ts  →  llm-service.ts  →  Gemini (direct SDK)
2. Profile explain    →  profile-explain-logic.ts  →  llm-service.ts  →  Gemini (direct SDK)
3. Chat agent         →  /api/chat route  →  Vercel AI SDK  →  Gemini (separate config)
```

`llm-service.ts` is 37 lines and hardcodes `"gemini-2.5-flash-lite"`. The `SystemConfig` collection has an `ai_model` key but `llm-service.ts` never reads it — the model is not actually configurable at runtime.

### Current Agent Tools (Chat)

All 7 tools are passed to Gemini simultaneously with no pre-routing:

| Tool | What It Does |
|---|---|
| `analyze_glucose` | Current status, statistical summary, hourly percentile history, prediction |
| `analyze_treatments` | Insulin TDD/split, carb totals, active profile schedule |
| `analyze_activities` | Steps, HR, calories relative to user baseline |
| `analyze_status` | IOB/COB/attribution snapshot (current or historical) |
| `analyze_explain` | Returns structured attribution data to the outer Gemini loop (does NOT call LLM internally) |
| `query_data` | Direct MongoDB query capability |
| `render_chart` | Triggers chart rendering in the UI |

Tool selection is entirely prompt-driven via a Tool Selection table in the system prompt. No pre-classification, no intent detection, no routing logic in code. `maxSteps: 25`.

### Current Explain Endpoints

**Dashboard explain** (`/api/explain` → `explain-logic.ts`): Calls LLM directly with `getStatus()` + 60-min history + 30m projection + 4hr prediction. Passes full context as `JSON.stringify(dataContext)` into the user prompt. System prompt is a 5-step instruction block in `prompts.ts:1–10`. 1-2 sentence output target.

**Profile explain** (`/api/profile/explain` → `profile-explain-logic.ts`): Calls LLM directly with a `ProfileAnalysis` document — ISF/ICR/basal estimates by 6 four-hour blocks with confidence intervals, model quality metrics. System prompt at `prompts.ts:19–34`. Splits response into test summary and profile recommendations.

**MealActivityTuning explain**: Does not exist. The tuning run has no explain endpoint.

### Current System Prompt Structure (`agent/prompts.ts`)

`buildSystemPrompt(ctx)` composes five modules:
1. Core header — identity, always-call-a-tool rule, user context
2. Tool selection table — 14 question types mapped to tool + parameters
3. `ANALYSIS_PATTERNS_PROMPT` — 5 pre-defined investigative patterns
4. `VISUALIZATION_PROMPT` — chart rendering rules
5. `buildGuidelinesPrompt` + `DATA_SCHEMA_PROMPT` + `DOMAIN_KNOWLEDGE_PROMPT`

The system prompt is well-structured and should largely be preserved. It is the primary carrier of domain knowledge and should continue to be.

### What Currently Works Well

- The agent system prompt is thorough and domain-aware
- `analyze_explain` returns well-structured attribution data
- The "data stays local, only tool results sent to API" architecture is correct and should be preserved
- ComputedStatus pre-computation means the LLM never touches raw data
- The tool descriptions are clear and well-matched to question types

---

## 4. Gap Analysis

### Gap 1: No Unified LLM Provider (Foundational)

Three separate Gemini integrations. Model hardcoded. `SystemConfig` AI model key ignored. No path to local model without rewriting all three paths.

**Impact:** Everything else depends on this being solved first.

### Gap 2: Raw JSON Dumps to LLM

Both explain endpoints do `JSON.stringify(dataContext)` directly into the user prompt. No structure, no explanation hints, no field selection. Works with Gemini 2.5. Will produce poor results with a local 14B model.

**Impact:** Local model viability depends on structured context assembly.

### Gap 3: No MealActivityTuning Explain Endpoint

The tuning run has no explain endpoint. The profile analysis has one. The most important explanation — why the tuner suggested these specific changes, backed by attribution evidence — doesn't exist.

**Impact:** The bridge between tuning suggestions and attribution evidence is missing entirely.

### Gap 4: No Pattern Persistence

Nothing tracks patterns across ComputedStatus buckets. Every pattern detection is computed on demand in JavaScript and discarded. There is no record of "this unexplained delta pattern has been present for 14 days." Every conversation starts cold.

**Impact:** The most valuable LLM capability — longitudinal pattern interpretation — is impossible without this.

### Gap 5: No Intent Classification on Chat

All queries hit the full agent with all 7 tools regardless of complexity. "What's my glucose right now" and "why has my overnight unexplained delta been trending upward for 6 weeks" go through identical machinery.

**Impact:** Operational queries are slow and expensive. Analytical queries get insufficient pre-aggregation. Local models especially struggle with open-ended tool orchestration.

### Gap 6: Chat Is a Page, Not an Ambient Tool

`/chat` is a navigation destination. It has no awareness of what page the user is on. The user cannot ask "why is Stage 2 suggesting this CR change" while looking at the tuning page.

**Impact:** The most natural interaction patterns are blocked by the UI architecture.

---

## 5. Build Plan

Build in this order. Each item unblocks the next.

### Item 1: Unified LLM Provider Interface

**What:** A single provider abstraction that all three current LLM paths consume. Model selection driven by `SystemConfig`, not hardcoded.

**Interface:**

```typescript
interface LLMProvider {
  complete(system: string, user: string, options?: LLMOptions): Promise<string>
  stream(system: string, user: string, options?: LLMOptions): AsyncIterable<string>
  supportsTools: boolean
  supportsThinking: boolean  // Qwen3 hybrid thinking mode
}

interface LLMOptions {
  thinkingMode?: boolean    // slow path for analytical queries
  maxTokens?: number
  temperature?: number
}

class GeminiProvider implements LLMProvider { ... }
class OllamaProvider implements LLMProvider { ... }   // target: Qwen3 14B Q4
```

**Provider factory** reads from `SystemConfig` and returns the configured provider. `llm-service.ts` becomes a thin wrapper around the factory. The chat agent route and both explain endpoints all consume the same factory.

**Settings page** already exists — wire the AI provider and model fields to actually update `SystemConfig` and take effect.

**Notes on Ollama / Qwen3:**
- Qwen3 tool calling is reliable — the agent architecture is compatible
- Qwen3 hybrid thinking mode is controlled via a system prompt toggle, not a separate API parameter
- Local model support is being deferred until hardware upgrade (3060 12GB arriving soon). Build the interface now, optimize prompts for local models later.
- Don't optimize prompt structure for small model limitations yet — design for a capable model

---

### Item 2: Structured Context Assembly

**What:** Replace `JSON.stringify(dataContext)` in both explain endpoints with structured context builders that select relevant fields, add interpretation hints, and produce a consistent format the system prompt can reference explicitly.

**Why:** Raw JSON dumps work with frontier models. They fail with local 14B models. The Pydantic models in the Python service already have `explanation_hints` — surface them here.

**Context builders to create:**

```typescript
function buildAttributionContext(
  status: ComputedStatus,
  historyWindow?: ComputedStatus[]
): AttributionContext

function buildTuningContext(
  tuning: IMealActivityTuning
): TuningContext

function buildExplainContext(
  attribution: AttributionContext,
  tuning?: TuningContext,
  patterns?: ISurfacedPattern[]   // from Gap 4
): ExplainContext
```

Each builder:
- Selects only fields relevant to explanation (not the full document)
- Formats numbers with units and human-readable labels
- Includes confidence levels with plain-language interpretation ("high confidence: 18 nights of data")
- Passes through `explanation_hints` from the Python stat engine
- Separates observed facts from model inferences

**Update both explain system prompts** to reference the structured format explicitly rather than generic "here is JSON data."

---

### Item 3: MealActivityTuning Explain Endpoint

**What:** A new `/api/tuning/explain` endpoint that explains a completed tuning run in terms a user can act on and bring to their care team.

**Why:** This is the highest-value explanation gap. The stat engine produces meaningful parameter suggestions. Without explanation, the user sees numbers. With explanation, they see reasoning.

**What the endpoint receives:**
- `MealActivityTuning` document (`current_values` vs `optimized_values` diff)
- Confidence intervals with plain-language interpretation per block
- **Attribution history from the same analysis period** — this is the critical bridge that currently doesn't exist
- `explanation_hints` from the Python service
- Any relevant surfaced patterns (once Gap 4 is built)

**Output structure (enforce via system prompt):**

```
## What Changed
Plain-language description of each parameter delta. Not "ISF block 2: 45 → 52" 
but "Your insulin sensitivity appears about 15% lower in the late morning 
(8am–noon) than your current settings assume."

## Why the Model Suggests This
The specific attribution evidence supporting each change. Reference unexplained 
delta patterns from the same time windows. Reference confidence levels honestly.

## What's Not Certain
Explicit acknowledgment of low-confidence suggestions. What data gaps limit confidence.

## Questions for Your Care Team
Specific, concrete questions the user can bring to their endocrinologist.

## What This Is Not
Reinforce the boundary: this is pattern analysis and model output, not a 
recommendation to change settings.
```

**Bridge the tuning and attribution engines:** The explain endpoint should pull ComputedStatus records from the tuning analysis period and show which attribution patterns support each suggestion. "The model suggests reducing overnight basal because the unexplained delta in that window averaged +18 mg/dL across 21 nights — meaning your glucose was consistently rising more than the model predicted, even after accounting for IOB and COB."

---

### Item 4: Pattern Persistence

**What:** A new `surfaced_patterns` collection in Freddy's schema. A background process that scans ComputedStatus history for recurring signals and upserts pattern records. A new agent tool to query patterns. Integration into the explain layer.

**New collection:**

```typescript
ISurfacedPattern {
  pattern_id: string,           // UUID
  pattern_type: PatternType,
  first_observed: Date,
  last_observed: Date,
  occurrence_count: number,
  days_in_window: number,       // how many days of data analyzed
  time_window?: {               // for time-of-day patterns
    start_hour: number,
    end_hour: number
  },
  magnitude: {
    mean: number,               // mean unexplained delta in mg/dL
    max: number,
    direction: 'positive' | 'negative'
  },
  concurrent_factors: {         // what else was happening during these events
    mean_iob?: number,
    prior_activity_elevated?: number,   // count of occurrences
    time_of_month_cluster?: number[]    // day-of-cycle if data available
  },
  confidence: 'high' | 'medium' | 'low',
  status: 'active' | 'resolved' | 'acknowledged',
  acknowledged_at?: Date,
  resolution_notes?: string
}

type PatternType =
  | 'overnight_unexplained_delta'
  | 'time_of_day_hypo'
  | 'post_activity_drop'
  | 'post_meal_spike'
  | 'time_of_month_sensitivity'
  | 'persistent_high_unexplained'
```

**Background accumulator:** Runs on a schedule (or triggered on ComputedStatus write for recent buckets). Scans the last 30/60/90 days of ComputedStatus records. Groups by time-of-day window. Detects recurring unexplained delta signals above a threshold. Upserts pattern records — does not create duplicates, updates occurrence count and last_observed on existing patterns.

Start simple: look for unexplained delta > 15 mg/dL in the same 2-hour window across > 5 of the last 14 nights. That catches the most common clinically relevant pattern (overnight basal drift) without requiring complex statistics.

**New agent tool:**

```typescript
analyze_patterns: {
  description: "Query surfaced recurring patterns. Use when asked about recurring issues, 
                why something keeps happening, or longitudinal trends.",
  parameters: {
    pattern_type?: PatternType,
    status?: 'active' | 'resolved' | 'acknowledged',
    lookback_days?: number
  }
}
```

**Integration into explain layer:** Both the tuning explain endpoint and the dashboard explain endpoint should check for active patterns relevant to the time window being explained and include them in context.

---

### Item 5: Intent Classification on Chat

**What:** A lightweight pre-classifier that intercepts user queries before they reach the agent, routes operational queries to direct data lookups (no LLM), and pre-aggregates context for analytical queries before the model call.

**Why:** Reduces unnecessary LLM calls, makes operational queries feel instant, gives the model structured context for hard questions, and prepares the system for local model constraints.

**Intent taxonomy:**

```typescript
type QueryIntent =
  | 'operational'    // glucose/IOB/COB right now → direct DB lookup, no LLM
  | 'statistical'    // TIR, averages, trends → pre-aggregate then LLM
  | 'attribution'    // why did X happen → build attribution context then LLM
  | 'pattern'        // recurring issues → check surfaced_patterns first then LLM
  | 'tuning'         // profile questions → build tuning context then LLM
  | 'research'       // open-ended → full agent, thinking mode on
```

**Classification approach:** Start with a small LLM call (Haiku-class or local) to classify intent before the main call. Or rules-based for the clearest cases — "what's my glucose", "what's my IOB", "what's my COB" are pattern-matchable without an LLM. Use LLM classification only for ambiguous queries.

**Thinking mode:** Qwen3 hybrid thinking mode maps to intent:
- `operational`, `statistical` → thinking mode off (fast)
- `attribution`, `pattern`, `tuning`, `research` → thinking mode on (deeper)

**Fast path for operational queries:**

```typescript
// These never hit the LLM
const OPERATIONAL_PATTERNS = [
  /what.*(is|s) my (glucose|bg|blood sugar)/i,
  /what.*(is|s) my (iob|insulin on board)/i,
  /what.*(is|s) my (cob|carbs on board)/i,
  /current (glucose|iob|cob|status)/i,
  /how am i (doing|looking)/i
]
```

Return a formatted status card directly from the latest ComputedStatus. Sub-second response, no API call.

---

### Item 6: Persistent Chat UI

**What:** Move chat from the `/chat` page to a persistent panel/drawer accessible from all pages. Pass current page context to the agent. Consolidate the tab structure.

**Why:** "Why is Stage 2 suggesting this CR change" while looking at the tuning page is the most natural interaction. It's currently impossible because chat has no awareness of what the user is looking at.

**UI approach:** Command palette style (`Cmd+K` or a floating button) opens a slide-up/drawer chat panel from any page. Technical user, keyboard-friendly, low visual footprint.

**Page context passing:** Each page passes its current context identifier and relevant document IDs when opening the chat panel. The agent uses this to pre-load relevant context:

```typescript
// Tuning page opens chat
{ page: 'tuning', context: { tuning_id: 'abc123', stage: 2 } }

// Agent pre-loads the tuning run and builds context before the user finishes typing
```

**Tab consolidation:** Current nav has too many tabs. Suggested reduction:

```
Dashboard  |  Statistics  |  Tuning  |  Settings
```

Profile management moves into Settings or a sub-page of Tuning. Chat becomes the persistent panel. The `/profile/analysis` page merges into Tuning.

**Mobile considerations:** The drawer pattern works on mobile. Touch targets must be large. Operational query responses (glucose, IOB, COB) must be readable at a glance. Deep analytical responses are acceptable to be desktop-primary.

---

## 6. What to Preserve

Do not change these things:

- **Dual MongoDB connection pattern** — clean, correct, should not be touched
- **ComputedStatus pre-computation** — the LLM never sees raw data, this is right
- **Attribution engine math** — the five-component decomposition is the core of the system
- **"Data stays local, only tool results sent to API"** — this is both architecturally correct and important for the community audience
- **The agent system prompt structure** — well-organized, domain-aware, keep and extend rather than replace
- **The tuning engine staged isolation approach** — statistically sound, not LLM-based, should stay that way
- **Never write to Nightscout** — inviolable

---

## 7. Key Files Reference

```
packages/webapp/
  lib/logic/
    attribution-logic.ts        Core attribution engine — preserve
    iob-logic.ts                IOB calculation — preserve
    cob-logic.ts                COB calculation — preserve
    prediction-logic.ts         Two-tier prediction — preserve
    llm-service.ts              37 lines, hardcoded Gemini — REPLACE with provider factory
    agent/
      tools.ts                  7 agent tools — extend, add analyze_patterns
      prompts.ts                System prompt + explain prompts — extend
      patterns.ts               Pre-defined investigative patterns — extend
      guidelines.ts             Behavioral guidelines — preserve
      domain-knowledge.ts       Clinical domain context — preserve and extend
  lib/db/
    models.ts                   Dual MongoDB lazy proxy — preserve
    connection.ts               Dual connection setup — preserve
  app/api/
    explain/route.ts            Dashboard explain — update to use provider factory + structured context
    profile/explain/route.ts    Profile explain — update to use provider factory + structured context
    tuning/explain/route.ts     DOES NOT EXIST — create
    chat/route.ts               Agent chat — update to use provider factory + intent classifier

packages/predictive-models/
  app/services/
    unified_foundation_optimizer.py   Joint optimization — preserve
    holistic_profile_analyzer.py      Cross-timeframe analysis — preserve
    meal_activity_optimizer.py        Ridge regression optimizer — preserve
```

---

## 8. Environment Variables

```env
# Existing
MONGO_URI                   Freddy MongoDB
NIGHTSCOUT_MONGO_URI        Nightscout MongoDB (read-only)
GEMINI_API_KEY              Google Gemini
PREDICTION_SERVICE_URL      ML service (default: http://localhost:8000)

# Add
OLLAMA_BASE_URL             Ollama local endpoint (default: http://localhost:11434)
OLLAMA_MODEL                Model name (default: qwen3:14b)
LLM_PROVIDER                'gemini' | 'ollama' (overrides SystemConfig if set)
```

---

## 9. Model Strategy

**Current:** Gemini 2.5 Flash Lite (free tier, hardcoded)

**Target:** Model-agnostic via provider interface. Gemini and Ollama as first-class providers. Model configured in Settings UI, stored in SystemConfig, read by provider factory.

**Local model target:** Qwen3 14B Q4 on Ollama. Hardware upgrade (RTX 3060 12GB) pending — local model optimization is deferred. Build the interface now, tune for local constraints later.

**Why Qwen3 for local:**
- Strong tool calling (trained explicitly for function calling)
- Reliable structured JSON output
- Hybrid thinking mode (non-thinking for operational queries, thinking for analytical)
- 14B Q4 fits comfortably in 12GB VRAM

**Thinking mode:** Controlled via system prompt toggle in Qwen3, not a separate API parameter. Intent classifier sets thinking mode per query type. Operational queries → thinking off. Analytical queries → thinking on.

**Prompt design principle:** Design prompts as if you have a capable model. Do not optimize for small model limitations yet. The pre-aggregation and structured context work (Items 2–4) will make local model performance acceptable when the time comes — the model's job is interpretation of structured evidence, not discovery from raw data.

---

## 10. Community and Future Considerations

Freddy will eventually be shared with the Nightscout/AndroidAPS community. Decisions made now should be personally optimal and generalizable. The main generalization work deferred to later:

- Multi-user auth and data isolation (currently single-user assumed)
- mmol/L unit support (currently mg/dL assumed)
- Configurable pump and CGM type
- Onboarding for a new Nightscout instance
- AndroidAPS tab as a webview of mobile-optimized routes (same API, thin client)

The self-hosted, privacy-preserving architecture already fits the community ethos. The "data stays local" framing on the chat page is exactly right. The unexplained delta framework — explicitly acknowledging what the model cannot explain — builds the kind of trust a technical community requires.

---

## 11. Summary: What to Build, In Order

| # | Item | Touches | Unblocks |
|---|---|---|---|
| 1 | Unified LLM provider interface | `llm-service.ts`, `SystemConfig`, Settings UI | Everything |
| 2 | Structured context assembly | Both explain endpoints, new context builders | Local model viability, Item 3 |
| 3 | MealActivityTuning explain endpoint | New `/api/tuning/explain`, `prompts.ts` | Full explain layer |
| 4 | Pattern persistence | New collection, background accumulator, new agent tool | Longitudinal reasoning |
| 5 | Intent classification | Chat route, new classifier, operational fast path | Quality + speed |
| 6 | Persistent chat UI | Nav structure, drawer component, page context passing | UX |

Each item is independently deployable. Build and validate each before starting the next.
