import { ollamaClient } from '../config/ollama';
import { ENV } from '../config/env.config';
import { ChatMessage } from '../entities/ollama.entity';

/**
 * Transforms contextual follow-up conversational questions into isolated standalone 
 * search queries using the local LLM instance running at temperature 0.0.
 */
export async function generateStandaloneQuery(
  currentQuery: string, 
  chatHistory: ChatMessage[] = []
): Promise<string> {
  // If no deep conversational tree is present yet, the input query is already independent
  if (!chatHistory || chatHistory.length <= 1) {
    return currentQuery;
  }

  const systemPrompt = `You are a strict technical Query Rewriter for a Solidity Smart Contract assistant.
Your ONLY job is to rewrite the user's latest follow-up question into a single, standalone search query written in English.

[STRICT INSTRUCTIONS]
1. Do NOT answer the question. Do NOT give explanations.
2. Extract the context ONLY from the provided chat history. Never invent modifiers, functions, or variables that do not appear in the text.
3. Resolve pronouns and deictics: If the user says "that modifier", "it", "this function", or "those permissions", you MUST look at the Assistant's last response, find the exact technical name (e.g., "PAUSER_ROLE", "pause", "MINTER_ROLE"), and replace the pronoun with that exact name.
4. Output ONLY the raw rewritten text string. No markdown, no quotes, no conversational filler.

[EXAMPLES OF EXPECTED BEHAVIOR]
Context:
User: What does pause() do?
Assistant: It restricts access using the onlyRole(PAUSER_ROLE) modifier.
Follow-up Query: "Why that modifier?"
Output: Why does the pause function require the PAUSER_ROLE modifier

Context:
User: Explain the mint function.
Assistant: It allows addresses with MINTER_ROLE to generate new tokens.
Follow-up Query: "can anyone call it?"
Output: Can any address call the mint function without MINTER_ROLE`;

  // Format historical interactions into an explicit context string
  const conversationContext = chatHistory
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  const userPrompt = `[Chat History Context]\n${conversationContext}\n\n[Follow-up Query to Rewrite]\n"${currentQuery}"`;

  try {
    // Leverage the native initialized SDK client instead of launching manual Axios network overheads
    const response = await ollamaClient.generate({
      model: ENV.OLLAMA_MODEL,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false,
      options: {
        temperature: 0.0,
        num_predict: 40,
        top_k: 5,
        top_p: 0.2
      }
    });

    const rewritten = response.response?.trim();
    
    // Safety fallback layer in case local token generation yields empty text strings
    return rewritten || currentQuery;
  } catch (error) {
    console.error('[Query Rewriter Error] Internal LLM inference stream failed. Falling back to raw query:', error);
    return currentQuery; 
  }
}
