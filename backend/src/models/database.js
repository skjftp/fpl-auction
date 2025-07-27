const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './fpl_auction.db';

let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
      }
    });
  }
  return db;
}

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    
    // Create tables
    database.serialize(() => {
      // Teams table
      database.run(`
        CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          budget INTEGER DEFAULT 1000,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // FPL Players table
      database.run(`
        CREATE TABLE IF NOT EXISTS fpl_players (
          id INTEGER PRIMARY KEY,
          web_name TEXT NOT NULL,
          first_name TEXT,
          second_name TEXT,
          position INTEGER NOT NULL,
          team_id INTEGER NOT NULL,
          price INTEGER NOT NULL,
          points_per_game REAL,
          total_points INTEGER DEFAULT 0,
          status TEXT DEFAULT 'available',
          photo TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // FPL Teams/Clubs table
      database.run(`
        CREATE TABLE IF NOT EXISTS fpl_clubs (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          short_name TEXT NOT NULL,
          code INTEGER NOT NULL,
          strength INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Auction table
      database.run(`
        CREATE TABLE IF NOT EXISTS auctions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER,
          club_id INTEGER,
          current_bid INTEGER DEFAULT 5,
          current_bidder_id INTEGER,
          status TEXT DEFAULT 'active',
          auction_type TEXT NOT NULL CHECK(auction_type IN ('player', 'club')),
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ended_at DATETIME,
          FOREIGN KEY (player_id) REFERENCES fpl_players(id),
          FOREIGN KEY (club_id) REFERENCES fpl_clubs(id),
          FOREIGN KEY (current_bidder_id) REFERENCES teams(id)
        )
      `);
      
      // Team squads table
      database.run(`
        CREATE TABLE IF NOT EXISTS team_squads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          player_id INTEGER,
          club_id INTEGER,
          price_paid INTEGER NOT NULL,
          acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_id) REFERENCES teams(id),
          FOREIGN KEY (player_id) REFERENCES fpl_players(id),
          FOREIGN KEY (club_id) REFERENCES fpl_clubs(id)
        )
      `);
      
      // Bid history table
      database.run(`
        CREATE TABLE IF NOT EXISTS bid_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          auction_id INTEGER NOT NULL,
          team_id INTEGER NOT NULL,
          bid_amount INTEGER NOT NULL,
          bid_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (auction_id) REFERENCES auctions(id),
          FOREIGN KEY (team_id) REFERENCES teams(id)
        )
      `);
      
      // Gameweek scores table
      database.run(`
        CREATE TABLE IF NOT EXISTS gameweek_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          gameweek INTEGER NOT NULL,
          player_id INTEGER NOT NULL,
          points INTEGER DEFAULT 0,
          captain BOOLEAN DEFAULT FALSE,
          vice_captain BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (team_id) REFERENCES teams(id),
          FOREIGN KEY (player_id) REFERENCES fpl_players(id),
          UNIQUE(team_id, gameweek, player_id)
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// Initialize default teams
async function createDefaultTeams() {
  const bcrypt = require('bcryptjs');
  const database = getDatabase();
  
  const defaultTeams = [
    'Team Arsenal', 'Team Chelsea', 'Team Liverpool', 'Team City', 'Team United',
    'Team Spurs', 'Team Newcastle', 'Team Brighton', 'Team Villa', 'Team Wolves'
  ];
  
  for (let i = 0; i < defaultTeams.length; i++) {
    const teamName = defaultTeams[i];
    const username = `team${i + 1}`;
    const password = 'password123'; // Change this in production
    const hashedPassword = await bcrypt.hash(password, 10);
    
    database.run(
      'INSERT OR IGNORE INTO teams (name, username, password_hash) VALUES (?, ?, ?)',
      [teamName, username, hashedPassword]
    );
  }
}

module.exports = {
  getDatabase,
  initializeDatabase,
  createDefaultTeams
};