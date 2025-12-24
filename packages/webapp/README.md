# NightManager WebApp

The **NightManager WebApp** is a modern, responsive dashboard interface for viewing your diabetes management data. It connects directly to the NightManager MCP server logic to visualize glucose trends, IOB, COB, and more.

## Features
- **Real-time Dashboard**: Displays current glucose, trend, active insulin (IOB), and carbs on board (COB).
- **Interactive Chart**: Visualizes glucose history with dynamic time ranges (3h, 6h, 12h, 24h) and target ranges.
- **Mobile-Friendly**: Fully responsive design optimized for desktop and mobile devices.
- **Dark Mode**: Sleek, battery-saving dark interface.

## Tech Stack
- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Visualization**: Recharts
- **Icons**: Lucide React

## Getting Started

### Prerequisites
- Node.js (v18+)
- Active MongoDB connection (configured in root `.env`)

### Running Locally

To start the webapp in development mode:

```bash
# From the project root
npm run webapp
```

Or navigating to the package directly:

```bash
cd packages/webapp
npm run dev
```

Visit `http://localhost:3000` to access the dashboard.

## Architecture

The webapp is built within the `packages/webapp` directory of the monorepo. It leverages the `@nightmanager/mcp-server` package as a library to access data retrieval logic (`get_status_history`), ensuring consistency with the MCP server tools used by AI agents.

### Key Components
- **`app/page.tsx`**: Main dashboard controller.
- **`components/GlucoseChart.tsx`**: Reusable interactive chart component.
- **`lib/mcp.ts`**: Bridge to the MCP server logic with database connection handling.
- **`app/api/history/route.ts`**: API endpoint exposing status history to the frontend.
