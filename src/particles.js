import * as THREE from 'three';

const particleSystems = [];

export function createArrestEffect(scene, position) {
    // Create multiple particle systems for a more dramatic effect
    createSmokeEffect(scene, position);
    createSparkEffect(scene, position);
    createShockwaveEffect(scene, position);
}

function createSmokeEffect(scene, position) {
    const particleCount = 50;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const lifetimes = [];
    
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 2;
        
        positions[i * 3] = position.x + Math.cos(angle) * radius;
        positions[i * 3 + 1] = position.y + Math.random() * 2;
        positions[i * 3 + 2] = position.z + Math.sin(angle) * radius;
        
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.3,
            (Math.random() - 0.5) * 0.2
        ));
        
        lifetimes.push(60 + Math.random() * 60);
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x888888,
        size: 0.8,
        opacity: 0.8,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    
    const particleSystem = new THREE.Points(particles, material);
    particleSystem.userData = {
        type: 'smoke',
        velocities,
        lifetimes,
        initialOpacity: 0.8
    };
    
    scene.add(particleSystem);
    particleSystems.push(particleSystem);
}

function createSparkEffect(scene, position) {
    const particleCount = 20;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const lifetimes = [];
    
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random();
        
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y + 1;
        positions[i * 3 + 2] = position.z;
        
        const speed = 0.3 + Math.random() * 0.3;
        velocities.push(new THREE.Vector3(
            Math.cos(angle) * speed,
            0.2 + Math.random() * 0.3,
            Math.sin(angle) * speed
        ));
        
        lifetimes.push(30 + Math.random() * 20);
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xffaa00,
        size: 0.3,
        opacity: 1,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    
    const particleSystem = new THREE.Points(particles, material);
    particleSystem.userData = {
        type: 'spark',
        velocities,
        lifetimes,
        initialOpacity: 1
    };
    
    scene.add(particleSystem);
    particleSystems.push(particleSystem);
}

function createShockwaveEffect(scene, position) {
    const geometry = new THREE.RingGeometry(0, 0.1, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.position.y += 0.1;
    ring.rotation.x = -Math.PI / 2;
    
    ring.userData = {
        type: 'shockwave',
        lifetime: 30,
        initialScale: 0.1,
        targetScale: 5
    };
    
    scene.add(ring);
    particleSystems.push(ring);
}

export function updateParticles() {
    for (let i = particleSystems.length - 1; i >= 0; i--) {
        const system = particleSystems[i];
        
        if (system.userData.type === 'smoke' || system.userData.type === 'spark') {
            const positions = system.geometry.attributes.position.array;
            const velocities = system.userData.velocities;
            const lifetimes = system.userData.lifetimes;
            let allParticlesDead = true;
            
            for (let j = 0; j < positions.length / 3; j++) {
                if (lifetimes[j] > 0) {
                    allParticlesDead = false;
                    
                    positions[j * 3] += velocities[j].x;
                    positions[j * 3 + 1] += velocities[j].y;
                    positions[j * 3 + 2] += velocities[j].z;
                    
                    if (system.userData.type === 'smoke') {
                        velocities[j].y -= 0.01;
                    }
                    
                    lifetimes[j]--;
                    system.material.opacity = (lifetimes[j] / 60) * system.userData.initialOpacity;
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
            
            if (allParticlesDead) {
                system.parent.remove(system);
                particleSystems.splice(i, 1);
            }
        } else if (system.userData.type === 'shockwave') {
            if (system.userData.lifetime > 0) {
                const progress = 1 - (system.userData.lifetime / 30);
                const scale = system.userData.initialScale + 
                    (system.userData.targetScale - system.userData.initialScale) * progress;
                system.scale.set(scale, scale, scale);
                system.material.opacity = 0.7 * (1 - progress);
                system.userData.lifetime--;
            } else {
                system.parent.remove(system);
                particleSystems.splice(i, 1);
            }
        }
    }
} 