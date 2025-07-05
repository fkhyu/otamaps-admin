import React from 'react';
import { WallFeature, RoomFeature } from './types';
import { FeatureCollection, Polygon } from 'geojson';
import * as turf from '@turf/turf';
import { WALL_HEIGHT } from './constants';
import { generateUniqueId } from './utils';
import { supabase } from '../../../lib/supabaseClient';

export default async function autofillWalls(
  room: RoomFeature, 
  wallWidth: number,
  setWallFeatures?: React.Dispatch<React.SetStateAction<FeatureCollection>>,
  setRoomFeatures?: React.Dispatch<React.SetStateAction<FeatureCollection>>
): Promise<WallFeature[]> {
  try {
    // Validate input parameters
    if (!room || !room.geometry || !room.geometry.coordinates) {
      console.error('Invalid room data provided to autofillWalls');
      return [];
    }

    // Get room coordinates
    const coords = room.geometry.coordinates[0];
    
    if (coords.length > 3) {
      const newWalls: WallFeature[] = [];
      
      // Create walls for each edge of the room
      for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        
        // Skip if coordinates are the same (invalid edge)
        if (start[0] === end[0] && start[1] === end[1]) {
          continue;
        }
        
        try {
          // Create a line segment for this edge
          const lineSegment = turf.lineString([start, end]);
          
          // Buffer the line segment to create wall geometry
          const bufferedWall = turf.buffer(lineSegment, wallWidth / 2, { units: 'meters' });
          
          if (bufferedWall && bufferedWall.geometry && bufferedWall.geometry.type === 'Polygon') {
            const wallFeature: WallFeature = {
              type: 'Feature',
              id: generateUniqueId(),
              geometry: bufferedWall.geometry as Polygon,
              properties: {
                type: 'wall',
                width: wallWidth,
                height: WALL_HEIGHT,
                roomId: String(room.id),
              },
            };
            
            newWalls.push(wallFeature);
          }
        } catch (segmentError) {
          console.warn(`Failed to create wall segment ${i}:`, segmentError);
          continue;
        }
      }
      
      if (newWalls.length > 0) {
        // Update the wall features state if setter is provided
        if (setWallFeatures && typeof setWallFeatures === 'function') {
          setWallFeatures(prev => ({
            ...prev,
            features: [...prev.features, ...newWalls]
          }));
        }

        // Save all walls to Supabase
        try {
          const wallInserts = newWalls.map(wall => ({
            id: wall.id,
            geometry: wall.geometry,
            type: 'wall',
            for: room.id,
            // width: wallWidth,
            // height: WALL_HEIGHT,
            // room_id: String(room.id),
          }));
          
          await supabase
            .from('features')
            .insert(wallInserts);

          await supabase
            .from('rooms')
            .update({ wallified: true })
            .eq('id', room.id);

          // Update the room features state to reflect wallified status
          if (setRoomFeatures && typeof setRoomFeatures === 'function') {
            setRoomFeatures(prev => ({
              ...prev,
              features: prev.features.map(feature => 
                feature.id === room.id 
                  ? { ...feature, properties: { ...feature.properties, wallified: true } }
                  : feature
              )
            }));
          }
        } catch (dbError) {
          console.error('Error saving walls to database:', dbError);
        }
      }
      
      return newWalls;
    }
    
    return [];
  } catch (error) {
    console.error('Error creating walls:', error);
    return [];
  }
}

