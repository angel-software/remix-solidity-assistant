import client from './connectRemix.ts';
import { type FileStruct } from '../../types/FileStruct.ts';

const clientApi = client;

/**
 * Fetches the workspace path of the file currently focused in the Remix editor.
 */
export async function getCurrentFilePath(): Promise<string> {
  const actualFilePath = await clientApi.fileManager.getCurrentFile();
  return actualFilePath;
}

/**
 * Retrieves the raw string content of a specific file from the Remix file system.
 */
export async function getFileContent(filePath: string): Promise<string> {
  return await clientApi.fileManager.getFile(filePath);
}

/**
 * Subscribes to active file change events in the Remix editor.
 * @returns A cleanup function to unsubscribe and prevent memory leaks.
 */
export function onCurrentFileChanged(callback: (filePath: string) => void): () => void {
  const eventHandler = (filePath: string) => callback(filePath);
  clientApi.on('fileManager', 'currentFileChanged', eventHandler);
  // Return explicit cleanup controller for the component lifecycle
  return () => {
    clientApi.off('fileManager', 'currentFileChanged', eventHandler);
  };
}

/**
 * Opens a specific file in the editor and highlights a targeted line structure.
 */
export async function openFileAtLine(filePath: string, line: number = 1): Promise<void> {
  try {
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    console.log(`[Remix API Request] Focusing workspace path: ${normalizedPath}`);
    
    // Trigger layout shift to target contract file
    await clientApi.call('fileManager', 'open', normalizedPath);
    
    try {
      const position = {
        start: { line: line - 1, column: 0 },
        end: { line: line - 1, column: 100 }
      };
      
      // Use native Remix editor token highlighting class
      await clientApi.call('editor', 'highlight', position, normalizedPath, 'highlighttext');
    } catch (editorError) {
      console.warn('[Remix API Warning] Visual line highlighting fallback triggered:', editorError);
    }
  } catch (error) {
    console.error(`[Remix API Error] Navigation streaming failed for ${filePath}:`, error);
    throw error;
  }
}

/**
 * Recursively walks through workspace directories starting from a specific point 
 * to gather all valid production Solidity (.sol) file paths.
 * Filters out dependencies, testing suites, and compilation artifacts automatically.
 * @param directoryPath - The target directory path layout to initiate the recursive traversal scan.
 * @returns A promise resolving to a clean array of discovered Solidity file paths.
 */
async function getSolidityFilesInDir(directoryPath: string): Promise<string[]> {
  try {
    const files = await clientApi.call('fileManager', 'readdir', directoryPath);
    if (!files || typeof files !== 'object') return [];

    const result: string[] = [];

    for (const [keyPath, info] of Object.entries(files) as [string, any][]) {
      // 1. Extract file name without prefixes
      const pathParts = keyPath.split('/');
      const baseName = pathParts[pathParts.length - 1] || keyPath;

      // 2. TEMPORALY excluded directories (not indexed on vectorial database)
      if (info.isDirectory) {
        if ([
          'node_modules', '.deps', 'artifacts', '.build', '.git', 'forge-std', 'lib', 'test', 'tests'
        ].includes(baseName)) {
          continue; 
        }

        // Assure clean format for the next recursive call.
        const nextSubPath = keyPath.startsWith('/') ? keyPath : `/${keyPath}`;
        const childFiles = await getSolidityFilesInDir(nextSubPath);
        result.push(...childFiles);
      } else {
        if (keyPath.endsWith('.sol')) {
          const formattedFilePath = keyPath.startsWith('/') ? keyPath : `/${keyPath}`;
          result.push(formattedFilePath);
        } 
      }
    }

    return result;
  } catch (error) {
    console.error(`[Remix API Error] Failed reading structure at ${directoryPath}:`, error);
    return [];
  }
}

/**
 * Aggregates all production-ready Solidity source files within the workspace.
 * Resolves path indexes, fetches text structures, and discards documentation or distribution licenses.
 * @returns A promise resolving to an array of FileStruct objects containing full workspace code paths and text data.
 */
export async function getWorkspaceFiles(): Promise<FileStruct[]> {
  const pathNames = await getSolidityFilesInDir('/');
  const files: FileStruct[] = [];
  const uniquePaths = Array.from(new Set(pathNames));
  
  for (const path of uniquePaths) {
    try {
      const content = await getFileContent(path);
      if (!content) continue;

      const trimmedContent = content.trim();
      // TEMPORAL exclude potentially problematic files (licence .sol files)
      if (
        trimmedContent.startsWith('GNU GENERAL PUBLIC LICENSE') || 
        trimmedContent.startsWith('Copyright') ||
        trimmedContent.startsWith('// SPDX-License-Identifier: CC-BY')
      ) {
        console.info(`[Pipeline Skip] Ignoring legal documentation header at: ${path}`);
        continue;
      }

      files.push({ path, content });
    } catch (err) {
      console.warn(`[Remix API Warning] Unable to parse file source stream at ${path}. Skipping...`);
    }
  }
  return files;
}
