// FPL Auto-substitution logic
function applyAutomaticSubstitutions(starting11, bench, livePoints, playerData, isBenchBoost = false) {
  console.log('=== Starting substitution check ===');
  console.log('Bench boost active:', isBenchBoost);
  
  // Don't apply substitutions if bench boost is active
  if (isBenchBoost) {
    return { 
      finalStarting11: starting11, 
      finalBench: bench, 
      substitutions: [] 
    };
  }
  
  const substitutions = [];
  let finalStarting11 = [...starting11];
  let finalBench = [...bench];
  
  console.log('Checking starting 11 players:', finalStarting11.length);
  console.log('Available bench players:', finalBench.length);
  
  // Check each starting player
  for (let i = 0; i < finalStarting11.length; i++) {
    const playerId = finalStarting11[i];
    
    // Handle both data formats: 
    // From submissions.js: livePoints[playerId].stats.minutes
    // From leaderboard.js: livePoints[fplId].minutes with playerData[playerId].fpl_id
    let playerMinutes = 0;
    const player = playerData[playerId];
    const lookupId = player?.fpl_id || playerId; // Use FPL ID if available
    
    console.log(`Checking player ${playerId} (FPL ID: ${lookupId})`);
    
    if (livePoints[lookupId]) {
      if (livePoints[lookupId].stats !== undefined) {
        playerMinutes = livePoints[lookupId].stats.minutes || 0;
      } else {
        playerMinutes = livePoints[lookupId].minutes || 0;
      }
      console.log(`  - Found live data, minutes: ${playerMinutes}`);
    } else if (player) {
      playerMinutes = player.minutes || 0;
      console.log(`  - Using player data minutes: ${playerMinutes}`);
    } else {
      console.log(`  - No data found for player ${playerId}`);
    }
    
    // Check if player didn't play (0 minutes)
    if (playerMinutes === 0) {
      console.log(`  - Player has 0 minutes, looking for substitute`);
      if (!player) {
        console.log(`  - No player data found, skipping`);
        continue;
      }
      
      // Try to substitute this player
      let substituted = false;
      
      // If goalkeeper, can only substitute with bench goalkeeper
      if (player.position === 1) {
        for (let j = 0; j < finalBench.length; j++) {
          const benchPlayerId = finalBench[j];
          const benchPlayer = playerData[benchPlayerId];
          
          // Get bench player minutes
          let benchMinutes = 0;
          const benchLookupId = benchPlayer?.fpl_id || benchPlayerId; // Use FPL ID if available
          
          if (livePoints[benchLookupId]) {
            if (livePoints[benchLookupId].stats !== undefined) {
              benchMinutes = livePoints[benchLookupId].stats.minutes || 0;
            } else {
              benchMinutes = livePoints[benchLookupId].minutes || 0;
            }
          } else if (benchPlayer) {
            benchMinutes = benchPlayer.minutes || 0;
          }
          
          if (benchPlayer && benchPlayer.position === 1 && benchMinutes > 0) {
            substitutions.push({
              out: playerId,
              in: benchPlayerId,
              reason: 'Goalkeeper substitution'
            });
            
            // Swap players
            finalStarting11[i] = benchPlayerId;
            finalBench[j] = playerId;
            substituted = true;
            break;
          }
        }
      } else {
        // For outfield players, check bench in order
        for (let j = 0; j < finalBench.length; j++) {
          const benchPlayerId = finalBench[j];
          const benchPlayer = playerData[benchPlayerId];
          
          // Get bench player minutes
          let benchMinutes = 0;
          const benchLookupId = benchPlayer?.fpl_id || benchPlayerId; // Use FPL ID if available
          
          if (livePoints[benchLookupId]) {
            if (livePoints[benchLookupId].stats !== undefined) {
              benchMinutes = livePoints[benchLookupId].stats.minutes || 0;
            } else {
              benchMinutes = livePoints[benchLookupId].minutes || 0;
            }
          } else if (benchPlayer) {
            benchMinutes = benchPlayer.minutes || 0;
          }
          
          // Skip if bench player is a goalkeeper or didn't play
          if (!benchPlayer || benchPlayer.position === 1 || benchMinutes === 0) {
            continue;
          }
          
          // Check if substitution maintains valid formation
          const testStarting11 = [...finalStarting11];
          testStarting11[i] = benchPlayerId;
          
          if (isValidFormation(testStarting11, playerData)) {
            substitutions.push({
              out: playerId,
              in: benchPlayerId,
              reason: `Player didn't play`
            });
            
            // Swap players
            finalStarting11[i] = benchPlayerId;
            finalBench[j] = playerId;
            substituted = true;
            break;
          }
        }
      }
    }
  }
  
  return {
    finalStarting11,
    finalBench,
    substitutions
  };
}

function isValidFormation(playerIds, playerData) {
  // Count positions
  const positionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  
  for (const playerId of playerIds) {
    const player = playerData[playerId];
    if (player && player.position >= 1 && player.position <= 4) {
      positionCounts[player.position]++;
    }
  }
  
  // Check formation rules
  // Must have exactly 1 GKP
  if (positionCounts[1] !== 1) return false;
  
  // Must have at least 3 DEF
  if (positionCounts[2] < 3) return false;
  
  // Must have at least 2 MID
  if (positionCounts[3] < 2) return false;
  
  // Must have at least 1 FWD
  if (positionCounts[4] < 1) return false;
  
  // Total should be 11
  const total = positionCounts[1] + positionCounts[2] + positionCounts[3] + positionCounts[4];
  if (total !== 11) return false;
  
  return true;
}

module.exports = {
  applyAutomaticSubstitutions,
  isValidFormation
};