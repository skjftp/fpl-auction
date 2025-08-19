// FPL Auto-substitution logic
function applyAutomaticSubstitutions(starting11, bench, livePoints, playerData, isBenchBoost = false) {
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
  
  // Check each starting player
  for (let i = 0; i < finalStarting11.length; i++) {
    const playerId = finalStarting11[i];
    const playerLive = livePoints[playerId];
    
    // Check if player didn't play (0 minutes)
    if (playerLive && playerLive.stats.minutes === 0) {
      const player = playerData[playerId];
      if (!player) continue;
      
      // Try to substitute this player
      let substituted = false;
      
      // If goalkeeper, can only substitute with bench goalkeeper
      if (player.position === 1) {
        for (let j = 0; j < finalBench.length; j++) {
          const benchPlayerId = finalBench[j];
          const benchPlayer = playerData[benchPlayerId];
          const benchLive = livePoints[benchPlayerId];
          
          if (benchPlayer && benchPlayer.position === 1 && 
              benchLive && benchLive.stats.minutes > 0) {
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
          const benchLive = livePoints[benchPlayerId];
          
          // Skip if bench player is a goalkeeper or didn't play
          if (!benchPlayer || benchPlayer.position === 1 || 
              !benchLive || benchLive.stats.minutes === 0) {
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