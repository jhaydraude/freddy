# Important: PredictiveModelsService Directory

⚠️ **This directory could not be archived automatically**

## Why?

You currently have **2 Python processes** running from this directory:
- Process 1: Running for 8h35m+
- Process 2: Running for 36m+
- Command: `python -m app.main` in `d:\Dev\NightManager\PredictiveModelsService`

Windows cannot move or delete directories that are in use by running processes.

## To Complete the Archive

1. **Stop the old services:**
   - Close the terminal windows running the old Python service
   - Or press `Ctrl+C` in those terminals

2. **Verify services are stopped:**
   ```powershell
   # Check if any processes are still using the directory
   Get-Process python | Where-Object {$_.Path -like "*NightManager\PredictiveModelsService*"}
   ```

3. **Move the directory to archive:**
   ```powershell
   move PredictiveModelsService archive\PredictiveModelsService
   ```

4. **Start the new service:**
   ```bash
   .\start-prediction-service.bat
   ```
   This will start the service from the new location: `packages\predictive-models\`

## New Service Location

The Predictive Models service is now located at:
```
packages\predictive-models\
```

And can be started with:
```bash
.\start-prediction-service.bat
```

Or directly:
```bash
cd packages\predictive-models
python -m app.main
```

## Important

⚠️ **Do NOT delete the old directory until:**
1. You've stopped the running processes
2. You've successfully started and tested the new service
3. You've verified all functionality works from `packages\predictive-models\`

Once verified, you can safely move `PredictiveModelsService` to `archive\` and eventually delete the entire `archive\` directory.
