# FPL Auction System

## Project Overview
This is a Fantasy Premier League (FPL) auction system that allows teams to bid on players and clubs in a snake draft format. The system includes real-time bidding, team management, and admin controls.

## Tech Stack
- **Frontend**: HTML, JavaScript (Vanilla), Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: Firebase Firestore (migrated from SQLite)
- **Deployment**: Google Cloud Run
- **Real-time**: Socket.IO
- **Authentication**: JWT tokens

## Key Features
1. **Snake Draft System**: 17 rounds with alternating order (1-10, 10-1)
2. **Team Composition**: 15 players + 2 clubs per team
3. **Position Limits**: 2 GKP, 5 DEF, 5 MID, 3 FWD
4. **Club Limits**: Max 3 players per club
5. **Three-Stage Selling Process**: Selling 1 → Selling 2 → Sold
6. **Wait Feature**: Teams can request wait during selling stages
7. **Real-time Updates**: Live bidding and chat via WebSocket
8. **Admin Controls**: Team10 is super admin by default

## Project Structure
```
fpl-auction/
├── backend/
│   ├── src/
│   │   ├── config/         # Firebase configuration
│   │   ├── middleware/     # Auth middleware
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   └── server.js       # Main server file
│   └── Dockerfile
├── frontend/
│   └── public/
│       ├── index.html      # Main UI
│       ├── js/
│       │   ├── api.js      # API client
│       │   ├── app.js      # Main app logic
│       │   ├── auction.js  # Auction management
│       │   ├── draft.js    # Draft system
│       │   └── socket.js   # WebSocket handling
│       └── css/
└── .gcloudignore
```

## API Endpoints
- **Auth**: `/api/auth/login`, `/api/auth/init-teams`
- **Players**: `/api/players`, `/api/players/sync-fpl-data`
- **Auction**: `/api/auction/start-player/:id`, `/api/auction/bid/:id`
- **Teams**: `/api/teams/:id`, `/api/teams/:id/squad`
- **Draft**: `/api/draft/state`, `/api/draft/chat`

## Deployment
- Backend: https://fpl-auction-backend-mrlyxa4xiq-uc.a.run.app
- Frontend: https://fpl-auction.netlify.app
- Project ID: fpl-auction-2025
- Region: us-central1

## Common Commands
```bash
# Deploy backend
cd backend && gcloud run deploy fpl-auction-backend --source . --region us-central1 --allow-unauthenticated --project fpl-auction-2025

# Run locally
cd backend && npm start

# Push to GitHub
git add -A && git commit -m "message" && git push origin main
```

## Default Credentials
All teams use username `team1` through `team10` with password `password123`

## Recent Updates
- Implemented three-stage selling process (Selling 1, Selling 2, Sold)
- Added wait button feature for teams during selling stages
- Admin can accept/reject wait requests
- Fixed real-time bid updates and chat functionality
- Added super admin functionality with grant/revoke permissions
- Implemented team squad viewing dropdown in My Team tab

## Known Issues
- Tailwind CDN warning in production (can be ignored)
- Visual indicators for frozen teams pending implementation

## Important Notes
- Always check if selling stage buttons are working correctly
- Ensure socket connections are established for real-time updates
- Team10 has super admin access by default
- Budget starts at £1000 per team
- Minimum bid increment is £5