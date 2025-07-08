// useEditorState.ts
import { useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEditor } from './useEditor';

export function useEditorState() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);

  const editor = useEditor(map, draw, mapContainer);

  return {
    mapContainer,
    map,
    draw,
    ...editor,
  };
}