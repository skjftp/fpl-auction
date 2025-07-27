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
      `);
      
      // Snake draft order table
      database.run(`
        CREATE TABLE IF NOT EXISTS draft_order (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_id) REFERENCES teams(id),
          UNIQUE(team_id),
          UNIQUE(position)
        )
      `);
      
      // Draft state table (single row to track current state)
      database.run(`
        CREATE TABLE IF NOT EXISTS draft_state (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          current_team_id INTEGER,
          current_position INTEGER DEFAULT 1,
          is_active BOOLEAN DEFAULT FALSE,
          total_teams INTEGER DEFAULT 10,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (current_team_id) REFERENCES teams(id)
        )
      `);
      
      // Chat messages table
      database.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_id) REFERENCES teams(id)
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
    'Wadde Badmash', 'Baba & Nawaab', 'Kesari', 'Finding Timo', 'Khelenge Jigar Se',
    'Yaya Tours Pvt ltd', 'Shiggy FC', 'Analysis Paralysis', 'Dukes', 'Cash down under redux'
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

// Initialize snake draft order
async function initializeDraftOrder() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    // Get all teams
    database.all('SELECT id FROM teams ORDER BY id', [], (err, teams) => {
      if (err) {
        console.error('Error getting teams:', err);
        reject(err);
        return;
      }
      
      if (!teams || teams.length === 0) {
        reject(new Error('No teams found. Please initialize teams first.'));
        return;
      }
      
      // Shuffle teams for random order
      const shuffledTeams = teams.sort(() => Math.random() - 0.5);
      
      // Clear existing draft order
      database.run('DELETE FROM draft_order', [], (err) => {
        if (err) {
          console.error('Error clearing draft order:', err);
          reject(err);
          return;
        }
        
        // Insert new draft order
        const stmt = database.prepare('INSERT INTO draft_order (team_id, position) VALUES (?, ?)');
        
        shuffledTeams.forEach((team, index) => {
          stmt.run(team.id, index + 1);
        });
        
        stmt.finalize((err) => {
          if (err) {
            console.error('Error finalizing draft order:', err);
            reject(err);
          } else {
            // Initialize draft state
            database.run(
              `INSERT OR REPLACE INTO draft_state (id, current_team_id, current_position, is_active, total_teams, updated_at) 
               VALUES (1, ?, 1, 0, ?, CURRENT_TIMESTAMP)`,
              [shuffledTeams[0].id, shuffledTeams.length],
              (err) => {
                if (err) {
                  console.error('Error initializing draft state:', err);
                  reject(err);
                } else {
                  console.log('Draft order initialized successfully');
                  resolve();
                }
              }
            );
          }
        });
      });
    });
  });
}

// Start the draft
async function startDraft() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.run(
      'UPDATE draft_state SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

// Move to next team in draft order
async function advanceDraftTurn() {
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.get('SELECT * FROM draft_state WHERE id = 1', [], (err, state) => {
      if (err) {
        reject(err);
        return;
      }
      
      const nextPosition = state.current_position + 1;
      
      // Get next team
      database.get(
        'SELECT team_id FROM draft_order WHERE position = ?',
        [nextPosition],
        (err, nextTeam) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (nextTeam) {
            // Move to next team
            database.run(
              'UPDATE draft_state SET current_team_id = ?, current_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
              [nextTeam.team_id, nextPosition],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({ hasNext: true, nextTeamId: nextTeam.team_id });
                }
              }
            );
          } else {
            // Draft complete
            database.run(
              'UPDATE draft_state SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
              [],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({ hasNext: false });
                }
              }
            );
          }
        }
      );
    });
  });
}

module.exports = {
  getDatabase,
  initializeDatabase,
  createDefaultTeams,
  initializeDraftOrder,
  startDraft,
  advanceDraftTurn
};