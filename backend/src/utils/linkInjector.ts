import { GenericChunk } from '../entities/chunk.entity';
import { FileEnvironmentMap } from '../entities/ollama.entity';

interface LinkMetadata {
  path: string;
  line: number;
}

/**
 * Cross-references text tokens from the LLM stream with codebase structural metadata 
 * to deterministically inject interactive Remix workspace redirection markers.
 */
export function injectRemixLinks(
  llmResponse: string, 
  retrievedChunks: GenericChunk[],
  environment?: FileEnvironmentMap
): string {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return llmResponse;
  }

  let processedText = llmResponse;
  const tokenMap = new Map<string, { path: string; line: number }>();

  // Extract reference frames from current vector database semantic outputs
  retrievedChunks.forEach(chunk => {
    const rawPath = chunk.metadata.filePath || "unknown";
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const startLine = chunk.metadata.startLine || 1;

    const primaryName = chunk.metadata.name;
    if (primaryName && primaryName.length > 2) {
      tokenMap.set(primaryName, { path, line: startLine });
    }

    const codeContent = chunk.pageContent;
    const solidityKeywordsRegex = /(?:function|modifier|bytes32|contract|struct|event)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = solidityKeywordsRegex.exec(codeContent)) !== null) {
      const discoveredToken = match[1];
      const reservedKeywords = ['public', 'constant', 'internal', 'external', 'view', 'pure'];
      
      if (discoveredToken && discoveredToken.length > 2 && !reservedKeywords.includes(discoveredToken)) {
        tokenMap.set(discoveredToken, { path, line: startLine });
      }
    }
  });

  // Supplement missing linkage paths using current contextual active workspace code summaries
  if (environment && environment.codeMapSummary) {
    const activePath = environment.activeFile.startsWith('/') ? environment.activeFile : `/${environment.activeFile}`;
    const summaryRegex = /(?:function|modifier|bytes32)\s+([a-zA-Z0-9_]+)/g;
    let summaryMatch;
    
    while ((summaryMatch = summaryRegex.exec(environment.codeMapSummary)) !== null) {
      const tokenInActiveFile = summaryMatch[1];
      
      if (tokenInActiveFile && tokenInActiveFile.length > 2 && !['public', 'constant'].includes(tokenInActiveFile)) {
        if (!tokenMap.has(tokenInActiveFile)) {
          tokenMap.set(tokenInActiveFile, { path: activePath, line: 1 }); 
        }
      }
    }
  }

  // Sort array sequences by token length descending to defend against substring fragmentation collisions
  const sortedTokens = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);

  sortedTokens.forEach(token => {
    const meta = tokenMap.get(token);
    if (!meta) return;

    const escapedToken = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Strict match expression blocking re-linking patterns or inner markdown structures
    const regex = new RegExp(`(?<!\\[)(?<![a-zA-Z0-9_])${escapedToken}(?![a-zA-Z0-9_])(?!\\([^)]*\\))(?!\\s*\\])`, 'g');

    processedText = processedText.replace(regex, (match) => {
      return `[${match}](remix://${meta.path}?line=${meta.line})`;
    });
  });

  return processedText;
}
