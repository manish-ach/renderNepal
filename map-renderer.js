/**
 * map-renderer.js
 * Handles SVG rendering, animations, interactions, and UI updates.
 */

// ViewBox state
let currentViewBox = { x: 0, y: 0, width: 800, height: 400 };
const baseViewBox = { x: 0, y: 0, width: 800, height: 400 };

// Interaction state (shared with app.js)
let isDragging = false;
let startX, startY;
let initialPinchDistance = null;
const PINCH_THRESHOLD = 50;

// DOM references
const mapSvg = document.getElementById('nepalMap');
const loadingOverlay = document.getElementById('loadingOverlay');
const infoPanel = document.getElementById('infoPanel');
const defaultInfo = infoPanel.querySelector('.default-info');
const provinceInfo = document.getElementById('provinceInfo');
const legendList = document.getElementById('legendList');
const breadcrumb = document.getElementById('breadcrumb');

/**
 * Creates the color legend
 */
function createLegend() {
    legendList.innerHTML = '';
    for (const [provinceNum, config] of Object.entries(PROVINCES)) {
        const li = document.createElement('li');
        li.className = 'legend-item';
        li.dataset.province = provinceNum;
        li.innerHTML = `
            <span class="legend-color" style="background: ${config.color}"></span>
            <span class="legend-label">${config.name}</span>
        `;
        li.addEventListener('mouseenter', () => highlightProvince(provinceNum));
        li.addEventListener('mouseleave', clearHighlight);
        li.addEventListener('click', () => zoomToProvince(parseInt(provinceNum)));
        legendList.appendChild(li);
    }
}

/**
 * Updates breadcrumb text
 */
function updateBreadcrumb() {
    if (!breadcrumb) return;
    let html = '<span class="breadcrumb-item" onclick="goToCountryView()">🇳🇵 Nepal</span>';
    if (activeProvince !== null) {
        const provinceName = PROVINCES[activeProvince].name;
        html += ' <span class="breadcrumb-separator">›</span> ';
        html += `<span class="breadcrumb-item" onclick="goToProvinceView(${activeProvince})">${provinceName}</span>`;
    }
    if (activeDistrict !== null) {
        const district = provincesData[activeProvince].features[activeDistrict];
        const districtName = district.properties.TARGET || district.properties.DISTRICT;
        html += ' <span class="breadcrumb-separator">›</span> ';
        html += `<span class="breadcrumb-item active">${districtName}</span>`;
    }
    breadcrumb.innerHTML = html;
}

/**
 * Smoothly animates the SVG viewBox
 */
function animateViewBox(targetViewBox, duration = 500) {
    const startViewBox = { ...currentViewBox };
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        const newViewBox = {
            x: startViewBox.x + (targetViewBox.x - startViewBox.x) * eased,
            y: startViewBox.y + (targetViewBox.y - startViewBox.y) * eased,
            width: startViewBox.width + (targetViewBox.width - startViewBox.width) * eased,
            height: startViewBox.height + (targetViewBox.height - startViewBox.height) * eased
        };

        mapSvg.setAttribute('viewBox', `${newViewBox.x} ${newViewBox.y} ${newViewBox.width} ${newViewBox.height}`);
        currentViewBox = newViewBox;

        if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

/**
 * Renders the country-wide view (merged provinces)
 */
function renderCountryView() {
    hideTooltip();
    const existingGroup = document.getElementById('provincesGroup');
    if (existingGroup) existingGroup.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'provincesGroup';

    const provinceOrder = [6, 7, 5, 4, 1, 3, 2];
    for (const provinceNum of provinceOrder) {
        const data = provincesData[provinceNum];
        if (!data) continue;
        const allCoords = mergeProvinceFeatures(data.features);
        allCoords.forEach((polygon, index) => {
            const pathData = geoToSvgPath([polygon], globalBounds);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathData);
            path.setAttribute('class', `province-merged province-${provinceNum}`);
            path.dataset.province = provinceNum;
            path.dataset.index = index;
            path.addEventListener('mouseenter', () => highlightProvince(provinceNum));
            path.addEventListener('mouseleave', clearHighlight);
            path.addEventListener('click', () => zoomToProvince(provinceNum));
            g.appendChild(path);
        });
    }

    mapSvg.appendChild(g);
    animateViewBox(baseViewBox);
    currentView = 'country';
    activeProvince = null;
    activeDistrict = null;
    updateBreadcrumb();
    showDefaultInfo();
}

/**
 * Renders a specific province view (individual districts)
 */
function renderProvinceView(provinceNum) {
    hideTooltip();
    const existingGroup = document.getElementById('provincesGroup');
    if (existingGroup) existingGroup.remove();

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.id = 'provincesGroup';

    const data = provincesData[provinceNum];
    data.features.forEach((feature, districtIndex) => {
        const coords = feature.geometry.coordinates;
        const pathData = geoToSvgPath(coords, globalBounds);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', `district-path province-${provinceNum}`);
        path.dataset.province = provinceNum;
        path.dataset.district = districtIndex;
        path.dataset.name = feature.properties.TARGET || feature.properties.DISTRICT;

        path.addEventListener('mouseenter', () => handleDistrictHover(provinceNum, districtIndex));
        path.addEventListener('mouseleave', handleDistrictLeave);
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            zoomToDistrict(provinceNum, districtIndex);
        });
        g.appendChild(path);
    });

    mapSvg.appendChild(g);
    const provinceBounds = calculateProvinceBounds(provinceNum);
    animateViewBox(boundsToViewBox(provinceBounds));
    currentView = 'province';
    activeProvince = provinceNum;
    activeDistrict = null;

    document.querySelectorAll('.district-path').forEach(path => path.style.display = 'block');
    document.getElementById('mapContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateBreadcrumb();
    showProvinceInfo(provinceNum);
}

/**
 * Zooms into a specific district and isolates it
 */
function zoomToDistrict(provinceNum, districtIndex) {
    if (currentView === 'district' && activeDistrict === districtIndex) return;
    hideTooltip();

    const feature = provincesData[provinceNum].features[districtIndex];
    const districtBounds = calculateFeatureBounds(feature);
    animateViewBox(boundsToViewBox(districtBounds, 50));

    document.querySelectorAll('.district-path').forEach(path => {
        path.classList.remove('active');
        if (parseInt(path.dataset.district) !== districtIndex) {
            path.style.display = 'none';
        } else {
            path.style.display = 'block';
            path.classList.add('active');
        }
    });

    currentView = 'district';
    activeDistrict = districtIndex;
    document.getElementById('mapContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateBreadcrumb();
    showDistrictInfo(provinceNum, districtIndex);
}

// Navigation helpers
function zoomToProvince(num) { renderProvinceView(num); }
function goToCountryView() { renderCountryView(); }
function goToProvinceView(num) { renderProvinceView(num); }

/**
 * Global back navigation with cooldown
 */
function goBack() {
    const now = Date.now();
    if (now - lastBackTime < NAV_COOLDOWN) return;
    lastBackTime = now;
    hideTooltip();

    if (currentView === 'district') {
        goToProvinceView(activeProvince);
    } else if (currentView === 'province') {
        goToCountryView();
    }
}

// Tooltip logic
function handleDistrictHover(provinceNum, districtIndex) {
    if (currentView !== 'province') return; // Fixed: Only show on province view
    const path = document.querySelector(`[data-district="${districtIndex}"]`);
    if (path) path.style.filter = 'brightness(1.2)';
    const feature = provincesData[provinceNum].features[districtIndex];
    showTooltip(feature.properties.TARGET || feature.properties.DISTRICT);
}

function handleDistrictLeave() {
    document.querySelectorAll('.district-path').forEach(path => {
        if (!path.classList.contains('active')) path.style.filter = '';
    });
    hideTooltip();
}

function showTooltip(text) {
    let tooltip = document.getElementById('mapTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'mapTooltip';
        tooltip.className = 'map-tooltip';
        document.querySelector('.map-container').appendChild(tooltip);
    }
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    document.addEventListener('mousemove', moveTooltip);
}

function moveTooltip(e) {
    const tooltip = document.getElementById('mapTooltip');
    if (tooltip) {
        tooltip.style.left = (e.clientX + 20) + 'px';
        tooltip.style.top = (e.clientY + 20) + 'px';
    }
}

function hideTooltip() {
    const tooltip = document.getElementById('mapTooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
        document.removeEventListener('mousemove', moveTooltip);
    }
}

// Interaction listeners
function highlightProvince(num) {
    document.querySelectorAll(`[data-province="${num}"]`).forEach(path => {
        if (path.classList.contains('province-path') || path.classList.contains('province-merged')) {
            path.style.filter = 'brightness(1.15)';
        }
    });
    const legendItem = document.querySelector(`.legend-item[data-province="${num}"]`);
    if (legendItem) legendItem.style.background = 'rgba(255, 255, 255, 0.15)';
}

function clearHighlight() {
    document.querySelectorAll('.province-merged, .province-path').forEach(p => p.style.filter = '');
    document.querySelectorAll('.legend-item').forEach(i => i.style.background = '');
}

function showDefaultInfo() {
    defaultInfo.classList.remove('hidden');
    provinceInfo.classList.add('hidden');
}

function showProvinceInfo(num) {
    const config = PROVINCES[num];
    const data = provincesData[num];
    const districts = data.features.map(f => ({
        name: f.properties.DISTRICT || f.properties.TARGET || 'Unknown',
        targetName: f.properties.TARGET || '',
        wards: parseInt(f.properties.WARDS) || 0,
        metro: parseInt(f.properties.METRO) || 0,
        smetro: parseInt(f.properties.SMETRO) || 0,
        mun: parseInt(f.properties.MUN) || 0,
        rmun: parseInt(f.properties.RMUN) || 0
    }));

    const totalLocalUnits = districts.reduce((sum, d) => sum + d.metro + d.smetro + d.mun + d.rmun, 0);
    document.getElementById('provinceNumber').textContent = num;
    document.getElementById('provinceNumber').style.background = config.color;
    document.getElementById('provinceName').textContent = config.name;
    document.getElementById('districtCount').textContent = districts.length;
    document.getElementById('totalWards').textContent = districts.reduce((sum, d) => sum + d.wards, 0);
    document.getElementById('localUnits').textContent = totalLocalUnits;
    document.getElementById('districtsGrid').innerHTML = districts.map((d, idx) =>
        `<span class="district-tag" onclick="zoomToDistrict(${num}, ${idx})" title="${d.targetName}">${d.targetName}</span>`
    ).join('');
    defaultInfo.classList.add('hidden');
    provinceInfo.classList.remove('hidden');
}

function showDistrictInfo(provinceNum, districtIndex) {
    const feature = provincesData[provinceNum].features[districtIndex];
    const props = feature.properties;
    const config = PROVINCES[provinceNum];
    const totalLocalUnits = (parseInt(props.METRO) || 0) + (parseInt(props.SMETRO) || 0) + (parseInt(props.MUN) || 0) + (parseInt(props.RMUN) || 0);

    document.getElementById('provinceNumber').textContent = '📍';
    document.getElementById('provinceNumber').style.background = config.color;
    document.getElementById('provinceName').textContent = props.TARGET || props.DISTRICT || 'Unknown';
    document.getElementById('districtCount').textContent = 1;
    document.getElementById('totalWards').textContent = props.WARDS || 0;
    document.getElementById('localUnits').textContent = totalLocalUnits;
    document.getElementById('districtsGrid').innerHTML = `
        <span class="district-tag">Metro: ${props.METRO || 0}</span>
        <span class="district-tag">Sub-Metro: ${props.SMETRO || 0}</span>
        <span class="district-tag">Municipality: ${props.MUN || 0}</span>
        <span class="district-tag">Rural Mun: ${props.RMUN || 0}</span>
    `;
    defaultInfo.classList.add('hidden');
    provinceInfo.classList.remove('hidden');
}

// Interaction Setup
function setupMapInteraction() {
    mapSvg.addEventListener('mousedown', startDrag);
    mapSvg.addEventListener('mousemove', drag);
    mapSvg.addEventListener('mouseup', endDrag);
    mapSvg.addEventListener('mouseleave', endDrag);
    mapSvg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) startDrag(e.touches[0]);
        else if (e.touches.length === 2) {
            isDragging = false;
            initialPinchDistance = getPinchDistance(e.touches);
            e.preventDefault();
        }
    });
    mapSvg.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) drag(e.touches[0]);
        else if (e.touches.length === 2 && initialPinchDistance) {
            const delta = initialPinchDistance - getPinchDistance(e.touches);
            if (delta > PINCH_THRESHOLD) { goBack(); initialPinchDistance = null; }
            e.preventDefault();
        }
    });
    mapSvg.addEventListener('touchend', () => { initialPinchDistance = null; endDrag(); });
    mapSvg.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); if (e.deltaY > 0) goBack(); } }, { passive: false });
}

function startDrag(e) { isDragging = true; startX = e.clientX; startY = e.clientY; mapSvg.style.cursor = 'grabbing'; }
function drag(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    const rect = mapSvg.getBoundingClientRect();
    if (rect.width === 0) return;
    currentViewBox.x -= dx * (currentViewBox.width / rect.width);
    currentViewBox.y -= dy * (currentViewBox.height / rect.height);
    mapSvg.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
}
function endDrag() { isDragging = false; mapSvg.style.cursor = ''; }
function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Backspace') goBack(); });
