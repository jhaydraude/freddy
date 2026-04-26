# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### WebApp (Next.js)
```bash
cd packages/webapp
npm run dev       # Start dev server (port 3000)
npm run build     # Production build
npm run lint      # Run ESLint
```

### Predictive Models Service (Python/FastAPI)
```bash
cd packages/predictive-models
# First time setup:
python -m venv venv
venv/Scripts/activate          # Windows
pip install -r requirements.txt

# Run service:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests:
pytest tests/
```

### From repo root
```bash
npm run webapp     # Start webapp dev server
npm run setup-db   # Initialize Freddy DB
.\start-all.bat    # Start all services (Windows)
```

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `MONGO_URI` — Freddy's own MongoDB database (required)
- `NIGHTSCOUT_MONGO_URI` — Nightscout's MongoDB (read-only direct access)
- `NIGHTSCOUT_URL` / `NIGHTSCOUT_API_KEY` — Nightscout HTTP API + WebSocket
- `GEMINI_API_KEY` — Google Gemini for AI explanations and chat
- `PREDICTION_SERVICE_URL` — FastAPI ML service URL (default: `http://localhost:8000`)

## Architecture

### Two-Service Design
1. **WebApp** (`packages/webapp`) — Next.js 16 app serving both the UI and a REST API. All pages and API routes live here.
2. **Predictive Models** (`packages/predictive-models`) — Python FastAPI microservice for ML training and inference (XGBoost). WebApp calls this over HTTP.

### Dual MongoDB Connection
The webapp maintains **two simultaneous MongoDB connections** (`lib/db/connection.ts`):
- **Freddy DB** (`MONGO_URI`) — default Mongoose connection; stores Freddy-owned data: `ComputedStatus`, `SystemConfig`, `FreddyProfile`, `UserBaseline`, `TunedParameters`
- **Nightscout DB** (`NIGHTSCOUT_MONGO_URI`) — secondary connection; reads NS-owned collections directly: `entries` (glucose), `treatments`, `devicestatus`, `profile`

Models in `lib/db/models.ts` use a lazy Proxy pattern to bind each model to its correct connection at call time.

### ComputedStatus Cache
Most expensive calculations (IOB, COB, glucose predictions, attributions) are pre-computed and stored as `ComputedStatus` documents in Freddy DB, bucketed in 5-minute intervals. The `SyncWorker` (`lib/ns/sync-worker.ts`) connects to Nightscout via Socket.IO WebSocket and invalidates/recalculates cache entries when NS data changes.

### WebApp Data Flow
```
NS WebSocket → SyncWorker → cache invalidation → recalculate ComputedStatus
API request  → connectToDatabase() → status-logic.ts → reads ComputedStatus or computes fresh
```

### Logic Layer (`lib/logic/`)
All business logic lives here, separate from API routes and React components:
- `status-logic.ts` — assembles the full status context (glucose, IOB, COB, predictions)
- `iob-logic.ts`, `cob-logic.ts` — insulin/carb on board calculations
- `prediction-logic.ts` — calls the Python ML service
- `profile-logic.ts`, `profile-tuning-logic.ts` — Nightscout profile resolution and tuning
- `cache-logic.ts` — ComputedStatus bulk recalculation
- `llm-service.ts` — Gemini calls for explanations (uses `gemini-2.5-flash-lite`)
- `agent/` — AI SDK agent tools for the chat interface

### API Routes (`app/api/`)
Standard Next.js route handlers. Each calls `connectToDatabase()` then delegates to a `lib/logic/` function. Key routes: `/api/status`, `/api/glucose`, `/api/iob`, `/api/cob`, `/api/predict`, `/api/profile`, `/api/chat`, `/api/training`.

### Config (`lib/config/config-manager.ts`)
Singleton `ConfigManager` reads from env vars at startup, then DB values (`SystemConfig` collection) override at runtime via `updateConfig()`. This means settings changed in the UI take effect without restart.
