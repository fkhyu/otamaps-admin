'use client';

import React, { Component, useState, useEffect, useRef, useCallback, ReactNode, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import transformRotate from '@turf/transform-rotate';

const supabase = createClientComponentClient();

// Constants 
const DEFAULT_CENTER: [number, number] = [24.8182, 60.1842];
const DEFAULT_ZOOM = 17;
const WALL_HEIGHT = 10;
const DEFAULT_WALL_WIDTH = 0.3;

// Furniture Dimensions (in meters, scaled for map)
const FURNITURE_SIZES = {
  sofa: { width: 2, height: 0.3, depth: 0.4 },
  chair: { width: 0.7, height: 0.35, depth: 0.7 },
  table: { width: 1.5, height: 0.5, depth: 2 },
  cube: { width: 1, height: 1, depth: 1 },
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
    type: 'furniture';
    id?: string;
    item?: string;
    emoji?: string;
    height?: number;
    shape?: 'cube' | 'cylinder';
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    originalGeometry?: Polygon;
  };
}

interface RoomFeature extends Feature<Polygon> {
  properties: {
    id: string;
    type: 'room';
    name: string;
    number: string;
    color: string;
    bookable: boolean;
    capacity: number;
    avEquipment: string[];
    purpose: string;
    icon: string;
  };
}

interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
  shape: 'cube' | 'cylinder';
}

// Editor Modes
type EditorMode = 'simple_select';

// Furniture Library
const furnitureLibrary: FurnitureItem[] = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️', shape: 'cube' },
  { id: 'chair', name: 'Chair', icon: '🪑', shape: 'cylinder' },
  { id: 'table', name: 'Table', icon: '🪵', shape: 'cube' },
  { id: 'cube', name: 'Cube', icon: '🚪', shape: 'cube' },
];

// Mapbox Configuration
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

const Editor: React.FC = () => {
  const featureIdCounter = useRef(0);
  const generateUniqueId = () => crypto.randomUUID();

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const processedFeatureIds = useRef<Set<string>>(new Set());
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // State
  const [mode, setMode] = useState<EditorMode>('simple_select');
  const [wallFeatures, setWallFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [roomFeatures, setRoomFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [furnitureFeatures, setFurnitureFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [wallWidth, setWallWidth] = useState(DEFAULT_WALL_WIDTH);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureFeature | null>(null);
  const [expandedLayers, setExpandedLayers] = useState<{ [key: string]: boolean }>({
    walls: true,
    rooms: true,
    furniture: true,
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [rotationInput, setRotationInput] = useState<number>(0);

  // Add a new state to track when all data is loaded
  const [dataLoaded, setDataLoaded] = useState(false);

  const selectedFeature = useMemo(() => {
    return (
      roomFeatures.features.find((f) => f.id === selectedFeatureId) ||
      wallFeatures.features.find((f) => f.id === selectedFeatureId) ||
      null
    );
  }, [roomFeatures, wallFeatures, selectedFeatureId]);

  // Debounce utility for property updates
  const debounce = useCallback((fn: (...args: any[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }, []);

  // Utility Functions
  const createFurnitureMarkers = useCallback(
    (map: mapboxgl.Map, furniture: FurnitureFeature, updateTransform: (t: any) => void) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      if (!furniture.geometry || furniture.geometry.type !== 'Polygon' || !furniture.id) {
        console.warn('Invalid furniture feature for markers:', furniture);
        return;
      }

      const centroid = turf.centroid(furniture).geometry.coordinates as [number, number];

      const sliderRadiusPx = 40;
      const sliderEl = document.createElement('div');
      sliderEl.className = 'furniture-rotation-slider';
      sliderEl.style.position = 'absolute';
      sliderEl.style.left = `-${sliderRadiusPx - 9}px`;
      sliderEl.style.top = `-${sliderRadiusPx - 9}px`;
      sliderEl.style.width = `${sliderRadiusPx * 2}px`;
      sliderEl.style.height = `${sliderRadiusPx * 2}px`;
      sliderEl.style.pointerEvents = 'auto';
      sliderEl.style.zIndex = '10';

      const moveEl = document.createElement('div');
      moveEl.className = 'furniture-move-marker';
      moveEl.style.background = '#fff';
      moveEl.style.border = '2px solid #0074d9';
      moveEl.style.width = '18px';
      moveEl.style.height = '18px';
      moveEl.style.borderRadius = '50%';
      moveEl.style.cursor = 'move';
      moveEl.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
      moveEl.title = 'Move furniture';

      sliderEl.innerHTML = `
        <svg width="${sliderRadiusPx * 2}" height="${sliderRadiusPx * 2}" style="pointer-events:none;">
          <circle cx="${sliderRadiusPx}" cy="${sliderRadiusPx}" r="${sliderRadiusPx - 4}" fill="none" stroke="#0074d9" stroke-width="3" opacity="0.5"/>
          <circle id="slider-handle" cx="${sliderRadiusPx}" cy="8" r="8" fill="#fff" stroke="#0074d9" stroke-width="2" style="pointer-events:all;cursor:pointer;" />
        </svg>
      `;

      sliderEl.addEventListener('mousedown', (e) => e.stopPropagation());
      sliderEl.addEventListener('touchstart', (e) => e.stopPropagation());
      moveEl.style.position = 'relative';
      moveEl.appendChild(sliderEl);

      const svg = sliderEl.querySelector('svg');
      const handle = sliderEl.querySelector('#slider-handle') as SVGCircleElement;
      if (handle) {
        handle.addEventListener('mousedown', (e) => e.stopPropagation());
        handle.addEventListener('touchstart', (e) => e.stopPropagation());
      }

      let dragging = false;

      const getAngleFromEvent = (event: MouseEvent | TouchEvent) => {
        const rect = svg!.getBoundingClientRect();
        const cx = rect.left + sliderRadiusPx;
        const cy = rect.top + sliderRadiusPx;
        let clientX = 0, clientY = 0;
        if ('touches' in event && event.touches.length > 0) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else if ('clientX' in event) {
          clientX = event.clientX;
          clientY = event.clientY;
        }
        const dx = clientX - cx;
        const dy = clientY - cy;
        let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle;
      };

      const setHandlePosition = (angle: number) => {
        const rad = ((angle - 0) * Math.PI) / 180;
        const r = sliderRadiusPx - 8;
        const x = sliderRadiusPx + r * Math.sin(rad);
        const y = sliderRadiusPx - r * Math.cos(rad);
        handle.setAttribute('cx', x.toString());
        handle.setAttribute('cy', y.toString());
      };

      setHandlePosition(furniture.properties?.rotation || 0);

      const onDrag = (event: MouseEvent | TouchEvent) => {
        if (!dragging || !selectedFurniture) return;
        event.preventDefault();
        const angle = getAngleFromEvent(event);
        setHandlePosition(angle);
        updateTransform({ rotation: Number(angle) });
        console.log('Dragging handle at angle:', angle);
      };

      const onDragEnd = () => {
        dragging = false;
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('touchmove', onDrag);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('touchend', onDragEnd);
        console.log('Drag ended', selectedFurniture, selectedFurniture?.id);
      };

      handle.addEventListener('mousedown', (e) => {
        if (!selectedFurniture) return;
        dragging = true;
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onDragEnd);
      });
      handle.addEventListener('touchstart', (e) => {
        if (!selectedFurniture) return;
        dragging = true;
        window.addEventListener('touchmove', onDrag);
        window.addEventListener('touchend', onDragEnd);
      });

      const moveMarker = new mapboxgl.Marker({ element: moveEl, draggable: true })
        .setLngLat(centroid)
        .addTo(map);

      moveMarker.on('remove', () => {
        moveEl.removeChild(sliderEl);
      });

      moveMarker.on('dragend', (e) => {
        const newCenter = moveMarker.getLngLat();
        const oldCenter = centroid;
        const deltaLng = newCenter.lng - oldCenter[0];
        const deltaLat = newCenter.lat - oldCenter[1];

        const newGeom = {
          ...furniture.geometry,
          coordinates: furniture.geometry.coordinates.map((ring) =>
            ring.map(([lng, lat]) => [lng + deltaLng, lat + deltaLat])
          ),
        };
        updateTransform({});
        setFurnitureFeatures((prev) => ({
          ...prev,
          features: prev.features.map((f) =>
            f.id === furniture.id ? { ...f, geometry: newGeom } : f
          ),
        }));
      });

      markersRef.current.push(moveMarker);
    },
    [setFurnitureFeatures, selectedFurniture]
  );

  const handleDrawCreate = useCallback(async (e: any) => {
    if (!e.features || !e.features[0] || !e.features[0].geometry) {
      console.warn('Invalid draw.create event:', e);
      return;
    }
    const newFeature = e.features[0];

    if (processedFeatureIds.current.has(newFeature.id)) {
      return;
    }

    const uniqueId = generateUniqueId();
    newFeature.id = uniqueId;

    processedFeatureIds.current.add(uniqueId);

    if (mode === 'simple_select' && newFeature.geometry.type === 'LineString') {
      try {
        const line = turf.lineString(newFeature.geometry.coordinates);
        const cleaned = turf.truncate(line, { precision: 10 });
        const buffered = turf.buffer(cleaned, Math.max(0.1, wallWidth / 2), { units: 'meters' });

        if (!buffered || !buffered.geometry || buffered.geometry.type !== 'Polygon') {
          console.warn('Invalid wall polygon:', buffered);
          return;
        }

        const wallFeature: WallFeature = {
          type: 'Feature',
          id: uniqueId,
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

        const { data, error } = await supabase
          .from('features')
          .insert([
            {
              id: uniqueId,
              geometry: wallFeature.geometry,
              type: 'wall',
            },
          ])
          .select();

        setTimeout(() => {
          draw.current?.changeMode('draw_line_string');
        }, 0);
      } catch (err) {
        console.error('Turf buffering error:', err);
      }
    } else if (mode === 'simple_select' || (mode === 'simple_select' && newFeature.geometry.type === 'Polygon')) {
      if (newFeature.geometry.type !== 'Polygon') {
        return;
      }
      const roomFeature: RoomFeature = {
        type: 'Feature',
        id: uniqueId,
        geometry: newFeature.geometry as Polygon,
        properties: {
          id: uniqueId,
          type: 'room',
          name: `Room ${roomFeatures.features.length + 1}`,
          number: '',
          color: '#ff0000',
          bookable: true,
          capacity: 10,
          avEquipment: [],
          purpose: 'Meeting',
          icon: '🏢',
        },
      };
      setRoomFeatures((prev) => ({
        ...prev,
        features: [...prev.features, roomFeature],
      }));

      const { data, error } = await supabase
        .from('rooms')
        .insert([
          {
            id: uniqueId,
            room_number: roomFeatures.features.length + 1,
            title: roomFeature.properties.name,
            description: roomFeature.properties.purpose,
            seats: roomFeature.properties.capacity,
            bookable: roomFeature.properties.bookable,
            geometry: roomFeature.geometry,
          },
        ])
        .select();

      setSelectedFeatureId(uniqueId);
      setTimeout(() => {
        draw.current?.changeMode('draw_polygon');
      }, 0);
    }
  }, [mode, wallWidth, roomFeatures]);

  const setRoomMarkers = useCallback((map: mapboxgl.Map, room: RoomFeature | null) => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (map.getSource('room-preview')) {
      map.removeLayer('room-preview');
      map.removeSource('room-preview');
    }

    if (!room || !room.geometry || !room.geometry.coordinates) {
      return null;
    }

    const corners = room.geometry.coordinates[0];
    const markers: mapboxgl.Marker[] = [];
    let previewCoordinates = [...corners];

    const numCorners = corners.length > 1 && corners[0][0] === corners[corners.length - 1][0] && corners[0][1] === corners[corners.length - 1][1]
      ? corners.length - 1
      : corners.length;

    for (let idx = 0; idx < numCorners; idx++) {
      const [lng, lat] = corners[idx];
      const el = document.createElement('div');
      el.className = 'room-corner-marker';
      el.style.backgroundColor = room.properties.color || '#ff0000';
      el.style.border = '2px solid #ffffff';
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.cursor = 'move';
      el.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
      el.title = `${room.properties.name} - Corner ${idx + 1}`;

      const marker = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);

      marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        previewCoordinates = corners.map((coord, coordIdx) =>
          coordIdx === idx ? [lngLat.lng, lngLat.lat] : coord
        );
        if (
          previewCoordinates.length > 2 &&
          (previewCoordinates[0][0] !== previewCoordinates[previewCoordinates.length - 1][0] ||
            previewCoordinates[0][1] !== previewCoordinates[previewCoordinates.length - 1][1])
        ) {
          previewCoordinates[previewCoordinates.length - 1] = [...previewCoordinates[0]];
        }
        const previewGeoJSON = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [previewCoordinates],
              },
              properties: {},
            },
          ],
        };

        if (map.getSource('room-preview')) {
          (map.getSource('room-preview') as mapboxgl.GeoJSONSource).setData(previewGeoJSON as FeatureCollection);
        } else {
          map.addSource('room-preview', {
            type: 'geojson',
            data: previewGeoJSON as FeatureCollection,
          });
          map.addLayer({
            id: 'room-preview',
            type: 'fill',
            source: 'room-preview',
            paint: {
              'fill-color': '#00bfff',
              'fill-opacity': 0.3,
            },
          });
        }
      });

      marker.on('dragend', async () => {
        const lngLat = marker.getLngLat();
        const newCoordinates = room.geometry.coordinates.map((ring, ringIdx) =>
          ringIdx === 0
            ? ring.map((coord, coordIdx) =>
                coordIdx === idx ? [lngLat.lng, lngLat.lat] : coord
              )
            : ring
        );
        if (
          newCoordinates[0].length > 2 &&
          (newCoordinates[0][0][0] !== newCoordinates[0][newCoordinates[0].length - 1][0] ||
            newCoordinates[0][0][1] !== newCoordinates[0][newCoordinates[0].length - 1][1])
        ) {
          newCoordinates[0][newCoordinates[0].length - 1] = [...newCoordinates[0][0]];
        }
        const newGeometry = {
          ...room.geometry,
          coordinates: newCoordinates,
        };
        setRoomFeatures((prev) => ({
          ...prev,
          features: prev.features.map((f) =>
            f.id === room.id ? { ...f, geometry: newGeometry } : f
          ),
        }));
        const { error } = await supabase
          .from('rooms')
          .update({ geometry: { type: 'Polygon', coordinates: newCoordinates } })
          .eq('id', room.properties.id);
        if (error) {
          console.log('Error updating room geometry:', error);
        }
      });

      markers.push(marker);
    }

    markersRef.current = markers;
    return markers;
  }, []);

  const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!map.current) return;
    e.preventDefault();
    e.originalEvent.stopPropagation();

    const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
      [e.point.x - 50, e.point.y - 50], // Increased bbox for better click detection
      [e.point.x + 50, e.point.y + 50],
    ];

    const featuresAtPoint = map.current.queryRenderedFeatures(bbox, {
      layers: ['rooms', 'furniture', 'walls'],
    });

    console.log('Features at point:', featuresAtPoint);

    if (mode === 'simple_select') {
      const furnitureFeature = featuresAtPoint.find(
        (f) => f.properties?.type === 'furniture'
      ) as FurnitureFeature | undefined;
      if (furnitureFeature) {
        console.log('Found furniture feature:', furnitureFeature);
        if (furnitureFeature.id) {
          const matchedFeature = furnitureFeatures.features.find(
            (f) => f.id === furnitureFeature.id
          ) as FurnitureFeature | undefined;
          if (matchedFeature) {
            setSelectedFurniture(matchedFeature);
            setSelectedFeatureId(null);
            console.log('Selected furniture feature:', matchedFeature);
            return;
          } else {
            console.warn('No matching furniture feature found in state for ID:', furnitureFeature.id);
          }
        } else {
          console.warn('Furniture feature missing ID:', furnitureFeature);
        }
      }

      const roomFeature = featuresAtPoint.find(
        (f) => f.properties?.type === 'room'
      ) as RoomFeature | undefined;
      if (roomFeature) {
        setSelectedFeatureId(roomFeature.properties.id as string);
        setSelectedFurniture(null);
        setRoomMarkers(map.current, roomFeature as RoomFeature);
        return;
      }

      const wallFeature = featuresAtPoint.find(
        (f) => f.properties?.type === 'wall'
      ) as WallFeature | undefined;
      if (wallFeature) {
        setSelectedFeatureId(wallFeature.id as string);
        setSelectedFurniture(null);
        return;
      }

      setSelectedFeatureId(null);
      setSelectedFurniture(null);
    }
  }, [mode, setRoomMarkers, furnitureFeatures]);

  useEffect(() => {
    if (!map.current) return;

    if (selectedFeature && selectedFeature.properties?.type === 'room') {
      setRoomMarkers(map.current, selectedFeature as RoomFeature);
    } else {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      if (map.current.getSource('room-preview')) {
        map.current.removeLayer('room-preview');
        map.current.removeSource('room-preview');
      }
    }
  }, [selectedFeatureId, selectedFeature, setRoomMarkers]);

  const handleFurnitureMouseDown = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (mode !== 'simple_select' || !map.current || !selectedFurniture) return;

    const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
      layers: ['furniture', 'doors'],
    });

    if (featuresAtPoint.length > 0 && featuresAtPoint[0].id === selectedFurniture.id) {
      const startLngLat = e.lngLat;

      const onMouseMove = (moveEvent: mapboxgl.MapMouseEvent) => {
        const delta = [
          moveEvent.lngLat.lng - startLngLat.lng,
          moveEvent.lngLat.lat - startLngLat.lat,
        ];

        setFurnitureFeatures((prev) => ({
          ...prev,
          features: prev.features.map((f) => {
            if (f.id === selectedFurniture.id && f.geometry) {
              const newGeom = turf.transformTranslate(f.geometry as Polygon, delta[0], delta[1], { units: 'degrees' });
              return { ...f, geometry: newGeom as Polygon };
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

  const rotateFeature = (
    feature: Feature<Polygon>,
    angle: number,
    pivot: [number, number]
  ): Feature<Polygon> => {
    return transformRotate(feature, angle, { pivot });
  };

  const updateFurnitureTransform = useCallback(
    debounce(async (transform: { rotation?: number; scaleX?: number; scaleY?: number }) => {
      console.log('called updateFurnitureTransform with:', transform);
      if (!selectedFurniture || !map.current || !selectedFurniture.id) {
        console.log('No selected furniture, map not initialized, or missing id', selectedFurniture, 'Map:', map.current);
        return;
      }

      setFurnitureFeatures((prev) => {
        let updatedFeature: FurnitureFeature | undefined;
        const newFeatures = prev.features.map((f) => {
          if (f.id === selectedFurniture.id && f.geometry) {
            let newGeom = f.geometry as Polygon;
            const newProps = { ...f.properties };

            if (!f.properties?.originalGeometry) {
              newProps.originalGeometry = JSON.parse(JSON.stringify(f.geometry));
            }

            if (typeof transform.rotation === 'number' && !isNaN(transform.rotation)) {
              console.log('Rotating furniture feature:', f.id, 'by', transform.rotation, 'degrees');
              const centroid = turf.centroid(f).geometry.coordinates as [number, number];
              console.log('Centroid for rotation:', centroid);
              const baseGeom = f.properties?.originalGeometry || f.geometry;
              console.log('Base geometry for rotation:', baseGeom);
              newGeom = rotateFeature(
                { ...f, geometry: baseGeom },
                transform.rotation,
                centroid
              ).geometry as Polygon;
              console.log('New geometry after rotation:', newGeom);
              newProps.rotation = transform.rotation;
              console.log('Rotated furniture feature:', f.id, 'to', transform.rotation, 'degrees');
            }

            let scaleX = typeof transform.scaleX === 'number' && !isNaN(transform.scaleX) && transform.scaleX > 0
              ? transform.scaleX
              : f.properties?.scaleX ?? 1;
            let scaleY = typeof transform.scaleY === 'number' && !isNaN(transform.scaleY) && transform.scaleY > 0
              ? transform.scaleY
              : f.properties?.scaleY ?? 1;

            if (
              (typeof transform.scaleX === 'number' && !isNaN(transform.scaleX)) ||
              (typeof transform.scaleY === 'number' && !isNaN(transform.scaleY))
            ) {
              newProps.scaleX = scaleX;
              newProps.scaleY = scaleY;
              const centroid = turf.centroid(f).geometry.coordinates;
              if (scaleX !== f.properties?.scaleX) {
                newGeom = turf.transformScale(
                  newGeom,
                  scaleX / (f.properties?.scaleX ?? 1),
                  { origin: centroid }
                ) as Polygon;
              }
              if (scaleY !== f.properties?.scaleY) {
                newGeom = turf.transformScale(
                  newGeom,
                  scaleY / (f.properties?.scaleY ?? 1),
                  { origin: centroid }
                ) as Polygon;
              }
            }

            updatedFeature = { ...f, geometry: newGeom, properties: newProps } as FurnitureFeature;
            setSelectedFurniture(updatedFeature);

            return updatedFeature;
          }
          return f;
        });

        if (updatedFeature) {
          createFurnitureMarkers(map.current!, updatedFeature, updateFurnitureTransform);
          // Update Supabase
          supabase
            .from('features')
            .update({
              geometry: updatedFeature.geometry,
            })
            .eq('id', updatedFeature.id)
            .then(({ error }) => {
              if (error) {
                console.error('Error updating furniture in Supabase:', error);
              } else {
                console.log('Updated furniture in Supabase:', updatedFeature);
              }
            });
        }

        return { ...prev, features: newFeatures };
      });
    }, 100),
    [selectedFurniture, createFurnitureMarkers, furnitureFeatures]
  );

  const updateRoomProperties = useCallback(
    async (properties: Partial<RoomFeature['properties']>) => {
      if (!selectedFeatureId) return;

      console.log('Updating room properties:', properties);

      setRoomFeatures((prev) => ({
        ...prev,
        features: prev.features.map((f) =>
          f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, ...properties } } : f
        ),
      }));

      const updatePayload: any = {};
      if (properties.name !== undefined) updatePayload.title = properties.name;
      if (properties.number !== undefined) updatePayload.room_number = properties.number;
      if (properties.color !== undefined) updatePayload.color = properties.color;
      if (properties.bookable !== undefined) updatePayload.bookable = properties.bookable;
      if (properties.capacity !== undefined) updatePayload.seats = properties.capacity;
      if (properties.purpose !== undefined) updatePayload.description = properties.purpose;

      if (Object.keys(updatePayload).length > 0) {
        console.log('Updating room in Supabase:', updatePayload);
        const { data, error } = await supabase
          .from('rooms')
          .update(updatePayload)
          .eq('id', selectedFeatureId)
          .select();
        console.log('Updated room in Supabase:', data, error);
        if (error) {
          console.log('Error updating room in Supabase:', error);
        }
      }
    },
    [selectedFeatureId]
  );

  const handleExportGeoJSON = useCallback(() => {
    const exportFile = (data: FeatureCollection, filename: string) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    };

    exportFile(wallFeatures, 'walls.geojson');
    exportFile(roomFeatures, 'rooms.geojson');
    exportFile(furnitureFeatures, 'furniture.geojson');
  }, [wallFeatures, roomFeatures, furnitureFeatures]);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    if (!map.current || !mapContainer.current) return;

    const json = e.dataTransfer?.getData('application/json');
    if (!json) return;

    const jsondata = JSON.parse(json);
    const rect = mapContainer.current.getBoundingClientRect();
    const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];

    const lngLat = map.current.unproject(point);
    const pointGeo = turf.point([lngLat.lng, lngLat.lat]);

    const sizes = FURNITURE_SIZES[jsondata.id as keyof typeof FURNITURE_SIZES];
    if (!sizes) return;

    const shape = furnitureLibrary.find((item) => item.id === jsondata.id)?.shape || 'cube';

    let furniturePolygon;
    if (shape === 'cube') {
      const halfWidth = sizes.width / 100000;
      const halfDepth = sizes.depth / 100000;
      const coords = [
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat + halfDepth],
        [lngLat.lng + halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat - halfDepth],
        [lngLat.lng - halfWidth, lngLat.lat + halfDepth],
      ];
      furniturePolygon = turf.polygon([coords]);
    } else {
      furniturePolygon = turf.buffer(pointGeo, sizes.width / 2, { units: 'meters', steps: 16 });
    }

    if (!furniturePolygon?.geometry || furniturePolygon.geometry.type !== 'Polygon') {
      console.error('Invalid polygon geometry created for furniture');
      return;
    }

    const uniqueId = generateUniqueId();
    const furnitureFeature: FurnitureFeature = {
      type: 'Feature',
      id: uniqueId,
      geometry: furniturePolygon?.geometry as Polygon,
      properties: {
        type: 'furniture',
        item: jsondata.name,
        emoji: jsondata.icon,
        shape,
        height: sizes.height,
      },
    };

    console.log('Created furniture feature:', furnitureFeature);

    setFurnitureFeatures((prev) => ({
      ...prev,
      features: [...prev.features, furnitureFeature],
    }));

    const { data, error } = await supabase
      .from('features')
      .insert([
        {
          id: uniqueId,
          geometry: furnitureFeature.geometry,
          type: furnitureFeature.properties.type,
          item: furnitureFeature.properties.item,
          emoji: furnitureFeature.properties.emoji,
          shape: furnitureFeature.properties.shape,
          height: furnitureFeature.properties.height,
        },
      ])
      .select();

    console.log('Inserted furniture into Supabase:', data, error);
  }, []);

  const handleLayerSelect = useCallback((feature: Feature) => {
    if (!feature.id) {
      console.warn('Feature does not have an ID:', feature);
      return;
    }
    if (feature.properties?.type === 'furniture' || feature.properties?.type === 'door') {
      setSelectedFurniture(feature as FurnitureFeature);
      setSelectedFeatureId(null);
      setMode('simple_select');
    } else if (feature.properties?.type === 'room') {
      setSelectedFeatureId(feature.id as string);
      setSelectedFurniture(null);
      setMode('simple_select');
    } else if (feature.properties?.type === 'wall') {
      setSelectedFeatureId(feature.id as string);
      setSelectedFurniture(null);
      console.log('Selected wall feature:', feature, feature.properties.type);
    }
  }, []);

  const handleDrawUpdate = useCallback((e: any) => {
    console.log('draw.update', e);
    if (!e.features || !e.features[0] || !e.features[0].geometry) {
      console.warn('Invalid draw.update event:', e);
      return;
    }
    const updatedFeature = e.features[0];
    setRoomFeatures((prev) => ({
      ...prev,
      features: prev.features.map((f) =>
        f.id === updatedFeature.id
          ? {
              ...f,
              geometry: updatedFeature.geometry,
              properties: { ...f.properties, ...updatedFeature.properties },
            }
          : f
      ),
    }));
  }, []);

  const toggleLayer = useCallback((layer: string) => {
    setExpandedLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // Fetch rooms
        const { data: roomsData, error: roomsError } = await supabase.from('rooms').select('*');
        if (roomsError) throw roomsError;
        if (roomsData) {
          setRoomFeatures({
            type: 'FeatureCollection',
            features: roomsData.map((row) => ({
              type: 'Feature',
              id: row.id,
              geometry: row.geometry,
              properties: {
                id: row.id,
                type: 'room',
                name: row.title,
                number: row.room_number || '',
                color: row.color || '#ff0000',
                bookable: row.bookable,
                capacity: row.seats,
                avEquipment: row.avEquipment || [],
                purpose: row.description,
                icon: row.icon || '🏢',
              },
            })),
          });
        }

        // Fetch walls
        const { data: wallsData, error: wallsError } = await supabase.from('features').select('*').eq('type', 'wall');
        if (wallsError) throw wallsError;
        if (wallsData) {
          setWallFeatures({
            type: 'FeatureCollection',
            features: wallsData.map((row) => ({
              type: 'Feature',
              id: row.id,
              geometry: row.geometry,
              properties: {
                type: 'wall',
                width: row.width || DEFAULT_WALL_WIDTH,
                height: WALL_HEIGHT,
              },
            })),
          });
        }

        // Fetch furniture
        const { data: furnitureData, error: furnitureError } = await supabase.from('features').select('*').eq('type', 'furniture');
        if (furnitureError) throw furnitureError;
        if (furnitureData) {
          const features = furnitureData.map((row) => {
            if (!row.id) {
              console.warn('Furniture feature missing ID in Supabase:', row);
            }
            return {
              type: 'Feature',
              id: row.id,
              geometry: row.geometry,
              properties: {
                type: row.type || 'furniture',
                item: row.item || '',
                emoji: row.emoji || '🪑',
                height: row.height || 1,
                shape: row.shape || 'cube',
                scaleX: row.scaleX || 1,
                scaleY: row.scaleY || 1,
              },
            };
          });
          setFurnitureFeatures({
            type: 'FeatureCollection',
            features,
          });
        }

        setDataLoaded(true); // All data fetched
      } catch (err) {
        console.error('Error fetching map data:', err);
      }
    };

    fetchAllData();
  }, []);

  const initializeMapLayers = useCallback(() => {
    if (!map.current) return;

    const safeAddSource = (id: string, data: GeoJSON.FeatureCollection, promoteId?: string) => {
      if (!map.current!.getSource(id)) {
        map.current!.addSource(id, {
          type: 'geojson',
          data,
          promoteId,
        });
      }
    };

    const safeAddLayer = (layerId: string, layerConfig: mapboxgl.Layer) => {
      if (!map.current!.getLayer(layerId)) {
        map.current!.addLayer(layerConfig);
      }
    };

    console.log('furnitureFeatures before adding source:', JSON.stringify(furnitureFeatures, null, 2));

    safeAddSource('walls', wallFeatures, 'id');
    safeAddLayer('walls', {
      id: 'walls',
      type: 'fill-extrusion',
      source: 'walls',
      filter: ['==', ['get', 'type'], 'wall'],
      paint: {
        'fill-extrusion-color': '#fffce0',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 1,
      },
    });

    safeAddSource('rooms', roomFeatures, 'id');
    safeAddLayer('rooms', {
      id: 'rooms',
      type: 'fill',
      source: 'rooms',
      filter: ['==', ['get', 'type'], 'room'],
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.5,
      },
    });

    safeAddLayer('room-labels', {
      id: 'room-labels',
      type: 'symbol',
      source: 'rooms',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 16,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    });

    safeAddSource('furniture', furnitureFeatures, 'id');
    safeAddLayer('furniture', {
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
      metadata: { interactive: true },
    });

    safeAddLayer('doors', {
      id: 'doors',
      type: 'fill-extrusion',
      source: 'furniture',
      filter: ['==', ['get', 'type'], 'door'],
      paint: {
        'fill-extrusion-color': '#4a4a4a',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
      metadata: { interactive: true },
    });

    safeAddLayer('furniture-selected', {
      id: 'furniture-selected',
      type: 'line',
      source: 'furniture',
      paint: {
        'line-color': '#00ff00',
        'line-width': 5,
        'line-opacity': ['case', ['==', ['get', 'id'], selectedFurniture?.id || ''], 1, 0],
      },
    });
  }, [wallFeatures, roomFeatures, furnitureFeatures, selectedFurniture]);

  // Only initialize map layers after both map and data are loaded
  useEffect(() => {
    if (mapLoaded && dataLoaded) {
      initializeMapLayers();
    }
  }, [mapLoaded, dataLoaded, initializeMapLayers]);

  useEffect(() => {
    if (!mapContainer.current) return;

    const MAPBOX_STYLE = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'mapbox://styles/mapbox/dark-v10'
      : 'mapbox://styles/mapbox/streets-v12';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      antialias: true,
      interactive: true,
    });

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { line_string: true, polygon: true, trash: true },
    });

    map.current.addControl(draw.current);

    map.current.on('load', () => {
      setMapLoaded(true); // Only set mapLoaded here
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    map.current.on('draw.create', handleDrawCreate);
    map.current.on('draw.update', handleDrawUpdate);
    map.current.on('click', handleMapClick);
    map.current.on('mousedown', handleFurnitureMouseDown);

    map.current.on('mousedown', (e) => {
      if (mode === 'simple_select') {
        map.current?.dragPan.disable();
      }
    });
    map.current.on('mouseup', () => {
      map.current?.dragPan.enable();
    });

    return () => {
      map.current?.off('draw.create', handleDrawCreate);
      map.current?.off('draw.update', handleDrawUpdate);
      map.current?.off('click', handleMapClick);
      map.current?.off('mousedown', handleFurnitureMouseDown);
      map.current?.off('mouseup', () => map.current?.dragPan.enable());
    };
  }, [handleDrawCreate, handleDrawUpdate, handleMapClick, handleFurnitureMouseDown, mode]);

  useEffect(() => {
    if (!map.current || !selectedFurniture || mode !== 'simple_select') {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      return;
    }

    createFurnitureMarkers(map.current, selectedFurniture, updateFurnitureTransform);

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [selectedFurniture, mode, updateFurnitureTransform, createFurnitureMarkers]);

  useEffect(() => {
    if (map.current && map.current.getSource('walls') && map.current.isStyleLoaded()) {
      if (wallFeatures.type === 'FeatureCollection' && Array.isArray(wallFeatures.features)) {
        (map.current.getSource('walls') as mapboxgl.GeoJSONSource).setData(wallFeatures);
      } else {
        console.warn('Invalid wallFeatures data:', wallFeatures);
      }
    }
  }, [wallFeatures]);

  useEffect(() => {
    if (map.current && map.current.getSource('rooms') && map.current.isStyleLoaded()) {
      if (roomFeatures.type === 'FeatureCollection' && Array.isArray(roomFeatures.features)) {
        (map.current.getSource('rooms') as mapboxgl.GeoJSONSource).setData(roomFeatures);
      } else {
        console.warn('Invalid roomFeatures data:', roomFeatures);
      }
    }
  }, [roomFeatures]);

  useEffect(() => {
    if (map.current && map.current.getSource('furniture') && map.current.isStyleLoaded()) {
      if (furnitureFeatures.type === 'FeatureCollection' && Array.isArray(furnitureFeatures.features)) {
        (map.current.getSource('furniture') as mapboxgl.GeoJSONSource).setData(furnitureFeatures);
      } else {
        console.warn('Invalid furnitureFeatures data:', furnitureFeatures);
      }
    }
  }, [furnitureFeatures]);

  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragover', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('dragover', (e) => e.preventDefault());
    };
  }, [handleDrop]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-700">
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Layers</h2>
            <div className="mb-2">
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer"
                onClick={() => toggleLayer('walls')}
              >
                <span className="text-sm font-medium">Walls</span>
                <span>{expandedLayers.walls ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.walls && (
                <div className="ml-4">
                  {wallFeatures.features.map((feature) => (
                    <div
                      key={feature.id}
                      className={`p-2 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 rounded ${
                        selectedFeature?.id === feature.id ? 'bg-blue-100 dark:bg-blue-950' : ''
                      }`}
                      onClick={() => handleLayerSelect(feature)}
                    >
                      Wall {wallFeatures.features.indexOf(feature) + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-2">
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer"
                onClick={() => toggleLayer('rooms')}
              >
                <span className="text-sm font-medium">Rooms</span>
                <span>{expandedLayers.rooms ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.rooms && (
                <div className="ml-4">
                  {roomFeatures.features.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">No rooms created</div>
                  ) : (
                    roomFeatures.features.map((feature) => (
                      <div
                        key={feature.id}
                        className={`p-2 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 rounded ${
                          selectedFeature?.id === feature.id ? 'bg-blue-100 dark:bg-blue-950' : ''
                        }`}
                        onClick={() => handleLayerSelect(feature)}
                      >
                        {feature.properties?.name || `Room ${roomFeatures.features.indexOf(feature) + 1}`}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div>
              <div
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer"
                onClick={() => toggleLayer('furniture')}
              >
                <span className="text-sm font-medium">Furniture</span>
                <span>{expandedLayers.furniture ? '▼' : '▶'}</span>
              </div>
              {expandedLayers.furniture && (
                <div className="ml-4">
                  {furnitureFeatures.features.map((feature) => (
                    <div
                      key={feature.id}
                      className={`p-2 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 rounded ${
                        selectedFurniture?.id === feature.id ? 'bg-blue-100 dark:bg-blue-950' : ''
                      }`}
                      onClick={() => handleLayerSelect(feature)}
                    >
                      {feature.properties?.emoji} {feature.properties?.item}{' '}
                      {furnitureFeatures.features.indexOf(feature) + 1}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <a href="/" className='absolute bottom-4 px-8 py-4 hover:bg-gray-50 rounded-lg dark:hover:bg-gray-800'>← Back to dashboard</a>
          </div>

          <div className="flex-1">
            <div ref={mapContainer} className="w-full h-full" />
          </div>

          <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Properties</h2>
            {selectedFeature && selectedFeature.properties?.type === 'room' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.name || ''}
                    onChange={(e) => updateRoomProperties({ name: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Room number</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.number || ''}
                    onChange={(e) => {
                      const allowed = /^[0-9\/]*$/;
                      if (allowed.test(e.target.value)) {
                        updateRoomProperties({ number: e.target.value });
                      }
                    }}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input
                    type="color"
                    value={selectedFeature.properties.color || '#ff0000'}
                    onChange={(e) => updateRoomProperties({ color: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedFeature.properties.bookable || false}
                      onChange={(e) => updateRoomProperties({ bookable: e.target.checked })}
                      className="h-4 w-4 text-blue-500"
                    />
                    Bookable
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    value={selectedFeature.properties.capacity || 0}
                    onChange={(e) => updateRoomProperties({ capacity: Number(e.target.value) })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.purpose || ''}
                    onChange={(e) => updateRoomProperties({ purpose: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <input
                    type="text"
                    value={selectedFeature.properties.icon || ''}
                    onChange={(e) => updateRoomProperties({ icon: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Geometry</label>
                  <textarea
                    value={JSON.stringify(selectedFeature.geometry, null, 2)}
                    onChange={async (e) => {
                      try {
                        const newGeometry = JSON.parse(e.target.value);
                        setRoomFeatures((prev) => ({
                          ...prev,
                          features: prev.features.map((f) =>
                            f.id === selectedFeatureId ? { ...f, geometry: newGeometry } : f
                          ),
                        }));
                        const { error } = await supabase
                          .from('rooms')
                          .update({ geometry: newGeometry })
                          .eq('id', selectedFeatureId);
                        if (error) {
                          console.error('Error updating room geometry:', error);
                        }
                      } catch (err) {
                        console.error('Invalid JSON for geometry:', err);
                      }
                    }}
                    className="w-full h-32 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={async () => {
                    setRoomFeatures((prev) => ({
                      ...prev,
                      features: prev.features.filter((f) => f.id !== selectedFeatureId),
                    }));
                    setSelectedFeatureId(null);
                    const { error } = await supabase
                      .from('rooms')
                      .delete()
                      .eq('id', selectedFeatureId);
                    if (error) {
                      console.error('Error deleting room:', error);
                    }
                  }}
                  className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium"
                >
                  Delete Room
                </button>
              </div>
            )}
            {selectedFurniture && mode === 'simple_select' && (
              <div className="space-y-4">
                <h3 className="text-md font-semibold text-gray-800">Properties</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rotation (degrees)</label>
                  <input
                    type="number"
                    value={rotationInput}
                    onChange={(e) => setRotationInput(Number(e.target.value))}
                    onBlur={() => updateFurnitureTransform({ rotation: rotationInput })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Geometry</label>
                  <textarea
                    value={JSON.stringify(selectedFurniture?.geometry, null, 2)}
                    onChange={async (e) => {
                      try {
                        const newGeometry = JSON.parse(e.target.value);
                        setFurnitureFeatures((prev) => ({
                          ...prev,
                          features: prev.features.map((f) =>
                            f.id === selectedFurniture.id ? { ...f, geometry: newGeometry } : f
                          ),
                        }));
                        const { error } = await supabase
                          .from('features')
                          .update({ geometry: newGeometry })
                          .eq('id', selectedFurniture.id);
                        if (error) {
                          console.error('Error updating furniture geometry:', error);
                        }
                      } catch (err) {
                        console.error('Invalid JSON for geometry:', err);
                      }
                    }}
                    className="w-full h-32 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={async () => {
                    setFurnitureFeatures((prev) => ({
                      ...prev,
                      features: prev.features.filter((f) => f.id !== selectedFurniture.id),
                    }));
                    setSelectedFurniture(null);
                    const { error } = await supabase
                      .from('features')
                      .delete()
                      .eq('id', selectedFurniture.id);
                    if (error) {
                      console.error('Error deleting furniture:', error);
                    }
                  }}
                  className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium"
                >
                  Delete Furniture
                </button>
              </div>
            )}
            {selectedFeature && selectedFeature.properties?.type === 'wall' && (
              <button
                onClick={async () => {
                  setWallFeatures((prev) => ({
                    ...prev,
                    features: prev.features.filter((f) => f.id !== selectedFeatureId),
                  }));
                  setSelectedFeatureId(null);
                  const { error } = await supabase
                    .from('features')
                    .delete()
                    .eq('id', selectedFeatureId);
                  if (error) {
                    console.error('Error deleting wall:', error);
                  }
                }}
                className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium"
              >
                Delete Wall
              </button>
            )}
            {!selectedFeature && !selectedFurniture && (
              <p className="text-sm text-gray-500">Select a layer to edit its properties.</p>
            )}
            <button
              onClick={handleExportGeoJSON}
              className="mt-4 w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition font-medium"
            >
              Export GeoJSON Files
            </button>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-700 dark:border-1 dark:border-gray-600 shadow-lg p-4 flex items-center gap-4 overflow-x-auto w-fit rounded-2xl mx-auto mb-4">
          {mode === 'simple_select' && (
            <div className="flex items-center gap-3">
              {furnitureLibrary.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify(item));
                  }}
                  className="flex items-center gap-2 p-2 bg-gray-100 border border-gray-200 rounded-md cursor-move hover:bg-gray-200 transition dark:bg-gray-600 dark:border-gray-600 dark:hover:bg-gray-800"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(Editor);