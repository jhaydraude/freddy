# NightManager WebApp

The **NightManager WebApp** is a modern, responsive dashboard interface for viewing your diabetes management data. It provides real-time visualization of glucose trends, IOB, COB, and AI-powered profile analysis.

## Features
- **Real-time Dashboard**: Displays current glucose, trend, active insulin (IOB), and carbs on board (COB).
- **Interactive Chart**: Visualizes glucose history with dynamic time ranges (3h, 6h, 12h, 24h) and target ranges.
- **AI Explanations**: Uses Gemini LLM to explain current trends and status.
- **Profile Analysis**: Performs holistic analysis of ISF, ICR, and Basal rates using historical data.
- **Mobile-Friendly**: Fully responsive design optimized for desktop and mobile devices.
- **Dark Mode**: Sleek, battery-saving dark interface.

## Tech Stack
- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Custom UI kit)
- **Visualization**: Recharts
- **Icons**: Lucide React
- **ORM**: Mongoose

## Getting Started

### Prerequisites
- Node.js (v18+)
- Active MongoDB connection (configured in `.env`)

### Running Locally

To start the webapp in development mode from the project root:

```bash
.\start-webapp.bat
```

Or navigating to the package directly:

```bash
cd packages/webapp
npm run dev
```

Visit `http://localhost:3000` to access the dashboard.

## Architecture

The webapp is built within the `packages/webapp` directory. It contains all the core logic for data processing and analysis.

### Key Components
- **`app/page.tsx`**: Main dashboard controller.
- **`components/`**: Reusable UI components.
- **`lib/logic/`**: Core business logic for IOB, COB, and profile analysis.
- **`lib/db/`**: Database models and connection management.
- **`app/api/`**: API endpoints for data retrieval and AI features.
