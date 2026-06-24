import * as parser from '@solidity-parser/parser';
import { getEncoding } from 'js-tiktoken';
import { GenericChunk, BaseMetadata, FunctionMetadata } from '../../entities/chunk.entity';
import { FileStruct } from '../../entities/file.entity';

// Initialize the tokenizer space leveraging standard OpenAI token tracking architectures
const enc = getEncoding('cl100k_base');

// RAG Configurations
const MAX_CHUNK_TOKENS = 400;
const OVERLAP_LINES = 3;

// Used to know the actual context for inheritance and dependencies.
interface ElementContext {
  name: string;
  type: 'contract' | 'library' | 'interface' | 'Global (Top-Level)';
  inheritedContracts: string[];
  stateVariables: string[];
}

/**
 * Splits massive text frames into window blocks while strictly preserving line-breaks 
 * and enforcing token limit safety constraints.
 */
function splitCodeByTokens(text: string, maxTokensForCode: number, overlap: number = 3): string[] {
  const lines = text.split('\n');
  const fragments: string[] = [];
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    currentLines.push(lines[i]);
    const currentText = currentLines.join('\n');
    const tokenCount = enc.encode(currentText).length;

    if (tokenCount > maxTokensForCode && currentLines.length > 1) {
      currentLines.pop();
      fragments.push(currentLines.join('\n'));
      currentLines = currentLines.slice(-overlap); // Aplicamos el solapamiento
      currentLines.push(lines[i]);
    }
  }

  if (currentLines.length > 0) {
    fragments.push(currentLines.join('\n'));
  }

  return fragments;
}

/**
 * Traverses Solidity abstract syntax trees to derive clean logical chunks wrapped in operational metadata.
 */
export function generateSolidityChunks(file: FileStruct): GenericChunk[] {
  const filePath = file.path;
  const ast = parser.parse(file.content, { range: true, loc: true });

  const chunks: GenericChunk[] = [];
  let pragmaVersion = 'Unknown';
  const fileImports: string[] = [];

  // Atomic unique index token counter registries
  let funcCounter = 0;
  let modCounter = 0;
  let evtCounter = 0;
  let errCounter = 0;
  let varCounter = 0;

  let currentContext: ElementContext = {
    name: 'Global (Top-Level)',
    type: 'Global (Top-Level)',
    inheritedContracts: [],
    stateVariables: []
  };

  // Harvest global context parameters prior to executing heavy syntax block loops
  parser.visit(ast, {
    PragmaDirective(node) {
      if (node.name === 'solidity') {
        pragmaVersion = `pragma solidity ${node.value}`;
      }
    },
    ImportDirective(node) {
      fileImports.push(node.path);
    }
  });

  const importsString = fileImports.join(';');

  // Traverse AST extracting elements
  parser.visit(ast, {
    ContractDefinition(node) {
      const inheritedContracts = node.baseContracts.map(b => b.baseName.namePath);
      const stateVars: string[] = [];

      currentContext = {
        name: node.name,
        type: node.kind as 'contract' | 'library' | 'interface',
        inheritedContracts: inheritedContracts,
        stateVariables: stateVars
      };

      // Traverse subnodes to identify and generate variable states chunks
      node.subNodes.forEach(subNode => {
        if (subNode.type === 'StateVariableDeclaration') {
          const varDecl = subNode as any;
          varDecl.variables.forEach((v: any) => {

            if (subNode.range && subNode.loc) {
              const [start, end] = subNode.range;
              const rawCode = file.content.slice(start, end + 1);

              const pageContent = `File: ${filePath}\nContract: ${node.name}\nElement: state_variable ${v.name}\nCode:\n${rawCode}`;

              chunks.push({
                id: `chunk_${filePath.replace(/[\/.]/g, '_')}_var_${v.name}_${varCounter++}`,
                pageContent,
                metadata: {
                  filePath,
                  pragma: pragmaVersion,
                  contractName: node.name,
                  contextType: node.kind as any,
                  nodeType: 'state_variable',
                  name: v.name,
                  imports: importsString,
                  inheritance: inheritedContracts.join(';'),
                  startLine: subNode.loc.start.line,
                  endLine: subNode.loc.end.line
                } as any
              });
            }
          });
        }
      });
    },

    FunctionDefinition(node) {
      if (!node.range) return;
      const [start, end] = node.range;
      const rawCode = file.content.slice(start, end + 1);
      const functionName = node.name || (node.isConstructor ? 'constructor' : 'fallback');

      const extractedModifiers = node.modifiers ? node.modifiers.map(m => m.name) : [];

      const isTopLevel = currentContext.name === 'Global (Top-Level)';
      const activeContext = isTopLevel ? 'Global' : currentContext.name;
      const activeContextType = isTopLevel ? 'Global (Top-Level)' : currentContext.type;

      // Sub-Traverse extracting internal and external functions
      const invokedFunctions = new Set<string>();
      if (node.body) {
        parser.visit(node.body, {
          FunctionCall(callNode) {
            if (callNode.expression.type === 'Identifier') {
              invokedFunctions.add(callNode.expression.name);
            } else if (callNode.expression.type === 'MemberAccess') {
              invokedFunctions.add(callNode.expression.memberName);
            }
          }
        });
      }
      const callsString = Array.from(invokedFunctions).join(';');

      const headerTemplate = `File: ${filePath}\nContract: ${activeContext}\nInherits: ${currentContext.inheritedContracts.join(', ')}\nElement: function ${functionName}\nModifiers: ${extractedModifiers.join(', ')}\nCalls: ${Array.from(invokedFunctions).join(', ')}`;

      const headerTokens = enc.encode(headerTemplate).length;
      const allowedCodeTokens = MAX_CHUNK_TOKENS - headerTokens - 15;

      const codeFragments = splitCodeByTokens(rawCode, allowedCodeTokens, OVERLAP_LINES);
      const currentFuncIndex = funcCounter++;

      codeFragments.forEach((fragment, index) => {
        const pageContent = `${headerTemplate} (Part ${index + 1}/${codeFragments.length})\nCode:\n${fragment}`;

        const metadata: FunctionMetadata = {
          filePath,
          pragma: pragmaVersion,
          contractName: activeContext,
          contextType: activeContextType as any,
          nodeType: 'function',
          name: functionName,
          imports: importsString,
          inheritance: isTopLevel ? '' : currentContext.inheritedContracts.join(';'),
          globalVariables: isTopLevel ? '' : currentContext.stateVariables.join(';'),
          modifiers: extractedModifiers.join(';'),
          callsFunctions: callsString,
          startLine: node.loc?.start.line,
          endLine: node.loc?.end.line,
          chunkIndex: index + 1,
          totalChunks: codeFragments.length
        };

        chunks.push({
          id: `chunk_${filePath.replace(/[\/.]/g, '_')}_func_${functionName}_f${currentFuncIndex}_p${index + 1}`,
          pageContent,
          metadata
        });
      });
    },

    ModifierDefinition(node) {
      if (!node.range) return;
      const [start, end] = node.range;
      const rawCode = file.content.slice(start, end + 1);

      const pageContent = `File: ${filePath}\nCompiler: ${pragmaVersion}\nContract: ${currentContext.name}\nElement: modifier ${node.name}\nCode:\n${rawCode}`;

      const metadata: BaseMetadata = {
        filePath,
        pragma: pragmaVersion,
        contractName: currentContext.name,
        contextType: currentContext.type as any,
        nodeType: 'modifier',
        name: node.name,
        imports: importsString,
        inheritance: currentContext.inheritedContracts.join(';'),
        startLine: node.loc?.start.line,
        endLine: node.loc?.end.line
      };

      chunks.push({
        id: `chunk_${filePath.replace(/[\/.]/g, '_')}_mod_${node.name}_${modCounter++}`,
        pageContent,
        metadata
      });
    },

    EventDefinition(node) {
      if (!node.range) return;
      const [start, end] = node.range;
      const rawCode = file.content.slice(start, end + 1);

      const pageContent = `File: ${filePath}\nCompiler: ${pragmaVersion}\nContract: ${currentContext.name}\nElement: event ${node.name}\nCode:\n${rawCode}`;

      const metadata: BaseMetadata = {
        filePath,
        pragma: pragmaVersion,
        contractName: currentContext.name,
        contextType: currentContext.type as any,
        nodeType: 'event',
        name: node.name,
        imports: importsString,
        inheritance: currentContext.inheritedContracts.join(';'),
        startLine: node.loc?.start.line,
        endLine: node.loc?.end.line
      };

      chunks.push({
        id: `chunk_${filePath.replace(/[\/.]/g, '_')}_evt_${node.name}_${evtCounter++}`,
        pageContent,
        metadata
      });
    },

    CustomErrorDefinition(node) {
      if (!node.range) return;
      const [start, end] = node.range;
      const rawCode = file.content.slice(start, end + 1);

      const isTopLevel = currentContext.name === 'Global (Top-Level)';
      const activeContext = isTopLevel ? 'Global' : currentContext.name;
      const activeContextType = isTopLevel ? 'Global (Top-Level)' : currentContext.type;

      const pageContent = `File: ${filePath}\nCompiler: ${pragmaVersion}\nContract: ${activeContext}\nElement: error ${node.name}\nCode:\n${rawCode}`;

      const metadata: BaseMetadata = {
        filePath,
        pragma: pragmaVersion,
        contractName: activeContext,
        contextType: activeContextType as any,
        nodeType: 'custom_error',
        name: node.name,
        imports: importsString,
        inheritance: isTopLevel ? '' : currentContext.inheritedContracts.join(';'),
        startLine: node.loc?.start.line,
        endLine: node.loc?.end.line
      };

      chunks.push({
        id: `chunk_${filePath.replace(/[\/.]/g, '_')}_err_${node.name}_${errCounter++}`,
        pageContent,
        metadata
      });
    }
  });

  return chunks;
}
