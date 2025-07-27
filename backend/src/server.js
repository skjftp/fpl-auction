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

const { initializeDatabase } = require('./models/database');
const { authenticateToken } = require('./middleware/auth');

// Configure CORS for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000', 
  'http://[::]:3000',
  'https://fpl-auction.netlify.app'
];

// Add production frontend URL if available
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

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

// Enable CORS for all origins temporarily
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// Health check
app.get('/api/health', (req, res) => {
  const db = require('./models/database').getDatabase();
  
  // Test database connection
  db.get('SELECT COUNT(*) as count FROM teams', [], (err, result) => {
    if (err) {
      res.status(500).json({ 
        status: 'ERROR', 
        timestamp: new Date().toISOString(),
        database: 'Failed',
        error: err.message 
      });
    } else {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: 'Connected',
        teams: result.count
      });
    }
  });
});

// Socket.IO for real-time auction
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-auction', (teamId) => {
    socket.join('auction-room');
    console.log(`Team ${teamId} joined auction room`);
  });
  
  socket.on('place-bid', (bidData) => {
    // Broadcast bid to all users in auction room
    socket.to('auction-room').emit('new-bid', bidData);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');
    
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