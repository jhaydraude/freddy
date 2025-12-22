# NightManager MCP Implementation Plan

## 1. Project Overview
**Goal**: Create an MCP server that directly interfaces with a Nightscout MongoDB database.
**Current State**: Core read-only features are implemented, providing profile management, basal calculation, IOB/COB tracking, and historical data visualization.
**Future State**: Read/Write capabilities and eventually a full API replacement for Nightscout.

## 2. Completed Features (Phase 1)
The following core capabilities have been implemented and are available as MCP tools:

### A. Profile Management
- **Tool**: `get_active_profile`
- **Status**: ✅ Complete
- **Capabilities**:
  - Resolves active profile based on timestamp.
  - Handles "Profile Switch" events from treatments to override the default profile.
  - Returns ISF, Carb Ratio, Basal Schedule, and DIA.

### B. Basal Rate Calculation
- **Tool**: `get_calculated_basal`
- **Status**: ✅ Complete
- **Capabilities**:
  - Calculus exact basal rate at any given timestamp.
  - Accounts for scheduled rates from difference profiles.
  - **Advanced**: correctly handles "Temp Basal" events (percent or absolute) that override the schedule.

### C. IOB (Insulin on Board) & COB (Carbs on Board)
- **Tools**: `get_iob`, `get_cob`, `get_status`
- **Status**: ✅ Complete
- **Capabilities**:
  - **Bolus IOB**: Calculates decay for Meal and Correction boluses.
  - **Basal IOB**: Calculates Net IOB (Delivered vs Scheduled) to account for basal suspensions or temp increases.
  - **Dynamic DIA**: Uses the DIA from the active profile for all calculations.
  - **Status Report**: `get_status` returns an aggregated view of Basal, IOB (with breakdown), and COB.

### D. History & Visualization
- **Tools**: `get_history`, `get_latest_glucose`
- **Status**: ✅ Complete
- **Capabilities**:
  - Generic history fetching for separate axes (Glucose vs Treatments).
  - Glucose delta calculation (5m and 10m) for dashboard trends.

## 3. Data Architecture (MongoDB)
Mapped to existing Nightscout collections:
- **Entries**: Glucose values (`sgv`), trends, and timestamps.
- **Treatments**: Boluses, Temp Basals, Carbs, Profile Switches.
- **Profile**: Nightscout profile store with multiple named profiles.

## 4. Project Structure
The codebase is modularized in `src/lib/`:
- `status-logic.ts`: System status and latest glucose (deltas).
- `profile-logic.ts`: Profile resolution and switching.
- `basal-logic.ts`: Basal schedule and rate calculation.
- `iob-logic.ts`: Complex IOB calculation (Bolus + Basal).
- `cob-logic.ts`: COB calculation.
- `history-logic.ts`: Data fetching for graphs.

## 5. Future Roadmap
### Phase 2: Predictive Capabilities
- **Glucose Prediction**: Forecast future glucose based on current IOB/COB and trend momentum.
- **Simulation**: "What-if" scenarios for bolus calculators.

### Phase 3: Write Capabilities
- **Remote Control**: Ability to enact profile switches or uploading treatments via MCP.
- **Safety Checks**: Strict validation before allowing write operations.

### Phase 4: Full API Replacement
- Expose REST/API endpoints compatible with Nightscout clients (e.g., Loop, xDrip).
