import { BaseMetadata, FunctionMetadata } from "./chunk.entity";
export const COLLECTION_NAME  = "solidity-codebase-collection";

interface ChromadbElement{
  id: string,
  document: string, //pageContent metadata and chunkContent.
  embedding: number[],
  metadata: BaseMetadata | FunctionMetadata
}
