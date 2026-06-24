import './App.css';
import { useState, useEffect } from 'react';
import { api } from './utils/api.ts';
import { getWorkspaceFiles, onCurrentFileChanged, getCurrentFilePath, getFileContent } from './utils/remix/apiRemix.ts';
import type { FileStruct } from './types/FileStruct.ts';

import ChatModel from './components/ChatModel.tsx';

function App() {
  const [filesResponse, setFilesResponse] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [actualFile, setActualFile] = useState<FileStruct | null>(null); 
  
  // Internal reusable function to pack path and content
  async function updateActualFile(filePath: string) {
    try {
      if (!filePath) return;
      const fileContent = await getFileContent(filePath);
      setActualFile({
        path: filePath,
        content: fileContent
      });
    } catch (error) {
      console.error('Error fetching file content from active path:', error);
      setActualFile(null);
    }
  }

  // Corrected Debounce function for Browser environment (Vite / TS)
  function debounce(func: Function, wait: number) {
    let timeout: number;
    return (...args: any[]) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  }
  
  // Lifecycle hook in charge of native events from the Remix editor
  useEffect(() => {
    // A. Initial load when opening the plugin for the first time
    async function loadInitialFile() {
      try {
        const initialPath = await getCurrentFilePath();
        await updateActualFile(initialPath);
      } catch (error) {
        console.error('Error fetching initial active file:', error);
      }
    }
    loadInitialFile();
    
    // B. INTERVAL REPLACEMENT: Reactive listening for Remix events
    const debouncedUpdate = debounce((newPath: string) => { 
      updateActualFile(newPath); 
    }, 500);

    // Subscribe to editor tab switching events and capture the cleanup mechanism
    const unsubscribe = onCurrentFileChanged(debouncedUpdate);

    // Clean up the subscription when the component unmounts to prevent memory leaks
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Scan and ingest workspace files into the local vector engine
  async function sendProjectFiles() {
    try {
      setStatusMessage('Saving your codebase...');
      setFilesResponse('');
      
      const files = await getWorkspaceFiles();
      const response = await api.post('/api/files', { files } );
            
      setStatusMessage('Codebase successfully ingested.');
      setFilesResponse(`Project files: ${response.data.totalFiles} | Chunks generated: ${response.data.totalChunks}`);
    } catch (error) {
      console.error('Error within sendProjectFiles network stream', error);
      setStatusMessage('Error processing codebase');
      setFilesResponse('Inbound processing failed');
    }
  }

  // Send all the workspace files to backend for embedding and database storage
  useEffect(() => {
    // sendProjectFiles();
  }, []);

  const currentPath = actualFile?.path ?? '';

  return (
    <div className="app-layout">
      <section id='CheckAPI'>
        <div id='CheckSendProjectFiles'>
          <button onClick={sendProjectFiles}>Scan project codebase</button>
          {statusMessage && (
            <div className="status-container">
              {statusMessage === "Saving your codebase..." && <div className="loading-spinner" />}
              <span className="status-txt">{statusMessage}</span>
            </div>
          )}
          {filesResponse && <p className="response-txt">{filesResponse}</p>}
        </div>
      </section>
      
      <section id='chatModel'>
        <ChatModel actualFilePath={currentPath} />
      </section>
    </div>
  );
}

export default App;
