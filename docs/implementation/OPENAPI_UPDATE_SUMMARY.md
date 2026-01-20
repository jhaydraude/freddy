# OpenAPI Specifications - Update Summary

**Date**: 2026-01-18  
**Status**: ✅ Both specs updated

---

## Summary

Updated both OpenAPI specifications to include the new insulin response tuning endpoints:

1. **Predictive Models Service** (`packages/predictive-models/openapi.json`)
2. **Webapp API** (`packages/webapp/lib/openapi.ts`)

---

## Predictive Models Service (Python)

### File: `packages/predictive-models/openapi.json`

**Status**: ✅ Auto-generated and cleaned

**New Endpoint**:
- `POST /api/v1/tune/insulin-response`

**Schemas**:
- `InsulinResponseTuningRequest`
- `InsulinResponseTuningResponse`

**Size**: 64.81 KB  
**Total Endpoints**: 17

**How to Update**:
```bash
cd packages/predictive-models
python generate_openapi.py
```

---

## Webapp API (TypeScript)

### File: `packages/webapp/lib/openapi.ts`

**Status**: ✅ Manually updated with Zod schemas

**New Endpoints**:
- `POST /api/profile/tune-insulin-response` - Start tuning
- `GET /api/profile/tune-insulin-response` - Get history
- `GET /api/profile/tune-insulin-response/{tuning_id}` - Get status
- `POST /api/profile/tune-insulin-response/{tuning_id}/apply` - Apply results

**New Schemas** (77 lines added):
- `InsulinResponseTuningConfigSchema`
- `InsulinResponseValuesSchema`
- `InsulinResponseOptimizedValuesSchema`
- `InsulinResponseAnalysisSummarySchema`
- `InsulinResponseTuningResponseSchema`
- `TuningStartResponseSchema`
- `TuningApplyRequestSchema`
- `TuningApplyResponseSchema`
- `TuningHistoryResponseSchema`

**Total Lines**: 514 (was 338, added 176 lines)

---

## Schema Details

### Request Schema (POST /api/profile/tune-insulin-response)

```typescript
{
  analysis_period_days?: number;  // Default: 30
  window_hours?: number;          // Default: 2
  include_activity?: boolean;     // Default: true
}
```

### Response Schema (Start)

```typescript
{
  tuning_id: string;              // UUID
  status: 'running';
  estimated_duration_seconds: number;
}
```

### Response Schema (Status)

```typescript
{
  tuning_id: string;
  user_id: string;
  created_at: string;             // ISO datetime
  status: 'running' | 'completed' | 'failed' | 'applied';
  config: { ... };
  current_values: {
    dia: number;                  // 3-8 hours
    peak: number;                 // 30-75 minutes
    isf: number[];                // 6 blocks, 10-200 mg/dL per unit
    source: 'profile' | 'previous_tuning';
  };
  optimized_values?: {
    dia: number;
    peak: number;
    isf: number[];
    dia_confidence: [number, number];
    peak_confidence: [number, number];
    isf_confidence: [number, number][];
    r_squared: number;
    rmse: number;
    mae: number;
    windows_analyzed: number;
  };
  analysis_summary?: {
    total_windows: number;
    stable_windows: number;
    meal_windows: number;
    activity_windows: number;
    data_quality_score: number;   // 0-1
  };
  applied_at?: string;
  logs?: string[];
  error_message?: string;
}
```

### Apply Request Schema

```typescript
{
  apply_to_profile: boolean;      // Update Nightscout profile
  apply_to_system: boolean;       // Use in calculations
}
```

### Apply Response Schema

```typescript
{
  success: boolean;
  applied_at: string;             // ISO datetime
  message: string;
}
```

---

## Validation

### Webapp OpenAPI (Zod)

All schemas use Zod for runtime validation:

- **Type safety**: TypeScript types auto-generated from Zod schemas
- **Runtime validation**: Requests/responses validated at runtime
- **OpenAPI generation**: Schemas automatically converted to OpenAPI format
- **Documentation**: Metadata included for API docs

### Predictive Models (Pydantic)

All schemas use Pydantic for validation:

- **Type hints**: Full Python type annotations
- **Validation**: Automatic request/response validation
- **OpenAPI generation**: FastAPI auto-generates from Pydantic models
- **Documentation**: Docstrings included in OpenAPI spec

---

## API Documentation Access

### Predictive Models Service

When running on `http://localhost:8000`:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Webapp API

When running on `http://localhost:3000`:

- **OpenAPI Document**: Available via `openApiDocument` export
- Can be served at `/api/openapi.json` if route added
- Can generate Swagger UI using the document

---

## Maintenance

### When to Update

Update OpenAPI specs when:

1. ✅ Adding new endpoints
2. ✅ Modifying request/response schemas
3. ✅ Changing parameter validation rules
4. ✅ Updating endpoint descriptions
5. ✅ Adding new tags or categories

### Predictive Models

**Automatic**: Run `python generate_openapi.py`

The script:
- Imports FastAPI app
- Calls `app.openapi()`
- Writes to `openapi.json`
- Cleans logging output

### Webapp

**Manual**: Edit `lib/openapi.ts`

Steps:
1. Add Zod schemas for new types
2. Add endpoint definitions to `paths`
3. Include proper tags and descriptions
4. Verify TypeScript compiles

---

## Testing

### Validate Schemas

```typescript
// Webapp - Test Zod schema
import { InsulinResponseTuningConfigSchema } from './lib/openapi';

const config = {
  analysis_period_days: 30,
  window_hours: 2,
  include_activity: true
};

const result = InsulinResponseTuningConfigSchema.safeParse(config);
console.log(result.success); // true
```

```python
# Predictive Models - Test Pydantic schema
from app.routers.insulin_response_tuning import InsulinResponseTuningRequest

request = InsulinResponseTuningRequest(
    windows=[],
    current_dia=5.0,
    current_peak=45.0
)
print(request.model_dump_json())
```

---

## Files Updated

1. ✅ `packages/predictive-models/openapi.json` (auto-generated)
2. ✅ `packages/predictive-models/generate_openapi.py` (created)
3. ✅ `packages/predictive-models/OPENAPI_MAINTENANCE.md` (created)
4. ✅ `packages/webapp/lib/openapi.ts` (manually updated)

---

## Next Steps

1. **Generate client SDKs** (optional)
   - Use OpenAPI Generator to create TypeScript/Python clients
   - Ensures type-safe API calls

2. **Add API documentation route** (optional)
   - Serve OpenAPI spec at `/api/openapi.json`
   - Add Swagger UI to webapp

3. **Contract testing** (optional)
   - Validate actual API responses match schemas
   - Catch breaking changes early

---

**Last Updated**: 2026-01-18 00:35  
**Webapp Spec Version**: 1.0.0  
**Predictive Models Spec Version**: 1.0.0
