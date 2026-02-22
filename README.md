# Region Mapper - OpenStreetMap Web App

A free, open-source web application that colors regions on interactive maps using OpenStreetMap. No API keys or payment required!

## Features

- **Free & Open Source**: Uses Leaflet and OpenStreetMap - completely free
- **Interactive Map Display**: Display multiple colored regions with detailed information
- **Region Selection**: Select regions from a dropdown or click directly on the map
- **Detailed Information**: View street listings and region details in the sidebar
- **Customizable Data**: Easy-to-modify JSON format for defining regions and streets
- **Responsive Design**: Works on desktop and mobile devices
- **No Dependencies**: Uses only Leaflet (lightweight library)

## Setup Instructions

### 1. No API Key Needed!

Unlike Google Maps, Leaflet with OpenStreetMap doesn't require any API keys or authentication. Just use it out of the box.

### 2. Customize Regions Data

Edit `regions.json` to define your regions and streets. Each region should have:

- **id**: Unique identifier
- **name**: Display name of the region
- **color**: Hex color code for the region
- **description**: Brief description
- **center**: Latitude and longitude coordinates
- **streets**: Array of street names in the region

Example:
```json
{
  "regions": [
    {
      "id": "region-1",
      "name": "My Region",
      "color": "#FF6B6B",
      "description": "Description of the region",
      "center": {
        "lat": 52.52,
        "lng": 13.405
      },
      "streets": ["Street 1", "Street 2", "Street 3"]
    }
  ]
}
```

### 3. Serve the App

Since this app uses the Fetch API to load the JSON file, you need to run it through a web server:

**Using Python 3:**
```bash
python -m http.server 8000
```

**Using Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

**Using Node.js (http-server):**
```bash
npx http-server
```

Then open `http://localhost:8000` in your browser.

## File Structure

```
.
├── index.html          # Main HTML file
├── styles.css          # Styling
├── script.js           # Leaflet & map logic
├── regions.json        # Region and street data
└── README.md           # This file
```

## How to Use

1. Open the app in your browser
2. The map displays region markers (colored circles)
3. Use the radio buttons in the sidebar to select:
   - **-- None --**: Shows only markers
   - **-- All Regions --**: Loads and displays all streets from all regions
   - **Specific region**: Shows only that region's streets
4. Click on a marker or street to select that region
5. The selected region's streets are highlighted and the map zooms to fit them

## Customization Options

### Adjust Circle Radius
In `script.js`, locate `displayAllRegions()` and change the `radius` value (in meters):
```javascript
radius: 1000, // 1km - change this value
```

### Change Map Style
You can use different tile providers. In `initMap()`, replace the tile layer URL:
```javascript
// Dark mode:
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {...}).addTo(map);

// Satellite:
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {...}).addTo(map);
```

### Highlight Style
Adjust opacity and stroke when a region is selected in `displayRegionInfo()`:
```javascript
circle.setStyle({
    fillOpacity: 0.5,  // Change this
    weight: 3          // Change this
});
```

## Browser Compatibility

- Chrome/Edge: ✅
- Firefox: ✅
- Safari: ✅
- Mobile browsers: ✅

## Libraries Used

- **[Leaflet](https://leafletjs.com/)** - Lightweight map library
- **[OpenStreetMap](https://www.openstreetmap.org/)** - Free map tiles

## License

MIT - Feel free to use and modify as needed.
