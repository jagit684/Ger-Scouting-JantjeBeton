let map;
let regionsData = [];
let layers = {};
const geocodeCache = {};

// Initialize map
function initMap() {
    // Default center (Netherlands - Eindhoven area based on your coords)
    const defaultCenter = [51.526, 5.058];

    map = L.map('map').setView(defaultCenter, 13);

    // Add CartoDB Voyager tiles (clean look, no bus stop icons)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Load regions data
    loadRegionsData();
}

// Geocode a street address using Nominatim, searching near a given center point
// Returns ALL matching segments (side-roads with same name)
async function geocodeStreet(streetName, searchCenter, searchRadius = 0.01) {
    // Remove any numbers in parentheses for better geocoding
    const cleanStreetName = streetName.replace(/\s*\(\d+\)\s*$/, '').trim();
    
    const cacheKey = `${cleanStreetName}_${searchCenter.lat}_${searchCenter.lng}_${searchRadius}`;
    
    if (geocodeCache[cacheKey]) {
        return geocodeCache[cacheKey];
    }

    try {
        // Search near the given center and request geometry; limit=50 to get all segments
        const searchQuery = encodeURIComponent(`${cleanStreetName}, Netherlands`);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=50&polygon_geojson=1&viewbox=${searchCenter.lng-searchRadius},${searchCenter.lat+searchRadius},${searchCenter.lng+searchRadius},${searchCenter.lat-searchRadius}&bounded=1&dedupe=0`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'RegionMapper/1.0'
            }
        });
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            // Collect all geometries into a GeometryCollection
            const geometries = [];
            let sumLat = 0, sumLng = 0, count = 0;

            for (const item of data) {
                if (item.geojson) {
                    geometries.push(item.geojson);
                }
                sumLat += parseFloat(item.lat);
                sumLng += parseFloat(item.lon);
                count++;
            }

            const result = {
                lat: sumLat / count,
                lng: sumLng / count,
                // Merge all geometries into a single GeometryCollection
                geojson: geometries.length > 1
                    ? { type: 'GeometryCollection', geometries: geometries }
                    : geometries[0] || null,
                boundingbox: data[0].boundingbox,
                segmentCount: data.length
            };
            geocodeCache[cacheKey] = result;
            
            // Be nice to Nominatim - rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return result;
        }
    } catch (error) {
        console.error(`Error geocoding ${cleanStreetName}:`, error);
    }
    
    return null;
}

// Calculate distance between two points in km (Haversine)
function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Geocode streets always searching from the region marker:
// 1. Always use the marker as the search center
// 2. Use a fixed search radius around the marker
// 3. Validate results by distance from the marker
async function geocodeStreetsChained(streets, regionCenter) {
    const results = {}; // streetName -> location
    const remaining = [...streets];
    
    const searchRadius = 0.0036; // ~400m around the marker
    
    let maxPasses = 3; // try multiple passes with expanding radius from marker
    
    for (let pass = 0; pass < maxPasses && remaining.length > 0; pass++) {
        const stillRemaining = [];
        
        // Each pass expands the radius from the marker
        const effectiveRadius = searchRadius * (pass + 1);
        
        for (let i = 0; i < remaining.length; i++) {
            const street = remaining[i];
            let found = false;
            
            // Always search from the marker position
            const location = await geocodeStreet(street, regionCenter, effectiveRadius);
            
            if (location) {
                // Check distance from the marker (not from previously found streets)
                const distFromMarker = distanceKm(
                    regionCenter.lat, regionCenter.lng,
                    location.lat, location.lng
                );
                
                // Accept if within reasonable distance from marker (scales with pass)
                if (distFromMarker <= 0.4 * (pass + 1)) {
                    results[street] = location;
                    found = true;
                }
            }
            
            if (!found) {
                stillRemaining.push(street);
            }
        }
        
        remaining.length = 0;
        remaining.push(...stillRemaining);
    }
    
    // Final fallback: try remaining streets with a wider search from the marker
    for (const street of remaining) {
        const location = await geocodeStreet(street, regionCenter, 0.009);
        if (location) {
            results[street] = location;
        }
    }
    
    return results;
}

// Load regions from JSON file
async function loadRegionsData() {
    try {
        const response = await fetch('regions.json');
        regionsData = await response.json();
        populateRegionSelect();
        initializeMarkers();
    } catch (error) {
        console.error('Error loading regions data:', error);
        alert('Error loading regions. Make sure regions.json exists.');
    }
}

// Initialize markers for all regions (called on page load)
function initializeMarkers() {
    // Create markers for each region (but don't draw streets yet)
    regionsData.regions.forEach(region => {
        // Add marker at region center with region id as text label
        const icon = L.divIcon({
            className: 'region-marker',
            html: `<div class="marker-label" style="background-color: ${region.color};">${region.id}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const marker = L.marker(
            [region.center.lat, region.center.lng],
            { icon: icon }
        ).addTo(map);

        marker.bindPopup(region.name);
        marker.on('click', () => {
            displayRegionInfo(region.id);
            const radio = document.querySelector(`input[name="region"][value="${region.id}"]`);
            if (radio) radio.checked = true;
        });

        layers[region.id] = { streets: [], marker };
    });

    // Clear info panel
    document.getElementById('regionInfo').innerHTML = '<p>Select a region to view details</p>';

    // Fit map to show all markers
    const markers = Object.values(layers).map(l => l.marker);
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

// Populate the region radio buttons
function populateRegionSelect() {
    const radioContainer = document.getElementById('regionRadios');
    
    regionsData.regions.forEach(region => {
        const label = document.createElement('label');
        label.className = 'radio-label';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'region';
        radio.value = region.id;
        radio.addEventListener('change', onRegionSelectChange);
        
        const span = document.createElement('span');
        span.textContent = region.name;
        
        label.appendChild(radio);
        label.appendChild(span);
        radioContainer.appendChild(label);
    });

    // Add change listeners to the default radio buttons
    document.querySelectorAll('input[name="region"]').forEach(radio => {
        radio.addEventListener('change', onRegionSelectChange);
    });
}

// Handle region selection change
function onRegionSelectChange(event) {
    const regionId = event.target.value;
    
    if (regionId === 'none') {
        clearAllStreets();
    } else if (!regionId) {
        displayAllRegions();
    } else {
        displayRegionInfo(regionId);
    }
}

// Clear all streets but keep markers
function clearAllStreets() {
    // Clear all street layers and show all markers
    Object.values(layers).forEach(layer => {
        if (layer.streets) {
            layer.streets.forEach(street => map.removeLayer(street));
            layer.streets = [];
        }
    });

    // Clear info panel
    document.getElementById('regionInfo').innerHTML = '<p>Select a region to view details</p>';

    // Fit map to show all markers
    const markers = Object.values(layers).map(l => l.marker).filter(Boolean);
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

// Display all regions with colors
async function displayAllRegions() {
    // Clear only street layers and show all markers
    Object.values(layers).forEach(layer => {
        if (layer.streets) {
            layer.streets.forEach(street => map.removeLayer(street));
            layer.streets = [];
        }
    });

    // Show loading message
    document.getElementById('regionInfo').innerHTML = '<p>Loading all streets on map...</p>';

    // Draw streets for each region
    for (const region of regionsData.regions) {
        const streetLayers = [];

        // Geocode streets using nearest-neighbor chaining
        const geocodedStreets = await geocodeStreetsChained(region.streets, region.center);
        
        for (const street of region.streets) {
            const location = geocodedStreets[street];
            
            if (location) {
                let streetLine = null;

                // If we have geometry data, draw the actual street line
                // Handles both single geometries (.coordinates) and GeometryCollections (.geometries)
                if (location.geojson && (location.geojson.coordinates || location.geojson.geometries)) {
                    streetLine = L.geoJSON(location.geojson, {
                        style: {
                            color: region.color,
                            weight: 6,
                            opacity: 0.8
                        }
                    }).addTo(map);
                } 
                // Fallback: if no geometry, create a small circle at the location
                else if (location.boundingbox) {
                    const bbox = location.boundingbox;
                    const center = [
                        (parseFloat(bbox[0]) + parseFloat(bbox[1])) / 2,
                        (parseFloat(bbox[2]) + parseFloat(bbox[3])) / 2
                    ];
                    
                    streetLine = L.circleMarker(center, {
                        radius: 5,
                        color: region.color,
                        fillColor: region.color,
                        fillOpacity: 0.6,
                        weight: 2
                    }).addTo(map);
                }

                if (streetLine) {
                    streetLine.bindPopup(`<strong>${street}</strong><br>${region.name}`);
                    streetLine.on('click', () => {
                        displayRegionInfo(region.id);
                        const radio = document.querySelector(`input[name="region"][value="${region.id}"]`);
                        if (radio) radio.checked = true;
                    });

                    streetLayers.push(streetLine);
                }
            }
        }

        layers[region.id].streets = streetLayers;
    }

    // Clear info panel
    document.getElementById('regionInfo').innerHTML = '<p>Select a region to view details</p>';

    // Fit map to show all streets
    const allLayers = Object.values(layers).flatMap(l => [...l.streets, l.marker]);
    if (allLayers.length > 0) {
        const group = L.featureGroup(allLayers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Display information for a specific region
async function displayRegionInfo(regionId) {
    const region = regionsData.regions.find(r => r.id === regionId);
    
    if (!region) return;

    // Clear streets from all regions, keep all markers visible
    Object.entries(layers).forEach(([id, layer]) => {
        if (layer.streets) {
            layer.streets.forEach(street => map.removeLayer(street));
            layer.streets = [];
        }
    });

    // Show loading message
    document.getElementById('regionInfo').innerHTML = '<p>Loading streets...</p>';

    // Load and draw streets for selected region using chained geocoding
    const streetLayers = [];
    const geocodedStreets = await geocodeStreetsChained(region.streets, region.center);
    
    for (const street of region.streets) {
        const location = geocodedStreets[street];
        
        if (location) {
            let streetLine = null;

            // If we have geometry data, draw the actual street line
            // Handles both single geometries (.coordinates) and GeometryCollections (.geometries)
            if (location.geojson && (location.geojson.coordinates || location.geojson.geometries)) {
                streetLine = L.geoJSON(location.geojson, {
                    style: {
                        color: region.color,
                        weight: 8,
                        opacity: 1
                    }
                }).addTo(map);
            } 
            // Fallback: if no geometry, create a small circle at the location
            else if (location.boundingbox) {
                const bbox = location.boundingbox;
                const center = [
                    (parseFloat(bbox[0]) + parseFloat(bbox[1])) / 2,
                    (parseFloat(bbox[2]) + parseFloat(bbox[3])) / 2
                ];
                
                streetLine = L.circleMarker(center, {
                    radius: 5,
                    color: region.color,
                    fillColor: region.color,
                    fillOpacity: 0.6,
                    weight: 2
                }).addTo(map);
            }

            if (streetLine) {
                streetLine.bindPopup(`<strong>${street}</strong><br>${region.name}`);
                streetLayers.push(streetLine);
            }
        }
    }

    // Store the street layers
    layers[regionId].streets = streetLayers;

    // Pan to region and fit bounds of its streets
    if (streetLayers.length > 0) {
        const group = L.featureGroup(streetLayers);
        map.fitBounds(group.getBounds().pad(0.2));
    } else {
        map.setView([region.center.lat, region.center.lng], 14);
    }

    // Update info panel
    const streetsHtml = region.streets
        .map(street => `<li><span class="color-indicator" style="background-color: ${region.color};"></span>${street}</li>`)
        .join('');

    document.getElementById('regionInfo').innerHTML = `
        <h3>${region.name}</h3>
        <p><strong>Color:</strong> <span class="color-indicator" style="background-color: ${region.color};"></span>${region.color}</p>
        <p><strong>Streets (${region.streets.length}):</strong></p>
        <ul class="street-list">
            ${streetsHtml}
        </ul>
    `;
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', initMap);
