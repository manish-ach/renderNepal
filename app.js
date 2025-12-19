/**
 * app.js
 * Entry point for the Nepal Interactive Map.
 * Manages global state and initialization.
 */

// Global State (shared between components via script scope)
let currentView = 'country';
let activeProvince = null;
let activeDistrict = null;
let lastBackTime = 0;
const NAV_COOLDOWN = 300;

/**
 * Initialize the application
 */
async function init() {
    try {
        // Create the UI legend
        createLegend();

        // Load data (from map-logic.js)
        await loadAllProvinces();

        // Calculate global bounds for transformation
        globalBounds = calculateBounds();

        // Initial render
        renderCountryView();

        // Setup breadcrumbs
        updateBreadcrumb();

        // Enable interactions (drag, pinch, etc.)
        setupMapInteraction();

        // Success - hide loading state
        document.getElementById('loadingOverlay').classList.add('hidden');
    } catch (error) {
        console.error('Failed to initialize map:', error);
        const overlay = document.getElementById('loadingOverlay');
        overlay.innerHTML = `
            <p style="color: #FF6B6B;">Failed to load map data</p>
            <p style="color: #A0A0B0; font-size: 0.8rem;">Please check that the GeoJSON files are available</p>
        `;
    }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
