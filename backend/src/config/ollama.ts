import { Ollama } from 'ollama';
import { ENV } from './env.config';

export const ollamaClient = new Ollama({
  host: ENV.OLLAMA_URL
});

/**
 * Validates connection with local Ollama engine, ensures model exists on container storage.
 */
export async function connectOllama(): Promise<void> {
  const targetModel  = ENV.OLLAMA_MODEL;
  let connected = false;

  console.log(`Verifying connection with Ollama at: ${ENV.OLLAMA_URL}`);

  while (!connected) {
    try {
      const response = await ollamaClient.list();
      const isModelAvailable  = response.models?.some(m => m.name.startsWith(targetModel));

      if (isModelAvailable ) {
        console.log(`[Ollama Service] Model '${targetModel}' found on disk. Forcing RAM/VRAM cache pre-load.`);
        
        // 1. Send native request to load the model into memory RAM/VRAM immediately without generating text
        await ollamaClient.generate({
          model: targetModel,
          prompt: '',
          options: {},
          // @ts-ignore (Ollama JS supports this parameter to pre-load the model)
          load_only: true 
        });

        console.log(`[Ollama Service] Model '${targetModel}' successfully cached and primed for inference.`);
        connected = true;
      } else {
        console.warn(`[Ollama Warning] Connected to service, but '${targetModel}' is still missing from volume allocation. Retrying in 5s.`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('[Ollama Error] Local AI engine instance unreachable. Retrying infrastructure link in 5s...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
