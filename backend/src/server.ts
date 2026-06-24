import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.config';
import { connectChromadb } from './config/chromadb';
import { connectOllama } from './config/ollama';
import routeQuery from './routes/query.route';
import routeFiles from './routes/files.route';

const app = express();

// Global Cross-Origin Resource Sharing (CORS) interface routing controls
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Ingest parsing layer configured to process massive Solidity workspace strings safely
app.use(express.json({ limit: '50mb' }));

app.use('/api/query', routeQuery);
app.use('/api/files', routeFiles);

const startServer = async () => {
  try {
    await connectChromadb();
    await connectOllama();

    app.listen(ENV.PORT, () => {
      console.log(`[Runtime Server] Solidity Assistant Backend deployed successfully on port: ${ENV.PORT}`);
    });
  } catch (criticalInitializationError) {
    console.error('[Fatal Error] Infrastructure boot sequence collapsed:', criticalInitializationError);
    process.exit(1);
  }
};

startServer();