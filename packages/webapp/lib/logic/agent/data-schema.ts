/**
 * data-schema.ts
 *
 * Portable reference for the Freddy data model and tool selection guidelines.
 * Imported into the agent system prompt to ground tool-calling decisions.
 */

export const DATA_SCHEMA_PROMPT = `
## Database Schema Reference

### Database Schema Reference

### entries (Nightscout — CGM data)
| Field       | Type   | Notes |
|-------------|--------|-------|
| sgv         | number | Sensor glucose value (**mg/dL**) |
| date        | number | Epoch milliseconds (primary timestamp) |
| dateString  | string | ISO 8601 string mirror of date |
| direction   | string | Trend arrow |
| type        | string | "sgv" for glucose, "activity" for heart rate / steps |
| heartrate   | number | BPM from wearable (only when type="activity") |
| steps       | number | Step count sample (only when type="activity") |
| stale       | bool   | If true, the record has been flagged as stale and should be excluded |

> When querying entries via query_data, the date field is epoch milliseconds (a number).
> IMPORTANT: All fields in the 'entries' collection use **mg/dL** units.

### treatments (Nightscout — insulin, carbs, events)
| Field       | Type   | Notes |
|-------------|--------|-------|
| eventType   | string | "Meal Bolus", "Correction Bolus", "Bolus", "Carb Correction", "Temp Basal", "Profile Switch", "Site Change", "Sensor Start", "Note" |
| insulin     | number | Units of insulin delivered (bolus events) |
| carbs       | number | Grams of carbohydrates entered |
| created_at  | string | ISO 8601 timestamp |
| duration    | number | Duration in minutes (temp basals) |
| rate        | number | Absolute rate U/hr (temp basals) |
| percent     | number | Percentage adjustment (temp basals) |
| profile     | string | Profile name (profile switch events) |

> When querying treatments via query_data, created_at is an ISO string.

### activity_records (Freddy — structured workout sessions)
| Field           | Type   | Notes |
|-----------------|--------|-------|
| type            | string | Record type identifier |
| startTime       | number | Epoch milliseconds |
| endTime         | number | Epoch milliseconds |
| data.steps      | number | Step count for the session |
| data.heartRate  | number | Heart rate for the session |
| created_at      | Date   | MongoDB Date object |

> When querying activity_records via query_data, created_at is a Date object.
`;

