const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const playersRoutes = require('./routes/players');
const auctionRoutes = require('./routes/auction');
const teamsRoutes = require('./routes/teams');
const scoringRoutes = require('./routes/scoring');
const draftRoutes = require('./routes/draft');
const autobidRoutes = require('./routes/autobid');
const draftManagementRoutes = require('./routes/draftManagement');

const { initializeDatabase } = require('./models/database');
const { authenticateToken } = require('./middleware/auth');
const AutoBidService = require('./services/autoBidService');

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000', 
  'http://127.0.0.1:8080',
  'http://[::]:3000',
  'https://fpl-auction.netlify.app',
  'https://fpl-auction-2025.netlify.app',
  // Add variations of Netlify domains
  'https://main--fpl-auction.netlify.app',
  'https://deploy-preview--fpl-auction.netlify.app'
];

// Add production frontend URL if available
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Log allowed origins for debugging
console.log('Allowed CORS origins:', allowedOrigins);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;

// Middleware
// Temporarily disable helmet to debug CORS
// app.use(helmet());

// Enable CORS with specific configuration
app.use(cors({
  origin: function (origin, callback) {
    // Log the origin for debugging
    console.log('Request origin:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // For production, allow any HTTPS origin temporarily for debugging
      if (process.env.NODE_ENV === 'production' && origin.startsWith('https://')) {
        console.log('Allowing HTTPS origin in production:', origin);
        callback(null, true);
      } else {
        console.log('Blocking origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/players', authenticateToken, playersRoutes);
app.use('/api/auction', authenticateToken, auctionRoutes);
app.use('/api/teams', authenticateToken, teamsRoutes);
app.use('/api/scoring', authenticateToken, scoringRoutes);
app.use('/api/draft', authenticateToken, draftRoutes);
app.use('/api/autobid', authenticateToken, autobidRoutes);
app.use('/api/draft-management', authenticateToken, draftManagementRoutes);

// Preflight requests are handled by cors() middleware above

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { collections } = require('./models/database');
    
    // Test database connection by counting teams
    const teamsSnapshot = await collections.teams.get();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'Connected',
      teams: teamsSnapshot.size
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      database: 'Failed',
      error: err.message 
    });
  }
});

// Track connected teams
const connectedTeams = new Map(); // socketId -> { teamId, teamName }

// Socket.IO for real-time auction
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-auction', (data) => {
    // Handle both string teamId and object with teamId and teamName
    const teamId = typeof data === 'string' ? data : data.teamId;
    const teamName = typeof data === 'string' ? `Team ${data}` : (data.teamName || `Team ${data.teamId}`);
    
    socket.join('auction-room');
    
    // Store team info for this socket
    connectedTeams.set(socket.id, { teamId, teamName });
    
    // Broadcast connection message to all clients
    socket.to('auction-room').emit('team-connected', {
      teamId,
      teamName,
      message: `${teamName} connected`
    });
    
    console.log(`${teamName} (${teamId}) joined auction room`);
  });
  
  socket.on('place-bid', (bidData) => {
    // Broadcast bid to all users in auction room
    socket.to('auction-room').emit('new-bid', bidData);
  });
  
  // Draft reveal events
  socket.on('draft-draw-team', (data) => {
    // Broadcast the drawn team to all users (including sender)
    io.to('auction-room').emit('draft-team-drawn', data);
    console.log(`Draft team drawn: Position ${data.position} - ${data.team.name}`);
  });
  
  socket.on('disconnect', () => {
    // Get team info before removing
    const teamInfo = connectedTeams.get(socket.id);
    
    if (teamInfo) {
      // Broadcast disconnection message to all clients
      socket.to('auction-room').emit('team-disconnected', {
        teamId: teamInfo.teamId,
        teamName: teamInfo.teamName,
        message: `${teamInfo.teamName} disconnected`
      });
      
      console.log(`${teamInfo.teamName} disconnected:`, socket.id);
      connectedTeams.delete(socket.id);
    } else {
      console.log('User disconnected:', socket.id);
    }
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');
    
    // Initialize and start AutoBid service
    const autoBidService = new AutoBidService(io);
    autoBidService.start();
    console.log('✅ AutoBid service started');
    
    server.listen(PORT, () => {
      console.log(`🚀 FPL Auction Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();