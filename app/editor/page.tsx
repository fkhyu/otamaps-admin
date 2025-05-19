'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

// Constants
const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';
const DEFAULT_CENTER: [number, number] = [24.8182, 60.1842];
const DEFAULT_ZOOM = 17;
const WALL_HEIGHT = 10;
const DEFAULT_WALL_WIDTH = 0.3;
const DEFAULT_OVERLAY_OPACITY = 0.5;

// Furniture Dimensions (in meters, scaled for map)
const FURNITURE_SIZES = {
  sofa: { width: 2, height: 0.3, depth: 0.7 }, // Longer, lower
  chair: { width: 0.7, height: 0.35, depth: 0.7 }, // Taller, smaller footprint (cylinder)
  table: { width: 1.5, height: 0.5, depth: 2 }, // Wider, flatter
  cube: { width: 1, height: 1, depth: 1 }, // Door (cube)
};

// Interfaces
interface WallFeature extends Feature<Polygon> {
  properties: {
    type: 'wall';
    width: number;
    height: number;
  };
}

interface FurnitureFeature extends Feature<Polygon> {
  properties: {
    type: 'furniture' | 'door';
    item: string;
    emoji: string;
    orientation: number;
    height: number;
    shape: 'cube' | 'cylinder';
    scaleX: number; // Added for resizing
    scaleY: number; // Added for resizing
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
  shape: 'cube' | 'cylinder';
}

interface OverlaySize {
  width: number;
  height: number;
}

// Extended EditorMode to include furniture manipulation
type EditorMode = 'draw_wall' | 'draw_room' | 'place_furniture' | 'edit' | 'adjust_overlay' | 'edit_furniture';

// Furniture Library
const furnitureLibrary: FurnitureItem[] = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️', shape: 'cube' },
  { id: 'chair', name: 'Chair', icon: '🪑', shape: 'cylinder' },
  { id: 'table', name: 'Table', icon: '🪵', shape: 'cube' },
  { id: 'cube', name: 'Cube', icon: '🚪', shape: 'cube' },
];

// Mapbox Configuration
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

const Editor: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);

  // State
  const [mode, setMode] = useState<EditorMode>('draw_wall');
  const [wallFeatures, setWallFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [roomFeatures, setRoomFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [furnitureFeatures, setFurnitureFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(DEFAULT_OVERLAY_OPACITY);
  const [wallWidth, setWallWidth] = useState(DEFAULT_WALL_WIDTH);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [overlayCoords, setOverlayCoords] = useState<number[][] | null>(null);
  const [overlaySize, setOverlaySize] = useState<OverlaySize>({ width: 0, height: 0 });
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureFeature | null>(null); // Added for furniture editing

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

    // Map load handler
    map.current.on('load', () => initializeMapLayers());
    map.current.on('draw.create', handleDrawCreate);
    map.current.on('click', handleMapClick);

    // Add mousedown for furniture dragging
    map.current.on('mousedown', handleFurnitureMouseDown);

    return () => {
      map.current?.remove();
    };
  }, []);

  // Initialize map layers
  const initializeMapLayers = useCallback(() => {
    if (!map.current) return;

    // Source and layer for walls
    map.current.addSource('walls', {
      type: 'geojson',
      data: wallFeatures,
    });

    map.current.addLayer({
      id: 'walls',
      type: 'fill-extrusion',
      source: 'walls',
      filter: ['==', ['get', 'type'], 'wall'],
      paint: {
        'fill-extrusion-color': '#4a4a4a',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    });

    // Source and layer for rooms
    map.current.addSource('rooms', {
      type: 'geojson',
      data: roomFeatures,
    });

    map.current.addLayer({
      id: 'rooms',
      type: 'fill',
      source: 'rooms',
      filter: ['==', ['get', 'type'], 'room'],
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.5,
      },
    });

    // Source and layer for furniture
    map.current.addSource('furniture', {
      type: 'geojson',
      data: furnitureFeatures,
    });

    map.current.addLayer({
      id: 'furniture',
      type: 'fill-extrusion',
      source: 'furniture',
      filter: ['==', ['get', 'type'], 'furniture'],
      paint: {
        'fill-extrusion-color': '#fffce8',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    });

    map.current.addLayer({
      id: 'doors',
      type: 'fill-extrusion',
      source: 'furniture',
      filter: ['==', ['get', 'type'], 'door'],
      paint: {
        'fill-extrusion-color': '#4a4a4a', // Match wall color for doors
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    });

    // Add selection highlight layer
    map.current.addLayer({
      id: 'furniture-selected',
      type: 'line',
      source: 'furniture',
      paint: {
        'line-color': '#00ff00',
        'line-width': 3,
        'line-opacity': ['case', ['==', ['get', 'id'], selectedFurniture?.id || ''], 1, 0],
      },
    });
  }, [wallFeatures, roomFeatures, furnitureFeatures, selectedFurniture]);

  // Handle overlay markers
  useEffect(() => {
    if (!map.current || !overlayCoords || mode !== 'adjust_overlay' || !overlayImage) {
      document.querySelectorAll('.overlay-marker').forEach((el) => el.remove());
      return;
    }

    const markers = createOverlayMarkers(map.current, overlayCoords, setOverlayCoords);
    return () => markers.forEach((marker) => marker.remove());
  }, [mode, overlayCoords, overlayImage]);

  // Handle furniture resize and rotate markers
  useEffect(() => {
    if (!map.current || !selectedFurniture || mode !== 'edit_furniture') {
      document.querySelectorAll('.furniture-marker').forEach((el) => el.remove());
      return;
    }

    const markers = createFurnitureMarkers(map.current, selectedFurniture, updateFurnitureTransform);
    return () => markers.forEach((marker) => marker.remove());
  }, [selectedFurniture, mode]);

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

  // Update sources
  useEffect(() => {
    if (map.current && map.current.getSource('walls')) {
      (map.current.getSource('walls') as mapboxgl.GeoJSONSource).setData(wallFeatures);
    }
  }, [wallFeatures]);

  useEffect(() => {
    if (map.current && map.current.getSource('rooms')) {
      (map.current.getSource('rooms') as mapboxgl.GeoJSONSource).setData(roomFeatures);
    }
  }, [roomFeatures]);

  useEffect(() => {
    if (map.current && map.current.getSource('furniture')) {
      (map.current.getSource('furniture') as mapboxgl.GeoJSONSource).setData(furnitureFeatures);
    }
  }, [furnitureFeatures]);

  // Handle drag and drop for placing furniture
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

  const createFurnitureMarkers = (
    map: mapboxgl.Map,
    furniture: FurnitureFeature,
    updateTransform: (transform: { orientation?: number; scaleX?: number; scaleY?: number }) => void
  ) => {
    const markers: mapboxgl.Marker[] = [];
    const bbox = turf.bbox(furniture);
    const [minX, minY, maxX, maxY] = bbox;

    // Resize handles (corners)
    const corners = [
      { position: 'top-left', lng: minX, lat: maxY, cursor: 'nwse-resize' },
      { position: 'top-right', lng: maxX, lat: maxY, cursor: 'nesw-resize' },
      { position: 'bottom-right', lng: maxX, lat: minY, cursor: 'nwse-resize' },
      { position: 'bottom-left', lng: minX, lat: minY, cursor: 'nesw-resize' },
    ];

    // Rotation handle (slightly offset from top-right)
    const centroid = turf.centroid(furniture).geometry.coordinates;
    const rotationHandleOffset = 0.0001; // Adjust as needed
    const rotationHandle = {
      position: 'rotate',
      lng: maxX + rotationHandleOffset,
      lat: maxY,
      cursor: 'grab',
    };

    const allMarkers = [...corners, rotationHandle];

    allMarkers.forEach(({ position, lng, lat, cursor }) => {
      const el = document.createElement('div');
      el.className = 'furniture-marker';
      el.style.backgroundColor = position === 'rotate' ? 'purple' : 'orange';
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.borderRadius = position === 'rotate' ? '50%' : '0';
      el.style.cursor = cursor;

      const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]);

      marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        if (position === 'rotate') {
          // Calculate rotation angle based on drag
          const newAngle = Math.atan2(lngLat.lat - centroid[1], lngLat.lng - centroid[0]) * (180 / Math.PI);
          updateTransform({ orientation: newAngle });
        } else {
          // Calculate scaling based on corner drag
          const newBbox = [...bbox];
          if (position.includes('left')) newBbox[0] = lngLat.lng;
          if (position.includes('right')) newBbox[2] = lngLat.lng;
          if (position.includes('top')) newBbox[3] = lngLat.lat;
          if (position.includes('bottom')) newBbox[1] = lngLat.lat;

          const originalWidth = maxX - minX;
          const originalHeight = maxY - minY;
          const newWidth = newBbox[2] - newBbox[0];
          const newHeight = newBbox[3] - newBbox[1];

          const scaleX = newWidth / originalWidth;
          const scaleY = newHeight / originalHeight;

          updateTransform({ scaleX: Math.max(0.1, scaleX), scaleY: Math.max(0.1, scaleY) });
        }
      });

      markers.push(marker);
      marker.addTo(map);
    });

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
        //   console.error('Invalid polygon geometry created during buffering');
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

        setWallFeatures((prev) => ({
          ...prev,
          features: [...prev.features, wallFeature],
        }));

        draw.current?.changeMode('draw_line_string');
      } catch (err) {
        // console.error('Turf buffering error:', err);
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

      setRoomFeatures((prev) => ({
        ...prev,
        features: [...prev.features, roomFeature],
      }));
      draw.current?.changeMode('draw_polygon');
    }
  }, [mode, wallWidth]);

  const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!map.current) return;

    if (mode === 'edit') {
      const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
        layers: ['rooms'],
      });
      setSelectedFeature(featuresAtPoint.length > 0 ? featuresAtPoint[0] : null);
      setSelectedFurniture(null);
    } else if (mode === 'edit_furniture') {
      const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
        layers: ['furniture', 'doors'],
      });
      setSelectedFurniture(featuresAtPoint.length > 0 ? (featuresAtPoint[0] as FurnitureFeature) : null);
      setSelectedFeature(null);
    }
  }, [mode]);

  const handleFurnitureMouseDown = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (mode !== 'edit_furniture' || !map.current || !selectedFurniture) return;

    const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
      layers: ['furniture', 'doors'],
    });

    if (featuresAtPoint.length > 0 && featuresAtPoint[0].id === selectedFurniture.id) {
      const onMouseMove = (moveEvent: mapboxgl.MapMouseEvent) => {
        const delta = [
          moveEvent.lngLat.lng - e.lngLat.lng,
          moveEvent.lngLat.lat - e.lngLat.lat,
        ];

        setFurnitureFeatures((prev) => ({
          ...prev,
          features: prev.features.map((f) => {
            if (f.id === selectedFurniture.id) {
              const newGeom = turf.transformTranslate(f.geometry as Polygon, delta[0], delta[1], { units: 'degrees' });
              return { ...f, geometry: newGeom.geometry as Polygon };
            }
            return f;
          }),
        }));
      };

      const onMouseUp = () => {
        map.current?.off('mousemove', onMouseMove);
        map.current?.off('mouseup', onMouseUp);
      };

      map.current.on('mousemove', onMouseMove);
      map.current.on('mouseup', onMouseUp);
    }
  }, [mode, selectedFurniture]);

  const updateFurnitureTransform = useCallback(
    (transform: { orientation?: number; scaleX?: number; scaleY?: number }) => {
      if (!selectedFurniture) return;

      setFurnitureFeatures((prev) => ({
        ...prev,
        features: prev.features.map((f) => {
          if (f.id === selectedFurniture.id) {
            let newGeom = f.geometry as Polygon;
            const newProps = { ...f.properties };

            // Apply rotation
            if (transform.orientation !== undefined) {
              newProps.orientation = transform.orientation;
              const centroid = turf.centroid(f).geometry.coordinates;
              newGeom = turf.transformRotate(f.geometry as Polygon, transform.orientation - f.properties.orientation, {
                pivot: centroid,
              }).geometry as Polygon;
            }

            // Apply scaling
            if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
              newProps.scaleX = transform.scaleX !== undefined ? transform.scaleX : f.properties.scaleX;
              newProps.scaleY = transform.scaleY !== undefined ? transform.scaleY : f.properties.scaleY;
              const centroid = turf.centroid(f).geometry.coordinates;
              newGeom = turf.transformScale(
                f.geometry as Polygon,
                (transform.scaleX !== undefined ? transform.scaleX : f.properties.scaleX) /
                  (f.properties.scaleX || 1),
                { origin: centroid }
              ).geometry as Polygon;
              newGeom = turf.transformScale(
                newGeom,
                (transform.scaleY !== undefined ? transform.scaleY : f.properties.scaleY) /
                  (f.properties.scaleY || 1),
                { origin: centroid, axis: 'y' }
              ).geometry as Polygon;
            }

            return { ...f, geometry: newGeom, properties: newProps };
          }
          return f;
        }),
      }));
    },
    [selectedFurniture]
  );

  const handleExportGeoJSON = useCallback(() => {
    // Export walls
    const wallsBlob = new Blob([JSON.stringify(wallFeatures, null, 2)], { type: 'application/json' });
    const wallsUrl = URL.createObjectURL(wallsBlob);
    const wallsLink = document.createElement('a');
    wallsLink.href = wallsUrl;
    wallsLink.download = 'walls.geojson';
    wallsLink.click();
    URL.revokeObjectURL(wallsUrl);

    // Export rooms
    const roomsBlob = new Blob([JSON.stringify(roomFeatures, null, 2)], { type: 'application/json' });
    const roomsUrl = URL.createObjectURL(roomsBlob);
    const roomsLink = document.createElement('a');
    roomsLink.href = roomsUrl;
    roomsLink.download = 'rooms.geojson';
    roomsLink.click();
    URL.revokeObjectURL(roomsUrl);

    // Export furniture
    const furnitureBlob = new Blob([JSON.stringify(furnitureFeatures, null, 2)], { type: 'application/json' });
    const furnitureUrl = URL.createObjectURL(furnitureBlob);
    const furnitureLink = document.createElement('a');
    furnitureLink.href = furnitureUrl;
    furnitureLink.download = 'furniture.geojson';
    furnitureLink.click();
    URL.revokeObjectURL(furnitureUrl);
  }, [wallFeatures, roomFeatures, furnitureFeatures]);

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
    const pointGeo = turf.point([lngLat.lng, lngLat.lat]);

    // Get furniture dimensions and shape
    const sizes = FURNITURE_SIZES[data.id as keyof typeof FURNITURE_SIZES];
    if (!sizes) return;

    const shape = furnitureLibrary.find((item) => item.id === data.id)?.shape || 'cube';

    // Buffer the point into a polygon based on shape
    let furniturePolygon;
    if (shape === 'cube') {
      // For cubes (sofa, table, door), create a rectangular polygon
      const halfWidth = sizes.width / 100000;
      const halfDepth = sizes.depth / 100000;
      const coords = [
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth], // Close the polygon
      ];
      furniturePolygon = turf.polygon([coords]);
    } else {
      // For cylinders (chair), buffer the point into a circular polygon
      furniturePolygon = turf.buffer(pointGeo, sizes.width / 2, { units: 'meters', steps: 16 }); // 16 steps for a smoother circle
    }

    if (!furniturePolygon.geometry || furniturePolygon.geometry.type !== 'Polygon') {
      console.error('Invalid polygon geometry created for furniture');
      return;
    }

    const furnitureFeature: FurnitureFeature = {
      type: 'Feature',
      id: `furniture-${Date.now()}`,
      geometry: furniturePolygon.geometry as Polygon,
      properties: {
        type: data.id === 'cube' ? 'door' : 'furniture',
        item: data.id,
        emoji: data.icon,
        orientation: 0,
        height: sizes.height,
        shape: shape,
        scaleX: 1, // Initialize scaling
        scaleY: 1,
      },
    };

    setFurnitureFeatures((prev) => ({
      ...prev,
      features: [...prev.features, furnitureFeature],
    }));
  }, []);

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

    setRoomFeatures((prev) => ({
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
              if (newMode !== 'edit_furniture') setSelectedFurniture(null);
            }}
            className="w-full p-2 border"
          >
            <option value="draw_wall">Draw Wall</option>
            <option value="draw_room">Draw Room</option>
            <option value="place_furniture">Place Furniture/Door</option>
            <option value="edit">Edit Room</option>
            <option value="edit_furniture">Edit Furniture</option>
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
          Export GeoJSON Files
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
        {selectedFurniture && mode === 'edit_furniture' && (
          <div>
            <h3>Edit Furniture: {selectedFurniture.properties.item}</h3>
            <label>Rotation (degrees):</label>
            <input
              type="number"
              value={selectedFurniture.properties.orientation}
              onChange={(e) => updateFurnitureTransform({ orientation: Number(e.target.value) })}
              className="w-full p-2 border"
            />
            <label>Scale X:</label>
            <input
              type="number"
              value={selectedFurniture.properties.scaleX}
              step="0.1"
              min="0.1"
              onChange={(e) => updateFurnitureTransform({ scaleX: Number(e.target.value) })}
              className="w-full p-2 border"
            />
            <label>Scale Y:</label>
            <input
              type="number"
              value={selectedFurniture.properties.scaleY}
              step="0.1"
              min="0.1"
              onChange={(e) => updateFurnitureTransform({ scaleY: Number(e.target.value) })}
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