// Enforce strict runtime variable mapping from the orchestration layer
const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[Fatal Env Error] Missing required system variable: ${key}`);
  }
  return value;
};

// System environment variables came from Docker-compose.
export const ENV = {
  PORT: parseInt(process.env.BACKEND_PORT!, 10),
  FRONTEND_URL: process.env.FRONTEND_URL!,
  CHROMADB_URL: process.env.CHROMADB_URL!,
  OLLAMA_URL: process.env.OLLAMA_URL!,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL!,
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL!,
};
