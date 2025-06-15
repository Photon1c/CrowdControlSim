import * as THREE from 'three';
import { CONFIG } from './config.js';
import { ENTITY_Y_POSITIONS } from './world.js';
import { formationAdvanceX } from './police.js';
import { pickupProtestorForVan, dropoffProtestorAtPrison } from './protestors.js';

// Van states for better state management
export const VAN_STATES = {
    PATROLLING: 'patrolling',
    PICKUP: 'pickup',
    TRANSPORTING: 'transporting',
    EXTRACTING: 'extracting',
    RETURNING: 'returning',
    FORMATION: 'formation'
};

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

let vanGeometry = null;
let vanMaterial = null;

export function createVans(scene, count, police) {
    const vans = [];
    if (!vanGeometry) vanGeometry = new THREE.BoxGeometry(12, 8, 16);
    if (!vanMaterial) vanMaterial = new THREE.MeshStandardMaterial({ color: 0x000080, roughness: 0.2, metalness: 0.9 });
    
    // Place vans behind the last rank of police
    let minX = Infinity;
    if (police && police.length > 0) {
        police.forEach(officer => {
            if (officer.position.x < minX) minX = officer.position.x;
        });
    } else {
        minX = CONFIG.POLICE_START_X - CONFIG.POLICE_RANK_SPACING * CONFIG.POLICE_RANK_DEPTH;
    }
    
    const vanStartX = CONFIG.POLICE_START_X - 30; // Place vans behind police
    for (let i = 0; i < count; i++) {
        const van = new THREE.Mesh(vanGeometry, vanMaterial.clone());
        
        // Stagger vans along z axis with more spacing to prevent wobbling
        const vanSpacing = 40; // Increased spacing from 35 to 40 for better separation
        van.position.x = vanStartX;
        van.position.y = 4; // Centered vertically for 8 height
        van.position.z = CONFIG.VAN_START_Z + (i - (count-1)/2) * vanSpacing; // More spacing
        
        // Add properties for simulation
        van.velocity = new THREE.Vector3();
        van.occupants = [];
        van.maxCapacity = CONFIG.VAN_CAPACITY;
        van.state = VAN_STATES.PATROLLING;
        van.targetPosition = van.position.clone();
        van.stateTimer = 0; // Track time in current state
        van.lastPickupTime = performance.now();
        van.pickupTarget = null; // Current pickup target
        van.scene = scene; // CRITICAL: Store scene reference for prisoner management
        
        // Create capacity indicator
        const barGeometry = new THREE.BoxGeometry(2.5, 0.2, 0.2);
        const barMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        van.capacityBar = new THREE.Mesh(barGeometry, barMaterial);
        van.capacityBar.position.y = 2.5;
        van.add(van.capacityBar);
        
        // Add siren lights on the front edge
        const sirenGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.3);
        
        // Left siren (red)
        const leftSirenMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9
        });
        van.leftSiren = new THREE.Mesh(sirenGeometry, leftSirenMaterial);
        van.leftSiren.position.set(-4, 5, 7); // Higher Y
        van.add(van.leftSiren);
        
        // Right siren (blue)
        const rightSirenMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0000ff,
            emissive: 0x0000ff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9
        });
        van.rightSiren = new THREE.Mesh(sirenGeometry, rightSirenMaterial);
        van.rightSiren.position.set(4, 5, 7); // Higher Y
        van.add(van.rightSiren);
        
        // Initialize siren animation properties
        van.sirenTime = Math.random() * Math.PI * 2; // Random start phase
        
        // Make siren lights larger and more visible
        van.leftSiren.scale.set(1.7, 1.7, 1.7);
        van.rightSiren.scale.set(1.7, 1.7, 1.7);
        
        scene.add(van);
        vans.push(van);
    }
    
    return vans;
}

export function updateVans(vans, police, protestors, deltaTime, scene) {
    // Limit deltaTime to prevent physics explosions
    const safeDeltaTime = Math.min(deltaTime, 0.1);
    
    // Compute the centroid of all police officers for van following logic
    let centroidX = 0, centroidZ = 0;
    let activePoliceCount = 0;
    
    police.forEach(officer => {
        // Only count patrolling officers for centroid calculation
        if (officer.userData.state === 'patrolling') {
            // Validate officer positions to prevent NaN propagation
            if (isNaN(officer.position.x) || isNaN(officer.position.z)) {
                console.warn('Officer has invalid position, resetting');
                officer.position.x = 0;
                officer.position.z = 0;
            } else {
                centroidX += officer.position.x;
                centroidZ += officer.position.z;
                activePoliceCount++;
            }
        }
    });
    
    if (activePoliceCount > 0) {
        centroidX /= activePoliceCount;
        centroidZ /= activePoliceCount;
    } else {
        // Default positions when no active police
        centroidX = 0;
        centroidZ = 0;
    }
    
    // Validate centroid
    if (isNaN(centroidX) || isNaN(centroidZ)) {
        console.warn('Centroid calculation resulted in NaN, using defaults');
        centroidX = 0;
        centroidZ = 0;
    }
    
    vans.forEach((van, i) => {
        // Validate van position before any calculations
        if (isNaN(van.position.x) || isNaN(van.position.y) || isNaN(van.position.z)) {
            console.warn(`Van ${i} has invalid position, resetting to origin`);
            van.position.set(0, 4, 0);
        }
        
        // Update state timer
        van.stateTimer += safeDeltaTime * 3;
        
        // Add inertia to van movement
        if (!van.userData.inertia) van.userData.inertia = new THREE.Vector3();
        van.userData.inertia.lerp(van.velocity, 0.6); // Smoother and faster
        van.velocity.copy(van.userData.inertia);
        
        // Stuck detection for all states
        if (!van._globalStuckFrames) van._globalStuckFrames = 0;
        if (van.velocity.length() < 0.2) {
            van._globalStuckFrames++;
        } else {
            van._globalStuckFrames = 0;
        }
        if (van._globalStuckFrames > 40) {
            // Nudge van forward in its current direction or toward target
            if (van.targetPosition) {
                const nudge = new THREE.Vector3().subVectors(van.targetPosition, van.position).normalize().multiplyScalar(2.5);
                van.velocity.add(nudge);
            } else {
                van.velocity.x += (Math.random() - 0.5) * 2;
                van.velocity.z += (Math.random() - 0.5) * 2;
            }
            van._globalStuckFrames = 0;
        }
        
        // If van is in PICKUP or full state, disable protestor repulsion and push protestors away
        const isPriorityVan = (van.state === VAN_STATES.PICKUP || van.occupants.length >= van.maxCapacity);
        if (isPriorityVan) {
            activelyPushProtestorsFromVan(van, protestors);
        } else {
            applyVanBuildingAndProtestorCollision(van, protestors);
        }
        // More aggressive stuck detection: 3 seconds
        if (!van._hardStuckFrames) van._hardStuckFrames = 0;
        if (van.velocity.length() < 0.1) {
            van._hardStuckFrames++;
        } else {
            van._hardStuckFrames = 0;
        }
        if (van._hardStuckFrames > 30) { // 3 seconds at 10fps
            // Find nearest arrested protestor
            const arrested = protestors.filter(p => p.userData.isArrested && !p.userData.isBeingTransported && !p.userData.isJailed);
            if (arrested.length > 0) {
                let closest = arrested[0];
                let minDist = van.position.distanceTo(closest.position);
                for (let j = 1; j < arrested.length; j++) {
                    const d = van.position.distanceTo(arrested[j].position);
                    if (d < minDist) {
                        minDist = d;
                        closest = arrested[j];
                    }
                }
                van.position.set(closest.position.x + 8, 4, closest.position.z + 8);
                van.velocity.set(0, 0, 0);
                van._hardStuckFrames = 0;
                console.warn('[VAN STUCK]', shortId(van.uuid), 'moved near', shortId(closest.uuid));
            } else {
                // Move to clear spot near prison entrance
                const prisonX = centroidX + 60;
                const prisonZ = centroidZ;
                van.position.set(prisonX, 4, prisonZ + (i - (vans.length-1)/2) * 18);
                van.velocity.set(0, 0, 0);
                van._hardStuckFrames = 0;
                console.warn('[VAN STUCK]', shortId(van.uuid), 'moved to prison entrance');
            }
        }
        
        // Universal van collision avoidance
        applyVanCollisionAvoidance(van, vans, protestors, i);
        
        // State machine logic
        updateVanState(van, vans, police, protestors, centroidX, centroidZ, i);

        // If van is in PICKUP state, run pickup logic
        if (van.state === VAN_STATES.PICKUP) {
            handlePickup(van, protestors, vans);
        }
        // --- FORCE FULL VANS TO PRISON ---
        if (van.occupants.length >= van.maxCapacity) {
            // Always set state to TRANSPORTING
            if (van.state !== VAN_STATES.TRANSPORTING && van.state !== VAN_STATES.EXTRACTING) {
                van.state = VAN_STATES.TRANSPORTING;
                van.pickupTarget = null;
            }
            // Set target directly to prison entrance
            const prisonTarget = new THREE.Vector3(CONFIG.PRISON_ENTRANCE_X, van.position.y, CONFIG.PRISON_ENTRANCE_Z);
            van.targetPosition = prisonTarget.clone();
            // Add strong direct velocity toward prison, overriding other movement
            const toPrison = new THREE.Vector3().subVectors(prisonTarget, van.position);
            if (toPrison.length() > 1) {
                toPrison.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 1.5);
                van.velocity.copy(toPrison);
            }
        }
        
        // Validate velocity before applying
        sanitizeVector(van.velocity, CONFIG.VAN_MOVE_SPEED * 2);
        
        // SIMPLIFIED VAN MOVEMENT: Reduce jitter with cleaner physics
        
        // Apply damping to reduce oscillation and jitter
        van.velocity.multiplyScalar(0.75); // Stronger damping (was 0.88)
        
        // Limit maximum speed based on van state and proximity to target
        let maxSpeed = CONFIG.VAN_MOVE_SPEED;
        
        // Slow down when close to target to prevent overshooting
        if (van.targetPosition) {
            const distToTarget = van.position.distanceTo(van.targetPosition);
            if (distToTarget < 20) {
                // Gradually reduce speed as we get closer to target
                maxSpeed = Math.max(CONFIG.VAN_MOVE_SPEED * 0.1, 
                                   CONFIG.VAN_MOVE_SPEED * (distToTarget / 20));
            }
        }
        
        // Adjust speed based on state
        if (van.state === 'pickup' || van.state === 'extracting') {
            maxSpeed = CONFIG.VAN_MOVE_SPEED * 1.2; // Slightly faster when on mission
        }
        
        if (van.velocity.length() > maxSpeed * 3) {
            van.velocity.setLength(maxSpeed * 3);
        }
        
        // Apply movement with smooth motion
        const movement = van.velocity.clone().multiplyScalar(safeDeltaTime * 3);
        
        // Check for invalid movement
        if (!isNaN(movement.x) && !isNaN(movement.y) && !isNaN(movement.z) &&
            Math.abs(movement.x) < 10 && Math.abs(movement.y) < 10 && Math.abs(movement.z) < 10) {
            van.position.add(movement);
        }
        
        // Validate position after movement
        if (isNaN(van.position.x) || isNaN(van.position.y) || isNaN(van.position.z)) {
            console.error(`Van ${i} position became NaN after movement, resetting`);
            van.position.set(0, 4, 0);
        }
        
        // Keep y position constant
        van.position.y = 4;
        
        // Move occupants with van - display prisoners around the van during transport
        van.occupants.forEach((protestor, index) => {
            // Arrange prisoners in a circle around the van
            const angle = (index / van.occupants.length) * Math.PI * 2;
            const radius = 8;
            const offsetX = Math.cos(angle) * radius;
            const offsetZ = Math.sin(angle) * radius;
            protestor.position.set(
                van.position.x + offsetX,
                van.position.y + 2,
                van.position.z + offsetZ
            );
            protestor.visible = true;
            // Visual indicator for transported
            if (!protestor.userData.wasTransportedBefore) {
                protestor.material.color.setHex(0xff9900);
                protestor.userData.wasTransportedBefore = true;
            }
        });
        
        // Update capacity bar
        const fillRatio = van.occupants.length / van.maxCapacity;
        van.capacityBar.scale.x = Math.max(0.1, fillRatio);
        van.capacityBar.material.color.setRGB(
            fillRatio > 0.5 ? 2 * (1 - fillRatio) : 1.0,
            fillRatio > 0.5 ? 1.0 : 2 * fillRatio,
            0
        );
        
        // Update siren lights
        van.sirenTime += safeDeltaTime * 5; // Faster siren animation
        const pulseIntensity = (Math.sin(van.sirenTime) + 1) / 2;
        van.leftSiren.material.opacity = 0.7 + pulseIntensity * 0.3;
        van.leftSiren.material.color.setRGB(1, 0.2 * pulseIntensity, 0);
        van.rightSiren.material.opacity = 0.7 + (1 - pulseIntensity) * 0.3;
        van.rightSiren.material.color.setRGB(0, 0.2 * (1 - pulseIntensity), 1);
        
        applyVanBuildingAndProtestorCollision(van, protestors);
        // If van is full, phase through protestors and move authoritatively toward exit
        if (van.occupants.length >= van.maxCapacity) {
            // Disable protestor repulsion for this van
            // Set velocity directly toward prison exit
            // (REMOVE the block below that resets van to PATROLLING and empties occupants)
            // Instead, just let the van state machine handle the transition to TRANSPORTING/EXTRACTING
            // and let the van be reset only after unloading at the prison.
            // (No code here, just let the rest of the updateVans logic run)
        }
        // --- STRICT QUEUEING FOR UNLOADING ---
        if (van.state === VAN_STATES.TRANSPORTING || van.state === VAN_STATES.EXTRACTING) {
            // Use new prison entrance and jail area
            const entranceX = CONFIG.PRISON_ENTRANCE_X;
            const entranceZ = CONFIG.PRISON_ENTRANCE_Z;
            const vanZOffset = (i - (vans.length-1)/2) * 16; // Wider spacing for larger entrance
            const unloadingSpot = new THREE.Vector3(entranceX - 12, 4, entranceZ + vanZOffset);
            // Find all vans in TRANSPORTING or EXTRACTING state, sort by distance to unloading spot
            const unloadingVans = vans.filter(v => v.state === VAN_STATES.TRANSPORTING || v.state === VAN_STATES.EXTRACTING);
            unloadingVans.sort((a, b) => a.position.distanceTo(unloadingSpot) - b.position.distanceTo(unloadingSpot));
            const queueIndex = unloadingVans.indexOf(van);
            const isFirstInQueue = queueIndex === 0;
            if (isFirstInQueue) {
                // Only first van allowed to enter unloading zone
                const insideUnloadingZone = (
                    van.position.x > entranceX - 24 && van.position.x < entranceX + 8 &&
                    van.position.z > CONFIG.PRISON_JAIL_MIN_Z && van.position.z < CONFIG.PRISON_JAIL_MAX_Z
                );
                if (insideUnloadingZone) {
                    if (van.state !== VAN_STATES.EXTRACTING) {
                        van.state = VAN_STATES.EXTRACTING;
                        van.stateTimer = 0;
                        console.warn('[VAN STATE]', shortId(van.uuid), 'entered EXTRACTING (queue head) at', van.position.x.toFixed(2), van.position.z.toFixed(2));
                    }
                    // Snap van to just inside the entrance for unloading
                    van.position.set(entranceX, 4, entranceZ + vanZOffset);
                    handleExtracting(van, vans, i);
                    return;
                } else {
                    // Move toward unloading spot
                    const toTarget = new THREE.Vector3().subVectors(unloadingSpot, van.position);
                    if (toTarget.length() > 2) {
                        toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
                        van.velocity.add(toTarget);
                    }
                    console.log('[VAN QUEUE]', shortId(van.uuid), 'approaching unloading spot', van.position.x.toFixed(2), van.position.z.toFixed(2));
                }
            } else {
                // Wait at holding position outside the zone
                const holdX = entranceX - 40 - queueIndex * 16;
                const holdPos = new THREE.Vector3(holdX, 4, entranceZ + vanZOffset);
                const toHold = new THREE.Vector3().subVectors(holdPos, van.position);
                if (toHold.length() > 2) {
                    toHold.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.5);
                    van.velocity.add(toHold);
                }
                console.log('[VAN QUEUE]', shortId(van.uuid), 'waiting in queue at', queueIndex);
                return;
            }
        }
        // If van is in RETURNING state, always move it out of the prison
        if (van.state === VAN_STATES.RETURNING) {
            // If inside prison, force target to outside entrance and move directly
            const entranceX = CONFIG.PRISON_ENTRANCE_X;
            const entranceZ = CONFIG.PRISON_ENTRANCE_Z;
            const vanZOffset = (i - (vans.length-1)/2) * 16;
            const inPrisonArea = (
                van.position.x > entranceX - 24 && van.position.x < entranceX + 8 &&
                van.position.z > CONFIG.PRISON_JAIL_MIN_Z && van.position.z < CONFIG.PRISON_JAIL_MAX_Z
            );
            if (inPrisonArea) {
                // Teleport van to a safe position outside the entrance
                van.position.set(entranceX - 40, 4, entranceZ);
                van.velocity.set(0, 0, 0);
                // Let normal RETURNING logic resume next frame
                handleReturning(van, centroidX, centroidZ, i, vans);
                return;
            } else {
                // Not in prison, use normal RETURNING logic
                handleReturning(van, centroidX, centroidZ, i, vans);
            }
        }
        // Skip all velocity/collision logic if van._pickupFreezeFrames > 0
        if (van._pickupFreezeFrames && van._pickupFreezeFrames > 0) {
            van._pickupFreezeFrames--;
            van.velocity.set(0, 0, 0);
            return;
        }
        // After van.velocity is updated and before van.position is updated:
        const nearProtestor = protestors.some(p => van.position.distanceTo(p.position) < CONFIG.VAN_PICKUP_RANGE * 2);
        if (nearProtestor && van.velocity.length() > CONFIG.VAN_MOVE_SPEED) {
            van.velocity.setLength(CONFIG.VAN_MOVE_SPEED);
        }
        // After movement, check for extracting state and unloading zone
        if (van.state === VAN_STATES.EXTRACTING) {
            const entranceX = CONFIG.PRISON_ENTRANCE_X;
            const entranceZ = CONFIG.PRISON_ENTRANCE_Z;
            const insideUnloadingZone = (
                van.position.x > entranceX - 24 && van.position.x < entranceX + 8 &&
                van.position.z > CONFIG.PRISON_JAIL_MIN_Z && van.position.z < CONFIG.PRISON_JAIL_MAX_Z
            );
            if (insideUnloadingZone) {
                van.velocity.set(0, 0, 0); // FLICKER FIX
                handleExtracting(van, vans, i);
                return;
            }
        }
    });
    // Final overlap resolution: forcibly separate any overlapping vans
    for (let i = 0; i < vans.length; i++) {
        for (let j = i + 1; j < vans.length; j++) {
            const a = vans[i];
            const b = vans[j];
            const minDist = 16; // Half of MIN_VAN_DISTANCE for hard separation
            const delta = new THREE.Vector3().subVectors(a.position, b.position);
            const dist = delta.length();
            if (dist < minDist && dist > 0.01) {
                const push = delta.normalize().multiplyScalar((minDist - dist) * 0.5);
                a.position.add(push);
                b.position.sub(push);
            }
        }
    }
    // Clamp and smooth van velocity after all updates
    vans.forEach(van => {
        if (van.velocity.length() > CONFIG.VAN_MOVE_SPEED * 1.2) {
            van.velocity.setLength(CONFIG.VAN_MOVE_SPEED * 1.2);
        }
        if (van.velocity.length() < 0.05) {
            van.velocity.set(0, 0, 0);
        }
        // Extra smoothing
        van.velocity.lerp(new THREE.Vector3(0, 0, 0), 0.05);
    });
}

function applyVanCollisionAvoidance(van, vans, protestors, vanIndex) {
    if (van.state === VAN_STATES.PICKUP || van.state === VAN_STATES.TRANSPORTING) return;
    // Reduced minimum-separation repulsion
    const MIN_VAN_DISTANCE = 18; // Lowered from 32
    let totalRepulse = new THREE.Vector3();
    let repulseCount = 0;
    const isPickupMode = van.state === VAN_STATES.PICKUP;
    vans.forEach((otherVan, otherIndex) => {
        if (otherIndex !== vanIndex) {
            const delta = new THREE.Vector3().subVectors(van.position, otherVan.position);
            const dist = delta.length();
            if (dist < MIN_VAN_DISTANCE && dist > 0.01) {
                let strength = (MIN_VAN_DISTANCE - dist) * (isPickupMode ? 0.05 : 0.12); // Lower repulsion
                const push = delta.normalize().multiplyScalar(strength);
                totalRepulse.add(push);
                repulseCount++;
            }
        }
    });
    if (repulseCount > 0) {
        totalRepulse.divideScalar(repulseCount);
        van.velocity.add(totalRepulse);
    }
    // Protestor avoidance - unchanged
    const BASE_AVOID_RADIUS = 12; // Lowered
    let protestorRepulse = new THREE.Vector3();
    let protestorCount = 0;
    protestors.forEach(protestor => {
        if (!protestor.userData.isBeingTransported) {
            const distance = van.position.distanceTo(protestor.position);
            if (distance < BASE_AVOID_RADIUS) {
                let stuckMultiplier = 1.0;
                if (van.velocity.length() < 2) stuckMultiplier = 1.5;
                if (van.velocity.length() < 0.5) stuckMultiplier = 2.0;
                const strength = Math.pow((BASE_AVOID_RADIUS - distance) / BASE_AVOID_RADIUS, 2) * stuckMultiplier;
                const toProtestor = new THREE.Vector3().subVectors(van.position, protestor.position).normalize();
                protestorRepulse.add(toProtestor.multiplyScalar(strength));
                protestorCount++;
            }
        }
    });
    if (protestorCount > 0) {
        protestorRepulse.divideScalar(protestorCount);
        protestorRepulse.multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.4); // Lowered
        van.velocity.add(protestorRepulse);
    }
}

function getVanFormationSlot(vanIndex, vans, centroidX, centroidZ) {
    const formationDepth = CONFIG.POLICE_RANK_DEPTH * CONFIG.POLICE_RANK_SPACING;
    const vanSpacing = 30;
    const slotX = centroidX - formationDepth - 18;
    const slotZ = centroidZ + (vanIndex - (vans.length-1)/2) * vanSpacing;
    return new THREE.Vector3(slotX, 4, slotZ);
}

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

function getRetreatFormationSlot(vanIndex, vans, crowdCenter) {
    // Place vans in formation at a tactical distance behind the officers
    const RETREAT_DIST = 100;
    const vanSpacing = 30;
    const slotX = crowdCenter.x - RETREAT_DIST;
    const slotZ = crowdCenter.z + (vanIndex - (vans.length-1)/2) * vanSpacing;
    return new THREE.Vector3(slotX, 4, slotZ);
}

function shortId(id) {
    return id ? id.toString().slice(0, 6) : 'null';
}

function updateVanState(van, vans, police, protestors, centroidX, centroidZ, vanIndex) {
    let aiOrder = (window.policeAIOrder || 'arrest');
    const crowdCenter = getProtestorCrowdCenter(protestors);
    if (aiOrder === 'retreat') {
        van.state = VAN_STATES.FORMATION;
        van.pickupTarget = null;
        const slot = getRetreatFormationSlot(vanIndex, vans, crowdCenter);
        const toSlot = new THREE.Vector3().subVectors(slot, van.position);
        if (toSlot.length() > 2) {
            toSlot.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
            van.velocity.add(toSlot);
        }
        return;
    }
    // Only set state and let handlePickup do the work
    const detainedProtestors = protestors.filter(p =>
        p.userData.isArrested &&
        !p.userData.isBeingTransported &&
        !p.userData.isJailed
    );
    if (detainedProtestors.length > 0 && van.occupants.length < van.maxCapacity) {
        // Find nearest detained protestor
        let closestProtestor = null;
        let minDist = Infinity;
        detainedProtestors.forEach(protestor => {
            const dist = van.position.distanceTo(protestor.position);
            if (dist < minDist) {
                minDist = dist;
                closestProtestor = protestor;
            }
        });
        if (closestProtestor) {
            // If close enough, switch to PICKUP state
            if (minDist < CONFIG.VAN_PICKUP_RANGE * 1.2) {
                if (van.state !== VAN_STATES.PICKUP) {
                    console.warn(`[VAN STATE] ${shortId(van.uuid)} entering PICKUP (was ${van.state})`);
                }
                van.state = VAN_STATES.PICKUP;
                van.pickupTarget = closestProtestor;
                van.stateTimer = 0;
                return;
            }
            // Otherwise, nudge toward the protestor
            const toProtestor = new THREE.Vector3().subVectors(closestProtestor.position, van.position);
            const approachDist = 10 + Math.random() * 5;
            toProtestor.setLength(Math.max(0, toProtestor.length() - approachDist));
            van.targetPosition = new THREE.Vector3().addVectors(van.position, toProtestor);
            const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
            if (toTarget.length() > 2) {
                toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
                van.velocity.add(toTarget);
            }
            return;
        }
    }
    // Otherwise, follow formation slot
    if (van.state !== VAN_STATES.FORMATION) {
        console.warn(`[VAN STATE] ${shortId(van.uuid)} entering FORMATION (was ${van.state})`);
    }
    van.state = VAN_STATES.FORMATION;
    van.pickupTarget = null;
    const slot = getVanFormationSlot(vanIndex, vans, centroidX, centroidZ);
    const toSlot = new THREE.Vector3().subVectors(slot, van.position);
    if (toSlot.length() > 2) {
        toSlot.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
        van.velocity.add(toSlot);
    }
}

function handlePatrolling(van, vans, police, protestors, centroidX, centroidZ, vanIndex) {
    // Find detained protestors (arrested, not being transported, not jailed)
    const detainedProtestors = protestors.filter(p =>
        p.userData.isArrested &&
        !p.userData.isBeingTransported &&
        !p.userData.isJailed &&
        !isProtestorTargetedByOtherVan(p, van, vans)
    );
    // If there are detained protestors and van has space, nudge toward the closest one
    if (detainedProtestors.length > 0 && van.occupants.length < van.maxCapacity) {
        let closestProtestor = null;
        let minDist = Infinity;
        detainedProtestors.forEach(protestor => {
            const dist = van.position.distanceTo(protestor.position);
            if (dist < minDist) {
                minDist = dist;
                closestProtestor = protestor;
            }
        });
        if (closestProtestor) {
            // If close enough, switch to PICKUP state
            if (minDist < CONFIG.VAN_PICKUP_RANGE * 1.2) {
                van.state = VAN_STATES.PICKUP;
                van.pickupTarget = closestProtestor;
                van.stateTimer = 0;
                return;
            }
            // Otherwise, nudge toward the protestor
            const toProtestor = new THREE.Vector3().subVectors(closestProtestor.position, van.position);
            const approachDist = 10 + Math.random() * 5;
            toProtestor.setLength(Math.max(0, toProtestor.length() - approachDist));
            van.targetPosition = new THREE.Vector3().addVectors(van.position, toProtestor);
            // Move toward target
            const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
            if (toTarget.length() > 2) {
                toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
                van.velocity.add(toTarget);
            }
            return;
        }
    }
    // Otherwise, follow police centroid closely
    const formationDepth = CONFIG.POLICE_RANK_DEPTH * CONFIG.POLICE_RANK_SPACING;
    const followX = centroidX - formationDepth - 18; // Slightly closer than before
    const vanSpacing = 30; // Tighter spacing
    const followZ = centroidZ + (vanIndex - (vans.length-1)/2) * vanSpacing;
    van.targetPosition = new THREE.Vector3(followX, van.position.y, followZ);
    const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
    if (toTarget.length() > 2) {
        toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.6);
        van.velocity.add(toTarget);
    }
}

function isNearBuilding(position) {
    const buildingCenter = new THREE.Vector3(-50, 0, -50);
    const buildingRadius = 30; // Slightly larger than building size
    return position.distanceTo(buildingCenter) < buildingRadius;
}

function handlePickup(van, protestors, vans) {
    // Add a stuck timer
    if (!van._pickupStuckTime) van._pickupStuckTime = 0;
    van._pickupStuckTime += 1 / 30; // Assume ~30fps
    let pickedUp = 0;
    let foundTarget = false;
    // Try to pick up any protestor in range
    protestors.forEach(protestor => {
        if (
            protestor.userData.isArrested &&
            !protestor.userData.isBeingTransported &&
            !protestor.userData.isJailed &&
            (!protestor.userData.pickupTargeted || protestor.userData.pickupTargeted === van) &&
            !isNearBuilding(protestor.position)
        ) {
            const dist = van.position.distanceTo(protestor.position);
            if (dist < CONFIG.VAN_PICKUP_RANGE * 1.5 && van.occupants.length < van.maxCapacity) {
                loadProtestorIntoVan(van, protestor);
                pickedUp++;
                van._pickupFreezeFrames = 2; // Reduced freeze for faster pickup
                van._pickupStuckTime = 0; // Reset stuck timer on successful pickup
            }
        }
    });
    if (pickedUp > 0) {
        van.pickupTarget = null;
    }
    if (van.occupants.length >= van.maxCapacity) {
        if (van.state !== VAN_STATES.TRANSPORTING) {
            console.warn(`[VAN STATE] ${shortId(van.uuid)} entering TRANSPORTING (full)`);
        }
        van.state = VAN_STATES.TRANSPORTING;
        van.pickupTarget = null;
        van._pickupStuckTime = 0;
        return;
    }
    // Aggressive targeting and movement
    // If we have a pickupTarget, move toward it if not in range
    let target = van.pickupTarget;
    if (!target ||
        !target.userData ||
        !target.userData.isArrested ||
        target.userData.isBeingTransported ||
        target.userData.isJailed ||
        (target.userData.pickupTargeted && target.userData.pickupTargeted !== van) ||
        isNearBuilding(target.position)) {
        // Find nearest available arrested protestor not targeted by another van and not near building
        let nearestProtestor = null;
        let minDistance = Infinity;
        protestors.forEach(protestor => {
            if (protestor.userData.isArrested &&
                !protestor.userData.isBeingTransported &&
                !protestor.userData.isJailed &&
                (!protestor.userData.pickupTargeted || protestor.userData.pickupTargeted === van) &&
                !isNearBuilding(protestor.position)) {
                const distance = van.position.distanceTo(protestor.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestProtestor = protestor;
                }
            }
        });
        if (nearestProtestor) {
            van.pickupTarget = nearestProtestor;
            van.pickupTarget.userData.pickupTargeted = van;
            van.stateTimer = 0;
            target = nearestProtestor;
            foundTarget = true;
            console.log(`[VAN PICKUP] ${shortId(van.uuid)} targeting protestor ${shortId(target.uuid)}`);
        } else {
            // No valid protestors found
            if (van.occupants.length > 0) {
                console.warn(`[VAN PICKUP] ${shortId(van.uuid)} no targets, going to TRANSPORTING`);
                van.state = VAN_STATES.TRANSPORTING;
            } else {
                console.warn(`[VAN PICKUP] ${shortId(van.uuid)} no targets, going to PATROLLING`);
                van.state = VAN_STATES.PATROLLING;
            }
            van.pickupTarget = null;
            van._pickupStuckTime = 0;
            return;
        }
    } else {
        foundTarget = true;
    }
    // If we have a target and not in range, move directly toward them
    if (foundTarget && target) {
        const toTarget = new THREE.Vector3().subVectors(target.position, van.position);
        const distance = toTarget.length();
        if (distance > CONFIG.VAN_PICKUP_RANGE * 0.8) {
            // Move directly and quickly toward the protestor
            toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 1.2);
            van.velocity.lerp(toTarget, 0.5); // Aggressive acceleration
            van.targetPosition = target.position.clone();
            console.log(`[VAN PICKUP] ${shortId(van.uuid)} moving toward protestor ${shortId(target.uuid)} at distance ${distance.toFixed(2)}`);
        }
    }
    // Timeout: If stuck in PICKUP for >2 seconds, force transition
    if (van._pickupStuckTime > 2) {
        if (van.occupants.length > 0) {
            console.warn(`[VAN TIMEOUT] ${shortId(van.uuid)} forced TRANSPORTING after 2s in PICKUP`);
            van.state = VAN_STATES.TRANSPORTING;
        } else {
            console.warn(`[VAN TIMEOUT] ${shortId(van.uuid)} forced PATROLLING after 2s in PICKUP`);
            van.state = VAN_STATES.PATROLLING;
        }
        van.pickupTarget = null;
        van._pickupStuckTime = 0;
        return;
    }
}

function loadProtestorIntoVan(van, protestor) {
    van.occupants.push(protestor);
    protestor.userData.isBeingTransported = true;
    protestor.userData.transportVan = van;
    protestor.visible = false;
    van.pickupTarget = null;
}

function findNearbyArrestedProtestors(van, protestors, vans) {
    return protestors.filter(p => 
        p.userData.isArrested && 
        !p.userData.isBeingTransported &&
        !p.userData.isJailed &&
        !isProtestorTargetedByOtherVan(p, van, vans) &&
        van.position.distanceTo(p.position) < CONFIG.VAN_PICKUP_RANGE * 3
    );
}

function isProtestorTargetedByOtherVan(protestor, thisVan, vans) {
    return vans.some(van => van !== thisVan && van.pickupTarget === protestor);
}

function handleTransporting(van, protestors, vans, vanIndex) {
    // Strict queueing: only first van in queue can approach
    const warehouseCenterX = CONFIG.WORLD_SIZE/2 + 30;
    const vanZOffset = (vanIndex - (vans.length-1)/2) * 18;
    const approachX = warehouseCenterX - 10;
    const approachZ = CONFIG.EXTRACTION_POINT_Z + vanZOffset;
    // Find all vans in TRANSPORTING state, sort by distance to entrance
    const vansApproaching = vans.filter(v => v.state === VAN_STATES.TRANSPORTING);
    vansApproaching.sort((a, b) => a.position.distanceTo(new THREE.Vector3(CONFIG.EXTRACTION_POINT_X - 25, van.position.y, CONFIG.EXTRACTION_POINT_Z)) - b.position.distanceTo(new THREE.Vector3(CONFIG.EXTRACTION_POINT_X - 25, van.position.y, CONFIG.EXTRACTION_POINT_Z)));
    const queueIndex = vansApproaching.indexOf(van);
    const isFirstInQueue = queueIndex === 0;
    if (isFirstInQueue) {
        van.targetPosition = new THREE.Vector3(approachX, van.position.y, approachZ);
        const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
        if (toTarget.length() > 2) {
            toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.7);
            van.velocity.add(toTarget);
        }
    } else {
        // Wait at holding position behind entrance
        const holdX = warehouseCenterX - 40 - queueIndex * 20;
        van.targetPosition = new THREE.Vector3(holdX, van.position.y, approachZ);
        const toHold = new THREE.Vector3().subVectors(van.targetPosition, van.position);
        if (toHold.length() > 2) {
            toHold.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.5);
            van.velocity.add(toHold);
        }
    }
}

function handleExtracting(van, vans, vanIndex) {
    // Use new prison entrance and jail area
    const entranceX = CONFIG.PRISON_ENTRANCE_X;
    const entranceZ = CONFIG.PRISON_ENTRANCE_Z;
    const vanZOffset = (vanIndex - (vans.length-1)/2) * 16;
    van.targetPosition = new THREE.Vector3(entranceX, van.position.y, entranceZ + vanZOffset);
    // Unloading zone: just inside the entrance
    const insideUnloadingZone = (
        van.position.x > entranceX - 24 && van.position.x < entranceX + 8 &&
        van.position.z > CONFIG.PRISON_JAIL_MIN_Z && van.position.z < CONFIG.PRISON_JAIL_MAX_Z
    );
    if (insideUnloadingZone) {
        // --- FLICKER FIX: Stop van before unloading ---
        van.velocity.set(0, 0, 0);
        // Instantly unload all protestors
        if (van.occupants.length > 0) {
            van.occupants.forEach(protestor => {
                dropoffProtestorAtPrison(protestor);
            });
            console.warn('[VAN UNLOAD]', shortId(van.uuid), 'unloaded', van.occupants.length);
        }
        // Remove van from scene and vans array
        if (van.parent) van.parent.remove(van);
        if (vans && Array.isArray(vans)) {
            vans.splice(vanIndex, 1);
        }
        // After a short delay, spawn a new empty van at the starting position
        setTimeout(() => {
            const vanSpacing = 40;
            const startX = CONFIG.POLICE_START_X - 30;
            const startZ = CONFIG.VAN_START_Z + (vanIndex - (vans.length-1)/2) * vanSpacing;
            const newVan = new THREE.Mesh(vanGeometry, vanMaterial.clone());
            newVan.position.set(startX, 4, startZ);
            newVan.velocity = new THREE.Vector3();
            newVan.occupants = [];
            newVan.maxCapacity = CONFIG.VAN_CAPACITY;
            newVan.state = VAN_STATES.PATROLLING;
            newVan.targetPosition = newVan.position.clone();
            newVan.stateTimer = 0;
            newVan.lastPickupTime = performance.now();
            newVan.pickupTarget = null;
            newVan.scene = van.scene;
            // Add capacity bar and sirens as in createVans
            const barGeometry = new THREE.BoxGeometry(2.5, 0.2, 0.2);
            const barMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            newVan.capacityBar = new THREE.Mesh(barGeometry, barMaterial);
            newVan.capacityBar.position.y = 2.5;
            newVan.add(newVan.capacityBar);
            const sirenGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.3);
            const leftSirenMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0, transparent: true, opacity: 0.9 });
            newVan.leftSiren = new THREE.Mesh(sirenGeometry, leftSirenMaterial);
            newVan.leftSiren.position.set(-4, 5, 7);
            newVan.add(newVan.leftSiren);
            const rightSirenMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 1.0, transparent: true, opacity: 0.9 });
            newVan.rightSiren = new THREE.Mesh(sirenGeometry, rightSirenMaterial);
            newVan.rightSiren.position.set(4, 5, 7);
            newVan.add(newVan.rightSiren);
            newVan.sirenTime = Math.random() * Math.PI * 2;
            newVan.leftSiren.scale.set(1.7, 1.7, 1.7);
            newVan.rightSiren.scale.set(1.7, 1.7, 1.7);
            // Add to scene and vans array
            van.scene.add(newVan);
            if (vans && Array.isArray(vans)) {
                vans.splice(vanIndex, 0, newVan);
            }
        }, 10);
        return;
    }
    // Otherwise, keep moving toward target and avoid other vans
    const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
    if (toTarget.length() > 8) {
        toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED * 0.5);
        van.velocity.add(toTarget);
        // Spread-out force: repel from other vans inside prison
        vans.forEach((otherVan, otherIndex) => {
            if (otherVan !== van &&
                otherVan.position.x > entranceX - 24 && otherVan.position.x < entranceX + 8 &&
                Math.abs(otherVan.position.z - van.position.z) < 18) {
                const toOther = new THREE.Vector3().subVectors(otherVan.position, van.position);
                const d = toOther.length();
                if (d < 24) {
                    const repulse = toOther.clone().normalize().multiplyScalar(-1 * (24 - d) * 0.3);
                    van.velocity.add(repulse);
                }
            }
        });
    }
    // Clamp van velocity to reduce flicker
    if (van.velocity.length() > CONFIG.VAN_MOVE_SPEED * 1.2) {
        van.velocity.setLength(CONFIG.VAN_MOVE_SPEED * 1.2);
    }
    if (van.velocity.length() < 0.1) {
        van.velocity.setLength(0);
    }
}

function handleReturning(van, centroidX, centroidZ, vanIndex, vans) {
    // Return to position behind police formation
    const formationDepth = CONFIG.POLICE_RANK_DEPTH * CONFIG.POLICE_RANK_SPACING;
    const returnX = centroidX - formationDepth - 20; // Behind police
    // Stagger vans along Z axis
    const vanSpacing = 40;
    const returnZ = centroidZ + (vanIndex - (vans.length-1)/2) * vanSpacing;
    // Set target position
    van.targetPosition = new THREE.Vector3(returnX, van.position.y, returnZ);
    // Move toward target position
    const toTarget = new THREE.Vector3().subVectors(van.targetPosition, van.position);
    const distToTarget = toTarget.length();
    if (distToTarget > 10) {
        // Not close enough, move toward target
        toTarget.normalize().multiplyScalar(CONFIG.VAN_MOVE_SPEED);
        van.velocity.add(toTarget);
    } else {
        // Close enough, switch back to patrolling
        van.state = VAN_STATES.PATROLLING;
        van.stateTimer = 0;
    }
}

function createVan() {
    const van = new THREE.Group();
    
    // Van body
    const bodyGeometry = new THREE.BoxGeometry(8, 5, 12);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1a237e });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    van.add(body);
    
    // Initialize position with proper Y coordinate
    van.position.set(
        (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.8,
        ENTITY_Y_POSITIONS.VAN,
        (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.8
    );
    
    // Initialize other properties
    van.velocity = new THREE.Vector3();
    van.occupants = [];
    van.maxCapacity = CONFIG.VAN_CAPACITY;
    van.state = VAN_STATES.PATROLLING;
    van.stateTimer = 0;
    
    return van;
}

function updateVanPosition(van, deltaTime) {
    // Apply damping for smooth movement
    van.velocity.multiplyScalar(CONFIG.VAN_DAMPING);
    // Clamp velocity to prevent overshooting
    const maxSpeed = CONFIG.VAN_MOVE_SPEED * 1.2;
    if (van.velocity.length() > maxSpeed) {
        van.velocity.setLength(maxSpeed);
    }
    // Update position while maintaining Y coordinate
    van.position.x += van.velocity.x * deltaTime;
    van.position.z += van.velocity.z * deltaTime;
    van.position.y = ENTITY_Y_POSITIONS.VAN; // Maintain correct height
    // Update rotation to face movement direction
    if (van.velocity.lengthSq() > 0.01) {
        const targetRotation = Math.atan2(van.velocity.x, van.velocity.z);
        van.rotation.y = targetRotation;
    }
}

function applyVanBuildingAndProtestorCollision(van, protestors) {
    // Hard collision with building
    const buildingCenter = new THREE.Vector3(-50, 0, -50);
    const buildingRadius = 35;
    const distToBuilding = van.position.distanceTo(buildingCenter);
    if (distToBuilding < buildingRadius + 4) {
        const repulse = new THREE.Vector3().subVectors(van.position, buildingCenter).normalize().multiplyScalar((buildingRadius + 4 - distToBuilding) * 2.5);
        van.position.add(repulse);
        van.velocity.add(repulse.multiplyScalar(0.2));
    }
    // Hard collision with protestors
    protestors.forEach(protestor => {
        if (!protestor.userData.isBeingTransported) {
            const delta = new THREE.Vector3().subVectors(van.position, protestor.position);
            const dist = delta.length();
            if (dist < 7 && dist > 0.01) {
                const push = delta.normalize().multiplyScalar((7 - dist) * 0.5);
                van.position.add(push);
                van.velocity.add(push.multiplyScalar(0.2));
                // Optionally, push protestor too
                protestor.position.sub(push.multiplyScalar(0.5));
            }
        }
    });
}

function activelyPushProtestorsFromVan(van, protestors) {
    // Push protestors away from van if van is in pickup or full state
    protestors.forEach(protestor => {
        if (!protestor.userData.isBeingTransported) {
            const delta = new THREE.Vector3().subVectors(protestor.position, van.position);
            const dist = delta.length();
            // Increase push radius and force for full vans
            let pushRadius = (van.occupants.length >= van.maxCapacity) ? 22 : 10;
            let pushForce = (van.occupants.length >= van.maxCapacity) ? 2.0 : 0.7;
            if (dist < pushRadius && dist > 0.01) {
                const push = delta.normalize().multiplyScalar((pushRadius - dist) * pushForce);
                protestor.position.add(push);
                protestor.userData.velocity && protestor.userData.velocity.add(push.multiplyScalar(0.3));
            }
        }
    });
    // If van is full and moving slowly, allow it to phase through protestors by ignoring their collision for a short burst
    if (van.occupants.length >= van.maxCapacity && van.velocity.length() < 2) {
        van.userData.phaseThroughTimer = (van.userData.phaseThroughTimer || 0) + 1;
        if (van.userData.phaseThroughTimer < 30) { // 1 second at 30fps
            van.velocity.multiplyScalar(1.2); // Burst forward
        }
    } else {
        van.userData.phaseThroughTimer = 0;
    }
} 