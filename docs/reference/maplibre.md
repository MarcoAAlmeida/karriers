# MapLibre GL JS Reference

## Overview

MapLibre GL JS is an open-source TypeScript library for interactive, customizable vector maps on the web. It provides GPU-accelerated rendering of vector tiles and raster tiles, with support for custom styles, layers, and interactions.

### Key Features

- **GPU-Accelerated Rendering**: Fast rendering of vector and raster tiles
- **Custom Styling**: Full control over map appearance with MapLibre Style Specification
- **Interactive Controls**: Built-in controls for navigation, geolocation, etc.
- **Custom Layers**: Support for custom WebGL layers and overlays
- **Terrain Support**: 3D terrain rendering with elevation data
- **Globe View**: 3D globe projection support
- **Plugin Ecosystem**: Extensible with plugins for additional functionality

### Architecture

MapLibre GL JS consists of:
- **MapLibre GL JS**: Main web library for rendering maps
- **MapLibre Native**: Mobile and desktop rendering engines
- **Style Specification**: JSON schema for map styling
- **Tile Specification**: Protocol for serving map tiles

## API Reference

### Core Classes

#### Map
The main map class that manages the map instance, rendering, and interactions.

**Constructor:**
```typescript
new Map(options: MapOptions)
```

**Key Options:**
- `container`: HTML element or element ID
- `center`: Initial center coordinates [lng, lat]
- `zoom`: Initial zoom level
- `style`: Style specification URL or object
- `hash`: Enable URL hash for map state

**Key Methods:**
- `addLayer(layer: LayerSpecification)`: Add a layer to the map
- `addSource(id: string, source: SourceSpecification)`: Add a data source
- `flyTo(options: FlyToOptions)`: Smoothly animate to a new view
- `jumpTo(options: JumpToOptions)`: Instantly change map view
- `project(lngLat: LngLatLike): Point`: Convert geographic to pixel coordinates
- `unproject(point: PointLike): LngLat`: Convert pixel to geographic coordinates
- `on(type: string, listener: Function)`: Add event listener
- `queryRenderedFeatures(geometry?: Geometry, options?: QueryRenderedFeaturesOptions)`: Query visible features

**Events:**
- `load`: Fired when map is fully loaded
- `click`: Fired on map click
- `move`: Fired during map movement
- `zoom`: Fired during zoom changes

#### LngLat
Represents geographic coordinates.

**Constructor:**
```typescript
new LngLat(lng: number, lat: number)
```

**Methods:**
- `wrap()`: Wrap longitude to [-180, 180]
- `toArray()`: Convert to [lng, lat] array
- `distanceTo(other: LngLat)`: Calculate distance in meters

#### Controls
Built-in UI controls for map interaction.

- `NavigationControl`: Zoom and rotation controls
- `GeolocateControl`: User location tracking
- `AttributionControl`: Copyright attribution
- `ScaleControl`: Scale bar
- `FullscreenControl`: Fullscreen toggle

### Sources
Data sources for map layers.

- **Vector Sources**: GeoJSON, vector tiles (MVT)
- **Raster Sources**: Raster tiles, satellite imagery
- **Image Sources**: Static images
- **Video Sources**: Video overlays
- **Canvas Sources**: Dynamic canvas content

### Layers
Visual representations of data.

- **Fill Layer**: Polygon fills
- **Line Layer**: Lines and polylines
- **Circle Layer**: Point circles
- **Symbol Layer**: Icons and text labels
- **Fill Extrusion Layer**: 3D buildings
- **Heatmap Layer**: Density visualization
- **Hillshade Layer**: Terrain shading

## Examples

### Basic Map Initialization
```typescript
import { Map } from 'maplibre-gl';

const map = new Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-122.4194, 37.7749], // San Francisco
  zoom: 12
});
```

### Adding a GeoJSON Layer
```typescript
map.on('load', () => {
  map.addSource('points', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749]
        },
        properties: {
          title: 'San Francisco'
        }
      }]
    }
  });

  map.addLayer({
    id: 'points',
    type: 'circle',
    source: 'points',
    paint: {
      'circle-radius': 6,
      'circle-color': '#B42222'
    }
  });
});
```

### Click Events
```typescript
map.on('click', 'points', (e) => {
  const coordinates = e.features[0].geometry.coordinates.slice();
  const description = e.features[0].properties.title;

  new Popup()
    .setLngLat(coordinates)
    .setHTML(`<h3>${description}</h3>`)
    .addTo(map);
});
```

### Custom Style Layer
```typescript
map.on('load', () => {
  map.addLayer({
    id: 'custom',
    type: 'custom',
    renderingMode: '3d',
    onAdd: function(map, gl) {
      // Initialize custom WebGL content
    },
    render: function(gl, matrix) {
      // Render custom content
    }
  });
});
```

## Integration Patterns

### With PixiJS Overlays

For integrating MapLibre with PixiJS (as in Karriers):

1. **Separate Canvases**: MapLibre owns its canvas, PixiJS owns its own canvas
2. **Viewport Synchronization**: Sync zoom, pan, and rotation between both
3. **Coordinate Transformation**: Convert between geographic and pixel coordinates
4. **Layer Ordering**: Position PixiJS canvas above MapLibre canvas
5. **Event Coordination**: Handle interactions that affect both systems

### Coordinate Systems

- **Geographic**: Longitude/Latitude (LngLat)
- **Mercator**: Web Mercator projection coordinates
- **Pixel**: Screen pixel coordinates relative to map container
- **Hex Grid**: Game-specific coordinate system (as in Karriers)

### Performance Considerations

- **Tile Loading**: Efficient tile caching and loading strategies
- **Style Optimization**: Minimize style complexity for better performance
- **Layer Management**: Add/remove layers dynamically to reduce overhead
- **Event Throttling**: Debounce rapid events like mouse move

## Karriers Integration Notes

### Sprint 8 Requirements

Based on roadmap.md, Sprint 8 focuses on integrating MapTiler Ocean basemap:

- **Anchor Point**: Hex (35, 55) ↔ (28.21°N, 177.37°W) - Midway Atoll
- **Scale**: 20 NM per hex
- **Transparency**: Ocean layers should be transparent for tactical overlays
- **Sync Requirements**: Wheel/drag/zoom pans both PixiJS and MapLibre
- **Fallback**: PixiJS-drawn terrain tiles when MapTiler key unavailable

### Implementation Approach

1. **useMapLibre Composable**: Create composable to manage MapLibre instance
2. **Coordinate Conversion**: Implement hexToLatLon and latLonToHex functions
3. **Viewport Sync**: Listen to MapLibre events and update PixiJS camera
4. **Layer Transparency**: Configure style to make ocean layers transparent
5. **Error Handling**: Graceful fallback to PixiJS rendering

### Key Functions Needed

```typescript
// Coordinate conversion utilities
function hexToLatLon(hexCoord: HexCoord): LngLat
function latLonToHex(lngLat: LngLat): HexCoord

// Viewport synchronization
function syncPixiToMapLibre(map: Map, pixiApp: PIXI.Application)
function syncMapLibreToPixi(map: Map, pixiApp: PIXI.Application)
```

### Style Configuration

For transparent ocean basemap:
```json
{
  "sources": {
    "ocean": {
      "type": "raster",
      "tiles": ["https://api.maptiler.com/tiles/ocean/{z}/{x}/{y}.png?key={key}"],
      "tileSize": 256
    }
  },
  "layers": [{
    "id": "ocean",
    "type": "raster",
    "source": "ocean",
    "paint": {
      "raster-opacity": 0.7
    }
  }]
}
```

## Resources

- [Official Documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [API Reference](https://maplibre.org/maplibre-gl-js/docs/API/)
- [Examples](https://maplibre.org/maplibre-gl-js/docs/examples/)
- [Style Specification](https://maplibre.org/maplibre-style-spec/)
- [GitHub Repository](https://github.com/maplibre/maplibre-gl-js)

## Plugins

- **maplibre-gl-geocoder**: Address search and geocoding
- **maplibre-gl-draw**: Drawing tools for geometries
- **maplibre-gl-terradraw**: Advanced drawing capabilities
- **PMTiles**: Efficient tile storage and serving
- **Sync-move**: Synchronize multiple map instances