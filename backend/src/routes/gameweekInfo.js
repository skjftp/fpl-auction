const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const axios = require('axios');

// FPL API endpoints
const FPL_API_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FPL_FIXTURES_URL = 'https://fantasy.premierleague.com/api/fixtures/';

// Cache for FPL data
let fplDataCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Function to fetch and cache FPL data
async function fetchFPLData() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (fplDataCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
        return fplDataCache;
    }

    try {
        const response = await axios.get(FPL_API_URL);
        fplDataCache = response.data;
        cacheTimestamp = now;
        return fplDataCache;
    } catch (error) {
        console.error('Error fetching FPL data:', error);
        throw error;
    }
}

// Function to determine gameweek type
async function getGameweekType(gameweek) {
    try {
        const response = await axios.get(`${FPL_FIXTURES_URL}?event=${gameweek}`);
        const fixtures = response.data;
        
        const matchCount = fixtures.length;
        
        if (matchCount < 10) {
            return { type: 'Blank', matchCount };
        } else if (matchCount > 10) {
            return { type: 'Double', matchCount };
        } else {
            return { type: 'Normal', matchCount };
        }
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        return { type: 'Normal', matchCount: 10 };
    }
}

// Get current gameweek info with type
router.get('/current', async (req, res) => {
    try {
        const fplData = await fetchFPLData();
        
        // Find current gameweek
        const currentEvent = fplData.events.find(event => event.is_current);
        const nextEvent = fplData.events.find(event => event.is_next);
        
        const activeGameweek = currentEvent || nextEvent;
        
        if (!activeGameweek) {
            return res.status(404).json({ error: 'No active gameweek found' });
        }

        // Get gameweek type
        const gwType = await getGameweekType(activeGameweek.id);

        // Save to database for tracking
        await db.collection('gameweekInfo').doc(`gw_${activeGameweek.id}`).set({
            gameweek: activeGameweek.id,
            name: activeGameweek.name,
            deadline: activeGameweek.deadline_time,
            finished: activeGameweek.finished,
            is_current: activeGameweek.is_current,
            is_next: activeGameweek.is_next,
            type: gwType.type,
            match_count: gwType.matchCount,
            last_updated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({
            gameweek: activeGameweek.id,
            name: activeGameweek.name,
            deadline_time: activeGameweek.deadline_time,
            finished: activeGameweek.finished,
            is_current: activeGameweek.is_current,
            is_next: activeGameweek.is_next,
            type: gwType.type,
            match_count: gwType.matchCount,
            type_display: `Gameweek ${activeGameweek.id} (${gwType.type})`
        });
    } catch (error) {
        console.error('Error fetching current gameweek:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update gameweek deadlines (called periodically)
router.post('/update-deadlines', async (req, res) => {
    try {
        const fplData = await fetchFPLData();
        
        const updates = [];
        
        for (const event of fplData.events) {
            // Get gameweek type
            const gwType = await getGameweekType(event.id);
            
            // Update in database
            const update = {
                gameweek: event.id,
                name: event.name,
                deadline: event.deadline_time,
                finished: event.finished,
                is_current: event.is_current,
                is_next: event.is_next,
                is_previous: event.is_previous,
                type: gwType.type,
                match_count: gwType.matchCount,
                last_updated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('gameweekInfo').doc(`gw_${event.id}`).set(update, { merge: true });
            updates.push(update);
        }

        res.json({
            success: true,
            message: 'Gameweek deadlines updated',
            updated_count: updates.length,
            updates: updates
        });
    } catch (error) {
        console.error('Error updating deadlines:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific gameweek info
router.get('/:gameweek', async (req, res) => {
    try {
        const gameweek = parseInt(req.params.gameweek);
        
        // First check database
        const doc = await db.collection('gameweekInfo').doc(`gw_${gameweek}`).get();
        
        if (doc.exists) {
            const data = doc.data();
            return res.json({
                ...data,
                type_display: `Gameweek ${gameweek} (${data.type || 'Normal'})`
            });
        }
        
        // If not in database, fetch from FPL API
        const fplData = await fetchFPLData();
        const event = fplData.events.find(e => e.id === gameweek);
        
        if (!event) {
            return res.status(404).json({ error: 'Gameweek not found' });
        }
        
        const gwType = await getGameweekType(gameweek);
        
        const gameweekInfo = {
            gameweek: event.id,
            name: event.name,
            deadline_time: event.deadline_time,
            finished: event.finished,
            type: gwType.type,
            match_count: gwType.matchCount,
            type_display: `Gameweek ${gameweek} (${gwType.type})`
        };
        
        res.json(gameweekInfo);
    } catch (error) {
        console.error('Error fetching gameweek info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all gameweeks with types
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection('gameweekInfo')
            .orderBy('gameweek')
            .get();
        
        const gameweeks = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            gameweeks.push({
                ...data,
                type_display: `Gameweek ${data.gameweek} (${data.type || 'Normal'})`
            });
        });
        
        res.json(gameweeks);
    } catch (error) {
        console.error('Error fetching all gameweeks:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;