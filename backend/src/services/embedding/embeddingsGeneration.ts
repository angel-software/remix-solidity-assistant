import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { ENV } from '../../config/env.config';

// Restrict transformer network operations strictly to filesystem lookups
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/app/models_storage/models/';
env.cacheDir = '/app/models_storage/.cache/';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Initializes or retrieves the singleton asynchronous machine-learning pipeline interface.
 */
function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    console.log(`[Embedding Engine] Instantiating layer using localized model definition: ${ENV.EMBEDDING_MODEL}`);
    extractorPromise = pipeline('feature-extraction', ENV.EMBEDDING_MODEL) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/**
 * Transforms plain code or prompt text streams into dense mathematical vector formats.
 */
export async function generateEmbeddingFromText(plainText: string): Promise<number[]> {
  const extractor = await getExtractor();
  const vector = await extractor(plainText, { pooling: 'mean', normalize: true });
  
  if (!vector || !vector.data) {
    throw new Error('[Embedding Error] Model pipeline returned an invalid or unmappable vector array block.');
  }
  
  return Array.from(vector.data) as number[];
}
