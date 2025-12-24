# NightManager MCP Server

Model Context Protocol (MCP) server that provides tools for accessing and analyzing Nightscout diabetes management data.

## Features

- **Glucose Data**: Retrieve current and historical glucose readings
- **IOB/COB**: Calculate Insulin on Board and Carbs on Board with detailed timeseries
- **Status**: Get comprehensive diabetes management status
- **Profile Analysis**: Analyze and recommend insulin therapy profiles
- **Training Data**: Generate training data for machine learning models
- **AI Explanations**: Get natural language explanations of glucose trends

## Tools Available

- `get_glucose` - Retrieve glucose readings
- `get_status` - Get current diabetes management status
- `get_status_history` - Get historical status data
- `get_iob` - Calculate Insulin on Board
- `analyze_profile` - Analyze insulin therapy profiles
- `generate_training_data` - Generate ML training datasets
- `generate_profile_training_data` - Generate profile training data
- `explain_status` - Get AI-powered explanations
- `estimate_isf` - Estimate Insulin Sensitivity Factor

## Usage

```bash
npm start
```

Or using tsx directly:
```bash
npx tsx src/index.ts
```

## Configuration

Copy `.env.example` to `.env` and configure:
- `MONGODB_URI` - MongoDB connection string for Nightscout database
- `GEMINI_API_KEY` - Google Gemini API key for AI explanations

## Development

Run tests:
```bash
npm test
```

Run specific test scripts from `/scripts` directory.
