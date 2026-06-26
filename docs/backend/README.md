# Backend Subsystem 

This subsystem serves as the core semantic processing unit, syntax parser, and intelligent inference pipeline for the assistant. It operates fully autonomously and entirely offline within isolated Docker containers.

## Architectural Overview
* **General Architecture:** Node.js + Express + TypeScript
* **Vector Database:** ChromaDB (Persistent local storage mapped via Docker volumes).
* **LLM Orchestration:** Official Ollama SDK managing the execution of code-centric models.

---

## Architecture Data Flows

The system architecture is engineered around two distinct operational pipelines:

### Pipeline A: Codebase Ingestion & Context Sync (`POST /api/files`)
This background workflow indexes the active Remix IDE workspace layout into the localized vector ecosystem.

1. **AST Separation:** [solidity-parser/parser](https://github.com/solidity-parser/parser) splits raw `.sol` files into structural logical blocks (`FunctionDefinition`, `ModifierDefinition`, etc.).
2. **Token Constraint & Over-the-Limit Control:** [js-tiktoken](https://www.npmjs.com/package/tiktoken) validates lengths using the `cl100k_base` model. If a massive logical unit combined with its scoping headers exceeds a strict maximum threshold of **400 tokens**, the system identifies target cutting points to partition the data without breaking raw lines in half.
3. **Local Embedding Generation:** [@xenova/transformers](https://huggingface.co/docs/transformers/index) computes analytical embeddings via the lightweight `Xenova/bge-small-en-v1.5` model (or optional high-performance `Xenova/bge-large-en-v1.5`).
4. **ChromaDB Vector Ingestion:** Records are written directly to ChromaDB in synchronized parallel batches (`BATCH_SIZE = 30`) using a structured layout generated out of the text contents:
   * `id`: Mapped manually to support future delta tracking when files are edited.
   * `metadata`: Injects critical environmental structural context to maximize search relevance.
   * `pageContent`: A plain-text block merging metadata context with the specific chunk payload (e.g., a function slice or a modifier).
   * `embedding`: The mathematical vector representation computed dynamically from the `pageContent`.

> [!WARNING]
> **Comment Parsing Limitation:** The current AST parser strips out standard code comments. This is a known issue because **NatSpec comments** provide massive analytical value for security auditing. Right now, matching NatSpec requires temporary manual analysis strings, which is a bottleneck slated for future pipeline refactoring.

---

### Pipeline B: Interactive Conversation & RAG Retrieval (`POST /api/query`)
This synchronous 7-step transactional sequence is orchestrated by the `QueryController` to deliver highly accurate context-aware responses with zero link hallucinations.

#### Step 1: Query Rewriting
Users frequently ask conversational questions containing implicit pronouns or deictics ("Why is *this* modifier used?", "Who can call *that* function?"). A lightweight model would fail to match these terms against a raw vector base.
* The application extracts the `query` and up to the last 6 iterations of the `chatHistory` array.
* It fires an isolated, rapid inference request to Ollama using custom prompt constraints designed to execute a **Query Rewrite**. 
* The internal LLM parameters are locked to an extreme deterministic state (`temperature: 0.0`, `num_predict: 40`, `top_p: 0.2`) to resolve pronouns and output a clean, standalone search query.

#### Step 2: Similar Embedding Search
* Generate the corresponding embedding vector from the standalone query string.
* The system invokes ChromaDB retrieving the **Top-3 most similar code snippets** (`similarChunks`) that intersect semantically with the user's intent.

#### Step 3: Environment Mapping
To address the tight context constraints of localized models, `codeMap.ts` constructs a structural relationship skeleton of the smart contract environment:
* **High-Density Focus:** Performs a quick extraction of the active file path focused in the Remix editor, mapping its overall anatomy, variable layouts, inherited structures, emitted events, and inline EVM assembly blocks.
* **Low-Density Focus:** Queries relation links from ChromaDB to discover neighboring target files that import or depend on the current contract.
> [!NOTE]
> Functional but still working to increase performance without saturating token on prompt.

#### Step 4: Creating Prompt
* The original user question, the retrieved `similarChunks`, the generated `environmentMap`, and the conversational `chatHistory` are fed into the `promptBuilder` utility.
* This merges the data into a single, cohesive XML-tagged markdown prompt payload, isolating operational rules inside the system scope and code variables inside user context limits.

#### Step 5: Sending Prompt
* The compiled prompt payload is dispatched directly to the local Ollama container engine.
* The platform blocks execution until the model architecture (`qwen2.5-coder:1.5b-instruct` or upgraded variations) completes processing and streams back the final raw answer string.

#### Step 6: Link Injection 
Small LLM models are heavily prone to hallucinating file URLs or line paths when asked to provide citations.
* The raw answer string is passed directly to the `injectRemixLinks` helper before being transmitted back to the client side.
* This module intersects tokens inside the text with verified coordinate keys found in the `similarChunks` metadata and the memory-cached `environmentMap`.
* Discovered contract entities and terms are sorted by descending text length to prevent substring clipping and are wrapped in the secure native protocol format: `[Entity](remix://contracts/File.sol?line=X)`.
> [!NOTE]
> Functional but in some cases the injection fails in some elements (e.g. external functions).

#### Step 7: HTTP Payload Dispatch
* The controller bundles the safe, deep-linked answer string into the final JSON payload.
* It dispatches an HTTP status `200 OK` back to the frontend application, unblocking the UI loading spinners.

---

## Model Selection Strategy

The system is engineered around the **Qwen2.5-Coder** family (specifically `qwen2.5-coder:1.5b-instruct` as the lightweight default). 

* **Why Qwen-Coder?** It is open-source and performs better with Solidity syntax, contract relationships, and Ethereum-specific execution logic.
* **Hardware Scale:** It provides a highly adaptive matrix, allowing users with more powerful setups to upgrade to `7b-instruct` or higher via the `.env` file to unlock deeper security reasoning without changing a single line of code.

---

## REST API

### 1. `POST /api/files`
Receives the workspace array mapped by the frontend, runs AST division, and generates vector weights.
* **Payload Structure:**
  ```json
  {
    "files": [
      { "path": "/contracts/Token.sol", "content": "pragma solidity ^0.8.0; contract Token {}" }
    ]
  }
  ```
* **Success Response (200 OK):**
  ```json
  { "totalFiles": 1, "totalChunks": 8 }
  ```

### 2. `POST /api/query`
Orchestrates the hybrid conversation loop, executes vector retrieval, and injects interactive deep links.
* **Payload Structure:**
  ```json
  {
    "query": "Who can call the mint function?",
    "activeFilePath": "/contracts/Token.sol",
    "chatHistory": [
      { "role": "user", "content": "Analyze my token contract" },
      { "role": "assistant", "content": "I have mapped Token.sol. How can I help you audit it?" }
    ]
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "answer": "Based on the structural AST analysis, only accounts with the [MINTER_ROLE](remix://contracts/Token.sol?line=34) can execute it."
  }
  ```
