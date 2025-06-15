import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createBuildings(scene) {
    const buildings = [];
    const buildingCount = CONFIG.BUILDING_COUNT;
    
    // Create buildings
    for (let i = 0; i < buildingCount; i++) {
        const width = Math.random() * CONFIG.MAX_BUILDING_SIZE + CONFIG.MIN_BUILDING_SIZE;
        const height = Math.random() * CONFIG.BUILDING_HEIGHT + CONFIG.MIN_BUILDING_SIZE;
        const depth = Math.random() * CONFIG.MAX_BUILDING_SIZE + CONFIG.MIN_BUILDING_SIZE;
        
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.2
        });
        
        const building = new THREE.Mesh(geometry, material);
        
        // Position buildings around the edges of the world
        const angle = (i / buildingCount) * Math.PI * 2;
        const radius = CONFIG.WORLD_SIZE * 0.4;
        building.position.x = Math.cos(angle) * radius;
        building.position.z = Math.sin(angle) * radius;
        building.position.y = height / 2;
        
        scene.add(building);
        buildings.push(building);
    }
    
    // Create roads
    const roadWidth = 20;
    const roadGeometry = new THREE.PlaneGeometry(CONFIG.WORLD_SIZE * 0.8, roadWidth);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
        metalness: 0.1
    });
    
    // Create cross roads
    const road1 = new THREE.Mesh(roadGeometry, roadMaterial);
    road1.rotation.x = -Math.PI / 2;
    scene.add(road1);
    
    const road2 = new THREE.Mesh(roadGeometry, roadMaterial);
    road2.rotation.x = -Math.PI / 2;
    road2.rotation.z = Math.PI / 2;
    scene.add(road2);
    
    return buildings;
} 