export interface GenericChunk {
  id: string;
  pageContent: string;
  metadata: BaseMetadata | FunctionMetadata | StateVariableMetadata;
}

export interface BaseMetadata {
  filePath: string;
  pragma: string;
  contractName: string;
  contextType: 'contract' | 'library' | 'interface' | 'Global';
  nodeType: 'function' | 'modifier' | 'event' | 'custom_error' | 'struct' | 'enum' | 'state_variable';
  name: string;
  imports: string;
  inheritance: string;
  startLine?: number;
  endLine?: number;
}

export interface FunctionMetadata extends BaseMetadata {
  nodeType: 'function';
  globalVariables: string;
  modifiers: string;
  callsFunctions: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface StateVariableMetadata extends BaseMetadata {
  nodeType: 'state_variable';
  visibility: 'public' | 'private' | 'internal' | 'external';
  typeName: string;
}
