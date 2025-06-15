import * as THREE from 'three';
import { CONFIG } from './config.js';

// Arrest states for better state management
export const ARREST_STATES = {
    DETAINING: 'detaining',      // Initial arrest state, officers moving to surround protestor
    ESCORTING: 'escorting',      // Moving detained protestor to nearest van
    TRANSFERRING: 'transferring', // Transferring protestor to van
    COMPLETED: 'completed'       // Arrest completed, reset officers
};

export class ArrestManager {
    constructor() {
        this.arrests = new Map(); // Map of arrestId -> arrest operation
        this.nextArrestId = 0;
        this.extractedCount = 0; // Track number of protestors extracted/jailed
        this.lastDebugTime = 0;
        
        // IMPROVED: Make arrest manager globally accessible
        window.arrestManager = this;
        
        // IMPROVED: Initialize global arrest count if not already set
        if (window.arrestCount === undefined) {
            window.arrestCount = 0;
        }
    }

    // Main update loop for all arrests
    update(deltaTime) {
        // Debug: Log current arrest states every few seconds
        if (!this.lastDebugTime) this.lastDebugTime = 0;
        this.lastDebugTime += deltaTime;
        
        if (this.lastDebugTime > 2) { // Every 2 seconds
            // console.log(`=== ARREST MANAGER DEBUG ===`);
            // console.log(`Active arrests: ${this.arrests.size}`);
            this.arrests.forEach((arrest, arrestId) => {
                // console.log(`Arrest ${arrestId}: state=${arrest.state}, officers=${arrest.officers.length}, protestor=${arrest.protestor.userData.isBeingArrested ? 'being arrested' : 'NOT being arrested'}`);
                
                // Show detailed state for first few arrests
                if (arrest.state === 'detaining') {
                    const [officer1, officer2] = arrest.officers;
                    const protestor = arrest.protestor;
                    if (officer1 && officer2) {
                        const toProtestor = new THREE.Vector3().subVectors(protestor.position, officer1.position);
                        const perpendicular = new THREE.Vector3(-toProtestor.z, 0, toProtestor.x).normalize();
                        const target1 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(1.5));
                        const target2 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(-1.5));
                        
                        const dist1 = officer1.position.distanceTo(target1);
                        const dist2 = officer2.position.distanceTo(target2);
                        
                        const detainTime = arrest.detainStartTime ? (performance.now() - arrest.detainStartTime) / 1000 : 0;
                        // console.log(`  → Detaining: officer1_dist=${dist1.toFixed(1)}, officer2_dist=${dist2.toFixed(1)}, detain_time=${detainTime.toFixed(1)}s`);
                    }
                }
            });
            // console.log(`=== END ARREST DEBUG ===`);
            this.lastDebugTime = 0;
        }
        
        // Update existing arrests
        this.arrests.forEach((arrest, arrestId) => {
            this.updateArrest(arrest, deltaTime);
            
            if (arrest.state === ARREST_STATES.COMPLETED) {
                this.cleanupArrest(arrest);
            }
        });
    }

    // Update a single arrest operation based on its state
    updateArrest(arrest, deltaTime) {
        switch (arrest.state) {
            case ARREST_STATES.DETAINING:
                this.updateDetaining(arrest, deltaTime);
                break;
            case ARREST_STATES.ESCORTING:
                this.updateEscorting(arrest, deltaTime);
                break;
            case ARREST_STATES.TRANSFERRING:
                this.updateTransferring(arrest, deltaTime);
                break;
            case ARREST_STATES.COMPLETED:
                this.cleanupArrest(arrest);
                break;
        }
    }

    // Officers move to flank the protestor
    updateDetaining(arrest, deltaTime) {
        const [officer1, officer2] = arrest.officers;
        const protestor = arrest.protestor;
        
        // Add timeout to prevent infinite detaining
        if (!arrest.detainStartTime) {
            arrest.detainStartTime = performance.now();
        }
        
        const detainElapsed = (performance.now() - arrest.detainStartTime) / 1000;
        
        // Force progression after 5 seconds regardless of position (reduced from 8s)
        if (detainElapsed > 5) {
            // console.warn(`DETAINING TIMEOUT after ${detainElapsed.toFixed(1)}s, forcing progression to escorting`);
            arrest.state = ARREST_STATES.ESCORTING;
            arrest.escortTarget = this.findNearestVan(protestor.position);
            protestor.userData.velocity.set(0, 0, 0);
            return;
        }
        
        // Debug detaining timeout progress
        if (detainElapsed > 3 && Math.random() < 0.2) {
            // console.log(`Detaining approaching timeout: ${detainElapsed.toFixed(1)}s / 5s`);
        }
        
        // Calculate flank positions
        const toProtestor = new THREE.Vector3().subVectors(protestor.position, officer1.position);
        const perpendicular = new THREE.Vector3(-toProtestor.z, 0, toProtestor.x).normalize();
        const target1 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(1.5));
        const target2 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(-1.5));
        
        const dist1 = officer1.position.distanceTo(target1);
        const dist2 = officer2.position.distanceTo(target2);
        
        // Debug the detaining distances frequently to diagnose issue
        if (Math.random() < 0.3) { // 30% chance to log - more frequent
            // console.log(`Detaining progress: officer1 dist=${dist1.toFixed(1)}, officer2 dist=${dist2.toFixed(1)}, target threshold=1.5`);
        }
        
        // Use velocity-based movement and smooth facing
        if (dist1 > 0.1) {
            const moveDir1 = target1.clone().sub(officer1.position).normalize();
            const moveDistance1 = Math.min(dist1, CONFIG.POLICE_MOVE_SPEED * deltaTime);
            officer1.userData.velocity = moveDir1.clone().multiplyScalar(moveDistance1 / deltaTime);
            // Smooth facing
            const targetRot1 = Math.atan2(moveDir1.x, moveDir1.z);
            officer1.rotation.y += (targetRot1 - officer1.rotation.y) * 0.2;
        }
        if (dist2 > 0.1) {
            const moveDir2 = target2.clone().sub(officer2.position).normalize();
            const moveDistance2 = Math.min(dist2, CONFIG.POLICE_MOVE_SPEED * deltaTime);
            officer2.userData.velocity = moveDir2.clone().multiplyScalar(moveDistance2 / deltaTime);
            // Smooth facing
            const targetRot2 = Math.atan2(moveDir2.x, moveDir2.z);
            officer2.rotation.y += (targetRot2 - officer2.rotation.y) * 0.2;
        }
        
        // Stop protestor from moving
        protestor.userData.velocity.set(0, 0, 0);
    }

    // Escort protestor and officers to the nearest van
    updateEscorting(arrest, deltaTime) {
        if (!arrest.escortTarget) {
            arrest.escortTarget = this.findNearestVan(arrest.protestor.position);
            if (!arrest.escortTarget) {
                // console.warn('No van found for escort');
                return;
            }
        }
        
        if (!arrest.escortWaitTime) arrest.escortWaitTime = 0;
        arrest.escortWaitTime += deltaTime;
        
        // Ensure isBeingTransported property exists
        if (arrest.protestor.userData.isBeingTransported === undefined) {
            arrest.protestor.userData.isBeingTransported = false;
        }
        
        const [officer1, officer2] = arrest.officers;
        const protestor = arrest.protestor;
        
        // Calculate flank positions around protestor
        const toProtestor = new THREE.Vector3().subVectors(protestor.position, officer1.position);
        const perpendicular = new THREE.Vector3(-toProtestor.z, 0, toProtestor.x).normalize();
        const target1 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(1.5));
        const target2 = protestor.position.clone().add(perpendicular.clone().multiplyScalar(-1.5));
        
        const dist1 = officer1.position.distanceTo(target1);
        const dist2 = officer2.position.distanceTo(target2);
        
        let officersReady = false;
        // FIXED: More lenient officer readiness check to avoid getting stuck
        if (dist1 < 2.0 && dist2 < 2.0) { // Increased from 0.5 to 2.0 for more lenient positioning
            officersReady = true;
            // Direct position control - no velocity
            officer1.position.copy(target1);
            officer2.position.copy(target2);
            // Keep everyone stationary
            protestor.userData.velocity.set(0, 0, 0);
        } else {
            // Move officers to flank positions using direct position control
            if (dist1 > 2.0) {
                const moveDir1 = target1.clone().sub(officer1.position).normalize();
                const moveDistance1 = Math.min(dist1, CONFIG.POLICE_MOVE_SPEED * deltaTime);
                officer1.position.add(moveDir1.multiplyScalar(moveDistance1));
            }
            if (dist2 > 2.0) {
                const moveDir2 = target2.clone().sub(officer2.position).normalize();  
                const moveDistance2 = Math.min(dist2, CONFIG.POLICE_MOVE_SPEED * deltaTime);
                officer2.position.add(moveDir2.multiplyScalar(moveDistance2));
            }
            // FIXED: Don't return early - allow pickup attempts even while officers are positioning
            // This prevents arrests from getting stuck waiting for perfect positioning
        }
        
        // Check van availability
        const toVan = arrest.escortTarget.position.clone().sub(protestor.position);
        const distance = toVan.length();
        
        // Extensive debug logging (increased frequency to diagnose issue)
        if (Math.random() < 0.5 || arrest.escortWaitTime > 1) { // Log 50% of time or when waiting > 1s
            // console.log(`ESCORTING DEBUG:
            //     Van distance: ${distance.toFixed(1)}
            //     Van pickup range: ${(CONFIG.VAN_PICKUP_RANGE * 1.5).toFixed(1)}
            //     Officers ready: ${officersReady}
            //     Van occupants: ${arrest.escortTarget.occupants.length}/${arrest.escortTarget.maxCapacity}
            //     Van state: ${arrest.escortTarget.state}
            //     Protestor transported: ${protestor.userData.isBeingTransported}
            //     Wait time: ${arrest.escortWaitTime.toFixed(1)}s`);
        }
        
        // If van is full, cancel arrest and release officers
        if (arrest.escortTarget.occupants.length >= arrest.escortTarget.maxCapacity) {
            // Release officers to patrol - let police.js handle formation
            officer1.userData.state = 'patrolling';
            officer2.userData.state = 'patrolling';
            officer1.userData.arrestId = null;
            officer2.userData.arrestId = null;
            officer1.visible = true;
            officer2.visible = true;
            
            // FIXED: Immediately reset officer behavior to avoid prison-running
            // Clear any conflicting target positions that might point to prison
            officer1.targetPosition = null;
            officer2.targetPosition = null;
            // Reset velocities to prevent momentum toward prison
            officer1.velocity.set(0, 0, 0);
            officer2.velocity.set(0, 0, 0);
            // Force immediate return to formation by clearing any cached targets
            officer1.userData.targetPosition = null;
            officer2.userData.targetPosition = null;
            officer1.userData.arrestId = null;
            officer2.userData.arrestId = null;
            officer1.visible = true;
            officer2.visible = true;
            protestor.userData.isBeingArrested = false;
            protestor.userData.arrestId = null;
            // console.warn('Arrest canceled: van is full, officers released');
            arrest.state = ARREST_STATES.COMPLETED;
            return;
        }
        
        // REMOVED: Duplicate pickup logic - consolidated into single improved version below
        
        // FIXED: Properly detect van readiness signal
        const vanInRange = distance < CONFIG.VAN_PICKUP_RANGE * 1.2; // Slightly more forgiving
        const vanSignalingReady = arrest.escortTarget.readyForPickup === true;
        const vanReady = vanInRange || vanSignalingReady;
        
        // ENHANCED: Add more detailed debug logging for van readiness
        if (Math.random() < 0.3 && arrest.escortWaitTime > 2) {
            // console.log(`VAN READINESS CHECK:
            //     Van in range (${distance.toFixed(1)} < ${(CONFIG.VAN_PICKUP_RANGE * 1.2).toFixed(1)}): ${vanInRange}
            //     Van signaling ready: ${vanSignalingReady}
            //     Van ready overall: ${vanReady}
            //     Officers ready: ${officersReady}
            //     Van state: ${arrest.escortTarget.state}
            //     Van pickup target: ${arrest.escortTarget.pickupTarget ? 'yes' : 'no'}`);
        }
        
        if (vanReady && officersReady) {
            // console.log('PICKUP HAPPENING: Van ready and officers ready (improved logic)');
            arrest.escortTarget.occupants.push(protestor);
            protestor.position.copy(arrest.escortTarget.position).add(new THREE.Vector3(0, 1, 0));
            protestor.userData.isBeingTransported = true;
            protestor.userData.isBeingArrested = false;
            protestor.userData.isArrested = true;
            
            // IMPROVED: Reset prisoner visual state for transport
            protestor.visible = true; // Ensure prisoner remains visible
            protestor.material.color.setHex(0xff9900); // Orange color for transported
            
            // Update van state to indicate successful pickup
            arrest.escortTarget.lastPickupTime = performance.now();
            arrest.escortTarget.readyForPickup = false; // Reset signal
            if (arrest.escortTarget.state === 'pickup') {
                arrest.escortTarget.state = 'patrolling';
                arrest.escortTarget.pickupTarget = null;
                arrest.escortTarget.stateTimer = 0;
            }
            
            // IMPROVED: Force immediate extraction check if van is full
            if (arrest.escortTarget.occupants.length >= arrest.escortTarget.maxCapacity) {
                // console.log('Van is now full, forcing immediate extraction transition (improved)');
                arrest.escortTarget.state = 'extracting';
                arrest.escortTarget.targetPosition = new THREE.Vector3(CONFIG.EXTRACTION_POINT_X, arrest.escortTarget.position.y, CONFIG.EXTRACTION_POINT_Z);
                arrest.escortTarget.stateTimer = 0;
            }
            
            // ENHANCED: Release officers to patrol with detailed logging
            // console.log(`ARREST MANAGER: Releasing officers ${officer1.uuid} and ${officer2.uuid} to patrolling (pickup success)`);
            officer1.userData.state = 'patrolling';
            officer2.userData.state = 'patrolling';
            officer1.userData.arrestId = null;
            officer2.userData.arrestId = null;
            officer1.userData.arrestStateTime = null; // Clear stuck detection timer
            officer2.userData.arrestStateTime = null;
            officer1.visible = true;
            officer2.visible = true;
            
            // FIXED: Immediately reset officer behavior to avoid prison-running
            // Clear any conflicting target positions that might point to prison
            officer1.targetPosition = null;
            officer2.targetPosition = null;
            // Reset velocities to prevent momentum toward prison
            officer1.velocity.set(0, 0, 0);
            officer2.velocity.set(0, 0, 0);
            // Force immediate return to formation by clearing any cached targets
            officer1.userData.targetPosition = null;
            officer2.userData.targetPosition = null;
            
            // Update HUD arrest count
            if (window.hud && typeof window.hud.updateArrestCount === 'function') {
                const arrestedCount = (window.arrestManager && typeof window.arrestManager.getArrestedProtestorCount === 'function') ? window.arrestManager.getArrestedProtestorCount() + 1 : 1;
                window.hud.updateArrestCount(arrestedCount);
            }
            // console.log('Protestor picked up by van (improved), officers released, van state updated');
            arrest.state = ARREST_STATES.COMPLETED;
            return;
        }
        
        // Timeout fallback: reduce timeout and force pickup earlier
        if (arrest.escortWaitTime > 6) { // Reduced from 8 to 6 seconds
            // console.warn('TIMEOUT PICKUP: Forcing pickup due to timeout');
            // Always force pickup if there's a van available, regardless of distance
            if (arrest.escortTarget && arrest.escortTarget.occupants.length < arrest.escortTarget.maxCapacity) {
                arrest.escortTarget.occupants.push(protestor);
                protestor.position.copy(arrest.escortTarget.position).add(new THREE.Vector3(0, 1, 0));
                protestor.userData.isBeingTransported = true;
                protestor.userData.isBeingArrested = false;
                protestor.userData.isArrested = true;
                
                // IMPROVED: Reset prisoner visual state for transport
                protestor.visible = true; // Ensure prisoner remains visible
                protestor.material.color.setHex(0xff9900); // Orange color for transported
                
                // Update van state for forced pickup
                arrest.escortTarget.lastPickupTime = performance.now();
                if (arrest.escortTarget.state === 'pickup') {
                    arrest.escortTarget.state = 'patrolling';
                    arrest.escortTarget.pickupTarget = null;
                    arrest.escortTarget.stateTimer = 0;
                }
                
                // IMPROVED: Force immediate extraction check if van is full (timeout path)
                if (arrest.escortTarget.occupants.length >= arrest.escortTarget.maxCapacity) {
                    // console.log('Van is now full, forcing immediate extraction transition (timeout)');
                    arrest.escortTarget.state = 'extracting';
                    arrest.escortTarget.targetPosition = new THREE.Vector3(CONFIG.EXTRACTION_POINT_X, arrest.escortTarget.position.y, CONFIG.EXTRACTION_POINT_Z);
                    arrest.escortTarget.stateTimer = 0;
                }
                
                // Update HUD arrest count
                if (window.hud && typeof window.hud.updateArrestCount === 'function') {
                    const arrestedCount = (window.arrestManager && typeof window.arrestManager.getArrestedProtestorCount === 'function') ? window.arrestManager.getArrestedProtestorCount() + 1 : 1;
                    window.hud.updateArrestCount(arrestedCount);
                }
                // console.warn('Timeout: Forcibly picked up protestor after 6s, officers and van state updated');
            } else {
                // console.warn('Timeout: Van is full after 6s, canceling arrest');
            }
            
            // ALWAYS release officers after timeout, regardless of pickup success
            // ENHANCED: Release officers to patrol with detailed logging (timeout path)
            // console.log(`ARREST MANAGER: Releasing officers ${officer1.uuid} and ${officer2.uuid} to patrolling (timeout)`);
            officer1.userData.state = 'patrolling';
            officer2.userData.state = 'patrolling';
            officer1.userData.arrestId = null;
            officer2.userData.arrestId = null;
            officer1.userData.arrestStateTime = null; // Clear stuck detection timer
            officer2.userData.arrestStateTime = null;
            officer1.visible = true;
            officer2.visible = true;
            
            // FIXED: Immediately reset officer behavior to avoid prison-running
            // Clear any conflicting target positions that might point to prison
            officer1.targetPosition = null;
            officer2.targetPosition = null;
            // Reset velocities to prevent momentum toward prison
            officer1.velocity.set(0, 0, 0);
            officer2.velocity.set(0, 0, 0);
            // Force immediate return to formation by clearing any cached targets
            officer1.userData.targetPosition = null;
            officer2.userData.targetPosition = null;
            
            protestor.userData.isBeingArrested = false;
            protestor.userData.arrestId = null;
            arrest.state = ARREST_STATES.COMPLETED;
            return;
        }
        
        if (arrest.escortWaitTime > 3 && officersReady) {
            // console.warn('Stuck: Officers and protestor waiting for van for', arrest.escortWaitTime.toFixed(1), 'seconds');
        }
    }

    // Transfer protestor to van
    updateTransferring(arrest, deltaTime) {
        arrest.transferTime += deltaTime;
        if (arrest.transferTime >= 1.0) {
            if (arrest.escortTarget && Array.isArray(arrest.escortTarget.occupants)) {
                arrest.escortTarget.occupants.push(arrest.protestor);
                // Move protestor visually into the van
                arrest.protestor.position.copy(arrest.escortTarget.position).add(new THREE.Vector3(0, 1, 0));
                arrest.protestor.userData.isBeingTransported = true;
                // console.log('Protestor transferred to van');
            }
            arrest.state = ARREST_STATES.COMPLETED;
        }
    }

    // Clean up after arrest is completed
    cleanupArrest(arrest) {
        const arrestId = arrest.id;
        
        // Reset officers
        arrest.officers.forEach(officer => {
            officer.userData.state = 'patrolling';
            officer.userData.arrestId = null;
            officer.userData.arrestStateTime = null;
            officer.userData.lastArrestCompleted = performance.now();
        });
        
        // Mark protestor as fully arrested
        if (!arrest.protestor.userData.isJailed) {
            arrest.protestor.userData.isArrested = true;
            arrest.protestor.userData.isBeingArrested = false;
        }
        
        // IMPROVED: Update global arrest count if this is a new completed arrest
        if (!arrest.countedInGlobal) {
            // Only increment if we're not already at 3 (the retreat threshold)
            if (window.arrestCount < 3) {
                window.arrestCount = Math.min(3, window.arrestCount + 1);
                // console.log(`Arrest completed! Global count now: ${window.arrestCount}`);
            }
            arrest.countedInGlobal = true;
        }
        
        this.arrests.delete(arrestId);
    }

    // Find the nearest available van
    findNearestVan(position) {
        let nearest = null;
        let minDistance = Infinity;
        const vans = window.getVans ? window.getVans() : [];
        vans.forEach(van => {
            if (van.occupants.length < CONFIG.VAN_CAPACITY) {
                const distance = position.distanceTo(van.position);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = van;
                }
            }
        });
        return nearest;
    }

    // Initialize a new arrest operation
    initializeArrest(officers, protestor) {
        if (officers.length < 2) {
            console.warn('Need at least 2 officers for an arrest');
            return false;
        }
        
        if (protestor.userData.isArrested || protestor.userData.isBeingArrested) {
            // console.log('Protestor is already being arrested');
            return false;
        }
        
        const arrestId = this.nextArrestId++;
        
        // Mark officers as arresting
        officers.forEach(officer => {
            officer.userData.state = 'arresting';
            officer.userData.arrestId = arrestId;
            officer.userData.arrestStateTime = performance.now();
        });
        
        // Mark protestor as being arrested
        protestor.userData.isBeingArrested = true;
        protestor.userData.arrestId = arrestId;
        
        // Create arrest operation
        const arrest = {
            id: arrestId,
            officers: officers,
            protestor: protestor,
            state: ARREST_STATES.DETAINING,
            startTime: performance.now()
        };
        
        this.arrests.set(arrestId, arrest);
        return true;
    }

    // Get the number of active arrests
    getActiveArrestCount() {
        return this.arrests.size;
    }

    // Get the number of protestors currently marked as arrested
    getArrestedProtestorCount() {
        return this.extractedCount;
    }

    // Add a method to handle protestor extraction/jailed
    handleExtraction(protestor) {
        this.extractedCount++;
        // Move protestor to jail area (visible)
        protestor.position.set(CONFIG.WORLD_SIZE/2 + 30, 1, (Math.random() - 0.5) * 30);
        protestor.userData.isJailed = true;
        protestor.userData.isExtracted = true;
        protestor.userData.isArrested = true;
        protestor.visible = true;
        if (window.hud && typeof window.hud.updateArrestCount === 'function') {
            window.hud.updateArrestCount(this.extractedCount);
        }
    }
} 