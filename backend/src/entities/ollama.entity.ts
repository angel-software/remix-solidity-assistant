
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QueryRequestBody {
  query: string;
  activeFilePath: string;
  chatHistory?: ChatMessage[];
}


export interface FileEnvironmentMap {
  activeFile: string;
  dependsOn: string[];
  usedBy: string[];
  codeMapSummary: string;
}