const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin
admin.initializeApp();

// Create Express app
const app = express();

// Configure CORS - Allow all origins for Firebase Functions
const corsHandler = cors({ 
  origin: true,
  credentials: true 
});

// Apply CORS to all routes
app.use(corsHandler);
app.options('*', corsHandler); // Enable preflight for all routes
app.use(express.json());

// Initialize Firestore
const db = admin.firestore();

// Import routes
const authRoutes = require('./routes/auth');
const playersRoutes = require('./routes/players');
const auctionRoutes = require('./routes/auction');
const teamsRoutes = require('./routes/teams');
const scoringRoutes = require('./routes/scoring');
const draftRoutes = require('./routes/draft');

// Middleware
const { authenticateToken } = require('./middleware/auth');

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  req.admin = admin;
  next();
});

// Debug endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Firebase Function is working!',
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Firebase Functions',
    database: 'Firestore'
  });
});


// Routes - no /api prefix since Firebase Hosting adds it
app.use('/auth', authRoutes);
app.use('/players', authenticateToken, playersRoutes);
app.use('/auction', authenticateToken, auctionRoutes);
app.use('/teams', authenticateToken, teamsRoutes);
app.use('/scoring', authenticateToken, scoringRoutes);
app.use('/draft', authenticateToken, draftRoutes);

// Export the Express app as a Firebase Function with increased timeout
exports.api = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onRequest(app);

// Export scheduled function to sync FPL data
exports.syncFPLData = functions.pubsub.schedule('0 0 * * *').onRun(async (context) => {
  console.log('Starting scheduled FPL data sync');
  // Sync logic here
  return null;
});