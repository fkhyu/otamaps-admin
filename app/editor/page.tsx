'use client';

import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

interface WallFeature extends Feature<Polygon> {
  properties: {
    type: 'wall';
    width: number;
    height: number;
  };
}

interface FurnitureFeature extends Feature<Point> {
  properties: {
    type: 'furniture' | 'door';
    item: string;
    orientation: number;
  };
}

interface RoomFeature extends Feature<Polygon> {
  properties: {
    type: 'room';
    color: string;
    bookable: boolean;
    capacity: number;
    avEquipment: string[];
    purpose: string;
  };
}

const furnitureLibrary = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️' },
  { id: 'pool_table', name: 'Pool Table', icon: '🎱' },
  { id: 'door', name: 'Door', icon: '🚪' },
];

export default function Editor() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const [mode, setMode] = useState<'draw_wall' | 'draw_room' | 'place_furniture' | 'edit' | 'adjust_overlay'>('draw_wall');
  const [features, setFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [selectedFurniture, setSelectedFurniture] = useState<string | null>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const WALL_HEIGHT = 10;
  const [wallWidth, setWallWidth] = useState(0.3);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [overlayCoords, setOverlayCoords] = useState<number[][] | null>(null);
  const [overlaySize, setOverlaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [24.8182, 60.1842],
      zoom: 17,
      // pitch: 60, // Enable 3D perspective
      bearing: 0,
    });

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        line_string: true,
        polygon: true,
        trash: true,
      },
    });

    map.current.addControl(draw.current);

    map.current.on('load', () => {
      map.current!.addSource('features', {
        type: 'geojson',
        data: features,
      });

      map.current!.addLayer({
        id: 'walls',
        type: 'fill-extrusion',
        source: 'features',
        filter: ['==', ['get', 'type'], 'wall'],
        paint: {
          'fill-extrusion-color': '#4a4a4a', // Darker color for better 3D contrast
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.9, // Slightly more opaque for solidity
        },
      });

      map.current!.addLayer({
        id: 'furniture',
        type: 'symbol',
        source: 'features',
        filter: ['==', ['get', 'type'], 'furniture'],
        layout: {
          'icon-image': ['get', 'item'],
          'icon-size': 0.5,
          'icon-rotate': ['get', 'orientation'],
        },
      });

      map.current!.addLayer({
        id: 'rooms',
        type: 'fill',
        source: 'features',
        filter: ['==', ['get', 'type'], 'room'],
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.5,
        },
      });
    });

    map.current.on('draw.create', handleDrawCreate);
    map.current.on('click', handleMapClick);

    return () => map.current?.remove();
  }, []);

  // Overlay adjustment markers
  useEffect(() => {
    if (!map.current || !overlayCoords || mode !== 'adjust_overlay' || !overlayImage) {
      document.querySelectorAll('.overlay-marker').forEach((el) => el.remove());
      return;
    }

    const markers: mapboxgl.Marker[] = [];
    let rafId: number;
    let isDragging = false;

    // Create marker
    const createMarker = (color: string, position: number[], cornerIndex: number) => {
      const el = document.createElement('div');
      el.className = 'overlay-marker';
      el.style.backgroundColor = color;
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.cursor = 'move';
      const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(position);
      
      marker.on('dragstart', () => {
        isDragging = true;
        rafId = requestAnimationFrame(animate);
      });
      marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        const newCoords = [...overlayCoords];
        newCoords[cornerIndex] = [lngLat.lng, lngLat.lat];
        updateOverlay(newCoords);
      });
      marker.on('dragend', () => {
        isDragging = false;
        cancelAnimationFrame(rafId);
        const newCoords = [...overlayCoords];
        newCoords[cornerIndex] = [marker.getLngLat().lng, marker.getLngLat().lat];
        setOverlayCoords(newCoords);
      });

      return marker;
    };

    // Create markers for each corner
    const corners = [
      { color: 'green', index: 0 }, // Top-left
      { color: 'yellow', index: 1 }, // Top-right
      { color: 'red', index: 2 }, // Bottom-right
      { color: 'blue', index: 3 }, // Bottom-left
    ];

    corners.forEach(({ color, index }) => {
      const marker = createMarker(color, overlayCoords[index], index);
      markers.push(marker);
      marker.addTo(map.current!);
    });

    // Update overlay source
    const updateOverlay = (coords: number[][]) => {
      if (map.current!.getSource('overlay')) {
        (map.current!.getSource('overlay') as mapboxgl.ImageSource).updateImage({
          url: overlayImage,
          coordinates: coords,
        });
      }
    };

    // Animation loop for smooth updates
    const animate = () => {
      if (!isDragging) return;
      markers.forEach((marker, index) => {
        marker.setLngLat(overlayCoords[index]);
      });
      rafId = requestAnimationFrame(animate);
    };

    return () => {
      cancelAnimationFrame(rafId);
      markers.forEach((marker) => marker.remove());
    };
  }, [mode, overlayCoords, overlayImage]);

  // Overlay image and opacity handling
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (overlayImage && overlayCoords) {
      if (!map.current.getSource('overlay')) {
        map.current.addSource('overlay', {
          type: 'image',
          url: overlayImage,
          coordinates: overlayCoords,
        });

        map.current.addLayer({
          id: 'overlay',
          type: 'raster',
          source: 'overlay',
          paint: { 'raster-opacity': overlayOpacity },
        });
      } else {
        (map.current.getSource('overlay') as mapboxgl.ImageSource).updateImage({
          url: overlayImage,
          coordinates: overlayCoords,
        });
        map.current.setPaintProperty('overlay', 'raster-opacity', overlayOpacity);
      }
    } else if (map.current.getLayer('overlay')) {
      map.current.removeLayer('overlay');
      map.current.removeSource('overlay');
    }
  }, [overlayImage, overlayCoords, overlayOpacity]);

  useEffect(() => {
    if (map.current && map.current.getSource('features')) {
      (map.current.getSource('features') as mapboxgl.GeoJSONSource).setData(features);
    }
  }, [features]);

  const handleDrawCreate = (e: any) => {
    const newFeature = e.features[0];
    if (mode === 'draw_wall' && newFeature.geometry.type === 'LineString') {
      const line = turf.lineString(newFeature.geometry.coordinates);
      // const simplified = turf.simplify(line, { tolerance: 0.0001, highQuality: false });
      const cleaned = turf.truncate(line, { precision: 10 });

      let buffered: turf.Feature<Polygon>;
      try {
        buffered = turf.buffer(cleaned, Math.max(0.1, wallWidth / 2), { units: 'meters' });
        if (!buffered.geometry || buffered.geometry.type !== 'Polygon') {
          console.error('Invalid polygon geometry created during buffering');
          return;
        }
      } catch (err) {
        console.error('Turf buffering error:', err);
        return;
      }

      const wallFeature: WallFeature = {
        type: 'Feature',
        id: newFeature.id,
        geometry: buffered.geometry as Polygon,
        properties: {
          type: 'wall',
          width: wallWidth,
          height: WALL_HEIGHT, // Explicitly set to 5 meters
        },
      };

      setFeatures((prev) => ({
        ...prev,
        features: [...prev.features, wallFeature],
      }));

      // Avoid recursion loop
      setTimeout(() => {
        draw.current?.changeMode('draw_line_string');
      }, 0);
    } else if (mode === 'draw_room' && newFeature.geometry.type === 'Polygon') {
      const roomFeature: RoomFeature = {
        type: 'Feature',
        id: newFeature.id,
        geometry: newFeature.geometry as Polygon,
        properties: {
          type: 'room',
          color: '#ff0000',
          bookable: true,
          capacity: 10,
          avEquipment: [],
          purpose: 'Meeting',
        },
      };
      setFeatures({
        ...features,
        features: [...features.features, roomFeature],
      });
      draw.current?.changeMode('draw_polygon');
    }
  };

  const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
    if (mode === 'place_furniture' && selectedFurniture) {
      const point: FurnitureFeature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        },
        properties: {
          type: selectedFurniture === 'door' ? 'door' : 'furniture',
          item: selectedFurniture,
          orientation: 0,
        },
      };
      setFeatures({
        ...features,
        features: [...features.features, point],
      });
    } else if (mode === 'edit') {
      const featuresAtPoint = map.current!.queryRenderedFeatures(e.point, {
        layers: ['rooms'],
      });
      if (featuresAtPoint.length > 0) {
        setSelectedFeature(featuresAtPoint[0]);
      } else {
        setSelectedFeature(null);
      }
    }
  };

  const handleExportGeoJSON = () => {
    const blob = new Blob([JSON.stringify(features, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.geojson';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && map.current) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        setImageAspectRatio(aspectRatio);

        const center = map.current!.getCenter();
        const initialWidth = 0.002;
        const initialHeight = initialWidth / aspectRatio;
        const halfWidth = initialWidth / 2;
        const halfHeight = initialHeight / 2;
        const coords = [
          [center.lng - halfWidth, center.lat + halfHeight],
          [center.lng + halfWidth, center.lat + halfHeight],
          [center.lng + halfWidth, center.lat - halfHeight],
          [center.lng - halfWidth, center.lat - halfHeight],
        ];

        setOverlayImage(url);
        setOverlayCoords(coords);
        setOverlaySize({ width: initialWidth, height: initialHeight });
      };
    }
  };

  const updateRoomProperties = (properties: RoomFeature['properties']) => {
    if (!selectedFeature) return;
    setFeatures({
      ...features,
      features: features.features.map((f) =>
        f.id === selectedFeature.id ? { ...f, properties } : f
      ),
    });
    setSelectedFeature(null);
  };

  return (
    <div className="flex h-screen">
      <div className="w-64 bg-gray-100 p-4 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Editor Tools</h2>
        <div>
          <label className="block">Mode:</label>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as any);
              draw.current?.changeMode(
                e.target.value === 'draw_wall' ? 'draw_line_string' :
                e.target.value === 'draw_room' ? 'draw_polygon' : 'simple_select'
              );
            }}
            className="w-full p-2 border"
          >
            <option value="draw_wall">Draw Wall</option>
            <option value="draw_room">Draw Room</option>
            <option value="place_furniture">Place Furniture/Door</option>
            <option value="edit">Edit Room</option>
            <option value="adjust_overlay">Adjust Overlay</option>
          </select>
        </div>
        {mode === 'draw_wall' && (
          <div>
            <label>Wall Width (m):</label>
            <input
              type="number"
              value={wallWidth}
              onChange={(e) => setWallWidth(Number(e.target.value))}
              step="0.1"
              className="w-full p-2 border"
            />
          </div>
        )}
        {mode === 'place_furniture' && (
          <div>
            <label>Select Item:</label>
            <select
              value={selectedFurniture || ''}
              onChange={(e) => setSelectedFurniture(e.target.value || null)}
              className="w-full p-2 border"
            >
              <option value="">Select...</option>
              {furnitureLibrary.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.icon} {item.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label>Overlay Image:</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full" />
          <label>Overlay Opacity:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={handleExportGeoJSON}
          className="bg-blue-500 text-white p-2 rounded"
        >
          Export GeoJSON
        </button>
        {selectedFeature && selectedFeature.properties.type === 'room' && (
          <div>
            <h3>Edit Room</h3>
            <label>Color:</label>
            <input
              type="color"
              value={selectedFeature.properties.color}
              onChange={(e) =>
                updateRoomProperties({ ...selectedFeature.properties, color: e.target.value })
              }
              className="w-full"
            />
            <label>Bookable:</label>
            <input
              type="checkbox"
              checked={selectedFeature.properties.bookable}
              onChange={(e) =>
                updateRoomProperties({ ...selectedFeature.properties, bookable: e.target.checked })
              }
            />
            <label>Capacity:</label>
            <input
              type="number"
              value={selectedFeature.properties.capacity}
              onChange={(e) =>
                updateRoomProperties({ ...selectedFeature.properties, capacity: Number(e.target.value) })
              }
              className="w-full p-2 border"
            />
            <label>Purpose:</label>
            <input
              type="text"
              value={selectedFeature.properties.purpose}
              onChange={(e) =>
                updateRoomProperties({ ...selectedFeature.properties, purpose: e.target.value })
              }
              className="w-full p-2 border"
            />
          </div>
        )}
      </div>
      <div className="flex-1">
        <div ref={mapContainer} className="w-full h-full" />
      </div>
    </div>
  );
}