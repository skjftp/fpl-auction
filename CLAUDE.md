# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (Node.js/Express)
```bash
cd backend
npm install
npm run dev        # Start development server with nodemon
npm start          # Start production server
```

### Frontend (Vanilla JS)
```bash
cd frontend
npm install
npm run dev        # Start development server on port 3000
npm start          # Alias for npm run dev
```

### Environment Setup
- Copy `backend/.env.example` to `backend/.env`
- Default JWT_SECRET should be changed for production
- Database is SQLite stored at `./fpl_auction.db`

## Architecture Overview

### Backend Structure
- **Express.js REST API** with Socket.IO for real-time bidding
- **SQLite database** with 6 main tables: teams, fpl_players, fpl_clubs, auctions, team_squads, bid_history, gameweek_scores
- **JWT authentication** with middleware protection on all routes except auth
- **FPL API integration** via axios for player/club data sync
- **Real-time auctions** using Socket.IO rooms for live bid updates

### Frontend Structure
- **Vanilla JavaScript** modular architecture with ES6 classes
- **Socket.IO client** for real-time auction updates
- **HTTP server** for development (no build process needed)
- **Tailwind CSS** for styling (via CDN)

### Key Components
- `backend/src/server.js` - Main server with Socket.IO setup
- `backend/src/models/database.js` - SQLite schema and initialization
- `backend/src/routes/` - API endpoints (auth, auction, players, teams, scoring)
- `frontend/public/js/app.js` - Main frontend application controller
- `frontend/public/js/auction.js` - Auction bidding logic
- `frontend/public/js/socket.js` - Real-time communication

### Database Schema
- Teams have £1000 budget, 15 player + 2 club slots
- Players have positions (GKP=1, DEF=2, MID=3, FWD=4) with limits
- Auctions track player/club sales with bid history
- Real-time scoring per gameweek with captain/vice-captain

### Authentication Flow
- Teams login with username/password (team1-team10, password123)
- JWT tokens stored in localStorage
- All API routes except auth require authentication middleware

### Real-time Auction System
- Socket.IO rooms for live bid broadcasting
- Minimum £5 bids with £5 increments
- Active auction status prevents duplicate auctions
- Bid history tracked for transparency

### FPL Integration
- Sync player data from official FPL API
- Position mapping and team assignments
- Live scoring updates by gameweek
- Club strength and player statistics