# NightManager MCP Implementation Plan

## 1. Project Overview
**Goal**: Create an MCP server that directly interfaces with a Nightscout MongoDB database.
**Initial State**: Read-only access to reuse existing Nightscout data.
**Future State**: Read/Write capabilities and eventually a full API replacement for Nightscout.

## 2. Core Features (Phase 1)
The primary capabilities required for the initial release are:

### A. Profile Management
**Requirement**: "Get the profile at a point in time."
- **Logic**: 
  - Query the `profile` collection for the document where `startDate` is closest to but not after the requested timestamp.
  - **Override Check**: Query the `treatments` collection for the most recent "Profile Switch" event occurring before the timestamp.
  - If the "Profile Switch" occurred after the current Profile document's `startDate`, use the profile name specified in the treatment as the active profile (overriding `defaultProfile`).
- **MCP Tool**: `get_active_profile(timestamp: string)`

### B. Basal Rate Calculation
**Requirement**: "Get the basal rate at a point in time."
- **Logic**:
  1. Fetch the Active Profile (as above).
  2. Determine the specific "Profile Name" active (usually "default" or one user-selected).
  3. Extract the `basal` schedule from that profile.
  4. Calculate the "minutes from midnight" for the requested timestamp.
  5. Find the schedule entry active for that time slot.
  6. *Future handling*: Check `treatments` for "Temp Basal" events that might override the scheduled rate.
- **MCP Tool**: `get_calculated_basal(timestamp: string)`

### C. History & Visualization Data
**Requirement**: "Return information sufficient to create a graph of glucose history and treatment events."
- **Logic**:
  - Need to fetch data from two distinct collections: `entries` (glucose) and `treatments` (insulin/carbs).
  - Efficiently query ranges (start/end dates).
- **MCP Tool**: `get_graph_data(startDate: string, endDate: string)`
  - Returns:
    - **Glucose**: Array of SGV (Sensor Glucose Values) with timestamps.
    - **Treatments**: Array of Bolus events, Carb entries, and notes.

### D. IOB Calculation (Insulin on Board)
**Requirement**: "Point in time as well as plotted."
- **Logic**:
  - **Point in Time**: Calculate active insulin at a specific moment.
    - Requires fetching boluses and temp basals within the `dia` (Duration of Insulin Action) window preceding the timestamp.
    - Requires the `dia` value from the active profile.
    - Apply a decay curve (standard exponential or linear) to sum remaining insulin.
  - **Plotted**: Calculate IOB at regular intervals (e.g., every 5 mins) over a time range to graph the curve.
- **Service**: `getIOB(timestamp: string)`
- **MCP Tool**: `get_iob(timestamp: string)` and `get_iob_history(startDate: string, endDate: string)`

### E. COB Calculation (Carbs on Board)
**Requirement**: "Likely point in time values, maybe plotted."
- **Logic**:
  - Similar to IOB but for carbohydrates.
  - Requires fetching carb entries from `treatments`.
  - Apply absorption model (linear or dynamic based on ISF/sensitivity, though linear is standard for simple display).
- **Service**: `getCOB(timestamp: string)`
- **MCP Tool**: `get_cob(timestamp: string)` and `get_cob_history(startDate: string, endDate: string)`

## 3. Data Architecture (MongoDB)
We will map these Mongoose schemas to existing Nightscout collections:

1.  **Entries (`entries`)**
    - Fields: `sgv` (glucose value), `dateString`, `date` (epoch), `trend` (arrow), `direction`.
    
2.  **Treatments (`treatments`)**
    - Fields: `eventType` (Correction Bolus, Meal Bolus, Temp Basal, etc.), `insulin`, `carbs`, `created_at`.

3.  **Profile (`profile`)**
    - Fields: `startDate`, `defaultProfile` (string), `store` (map of profile names).
    - Inside `store`: `basal` (array of time/value), `carbratio`, `sens` (ISF).

## 4. Project Structure (Refactored)
The core logic has been split into focused modules for better maintainability:
- `src/lib/profile-logic.ts`: Profile resolution and switch override detection.
- `src/lib/basal-logic.ts`: Basal schedule lookup algorithms.
- `src/lib/iob-logic.ts`: Insulin on Board services and decay models.
- `src/lib/cob-logic.ts`: Carbs on Board services and absorption models.
- `src/lib/history-logic.ts`: History aggregation for glucose and treatments.

## 5. Development Stages
1.  **Modularization**: Split `nightscout-logic.ts` into the above modules.
2.  **Import Update**: Redirect `index.ts` and test scripts to the new modules.

## 5. Future Capabilities
### Glucose Prediction Service
**Requirement**: "Forecast future glucose levels based on current IOB, COB, and trends."
- **Status**: Planned for later phase.
- **Dependencies**: Robust IOB and COB calculations (completed in Phase 1).
- **Goal**: Implement algorithm (e.g., URE or simpler linear projection) to provide "predicted" glucose values for the next X hours.

