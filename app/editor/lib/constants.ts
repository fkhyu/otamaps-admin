import { FurnitureItem } from './types';

export const DEFAULT_CENTER: [number, number] = [24.8182, 60.1842];
export const DEFAULT_ZOOM = 17;
export const WALL_HEIGHT = 3;
export const DEFAULT_WALL_WIDTH = 0.3;

export const FURNITURE_SIZES = {
  sofa: { width: 2, height: 0.3, depth: 0.4 },
  chair: { width: 0.7, height: 0.35, depth: 0.7 },
  table: { width: 1.5, height: 0.5, depth: 2 },
};

export const furnitureLibrary: FurnitureItem[] = [
  { id: 'sofa', name: 'Sofa', icon: '🛋️', shape: 'cube' },
  { id: 'chair', name: 'Chair', icon: '🪑', shape: 'cylinder' },
  { id: 'table', name: 'Table', icon: '🪵', shape: 'cube' },
];

export const MAPBOX_STYLE =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'mapbox://styles/mapbox/dark-v10'
    : 'mapbox://styles/mapbox/streets-v12';