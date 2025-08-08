# FPL Auction System

## Project Overview
**Project Name**: FPL Auction System  
A Fantasy Premier League (FPL) auction system that allows 10 teams to bid on players and clubs in a snake draft format. The system includes real-time bidding, team management, mobile support, and admin controls.

## Live URLs
- **Frontend URL**: https://fpl-auction.netlify.app
- **Backend URL**: https://fpl-auction-backend-945963649649.us-central1.run.app

## Tech Stack
- **Frontend**: HTML, JavaScript (Vanilla), Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: Firebase Firestore
- **Real-time**: Socket.IO
- **Authentication**: JWT tokens
- **Hosting**: 
  - Frontend: Netlify (auto-deploys from GitHub)
  - Backend: Google Cloud Run

## Key Features
1. **Snake Draft System**: 22 rounds with 10 teams
   - Odd rounds (1,3,5...): Teams pick 1→10
   - Even rounds (2,4,6...): Teams pick 10→1
   - Uses cumulative positions (1-220)
2. **Team Composition**: 15 players + 2 clubs per team
3. **Position Limits**: 2 GKP, 5 DEF, 5 MID, 3 FWD
4. **Club Limits**: Max 3 players per club
5. **Three-Stage Selling Process**: Selling 1 → Selling 2 → Sold
6. **Wait Feature**: Teams can request wait during selling stages
7. **Real-time Updates**: Live bidding and chat via WebSocket
8. **Mobile Support**: Responsive mobile version at `/mobile.html`
9. **Admin Controls**: Team10 is super admin by default
10. **Auto-Bidding**: Configurable auto-bid functionality

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
│   ├── package.json
│   ├── Dockerfile
│   └── .gcloudignore
├── frontend/
│   └── public/
│       ├── index.html      # Desktop UI
│       ├── mobile.html     # Mobile UI
│       ├── js/             # Desktop JavaScript
│       │   ├── api.js      # API client
│       │   ├── app.js      # Main app logic
│       │   ├── auction.js  # Auction management
│       │   ├── draft.js    # Draft system
│       │   └── socket.js   # WebSocket handling
│       └── mobile/         # Mobile-specific assets
│           ├── js/         # Mobile JavaScript
│           └── css/        # Mobile styles
├── functions/              # Firebase functions
├── firebase.json
├── .firebaserc
└── CLAUDE.md              # Project documentation
```

## API Endpoints
- **Auth**: `/api/auth/login`, `/api/auth/init-teams`
- **Players**: `/api/players`, `/api/players/sync-fpl-data`
- **Auction**: `/api/auction/start-player/:id`, `/api/auction/bid/:id`
- **Teams**: `/api/teams/:id`, `/api/teams/:id/squad`
- **Draft**: `/api/draft/state`, `/api/draft/chat`
- **Auto-bid**: `/api/autobid/config`, `/api/autobid/status`

## Deployment Process

### Frontend Deployment (Automatic)
```bash
# Frontend auto-deploys to Netlify when pushing to GitHub
git add -A && git commit -m "message" && git push origin main
```

### Backend Deployment (Manual)
```bash
# Deploy backend to Google Cloud Run
cd backend && gcloud run deploy fpl-auction-backend --source . --region us-central1 --allow-unauthenticated --project fpl-auction-2025
```

### Important Deployment Notes
- **Frontend**: Pushing to GitHub main branch automatically triggers Netlify deployment
- **Backend**: Must manually deploy to Cloud Run after backend changes
- **Project ID**: fpl-auction-2025
- **Region**: us-central1

## Default Credentials
All teams use username `team1` through `team10` with password `password123`

## Currency
The system uses 'J' as the currency symbol (styled in green italic) instead of pounds. All amounts are displayed as J[amount]m (e.g., J50m)

## Recent Updates
- Fixed mobile snake draft calculation for cumulative positions
- Mobile chat loads synchronously for instant display
- Fixed auction details display on mobile when auction starts
- Fixed bid updates in real-time on mobile
- Fixed draft turn display after auction completes
- Implemented three-stage selling process (Selling 1, Selling 2, Sold)
- Added wait button feature for teams during selling stages
- Admin can accept/reject wait requests
- Added super admin functionality with grant/revoke permissions
- Implemented team squad viewing dropdown in My Team tab

## Snake Draft Logic
- 22 rounds × 10 teams = 220 total picks
- Positions 1-220 are cumulative across all rounds
- Position calculation: `round = ceil(position / 10)`
- Team calculation for even rounds: `team = 10 - positionInRound + 1`
- Example: Position 13 = Round 2, 3rd pick = Team 8

## Known Issues
- Tailwind CDN warning in production (can be ignored)
- Visual indicators for frozen teams pending implementation

## Important Notes
- Always check if selling stage buttons are working correctly
- Ensure socket connections are established for real-time updates
- Team10 has super admin access by default
- Budget starts at J1000 per team
- Minimum bid increment is J5
- Mobile redirects automatically based on device detection
- Chat messages stored in Firestore with 50 message limit