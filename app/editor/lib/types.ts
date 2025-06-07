import { Feature, FeatureCollection, Polygon, LineString } from 'geojson';

export type EditorMode = 'simple_select';

export interface WallFeature extends Feature<Polygon> {
  properties: {
    type: 'wall';
    width: number;
    height: number;
    id?: string;
  };
}

export interface FurnitureFeature extends Feature<Polygon> {
  properties: {
    type: 'furniture';
    id?: string;
    item?: string;
    emoji?: string;
    height?: number;
    shape?: 'cube' | 'cylinder';
    rotation?: number;
    label?: string;
    scaleX?: number;
    scaleY?: number;
    originalGeometry?: Polygon;
  };
}

export interface RoomFeature extends Feature<Polygon> {
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
    geometry?: Polygon;
  };
}

export interface FurnitureItem {
  id: string;
  name: string;
  icon: string;
  shape: 'cube' | 'cylinder';
}