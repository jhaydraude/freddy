# Post-Reorganization Checklist

Use this checklist to verify everything is working correctly and complete the migration.

## Immediate Actions

- [x] **Stop old running services**  
  ✅ Python services stopped (will need restart from new location)
  ⚠️ Note: One service may have auto-restarted
  
- [x] **Archive old directories**  
  ✅ `src/` → `archive/src/`
  ✅ `scripts/` → `archive/scripts/`
  ✅ Test files → `archive/`
  ✅ Training data → `archive/data/`
  ⚠️ `PredictiveModelsService/` - File handles locked (see ARCHIVE_STATUS.md)
  
- [ ] **Complete PredictiveModelsService archive**
  - Close old files in IDE (`src/db/models.ts`, `src/index.ts`, etc.)
  - Run `.\archive-predictive-service.bat`
  
- [ ] **Restart services from new locations**
  - [ ] Test: `.\start-mcp.bat` (should start from `packages/mcp-server/`)
  - [ ] Test: `.\start-prediction-service.bat` (should start from `packages/predictive-models/`)
  - [ ] Or use: `.\start-all.bat` to start both


## Verification Steps

- [ ] **MCP Server**
  - [ ] Starts without errors
  - [ ] MCP Inspector accessible at http://localhost:5173
  - [ ] Database connection works
  - [ ] All tools are available in Inspector

- [ ] **Predictive Models Service**
  - [ ] Starts without errors
  - [ ] Health check responds: http://localhost:8000/health
  - [ ] API docs accessible: http://localhost:8000/docs
  - [ ] Can make prediction requests

- [ ] **Test MCP Tools**
  - [ ] `get_status` returns current data
  - [ ] `get_glucose` returns glucose readings
  - [ ] `get_iob` calculates insulin on board
  - [ ] Other tools function as before

## Optional Cleanup

Once you've verified everything works:

- [ ] **Remove old directories**
  ```powershell
  # ONLY after thorough testing!
  Remove-Item -Recurse -Force src
  Remove-Item -Recurse -Force PredictiveModelsService
  Remove-Item -Recurse -Force scripts
  ```

- [ ] **Remove old test files from root**
  ```powershell
  Remove-Item test-*.ts
  Remove-Item verify-caching.ts
  ```

- [ ] **Remove old data files from root** (optional)
  ```powershell
  # Keep if you need them, or move to appropriate package
  # glucose_training_clean.json
  # profile_training_data.json
  # sample_glucose_training_data.json
  # profile-analysis-result.json
  # test-analyze-profile-request.json
  # test_15min_v2.json
  ```

## Git Workflow

- [ ] **Review changes**
  ```bash
  git status
  git diff
  ```

- [ ] **Stage new structure**
  ```bash
  git add packages/
  git add docs/
  git add package.json
  git add README.md
  git add .gitignore
  git add start-*.bat
  ```

- [ ] **Commit reorganization**
  ```bash
  git commit -m "Reorganize into monorepo structure

  - Moved MCP server to packages/mcp-server/
  - Moved PredictiveModelsService to packages/predictive-models/
  - Created placeholder for packages/webapp/
  - Created packages/shared/ for shared utilities
  - Updated workspace configuration
  - Updated startup scripts
  - Moved documentation to docs/
  "
  ```

- [ ] **Remove old files** (in separate commit)
  ```bash
  git rm -r src/
  git rm -r PredictiveModelsService/
  git rm -r scripts/
  git commit -m "Remove old directory structure after reorganization"
  ```

## Development Workflow Updates

- [ ] **Update any IDE/editor configurations**
  - Update TypeScript project references
  - Update debugger launch configurations
  - Update file watchers

- [ ] **Update any deployment scripts**
  - Docker configurations
  - CI/CD pipelines
  - Deployment scripts

- [ ] **Update documentation**
  - Internal wiki/docs
  - Developer onboarding docs
  - Deployment guides

## Known Changes

✅ **File paths changed:**
- Old: `src/index.ts` → New: `packages/mcp-server/src/index.ts`
- Old: `PredictiveModelsService/app/` → New: `packages/predictive-models/app/`

✅ **Startup commands changed:**
- Scripts now `cd` into package directories first
- Can also run directly: `cd packages/mcp-server && npm start`

✅ **Import paths:**
- All imports within MCP server remain relative (no changes needed)
- Future: Can use workspace references like `@nightmanager/shared`

## Questions or Issues?

If something doesn't work:

1. Check that `.env` file exists in `packages/mcp-server/`
2. Verify `node_modules` installed in all packages: `npm install`
3. Check startup scripts are using correct paths
4. Review `docs/REORGANIZATION_COMPLETE.md` for details

## Next: WebApp Development

When ready to start building the webapp:

```bash
cd packages/webapp
# Choose your framework (e.g., Next.js)
npx create-next-app@latest . --typescript --tailwind --app
```

Update `packages/webapp/package.json` with actual dependencies and scripts.
