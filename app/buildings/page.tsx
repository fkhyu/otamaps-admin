'use client';

import { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const supabase = createClientComponentClient();

// Set your Mapbox access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || 'your-mapbox-token-here';

export default function BuildingsPage() {
  type Building = {
    id: number;
    name: string;
    address?: string;
    floorIDs?: string[];
    lat: number;
    lon: number;
    imageUrl?: string;
  };

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false); // Add this state

  // Handle Escape key to deselect building
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedBuilding(null);
        markers.current.forEach(marker => {
          const el = marker.getElement();
          el.style.backgroundColor = '#3b82f6'; // Reset color
          // Don't override transform - let Mapbox handle positioning
          const currentTransform = el.style.transform;
          const scaleRegex = /scale\([^)]*\)/;
          if (scaleRegex.test(currentTransform)) {
            el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
          } else {
            el.style.transform = currentTransform + ' scale(1)';
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize map when mapContainer is ready
  useEffect(() => {
    if (map.current || !mapContainer) return;

    console.log('Initializing map...');
    
    map.current = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.5, 40],
      zoom: 9,
    });

    map.current.on('load', () => {
      console.log('Map loaded successfully');
      setMapLoaded(true); // Set map as loaded
    });

    map.current.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement;
      if (!target.closest('.building-marker')) {
        setSelectedBuilding(null);
        markers.current.forEach(marker => {
          const el = marker.getElement();
          el.style.backgroundColor = '#3b82f6';
          // Don't override transform - let Mapbox handle positioning
          const currentTransform = el.style.transform;
          const scaleRegex = /scale\([^)]*\)/;
          if (scaleRegex.test(currentTransform)) {
            el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
          } else {
            el.style.transform = currentTransform + ' scale(1)';
          }
        });
      }
    });

    return () => {
      console.log('Cleaning up map...');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, [mapContainer]);

  // Fetch buildings from Supabase
  useEffect(() => {
    if (hasFetched.current) return;

    const fetchBuildings = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase.from('buildings').select('*');

        if (error) throw error;

        console.log('Buildings data:', data);
        setBuildings(data || []);
        hasFetched.current = true;
      } catch (err) {
        console.error('Error fetching buildings:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchBuildings();
  }, []);

  // Add building markers to map
  useEffect(() => {
    if (!map.current || !mapLoaded || buildings.length === 0) return; // Check mapLoaded

    console.log('Adding markers to map...');

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add markers for each building
    buildings.forEach(building => {
      const el = document.createElement('div');
      el.className = 'building-marker';
      el.style.cssText = `
        background-color: #3b82f6;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
      `;

      console.log(`Adding marker for building: ${building.name} at [${building.lon}, ${building.lat}]`);
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat([building.lon, building.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`<h3>${building.name}</h3><p>${building.address || ''}</p>`)
        );

      marker.addTo(map.current!);
      console.log(`Marker added for building: ${building.name}`);
      
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedBuilding(building);
      });

      markers.current.push(marker);
    });

    // Fit map to show all buildings
    if (buildings.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      buildings.forEach(building => {
        bounds.extend([building.lon, building.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [buildings, mapLoaded]); // Add mapLoaded to dependencies

  // Highlight selected building
  useEffect(() => {
    if (!selectedBuilding || !map.current) return;

    // Fly to selected building
    map.current.flyTo({
      center: [selectedBuilding.lon, selectedBuilding.lat],
      zoom: 15,
      duration: 1000,
    });

    // Update marker styles
    markers.current.forEach((marker, index) => {
      const el = marker.getElement();
      if (buildings[index]?.id === selectedBuilding.id) {
        el.style.backgroundColor = '#ef4444';
        // Preserve existing transform and modify scale
        const currentTransform = el.style.transform;
        const scaleRegex = /scale\([^)]*\)/;
        if (scaleRegex.test(currentTransform)) {
          el.style.transform = currentTransform.replace(scaleRegex, 'scale(1.2)');
        } else {
          el.style.transform = currentTransform + ' scale(1.2)';
        }
      } else {
        el.style.backgroundColor = '#3b82f6';
        // Preserve existing transform and modify scale
        const currentTransform = el.style.transform;
        const scaleRegex = /scale\([^)]*\)/;
        if (scaleRegex.test(currentTransform)) {
          el.style.transform = currentTransform.replace(scaleRegex, 'scale(1)');
        } else {
          el.style.transform = currentTransform + ' scale(1)';
        }
      }
    });
  }, [selectedBuilding, buildings]);

  if (loading) {
    return <div className="p-4">Loading buildings...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="flex h-screen">
      <div className="w-1/5 h-full flex flex-col items-center bg-gray-100 p-4">
        <h1 className="text-2xl font-bold mb-4">Buildings</h1>
        {buildings.length === 0 ? (
          <p>No buildings found.</p>
        ) : (
          <div className="grid gap-1 w-full">
            {buildings.map((building) => (
              <div
                key={building.id}
                className={`rounded-xl px-4 py-2 hover:bg-gray-200 hover:cursor-pointer ${
                  selectedBuilding?.id === building.id ? 'bg-gray-200' : ''
                }`}
                onClick={() => setSelectedBuilding(building)} // and change marker
              >
                <h2 className="text-md text-gray-700 font-medium">{building.name}</h2>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-4/5 flex flex-col h-full">
        <div className="w-full" style={{ height: 400 }}>
          <div ref={setMapContainer} className="w-full h-full" />
        </div>

        {selectedBuilding && (
          <div className="w-full flex-1 p-4 gap-6 flex flex-col items-start bg-white overflow-y-auto">
            {selectedBuilding.imageUrl && (
              <div className="w-full h-48 relative">
                <img
                  src={selectedBuilding.imageUrl}
                  alt={selectedBuilding.name + ' image'}
                  className="w-full h-full rounded-xl object-cover"
                />
                <label className="absolute py-1 px-3 top-2 right-2 bg-black/30 rounded-lg text-sm text-white font-medium hover:cursor-pointer">
                  Edit
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedBuilding({ ...selectedBuilding, imageUrl: URL.createObjectURL(file) });
                        console.log('Selected file:', file);
                      }
                    }}
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingName" className="block mb-2 text-sm font-medium text-gray-900">
                    Name
                  </label>
                  <input
                    id="buildingName"
                    type="text"
                    value={selectedBuilding.name}
                    className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingAddress" className="block mb-2 text-sm font-medium text-gray-900">
                    Address
                  </label>
                  <input
                    id="buildingAddress"
                    type="text"
                    value={selectedBuilding.address || ''}
                    className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, address: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingLat" className="block mb-2 text-sm font-medium text-gray-900">
                    Latitude
                  </label>
                  <input
                    id="buildingLat"
                    type="number"
                    step="0.0001"
                    value={selectedBuilding.lat}
                    className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, lat: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="buildingLon" className="block mb-2 text-sm font-medium text-gray-900">
                    Longitude
                  </label>
                  <input
                    id="buildingLon"
                    type="number"
                    step="0.0001"
                    value={selectedBuilding.lon}
                    className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 ring-blue-500 outline-0"
                    onChange={(e) => setSelectedBuilding({ ...selectedBuilding, lon: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}