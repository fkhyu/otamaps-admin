'use client';

import React, { useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { LayerPanel } from './LayerPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { FurnitureToolbar } from './FurnitureToolbar';
import { useEditor } from '../hooks/useEditor';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/constants';

const Editor: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);

  const {
    mode,
    wallFeatures,
    roomFeatures,
    furnitureFeatures,
    poiFeatures,
    selectedFeatureId,
    selectedFurniture,
    expandedLayers,
    mapLoaded,
    dataLoaded,
    rotationInput,
    setMode,
    setWallFeatures,
    setRoomFeatures,
    setFurnitureFeatures,
    setPoiFeatures,
    setSelectedFeatureId,
    setSelectedFurniture,
    setExpandedLayers,
    setMapLoaded,
    setDataLoaded,
    setRotationInput,
    handleDrawCreate,
    handleDrawUpdate,
    handleMapClick,
    handleFurnitureMouseDown,
    handleLayerSelect,
    handleExportGeoJSON,
    createFurnitureMarkers,
    setRoomMarkers,
    updateFurnitureTransform,
    updateFurnitureProperties,
    updateRoomProperties,
    initializeMapLayers,
  } = useEditor(map, draw, mapContainer);

  return (
    <div className="flex flex-1 overflow-hidden">
      <LayerPanel
        wallFeatures={wallFeatures}
        roomFeatures={roomFeatures}
        furnitureFeatures={furnitureFeatures}
        selectedFeatureId={selectedFeatureId}
        selectedFurniture={selectedFurniture}
        expandedLayers={expandedLayers}
        toggleLayer={(layer) => setExpandedLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
        handleLayerSelect={handleLayerSelect}
        setWallFeatures={setWallFeatures}
        setRoomFeatures={setRoomFeatures}
      />
      <div className="flex-1">
        <div ref={mapContainer} className="w-full h-full" />
      </div>
      <PropertiesPanel
        selectedFeatureId={selectedFeatureId}
        selectedFurniture={selectedFurniture}
        rotationInput={rotationInput}
        setRotationInput={setRotationInput}
        updateFurnitureProperties={updateFurnitureProperties}
        updateRoomProperties={updateRoomProperties}
        updateFurnitureTransform={updateFurnitureTransform}
        handleExportGeoJSON={handleExportGeoJSON}
        setWallFeatures={setWallFeatures}
        setRoomFeatures={setRoomFeatures}
        setFurnitureFeatures={setFurnitureFeatures}
        setPoiFeatures={setPoiFeatures}
        setSelectedFeatureId={setSelectedFeatureId}
        setSelectedFurniture={setSelectedFurniture}
        roomFeatures={roomFeatures}
        wallFeatures={wallFeatures}
        poiFeatures={poiFeatures}
      />
      <FurnitureToolbar mode={mode} />
    </div>
  );
};

export default React.memo(Editor);