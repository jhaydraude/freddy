# Archive Directory

This directory contains the old file structure from before the monorepo reorganization (2025-12-23).

## Contents

- `src/` - Original MCP server source code (now in `packages/mcp-server/src/`)
- `scripts/` - Original test/utility scripts (now in `packages/mcp-server/scripts/`)
- `PredictiveModelsService/` - Original Python service (now in `packages/predictive-models/`)
- `test-*.ts` - Root-level test files
- `verify-caching.ts` - Caching verification script

## Purpose

These files are kept as a backup in case anything needs to be referenced from the original structure. They are no longer used in the active codebase.

## Safe to Delete?

Once you've verified that:
1. The MCP server works correctly from `packages/mcp-server/`
2. The Predictive Models service works from `packages/predictive-models/`
3. All functionality is preserved
4. You've committed the reorganization to git

...then this archive directory can be safely deleted.

## Cleanup Command

When ready:
```powershell
Remove-Item -Recurse -Force archive
```

---

**Archived on**: 2025-12-23  
**Reason**: Monorepo reorganization
