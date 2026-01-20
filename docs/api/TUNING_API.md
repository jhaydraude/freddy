# API Reference: Insulin Response Tuning

The Insulin Response Tuning API manages the lifecycle of metabolic parameter optimization.

## Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/profile/tune-insulin-response` | Start a new tuning run |
| `GET` | `/api/profile/tune-insulin-response/history` | Get previous tuning runs |
| `GET` | `/api/profile/tune-insulin-response/[tuning_id]` | Get status/results of a run |
| `POST` | `/api/profile/tune-insulin-response/[tuning_id]/apply` | Apply results to profile |

---

## 1. Start Tuning Run
Starts an asynchronous optimization process.

**Request:** `POST /api/profile/tune-insulin-response`
```json
{
  "analysis_period_days": 14,
  "window_hours": 2,
  "include_activity": true
}
```

**Response:** `200 OK`
```json
{
  "tuning_id": "uuid-string",
  "status": "running",
  "estimated_duration_seconds": 45
}
```

---

## 2. Get Tuning Status
Poll this endpoint to retrieve results.

**Request:** `GET /api/profile/tune-insulin-response/[tuning_id]`

**Response:** `200 OK` (when completed)
```json
{
  "tuning_id": "...",
  "status": "completed",
  "current_values": {
    "dia": 5.0,
    "peak": 45,
    "isf": [50, 50, 50, 50, 50, 50]
  },
  "optimized_values": {
    "dia": 5.2,
    "peak": 48,
    "isf": [52.5, 52.5, 52.5, 52.5, 52.5, 52.5],
    "dia_confidence": [4.7, 5.7],
    "peak_confidence": [40, 56],
    "isf_confidence": [[45, 60], ...],
    "r_squared": 0.78,
    "rmse": 12.3,
    "mae": 9.1,
    "windows_analyzed": 360
  }
}
```

---

## 3. Apply Results
Selectively applies optimized parameters to the system and external profile.

**Request:** `POST /api/profile/tune-insulin-response/[tuning_id]/apply`
```json
{
  "apply_to_profile": true,
  "apply_to_system": true,
  "selection": {
    "dia": true,
    "peak": false,
    "isf": [true, true, false, false, false, false]
  }
}
```
*   `selection.isf`: Array of 6 booleans corresponding to 4-hour time blocks starting at 00:00.

**Response:** `200 OK`
```json
{
  "success": true,
  "applied_at": "ISO-TIMESTAMP",
  "message": "Insulin response parameters updated successfully"
}
```

---

## Internal Service Integration

The `InsulinResponseTuningService` coordinates with:
1.  **Mongoose**: Stores run data in the `insulin_response_tuning` collection.
2.  **Python Predictive Models Service**: Calls `POST /api/v1/tune/insulin-response` for heavy mathematical lifting.
3.  **Nightscout API**: Uses `POST /api/v1/profile` (V2/V3) to sync results back to the user's primary database.
