import React, { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface NewBuildingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (buildingData: { name: string; address: string; lat: number; lon: number }) => void;
}

interface SearchResult {
  id: string;
  place_name: string;
  center: [number, number];
}

const NewBuildingModal: React.FC<NewBuildingModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    lat: 0,
    lon: 0
  });

  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Debounced search function
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await searchCities(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const searchCities = async (query: string) => {
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
        `access_token=${mapboxgl.accessToken}&` +
        `types=region,place,district,locality,postcode,neighborhood&` +
        `limit=5`
      );
      
      const data = await response.json();
      
      if (data.features) {
        const results: SearchResult[] = data.features.map((feature: any) => ({
          id: feature.id,
          place_name: feature.place_name,
          center: feature.center
        }));
        setSearchResults(results);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Error searching cities:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCitySelect = (result: SearchResult) => {
    if (map.current) {
      map.current.flyTo({
        center: result.center,
        zoom: 12,
        duration: 2000
      });
    }
    setSearchQuery(result.place_name.split(',')[0]); // Show just the city name
    setShowResults(false);
  };

  useEffect(() => {
    if (isOpen && mapContainer.current && !map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-74.006, 40.7128], // Default to NYC
        zoom: 12
      });

      // Add click handler to place marker
      map.current.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        
        // Remove existing marker
        if (marker.current) {
          marker.current.remove();
        }

        // Add new marker
        marker.current = new mapboxgl.Marker()
          .setLngLat([lng, lat])
          .addTo(map.current!);

        // Update form data
        setFormData(prev => ({
          ...prev,
          lat: lat,
          lon: lng
        }));

        setHasSelectedLocation(true);
      });
    }

    // Cleanup when modal closes
    if (!isOpen && map.current) {
      map.current.remove();
      map.current = null;
      marker.current = null;
      setHasSelectedLocation(false);
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSelectedLocation) {
      alert('Please select a location on the map');
      return;
    }
    onSubmit(formData);
    setFormData({ name: '', address: '', lat: 0, lon: 0 });
    setHasSelectedLocation(false);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-4xl max-h-full p-4">
        <div className="relative bg-white rounded-lg shadow dark:bg-gray-700">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 rounded-t dark:border-gray-600">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Add New Building
            </h3>
            <button 
              type="button" 
              onClick={onClose}
              className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white"
            >
              <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
              </svg>
              <span className="sr-only">Close modal</span>
            </button>
          </div>
          <div className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Form fields */}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="building-name" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Building Name
                    </label>
                    <input 
                      type="text" 
                      id="building-name" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white" 
                      placeholder="Enter building name" 
                      required 
                    />
                  </div>
                  <div>
                    <label htmlFor="building-address" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Address
                    </label>
                    <input 
                      type="text" 
                      id="building-address" 
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white" 
                      placeholder="Enter building address" 
                      required 
                    />
                  </div>
                  
                  {/* Display coordinates */}
                  {hasSelectedLocation && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>Selected Location:</strong><br />
                        Latitude: {formData.lat.toFixed(6)}<br />
                        Longitude: {formData.lon.toFixed(6)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Map */}
                <div className="space-y-2">
                  {/* City Search */}
                  <div className="relative">
                    <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Search City
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search for a city..."
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pr-10 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white"
                      />
                      {isSearching && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        </div>
                      )}
                    </div>
                    
                    {/* Search Results Dropdown */}
                    {showResults && searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg dark:bg-gray-700 dark:border-gray-600 max-h-48 overflow-y-auto">
                        {searchResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => handleCitySelect(result)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg"
                          >
                            {result.place_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="block text-sm font-medium text-gray-900 dark:text-white">
                    Select Location on Map
                  </label>
                  <div 
                    ref={mapContainer} 
                    className="w-full h-64 rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Search for a city/neighborhood above, then click on the map to select the building location
                  </p>
                </div>
              </div>
              
              <div className="flex space-x-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-gray-200 text-sm font-medium px-5 py-2.5 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasSelectedLocation}
                >
                  Add Building
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div> 
  );
};

export default NewBuildingModal;