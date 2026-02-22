# Freddy Data Model Architecture

Freddy uses a **Direct Connection** strategy, treating the Nightscout database as a read-only secondary source while maintaining its own database for state, analytics, and service configuration.

## Database Distribution

```mermaid
graph TD
    subgraph "Nightscout DB (Read-Only Source)"
        NS_ENTRIES[entries]
        NS_TREATMENTS[treatments]
        NS_PROFILE[profile]
        NS_DEVICESTATUS[devicestatus]
    end

    subgraph "Freddy DB (State & Analytics)"
        FD_STATUS[computedstatus]
        FD_ANALYSIS[profile_analysis]
        FD_IR_TUNING[insulin_response_tuning]
        FD_CA_TUNING[carb_absorption_tuning]
        FD_CONFIG[system_config]
        FD_PREFS[user_preferences]
    end

    %% Relationships
    NS_ENTRIES -.-> FD_STATUS
    NS_TREATMENTS -.-> FD_STATUS
    NS_DEVICESTATUS -.-> FD_STATUS
    
    FD_STATUS --> FD_ANALYSIS
    FD_ANALYSIS --> FD_IR_TUNING
    FD_ANALYSIS --> FD_CA_TUNING
```

## Entity Details

### Nightscout Owned (Direct Access)
These entities are managed by Nightscout/AAPS. Freddy queries them directly via the `NIGHTSCOUT_MONGO_URI`.

| Entity | Collection | Description |
| :--- | :--- | :--- |
| **Entry** | `entries` | Raw glucose (SGV) and activity data (HR, Steps). |
| **Treatment** | `treatments` | Insulin bolus, carbs, temp basals, and site changes. |
| **Profile** | `profile` | Basal rates, ISF, ICR, and user settings. |
| **DeviceStatus** | `devicestatus` | Pump status, battery, and OpenAPS/Loop enacted data. |

### Freddy Owned
These entities are managed exclusively by Freddy and reside in the `MONGO_URI` database (typically `freddy_db_dev`).

| Entity | Collection | Description |
| :--- | :--- | :--- |
| **ComputedStatus** | `computedstatus` | Bucketed (5m) snapshots of system state including IOB/COB. |
| **ProfileAnalysis** | `profile_analysis` | Historical ISF/ICR estimations and stability checks. |
| **InsulinResponseTuning**| `insulin_response_tuning` | History of DIA/Peak/ISF optimization runs. |
| **CarbAbsorptionTuning** | `carb_absorption_tuning` | History of ICR/Absorption optimization runs. |
| **SystemConfig** | `system_config` | Core settings (NS URL, sync frequency, API keys). |
| **UserPreference** | `user_preferences` | UI settings (Units, Theme). |
