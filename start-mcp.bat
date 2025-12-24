@echo off
echo Starting MCP Server with Inspector...
echo.
echo The MCP Inspector will be available at: http://localhost:5173
echo.
cd /d "%~dp0packages\mcp-server"
npx @modelcontextprotocol/inspector npx tsx src/index.ts
