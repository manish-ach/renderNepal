/**
 * map-logic.js
 * Handles GeoJSON data loading, coordinate transformations, and geometry calculations.
 */

// Province configuration with names and colors
const PROVINCES = {
    1: { name: 'Province No. 1 (Koshi)', color: '#FF6B6B', hoverColor: '#FF4757' },
    2: { name: 'Province No. 2 (Madhesh)', color: '#4ECDC4', hoverColor: '#26D0CE' },
    3: { name: 'Bagmati Province', color: '#45B7D1', hoverColor: '#17A2B8' },
    4: { name: 'Gandaki Province', color: '#96CEB4', hoverColor: '#6FB98F' },
    5: { name: 'Lumbini Province', color: '#FFEAA7', hoverColor: '#FFD93D' },
    6: { name: 'Karnali Province', color: '#DDA0DD', hoverColor: '#DA70D6' },
    7: { name: 'Sudurpashchim Province', color: '#F8B500', hoverColor: '#F39C12' }
};

// Store loaded GeoJSON data
let provincesData = {};

// Global bounds for coordinate transformation
let globalBounds = null;

/**
 * Load all province GeoJSON files
 */
async function loadAllProvinces() {
    const loadPromises = [];
    for (let i = 1; i <= 7; i++) {
        const promise = fetch(`./Nepal-GEOJSON/province${i}.geojson`)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load province ${i}`);
                return response.json();
            })
            .then(data => {
                provincesData[i] = data;
            });
        loadPromises.push(promise);
    }
    await Promise.all(loadPromises);
}

/**
 * Convert GeoJSON coordinates to SVG path
 */
function geoToSvgPath(coordinates, bounds) {
    const { minLon, maxLon, minLat, maxLat } = bounds;
    const width = 800;
    const height = 400;
    const padding = 20;

    const effectiveWidth = width - 2 * padding;
    const effectiveHeight = height - 2 * padding;

    const lonScale = effectiveWidth / (maxLon - minLon);
    const latScale = effectiveHeight / (maxLat - minLat);
    const scale = Math.min(lonScale, latScale);

    const offsetX = padding + (effectiveWidth - (maxLon - minLon) * scale) / 2;
    const offsetY = padding + (effectiveHeight - (maxLat - minLat) * scale) / 2;

    const transformPoint = (lon, lat) => {
        const x = (lon - minLon) * scale + offsetX;
        const y = (maxLat - lat) * scale + offsetY;
        return [x, y];
    };

    const processRing = (ring) => {
        return ring.map((point, index) => {
            const [x, y] = transformPoint(point[0], point[1]);
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ') + ' Z';
    };

    const processPolygon = (polygon) => polygon.map(ring => processRing(ring)).join(' ');

    if (coordinates[0] && coordinates[0][0] && typeof coordinates[0][0][0] === 'number') {
        return processPolygon(coordinates);
    } else {
        return coordinates.map(polygon => processPolygon(polygon)).join(' ');
    }
}

/**
 * Calculate the bounds of all loaded provinces
 */
function calculateBounds() {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const provinceNum in provincesData) {
        const data = provincesData[provinceNum];
        for (const feature of data.features) {
            const processCoords = (coords) => {
                if (typeof coords[0] === 'number') {
                    minLon = Math.min(minLon, coords[0]);
                    maxLon = Math.max(maxLon, coords[0]);
                    minLat = Math.min(minLat, coords[1]);
                    maxLat = Math.max(maxLat, coords[1]);
                } else {
                    coords.forEach(processCoords);
                }
            };
            processCoords(feature.geometry.coordinates);
        }
    }
    return { minLon, maxLon, minLat, maxLat };
}

/**
 * Calculate bounds for a specific feature (district)
 */
function calculateFeatureBounds(feature) {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    const processCoords = (coords) => {
        if (typeof coords[0] === 'number') {
            minLon = Math.min(minLon, coords[0]);
            maxLon = Math.max(maxLon, coords[0]);
            minLat = Math.min(minLat, coords[1]);
            maxLat = Math.max(maxLat, coords[1]);
        } else {
            coords.forEach(processCoords);
        }
    };
    processCoords(feature.geometry.coordinates);
    return { minLon, maxLon, minLat, maxLat };
}

/**
 * Calculate bounds for an entire province
 */
function calculateProvinceBounds(provinceNum) {
    const data = provincesData[provinceNum];
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const feature of data.features) {
        const bounds = calculateFeatureBounds(feature);
        minLon = Math.min(minLon, bounds.minLon);
        maxLon = Math.max(maxLon, bounds.maxLon);
        minLat = Math.min(minLat, bounds.minLat);
        maxLat = Math.max(maxLat, bounds.maxLat);
    }
    return { minLon, maxLon, minLat, maxLat };
}

/**
 * Convert geographical bounds to SVG viewBox coordinates
 */
function boundsToViewBox(geoBounds, padding = 30) {
    const { minLon, maxLon, minLat, maxLat } = globalBounds;
    const { minLon: targetMinLon, maxLon: targetMaxLon, minLat: targetMinLat, maxLat: targetMaxLat } = geoBounds;

    const width = 800;
    const height = 400;
    const basePadding = 20;

    const effectiveWidth = width - 2 * basePadding;
    const effectiveHeight = height - 2 * basePadding;

    const lonScale = effectiveWidth / (maxLon - minLon);
    const latScale = effectiveHeight / (maxLat - minLat);
    const scale = Math.min(lonScale, latScale);

    const offsetX = basePadding + (effectiveWidth - (maxLon - minLon) * scale) / 2;
    const offsetY = basePadding + (effectiveHeight - (maxLat - minLat) * scale) / 2;

    const svgX1 = (targetMinLon - minLon) * scale + offsetX;
    const svgX2 = (targetMaxLon - minLon) * scale + offsetX;
    const svgY1 = (maxLat - targetMaxLat) * scale + offsetY;
    const svgY2 = (maxLat - targetMinLat) * scale + offsetY;

    return {
        x: svgX1 - padding,
        y: svgY1 - padding,
        width: svgX2 - svgX1 + padding * 2,
        height: svgY2 - svgY1 + padding * 2
    };
}

/**
 * Merge individual district features into a list of polygons for a province
 */
function mergeProvinceFeatures(features) {
    const allCoordinates = [];
    features.forEach(feature => {
        const coords = feature.geometry.coordinates;
        if (feature.geometry.type === 'Polygon') {
            allCoordinates.push(coords);
        } else if (feature.geometry.type === 'MultiPolygon') {
            coords.forEach(polygon => allCoordinates.push(polygon));
        }
    });
    return allCoordinates;
}
