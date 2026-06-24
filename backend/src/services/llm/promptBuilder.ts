import { GenericChunk } from "../../entities/chunk.entity";
import { FileEnvironmentMap } from "../../entities/ollama.entity";
import { ChatMessage } from "../../entities/ollama.entity";

/**
 * Builds an structured, context-augmented prompt block layout by packaging code fragments, 
 * architectural graph matrices, and chat history layers into semantic XML tokens.
 */
export function promptBuilder(
  userQuery: string, 
  retrievedChunks: GenericChunk[],
  environment?: FileEnvironmentMap,
  chatHistory: ChatMessage[] = []
): ChatMessage[] {
  
  let codeChunksText = "";
  retrievedChunks.forEach((chunk) => {
    const rawPath = chunk.metadata.filePath || "unknown";
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const start = chunk.metadata.startLine || 1;
    const end = chunk.metadata.endLine || 1;

    codeChunksText += `<CODE_CHUNK file="${path}" startLine="${start}" endLine="${end}" name="${chunk.metadata.name}">\n`;
    codeChunksText += `${chunk.pageContent}\n`;
    codeChunksText += `</CODE_CHUNK>\n\n`;
  });

  let architectureBlock = "";
  if (environment) {
    const activeFile = environment.activeFile.startsWith('/') ? environment.activeFile : `/${environment.activeFile}`;
    architectureBlock = `
<PROJECT_ARCHITECTURE>
- ACTIVE FILE: ${activeFile}
- DEPENDENCIES: ${environment.dependsOn.length > 0 ? environment.dependsOn.map(f => f.startsWith('/') ? f : `/${f}`).join(', ') : 'None'}
- DEPENDENTS: ${environment.usedBy.length > 0 ? environment.usedBy.map(f => f.startsWith('/') ? f : `/${f}`).join(', ') : 'None'}

### CODEMAP OF SURROUNDING CONTRACTS
${environment.codeMapSummary}
</PROJECT_ARCHITECTURE>`;
  }

  // SYSTEM PROMPT OPTIMIZADO PARA MODELOS PEQUEÑOS (1.5B) - SE MANTIENE INTACTO
  const systemContent = `You are a Senior Solidity Assistant. Answer the user's question with absolute technical accuracy using ONLY the provided code snippets and architecture layout.

  [CRITICAL RULES]
  - State function names, modifiers, variables, or contracts exactly as they appear in the code (case-sensitive).
  - Do not include greetings, introductions, or conversational filler. Answer directly.
  - Respond strictly in English.`;

  const userContent = `${architectureBlock}

<CODE_SNIPPETS>
${codeChunksText || "No relevant code snippets found."}
</CODE_SNIPPETS>

[USER QUESTION]
${userQuery}`;

  return [
    { role: 'system', content: systemContent },
    ...chatHistory,
    { role: 'user', content: userContent }
  ];
}
