// console.log('main.js loaded');

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { createProtestors, updateProtestors } from './protestors.js';
import { createPolice, updatePolice, getPolice } from './police.js';
import { createVans, updateVans } from './vans.js';
import { buildWorld } from './world.js';
import { createBuildings } from './buildings.js';
import { updateParticles, createArrestEffect } from './particles.js';
import { CONFIG } from './config.js';
import { SpatialHashGrid } from './spatial-hash-grid.js';
import { HUD } from './hud.js';
import { ArrestManager } from './arrest_logic.js';
import { loadPoliceAIOrders, nextPoliceAIOrder, getPoliceAIOrder } from './policeAI.js';

let arrests = 0;
let lastTime = performance.now();
let frameCount = 0;  // Initialize frame counter
const CELL_SIZE = 10; // Size of each spatial partition cell
const spatialGrid = new Map(); // Grid for spatial partitioning

// Initialize spatial grid
function initSpatialGrid() {
    spatialGrid.clear();
}

// Get grid cell key for a position
function getGridKey(position) {
    const x = Math.floor(position.x / CELL_SIZE);
    const z = Math.floor(position.z / CELL_SIZE);
    return `${x},${z}`;
}

// Add object to spatial grid
function addToGrid(object) {
    const key = getGridKey(object.position);
    if (!spatialGrid.has(key)) {
        spatialGrid.set(key, new Set());
    }
    spatialGrid.get(key).add(object);
}

// Get nearby objects from grid
function getNearbyObjects(position) {
    const centerKey = getGridKey(position);
    const [centerX, centerZ] = centerKey.split(',').map(Number);
    const nearby = new Set();

    // Check 9 cells (current cell and surrounding cells)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = `${centerX + dx},${centerZ + dz}`;
            const cell = spatialGrid.get(key);
            if (cell) {
                cell.forEach(obj => nearby.add(obj));
            }
        }
    }
    return nearby;
}

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb3e0ff); // Light blue sky
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(0xb3e0ff); // Light blue clear color
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera setup - zoomed out more for larger 400x400 map
camera.position.set(0, 200, 300); // Higher and further back to show full map
camera.lookAt(0, 0, 0);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Add a point light above the scene for better floor illumination
const pointLight = new THREE.PointLight(0xffffff, 1, 1000);
pointLight.position.set(0, 100, 0);
scene.add(pointLight);

// Build world
const worldData = buildWorld(scene);
let gateSystem = worldData.gateSystem;

// Create buildings around the map
const buildings = createBuildings(scene);

// Add a central building where protestors congregate - MOVED TO CENTER
const centralBuildingGeometry = new THREE.BoxGeometry(40, 25, 40);
const centralBuildingMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B4513, // Brown color like a town hall
    roughness: 0.6,
    metalness: 0.2
});
const centralBuilding = new THREE.Mesh(centralBuildingGeometry, centralBuildingMaterial);
centralBuilding.position.set(-50, 12.5, -50); // CENTER of map (between protestors and police)
centralBuilding.userData.isCentralBuilding = true;
scene.add(centralBuilding);
buildings.push(centralBuilding);

// Add a flag or marker on top of the central building to make it more visible
const flagPoleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 10);
const flagPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x654321 });
const flagPole = new THREE.Mesh(flagPoleGeometry, flagPoleMaterial);
flagPole.position.set(-50, 30, -50); // On top of building
scene.add(flagPole);

const flagGeometry = new THREE.PlaneGeometry(8, 5);
const flagMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff0000, // Red flag
    side: THREE.DoubleSide 
});
const flag = new THREE.Mesh(flagGeometry, flagMaterial);
flag.position.set(-46, 32, -50); // Slightly offset from pole
scene.add(flag);

// Add closeGate function to the gate system
gateSystem.closeGate = function() {
    const { leftGate, rightGate } = this;
    // console.log('Manual gate close triggered - forcing gate closure');
    
    // Immediately start closing animation
    const closeGates = () => {
        const closeSpeed = 3 * 0.016; // Rotation speed (radians per frame)
        
        if (leftGate.userData.isOpen) {
            // Rotate gates to closed position (blocking passage)
            leftGate.rotation.y = Math.max(leftGate.rotation.y - closeSpeed, leftGate.userData.closedRotation);
            rightGate.rotation.y = Math.min(rightGate.rotation.y + closeSpeed, rightGate.userData.closedRotation);
            
            if (Math.abs(leftGate.rotation.y - leftGate.userData.closedRotation) < 0.01 && 
                Math.abs(rightGate.rotation.y - rightGate.userData.closedRotation) < 0.01) {
                leftGate.userData.isOpen = false;
                rightGate.userData.isOpen = false;
                leftGate.rotation.y = leftGate.userData.closedRotation;
                rightGate.rotation.y = rightGate.userData.closedRotation;
                // console.log('Gates manually closed after prisoner delivery');
                
                // Lights removed - no sensor lights to update
            } else {
                // Continue closing animation
                requestAnimationFrame(closeGates);
            }
        }
    };
    
    closeGates();
};

// Make gate system globally accessible for collision avoidance
window.gateSystem = gateSystem;

// Initialize entities
const protestors = createProtestors(scene, CONFIG.PROTESTOR_COUNT);
const police = createPolice(scene, CONFIG.POLICE_COUNT);
const vans = createVans(scene, CONFIG.VAN_COUNT, police);

// Initialize spatial hash grid
const spatialHashGrid = new SpatialHashGrid(CELL_SIZE);

const hud = new HUD();
window.hud = hud;

// Initialize ArrestManager
const arrestManager = new ArrestManager();
window.arrestManager = arrestManager;
// Reset global arrest count
window.arrestCount = 0;

// Make functions globally accessible
window.incrementArrests = () => {
    arrests++;
    hud.updateProtestorCount(getCrowd(), getPolice(), arrests);
};

window.triggerArrestEffect = (position) => {
    createArrestEffect(scene, position);
};

window.getCrowdMembers = () => {
    return protestors;
};

window.getVehicles = () => {
    return vans;
};

window.getVans = () => vans;

function animate() {
    try {
        requestAnimationFrame(animate);

        const time = performance.now();
        const deltaTime = Math.min((time - lastTime) / 1000, 0.1) * 2.0; // 2x speed
        lastTime = time;

        // Update spatial hash grid more efficiently - only every few frames
        if (frameCount % 3 === 0) {
            spatialHashGrid.clear();
            // Only add entities that need collision detection
            protestors.forEach(protestor => {
                if (!protestor.userData.isArrested && !protestor.userData.isBeingTransported) {
                    spatialHashGrid.insert(protestor);
                }
            });
            police.forEach(officer => {
                if (officer.userData.state === 'patrolling') {
                    spatialHashGrid.insert(officer);
                }
            });
            vans.forEach(van => spatialHashGrid.insert(van));
        }

        // Update all entities
        updateProtestors(protestors, police, vans, deltaTime);
        updatePolice(police, protestors, vans, deltaTime);
        updateVans(vans, police, protestors, deltaTime, scene);
        updateParticles();

        // Optimized arrest logic: only check every other frame for performance
        if (frameCount % 2 === 0) {
            protestors.forEach(protestor => {
                if (!protestor.userData.isArrested && !protestor.userData.isBeingArrested) {
                    // Find two available officers within ARREST_RANGE using spatial grid
                    const nearbyOfficers = spatialHashGrid.findNearby(protestor.position, CONFIG.ARREST_RANGE).filter(entity => 
                        entity.userData && 
                        entity.userData.state === 'patrolling' &&
                        !entity.userData.arrestId &&
                        entity.position.distanceTo(protestor.position) < CONFIG.ARREST_RANGE
                    );
                    
                    if (nearbyOfficers.length >= 2) {
                        arrestManager.initializeArrest([nearbyOfficers[0], nearbyOfficers[1]], protestor);
                    }
                }
            });
        }
        
        // Update all arrests
        arrestManager.update(deltaTime);

        // PRISON GATE CONTROL SYSTEM
        if (gateSystem) {
            updateGateSystem(gateSystem, vans, deltaTime);
        }

        // Update HUD van capacity bar with debug logging
        let currentVanOccupants = 0;
        vans.forEach(van => {
            if (Array.isArray(van.occupants)) {
                currentVanOccupants += van.occupants.length;
            }
        });
        const totalVanCapacity = vans.length * CONFIG.VAN_CAPACITY;
        hud.updateCapacity(currentVanOccupants, totalVanCapacity);

        // Debug van capacity every 60 frames (once per second at 60fps)
        if (frameCount % 60 === 0) {
            // console.log('Van capacity debug:', currentVanOccupants, '/', totalVanCapacity);
            vans.forEach((van, i) => {
                // console.log(`Van ${i}: ${van.occupants.length}/${van.maxCapacity} occupants, state: ${van.state}`);
            });
        }

        // FIXED: Smart boundary enforcement - allow prisoners to enter prison area but keep them contained
        if (frameCount % 4 === 0) {
            const worldBounds = CONFIG.WORLD_SIZE / 2 - 2;
            const prisonMinX = CONFIG.PRISON_JAIL_MIN_X;
            const prisonMaxX = CONFIG.PRISON_JAIL_MAX_X;
            const prisonMinZ = CONFIG.PRISON_JAIL_MIN_Z;
            const prisonMaxZ = CONFIG.PRISON_JAIL_MAX_Z;
            const entities = [...protestors, ...police, ...vans];
            entities.forEach(entity => {
                let maxX = worldBounds;
                let minX = -worldBounds;
                let maxZ = worldBounds;
                let minZ = -worldBounds;
                // CRITICAL: Allow transported prisoners to go into prison area
                if (entity.userData && (entity.userData.isBeingTransported || entity.userData.isArrested)) {
                    maxX = prisonMaxX;
                }
                // Jailed prisoners must stay inside new prison boundaries
                if (entity.userData && entity.userData.isJailed) {
                    minX = prisonMinX;
                    maxX = prisonMaxX;
                    minZ = prisonMinZ;
                    maxZ = prisonMaxZ;
                }
                entity.position.x = Math.max(minX, Math.min(maxX, entity.position.x));
                entity.position.z = Math.max(minZ, Math.min(maxZ, entity.position.z));
                entity.position.y = Math.max(0, Math.min(2, entity.position.y));
            });
        }

        // Update protestor and arrest counts in HUD with better tracking
        const remainingProtestors = protestors.filter(p => !p.userData.isArrested && !p.userData.isBeingArrested && !p.userData.isJailed).length;
        hud.updateProtestorCount(remainingProtestors, CONFIG.PROTESTOR_COUNT);
        
        // Better arrest count calculation - count all protestors that have been processed (including being arrested)
        const transportedCount = protestors.filter(p => p.userData.isBeingTransported).length;
        const jailedCount = protestors.filter(p => p.userData.isJailed).length;
        const arrestedCount = protestors.filter(p => p.userData.isArrested && !p.userData.isBeingTransported && !p.userData.isJailed).length;
        const beingArrestedCount = protestors.filter(p => p.userData.isBeingArrested && !p.userData.isArrested && !p.userData.isBeingTransported && !p.userData.isJailed).length;
        const totalProcessed = transportedCount + jailedCount + arrestedCount + beingArrestedCount;
        hud.updateArrestCount(totalProcessed);
        
        // Update prison capacity bar
        hud.updatePrisonCapacity(jailedCount);
        
        // Debug arrest counts and officer states every 60 frames
        if (frameCount % 60 === 0) {
            // console.log('Arrest count debug - Transported:', transportedCount, 'Jailed:', jailedCount, 'Arrested:', arrestedCount, 'Being Arrested:', beingArrestedCount, 'Total:', totalProcessed);
            // console.log('Prison capacity:', jailedCount, '/', CONFIG.PROTESTOR_COUNT);
            
            // DEBUG: Check actual prisoner positions and visibility
            const jailedPrisoners = protestors.filter(p => p.userData.isJailed);
            const visibleJailed = jailedPrisoners.filter(p => p.visible);
            const inPrisonArea = jailedPrisoners.filter(p => 
                p.position.x >= CONFIG.PRISON_JAIL_MIN_X && p.position.x <= CONFIG.PRISON_JAIL_MAX_X && 
                p.position.z >= CONFIG.PRISON_JAIL_MIN_Z && p.position.z <= CONFIG.PRISON_JAIL_MAX_Z
            );
            
            // console.log(`PRISONER DEBUG - Total jailed: ${jailedPrisoners.length}, Visible: ${visibleJailed.length}, In prison area: ${inPrisonArea.length}`);
            
            if (jailedPrisoners.length > visibleJailed.length) {
                // console.warn(`${jailedPrisoners.length - visibleJailed.length} jailed prisoners are INVISIBLE!`);
            }
            
            if (jailedPrisoners.length > inPrisonArea.length) {
                // console.warn(`${jailedPrisoners.length - inPrisonArea.length} jailed prisoners are OUTSIDE prison area!`);
                // Show positions of misplaced prisoners
                jailedPrisoners.filter(p => 
                    p.position.x < CONFIG.PRISON_JAIL_MIN_X || p.position.x > CONFIG.PRISON_JAIL_MAX_X || 
                    p.position.z < CONFIG.PRISON_JAIL_MIN_Z || p.position.z > CONFIG.PRISON_JAIL_MAX_Z
                ).forEach((p, i) => {
                    if (i < 3) {
                        // console.log(`Misplaced prisoner at (${p.position.x.toFixed(1)}, ${p.position.z.toFixed(1)})`);
                    }
                });
            }
            
            // DEBUG: Officer states
            const officerStates = {};
            police.forEach(officer => {
                const state = officer.userData.state || 'unknown';
                officerStates[state] = (officerStates[state] || 0) + 1;
            });
            // console.log('Officer states:', officerStates);
        }

        frameCount++;
        renderer.render(scene, camera);
    } catch (err) {
        console.error('Error in animate():', err);
        throw err;
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Consolidated keyboard event handler - remove duplicate listeners
document.addEventListener('keydown', (e) => {
    // console.log('MAIN.JS KEYDOWN:', e.key, e.code, e.keyCode);
    
    // NOTE: 'i' key is handled in index.html to avoid conflicts
    
    // Period key for camera coordinates
    if (e.key === '.' || e.code === 'Period' || e.keyCode === 190) {
        e.preventDefault();
        // console.log(
        //     '=== CAMERA === Position:',
        //     camera.position.toArray(),
        //     'Rotation (Euler):',
        //     [camera.rotation.x, camera.rotation.y, camera.rotation.z]
        // );
        return; // Exit early to prevent other key handling
    }
    
    // WASD/arrow key camera movement
    const moveSpeed = 10;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        camera.position.z -= moveSpeed;
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        camera.position.z += moveSpeed;
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        camera.position.x -= moveSpeed;
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        camera.position.x += moveSpeed;
    }
});

// Ensure right mouse button pans in OrbitControls
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

// Completely redesigned gate control system with improved logic and smoother animation
function updateGateSystem(gateSystem, vans, deltaTime) {
    if (!gateSystem || !gateSystem.leftGate || !gateSystem.rightGate) return;
    
    const { leftGate, rightGate } = gateSystem;
    
    // Gate position for distance calculations
    const gatePosition = new THREE.Vector3(CONFIG.WORLD_SIZE/2, leftGate.position.y, 0);
    
    // Initialize gate state variables if needed
    if (leftGate.userData.animationState === undefined) {
        leftGate.userData.animationState = 'closed';
        rightGate.userData.animationState = 'closed';
        leftGate.userData.currentRotation = leftGate.userData.closedRotation;
        rightGate.userData.currentRotation = rightGate.userData.closedRotation;
        leftGate.userData.openTimer = 0;
    }
    
    // Check for vans with prisoners approaching or near the gate
    let shouldOpen = false;
    let emergencyOpen = false; // For vans extremely close to gate
    let vanNearGate = false;
    
    // Check all vans with improved proximity detection
    vans.forEach(van => {
        const distanceToGate = van.position.distanceTo(gatePosition);
        
        // Track if any van is near the gate
        if (distanceToGate < 100) {
            vanNearGate = true;
        }
        
        // Emergency open for any van extremely close to gate
        if (distanceToGate < 20) {
            emergencyOpen = true;
        }
        
        // Standard gate opening logic with increased detection range
        if (distanceToGate < 80) {
            // Open for vans heading to prison
            if (van.state === 'extracting' || van.state === 'transporting') {
                shouldOpen = true;
            }
            // Open for vans with prisoners
            else if (van.occupants && van.occupants.length > 0) {
                shouldOpen = true;
            }
            // Open for vans that are returning but still very close to gate
            else if (van.state === 'returning' && distanceToGate < 30) {
                shouldOpen = true;
            }
        }
    });
    
    // Timer-based auto-close when no vans are near
    if (!vanNearGate) {
        leftGate.userData.openTimer += deltaTime;
        // Auto-close after 5 seconds of no vans nearby
        if (leftGate.userData.openTimer > 5.0) {
            shouldOpen = false;
        }
    } else {
        // Reset timer when vans are detected
        leftGate.userData.openTimer = 0;
    }
    
    // Emergency override - always open if a van is extremely close
    if (emergencyOpen) {
        shouldOpen = true;
    }
    
    // SMOOTH GATE ANIMATION: Gradually move gates to target position
    const animationSpeed = 2.0; // Animation speed (radians per second)
    
    // Target rotations based on gate state
    const leftTargetRotation = shouldOpen ? leftGate.userData.openRotation : leftGate.userData.closedRotation;
    const rightTargetRotation = shouldOpen ? rightGate.userData.openRotation : rightGate.userData.closedRotation;
    
    // Smoothly animate left gate
    if (Math.abs(leftGate.rotation.y - leftTargetRotation) > 0.01) {
        // Determine direction and amount to rotate
        const leftDiff = leftTargetRotation - leftGate.rotation.y;
        const leftStep = Math.sign(leftDiff) * Math.min(Math.abs(leftDiff), animationSpeed * deltaTime);
        leftGate.rotation.y += leftStep;
        
        // Update animation state
        leftGate.userData.animationState = shouldOpen ? 'opening' : 'closing';
    } else {
        // Snap to exact position when very close
        leftGate.rotation.y = leftTargetRotation;
        leftGate.userData.animationState = shouldOpen ? 'open' : 'closed';
    }
    
    // Smoothly animate right gate
    if (Math.abs(rightGate.rotation.y - rightTargetRotation) > 0.01) {
        // Determine direction and amount to rotate
        const rightDiff = rightTargetRotation - rightGate.rotation.y;
        const rightStep = Math.sign(rightDiff) * Math.min(Math.abs(rightDiff), animationSpeed * deltaTime);
        rightGate.rotation.y += rightStep;
        
        // Update animation state
        rightGate.userData.animationState = shouldOpen ? 'opening' : 'closing';
    } else {
        // Snap to exact position when very close
        rightGate.rotation.y = rightTargetRotation;
        rightGate.userData.animationState = shouldOpen ? 'open' : 'closed';
    }
    
    // Update gate state flags
    leftGate.userData.isOpen = shouldOpen;
    rightGate.userData.isOpen = shouldOpen;
    
    // Debug logging less frequently
    if (!leftGate.userData.debugTimer) {
        leftGate.userData.debugTimer = 0;
    }
    leftGate.userData.debugTimer += deltaTime;
    if (leftGate.userData.debugTimer > 10.0) { // Every 10 seconds
        leftGate.userData.debugTimer = 0;
        console.log(`GATE STATUS: ${shouldOpen ? 'OPEN' : 'CLOSED'}`);
    }
    
    // Add collision detection to gates
    const boundingBox = new THREE.Box3().setFromObject(leftGate);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    leftGate.userData.boundingSphere = new THREE.Sphere(
        leftGate.position.clone(),
        Math.max(size.x, size.y, size.z) / 2 + 5
    );
    
    const rightBoundingBox = new THREE.Box3().setFromObject(rightGate);
    rightBoundingBox.getSize(size);
    rightGate.userData.boundingSphere = new THREE.Sphere(
        rightGate.position.clone(),
        Math.max(size.x, size.y, size.z) / 2 + 5
    );
}

loadPoliceAIOrders().then(() => {
    animate(0);
});

// --- BEGIN: Simulation Parameter Inputs (replace AI input) ---
window.addEventListener('DOMContentLoaded', () => {
  // Remove or comment out AI input field and logic
  // const input = document.getElementById('commandInput');
  // const button = document.getElementById('commandSubmit');
  // ... AI code paused for v1 ...

  // Create parameter input container
  const paramDiv = document.createElement('div');
  paramDiv.style.position = 'fixed';
  paramDiv.style.top = '10px';
  paramDiv.style.left = '10px';
  paramDiv.style.background = 'rgba(255,255,255,0.95)';
  paramDiv.style.padding = '12px 18px 12px 18px';
  paramDiv.style.borderRadius = '8px';
  paramDiv.style.zIndex = '2000';
  paramDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
  paramDiv.style.display = 'flex';
  paramDiv.style.flexDirection = 'column';
  paramDiv.style.gap = '8px';

  paramDiv.innerHTML = `
    <label style="font-size:14px;">Protestors: <input id="paramProtestors" type="number" min="10" max="1000" value="${CONFIG.PROTESTOR_COUNT}" style="width:60px;" /></label>
    <label style="font-size:14px;">Officers: <input id="paramOfficers" type="number" min="2" max="100" value="${CONFIG.POLICE_COUNT}" style="width:60px;" /></label>
    <label style="font-size:14px;">Vans: <input id="paramVans" type="number" min="1" max="20" value="${CONFIG.VAN_COUNT}" style="width:60px;" /></label>
    <button id="paramApply" style="margin-top:4px;">Restart Simulation</button>
    <div style="font-size:12px;color:#888;max-width:180px;">AI features are paused in this version. All behavior is simulation-based.</div>
  `;
  document.body.appendChild(paramDiv);

  document.getElementById('paramApply').onclick = () => {
    const p = parseInt(document.getElementById('paramProtestors').value, 10);
    const o = parseInt(document.getElementById('paramOfficers').value, 10);
    const v = parseInt(document.getElementById('paramVans').value, 10);
    // Update CONFIG and reload page to restart sim
    localStorage.setItem('riotSimParams', JSON.stringify({p, o, v}));
    window.location.reload();
  };

  // (CONFIG is now updated in config.js, so we only update the UI fields here if needed)
});
// --- END: Simulation Parameter Inputs ---

