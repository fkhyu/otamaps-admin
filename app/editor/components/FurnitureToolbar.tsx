'use client';

import React from 'react';
import { furnitureLibrary } from '../lib/constants';

interface FurnitureToolbarProps {
  mode: string;
}

export const FurnitureToolbar: React.FC<FurnitureToolbarProps> = ({ mode }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-700 dark:border-1 dark:border-gray-600 shadow-lg p-4 flex items-center gap-4 overflow-x-auto w-fit rounded-2xl mx-auto mb-4  z-[9999999999]">
      {mode === 'simple_select' && (
        <div className="flex items-center gap-3">
          {furnitureLibrary.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(item));
              }}
              className="flex items-center gap-2 p-2 bg-gray-100 border border-gray-200 rounded-md cursor-move hover:bg-gray-200 transition dark:bg-gray-600 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};