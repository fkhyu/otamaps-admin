'use client';

import React, { useState } from 'react';
import { FeatureCollection, Feature } from 'geojson';
import { WallFeature, RoomFeature, FurnitureFeature } from '../lib/types';
import autofillWalls from '../lib/autofillWalls';

interface LayerPanelProps {
  wallFeatures: FeatureCollection;
  roomFeatures: FeatureCollection;
  furnitureFeatures: FeatureCollection;
  selectedFeatureId: string | null;
  selectedFurniture: FurnitureFeature | null;
  expandedLayers: { [key: string]: boolean };
  toggleLayer: (layer: string) => void;
  handleLayerSelect: (feature: Feature) => void;
  setWallFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  setRoomFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  wallFeatures,
  roomFeatures,
  furnitureFeatures,
  selectedFeatureId,
  selectedFurniture,
  expandedLayers,
  toggleLayer,
  handleLayerSelect,
  setWallFeatures,
  setRoomFeatures,
}) => {
  const [buttonLabel, setButtonLabel] = useState('Go to SF');

  console.log('LayerPanel rendered with wallFeatures:', roomFeatures);

  return (
    <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
      <button 
        className='bg-[#E78F4A] text-white py-3 w-full rounded-xl mb-10 font-semibold text-2xl'
        id='goToSF'
        aria-label="Go to San Francisco"
        type="button"
        onClick={() => {
          const event = new CustomEvent('moveToLocation', { detail: { lng: -122.44, lat: 37.76, zoom: 11.8 } });
          window.dispatchEvent(event);
          setButtonLabel("Go to Finland");
          // if button is again clicked go to Finland
          if (buttonLabel === "Go to Finland") {
            const event = new CustomEvent('moveToLocation', { detail: { lng: 24.94, lat: 60.17, zoom: 11.8 } });
            window.dispatchEvent(event);
            setButtonLabel("Go to SF");
          }
        }}
      >
        {buttonLabel}
      </button>
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
                  selectedFeatureId === feature.id ? 'bg-blue-100 dark:bg-blue-950' : ''
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
                  className={`p-2 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 rounded flex flex-row justify-between items-center ${
                    selectedFeatureId === feature.id ? 'bg-blue-100 dark:bg-blue-950' : ''
                  }`}
                  onClick={() => handleLayerSelect(feature)}
                >
                  {feature.properties?.name || `Room ${roomFeatures.features.indexOf(feature) + 1}`}
                  { !feature.properties?.wallified && (
                    <button
                      onClick={() => {
                        if (!feature.properties?.wallified) {
                          autofillWalls(
                            feature as RoomFeature,
                            feature.properties?.width || 0.2,
                            setWallFeatures,
                            setRoomFeatures
                          );
                        }
                      }}
                      className="text-sm bg-blue-500/10 px-3 py-1 rounded-lg text-blue-600"
                    >
                      Wallify
                    </button>
                  )}
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
                {feature.properties?.label ? `(${feature.properties.label})` : furnitureFeatures.features.indexOf(feature) + 1}
              </div>
            ))}
          </div>
        )}
      </div>
      <a href="/" className="absolute bottom-4 px-8 py-4 hover:bg-gray-50 rounded-lg dark:hover:bg-gray-800">
        ← Back to dashboard
      </a>
    </div>
  );
};