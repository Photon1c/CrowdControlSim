import { CONFIG } from './config.js';

export class HUD {
    constructor() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '20px';
        this.container.style.right = '20px';
        this.container.style.color = 'white';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.fontSize = '16px';
        this.container.style.textShadow = '2px 2px 2px rgba(0,0,0,0.5)';
        
        // Create protestor counter
        this.protestorCounter = document.createElement('div');
        this.protestorCounter.style.marginBottom = '10px';
        this.container.appendChild(this.protestorCounter);
        
        // Create arrest counter
        this.arrestCounter = document.createElement('div');
        this.arrestCounter.style.marginBottom = '10px';
        this.container.appendChild(this.arrestCounter);
        
        // Create capacity bar container
        this.capacityBarContainer = document.createElement('div');
        this.capacityBarContainer.style.width = '200px';
        this.capacityBarContainer.style.height = '20px';
        this.capacityBarContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.capacityBarContainer.style.border = '1px solid white';
        this.capacityBarContainer.style.position = 'relative';
        
        // Create capacity bar fill
        this.capacityBarFill = document.createElement('div');
        this.capacityBarFill.style.height = '100%';
        this.capacityBarFill.style.backgroundColor = '#4CAF50';
        this.capacityBarFill.style.width = '0%';
        this.capacityBarFill.style.transition = 'width 0.3s ease-in-out';
        
        // Create capacity text
        this.capacityText = document.createElement('div');
        this.capacityText.style.position = 'absolute';
        this.capacityText.style.width = '100%';
        this.capacityText.style.textAlign = 'center';
        this.capacityText.style.lineHeight = '20px';
        
        this.capacityBarContainer.appendChild(this.capacityBarFill);
        this.capacityBarContainer.appendChild(this.capacityText);
        this.container.appendChild(this.capacityBarContainer);
        
        // Create prison capacity bar container
        this.prisonBarContainer = document.createElement('div');
        this.prisonBarContainer.style.width = '200px';
        this.prisonBarContainer.style.height = '20px';
        this.prisonBarContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
        this.prisonBarContainer.style.border = '1px solid white';
        this.prisonBarContainer.style.position = 'relative';
        this.prisonBarContainer.style.marginTop = '15px'; // Increased spacing to avoid overlap
        
        // Create prison capacity bar fill
        this.prisonBarFill = document.createElement('div');
        this.prisonBarFill.style.height = '100%';
        this.prisonBarFill.style.backgroundColor = '#9E9E9E'; // Gray for prison
        this.prisonBarFill.style.width = '0%';
        this.prisonBarFill.style.transition = 'width 0.3s ease-in-out';
        
        // Create prison capacity text
        this.prisonText = document.createElement('div');
        this.prisonText.style.position = 'absolute';
        this.prisonText.style.width = '100%';
        this.prisonText.style.textAlign = 'center';
        this.prisonText.style.lineHeight = '20px';
        this.prisonText.style.fontSize = '14px';
        
        this.prisonBarContainer.appendChild(this.prisonBarFill);
        this.prisonBarContainer.appendChild(this.prisonText);
        this.container.appendChild(this.prisonBarContainer);
        
        // Initialize counters
        this.arrestCount = 0;
        this.totalCapacity = 0;
        this.currentCapacity = 0;
        this.prisonCount = 0;
        this.maxPrisonCapacity = CONFIG.PROTESTOR_COUNT; // Prison can hold all protestors
        this.totalProtestors = CONFIG.PROTESTOR_COUNT;
        this.remainingProtestors = CONFIG.PROTESTOR_COUNT;
        
        document.body.appendChild(this.container);
        
        // Initial update
        this.updateDisplay();
    }
    
    updateProtestorCount(remaining, total) {
        if (remaining !== undefined && total !== undefined && !isNaN(remaining) && !isNaN(total)) {
            this.remainingProtestors = remaining;
            this.totalProtestors = total;
            this.updateDisplay();
        }
    }
    
    updateArrestCount(count) {
        if (count !== undefined && !isNaN(count)) {
            this.arrestCount = count;
            this.updateDisplay();
        }
    }
    
    updateCapacity(current, total) {
        if (current !== undefined && total !== undefined && 
            !isNaN(current) && !isNaN(total)) {
            this.currentCapacity = current;
            this.totalCapacity = total;
            this.updateDisplay();
        }
    }
    
    updatePrisonCapacity(count) {
        if (count !== undefined && !isNaN(count)) {
            this.prisonCount = count;
            this.updateDisplay();
        }
    }
    
    updateDisplay() {
        // Update protestor counter
        this.protestorCounter.textContent = `Protestors: ${this.remainingProtestors} / ${this.totalProtestors}`;
        
        // Update arrest counter
        this.arrestCounter.textContent = `Arrests: ${this.arrestCount}`;
        
        // Update capacity bar
        const percentage = (this.totalCapacity > 0) ? 
            (this.currentCapacity / this.totalCapacity) * 100 : 0;
        this.capacityBarFill.style.width = `${percentage}%`;
        
        // Update capacity text
        this.capacityText.textContent = 
            `Van Capacity: ${this.currentCapacity} / ${this.totalCapacity}`;
        
        // Update bar color based on capacity
        if (percentage > 90) {
            this.capacityBarFill.style.backgroundColor = '#f44336'; // Red
        } else if (percentage > 75) {
            this.capacityBarFill.style.backgroundColor = '#ff9800'; // Orange
        } else {
            this.capacityBarFill.style.backgroundColor = '#4CAF50'; // Green
        }
        
        // Update prison capacity bar
        const prisonPercentage = (this.maxPrisonCapacity > 0) ? 
            (this.prisonCount / this.maxPrisonCapacity) * 100 : 0;
        this.prisonBarFill.style.width = `${prisonPercentage}%`;
        
        // Update prison capacity text
        this.prisonText.textContent = 
            `Prison: ${this.prisonCount} / ${this.maxPrisonCapacity}`;
        
        // Update prison bar color based on capacity
        if (prisonPercentage > 90) {
            this.prisonBarFill.style.backgroundColor = '#424242'; // Dark gray when nearly full
        } else if (prisonPercentage > 50) {
            this.prisonBarFill.style.backgroundColor = '#757575'; // Medium gray
        } else {
            this.prisonBarFill.style.backgroundColor = '#9E9E9E'; // Light gray
        }
    }
    
    remove() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
