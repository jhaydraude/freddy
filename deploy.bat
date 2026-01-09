@echo off
echo Deploying Freddy to Test Server via SSH...

REM SSH into test server and run deployment
ssh user@test-server "cd /opt/freddy && ./deploy.sh"

echo Deployment complete!
pause
