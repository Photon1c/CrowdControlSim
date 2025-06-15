// policeAI.js
// Manages police AI-mind orders for formations, movement, and actions
import OpenAI from 'openai';

let aiOrders = [];
let currentOrderIndex = 0;

// Load orders from a JSON file (async)
export async function loadPoliceAIOrders(url = '/police_ai.json') {
    try {
        const response = await fetch(url);
        aiOrders = await response.json();
        currentOrderIndex = 0;
    } catch (err) {
        console.error('Failed to load police AI orders:', err);
        aiOrders = [];
    }
}

// Get the current AI-mind order
export function getPoliceAIOrder() {
    if (aiOrders.length === 0) return null;
    return aiOrders[currentOrderIndex];
}

// Advance to the next order (call when trigger met)
export function nextPoliceAIOrder() {
    if (aiOrders.length > 0 && currentOrderIndex < aiOrders.length - 1) {
        currentOrderIndex++;
    }
}

// Placeholder: Generate an order using OpenAI API (to be implemented server-side or with API key)
export async function generatePoliceAIOrderWithOpenAI(prompt) {
    // Example using OpenAI API (requires server-side proxy or secure API key handling)
    
     const client = new OpenAI();
     const response = await client.responses.create({
         model: 'gpt-4.1',
        input: prompt,
     });
     return response.output_text;
    //return null; // Not implemented client-side for security
}

window.setPoliceAIOrder = function(order) {
    window.policeAIOrder = order;
    console.log('Police AI order set to:', order);
};

function handleCommandInput(command) {
    if (command.startsWith('police:')) {
        const order = command.split(':')[1].trim();
        window.setPoliceAIOrder(order);
        console.log('Received police command:', command);
    }
    // ... existing code ...
} 