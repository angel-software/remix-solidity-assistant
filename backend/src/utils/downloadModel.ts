import { pipeline, env } from '@huggingface/transformers';
import { ENV } from '../config/env.config';

const EMBEDDING_MODEL = ENV.EMBEDDING_MODEL;

// Grant remote web lookup privileges explicitly for the initialization seed phase
env.allowRemoteModels = true;
env.localModelPath = '/app/models_storage/models/';
env.cacheDir = '/app/models_storage/.cache/';

/**
 * Build-time asset preloader task. Downloads target vector weights prior to staging the runtime server.
 */
async function download() {
  console.log(`[Docker Build Pipeline] Initiating secure weight download for target: ${EMBEDDING_MODEL}`);
  
  // Triggers remote resolution and writes files straight into the shared volume mount point
  await pipeline('feature-extraction', EMBEDDING_MODEL);
  
  console.log(`[Docker Build Pipeline] '${EMBEDDING_MODEL}' asset layers successfully baked into image disk cache.`);
  process.exit(0);
}

download().catch((err) => {
  console.error('[Docker Build Fatal] Model layer synchronization failed mid-build:', err);
  process.exit(1);
});
