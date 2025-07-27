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

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());

app.use(cors({
  origin: allowedOrigins,
  credentials: true
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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