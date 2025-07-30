# FPL Auction System

A Fantasy Premier League auction website with real-time bidding and scoring system.

## Features

### Auction System
- **10 Teams**: Pre-configured team logins (team1-team10)
- **Budget**: Each team starts with J1000
- **Player Auction**: Bid on all FPL players from the official API
- **Club Auction**: Bid on Premier League clubs
- **Real-time Bidding**: Live updates using Socket.IO
- **Squad Rules**: 15 players + 2 clubs per team
- **Position Limits**: 2 GKP, 5 DEF, 5 MID, 3 FWD
- **Minimum Bid**: J5 with J5 increments

### Scoring System
- Integration with FPL API for live scores
- Gameweek-based scoring
- Team leaderboards
- Squad management

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation

1. **Clone/Navigate to the project**:
   ```bash
   cd fpl-auction
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env if needed
   npm run dev
   ```

3. **Frontend Setup** (in new terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Initialize Data**:
   - Open http://localhost:3000
   - The app will be ready with default teams

### Default Login Credentials

- **Team 1**: username: `team1`, password: `password123`
- **Team 2**: username: `team2`, password: `password123`
- **Team 3**: username: `team3`, password: `password123`
- ...and so on up to `team10`

## Usage

### Setting Up the Auction

1. **Login** with any team credentials
2. **Sync FPL Data**: Click "Sync FPL Data" to load current players and clubs
3. **Start Auctions**: Click "Start Auction" on any player or club
4. **Place Bids**: Enter bid amount and click "Place Bid"
5. **Complete Auction**: Click "Complete Auction" when bidding is done

### Team Management

- View your squad in the "My Team" tab
- See budget and remaining slots
- Track spending and formation

### Real-time Features

- Live bid updates across all connected users
- Instant notifications for auction events
- Real-time budget updates

## API Endpoints

### Authentication
- `POST /api/auth/login` - Team login
- `POST /api/auth/init-teams` - Initialize default teams
- `GET /api/auth/teams` - Get all teams

### Players
- `POST /api/players/sync-fpl-data` - Sync from FPL API
- `GET /api/players` - Get players with filters
- `GET /api/players/clubs` - Get clubs
- `GET /api/players/positions` - Get position info

### Auction
- `POST /api/auction/start-player/:id` - Start player auction
- `POST /api/auction/start-club/:id` - Start club auction
- `POST /api/auction/bid/:auctionId` - Place bid
- `POST /api/auction/complete/:auctionId` - Complete auction
- `GET /api/auction/active` - Get active auctions

### Teams
- `GET /api/teams/:id/squad` - Get team squad
- `GET /api/teams/:id` - Get team info
- `GET /api/teams/:id/can-buy` - Check purchase eligibility
- `GET /api/teams` - Get leaderboard

### Scoring
- `POST /api/scoring/update-gameweek/:gw` - Update scores
- `GET /api/scoring/team/:id/gameweek/:gw` - Team scores
- `GET /api/scoring/leaderboard` - Overall leaderboard
- `GET /api/scoring/current-gameweek` - Current GW info

## Database Schema

### Teams
- `id`, `name`, `username`, `password_hash`, `budget`

### FPL Players
- `id`, `web_name`, `first_name`, `second_name`, `position`, `team_id`, `price`, `points_per_game`, `total_points`, `status`, `photo`

### FPL Clubs
- `id`, `name`, `short_name`, `code`, `strength`

### Auctions
- `id`, `player_id`, `club_id`, `current_bid`, `current_bidder_id`, `status`, `auction_type`, `started_at`, `ended_at`

### Team Squads
- `id`, `team_id`, `player_id`, `club_id`, `price_paid`, `acquired_at`

### Bid History
- `id`, `auction_id`, `team_id`, `bid_amount`, `bid_time`

### Gameweek Scores
- `id`, `team_id`, `gameweek`, `player_id`, `points`, `captain`, `vice_captain`

## Tech Stack

### Backend
- **Node.js** with Express
- **SQLite** database
- **Socket.IO** for real-time updates
- **JWT** authentication
- **Axios** for FPL API integration

### Frontend
- **Vanilla JavaScript** with modern ES6+
- **Tailwind CSS** for styling
- **Socket.IO Client** for real-time features
- **HTTP Server** for development

## Development

### Project Structure
```
fpl-auction/
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Auth middleware
│   │   └── services/       # Business logic
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/
│   │   ├── css/           # Stylesheets
│   │   ├── js/            # JavaScript modules
│   │   └── index.html     # Main HTML
│   └── package.json
└── README.md
```

### Adding Features

1. **New API Endpoints**: Add to `backend/src/routes/`
2. **Frontend Components**: Add to `frontend/public/js/`
3. **Database Changes**: Update `backend/src/models/database.js`
4. **Real-time Events**: Add to `backend/src/server.js` and `frontend/public/js/socket.js`

## Deployment

### Local Testing
1. Ensure both backend (port 3001) and frontend (port 3000) are running
2. Test with multiple browser tabs/windows for different teams
3. Verify real-time bidding works across sessions

### Cloud Deployment Options

#### Backend (Node.js)
- **Google Cloud Run**
- **Heroku**
- **Railway**
- **DigitalOcean App Platform**

#### Frontend (Static Site)
- **Netlify**
- **Vercel**
- **GitHub Pages**

#### Database
- **PostgreSQL** on cloud providers
- **MongoDB Atlas**
- **Google Cloud SQL**

### Environment Variables for Production
```env
PORT=3001
JWT_SECRET=your_secure_jwt_secret
NODE_ENV=production
FPL_API_URL=https://fantasy.premierleague.com/api
DB_PATH=./fpl_auction.db  # or cloud database URL
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure frontend URL is in backend CORS config
2. **Socket Connection**: Check ports and firewall settings
3. **FPL API**: Official API may have rate limits
4. **Database Lock**: Stop all processes before restarting

### Debug Mode
Set `NODE_ENV=development` for detailed logs.

## License

MIT License - feel free to modify and use for your own leagues!

## Contributing

1. Fork the repository
2. Create feature branch
3. Test thoroughly
4. Submit pull request

---

**Happy Bidding! 🏆⚽**