# Frontend Subsystem

This subsystem manages the UI (User Interface), the native Remix connection, interaction with its API, and workspace telemetry synchronization.

## Architectural Overview
The frontend is built on **React + Vite + TypeScript**. This stack ensures rapid development and strict type safety across the application. Using TypeScript guarantees data contract consistency with the backend, especially when mapping complex structures like workspace files.

---

## Remix IDE Integration

The plugin establishes communication with the host IDE through two core utility modules:
* [`connectRemix.ts`](../../frontend/src/utils/remix/connectRemix.ts): Manages the plugin lifecycle hooks, initial handshake, and permission declarations (`fileManager` and `editor`) with Remix IDE.
* [`apiRemix.ts`](../../frontend/src/utils/remix/apiRemix.ts): Wraps native Remix calls into clean, asynchronous operations to fetch active file paths, retrieve source code, listen to tab-switching events, and control text highlighting.

---

## Core Operational Modules
The frontend is divided into three key pillars:

### 1. Workspace Ingestion & Processing
This module scans the Remix workspace using native `readdir` to collect all Solidity files and stream them to the backend. 

* **Folder Blacklisting:** To preserve performance and minimize database noise, the ingestion scanner strictly ignores several directories:
  * `node_modules`: Adds too much noise, heavily degrading performance.
  * `.deps`: Contains imports from external libraries like OpenZeppelin. *(This will add additional value to the search later, but it does not work with the current implementation and I am not sure how to implement it yet)*.
  * `test` / `tests`: Adds too much noise, degrading performance.
  > [!NOTE]
  > *Future Roadmap:* This folder exclusion strategy should be changed to upgrade performance, potentially using another naming layout or database design.
* **Legal and Documentation Files:** The system automatically skips files without a proper Solidity contract structure (e.g., `LICENSE.sol`).
* **Static Synchronization Constraints:** Files with active compilation errors or files edited after the initial ingestion process will not be considered. The plugin currently operates under a view-only state, not for real-time indexing while active editing is taking place.

### 2. Active File Tracking & Debouncing
Keeps track of the smart contract currently open in the user's workspace to anchor the assistant's behavioral focus.

* **Debounced Tab-Switching Buffering:** Implements an execution wrapper that delays file context switching by `500ms` (triggered by the `currentFileChanged` event). This prevents pipeline freezes or backend bottlenecks when a user rapidly toggles through code tabs.

> [!IMPORTANT]  
> **Not yet implemented.**  
> * **AST Integration:** Integration of the [@solidity-parser/parser](https://github.com/solidity-parser/parser) library is planned for the client side. This will parse the ANTLR grammar to create a localized Abstract Syntax Tree (AST), allowing the UI to render a hierarchical structural outline (state variables, functions, modifiers, events, and internal/external calls) directly in the navigation panel.

### 3. Conversational Chat Interface
An interactive chat interface designed to run targeted semantic queries against the active codebase.

* **Context Window Management:** For every question dispatched, the system extracts a strict snapshot of the last **6 sequential messages** (`chatHistory`) directly from the React state cache to maintain short-term contextual relevance.
  > [!NOTE]  
  > The current local inference response latency ranges from **15s to 45s**, depending entirely on prompt complexity and model parameter size.
* **Deterministic Deep Linking:** When the local LLM generates markdown links using our custom protocol prefix (e.g., `[Link](remix://contracts/Token.sol?line=42)`), the `ChatMessageView.tsx` component intercepts the click event. It natively commands Remix IDE to open that exact file path and highlight the targeted line number, eliminating LLM link hallucinations entirely.

> [!IMPORTANT]  
> **Not yet implemented.**  
> * **Model Selector Matrix:** Add a custom toggle selector to allow the user to choose from a variety of local Ollama models or remote endpoints seamlessly.
