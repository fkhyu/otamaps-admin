'use client';

    import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
    import mapboxgl from 'mapbox-gl';
    import MapboxDraw from '@mapbox/mapbox-gl-draw';
    import * as turf from '@turf/turf';
    import { FeatureCollection, Feature, Polygon, LineString } from 'geojson';
    import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
    import { WallFeature, FurnitureFeature, RoomFeature, EditorMode } from '../lib/types';
    import { FURNITURE_SIZES, DEFAULT_WALL_WIDTH, WALL_HEIGHT, MAPBOX_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/constants';
    import { debounce, rotateFeature } from '../lib/utils';


    const supabase = createClientComponentClient();

    export const useEditor = (
    map: React.MutableRefObject<mapboxgl.Map | null>,
    draw: React.MutableRefObject<MapboxDraw | null>,
    mapContainer: React.MutableRefObject<HTMLDivElement | null>
    ) => {
    const featureIdCounter = useRef(0);
    const processedFeatureIds = useRef<Set<string>>(new Set());
    const markersRef = useRef<mapboxgl.Marker[]>([]);

    // State
    const [mode, setMode] = useState<EditorMode>('simple_select');
    const [wallFeatures, setWallFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
    const [roomFeatures, setRoomFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
    const [furnitureFeatures, setFurnitureFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
    const [wallWidth, setWallWidth] = useState(DEFAULT_WALL_WIDTH);
    const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<Feature | null>(null);
    const [selectedFurniture, setSelectedFurniture] = useState<FurnitureFeature | null>(null);
    const [expandedLayers, setExpandedLayers] = useState<{ [key: string]: boolean }>({
        walls: true,
        rooms: true,
        furniture: true,
    });
    const [mapLoaded, setMapLoaded] = useState(false);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [rotationInput, setRotationInput] = useState<number>(0);

    const generateUniqueId = () => crypto.randomUUID();

    const selectedFeature = useMemo(() => {
        return (
        roomFeatures.features.find((f) => f.id === selectedFeatureId) ||
        wallFeatures.features.find((f) => f.id === selectedFeatureId) ||
        null
        );
    }, [roomFeatures, wallFeatures, selectedFeatureId]);

    // Initialize Map
    const initializeMapLayers = useCallback(() => {
        if (!map.current) return;

        const mapInstance = map.current;

        // Add sources
        mapInstance.addSource('walls', {
        type: 'geojson',
        data: wallFeatures,
        });

        mapInstance.addSource('rooms', {
        type: 'geojson',
        data: roomFeatures,
        });

        mapInstance.addSource('furniture', {
        type: 'geojson',
        data: furnitureFeatures,
        });

        // Add layers
        mapInstance.addLayer({
        id: 'walls',
        type: 'fill',
        source: 'walls',
        paint: {
            'fill-color': '#888888',
            'fill-opacity': 0.8,
        },
        });

        mapInstance.addLayer({
        id: 'rooms',
        type: 'fill',
        source: 'rooms',
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.5,
        },
        });

        mapInstance.addLayer({
        id: 'furniture',
        type: 'fill',
        source: 'furniture',
        paint: {
            'fill-color': '#ffcc00',
            'fill-opacity': 0.7,
        },
        });

        mapInstance.addLayer({
        id: 'furniture-icons',
        type: 'symbol',
        source: 'furniture',
        layout: {
            'text-field': ['get', 'emoji'],
            'text-size': 20,
            'text-anchor': 'center',
            'text-offset': [0, 0],
        },
        });

        // Walls extrusion
        mapInstance.addLayer({
        id: 'walls-extrusion',
        type: 'fill-extrusion',
        source: 'walls',
        paint: {
            'fill-extrusion-color': '#888888',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.9,
        },
        }, 'furniture'); // insert below furniture for correct stacking

        // Furniture extrusion
        mapInstance.addLayer({
        id: 'furniture-extrusion',
        type: 'fill-extrusion',
        source: 'furniture',
        paint: {
            'fill-extrusion-color': '#ffcc00',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.9,
        },
        }, 'furniture-icons'); // insert below icons

        // Room labels
        mapInstance.addLayer({
        id: 'room-labels',
        type: 'symbol',
        source: 'rooms',
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 16,
            'text-anchor': 'center',
            // 'symbol-placement': 'point',
        },
        paint: {
            'text-color': '#fff',
            // 'text-halo-color': '#222',
            // 'text-halo-width': 1,
        },
        }, 'furniture');
    }, []);

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
        console.log('Updating roomFeatures on map');
        if (roomFeatures.type === 'FeatureCollection' && Array.isArray(roomFeatures.features)) {
            (map.current.getSource('rooms') as mapboxgl.GeoJSONSource).setData(roomFeatures);
            console.log('Room features updated:', roomFeatures);
        } else {
            console.warn('Invalid roomFeatures data:', roomFeatures);
        }
        }else {
        console.warn('Map or source not ready for roomFeatures update');
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
        if (!mapContainer.current || map.current) return;

        const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (!accessToken) {
        throw new Error('Mapbox access token is missing. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your environment variables.');
        }
        mapboxgl.accessToken = accessToken;

        map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: MAPBOX_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        });

        draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            polygon: true,
            line_string: true,
            trash: true,
        },
        });

        map.current.addControl(draw.current);

        map.current.on('load', () => {
        setMapLoaded(true);
        initializeMapLayers();
        });

        return () => {
        map.current?.remove();
        map.current = null;
        };
    }, [initializeMapLayers]);

    // Fetch data from Supabase
    useEffect(() => {
        if (!mapLoaded) return;

        const loadData = async () => {
        const { data: wallsData, error: wallsError } = await supabase
            .from('features')
            .select('*')
            .eq('type', 'wall');

        if (wallsError) {
            console.error('Error loading walls:', wallsError);
        } else if (wallsData) {
            setWallFeatures({
            type: 'FeatureCollection',
            features: wallsData.map((item) => ({
                id: item.id,
                type: 'Feature',
                geometry: item.geometry,
                properties: {
                type: 'wall',
                width: item.width || DEFAULT_WALL_WIDTH,
                height: WALL_HEIGHT,
                },
            })),
            });
        }

        const { data: roomsData, error: roomsError } = await supabase
            .from('rooms')
            .select('*');

        if (roomsError) {
            console.error('Error loading rooms:', roomsError);
        } else if (roomsData) {
            setRoomFeatures({
            type: 'FeatureCollection',
            features: roomsData.map((item) => ({
                id: item.id,
                type: 'Feature',
                geometry: item.geometry,
                properties: {
                id: item.id,
                type: 'room',
                name: item.title,
                number: item.room_number,
                color: item.color || '#ff0000',
                bookable: item.bookable,
                capacity: item.seats,
                avEquipment: item.avEquipment || [],
                purpose: item.description,
                icon: item.icon || '🏢',
                },
            })),
            });
        }

        const { data: furnitureData, error: furnitureError } = await supabase
            .from('features')
            .select('*')
            .eq('type', 'furniture');

        if (furnitureError) {
            console.error('Error loading furniture:', furnitureError);
        } else if (furnitureData) {
            setFurnitureFeatures({
            type: 'FeatureCollection',
            features: furnitureData.map((item) => {
                const size = FURNITURE_SIZES[item.name.toLowerCase() as keyof typeof FURNITURE_SIZES];
                return {
                    id: item.id,
                    type: 'Feature',
                    geometry: item.geometry,
                    properties: {
                        type: 'furniture',
                        id: item.id,
                        item: item.name,
                        emoji: item.icon,
                        height: size.height, // Use height from constants
                        shape: item.shape,
                        rotation: item.rotation || 0,
                        label: item.label,
                        scaleX: item.scaleX || 1,
                        scaleY: item.scaleY || 1,
                        originalGeometry: item.originalGeometry,
                    },
                };
            }),
            });
        }

        setDataLoaded(true);
        };

        loadData();
    }, [mapLoaded]);

    // Update map sources when features change
    useEffect(() => {
        if (map.current && mapLoaded) {
            (map.current.getSource('walls') as mapboxgl.GeoJSONSource | undefined)?.setData(wallFeatures);
            (map.current.getSource('rooms') as mapboxgl.GeoJSONSource | undefined)?.setData(roomFeatures);
            (map.current.getSource('furniture') as mapboxgl.GeoJSONSource | undefined)?.setData(furnitureFeatures);
        }
    }, [wallFeatures, roomFeatures, furnitureFeatures, mapLoaded]);

    const createFurnitureMarkers = useCallback(
        (mapInstance: mapboxgl.Map, furniture: FurnitureFeature | null, updateTransform: (t: any) => void) => {
        if (!furniture) {
            console.warn('No furniture provided for marker creation.');
            return;
        }
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        if (mapInstance.getSource('furniture-preview')) {
            mapInstance.removeLayer('furniture-preview');
            mapInstance.removeSource('furniture-preview');
        }

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
        sliderEl.style.pointerEvents = 'none';
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
        const svg = sliderEl.querySelector('svg');
        const handle = sliderEl.querySelector('#slider-handle') as SVGCircleElement;
        if (svg) svg.style.pointerEvents = 'none';
        if (handle) handle.style.pointerEvents = 'all';

        sliderEl.addEventListener('mousedown', (e) => e.stopPropagation());
        sliderEl.addEventListener('touchstart', (e) => e.stopPropagation());
        moveEl.style.position = 'relative';
        moveEl.appendChild(sliderEl);

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

            // --- Preview rotation geometry ---
            const centroid = turf.centroid(furniture).geometry.coordinates as [number, number];
            const baseGeom = furniture.properties?.originalGeometry || furniture.geometry;
            const rotated = rotateFeature(
            { ...furniture, geometry: baseGeom },
            angle,
            centroid
            );
            const previewGeoJSON = {
            type: "FeatureCollection",
            features: [{
                type: 'Feature',
                geometry: rotated.geometry,
                properties: {},
            }],
            };
            if (mapInstance.getSource('furniture-preview')) {
            (mapInstance.getSource('furniture-preview') as mapboxgl.GeoJSONSource).setData(previewGeoJSON as FeatureCollection);
            } else {
            mapInstance.addSource('furniture-preview', {
                type: 'geojson', 
                data: previewGeoJSON as FeatureCollection,
            });
            mapInstance.addLayer({
                id: 'furniture-preview',
                type: 'fill',
                source: 'furniture-preview',
                paint: {
                'fill-color': '#00bfff',
                'fill-opacity': 0.3,
                }
            });
            }
            // --- End preview ---

            updateTransform({ rotation: Number(angle) });
        };

        const onDragEnd = () => {
            dragging = false;
            window.removeEventListener('mousemove', onDrag);
            window.removeEventListener('touchmove', onDrag);
            window.removeEventListener('mouseup', onDragEnd);
            window.removeEventListener('touchend', onDragEnd);
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
            .addTo(mapInstance);

        moveMarker.on('remove', () => {
            moveEl.removeChild(sliderEl);
        });


        moveMarker.on('drag', async (e) => {
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

            console.log(newGeom.coordinates[0])

            const previewGeoJSON = {
                type: "FeatureCollection",
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon', 
                        coordinates: [newGeom.coordinates[0]],
                    },
                    properties: {},
                }],
            };

            if (mapInstance.getSource('furniture-preview')) {
                (mapInstance.getSource('furniture-preview') as mapboxgl.GeoJSONSource).setData(previewGeoJSON as FeatureCollection);
            } else {
                mapInstance.addSource('furniture-preview', {
                    type: 'geojson', 
                    data: previewGeoJSON as FeatureCollection,
                });
                mapInstance.addLayer({
                    id: 'furniture-preview',
                    type: 'fill',
                    source: 'furniture-preview',
                    paint: {
                        'fill-color': '#00bfff',
                        'fill-opacity': 0.3,
                    }
                });
            }
        })

        moveMarker.on('dragend', async (e) => {
            if(mapInstance.getSource('furniture-preview')) {
                mapInstance.removeLayer('furniture-preview');
                mapInstance.removeSource('furniture-preview');
            }

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

            setFurnitureFeatures((prev) => ({
                ...prev,
                features: prev.features.map((f) =>
                    f.id === furniture.id
                        ? {
                            ...f,
                            geometry: newGeom,
                            properties: {
                                ...f.properties,
                                originalGeometry: newGeom,
                            },
                        }
                        : f
                ),
            }));

            const { error } = await supabase
            .from('features')
            .update({ geometry: newGeom })
            .eq('id', furniture.id);
            if (error) {
            console.error('Error updating furniture geometry:', error);
            }

            updateTransform({});
        });

        markersRef.current.push(moveMarker);
        },
        [selectedFurniture, setFurnitureFeatures]
    );

    const setRoomMarkers = useCallback((map: mapboxgl.Map, room: RoomFeature | null) => {
        console.log('Setting room markers for:', room);
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        if (map.getSource('room-preview')) {
            map.removeLayer('room-preview');
            map.removeSource('room-preview');
        }

        if (!room || !room.geometry || !room.geometry.coordinates) {
            console.log(room, room?.geometry, room?.geometry?.coordinates);
            return null;
        }

        const corners = room.geometry.coordinates[0];
        const markers: mapboxgl.Marker[] = [];
        let previewCoordinates = [...corners];

        console.log('Room corners:', corners);

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
        // Update the room's geometry with the new coordinates
        room.geometry = newGeometry;

        setRoomFeatures((prev) => ({
            ...prev,
            features: prev.features.map((f) =>
            f.id === selectedFeatureId ? { ...f, geometry: newGeometry } : f
            ),
        })); 

        console.log('Updated room geometry:', newGeometry, selectedFeatureId);

        // updateRoomProperties({ geometry: newGeometry });
        
        const { error } = await supabase
            .from('rooms')
            .update({ geometry: newGeometry })
            .eq('id', room.properties.id);
        if (error) {
            console.log('Error updating room geometry:', error);
        }

        if (map.getSource('room-preview')) {
            map.removeLayer('room-preview');
            map.removeSource('room-preview');
        }
        });

        markers.push(marker);
        }

        markersRef.current = markers;
        return markers;
    }, []);

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
                width: wallWidth,
                height: WALL_HEIGHT,
                },
            ])
            .select();

            setTimeout(() => {
            draw.current?.changeMode('draw_line_string');
            }, 0);
        } catch (err) {
            console.error('Turf buffering error:', err);
        }
        } else if (newFeature.geometry.type === 'Polygon') {
        const roomFeature: RoomFeature = {
            type: 'Feature',
            id: uniqueId,
            geometry: newFeature.geometry as Polygon,
            properties: {
            id: uniqueId,
            type: 'room',
            name: `Mystery room ${roomFeatures.features.length + 1}`,
            number: '',
            color: '#ff0000',
            bookable: true,
            capacity: 10,
            avEquipment: [],
            purpose: '',
            },
        };

        setRoomFeatures((prev) => ({
            ...prev,
            features: [...prev.features, roomFeature],
        }));

        const { error } = await supabase
            .from('rooms')
            .insert({
            id: uniqueId,
            room_number: null,
            title: roomFeature.properties.name,
            description: roomFeature.properties.purpose,
            seats: roomFeature.properties.capacity,
            bookable: roomFeature.properties.bookable,
            geometry: roomFeature.geometry,
            color: roomFeature.properties.color,
            });

        if (error) {
            console.error('Error inserting room:', error);
        }

        setSelectedFeatureId(uniqueId);
        setTimeout(() => {
            draw.current?.changeMode('draw_polygon');
        }, 0);
        }
    }, [mode, wallWidth, roomFeatures]);

    const handleDrawUpdate = useCallback(async (e: any) => {
        if (!e.features || !e.features[0]) {
        console.warn('Invalid draw.update event:', e);
        return;
        }

        const updatedFeature = e.features[0];

        if (updatedFeature.geometry.type === 'LineString') {
        try {
            const line = turf.lineString(updatedFeature.geometry.coordinates);
            const cleaned = turf.truncate(line, { precision: 10 });
            const buffered = turf.buffer(cleaned, Math.max(0.1, wallWidth / 2), { units: 'meters' });

            if (!buffered || !buffered.geometry || buffered.geometry.type !== 'Polygon') {
            console.warn('Invalid wall polygon:', buffered);
            return;
            }

            const updatedWallFeature: WallFeature = {
            type: 'Feature',
            id: updatedFeature.id,
            geometry: buffered.geometry as Polygon,
            properties: {
                type: 'wall',
                width: wallWidth,
                height: WALL_HEIGHT,
            },
            };

            setWallFeatures((prev) => ({
            ...prev,
            features: prev.features.map((f) =>
                f.id === updatedFeature.id ? updatedWallFeature : f
            ),
            }));

            const { data, error } = await supabase
            .from('features')
            .update({
                geometry: updatedWallFeature.geometry,
                width: wallWidth,
                height: WALL_HEIGHT,
            })
            .eq('id', updatedFeature.id)
            .select();

            if (error) {
            console.error('Error updating wall feature:', error);
            }
        } catch (err) {
            console.error('Error processing wall update:', err);
        }
        } else if (updatedFeature.geometry.type === 'Polygon') {
        setRoomFeatures((prev) => ({
            ...prev,
            features: prev.features.map((f) =>
            f.id === updatedFeature.id ? updatedFeature : f
            ),
        }));

        const { error } = await supabase
            .from('rooms')
            .update({ geometry: updatedFeature.geometry })
            .eq('id', updatedFeature.id)
            .select();

        if (error) {
            console.error('Error updating room geometry:', error);
        }
        }
    }, [wallWidth]);

    const handleMapClick = useCallback((e: mapboxgl.MapMouseEvent) => {
        if (!map.current) return;
        e.preventDefault();
        e.originalEvent.stopPropagation();

        const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
        [e.point.x, e.point.y],
        [e.point.x, e.point.y],
        ];

        const featuresAtPoint = map.current.queryRenderedFeatures(bbox, {
        layers: ['rooms', 'furniture', 'walls'],
        });

        // console.log('Features at point:', featuresAtPoint);

        if (mode === 'simple_select') {
            const furnitureFeature = featuresAtPoint.find(
                (f) => f.properties?.type === 'furniture'
            ) as FurnitureFeature | undefined;

            if (furnitureFeature) {
                const matchedFurniture = furnitureFeatures.features.find(
                    (f) => f.id === (furnitureFeature.id || furnitureFeature.properties?.id)
                ) as FurnitureFeature | undefined;

                if (matchedFurniture) {
                    setSelectedFurniture(matchedFurniture);
                    setSelectedRoom(null)
                    setSelectedFeatureId(matchedFurniture.id as string)
                    createFurnitureMarkers(map.current, selectedFurniture as FurnitureFeature, updateFurnitureTransform)
                    return;
                } else {
                    const normalizedFurniture: FurnitureFeature = {
                        ...furnitureFeature,
                        id: furnitureFeature.id || furnitureFeature.properties?.id,
                        properties: {
                            ...furnitureFeature.properties,
                            id: String(furnitureFeature.properties?.id ?? furnitureFeature.id ?? '')
                        }
                    }
                    setSelectedFeatureId(normalizedFurniture.id as string);
                    setSelectedFurniture(furnitureFeature.id ? normalizedFurniture : null);
                    setSelectedRoom(null);
                    createFurnitureMarkers(map.current, normalizedFurniture as FurnitureFeature, updateFurnitureTransform);
                    console.log('Selected furniture (fallback):', normalizedFurniture.id)
                    return;
                }
                
            }
        // }

        const roomFeature = featuresAtPoint.find(
            (f) => f.properties?.type === 'room'
        ) as RoomFeature | undefined;
        if (roomFeature) {
            const matchedRoom = roomFeatures.features.find(
                (f) => f.id === (roomFeature.id || roomFeature.properties?.id)
            ) as RoomFeature | undefined;

            if (matchedRoom) {
                setSelectedFeatureId(matchedRoom.id as string);
                setSelectedRoom(matchedRoom);
                setSelectedFurniture(null);
                setRoomMarkers(map.current, matchedRoom);
                console.log('Selected room:', matchedRoom.id);
                return;
            } else {
                const normalizedRoom: RoomFeature = {
                    ...roomFeature,
                    id: roomFeature.id || roomFeature.properties?.id,
                    properties: {
                        ...roomFeature.properties,
                        id: String(roomFeature.properties?.id ?? roomFeature.id ?? ''),
                    },
                };
                setSelectedFeatureId(normalizedRoom.id as string);
                setSelectedRoom(normalizedRoom.id ? normalizedRoom : null);
                setSelectedFurniture(null);
                setRoomMarkers(map.current, normalizedRoom as RoomFeature);
                console.log('Selected room (fallback):', normalizedRoom.id);
                return;
            }
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
        setSelectedRoom(null);
        markersRef.current.forEach((marker) => marker.remove());
        }
    }, [mode, setRoomMarkers, furnitureFeatures, setSelectedRoom, selectedRoom]);

    const handleFurnitureMouseDown = useCallback((e: mapboxgl.MapMouseEvent) => {
        if (mode !== 'simple_select' || !map.current || !selectedFurniture) return;

        const featuresAtPoint = map.current.queryRenderedFeatures(e.point, {
        layers: ['furniture'],
        });
        // console.log('Furniture features at point:', featuresAtPoint);

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
                const newGeom = turf.transformTranslate(
                    f.geometry as Polygon,
                    delta[0],
                    delta[1],
                    { units: 'degrees' }
                );
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
        };
    }, [mode, selectedFurniture]);

    const handleLayerSelect = useCallback((feature: Feature) => {
        if (feature.properties?.type === 'furniture') {
        const furniture = furnitureFeatures.features.find((f => f.id === feature.id)) as FurnitureFeature;
        setSelectedFurniture(furniture || null);
        setSelectedFeatureId(null);
        } else if (feature.properties?.type === 'room') {
        setSelectedFeatureId(feature.id as string || null);
        setSelectedFurniture(null);
        setSelectedRoom(feature as RoomFeature); // Use setSelectedRoom
        if (map.current) {
            setRoomMarkers(map.current, feature as RoomFeature);
        }
        } else {
        setSelectedFeatureId(feature.id as string || null);
        setSelectedFurniture(null);
        setSelectedRoom(null);
        }
    }, [furnitureFeatures, setRoomMarkers, setSelectedRoom]);

    const handleNativeDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        if (!map.current) return;

        const data = e.dataTransfer?.getData('application/json');
        if (!data) return;

        const furnitureItem = JSON.parse(data);
        const rect = mapContainer.current?.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (rect) {
        clientX = e.clientX - rect.left;
        clientY = e.clientY - rect.top;
        }
        const point = map.current.unproject([clientX, clientY]);
        const lngLat: [number, number] = [point.lng, point.lat];

        const size = FURNITURE_SIZES[furnitureItem.id as keyof typeof FURNITURE_SIZES] || FURNITURE_SIZES.cube;
        const halfWidth = size.width / 2 / 50000;
        const halfDepth = size.depth / 2 / 50000;

        const coords: [number, number][] = [
        [lngLat[0] - halfWidth, lngLat[1] - halfDepth],
        [lngLat[0] + halfWidth, lngLat[1] - halfDepth],
        [lngLat[0] + halfWidth, lngLat[1] + halfDepth],
        [lngLat[0] - halfWidth, lngLat[1] + halfDepth],
        [lngLat[0] - halfWidth, lngLat[1] - halfDepth],
        ];

        const uniqueId = generateUniqueId();

        const newFurniture: FurnitureFeature = {
        type: 'Feature',
        id: uniqueId,
        geometry: {
            type: 'Polygon',
            coordinates: [coords],
        },
        properties: {
            type: 'furniture',
            id: uniqueId,
            item: furnitureItem.name,
            emoji: furnitureItem.icon,
            height: size.height,
            shape: furnitureItem.shape,
            label: '',
        },
        };

        setFurnitureFeatures((prev) => ({
        ...prev,
        features: [...prev.features, newFurniture],
        }));

        setSelectedFurniture(newFurniture);
        setSelectedFeatureId(null);

        const { error } = await supabase
        .from('features')
        .insert({
            id: uniqueId,
            geometry: newFurniture.geometry,
            type: 'furniture',
            name: furnitureItem.name,
            icon: furnitureItem.icon,
            label: '',
        });

        if (error) {
        console.error('Error inserting furniture:', error);
        }
    }, []);

    const handleExportGeoJSON = useCallback(() => {
        const exportData = {
        walls: wallFeatures,
        rooms: roomFeatures,
        furniture: furnitureFeatures,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map-data.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [wallFeatures, roomFeatures, furnitureFeatures]);

    const updateFurnitureProperties = useCallback(
        async (properties: Partial<FurnitureFeature['properties']>) => {
        if (!selectedFurniture || !selectedFurniture.id) return;

        setFurnitureFeatures((prev) => ({
            ...prev,
            features: prev.features.map((f) =>
            f.id === selectedFurniture.id ? { ...f, properties: { ...f.properties, ...properties } } : f
            ),
        }));

        setSelectedFurniture((prev) =>
            prev && prev.id === selectedFurniture.id
            ? { ...prev, properties: { ...prev.properties, ...properties } }
            : prev
        );

        const updatePayload: any = {};
            if (properties.label !== undefined) updatePayload.label = properties.label;
            if (properties.rotation !== undefined) updatePayload.rotation = properties.rotation;
            if (properties.scaleX !== undefined) updatePayload.scaleX = properties.scaleX;
            if (properties.scaleY !== undefined) updatePayload.scaleY = properties.scaleY;

            if (Object.keys(updatePayload).length > 0) {
                const { error } = await supabase
                .from('features')
                .update(updatePayload)
                .eq('id', selectedFurniture.id);
                if (error) {
                console.error('Error updating furniture properties:', error);
                }
            }
        },
        [selectedFurniture]
    );

    const updateFurnitureTransform = useCallback(
        debounce(async (transform: { rotation?: number; scaleX?: number; scaleY?: number }) => {
        if (!selectedFurniture || !map.current || !selectedFurniture.id) {
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
                const centroid = turf.centroid(f).geometry.coordinates as [number, number];
                const baseGeom = f.properties?.originalGeometry || f.geometry;
                newGeom = rotateFeature(
                    { ...f, geometry: baseGeom },
                    transform.rotation,
                    centroid
                ).geometry as Polygon;
                newProps.rotation = transform.rotation;
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
            supabase
                .from('features')
                .update({
                geometry: updatedFeature.geometry,
                })
                .eq('id', updatedFeature.id)
                .then(({ error }) => {
                if (error) {
                    console.error('Error updating furniture in Supabase:', error);
                }
                });
            }

            return { ...prev, features: newFeatures };
        });
        }, 100),
        [selectedFurniture, createFurnitureMarkers]
    );

    useEffect(() => {
        if (selectedFurniture && map.current) {
            createFurnitureMarkers(map.current, selectedFurniture, updateFurnitureTransform);
        } else {
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
        }
    }, [selectedFurniture, createFurnitureMarkers, updateFurnitureTransform]);

    const updateRoomProperties = useCallback(
        async (properties: Partial<RoomFeature['properties']>) => {
            if (!selectedFeatureId) return;

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
            if (properties.geometry !== undefined) updatePayload.geometry = properties.geometry;

            if (Object.keys(updatePayload).length > 0) {
                const { error } = await supabase
                .from('rooms')
                .update(updatePayload)
                .eq('id', selectedFeatureId);
                if (error) {
                console.error('Error updating room properties:', error);
                }
            }
            },
            [selectedFeatureId, setRoomFeatures]
        );

    useEffect(() => {
        if (!map.current) return;

        map.current.on('click', handleMapClick);
        map.current.on('mousedown', handleFurnitureMouseDown);
        map.current.on('draw.create', handleDrawCreate);
        map.current.on('draw.update', handleDrawUpdate);
        mapContainer.current?.addEventListener('drop', handleNativeDrop as unknown as EventListener);
        mapContainer.current?.addEventListener('dragover', (e) => e.preventDefault());

        return () => {
            map.current?.off('click', handleMapClick);
            map.current?.off('mousedown', handleFurnitureMouseDown);
            map.current?.off('draw.create', handleDrawCreate);
            map.current?.off('draw.update', handleDrawUpdate);
            mapContainer.current?.removeEventListener('drop', handleNativeDrop as unknown as EventListener);
            mapContainer.current?.removeEventListener('dragover', (e) => e.preventDefault());
        };
    }, [handleMapClick, handleFurnitureMouseDown, handleDrawCreate, handleDrawUpdate, handleNativeDrop, mapContainer]);

        return {
            mode,
            wallFeatures,
            roomFeatures,
            furnitureFeatures,
            wallWidth,
            selectedFeatureId,
            selectedRoom, // Export selectedRoom
            selectedFurniture,
            expandedLayers,
            mapLoaded,
            dataLoaded,
            rotationInput,
            setMode,
            setWallFeatures,
            setRoomFeatures,
            setFurnitureFeatures,
            setWallWidth,
            setSelectedFeatureId,
            setSelectedRoom, // Export setSelectedRoom
            setSelectedFurniture,
            setExpandedLayers,
            setMapLoaded,
            setDataLoaded,
            setRotationInput,
            handleDrawCreate,
            handleDrawUpdate,
            handleMapClick,
            handleFurnitureMouseDown,
            // handleDrop, // Removed because it's not defined
            handleLayerSelect,
            handleExportGeoJSON,
            createFurnitureMarkers,
            setRoomMarkers,
            updateFurnitureTransform,
            updateFurnitureProperties,
            updateRoomProperties,
            initializeMapLayers,
        };
    };