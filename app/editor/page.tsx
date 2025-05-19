'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Constants
const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';
const DEFAULT_CENTER: [number, number] = [24.8182, 60.1842];
const DEFAULT_ZOOM = 17;
const WALL_HEIGHT = 10;
const DEFAULT_WALL_WIDTH = 0.3;
const DEFAULT_OVERLAY_OPACITY = 0.5;
const MODEL_ROTATE = [Math.PI / 2, 0, 0];

// Furniture Dimensions (in meters, scaled for map)
const FURNITURE_SIZES = {
  sofa: { width: 0.0000002, height: 0.00000008, depth: 0.0000001 }, // Long and low
  chair: { width: 0.00000008, height: 0.0000001, depth: 0.00000008 }, // Small and tall
  table: { width: 0.00000015, height: 0.00000007, depth: 0.00000015 }, // Wide and flat
};

// Interfaces
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
    emoji: string;
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

interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
}

interface OverlaySize {
  width: number;
  height: number;
}

type EditorMode = 'draw_wall' | 'draw_room' | 'place_furniture' | 'edit' | 'adjust_overlay';

// Furniture Library
const furnitureLibrary: FurnitureItem[] = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️' },
  { id: 'chair', name: 'Chair', icon: '🪑' },
  { id: 'table', name: 'Table', icon: '🪵' },
  { id: 'cube', name: 'Cube', icon: '🚪' },
];

// Mapbox Configuration
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

const Editor: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const scene = useRef(new THREE.Scene()).current;
  const loader = useRef(new GLTFLoader()).current;

  // State
  const [mode, setMode] = useState<EditorMode>('draw_wall');
  const [features, setFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(DEFAULT_OVERLAY_OPACITY);
  const [wallWidth, setWallWidth] = useState(DEFAULT_WALL_WIDTH);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [overlayCoords, setOverlayCoords] = useState<number[][] | null>(null);
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({ width: 0, height: 0 });
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      antialias: true,
    });

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { line_string: true, polygon: true, trash: true },
    });

    map.current.addControl(draw.current);

    // Setup Three.js scene lighting
    setupSceneLighting(scene);

    // Map load handler
    map.current.on('load', () => initializeMapLayers());
    map.current.on('draw.create', handleDrawCreate);
    map.current.on('click', handleMapClick);

    return () => {
      map.current?.remove();
    };
  }, []);

  // Setup Three.js scene lighting
  const setupSceneLighting = (scene: THREE.Scene) => {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 0, 10);
    scene.add(directionalLight);
  };

  // Initialize map layers
  const initializeMapLayers = useCallback(() => {
    if (!map.current) return;

    map.current.addSource('features', {
      type: 'geojson',
      data: features,
    });

    map.current.addLayer({
      id: 'walls',
      type: 'fill-extrusion',
      source: 'features',
      filter: ['==', ['get', 'type'], 'wall'],
      paint: {
        'fill-extrusion-color': '#4a4a4a',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    });

    map.current.addLayer({
      id: 'rooms',
      type: 'fill',
      source: 'features',
      filter: ['==', ['get', 'type'], 'room'],
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.5,
      },
    });

    map.current.addLayer({
      id: '3d-model',
      type: 'custom',
      renderingMode: '3d',
      onAdd: function (map, gl) {
        this.camera = new THREE.PerspectiveCamera(
          75,
          map.getCanvas().width / map.getCanvas().height,
          0.000001,
          1000
        );
        this.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });
        this.renderer.autoClear = false;

        map.on('resize', () => {
          this.camera.aspect = map.getCanvas().width / map.getCanvas().height;
          this.camera.updateProjectionMatrix();
        });
      },
      render: function (gl, matrix) {
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4().copy(m).invert();
        this.camera.projectionMatrix = m;
        this.camera.matrixWorldInverse.copy(l);
        this.camera.matrixWorld.copy(l).invert();
        this.renderer.resetState();
        this.renderer.render(scene, this.camera);
        map.current?.triggerRepaint();
      },
    }, 'rooms');
  }, [scene, features]);

  // Handle overlay markers
  useEffect(() => {
    if (!map.current || !overlayCoords || mode !== 'adjust_overlay' || !overlayImage) {
      document.querySelectorAll('.overlay-marker').forEach((el) => el.remove());
      return;
    }

    const markers = createOverlayMarkers(map.current, overlayCoords, setOverlayCoords);
    return () => markers.forEach((marker) => marker.remove());
  }, [mode, overlayCoords, overlayImage]);

  // Handle overlay image and opacity
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (overlayImage && overlayCoords) {
      updateOverlayLayer(map.current, overlayImage, overlayCoords, overlayOpacity);
    } else if (map.current.getLayer('overlay')) {
      map.current.removeLayer('overlay');
      map.current.removeSource('overlay');
    }
  }, [overlayImage, overlayCoords, overlayOpacity]);

  // Update features source
  useEffect(() => {
    if (map.current && map.current.getSource('features')) {
      (map.current.getSource('features') as mapboxgl.GeoJSONSource).setData(features);
    }
  }, [features]);

  // Handle drag and drop
  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    const handleDropWrapper = (e: DragEvent) => handleDrop(e);
    const handleDragOver = (e: DragEvent) => e.preventDefault();

    container.addEventListener('drop', handleDropWrapper);
    container.addEventListener('dragover', handleDragOver);

    return () => {
      container.removeEventListener('drop', handleDropWrapper);
      container.removeEventListener('dragover', handleDragOver);
    };
  }, []);

  // Utility Functions
  const createOverlayMarkers = (map: mapboxgl.Map, coords: number[][], setCoords: React.Dispatch<React.SetStateAction<number[][] | null>>) => {
    const markers: mapboxgl.Marker[] = [];
    let rafId: number;
    let isDragging = false;

    const corners = [
      { color: 'green', index: 0 },
      { color: 'yellow', index: 1 },
      { color: 'red', index: 2 },
      { color: 'blue', index: 3 },
    ];

    corners.forEach(({ color, index }) => {
      const el = document.createElement('div');
      el.className = 'overlay-marker';
      el.style.backgroundColor = color;
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.cursor = 'move';

      const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(coords[index]);

      marker.on('dragstart', () => {
        isDragging = true;
        rafId = requestAnimationFrame(animate);
      });

      marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        setCoords((prev) => {
          if (!prev) return prev;
          const newCoords = [...prev];
          newCoords[index] = [lngLat.lng, lngLat.lat];
          updateOverlay(map, overlayImage!, newCoords);
          return newCoords;
        });
      });

      marker.on('dragend', () => {
        isDragging = false;
        cancelAnimationFrame(rafId);
      });

      markers.push(marker);
      marker.addTo(map);
    });

    const animate = () => {
      if (!isDragging) return;
      markers.forEach((marker, index) => {
        marker.setLngLat(coords[index]);
      });
      rafId = requestAnimationFrame(animate);
    };

    return markers;
  };

  const updateOverlay = (map: mapboxgl.Map, imageUrl: string, coords: number[][]) => {
    if (map.getSource('overlay')) {
      (map.getSource('overlay') as mapboxgl.ImageSource).updateImage({
        url: imageUrl,
        coordinates: coords,
      });
    }
  };

  const updateOverlayLayer = (map: mapboxgl.Map, imageUrl: string, coords: number[][], opacity: number) => {
    if (!map.getSource('overlay')) {
      map.addSource('overlay', {
        type: 'image',
        url: imageUrl,
        coordinates: coords,
      });

      map.addLayer({
        id: 'overlay',
        type: 'raster',
        source: 'overlay',
        paint: { 'raster-opacity': opacity },
      });
    } else {
      (map.getSource('overlay') as mapboxgl.ImageSource).updateImage({
        url: imageUrl,
        coordinates: coords,
      });
      map.setPaintProperty('overlay', 'raster-opacity', opacity);
    }
  };

  const handleDrawCreate = useCallback((e: any) => {
    const newFeature = e.features[0];

    if (mode === 'draw_wall' && newFeature.geometry.type === 'LineString') {
      try {
        const line = turf.lineString(newFeature.geometry.coordinates);
        const cleaned = turf.truncate(line, { precision: 10 });
        const buffered = turf.buffer(cleaned, Math.max(0.1, wallWidth / 2), { units: 'meters' });

        if (!buffered.geometry || buffered.geometry.type !== 'Polygon') {
          console.error('Invalid polygon geometry created during buffering');
          return;
        }

        const wallFeature: WallFeature = {
          type: 'Feature',
          id: newFeature.id,
          geometry: buffered.geometry as Polygon,
          properties: {
            type: 'wall',
            width: wallWidth,
            height: WALL_HEIGHT,
          },
        };

        setFeatures((prev) => ({
          ...prev,
          features: [...prev.features, wallFeature],
        }));

        draw.current?.changeMode('draw_line_string');
      } catch (err) {
        console.error('Turf buffering error:', err);
      }
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

      setFeatures((prev) => ({
        ...prev,
        features: [...prev.features, roomFeature],
      }));
      draw.current?.changeMode('draw_polygon');
    }
  }, [mode, wallWidth]);

  const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (mode !== 'edit' || !map.current) return;

    const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
      layers: ['rooms'],
    });

    setSelectedFeature(featuresAtPoint.length > 0 ? featuresAtPoint[0] : null);
  }, [mode]);

  const handleExportGeoJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(features, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }, [features]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (!map.current || !mapContainer.current) return;

    const json = e.dataTransfer?.getData('application/json');
    if (!json) return;

    const data = JSON.parse(json);
    const rect = mapContainer.current.getBoundingClientRect();
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const lngLat = map.current.unproject(point);
    const pointFeature: FurnitureFeature = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lngLat.lng, lngLat.lat],
      },
      properties: {
        type: data.id === 'cube' ? 'door' : 'furniture',
        item: data.id,
        emoji: data.icon,
        orientation: 0,
      },
    };

    setFeatures((prev) => ({
      ...prev,
      features: [...prev.features, pointFeature],
    }));

    const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: lngLat.lng, lat: lngLat.lat },
      0.1
    );

    if (data.id === 'cube') {
      // Load 3D model for door (cube)
      const modelPath = `/3d/${data.id}.glb`;
      loader.load(
        modelPath,
        (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);

          const maxDim = Math.max(size.x, size.y, size.z);
          const targetSize = 0.0000002;
          const scale = targetSize / maxDim;

          model.scale.set(scale, scale, scale);
          model.position.set(mercatorCoord.x, mercatorCoord.y, mercatorCoord.z);
          model.rotation.set(...MODEL_ROTATE);

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0xaaaaaa,
                roughness: 0.8,
                metalness: 0.3,
              });
            }
          });

          scene.add(model);
          map.current?.triggerRepaint();
        },
        undefined,
        (error) => console.error(`Failed to load ${modelPath}:`, error)
      );
    } else {
      // Create geometric shape for sofa, chair, or table
      const sizes = FURNITURE_SIZES[data.id as keyof typeof FURNITURE_SIZES];
      if (!sizes) return;

      const geometry = new THREE.BoxGeometry(sizes.width, sizes.height, sizes.depth);
      const material = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 0.8,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(mercatorCoord.x, mercatorCoord.y, mercatorCoord.z);
      mesh.rotation.set(...MODEL_ROTATE);

      scene.add(mesh);
      map.current?.triggerRepaint();
    }
  }, [scene]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !map.current) return;

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
  }, []);

  const updateRoomProperties = useCallback((properties: RoomFeature['properties']) => {
    if (!selectedFeature) return;

    setFeatures((prev) => ({
      ...prev,
      features: prev.features.map((f) =>
        f.id === selectedFeature.id ? { ...f, properties } : f
      ),
    }));
    setSelectedFeature(null);
  }, [selectedFeature]);

  // Render
  return (
    <div className="flex h-screen">
      <div className="w-1/6 bg-gray-100 p-4 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Editor Tools</h2>
        <div>
          <label className="block">Mode:</label>
          <select
            value={mode}
            onChange={(e) => {
              const newMode = e.target.value as EditorMode;
              setMode(newMode);
              draw.current?.changeMode(
                newMode === 'draw_wall' ? 'draw_line_string' :
                newMode === 'draw_room' ? 'draw_polygon' : 'simple_select'
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
            <div className="grid grid-cols-2 gap-2">
              {furnitureLibrary.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify(item));
                  }}
                  className="bg-white border p-2 rounded cursor-move flex items-center gap-2"
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
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
};

export default Editor;