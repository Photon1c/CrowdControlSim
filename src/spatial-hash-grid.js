export class SpatialHashGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    _getCellKey(position) {
        const x = Math.floor(position.x / this.cellSize);
        const z = Math.floor(position.z / this.cellSize);
        return `${x},${z}`;
    }

    clear() {
        this.grid.clear();
    }

    insert(entity) {
        const key = this._getCellKey(entity.position);
        if (!this.grid.has(key)) {
            this.grid.set(key, new Set());
        }
        this.grid.get(key).add(entity);
    }

    findNearby(position, radius) {
        const nearby = new Set();
        const cellRadius = Math.ceil(radius / this.cellSize);
        const centerCell = {
            x: Math.floor(position.x / this.cellSize),
            z: Math.floor(position.z / this.cellSize)
        };

        for (let x = -cellRadius; x <= cellRadius; x++) {
            for (let z = -cellRadius; z <= cellRadius; z++) {
                const key = `${centerCell.x + x},${centerCell.z + z}`;
                const cell = this.grid.get(key);
                if (cell) {
                    cell.forEach(entity => {
                        if (entity.position.distanceTo(position) <= radius) {
                            nearby.add(entity);
                        }
                    });
                }
            }
        }

        return Array.from(nearby);
    }
} 