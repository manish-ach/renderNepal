# Nepal Interactive Map - Documentation

This document provides a technical overview of the Nepal Interactive Map project, including its structure, modular architecture, core logic, and function references.

## 1. Project Structure
The project is divided into modular components to separate data logic from rendering and state management.

```text
.
├── index.html          # Main application structure
├── styles.css           # Styling, animations, and transitions
├── app.js               # Entry point and global state manager
├── map-logic.js         # Backend: Data and coordinate math
├── map-renderer.js      # Frontend: SVG rendering and interactions
└── Nepal-GEOJSON/       # Raw GeoJSON data files
    ├── province1.geojson
    ├── ...
    └── province7.geojson
```

---

## 2. Architecture & Connection
The application uses a "plug-and-play" logic split:

1.  **`map-logic.js` (The Engine)**: Handles everything related to geographical data. It doesn't know about IDs or SVG elements; it only cares about GeoJSON, Bounds, and Math.
2.  **`map-renderer.js` (The Painter)**: Handles the DOM. It receives coordinates from the logic layer and draws them as SVG paths. It also manages interactivity (dragging, pinching).
3.  **`app.js` (The Controller)**: Hooks everything together. It initializes the sequence, sets up listeners, and maintains the high-level `currentView` state.

---

## 3. Core Logic

### Coordinate Transformation
Since GeoJSON uses Latitude/Longitude and SVGs use pixels, we use a linear transformation:
- **Scaling**: We calculate the ratio between the geographical span (maxLon - minLon) and the SVG viewport width.
- **Flipping Y**: Map coordinates grow bottom-to-top (latitude), while SVG coordinates grow top-to-bottom. We flip this in `geoToSvgPath`.

### Navigation Drill-down
The map supports three states:
- **Country View**: Merged province shapes with no internal borders.
- **Province View**: Detailed district view for a selected province.
- **District View**: Isolation of a single district with all others hidden for focus.

### Transitions
Transitions are handled by `animateViewBox`. Instead of standard CSS animations which can be limited for `viewBox`, we use `requestAnimationFrame` with a cubic ease-out function for smooth, high-fidelity zooming.

---

## 4. Function Reference

### `map-logic.js` (Backend Logic)
| Function | Description |
| :--- | :--- |
| `loadAllProvinces()` | Fetches all 7 GeoJSON files from the local directory. |
| `geoToSvgPath(coords, bounds)` | Converts longitude/latitude arrays into valid SVG path `d` strings. |
| `calculateBounds()` | Finds the min/max lat/lon for the entire country of Nepal. |
| `calculateFeatureBounds(feature)` | Calculates the bounding box for a single district. |
| `calculateProvinceBounds(num)` | Calculates the bounding box for an entire province. |
| `boundsToViewBox(geoBounds)` | Map geographical bounds to SVG `viewBox` objects. |
| `mergeProvinceFeatures(features)` | Flattens complex GeoJSON features into drawable polygon arrays. |

### `map-renderer.js` (UI & Interaction)
| Function | Description |
| :--- | :--- |
| `renderCountryView()` | Draws the initial 7-province map with merged borders. |
| `renderProvinceView(num)` | Draws the detailed district map for a specific province. |
| `zoomToDistrict(p, d)` | Zooms smoothly to a district and hides sibling paths. |
| `animateViewBox(target)` | Frame-by-frame interpolation of the SVG viewBox. |
| `setupMapInteraction()` | Attaches listeners for Mouse, Touch, Wheel, and Keyboard. |
| `goBack()` | Handles single-level reverse navigation with a cooldown. |
| `handleDistrictHover()` | Manages tooltips (restricted to province view only). |

### `app.js` (Initialization)
| Function | Description |
| :--- | :--- |
| `init()` | The async orchestrator. Sequences fetching, bounding, and rendering. |

---

## 5. Interaction Features
- **Draggable Canvas**: Pan the map using `mousedown` / `mousemove`.
- **Pinch-to-Back**: Zoom out gesture on mobile or trackpad (Pinch-in) triggers the back button.
- **Viewport Focus**: Navigation automatically triggers `scrollIntoView` to keep the map centered.
- **Isolation**: In District view, sibling districts are set to `display: none` for visual clarity.
