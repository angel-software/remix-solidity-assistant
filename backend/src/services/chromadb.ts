import { chromaClient } from '../config/chromadb';
import { generateEmbeddingFromText } from './embedding/embeddingsGeneration';
import type { GenericChunk } from '../entities/chunk.entity';

/**
 * Processes Solidity codebase chunks, generates embeddings, and indexes them in ChromaDB.
 * Splits execution into sequential batches to respect network boundaries and memory limits.
 */
export async function saveChunksToVectorDB(collectionName: string, chunks: GenericChunk[]): Promise<void> {
  try {
    console.log(`[ChromaDB Service] Connecting to target collection profile: ${collectionName}`);
 
    const collection = await chromaClient.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: {
        generate: async () => []
      }
    });

    console.log(`[ChromaDB Service] Initiating pipeline for ${chunks.length} logical chunks...`);

    const BATCH_SIZE = 30;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      console.log(`[ChromaDB Progress] Processing cluster payload: indexes ${i} to ${Math.min(i + BATCH_SIZE, chunks.length)}`);

      // 1. Compute high-frequency vector embeddings for the active batch concurrently
      const batchEmbeddings = await Promise.all(
        batch.map(chunk => generateEmbeddingFromText(chunk.pageContent))
      );

      // 2. Linear map generation to maintain tight columnar matrix layouts
      const ids = batch.map(chunk => chunk.id);
      const documents = batch.map(chunk => chunk.pageContent);
      const metadatas = batch.map(chunk => chunk.metadata as Record<string, any>);

      // 3. Atomically append arrays into ChromaDB cache pools
      await collection.add({
        ids: ids,
        documents: documents,
        embeddings: batchEmbeddings,
        metadatas: metadatas
      });
    }

    console.log('[ChromaDB Service] Bulk ingestion task terminated successfully. All workspace vectors indexed.');
  } catch (error) {
    console.error('[ChromaDB Service Error] Bulk injection sequence failed:', error);
    throw error;
  }
}

/**
 * Queries ChromaDB and rebuilds fully-typed GenericChunk schemas from raw database columns.
 */
export async function getSimilarEmbeddingsChunksDB(
  collectionName: string,
  userText: string,
  limit: number = 3
): Promise<GenericChunk[]> {
  try {
    console.log(`[ChromaDB Inference] Vectorizing raw search interaction string: "${userText}"`);
    const userEmbedding = await generateEmbeddingFromText(userText);

    console.log(`[ChromaDB Inference] Executing Top-${limit} vector search query match inside collection: ${collectionName}`);
    const collection = await chromaClient.getCollection({ name: collectionName });

    const results = await collection.query({
      queryEmbeddings: [userEmbedding],
      nResults: limit,
    });

    if (!results.documents || results.documents.length === 0 || results.documents[0].length === 0) {
      console.log('[ChromaDB Query] Vector matching yield completed with 0 similarities discovered.');
      return []; 
    }

    const ids = results.ids[0];
    const documents = results.documents[0];
    const metadatas = results.metadatas[0];

    const formattedChunks: GenericChunk[] = [];

    for (let i = 0; i < documents.length; i++) {
      const rawMetadata = metadatas[i] as any;
      if (!rawMetadata) continue;

      const chunk: GenericChunk = {
        id: ids[i],
        pageContent: documents[i] ?? "",
        metadata: {
          filePath: rawMetadata.filePath,
          pragma: rawMetadata.pragma,
          contractName: rawMetadata.contractName ?? rawMetadata.contextLocation ?? "Unknown",
          contextType: rawMetadata.contextType,
          nodeType: rawMetadata.nodeType,
          name: rawMetadata.name,
          imports: rawMetadata.imports ?? "",
          inheritance: rawMetadata.inheritance ?? "",
          startLine: rawMetadata.startLine ? Number(rawMetadata.startLine) : undefined,
          endLine: rawMetadata.endLine ? Number(rawMetadata.endLine) : undefined,
          ...(rawMetadata.nodeType === 'function' && {
            globalVariables: rawMetadata.globalVariables ?? "",
            modifiers: rawMetadata.modifiers ?? "",
            callsFunctions: rawMetadata.callsFunctions ?? "",
            chunkIndex: Number(rawMetadata.chunkIndex ?? 1),
            totalChunks: Number(rawMetadata.totalChunks ?? 1),
          })
        } as any
      };

      formattedChunks.push(chunk);
    }

    return formattedChunks;
  } catch (error) {
    console.error('[ChromaDB Service Error] Structural collection matrix recovery failure:', error);
    throw error;
  }
}

/**
 * Queries ChromaDB to locate semantic code blocks and presents them as a unified text layout.
 * Reuses getSimilarEmbeddingsChunksDB to enforce strict DRY engineering guidelines.
 */
export async function getSimilarEmbeddingsDB(
  collectionName: string,
  userText: string,
  limit: number = 3
): Promise<string> {
  const structuredChunks = await getSimilarEmbeddingsChunksDB(collectionName, userText, limit);
  
  if (structuredChunks.length === 0) {
    return "";
  }

  return structuredChunks.map(chunk => chunk.pageContent).join("\n\n---\n\n");
}

/**
 * Searches ChromaDB to locate which project files import the specified active file.
 * Evaluates relationship links across files using the '$contains' metadata operator on the parsed AST string.
 */
export async function getDependentFilesFromDB(
  collectionName: string,
  activeFilePath: string
): Promise<string[]> {
  try {
    const collection = await chromaClient.getCollection({ name: collectionName });

    // Query using a Metadata Where filter via substring analysis matches
    const results = await collection.get({
      where: {
        "imports": { "$contains": activeFilePath }
      },
      include: ["metadatas" as any]
    });

    if (!results.metadatas || results.metadatas.length === 0) {
      return [];
    }

    // Isolate unique file paths using a JS Set to prevent duplicate entries across chunks
    const uniqueFiles = new Set<string>();
    results.metadatas.forEach((meta: any) => {
      if (meta && meta.filePath) {
        uniqueFiles.add(meta.filePath);
      }
    });

    return Array.from(uniqueFiles);
  } catch (error) {
    console.error("[Cross-File Linker Error] Failed querying dependent files from ChromaDB index stream:", error);
    return []; 
  }
}
