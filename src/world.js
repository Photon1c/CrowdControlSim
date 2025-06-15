import * as THREE from 'three';
import { CONFIG } from './config.js';

// Set proper Y positions for entities
const ENTITY_Y_POSITIONS = {
    VAN: 2.5,      // Vans are larger
    PROTESTOR: 2,  // Human height
    OFFICER: 2,    // Human height
    BUILDING: 15   // Half height of building
};

export function buildWorld(scene) {
  // Add main ground plane (green)
  const groundSize = CONFIG.WORLD_SIZE + 40;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x228B22 }) // Forest green
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // Add ambient and directional light
  if (!scene.getObjectByName('defaultAmbientLight')) {
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    ambient.name = 'defaultAmbientLight';
    scene.add(ambient);
  }
  if (!scene.getObjectByName('defaultDirectionalLight')) {
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(100, 200, 100);
    dirLight.castShadow = true;
    dirLight.name = 'defaultDirectionalLight';
    scene.add(dirLight);
  }

  // Walls
  const wallHeight = 20; // Increased height
  const wallThickness = 2;
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x223366, // Dark blue color for wooden walls
    roughness: 0.9,
    metalness: 0.1
  });

  // Add texture pattern to walls
  const wallGeometryWithPattern = (width, height, depth) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Add vertical lines for wooden plank effect
    const planks = 10;
    const uvs = geometry.attributes.uv.array;
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] *= planks;
    }
    return geometry;
  };

  // --- PRISON IN NE CORNER ---
  // Use config for new prison location
  const prisonMinX = CONFIG.PRISON_JAIL_MIN_X;
  const prisonMaxX = CONFIG.PRISON_JAIL_MAX_X;
  const prisonMinZ = CONFIG.PRISON_JAIL_MIN_Z;
  const prisonMaxZ = CONFIG.PRISON_JAIL_MAX_Z;
  const prisonWidth = prisonMaxX - prisonMinX;
  const prisonDepth = prisonMaxZ - prisonMinZ;
  const prisonHeight = 25;
  const prisonEntranceX = CONFIG.PRISON_ENTRANCE_X;
  const prisonEntranceZ = CONFIG.PRISON_ENTRANCE_Z;

  // Prison walls (rectangle)
  const prisonMaterial = new THREE.MeshStandardMaterial({
    color: 0x223366, // Dark blue for contrast
    roughness: 0.6,
    metalness: 0.3
  });
  // North wall
  const prisonNorth = new THREE.Mesh(
    new THREE.BoxGeometry(prisonWidth, prisonHeight, wallThickness),
    prisonMaterial
  );
  prisonNorth.position.set((prisonMinX + prisonMaxX) / 2, prisonHeight / 2, prisonMinZ);
  scene.add(prisonNorth);
  // South wall
  const prisonSouth = new THREE.Mesh(
    new THREE.BoxGeometry(prisonWidth, prisonHeight, wallThickness),
    prisonMaterial
  );
  prisonSouth.position.set((prisonMinX + prisonMaxX) / 2, prisonHeight / 2, prisonMaxZ);
  scene.add(prisonSouth);
  // East wall
  const prisonEast = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, prisonHeight, prisonDepth),
    prisonMaterial
  );
  prisonEast.position.set(prisonMaxX, prisonHeight / 2, (prisonMinZ + prisonMaxZ) / 2);
  scene.add(prisonEast);
  // West wall (with entrance gap)
  const entranceGap = 24; // Double the entrance gap for larger vans
  const westWallLength = (prisonDepth - entranceGap) / 2;
  // West wall north segment
  const prisonWestNorth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, prisonHeight, westWallLength),
    prisonMaterial
  );
  prisonWestNorth.position.set(prisonMinX, prisonHeight / 2, prisonMinZ + westWallLength / 2);
  scene.add(prisonWestNorth);
  // West wall south segment
  const prisonWestSouth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, prisonHeight, westWallLength),
    prisonMaterial
  );
  prisonWestSouth.position.set(prisonMinX, prisonHeight / 2, prisonMaxZ - westWallLength / 2);
  scene.add(prisonWestSouth);
  // Prison floor
  const prisonFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(prisonWidth, prisonDepth),
    new THREE.MeshStandardMaterial({ color: 0xcccccc }) // Light gray
  );
  prisonFloor.rotation.x = -Math.PI / 2;
  prisonFloor.position.set((prisonMinX + prisonMaxX) / 2, 0.1, (prisonMinZ + prisonMaxZ) / 2);
  prisonFloor.receiveShadow = true;
  scene.add(prisonFloor);
  // Prison gate (at entrance)
  const gateWidth = entranceGap;
  const gateHeight = prisonHeight * 0.7;
  const gateThickness = 1;
  const gateMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700, // Gold/yellow for high visibility
    roughness: 0.3,
    metalness: 0.7,
    transparent: false,
    opacity: 1.0
  });
  const prisonGate = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, gateHeight, gateWidth),
    gateMaterial
  );
  prisonGate.position.set(prisonMinX, gateHeight / 2, prisonEntranceZ);
  scene.add(prisonGate);

  // Add boundary colliders for physics
  const walls = [prisonNorth, prisonSouth, prisonEast, prisonWestNorth, prisonWestSouth];
  walls.forEach(wall => {
    wall.userData.isWall = true;
    wall.userData.boundingSphere = new THREE.Sphere(
      wall.position,
      Math.max(wall.geometry.parameters.width, 
              wall.geometry.parameters.height, 
              wall.geometry.parameters.depth) / 2
    );
  });

  return { 
    walls,
    gateSystem: {
      prisonGate
    }
  };
}

// Export for other modules to use
export { ENTITY_Y_POSITIONS };
  
