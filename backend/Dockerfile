FROM node:20-slim

WORKDIR /app

ARG EMBEDDING_MODEL
ARG OLLAMA_MODEL

ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
ENV OLLAMA_MODEL=${OLLAMA_MODEL}
ENV NODE_ENV=development

COPY package*.json tsconfig.json ./
RUN npm install

COPY src/config/ ./src/config/
COPY src/utils/downloadModel.ts ./src/utils/downloadModel.ts

RUN mkdir -p /app/models_storage

RUN npx tsx src/utils/downloadModel.ts

COPY src/ ./src

EXPOSE 8080

CMD ["npm", "run", "dev"]
