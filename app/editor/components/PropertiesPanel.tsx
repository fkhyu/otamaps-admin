'use client';

import React from 'react';
import { FeatureCollection, Feature } from 'geojson';
import { RoomFeature, FurnitureFeature } from '../lib/types';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

interface PropertiesPanelProps {
  selectedFeatureId: string | null;
  selectedFurniture: FurnitureFeature | null;
  rotationInput: number;
  setRotationInput: (value: number) => void;
  updateFurnitureProperties: (properties: Partial<FurnitureFeature['properties']>) => Promise<void>;
  updateRoomProperties: (properties: Partial<RoomFeature['properties']>) => Promise<void>;
  updateFurnitureTransform: (transform: { rotation?: number; scaleX?: number; scaleY?: number }) => void;
  handleExportGeoJSON: () => void;
  roomFeatures: FeatureCollection;
  wallFeatures: FeatureCollection;
  poiFeatures: FeatureCollection;
  setWallFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  setRoomFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  setFurnitureFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  setPoiFeatures: React.Dispatch<React.SetStateAction<FeatureCollection>>;
  setSelectedFeatureId: (id: string | null) => void;
  setSelectedFurniture: (furniture: FurnitureFeature | null) => void;
}
export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedFeatureId,
  selectedFurniture,
  rotationInput,
  setRotationInput,
  updateFurnitureProperties,
  updateRoomProperties,
  updateFurnitureTransform,
  handleExportGeoJSON,
  roomFeatures,
  wallFeatures,
  poiFeatures,
  setWallFeatures,
  setRoomFeatures,
  setFurnitureFeatures,
  setPoiFeatures,
  setSelectedFeatureId,
  setSelectedFurniture,
}) => {
  // Fix the selectedFeature function - remove duplicates and fix logic
  const selectedFeature = (roomFeatures: FeatureCollection, wallFeatures: FeatureCollection, poiFeatures: FeatureCollection) =>
    roomFeatures.features.find((f) => f.id === selectedFeatureId) ||
    wallFeatures.features.find((f) => f.id === selectedFeatureId) ||
    (poiFeatures?.features?.find((f) => f.id === selectedFeatureId)) ||
    null;

  // Add debug logging
  console.log('poiFeatures in PropertiesPanel:', poiFeatures);
  console.log('selectedFeatureId:', selectedFeatureId);

  return (
    <div className="w-64 bg-white dark:bg-gray-900 shadow-md p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Properties</h2>
      
      {/* Update all selectedFeature calls to include poiFeatures */}
      {selectedFeatureId && selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.type === 'room' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.name || ''}
              onChange={(e) => updateRoomProperties({ name: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room number</label>
            <input
              type="text"
              value={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.number || ''}
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
              value={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.color || '#ff0000'}
              onChange={(e) => updateRoomProperties({ color: e.target.value })}
              className="w-full h-10 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.bookable || false}
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
              value={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.capacity || 0}
              onChange={(e) => updateRoomProperties({ capacity: Number(e.target.value) })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
            <input
              type="text"
              value={selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.purpose || ''}
              onChange={(e) => updateRoomProperties({ purpose: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geometry</label>
            <textarea
              value={JSON.stringify(selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.geometry, null, 2)}
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
              // delete all walls that have a 'for' value same as deleted room_id
              const { error: wallError } = await supabase
                .from('features')
                .delete()
                .eq('for', selectedFeatureId);
              if (wallError) {
                console.error('Error deleting walls:', wallError);
              }
              // update wall features on map
              console.log(wallFeatures.features.find((f) => f.properties?.for === selectedFeatureId));
              const { data } = await supabase
                .from('features')
                .select('*')

              if (data) {
                setWallFeatures({
                  type: 'FeatureCollection',
                  features: data as Feature[]
                });
              }
            }}
            className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium"
          >
            Delete Room
          </button>
        </div>
      )}
      {selectedFurniture && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              type="text"
              value={selectedFurniture.properties.label || ''}
              onChange={(e) => updateFurnitureProperties({ label: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rotation (degrees)</label>
            <input
              type="number"
              value={rotationInput}
              onChange={(e) => setRotationInput(Number(e.target.value))}
              onBlur={() => updateFurnitureTransform({ rotation: rotationInput })}
              className=  "w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
      {selectedFeatureId && selectedFeature(roomFeatures, wallFeatures, poiFeatures)?.properties?.type === 'wall' && (
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
      {selectedFeatureId && (() => {
        const poiFeature = poiFeatures?.features?.find(
          (f) => f.id === selectedFeatureId
        );
        console.log('poiFeature found:', poiFeature);
        
        if (!poiFeature) return null;
        return (
          <div className="space-y-4">
            {poiFeature.properties?.type !== 'event' && (
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={poiFeature.properties?.title || ''}
                    onChange={async (e) => {
                      setPoiFeatures((prev) => ({
                        ...prev,
                        features: prev.features.map((f) =>
                          f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, title: e.target.value } } : f
                        ),
                      }));
                      const { error } = await supabase
                        .from('poi')
                        .update({ title: e.target.value })
                        .eq('id', selectedFeatureId);
                      if (error) {
                        console.error('Error updating POI label:', error);
                      }
                    }}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={poiFeature.properties?.description || ''}
                    onChange={async (e) => {
                      setPoiFeatures((prev) => ({
                        ...prev,
                        features: prev.features.map((f) =>
                          f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, description: e.target.value } } : f
                        ),
                      }));
                      const { error } = await supabase
                        .from('poi')
                        .update({ desc: e.target.value })
                        .eq('id', selectedFeatureId);
                      if (error) {
                        console.error('Error updating POI description:', error);
                      }
                    }}
                    className="w-full h-24 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={poiFeature.properties?.type || ''}
                onChange={async (e) => {
                  // Fix: Update POI in poiFeatures, not roomFeatures
                  setPoiFeatures((prev) => ({
                    ...prev,
                    features: prev.features.map((f) =>
                      f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, type: e.target.value } } : f
                    ),
                  }));
                  const { error: poiUpdateError } = await supabase
                    .from('poi')
                    .update({ type: e.target.value })
                    .eq('id', selectedFeatureId);
                  if (poiUpdateError) {
                    console.error('Error updating POI type:', poiUpdateError);
                    return;
                  }
                  if (e.target.value === 'event') {
                    const { data:poiExists } = await supabase
                      .from('poi')
                      .select('id')
                      .eq('id', selectedFeatureId)
                      .single();

                    if (!poiExists) {
                      console.error("POI feature doesn't exist, cannot create event");
                      return;
                    }

                    const { data:existinEvents, error:checkError } = await supabase
                      .from('events')
                      .select('*')
                      .eq('poi_id', selectedFeatureId);

                    if (checkError) {
                      console.error('Joo error lol', checkError);
                    }
                    if (existinEvents) {
                      if (existinEvents.length === 0) {
                        const oneYearFromNow = new Date();
                        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

                        const poi = poiFeatures.features.find(f => f.id === selectedFeatureId);
                        const { error:eventError } = await supabase
                          .from('events')
                          .insert({
                          id: crypto.randomUUID(),
                          name: poi?.properties?.title || '',
                          start_time: oneYearFromNow, 
                          end_time: oneYearFromNow,
                          description: poi?.properties?.description,
                          created_at: new Date().toISOString(),
                          poi_id: selectedFeatureId, 
                          });
                        if (eventError) {
                            console.error('Error inserting event:', eventError);
                        }
                      }
                    }
                  } else {
                    const { data, error } = await supabase
                      .from('events')
                      .select('*')
                      .eq('poi_id', selectedFeatureId);

                    if (error) {
                      console.error('Joo error lol')
                    }

                    if (data) {
                        const { error } = await supabase
                        .from('events')
                        .delete()
                        .eq('poi_id', selectedFeatureId);
                        if (error) {
                          console.error('Error deleting event(s) for POI:', error);
                        }
                    }
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="landmark">Landmark</option>
                <option value="event">Event</option>
                <option value="food">Food</option>
                <option value="view">View</option>
                <option value="gem">Gem</option>
              </select>
            </div>
            {poiFeature.properties?.type !== 'event' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="text"
                value={poiFeature.properties?.image_url || ''}
                onChange={async (e) => {
                  setPoiFeatures((prev) => ({
                    ...prev,
                    features: prev.features.map((f) =>
                      f.id === selectedFeatureId ? { ...f, properties: { ...f.properties, image_url: e.target.value } } : f
                    ),
                  }));
                  const { error } = await supabase
                    .from('poi')
                    .update({ image_url: e.target.value })
                    .eq('id', selectedFeatureId);
                  if (error) {
                    console.error('Error updating POI icon:', error);
                  }
                }}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Geometry</label>
              <textarea
                value={JSON.stringify(poiFeature.geometry, null, 2)}
                onChange={async (e) => {
                  try {
                    const newGeometry = JSON.parse(e.target.value);
                    // Fix: Update POI in poiFeatures, not roomFeatures
                    setPoiFeatures((prev) => ({
                      ...prev,
                      features: prev.features.map((f) =>
                        f.id === selectedFeatureId ? { ...f, geometry: newGeometry } : f
                      ),
                    }));
                    const { error } = await supabase
                      .from('poi') // Use correct table name
                      .update({ 
                        lon: newGeometry.coordinates[0], 
                        lat: newGeometry.coordinates[1] 
                      })
                      .eq('id', selectedFeatureId);
                    if (error) {
                      console.error('Error updating POI geometry:', error);
                    }
                  } catch (err) {
                    console.error('Invalid JSON for geometry:', err);
                  }
                }}
                className="w-full h-32 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            { poiFeature.properties?.type !== 'event' && (
              <button
                onClick={async () => {
                  // Fix: Update POI in poiFeatures, not roomFeatures
                  setPoiFeatures((prev) => ({
                    ...prev,
                    features: prev.features.filter((f) => f.id !== selectedFeatureId),
                  }));
                  setSelectedFeatureId(null);
                  const { error } = await supabase
                    .from('poi') // Use correct table name
                    .delete()
                    .eq('id', selectedFeatureId);
                  if (error) {
                    console.error('Error deleting POI:', error);
                  }
                }}
                className="mt-5 mb-8 w-full bg-red-600 text-white p-2 rounded-md hover:bg-red-700 transition font-medium"
              >
                Delete POI
              </button>
            )}
            {poiFeature.properties?.type === 'event' && (
              <button
                className='mt-5 mb-8 w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition font-medium'
                onClick={() => { window.location.href = `/events?id=${selectedFeatureId}`; }}
              >
                Modify event
              </button>
            )}
          </div>
        );
      })()}

      {!selectedFeatureId && !selectedFurniture && (
        <p className="text-sm text-gray-500">Select a layer to edit its properties.</p>
      )}
      <button
        onClick={handleExportGeoJSON}
        className="mt-4 w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition font-medium"
      >
        Export GeoJSON Files
      </button>
    </div>
  );
};