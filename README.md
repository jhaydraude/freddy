# Freddy - The Intelligent Loop Manager

A comprehensive diabetes management platform with predictive ML models, and web interface for Nightscout data.

## Architecture

This is a monorepo containing multiple independent packages:

```
NightManager/
├── packages/
│   ├── predictive-models/    # Python ML prediction service
│   ├── webapp/               # Web application (Next.js 16)
│   └── shared/               # Shared TypeScript utilities
├── docs/                     # Documentation
└── archive/                  # Archived legacy code
```

## Packages

### 🤖 Predictive Models ([packages/predictive-models](packages/predictive-models/))

Python-based machine learning service for glucose prediction and profile optimization.

**Technologies**: Python, FastAPI, XGBoost, scikit-learn

### 🌐 WebApp ([packages/webapp](packages/webapp/))

Next.js-based dashboard and API service for Nightscout data and predictive analysis.

**Technologies**: Next.js 16, TypeScript, TailwindCSS, Mongoose

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

**Start Predictive Models Service:**
```bash
.\start-prediction-service.bat
```

**Start WebApp:**
```bash
.\start-webapp.bat
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
MONGO_URI=mongodb://localhost:27017/nightscout

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
# Run tests in webapp
cd packages/webapp
npm test
```

### Building

```bash
# Build all packages
npm run build --workspaces

# Build specific package
cd packages/webapp
npm run build
```

## Documentation

- [Predictive Models Documentation](packages/predictive-models/README.md)
- [Training Guide](docs/training-guide.md)
- [Technical Documentation](docs/)

## Services

### Predictive Models Service
- **Port**: 8000
- **Health Check**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs

## Contributing

Each package has its own README with specific development instructions.

## License

ISC
