# Recalculate Statuses Tool

## MCP Tool: `recalculate_statuses`

Recalculates and caches computed statuses with attribution for a given time range.

### Use Cases
- **Cache Invalidation**: After editing treatments retroactively
- **Cache Pre-warming**: Populate cache before users access the dashboard
- **Data Verification**: Recalculate statuses to ensure accuracy

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startTime` | string | ✅ Yes | - | Start of time range (ISO timestamp) |
| `endTime` | string | No | now | End of time range (ISO timestamp) |
| `bucketSize` | number | No | 5 | Bucket size in minutes |
| `includeAttribution` | boolean | No | true | Include attribution calculations |

### Example Usage

```typescript
// Recalculate last 24 hours with attribution
{
  "startTime": "2026-01-05T16:00:00Z",
  "endTime": "2026-01-06T16:00:00Z",
  "bucketSize": 5,
  "includeAttribution": true
}
```

### Response

```json
{
  "success": true,
  "startTime": "2026-01-05T16:00:00.000Z",
  "endTime": "2026-01-06T16:00:00.000Z",
  "bucketSize": 5,
  "totalBuckets": 288,
  "calculated": 288,
  "failed": 0,
  "message": "Recalculated 288 statuses (0 failed)"
}
```

## Implementation Details

### API Endpoint
`POST /api/cache/recalculate`

### Process
1. **Clear Existing Cache**: Deletes all `ComputedStatus` records in the time range
2. **Generate Timestamps**: Creates 5-minute buckets for the entire range
3. **Recalculate**: Calls `getStatus()` for each bucket
4. **Auto-Cache**: Write-through cache automatically saves results

### Performance
- **Speed**: ~30-50ms per bucket
- **24 hours**: ~288 buckets = ~10-15 seconds total
- **Runs asynchronously**: Won't block other requests

## Files Created

- [recalculate-statuses.ts](file:///d:/Dev/NightManager/packages/mcp-server/src/tools/recalculate-statuses.ts) - MCP tool definition
- [route.ts](file:///d:/Dev/NightManager/packages/webapp/app/api/cache/recalculate/route.ts) - API endpoint
- [index.ts](file:///d:/Dev/NightManager/packages/mcp-server/src/index.ts) - Tool registration
