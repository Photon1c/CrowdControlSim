import * as THREE from 'three';
import { CONFIG } from './config.js';
import { ENTITY_Y_POSITIONS } from './world.js';

const DAMPING = 0.88; // Lower damping for more movement
const MIN_SPEED = 0.01; // Minimum speed threshold
const SEPARATION_MULT = 0.7; // Stronger separation
const COHESION_MULT = 0.06; // Stronger cohesion
const ALIGNMENT_MULT = 0.18; // Stronger alignment

let protestorTarget = null;
let protestorTargetAngle = 0;
let protestorGeometry = null;
let protestorMaterial = null;

export function createProtestors(scene, count) {
    const protestors = [];
    if (!protestorGeometry) protestorGeometry = new THREE.SphereGeometry(2.0, 32, 32);
    if (!protestorMaterial) protestorMaterial = new THREE.MeshStandardMaterial({ color: 0xff8c00, roughness: 0.7, metalness: 0.3 });
    
    // Calculate grid dimensions for initial placement
    const density = CONFIG.PROTESTOR_DENSITY;
    const rows = Math.ceil(Math.sqrt(count * CONFIG.PROTESTOR_SPREAD_Z / CONFIG.PROTESTOR_SPREAD_X));
    const cols = Math.ceil(count / rows);
    
    for (let i = 0; i < count; i++) {
        const protestor = new THREE.Mesh(protestorGeometry, protestorMaterial.clone());
        
        // Calculate grid position
        const row = Math.floor(i / cols);
        const col = i % cols;
        
        // Add slight randomization to make it look more natural
        const randomX = (Math.random() - 0.5) * density;
        const randomZ = (Math.random() - 0.5) * density;
        
        // Position in grid with offset from center
        protestor.position.x = CONFIG.PROTESTOR_START_X + 
            (col - cols/2) * density * 2 + randomX * 2;
        protestor.position.y = 0.5;
        protestor.position.z = CONFIG.PROTESTOR_START_Z + 
            (row - rows/2) * density * 2 + randomZ * 2;
        
        // Add properties for simulation
        protestor.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * CONFIG.PROTESTOR_MOVE_SPEED * 0.5, // Reduced initial velocity
            0,
            (Math.random() - 0.5) * CONFIG.PROTESTOR_MOVE_SPEED * 0.5
        );
        protestor.userData.acceleration = new THREE.Vector3();
        protestor.userData.stamina = 100;
        protestor.userData.isArrested = false;
        protestor.userData.isBeingArrested = false;
        protestor.userData.fleeTarget = null;
        protestor.userData.lastDirectionChange = 0;
        protestor.userData.directionChangeInterval = Math.random() * 2000 + 1000;
        protestor.userData.groupCohesion = Math.random() * 0.5 + 0.5; // Random value between 0.5 and 1.0
        
        scene.add(protestor);
        protestors.push(protestor);
    }
    
    // Add invisible moving target
    if (!protestorTarget) {
        const targetGeometry = new THREE.SphereGeometry(1, 8, 8);
        const targetMaterial = new THREE.MeshBasicMaterial({ visible: false });
        protestorTarget = new THREE.Mesh(targetGeometry, targetMaterial);
        protestorTarget.position.set(CONFIG.PROTESTOR_START_X + 10, 0.5, CONFIG.PROTESTOR_START_Z);
        scene.add(protestorTarget);
    }
    
    return protestors;
}

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

export function updateProtestors(protestors, police, vans, deltaTime) {
    // Debug: Count protestor states
    let normal = 0, arrested = 0, beingArrested = 0, jailed = 0;
    protestors.forEach(p => {
        if (p.userData.isJailed) jailed++;
        else if (p.userData.isArrested) arrested++;
        else if (p.userData.isBeingArrested) beingArrested++;
        else normal++;
    });
    if (window && window.DEBUG_PROTESTOR_LOG !== false) {
        if (!window._lastProtestorLog || performance.now() - window._lastProtestorLog > 2000) {
            console.log(`Protestors: normal=${normal}, arrested=${arrested}, beingArrested=${beingArrested}, jailed=${jailed}`);
            window._lastProtestorLog = performance.now();
        }
    }
    
    // Limit deltaTime to prevent physics explosions
    const safeDeltaTime = Math.min(deltaTime, 0.1);
    
    // Move the invisible target around the central building in a circle
    if (protestorTarget) {
        // More dynamic movement - move target between building and police formation
        protestorTargetAngle += safeDeltaTime * 0.35; // Faster movement (was 0.2)
        
        // Get police centroid position
        let policeCentroidX = 0, policeCentroidZ = 0;
        let activePolice = 0;
        
        police.forEach(officer => {
            if (officer.userData.state === 'patrolling') {
                policeCentroidX += officer.position.x;
                policeCentroidZ += officer.position.z;
                activePolice++;
            }
        });
        
        if (activePolice > 0) {
            policeCentroidX /= activePolice;
            policeCentroidZ /= activePolice;
        }
        
        // Building position
        const buildingX = -50;
        const buildingZ = -50;
        
        // Oscillate between building and police formation
        const oscillation = (Math.sin(protestorTargetAngle) + 1) / 2; // 0 to 1
        const targetX = buildingX + (policeCentroidX - buildingX) * oscillation * 0.7;
        const targetZ = buildingZ + (policeCentroidZ - buildingZ) * oscillation * 0.7;
        
        // Add some circular movement
        const orbitRadius = 60 + oscillation * 30; // Larger, more variable radius
        protestorTarget.position.x = targetX + orbitRadius * Math.cos(protestorTargetAngle * 2.0);
        protestorTarget.position.z = targetZ + orbitRadius * Math.sin(protestorTargetAngle * 2.0);
    }
    
    // Calculate center of mass and average velocity of protestor group
    const centerOfMass = new THREE.Vector3();
    const crowdVelocity = new THREE.Vector3();
    let activeProtestors = 0;
    protestors.forEach(p => {
        if (!p.userData.isArrested && !p.userData.isBeingArrested) {
            centerOfMass.add(p.position);
            // Only add valid velocities to avoid NaN propagation
            if (!sanitizeVector(p.userData.velocity, CONFIG.PROTESTOR_SPRINT_SPEED * 2)) {
                crowdVelocity.add(p.userData.velocity);
            }
            activeProtestors++;
        }
    });
    if (activeProtestors > 0) {
        centerOfMass.divideScalar(activeProtestors);
        crowdVelocity.divideScalar(activeProtestors);
    }
    
    // Sanitize crowd velocity to prevent NaN propagation
    sanitizeVector(crowdVelocity, CONFIG.PROTESTOR_SPRINT_SPEED);
    
    const MAP_RADIUS = CONFIG.WORLD_SIZE / 2 - 10;
    const MAP_CENTER = new THREE.Vector3(0, 0, 0);
    
    protestors.forEach(protestor => {
        // Reset acceleration at the start of each frame
        protestor.userData.acceleration = new THREE.Vector3(0, 0, 0);
        
        // Handle jailed prisoners separately - they walk deeper into prison
        if (protestor.userData.isJailed) {
            // Apply movement
            protestor.userData.velocity.multiplyScalar(0.88); // Less damping for more active movement
            
            // Add small random movement for jailed prisoners
            protestor.userData.velocity.add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                0,
                (Math.random() - 0.5) * 0.5
            ));
            
            // Limit speed for jailed prisoners
            const maxSpeed = protestor.userData.hasReachedTarget ? 2.5 : 2.0;
            if (protestor.userData.velocity.length() > maxSpeed) {
                protestor.userData.velocity.setLength(maxSpeed);
            }
            
            // Check for invalid velocity
            sanitizeVector(protestor.userData.velocity, maxSpeed * 2);
            
            const movement = protestor.userData.velocity.clone().multiplyScalar(safeDeltaTime);
            protestor.position.add(movement);
            protestor.position.y = 1; // Keep at proper height
            
            return; // Skip normal protestor logic
        }
        
        if (protestor.userData.isArrested || protestor.userData.isBeingArrested) {
            protestor.material.color.setHSL(0.0, 0.8, 0.3); // Dark red
            protestor.userData.velocity.set(0, 0, 0);
            return;
        }
        
        // Flocking: separation, cohesion, alignment
        // Separation (stronger)
        const separation = new THREE.Vector3();
        let neighbors = 0;
        protestors.forEach(other => {
            if (other !== protestor && !other.userData.isArrested && !other.userData.isBeingArrested) {
                const dist = protestor.position.distanceTo(other.position);
                if (dist < 10) {
                    const away = new THREE.Vector3().subVectors(protestor.position, other.position);
                    away.normalize().divideScalar(Math.max(0.1, dist));
                    separation.add(away);
                    neighbors++;
                }
            }
        });
        if (neighbors > 0) separation.divideScalar(neighbors);
        separation.multiplyScalar(SEPARATION_MULT); // Stronger separation force
        protestor.userData.acceleration.add(separation);
        
        // Cohesion (move toward center of mass)
        const cohesion = new THREE.Vector3().subVectors(centerOfMass, protestor.position).multiplyScalar(COHESION_MULT); // Stronger
        protestor.userData.acceleration.add(cohesion);
        
        // Alignment (match crowd velocity)
        const alignment = new THREE.Vector3().copy(crowdVelocity).multiplyScalar(ALIGNMENT_MULT); // Stronger
        protestor.userData.acceleration.add(alignment);
        
        // IMPROVED: More active engagement with police
        // Calculate the police centroid
        let policeCentroid = new THREE.Vector3();
        let activePoliceCount = 0;
        police.forEach(officer => {
            if (officer.userData.state === 'patrolling') {
                policeCentroid.add(officer.position);
                activePoliceCount++;
            }
        });
        if (activePoliceCount > 0) {
            policeCentroid.divideScalar(activePoliceCount);
            
            // Distance to police formation
            const distToPolice = protestor.position.distanceTo(policeCentroid);
            
            // Protestors should approach police but maintain a safe distance
            const idealPoliceDistance = 30; // Closer engagement distance
            
            if (distToPolice > idealPoliceDistance + 20) {
                // Too far from police - move closer
                const toPolice = new THREE.Vector3().subVectors(policeCentroid, protestor.position);
                toPolice.y = 0;
                toPolice.normalize().multiplyScalar(0.15); // Stronger pull toward police
                protestor.userData.acceleration.add(toPolice);
            } else if (distToPolice < idealPoliceDistance - 10) {
                // Too close to police - back away
                const fromPolice = new THREE.Vector3().subVectors(protestor.position, policeCentroid);
                fromPolice.y = 0;
                fromPolice.normalize().multiplyScalar(0.2); // Strong push away from police
                protestor.userData.acceleration.add(fromPolice);
            }
        }
        
        // IMPROVED: Dynamic target following based on crowd position
        if (protestorTarget) {
            // Calculate how much to follow the target based on distance from crowd center
            const distFromCenter = protestor.position.distanceTo(centerOfMass);
            const maxCenterDist = 50; // Maximum expected distance from center
            const targetWeight = Math.min(distFromCenter / maxCenterDist, 1) * 0.2; // 0-0.2 based on distance
            
            const toTarget = new THREE.Vector3().subVectors(protestorTarget.position, protestor.position);
            toTarget.y = 0;
            toTarget.normalize().multiplyScalar(targetWeight);
            protestor.userData.acceleration.add(toTarget);
        }
        
        // REDESIGNED: Half-moon pacing around building
        const buildingCenter = new THREE.Vector3(-50, 0, -50);
        const fromBuilding = new THREE.Vector3().subVectors(protestor.position, buildingCenter);
        fromBuilding.y = 0;
        const angle = Math.atan2(fromBuilding.z, fromBuilding.x);
        let policeCenter = new THREE.Vector3();
        police.forEach(officer => {
            if (officer.userData.state === 'patrolling') {
                policeCenter.add(officer.position);
            }
        });
        if (activePoliceCount > 0) {
            policeCenter.divideScalar(activePoliceCount);
            const toPolice = new THREE.Vector3().subVectors(policeCenter, buildingCenter);
            const policeAngle = Math.atan2(toPolice.z, toPolice.x);
            const targetAngle = policeAngle + Math.PI;
            const halfMoonSpan = Math.PI * 0.8;
            let angleDiff = ((angle - targetAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            let pacingForce = new THREE.Vector3();
            if (Math.abs(angleDiff) > halfMoonSpan / 2) {
                const targetPoint = new THREE.Vector3(
                    buildingCenter.x + Math.cos(targetAngle + Math.sign(angleDiff) * halfMoonSpan / 2) * 60,
                    0,
                    buildingCenter.z + Math.sin(targetAngle + Math.sign(angleDiff) * halfMoonSpan / 2) * 60
                );
                pacingForce = new THREE.Vector3().subVectors(targetPoint, protestor.position).normalize().multiplyScalar(0.3);
            } else {
                const tangent = new THREE.Vector3(-fromBuilding.z, 0, fromBuilding.x).normalize().multiplyScalar(0.5);
                const outward = fromBuilding.clone().normalize().multiplyScalar(0.15);
                pacingForce = tangent.add(outward);
            }
            protestor.userData.acceleration.add(pacingForce);
        }
        // Add small random variation
        protestor.userData.acceleration.add(
            new THREE.Vector3(
                (Math.random() - 0.5) * 1.2, // More random jitter
                0,
                (Math.random() - 0.5) * 1.2
            )
        );
        // Threat/flee logic (unchanged)
        let threatLevel = 0;
        let nearestOfficer = null;
        let nearestDistance = Infinity;
        police.forEach(officer => {
            if (officer.userData.state !== 'patrolling') return;
            const distance = protestor.position.distanceTo(officer.position);
            if (distance < CONFIG.FLEE_DISTANCE) {
                threatLevel += 1 - (distance / CONFIG.FLEE_DISTANCE);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestOfficer = officer;
                }
            }
        });
        // Flee from police
        if (threatLevel > 0 && nearestOfficer) {
            const away = new THREE.Vector3().subVectors(protestor.position, nearestOfficer.position).normalize().multiplyScalar(threatLevel * 0.5);
            protestor.userData.acceleration.add(away);
        }
        
        // Van avoidance: if a van is close and in pickup/full state, move away
        vans.forEach(van => {
            const isPriorityVan = (van.state === 'pickup' || van.occupants.length >= van.maxCapacity);
            if (isPriorityVan) {
                const delta = new THREE.Vector3().subVectors(protestor.position, van.position);
                const dist = delta.length();
                if (dist < 18 && dist > 0.01) { // Larger avoidance radius
                    const push = delta.normalize().multiplyScalar((18 - dist) * 1.2); // Stronger push
                    protestor.position.add(push);
                    protestor.userData.velocity && protestor.userData.velocity.add(push.multiplyScalar(0.3));
                    if (Math.random() < 0.01) console.warn('Protestor forcibly moved by van.');
                }
            }
        });
        
        // Officer avoidance: always avoid officers within 10 units
        police.forEach(officer => {
            const dist = protestor.position.distanceTo(officer.position);
            if (dist < 10) {
                const away = new THREE.Vector3().subVectors(protestor.position, officer.position).normalize().multiplyScalar((10 - dist) * 0.7);
                protestor.userData.acceleration.add(away);
            }
        });
        
        // Check for invalid acceleration before applying
        sanitizeVector(protestor.userData.acceleration, CONFIG.PROTESTOR_MOVE_SPEED);
        
        // Apply damping to current velocity
        protestor.userData.velocity.multiplyScalar(DAMPING);
        
        // Apply acceleration with reduced multiplier
        protestor.userData.velocity.add(protestor.userData.acceleration.multiplyScalar(safeDeltaTime));
        
        // Limit speed to more reasonable values
        const maxSpeed = CONFIG.PROTESTOR_SPRINT_SPEED;
        if (protestor.userData.velocity.length() > maxSpeed) {
            protestor.userData.velocity.setLength(maxSpeed);
        }
        if (protestor.userData.velocity.length() < MIN_SPEED && protestor.userData.velocity.length() > 0) {
            protestor.userData.velocity.setLength(MIN_SPEED);
        }
        
        // Check for invalid velocity
        sanitizeVector(protestor.userData.velocity, maxSpeed);
        
        // Apply movement with safety check
        const movement = protestor.userData.velocity.clone().multiplyScalar(safeDeltaTime);
        protestor.position.add(movement);
        
        // Keep y position at ground level
        protestor.position.y = 0.5;
        
        // Update color based on state
        const staminaRatio = protestor.userData.stamina / 100;
        const speedRatio = protestor.userData.velocity.length() / CONFIG.PROTESTOR_SPRINT_SPEED;
        const threatRatio = Math.min(1, threatLevel);
        const hue = 0.08 - (threatRatio * 0.08);
        const saturation = 0.5 + speedRatio * 0.5;
        const lightness = 0.3 + staminaRatio * 0.4;
        protestor.material.color.setHSL(hue, saturation, lightness);
        
        // Add small random jitter to keep crowd lively (increase amplitude)
        protestor.userData.velocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 2.0,
            0,
            (Math.random() - 0.5) * 2.0
        ));
        
        // Only steer back if near map edge
        if (protestor.position.distanceTo(MAP_CENTER) > MAP_RADIUS) {
            const toCenter = new THREE.Vector3().subVectors(MAP_CENTER, protestor.position).normalize().multiplyScalar(1.2);
            protestor.userData.velocity.add(toCenter);
        }
        
        // Prevent protestors from entering the building
        const buildingRadius = 35;
        const distToBuilding = protestor.position.distanceTo(buildingCenter);
        if (distToBuilding < buildingRadius + 2) {
            const repulse = new THREE.Vector3().subVectors(protestor.position, buildingCenter).normalize().multiplyScalar((buildingRadius + 2 - distToBuilding) * 2.5);
            protestor.position.add(repulse);
        }
        
        // Arrest timeout logic
        if (protestor.userData.isBeingArrested) {
            if (!protestor.userData._beingArrestedTimer) protestor.userData._beingArrestedTimer = 0;
            protestor.userData._beingArrestedTimer += deltaTime;
            if (protestor.userData._beingArrestedTimer > 5) {
                protestor.userData.isArrested = true;
                protestor.userData.isBeingArrested = false;
                protestor.userData._beingArrestedTimer = 0;
                console.warn('Protestor', protestor.uuid, 'was beingArrested too long, forcibly set to arrested.');
            }
        } else {
            protestor.userData._beingArrestedTimer = 0;
        }
    });
    
    // Sphere-sphere collision response for bumping
    for (let i = 0; i < protestors.length; i++) {
        for (let j = i + 1; j < protestors.length; j++) {
            const a = protestors[i];
            const b = protestors[j];
            if (a.userData.isArrested || a.userData.isBeingArrested || b.userData.isArrested || b.userData.isBeingArrested) continue;
            const minDist = 4.0; // 2*radius
            const delta = new THREE.Vector3().subVectors(a.position, b.position);
            const dist = delta.length();
            if (dist < minDist && dist > 0.01) {
                const push = delta.normalize().multiplyScalar((minDist - dist) * 0.5);
                a.position.add(push);
                b.position.sub(push);
            }
        }
    }
}

function updateProtestorMovement(protestor, deltaTime, buildings, police) {
    if (protestor.userData.isArrested || protestor.userData.isBeingTransported || protestor.userData.isJailed) {
        return;
    }
    
    // Initialize or update movement parameters
    if (!protestor.userData.movementParams) {
        protestor.userData.movementParams = {
            baseSpeed: 0.3 + Math.random() * 0.4,
            wanderAngle: Math.random() * Math.PI * 2,
            wanderRadius: 10 + Math.random() * 10,
            lastDirectionChange: 0,
            flowDirection: Math.random() < 0.5 ? 1 : -1
        };
    }
    
    const params = protestor.userData.movementParams;
    const buildingCenter = new THREE.Vector3(-50, 0, -50);
    const distToBuilding = protestor.position.distanceTo(buildingCenter);
    
    // Dynamic safety radius based on crowd density
    const nearbyProtestors = countNearbyProtestors(protestor, protestors);
    const safetyRadius = 40 + Math.min(20, nearbyProtestors * 2);
    
    // Calculate base movement
    let movement = new THREE.Vector3();
    
    // Update wander behavior
    params.lastDirectionChange += deltaTime;
    if (params.lastDirectionChange > 2.0) {
        params.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.5;
        params.lastDirectionChange = 0;
    }
    
    // Calculate flow movement around building
    const toBuilding = new THREE.Vector3().subVectors(protestor.position, buildingCenter);
    toBuilding.y = 0;
    const angle = Math.atan2(toBuilding.z, toBuilding.x);
    
    // Dynamic flow speed based on distance to building
    const flowSpeed = params.baseSpeed * (1.0 + Math.min(1.0, Math.max(0, (distToBuilding - safetyRadius) / 30)));
    
    // Calculate tangential direction for flow
    const tangent = new THREE.Vector3(-toBuilding.z, 0, toBuilding.x).normalize();
    tangent.multiplyScalar(params.flowDirection);
    
    // Blend between flow and wander based on distance
    const flowInfluence = Math.max(0, Math.min(1, 1.5 - distToBuilding / safetyRadius));
    const wanderInfluence = 1 - flowInfluence;
    
    // Add flow movement
    movement.add(tangent.multiplyScalar(flowSpeed * flowInfluence));
    
    // Add wander movement
    const wanderDir = new THREE.Vector3(
        Math.cos(params.wanderAngle),
        0,
        Math.sin(params.wanderAngle)
    );
    movement.add(wanderDir.multiplyScalar(params.baseSpeed * wanderInfluence));
    
    // Avoid other protestors
    const separation = calculateSeparation(protestor, protestors);
    movement.add(separation);
    
    // Avoid police with variable radius
    const policeAvoidance = calculatePoliceAvoidance(protestor, police);
    movement.add(policeAvoidance);
    
    // Apply building avoidance
    if (distToBuilding < safetyRadius) {
        const avoidance = toBuilding.clone().normalize();
        const strength = Math.pow((safetyRadius - distToBuilding) / safetyRadius, 2);
        movement.add(avoidance.multiplyScalar(strength * params.baseSpeed * 2));
    }
    
    // Update position with smoothing
    protestor.position.add(movement.multiplyScalar(deltaTime));
}

function countNearbyProtestors(protestor, protestors) {
    const NEIGHBOR_RADIUS = 20;
    return protestors.filter(p => 
        p !== protestor && 
        !p.userData.isArrested && 
        !p.userData.isBeingTransported &&
        p.position.distanceTo(protestor.position) < NEIGHBOR_RADIUS
    ).length;
}

function calculateSeparation(protestor, protestors) {
    const SEPARATION_RADIUS = 15;
    const separation = new THREE.Vector3();
    let count = 0;
    
    protestors.forEach(other => {
        if (other !== protestor && !other.userData.isArrested && !other.userData.isBeingTransported) {
            const distance = protestor.position.distanceTo(other.position);
            if (distance < SEPARATION_RADIUS) {
                const avoidance = new THREE.Vector3()
                    .subVectors(protestor.position, other.position)
                    .normalize()
                    .multiplyScalar(1 - distance / SEPARATION_RADIUS);
                separation.add(avoidance);
                count++;
            }
        }
    });
    
    if (count > 0) {
        separation.divideScalar(count);
        separation.multiplyScalar(protestor.userData.movementParams.baseSpeed);
    }
    
    return separation;
}

function calculatePoliceAvoidance(protestor, police) {
    const avoidance = new THREE.Vector3();
    const BASE_AVOID_RADIUS = 30;
    let count = 0;
    
    police.forEach(officer => {
        if (!officer.userData.isStuck) {
            const distance = protestor.position.distanceTo(officer.position);
            // Dynamic avoidance radius based on officer state
            const avoidRadius = officer.userData.state === 'arresting' ? 
                BASE_AVOID_RADIUS * 1.5 : BASE_AVOID_RADIUS;
                
            if (distance < avoidRadius) {
                const toOfficer = new THREE.Vector3().subVectors(officer.position, protestor.position);
                const strength = Math.pow((avoidRadius - distance) / avoidRadius, 2);
                
                // Add both direct avoidance and perpendicular component
                const direct = toOfficer.clone().normalize().multiplyScalar(-strength);
                const perp = new THREE.Vector3(-direct.z, 0, direct.x).multiplyScalar(strength * 0.5);
                
                avoidance.add(direct).add(perp);
                count++;
            }
        }
    });
    
    if (count > 0) {
        avoidance.divideScalar(count);
        avoidance.multiplyScalar(protestor.userData.movementParams.baseSpeed * 2);
    }
    
    return avoidance;
}

// Helper to set protestor state and log
function setProtestorState(protestor, state) {
    Object.assign(protestor.userData, state);
    console.log('Protestor', protestor.uuid, 'state:', JSON.stringify(state));
}

// In van pickup logic (called from vans.js):
export function pickupProtestorForVan(protestor) {
    setProtestorState(protestor, {
        isBeingTransported: true,
        isBeingArrested: false
    });
    protestor.visible = false;
    console.log('Protestor', protestor.uuid, 'picked up by van.');
}

// In van dropoff logic (called from vans.js):
export function dropoffProtestorAtPrison(protestor) {
    setProtestorState(protestor, {
        isBeingTransported: false,
        isJailed: true,
        isArrested: false,
        isBeingArrested: false
    });
    // Make the protestor visible and moving
    protestor.visible = true;
    // Give a random velocity so they start walking
    protestor.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2
    );
    // Increment global jailed count and update HUD
    if (!window._jailedCount) window._jailedCount = 0;
    window._jailedCount++;
    if (window.hud && typeof window.hud.updatePrisonCapacity === 'function') {
        window.hud.updatePrisonCapacity(window._jailedCount);
    }
    // Place at a random position in the new prison area (for possible future visuals)
    const minX = CONFIG.PRISON_JAIL_MIN_X;
    const maxX = CONFIG.PRISON_JAIL_MAX_X;
    const minZ = CONFIG.PRISON_JAIL_MIN_Z;
    const maxZ = CONFIG.PRISON_JAIL_MAX_Z;
    const jailX = minX + Math.random() * (maxX - minX);
    const jailZ = minZ + Math.random() * (maxZ - minZ);
    protestor.position.set(jailX, 2, jailZ);
    console.log('Protestor', protestor.uuid, 'dropped off at prison. Jailed count:', window._jailedCount, 'at', jailX.toFixed(2), jailZ.toFixed(2));
} 