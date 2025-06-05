'use client';

import Editor from './components/Editor';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function EditorPage() {  
  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-700">
        <Editor />
      </div>
    </ErrorBoundary>
  );
}