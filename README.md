# NightManager

A comprehensive diabetes management platform with MCP server, predictive ML models, and web interface for Nightscout data.

## Architecture

This is a monorepo containing multiple independent packages:

```
NightManager/
├── packages/
│   ├── mcp-server/           # Model Context Protocol server
│   ├── predictive-models/    # Python ML prediction service
│   ├── webapp/               # Web application (planned)
│   └── shared/               # Shared TypeScript utilities
├── docs/                     # Documentation
└── scripts/                  # Build and deployment scripts
```

## Packages

### 🔌 MCP Server ([packages/mcp-server](packages/mcp-server/))

Model Context Protocol server providing tools for:
- Glucose data retrieval and analysis
- IOB/COB calculations with timeseries
- Profile analysis and recommendations
- AI-powered explanations
- Training data generation

**Technologies**: TypeScript, MongoDB (Mongoose), Google Gemini AI

### 🤖 Predictive Models ([packages/predictive-models](packages/predictive-models/))

Python-based machine learning service for glucose prediction and profile optimization.

**Technologies**: Python, FastAPI, scikit-learn, TensorFlow

### 🌐 WebApp ([packages/webapp](packages/webapp/))

Web application interface (under development).

**Technologies**: TBD (likely Next.js or similar)

### 📦 Shared ([packages/shared](packages/shared/))

Shared TypeScript types and utilities used across packages.

## Quick Start

### Install Dependencies

From the root directory:

```bash
npm install
```

This will install dependencies for all workspace packages.

### Start Services

**Start MCP Server:**
```bash
.\start-mcp.bat
```

**Start Predictive Models Service:**
```bash
.\start-prediction-service.bat
```

**Start All Services:**
```bash
.\start-all.bat
```

## Configuration

### Environment Variables

1. Copy `.env.example` to `.env` in the root directory
2. Configure the following:

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/nightscout

# AI Services
GEMINI_API_KEY=your_gemini_api_key_here

# Predictive Models Service
PREDICTION_SERVICE_URL=http://localhost:8000
```

## Development

### Workspace Structure

This monorepo uses npm workspaces. Each package is independent but can reference other packages.

### Running Tests

```bash
# Run tests in specific package
cd packages/mcp-server
npm test
```

### Building

```bash
# Build all packages
npm run build --workspaces

# Build specific package
cd packages/mcp-server
npm run build
```

## Documentation

- [MCP Server Documentation](packages/mcp-server/README.md)
- [Predictive Models Documentation](packages/predictive-models/README.md)
- [Technical Documentation](docs/)

## Services

### MCP Server
- **Port**: N/A (stdio-based MCP)
- **Inspector**: http://localhost:5173

### Predictive Models Service
- **Port**: 8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs

## Contributing

Each package has its own README with specific development instructions.

## License

ISC
