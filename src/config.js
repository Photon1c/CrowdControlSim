export const CONFIG = {
    // World settings
    WORLD_SIZE: 400, // Doubled from 200 to 400
    
    // Population counts
    PROTESTOR_COUNT: 400,
    POLICE_COUNT: 20,
    VAN_COUNT: 4,
    
    // Initial positions  
    PROTESTOR_START_X: -80, // Close to central building at (-50, -50)
    PROTESTOR_START_Z: -80, // Close to central building
    PROTESTOR_SPREAD_X: 40,  // Smaller spread around building
    PROTESTOR_SPREAD_Z: 40,  // Smaller spread around building
    PROTESTOR_DENSITY: 4,    // Increased space between protestors
    
    POLICE_START_X: 0, // Center
    POLICE_START_Z: 0, // Center
    POLICE_LINE_SPACING: 8,  // Larger spacing for bigger map and better formation
    POLICE_RANK_SPACING: 10, // More space between ranks
    POLICE_RANK_DEPTH: 4,    // Deeper formation
    
    // Movement speeds - Much faster for larger map
    PROTESTOR_MOVE_SPEED: 18.0,    // 3x faster (was 6.0)
    PROTESTOR_SPRINT_SPEED: 27.0,  // 3x faster (was 9.0)  
    POLICE_MOVE_SPEED: 0.7,       // Faster, more proactive officers
    POLICE_SPRINT_SPEED: 10.0,     // Slower sprint
    VAN_MOVE_SPEED: 32.0,         // Much faster van movement
    
    // Interaction distances
    ARREST_RANGE: 15,
    FLEE_DISTANCE: 20,
    VAN_PICKUP_RANGE: 30,
    
    // Crowd behavior weights
    CROWD_COHESION: 0.3,
    CROWD_SEPARATION: 3,
    CROWD_ALIGNMENT: 0.2,
    
    // Physics
    DAMPING: 0.85,
    TIME_SCALE: 3.0,   // Time scaling factor for movement calculations
    
    // Stamina
    STAMINA_DRAIN_RATE: 10,
    STAMINA_RECOVERY_RATE: 5,
    
    // Arrest mechanics
    ARREST_TIME: 5,        // Seconds to complete arrest
    ARREST_SPEED: 0.8,     // Speed during arrest movement
    VAN_CAPACITY: 8,       // Maximum protestors per van
    
    // Extraction
    EXTRACTION_POINT_X: 130, // Match entrance for van logic
    EXTRACTION_POINT_Z: 170, // Centered
    EXTRACTION_RANGE: 15,
    
    // Building generation
    BUILDING_COUNT: 20,
    MIN_BUILDING_SIZE: 10,
    MAX_BUILDING_SIZE: 30,
    BUILDING_HEIGHT: 40,
    BUILDING_SPACING: 5,
    
    // Road network
    ROAD_WIDTH: 15,
    INTERSECTION_SIZE: 20,
    BLOCK_SIZE: 50,
    
    // Debug
    DEBUG_MODE: false,
    SHOW_PATHS: false,
    
    // Van starting positions
    VAN_START_X: 0,    // Center
    VAN_START_Z: 0,    // Center
    OFFICER_SPEED: 7.0, // Increased from previous value
    OFFICER_DAMPING: 0.85, // Reduced for more responsiveness
    VAN_DAMPING: 0.7, // Lower damping for less jitter
    
    // Prison
    PRISON_ENTRANCE_X: 130, // West wall, centered on new minX
    PRISON_ENTRANCE_Z: 170, // Centered on new Z range
    PRISON_JAIL_MIN_X: 130,
    PRISON_JAIL_MAX_X: 210,
    PRISON_JAIL_MIN_Z: 130,
    PRISON_JAIL_MAX_Z: 210,
};

// --- Apply saved simulation parameters from localStorage if present ---
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem('riotSimParams');
    if (saved) {
      const { p, o, v } = JSON.parse(saved);
      if (typeof p === 'number' && !isNaN(p)) CONFIG.PROTESTOR_COUNT = p;
      if (typeof o === 'number' && !isNaN(o)) CONFIG.POLICE_COUNT = o;
      if (typeof v === 'number' && !isNaN(v)) CONFIG.VAN_COUNT = v;
    }
  }
} catch (e) {
  // Ignore errors (e.g., localStorage not available)
}
  