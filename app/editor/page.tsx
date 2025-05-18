'use client';

import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

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

const furnitureLibrary = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️' },
  { id: 'pool_table', name: 'Pool Table', icon: '🎱' },
  { id: 'cube', name: 'Cube', icon: '🚪' },
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
  const modelScale = 1;
  const modelRotate = [Math.PI / 2, 0, 0];
  const scene = new THREE.Scene();
  const loader = new GLTFLoader();

  // Map initialization
useEffect(() => {
  if (!mapContainer.current) return;

  map.current = new mapboxgl.Map({
    container: mapContainer.current,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [24.8182, 60.1842],
    zoom: 17,
    bearing: 0,
    antialias: true,
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

  // Add lighting to the Three.js scene
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft ambient light
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5); // Directional light
  directionalLight.position.set(0, 0, 10); // Position above the scene
  scene.add(directionalLight);

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
        'fill-extrusion-color': '#4a4a4a',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
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

    map.current!.addLayer(
      {
        id: '3d-model',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
          // Create a PerspectiveCamera
          this.camera = new THREE.PerspectiveCamera(
            75, // Field of view
            map.getCanvas().width / map.getCanvas().height, // Aspect ratio
            0.000001, // Near plane
            1000 // Far plane
          );
          this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true,
          });
          this.renderer.autoClear = false;
          // Update camera aspect ratio on map resize
          map.on('resize', () => {
            this.camera.aspect = map.getCanvas().width / map.getCanvas().height;
            this.camera.updateProjectionMatrix();
          });
        },
        render: function (gl, matrix) {
          const m = new THREE.Matrix4().fromArray(matrix);
          // Decompose Mapbox matrix to set camera position and orientation
          const l = new THREE.Matrix4().copy(m).invert();
          this.camera.projectionMatrix = m;
          this.camera.matrixWorldInverse.copy(l);
          this.camera.matrixWorld.copy(l).invert();
          this.renderer.resetState();
          this.renderer.render(scene, this.camera);
          map.current?.triggerRepaint();
        },
      },
      'rooms'
    );
    
  });

  map.current.on('draw.create', handleDrawCreate);
  map.current.on('click', handleMapClick);

  return () => map.current?.remove();
}, []);

  // Overlay adjustment markers
  useEffect(() => {
    (window as any).features = features;
    if (!map.current || !overlayCoords || mode !== 'adjust_overlay' || !overlayImage) {
      document.querySelectorAll('.overlay-marker').forEach((el) => el.remove());
      return;
    }

    const markers: mapboxgl.Marker[] = [];
    let rafId: number;
    let isDragging = false;

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

    const corners = [
      { color: 'green', index: 0 },
      { color: 'yellow', index: 1 },
      { color: 'red', index: 2 },
      { color: 'blue', index: 3 },
    ];

    corners.forEach(({ color, index }) => {
      const marker = createMarker(color, overlayCoords[index], index);
      markers.push(marker);
      marker.addTo(map.current!);
    });

    const updateOverlay = (coords: number[][]) => {
      if (map.current!.getSource('overlay')) {
        (map.current!.getSource('overlay') as mapboxgl.ImageSource).updateImage({
          url: overlayImage,
          coordinates: coords,
        });
      }
    };

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
          height: WALL_HEIGHT,
        },
      };

      setFeatures((prev) => ({
        ...prev,
        features: [...prev.features, wallFeature],
      }));

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
    if (mode === 'edit') {
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

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();

    const json = e.dataTransfer?.getData('application/json');
    if (!json || !map.current) return;

    const data = JSON.parse(json);
    const rect = mapContainer.current!.getBoundingClientRect();
    const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };

    const lngLat = map.current.unproject(point);

    // Create a feature for ALL furniture items including door
    const pointFeature: FurnitureFeature = {
        type: 'Feature',
        geometry: {
        type: 'Point',
        coordinates: [lngLat.lng, lngLat.lat],
        },
        properties: {
        type: data.id === 'door' ? 'door' : 'furniture',
        item: data.id,
        emoji: data.icon,
        orientation: 0,
        },
    };

    // Add to features for ALL furniture types
    setFeatures((prev) => ({
        ...prev,
        features: [...prev.features, pointFeature],
    }));

    console.log('Dropped ' + pointFeature.properties.item + ' coordinates:', pointFeature.geometry.coordinates);

    const modelPath = `/3d/${data.id}.glb`;
    const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
        { lng: lngLat.lng, lat: lngLat.lat },
        0.0001 // Slight z-offset to avoid clipping with ground
    );

    loader.load(
        modelPath,
        (gltf) => {
            const model = gltf.scene;

            // Calculate model size
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            console.log(`Loaded ${data.id} model size:`, size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetSize = 0.0000002; // or adjust to your needs (Mercator units ~ meters)
            const scale = targetSize / maxDim;

            model.scale.set(scale, scale, scale);
            model.position.set(mercatorCoord.x, mercatorCoord.y, mercatorCoord.z);
            model.rotation.set(Math.PI / 2, 0, 0);

            // Optionally adjust material to be safe
            model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.material = new THREE.MeshStandardMaterial({
                color: 0xaaaaaa,
                roughness: 0.8,
                metalness: 0.3,
                // wireframe: true,
                });
            }
            });

            scene.add(model);
            map.current?.triggerRepaint();
        },
        undefined,
        (error) => {
            console.error(`Failed to load ${modelPath}:`, error);
        }
        );

    };

useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    const handleDropWrapper = (e: DragEvent) => handleDrop(e);

    container.addEventListener('drop', handleDropWrapper);
    container.addEventListener('dragover', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('drop', handleDropWrapper);
      container.removeEventListener('dragover', (e) => e.preventDefault());
    };
  }, []);

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
      <div className="w-1/6 bg-gray-100 p-4 flex flex-col gap-4">
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
}