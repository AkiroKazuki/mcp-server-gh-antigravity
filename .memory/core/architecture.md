# Architecture

## High-Level Design
Client-Server architecture where the Node.js backend acts as a proxy/aggregator for external APIs.

## Components
1.  **Client (React)**
    - `MarketDashboard`: Main view.
    - `MarketCard`: Individual market display.
    - `NewsFeed`: Contextual news column.
    - `BetCalculator`: ROI utility.

2.  **Server (Node/Express)**
    - `GET /api/markets`: Fetches from Gamma API, caches for 60s.
    - `GET /api/news`: Fetches from CryptoPanic, caches for 5m.
    - `utils/cache.js`: Simple in-memory cache to respect rate limits.

## Data Flow
1.  User opens dashboard.
2.  Client requests `/api/markets` and `/api/news`.
3.  Server checks cache -> if empty, calls external APIs -> updates cache.
4.  Server returns aggregated data to Client.
5.  Client renders specific markets and matches news based on tags (e.g., "Bitcoin" tag matches "Bitcoin" news).