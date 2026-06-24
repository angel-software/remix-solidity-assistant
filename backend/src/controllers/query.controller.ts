import { Request, Response, NextFunction } from 'express';
import { buildFileEnvironmentMap } from '../services/llm/codeMap';
import { getSimilarEmbeddingsChunksDB } from '../services/chromadb';
import { promptBuilder } from '../services/llm/promptBuilder';
import { askLLM } from '../services/llm/talkToLLM';
import { generateStandaloneQuery } from '../utils/queryRewriter';
import { injectRemixLinks } from '../utils/linkInjector';

import { COLLECTION_NAME } from '../entities/chromadb.entity';
import { ChatMessage, QueryRequestBody } from '../entities/ollama.entity';
import { GenericChunk } from '../entities/chunk.entity';
// NO OllamaGenerateResponse y ENV
const collectionName = COLLECTION_NAME;

export class QueryController {

  /**
   * Handles user requests by executing the complete contextual hybrid RAG flow with query rewriting.
   */
  public handleQuery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, activeFilePath, chatHistory = [] } = req.body as QueryRequestBody;

      if (!query || typeof query !== 'string' || query.trim() === '') {
        res.status(400).json({ 
          error: 'The field "query" is mandatory and must be a non-empty text string.' 
        });
        return;
      }

      if (!activeFilePath || typeof activeFilePath !== 'string' || activeFilePath.trim() === '') {
        res.status(400).json({ error: 'The field "activeFilePath" is mandatory.' });
        return;
      }

      // STEP 1: Process previus conversation and rewrite inputs into a standalone tracking string
      const standaloneQuery = await generateStandaloneQuery(query.trim(), chatHistory);
      console.log(`[RAG Pipeline] Vector search query optimized to: "${standaloneQuery}"`);

      // STEP 2: Generate query embedding and retrieve similar code fragments from the vectorial database.
      const similarChunks: GenericChunk[] = await getSimilarEmbeddingsChunksDB(collectionName, standaloneQuery);

      // STEP 3: Create map graph with related context (Graph Cross-File)
      const environmentMap = await buildFileEnvironmentMap(activeFilePath, collectionName);

      // STEP 4: Construct the structured chat messages prompt layout for the LLM
      const chatMessages: ChatMessage[] = promptBuilder(query.trim(), similarChunks, environmentMap, chatHistory);

      // STEP 5: Dispatch the compiled prompt payload to the Ollama container and await the response string
      const responseLLM: string = await askLLM(chatMessages);

      //STEP 6: Inject links from relevant elements to use on frontend. 
      const finalAnswerWithLinks = injectRemixLinks(responseLLM, similarChunks, environmentMap);

      // STEP 7: Dispatch the final context-aware solution back to the client application
      res.status(200).json({
        answer: finalAnswerWithLinks
      });       

    } catch (error) {
      console.error('[RAG Controller Error] Execution collapsed mid-pipeline inside handleQuery:', error);
      res.status(500).json({
        error: 'Internal server error while processing the Solidity codebase request.'
      });
      next(error);
    }
  };
}