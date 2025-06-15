import * as THREE from 'three';
import { CONFIG } from './config.js';
import { ENTITY_Y_POSITIONS } from './world.js';
import { getPoliceAIOrder, loadPoliceAIOrders, generatePoliceAIOrderWithOpenAI } from './policeAI.js';

let police = [];
export let formationAdvanceX = CONFIG.POLICE_START_X;

const NORMAL_SPEED = 0.05;
const SPRINT_SPEED = 0.15;
const STAMINA_RECOVERY = 0.2;
const STAMINA_DRAIN = 0.5;

let officersInitialized = false;
let officerGeometry = null;
let officerMaterial = null;
let _lastOfficerStateLog = 0;

// Helper function to check and fix invalid vectors
function sanitizeVector(vector, maxValue = 100) {
    if (isNaN(vector.x) || isNaN(vector.y) || isNaN(vector.z) ||
        !isFinite(vector.x) || !isFinite(vector.y) || !isFinite(vector.z) ||
        Math.abs(vector.x) > maxValue || Math.abs(vector.y) > maxValue || Math.abs(vector.z) > maxValue) {
        
        // Reset to small random values
        vector.set(
            (Math.random() - 0.5) * 0.1,
            0,
            (Math.random() - 0.5) * 0.1
        );
        return true; // Vector was sanitized
    }
    return false; // Vector was already valid
}

export function deployPolice(scene) {
    // Removed deployPolice function to prevent accidental use. Only createPolice should be used for officer creation.
}

function findNearestVanGroup(position, vans) {
    let nearestDist = Infinity;
    let nearestGroup = null;
    
    // Group vehicles by groupId
    const groups = {};
    vans.forEach(van => {
        if (!groups[van.userData.groupId]) {
            groups[van.userData.groupId] = [];
        }
        groups[van.userData.groupId].push(van);
    });
    
    // Find nearest group that's patrolling
    Object.values(groups).forEach(group => {
        if (group.length === 4 && group[0].userData.state === 'patrolling') {
            const groupCenter = new THREE.Vector3();
            group.forEach(van => groupCenter.add(van.position));
            groupCenter.divideScalar(4);
            
            const dist = position.distanceTo(groupCenter);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestGroup = group;
            }
        }
    });
    
    return nearestGroup;
}

function findNearestVan(position, vans) {
    let nearestVan = null;
    let minDist = Infinity;
    vans.forEach(van => {
        const dist = van.position.distanceTo(position);
        if (dist < minDist && van.occupants.length < van.maxCapacity) {
            minDist = dist;
            nearestVan = van;
        }
    });
    return nearestVan;
}

function updateOfficerVisuals(officer) {
    if (officer.userData && officer.userData.state) {
        if (officer.userData.state === 'patrolling') {
            officer.material.color.setHex(0x0000ff); // Blue
        } else if (officer.userData.state === 'arresting') {
            officer.material.color.setHex(0x00ff00); // Green
        }
        // console.log('Officer', officer.userData.state, 'color', officer.material.color.getHexString());
    }
}

// Helper: assign a new random patrol target to an officer
function assignRandomPatrolTarget(officer) {
    // Define patrol zones - areas where officers should focus
    const patrolZones = [
        // Main protest area - high priority
        { 
            centerX: -50, 
            centerZ: 0, 
            radiusMin: 50, 
            radiusMax: 100, 
            weight: 0.7 // 70% chance to patrol near protest area
        },
        // Perimeter patrol - medium priority
        { 
            centerX: 0, 
            centerZ: 0, 
            radiusMin: 80, 
            radiusMax: 150, 
            weight: 0.2 // 20% chance to patrol perimeter
        },
        // Prison approach - low priority
        { 
            centerX: 100, 
            centerZ: 0, 
            radiusMin: 20, 
            radiusMax: 60, 
            weight: 0.1 // 10% chance to patrol near prison entrance
        }
    ];
    
    // Select a patrol zone based on weights
    const zoneRoll = Math.random();
    let selectedZone;
    let cumulativeWeight = 0;
    
    for (const zone of patrolZones) {
        cumulativeWeight += zone.weight;
        if (zoneRoll <= cumulativeWeight) {
            selectedZone = zone;
            break;
        }
    }
    
    // If no zone was selected (shouldn't happen), use the first zone
    if (!selectedZone) {
        selectedZone = patrolZones[0];
    }
    
    // Generate a random angle and distance within the selected zone
    const angle = Math.random() * Math.PI * 2;
    const distance = selectedZone.radiusMin + Math.random() * (selectedZone.radiusMax - selectedZone.radiusMin);
    // Add more randomness
    const jitter = (Math.random() - 0.5) * 20;
    const targetX = selectedZone.centerX + Math.cos(angle) * distance + jitter;
    const targetZ = selectedZone.centerZ + Math.sin(angle) * distance + jitter;
    
    // Avoid central building
    const buildingCenter = new THREE.Vector3(-50, 0, -50);
    const buildingSize = 50; // Increased safety margin
    const distToBuilding = Math.sqrt(Math.pow(targetX - buildingCenter.x, 2) + Math.pow(targetZ - buildingCenter.z, 2));
    
    if (distToBuilding < buildingSize) {
        // Try again if target is inside or too close to building
        return assignRandomPatrolTarget(officer);
    }
    
    // Create and validate target position
    officer.userData.patrolTarget = new THREE.Vector3(targetX, 1, targetZ);
    officer.userData.targetAssignTime = performance.now();
}

// Helper: validate and fix officer target positions
function validateOfficerTarget(officer) {
    // Check if target position is invalid (like prison entrance coordinates)
    if (!officer.userData.patrolTarget || 
        isNaN(officer.userData.patrolTarget.x) || 
        isNaN(officer.userData.patrolTarget.y) || 
        isNaN(officer.userData.patrolTarget.z) ||
        officer.userData.patrolTarget.x < -100 || 
        officer.userData.patrolTarget.x > 100 ||
        officer.userData.patrolTarget.z < -100 || 
        officer.userData.patrolTarget.z > 100 ||
        officer.userData.patrolTarget.y !== 1) {
        
        assignRandomPatrolTarget(officer);
    }
}

function isProtestorTargetedByOtherOfficer(protestor, thisOfficer, police) {
    return police.some(officer => officer !== thisOfficer && officer.userData.arrestTarget === protestor);
}

function completeArrest(officer, protestor) {
    // Mark protestor as arrested and clear beingArrested
    protestor.userData.isArrested = true;
    protestor.userData.isBeingArrested = false;
    officer.userData.state = 'patrolling';
    officer.userData.arrestTarget = null;
    officer.userData.stuckTime = 0;
    officer.userData.lastArrestCompleted = performance.now();
    // Immediately assign a new patrol target
    assignRandomPatrolTarget(officer);
}

// Helper to get protestor crowd center
function getProtestorCrowdCenter(protestors) {
    let center = new THREE.Vector3();
    let count = 0;
    protestors.forEach(p => {
        if (!p.userData.isArrested && !p.userData.isBeingArrested) {
            center.add(p.position);
            count++;
        }
    });
    if (count > 0) center.divideScalar(count);
    return center;
}

function arrestProtestor(protestor) {
    protestor.userData.isArrested = true;
    protestor.userData.isBeingArrested = false;
    console.log('Protestor', protestor.uuid, 'arrested by officers.');
}

function shortId(id) {
    return id ? id.toString().slice(0, 6) : 'null';
}

function isProtestorAvailableForArrest(protestor, police) {
    return !protestor.userData.isArrested &&
           !protestor.userData.isBeingArrested &&
           !protestor.userData.isBeingTransported &&
           !protestor.userData.isJailed &&
           !isProtestorTargetedByOtherOfficer(protestor, null, police);
}

function clampVectorMagnitude(vec, max) {
    const len = vec.length();
    if (len > max) {
        vec.multiplyScalar(max / len);
        return true;
    }
    return false;
}

export function updatePolice(police, protestors, vans, deltaTime) {
    let aiOrder = (window.policeAIOrder || 'arrest');
    const crowdCenter = getProtestorCrowdCenter(protestors);
    // Officer state distribution log every 2 seconds
    _lastOfficerStateLog += deltaTime;
    if (_lastOfficerStateLog > 2) {
        const stateCounts = {};
        police.forEach(o => {
            const s = o.userData.state;
            stateCounts[s] = (stateCounts[s] || 0) + 1;
        });
        console.log('[OFFICER STATE COUNTS]', stateCounts);
        _lastOfficerStateLog = 0;
    }
    // Per-frame logs for up to 3 arresting officers
    let arrestingLogged = 0;
    police.forEach(officer => {
        if (officer.userData.state === 'arresting' && arrestingLogged < 3 && officer.userData.arrestTarget) {
            const t = officer.userData.arrestTarget;
            const dist = officer.position.distanceTo(t.position).toFixed(2);
            const vel = officer.userData.velocity ? officer.userData.velocity.toArray() : officer.velocity.toArray();
            console.log('[ARRESTING]', shortId(officer.uuid), 'pos:', officer.position.toArray(), 'vel:', vel, 'target:', shortId(t.uuid), 'targetPos:', t.position.toArray(), 'dist:', dist);
            arrestingLogged++;
        }
    });
    police.forEach(officer => {
        // Clamp officer velocity each frame
        if (officer.userData.velocity) {
            if (clampVectorMagnitude(officer.userData.velocity, 2)) {
                console.warn('[OFFICER VELOCITY CLAMP]', shortId(officer.uuid), 'velocity clamped', officer.userData.velocity.toArray());
            }
        } else if (officer.velocity) {
            if (clampVectorMagnitude(officer.velocity, 2)) {
                console.warn('[OFFICER VELOCITY CLAMP]', shortId(officer.uuid), 'velocity clamped', officer.velocity.toArray());
            }
        }
        // --- ALWAYS ATTEMPT ARRESTS BY DEFAULT ---
        if (officer.userData.state !== 'arresting') {
            // Find nearest available protestor to arrest within 60 units (increased range)
            let nearestProtestor = null;
            let minDist = Infinity;
            protestors.forEach(protestor => {
                const dist = officer.position.distanceTo(protestor.position);
                if (dist < 60 && isProtestorAvailableForArrest(protestor, police)) {
                    if (dist < minDist) {
                        minDist = dist;
                        nearestProtestor = protestor;
                    }
                }
            });
            if (nearestProtestor) {
                // Move directly toward the protestor if not close enough to arrest
                const toTarget = new THREE.Vector3().subVectors(nearestProtestor.position, officer.position);
                toTarget.y = 0;
                if (toTarget.length() > 5) {
                    toTarget.normalize().multiplyScalar(CONFIG.POLICE_MOVE_SPEED * 1.7);
                    officer.userData.velocity.copy(toTarget);
                }
                // Find another idle officer nearby to pair up
                let partner = null;
                let partnerDist = Infinity;
                police.forEach(other => {
                    if (other !== officer && other.userData.state !== 'arresting') {
                        const d = officer.position.distanceTo(other.position);
                        if (d < 15 && d < partnerDist) {
                            partner = other;
                            partnerDist = d;
                        }
                    }
                });
                if (partner) {
                    // Assign both officers to arrest
                    officer.userData.state = 'arresting';
                    partner.userData.state = 'arresting';
                    officer.userData.arrestTarget = nearestProtestor;
                    partner.userData.arrestTarget = nearestProtestor;
                    nearestProtestor.userData.isBeingArrested = true;
                    return;
                }
            }
            // Only patrol if no protestors are available
            if (!officer.userData.patrolTarget || officer.position.distanceTo(officer.userData.patrolTarget) < 3 || Math.random() < 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 10 + Math.random() * 20;
                officer.userData.patrolTarget = crowdCenter.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
                officer.userData.state = 'patrolling';
            }
        } else {
            if (!officer.userData._arrestingTimer) officer.userData._arrestingTimer = 0;
            officer.userData._arrestingTimer += deltaTime;
            const t = officer.userData.arrestTarget;
            if (t && officer.position.distanceTo(t.position) < 5) {
                arrestProtestor(t);
                officer.userData.state = 'patrolling';
                officer.userData.arrestTarget = null;
                officer.userData.patrolTarget = crowdCenter.clone();
                officer.userData._stuckFrames = 0;
                officer.userData._arrestingTimer = 0;
                console.log('Officer', officer.uuid, 'completed arrest and is now patrolling.');
            } else if (officer.userData._arrestingTimer > 5) {
                // Timeout: reset state
                if (t && t.userData.isBeingArrested) {
                    t.userData.isBeingArrested = false;
                    const dist = officer.position.distanceTo(t.position).toFixed(2);
                    const officerState = officer.userData.state;
                    const protestorState = JSON.stringify({
                        isArrested: t.userData.isArrested,
                        isBeingArrested: t.userData.isBeingArrested,
                        isBeingTransported: t.userData.isBeingTransported,
                        isJailed: t.userData.isJailed
                    });
                    const protestorMoving = t.userData.velocity && t.userData.velocity.length() > 0.1;
                    console.warn('[OFFICER TIMEOUT]', shortId(officer.uuid), 'cleared protestor', shortId(t.uuid), '| dist:', dist, '| officerState:', officerState, '| protestorState:', protestorState, '| protestorMoving:', protestorMoving, '| officerPos:', officer.position.toArray(), '| protestorPos:', t.position.toArray());
                }
                officer.userData.state = 'patrolling';
                officer.userData.arrestTarget = null;
                officer.userData.patrolTarget = crowdCenter.clone();
                officer.userData._arrestingTimer = 0;
                console.warn('[OFFICER TIMEOUT]', shortId(officer.uuid), 'reset to patrolling');
            }
        }
        // Stuck detection: if not moving for several frames, forcibly assign new patrol or teleport
        if (!officer.userData._stuckFrames) officer.userData._stuckFrames = 0;
        if (officer.userData.velocity.length() < 0.1) {
            officer.userData._stuckFrames++;
        } else {
            officer.userData._stuckFrames = 0;
        }
        if (officer.userData._stuckFrames > 10) {
            // Teleport a short distance in a random direction to break out of static state
            const angle = Math.random() * Math.PI * 2;
            const dist = 5 + Math.random() * 10;
            officer.position.add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
            officer.userData.patrolTarget = crowdCenter.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
            officer.userData.state = 'patrolling';
            officer.userData._stuckFrames = 0;
            console.warn('[OFFICER STUCK]', shortId(officer.uuid), 'teleported to break static state', officer.userData.patrolTarget);
        }
        // Patrol movement
        if (officer.userData.patrolTarget && officer.position.distanceTo(officer.userData.patrolTarget) > 2) {
            const toTarget = new THREE.Vector3().subVectors(officer.userData.patrolTarget, officer.position);
            toTarget.y = 0; // Only move in XZ
            const dist = toTarget.length();
            // Add a larger random walk to patrol movement
            const randomWalk = new THREE.Vector3((Math.random() - 0.5) * 1.0, 0, (Math.random() - 0.5) * 1.0);
            toTarget.add(randomWalk);
            if (dist > 0.1) {
                toTarget.normalize().multiplyScalar(CONFIG.POLICE_MOVE_SPEED * 1.5); // Faster patrol
                toTarget.y = 0;
                officer.userData.velocity.copy(toTarget);
            } else {
                officer.userData.velocity.set(0, 0, 0);
            }
        }
        // If no patrol target, always assign one
        if (!officer.userData.patrolTarget) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 10 + Math.random() * 20;
            officer.userData.patrolTarget = crowdCenter.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            officer.userData.state = 'patrolling';
        }
        // Arresting movement
        if (officer.userData.state === 'arresting' && officer.userData.arrestTarget) {
            const t = officer.userData.arrestTarget;
            const toTarget = new THREE.Vector3().subVectors(t.position, officer.position);
            toTarget.y = 0; // Only move in XZ
            const dist = toTarget.length();
            // Protestor avoidance (steer away from non-target protestors)
            let avoid = new THREE.Vector3();
            let avoidCount = 0;
            protestors.forEach(p => {
                if (p !== t && !p.userData.isArrested && !p.userData.isBeingTransported) {
                    const d = officer.position.distanceTo(p.position);
                    if (d < 12) { // Larger push radius
                        const strength = Math.pow((12 - d) / 12, 2) * 2.0; // Stronger push
                        avoid.add(new THREE.Vector3().subVectors(officer.position, p.position).normalize().multiplyScalar(strength));
                        avoidCount++;
                    }
                }
            });
            if (avoidCount > 0) {
                avoid.divideScalar(avoidCount);
                avoid.multiplyScalar(CONFIG.POLICE_MOVE_SPEED * 3.5);
                toTarget.add(avoid);
            }
            // If very close to target, allow gentle push through
            if (dist < 2.5) {
                toTarget.multiplyScalar(1.7);
            }
            // Increase speed when arresting
            const arrestSpeed = CONFIG.POLICE_MOVE_SPEED * 2.7;
            if (dist > 0.1) {
                toTarget.normalize().multiplyScalar(arrestSpeed);
                toTarget.y = 0;
                officer.userData.velocity.copy(toTarget);
            } else {
                officer.userData.velocity.set(0, 0, 0);
            }
        }
        // Adaptive arrest timeout: longer if many protestors are nearby
        if (officer.userData.state === 'arresting' && officer.userData.arrestTarget) {
            const t = officer.userData.arrestTarget;
            let nearbyProtestors = 0;
            protestors.forEach(p => {
                if (p !== t && !p.userData.isArrested && !p.userData.isBeingTransported) {
                    if (officer.position.distanceTo(p.position) < 10) nearbyProtestors++;
                }
            });
            // Base timeout is 5s, add 0.5s per nearby protestor (max 10s)
            const adaptiveTimeout = Math.min(10, 5 + 0.5 * nearbyProtestors);
            if (!officer.userData._arrestingTimer) officer.userData._arrestingTimer = 0;
            if (officer.userData._arrestingTimer > adaptiveTimeout) {
                // Timeout: reset state (same as before)
                if (t && t.userData.isBeingArrested) {
                    t.userData.isBeingArrested = false;
                    const dist = officer.position.distanceTo(t.position).toFixed(2);
                    const officerState = officer.userData.state;
                    const protestorState = JSON.stringify({
                        isArrested: t.userData.isArrested,
                        isBeingArrested: t.userData.isBeingArrested,
                        isBeingTransported: t.userData.isBeingTransported,
                        isJailed: t.userData.isJailed
                    });
                    const protestorMoving = t.userData.velocity && t.userData.velocity.length() > 0.1;
                    console.warn('[OFFICER TIMEOUT]', shortId(officer.uuid), 'cleared protestor', shortId(t.uuid), '| dist:', dist, '| officerState:', officerState, '| protestorState:', protestorState, '| protestorMoving:', protestorMoving, '| officerPos:', officer.position.toArray(), '| protestorPos:', t.position.toArray());
                }
                officer.userData.state = 'patrolling';
                officer.userData.arrestTarget = null;
                officer.userData.patrolTarget = crowdCenter.clone();
                officer.userData._arrestingTimer = 0;
                console.warn('[OFFICER TIMEOUT]', shortId(officer.uuid), 'reset to patrolling');
            }
        }
        // Integrate position for smooth movement
        officer.position.addScaledVector(officer.userData.velocity, deltaTime);
        // Keep Y at correct height
        officer.position.y = ENTITY_Y_POSITIONS.OFFICER;
    });

    // Move officers toward their patrol targets
    police.forEach(officer => {
        if (officer.userData.patrolTarget) {
            const toTarget = new THREE.Vector3().subVectors(officer.userData.patrolTarget, officer.position);
            if (toTarget.length() > 2) {
                toTarget.normalize().multiplyScalar(CONFIG.POLICE_MOVE_SPEED);
                officer.userData.velocity.add(toTarget);
            }
        }
    });

    // Repulsion force between officers
    for (let i = 0; i < police.length; i++) {
        for (let j = i + 1; j < police.length; j++) {
            const a = police[i];
            const b = police[j];
            const minDist = 2.5;
            const delta = new THREE.Vector3().subVectors(a.position, b.position);
            const dist = delta.length();
            if (dist < minDist && dist > 0.01) {
                const push = delta.normalize().multiplyScalar((minDist - dist) * 0.3);
                a.position.add(push);
                b.position.sub(push);
            }
        }
    }
    // Hard collision with building for officers
    const buildingCenter = new THREE.Vector3(-50, 0, -50);
    const buildingRadius = 35;
    police.forEach(officer => {
        const distToBuilding = officer.position.distanceTo(buildingCenter);
        if (distToBuilding < buildingRadius + 2) {
            const repulse = new THREE.Vector3().subVectors(officer.position, buildingCenter).normalize().multiplyScalar((buildingRadius + 2 - distToBuilding) * 2.5);
            officer.position.add(repulse);
            officer.userData.velocity.add(repulse.multiplyScalar(0.2));
        }
        // Stuck detection: if not moving for several frames, forcibly reset
        if (!officer.userData._stuckFrames) officer.userData._stuckFrames = 0;
        if (officer.userData.velocity.length() < 0.1) {
            officer.userData._stuckFrames++;
        } else {
            officer.userData._stuckFrames = 0;
        }
        if (officer.userData._stuckFrames > 30) {
            officer.userData.state = 'patrolling';
            officer.userData.arrestTarget = null;
            officer.userData.patrolTarget = crowdCenter.clone();
            console.warn('[OFFICER STUCK]', shortId(officer.uuid), 'reset to patrol');
        }
        // If arrest target is unreachable, reset and reassign
        if (officer.userData.state === 'arresting') {
            const t = officer.userData.arrestTarget;
            if (!t || t.userData.isJailed || t.userData.isBeingTransported || t.userData.isArrested) {
                officer.userData.state = 'patrolling';
                officer.userData.arrestTarget = null;
                officer.userData.patrolTarget = crowdCenter.clone();
                console.warn('[OFFICER LOST TARGET]', shortId(officer.uuid), 'reassigned to patrol');
            }
        }
        // Always have a patrol or arrest target
        if (officer.userData.state !== 'arresting' && !officer.userData.patrolTarget) {
            officer.userData.patrolTarget = crowdCenter.clone();
            officer.userData.state = 'patrolling';
            console.warn('Officer had no patrol target, assigning crowd center.');
        }
    });
}

export function getPolice() {
    return police;
}

export function createPolice(scene, count) {
    const police = [];
    if (!officerGeometry) officerGeometry = new THREE.CylinderGeometry(1.2, 1.2, 5, 16);
    if (!officerMaterial) officerMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < count; i++) {
        const officer = new THREE.Mesh(officerGeometry, officerMaterial.clone());
        // Grid spawn: spread out in a grid centered at (0,0)
        const depth = CONFIG.POLICE_RANK_DEPTH;
        const spacing = CONFIG.POLICE_LINE_SPACING;
        officer.position.x = CONFIG.POLICE_START_X + (i % depth) * spacing - (depth/2) * spacing;
        officer.position.y = ENTITY_Y_POSITIONS.OFFICER;
        officer.position.z = CONFIG.POLICE_START_Z + Math.floor(i / depth) * spacing - (Math.ceil(count/depth)/2) * spacing;
        
        // Add properties for simulation
        officer.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * CONFIG.POLICE_MOVE_SPEED,
            0,
            (Math.random() - 0.5) * CONFIG.POLICE_MOVE_SPEED
        );
        officer.userData.velocity = officer.velocity;
        officer.stamina = 100;
        officer.userData.state = 'patrolling';
        officer.arrestTarget = null;
        officer.arrestPartner = null;
        officer.arrestProgress = 0;
        officer.targetPosition = new THREE.Vector3();
        officer.scene = scene;  // Store scene reference for effects
        officer.lastDirectionChange = 0;
        officer.directionChangeInterval = Math.random() * 3000 + 2000; // Random interval between 2-5 seconds
        
        officer.formationPosition = new THREE.Vector3(
            CONFIG.POLICE_START_X + (i % CONFIG.POLICE_RANK_DEPTH) * CONFIG.POLICE_LINE_SPACING,
            ENTITY_Y_POSITIONS.OFFICER,
            CONFIG.POLICE_START_Z + Math.floor(i / CONFIG.POLICE_RANK_DEPTH) * CONFIG.POLICE_RANK_SPACING
        );
        
        scene.add(officer);
        police.push(officer);
        // console.log('Created officer', i, officer.position, officer.material.color.getHexString());
    }
    
    return police;
}

function createOfficer() {
    const officer = new THREE.Group();
    
    // Officer body
    const bodyGeometry = new THREE.CylinderGeometry(1, 1, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    officer.add(body);
    
    // Initialize position with proper Y coordinate
    officer.position.set(
        (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.8,
        ENTITY_Y_POSITIONS.OFFICER,
        (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.8
    );
    
    return officer;
}

function updateOfficerPosition(officer, deltaTime) {
    // Update position while maintaining Y coordinate
    officer.position.x += officer.velocity.x * deltaTime;
    officer.position.z += officer.velocity.z * deltaTime;
    officer.position.y = ENTITY_Y_POSITIONS.OFFICER; // Maintain correct height
    
    // Update rotation to face movement direction
    if (officer.velocity.lengthSq() > 0.01) {
        const targetRotation = Math.atan2(officer.velocity.x, officer.velocity.z);
        officer.rotation.y = targetRotation;
    }
}

function updateOfficerPatrol(officer, deltaTime) {
    if (!officer.userData.patrolTimer) officer.userData.patrolTimer = 0;
    officer.userData.patrolTimer += deltaTime;
    if (officer.userData.patrolTimer > 2.5 + Math.random() * 2) { // More frequent
        assignRandomPatrolTarget(officer);
        officer.userData.patrolTimer = 0;
    }
    // Add more random wandering
    if (officer.userData.state === 'patrolling') {
        officer.position.x += (Math.random() - 0.5) * 0.8;
        officer.position.z += (Math.random() - 0.5) * 0.8;
    }
}
