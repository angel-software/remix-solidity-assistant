import { ChromaClient } from 'chromadb';
import { ENV } from './env.config';

export const chromaClient = new ChromaClient({
  path: ENV.CHROMADB_URL
});

/**
 * Validates connection stability with ChromaDB via API health version ping checks.
 * Blocks server initialization loop until the database stack is ready.
 */
export async function connectChromadb(): Promise<void> {
  let connected = false;
  
  while (!connected) {
    try {
      await chromaClient.version();
      console.log('[ChromaDB Engine] Handshake successful. Connection established.');
      connected = true;
    } catch (error) {
      console.error('[ChromaDB Error] Database engine not ready yet. Retrying in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
