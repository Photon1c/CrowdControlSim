// About page content for the riot simulation

export function createAboutWindow() {
    // console.log('createAboutWindow function called');
    const aboutContainer = document.createElement('div');
    aboutContainer.id = 'about-container';
    // console.log('About container element created with ID:', aboutContainer.id);
    aboutContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        font-family: Arial, sans-serif;
    `;

    const aboutContent = document.createElement('div');
    aboutContent.style.cssText = `
        background-color: white;
        padding: 30px;
        border-radius: 10px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        position: relative;
    `;

    aboutContent.innerHTML = `
        <button id="close-about" style="
            position: absolute;
            top: 15px;
            right: 15px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
        ">&times;</button>
        
        <h1 style="color: #333; margin-bottom: 20px; font-size: 28px;">
            🚔 Riot Crowd Control Simulator 🚔
        </h1>
        
        <div style="color: #555; line-height: 1.6; font-size: 16px;">
            <h2 style="color: #2c5aa0; margin-top: 25px;">About This Project</h2>
            <p>
                This interactive 3D simulation demonstrates modern crowd control dynamics, proactive police AI, and van-based prisoner extraction. It is designed as a <b>base template for educational purposes only</b>—perfect for learning about agent-based AI, crowd simulation, and real-time web graphics.
            </p>
            
            <h2 style="color: #2c5aa0; margin-top: 25px;">Working Features</h2>
            <ul style="padding-left: 20px;">
                <li><strong>Dynamic Crowd Behavior:</strong> Protestors flock, avoid, and shift in real time, never static.</li>
                <li><strong>Proactive Police AI:</strong> Officers always seek out and arrest protestors, never idle.</li>
                <li><strong>Fast, Unstoppable Vans:</strong> Full vans break through crowds and deliver prisoners to the prison reliably.</li>
                <li><strong>Coordinated Arrests:</strong> Two-officer teams arrest protestors and coordinate with vans for extraction.</li>
                <li><strong>Real-time UI:</strong> Live stats for protestors, arrests, van capacity, and prison population.</li>
                <li><strong>Configurable Simulation:</strong> Easily adjust speeds, population, and behaviors in <code>config.js</code>.</li>
                <li><strong>Visual Feedback:</strong> See all actions and state changes as they happen.</li>
            </ul>
            
            <h2 style="color: #2c5aa0; margin-top: 25px;">Simulation Elements</h2>
            <ul style="padding-left: 20px;">
                <li><strong style="color: #ff0000;">Red Spheres:</strong> Protestors (dynamic, flocking)</li>
                <li><strong style="color: #0000ff;">Blue Cylinders:</strong> Police Officers (proactive, arresting)</li>
                <li><strong style="color: #000080;">Dark Blue Vans:</strong> Police Vans (fast, extract prisoners)</li>
                <li><strong style="color: #8b4513;">Brown Building:</strong> Protest focal point</li>
                <li><strong style="color: #808080;">Gray Structures:</strong> Prison and city buildings</li>
            </ul>
            
            <h2 style="color: #2c5aa0; margin-top: 25px;">Controls</h2>
            <ul style="padding-left: 20px;">
                <li><strong>Mouse:</strong> Click and drag to rotate view</li>
                <li><strong>Mouse Wheel:</strong> Zoom in/out</li>
                <li><strong>I Key:</strong> Show/hide this information window</li>
            </ul>
            
            <h2 style="color: #2c5aa0; margin-top: 25px;">Technical Details</h2>
            <p>
                Built with Three.js for 3D graphics, featuring advanced collision detection, agent-based state machines, and realistic crowd/vehicle physics. The system includes dynamic crowd algorithms, proactive police AI, and robust van extraction logic.
            </p>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #f0f8ff; border-radius: 5px; border-left: 4px solid #2c5aa0;">
                <strong>Disclaimer:</strong> This project is a <b>base template for educational and demonstration purposes only</b>. The scenarios depicted are fictional and intended to showcase simulation and AI technology. Not for real-world law enforcement or sensitive applications.
            </div>
            <div style="margin-top: 18px; padding: 12px; background-color: #fffbe6; border-radius: 5px; border-left: 4px solid #e6b800; color: #665200;">
                <strong>AI Capabilities:</strong> Advanced AI features (such as natural language command input, OpenAI integration, or scenario scripting) are <b>working but in deep development</b>. These features are paused for v1, and are being actively developed for version 2. All current behavior is simulation-based.
            </div>
        </div>
    `;

    aboutContainer.appendChild(aboutContent);
    document.body.appendChild(aboutContainer);
    // console.log('About container added to document body');

    // Close button functionality
    const closeButton = document.getElementById('close-about');
    if (closeButton) {
        closeButton.addEventListener('click', hideAboutWindow);
        // console.log('Close button event listener added');
    } else {
        // console.error('Close button not found!');
    }

    // Close when clicking outside the content
    aboutContainer.addEventListener('click', (e) => {
        if (e.target === aboutContainer) {
            hideAboutWindow();
        }
    });

    // console.log('About window fully created and configured');
    return aboutContainer;
}

export function showAboutWindow() {
    const aboutContainer = document.getElementById('about-container');
    if (aboutContainer) {
        aboutContainer.style.display = 'flex';
    }
}

export function hideAboutWindow() {
    const aboutContainer = document.getElementById('about-container');
    if (aboutContainer) {
        aboutContainer.style.display = 'none';
    }
}

export function toggleAboutWindow() {
    // console.log('toggleAboutWindow called');
    const aboutContainer = document.getElementById('about-container');
    // console.log('About container found:', !!aboutContainer);
    if (aboutContainer) {
        const currentDisplay = aboutContainer.style.display;
        // console.log('Current display:', currentDisplay);
        if (currentDisplay === 'none' || currentDisplay === '') {
            // console.log('Showing about window');
            showAboutWindow();
        } else {
            // console.log('Hiding about window');
            hideAboutWindow();
        }
    } else {
        // console.error('About container not found!');
    }
} 