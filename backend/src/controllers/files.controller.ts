import { Request, Response, NextFunction } from 'express';
import { generateSolidityChunks } from '../services/parsinAndChunks/chunksGeneration';
import { saveChunksToVectorDB } from '../services/chromadb';
import { GenericChunk } from '../entities/chunk.entity';
import { FileStruct } from '../entities/file.entity';
import { COLLECTION_NAME } from '../entities/chromadb.entity';


export class FilesController {

  /**
   * Captures multi-file workspace strings, parses blocks logic-by-logic via AST, 
   * and vectorizes valid code fragments inside the stable ChromaDB schema.
   */
  public handleFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { files } = req.body as { files?: FileStruct[] };

      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ 
          error: 'The request body must include a valid and non-empty "files" array.' 
        });
        return;
      }

      let totalChunks: GenericChunk[] = [];

      console.log('=== [DEBUG] NEW INBOUND CODEBASE SCAN REQUEST ===');
      console.log(`[Files Ingestion] Total structural files received in payload: ${files.length}`);

      for (const file of files) {
        console.log(`[Processing Stream] Parsing target relative path: "${file.path}"`);
        
        const previewContent = file.content 
          ? file.content.substring(0, 100).replace(/\n/g, ' ') 
          : 'EMPTY_ASSET_TRIGGER ❌';
        
        console.log(`[Buffer Head Preview]: "${previewContent}..."`);

        try {
          const chunks: GenericChunk[] = generateSolidityChunks(file);
          console.log(`[Parser Success] Logical chunks derived from this file node: ${chunks.length}`);
          totalChunks.push(...chunks);
        } catch (parserError) {
            console.warn(`[Parser Skipped] Grammar exception thrown while processing asset ${file.path}:`, 
              parserError instanceof Error ? parserError.message : parserError
            );
        }
      }

      console.log(`=== [DEBUG] TOTAL INGESTION SUMMARY: GENERATED ${totalChunks.length} CHUNKS ===`);

      if (totalChunks.length === 0) {
        res.status(400).json({ 
          error: 'No valid Solidity code chunks could be generated. Check backend terminal logs to see why everything was skipped.' 
        });
        return;
      }

      // Generte embeddings and stored the chuncks into the vectorial database.
      await saveChunksToVectorDB(COLLECTION_NAME, totalChunks);

      res.status(200).json({
        totalFiles: files.length,
        totalChunks: totalChunks.length
      });

    } catch (error) {     
      res.status(500).json({
        error: 'Internal processing failure inside handleFiles stream while synchronizing codebase tokens.'
      });
      next(error);
    }
  };
}
