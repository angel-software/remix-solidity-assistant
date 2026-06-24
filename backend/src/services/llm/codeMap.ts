import * as fs from 'fs';
import * as parser from '@solidity-parser/parser';
import { getDependentFilesFromDB } from '../chromadb';
import { FileEnvironmentMap } from '../../entities/ollama.entity';

/**
 * Generates a lightweight, low-density structural overview map of a surrounding file.
 */
function codeMapFromFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${filePath}]\n`;
    
    if (filePath.toLowerCase().includes('test') || filePath.toLowerCase().includes('mock')) {
      return '';
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(content, { loc: false, tolerant: true });
    
    let mapStr = `\n[File: ${filePath}]\n`;
    const imports: string[] = [];

    // 1. Extract imports
    parser.visit(ast, {
      ImportDirective(node) {
        imports.push(node.path);
      }
    });
    if (imports.length > 0) mapStr += `  ├─ Imports: ${imports.join(', ')}\n`;

    // 2. Process contract
    parser.visit(ast, {
      ContractDefinition(node) {
        const inherits = node.baseContracts.map(bc => bc.baseName.namePath).join(', ');
        mapStr += `  └─ ${node.kind} ${node.name} ${inherits ? 'is ' + inherits : ''}\n`;
        
        const stateVars: string[] = [];
        const modifiers: string[] = [];
        const functions: string[] = [];

        node.subNodes.forEach((subNode) => {
          if (subNode.type === 'StateVariableDeclaration') {
            subNode.variables.forEach(v => {
              const typeName = v.typeName?.type === 'ElementaryTypeName' ? v.typeName.name : 'custom_type';
              stateVars.push(`${v.name} (${typeName})`);
            });
          } 
          else if (subNode.type === 'ModifierDefinition') {
            modifiers.push(subNode.name);
          } 
          else if (subNode.type === 'FunctionDefinition') {
            const fName = subNode.name || (subNode.isConstructor ? 'constructor' : 'fallback');
            const visibility = subNode.visibility !== 'default' ? subNode.visibility : 'public';
            const stateMutability = subNode.stateMutability ? ` [${subNode.stateMutability}]` : '';
            
            // --- NUEVO: RASTREO DE INVOCACIONES DENTRO DEL CUERPO ---
            const invokedFunctions: string[] = [];
            if (subNode.body) {
              parser.visit(subNode.body, {
                FunctionCall(callNode) {
                  const expr = callNode.expression;
                  if (expr.type === 'Identifier') {
                    // Llamada directa: _mint(), _pause(), keccak256()
                    invokedFunctions.push(expr.name);
                  } else if (expr.type === 'MemberAccess') {
                    // Llamada a objeto/contrato externo: token.transfer() o msg.sender
                    if (expr.expression.type === 'Identifier') {
                      invokedFunctions.push(`${expr.expression.name}.${expr.memberName}`);
                    }
                  }
                }
              });
            }

            // Clean ducplicated filter native functions such as (require, assets)
            // MUST REVIEW
            const uniqueCalls = [...new Set(invokedFunctions)].filter(
              name => !['require', 'assert', 'revert', 'keccak256', 'address', 'bytes32'].includes(name)
            );

            let funcLine = `${fName} (${visibility}${stateMutability})`;
            if (uniqueCalls.length > 0) {
              funcLine += ` -> calls: [${uniqueCalls.join(', ')}]`;
            }
            functions.push(funcLine);
          }
        });

        if (stateVars.length > 0) mapStr += `     ├─ State Vars: ${stateVars.join(', ')}\n`;
        if (modifiers.length > 0) mapStr += `     ├─ Modifiers: ${modifiers.join(', ')}\n`;
        if (functions.length > 0) mapStr += `     └─ Functions:\n` + functions.map(f => `        • ${f}`).join('\n') + '\n';
      }
    });

    return mapStr;
  } catch (error) {
    return `[Error parsing file schema context: ${filePath}]\n`;
  }
}

/**
 * Generates a high-density, absolute detailed schema analysis map of the targeted active file.
 */
function codeMapAbsoluteFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${filePath}]\n`;
    if (filePath.toLowerCase().includes('test') || filePath.toLowerCase().includes('mock')) return '';

    const content = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(content, { loc: false, tolerant: true });
    
    let mapStr = `\n[FILE DETAILED SCHEMA: ${filePath}]\n`;

    // LEVEL 1: ROOT FILE
    const pragmas: string[] = [];
    const imports: string[] = [];
    const globalErrors: string[] = [];
    const globalConstants: string[] = [];
    const globalEnums: string[] = [];
    const globalStructs: string[] = [];
    const freeFunctions: string[] = [];

    ast.children.forEach((node) => {
      if (node.type === 'PragmaDirective') pragmas.push(`${node.name} ${node.value}`);
      if (node.type === 'ImportDirective') imports.push(node.path);
      if (node.type === 'CustomErrorDefinition') globalErrors.push(node.name);
      if (node.type === 'EnumDefinition') globalEnums.push(node.name);
      if (node.type === 'StructDefinition') globalStructs.push(node.name);
      if (node.type === 'VariableDeclarationStatement' || node.type === 'VariableDeclaration') {
        const decl = node.type === 'VariableDeclarationStatement' ? node.variables[0] : node;
        if (decl && decl.name) globalConstants.push(`${decl.name}`);
      }
      if (node.type === 'FunctionDefinition' && !node.isConstructor) {
        if (node.name) freeFunctions.push(`function ${node.name}()`);
      }
    });

    if (pragmas.length > 0) mapStr += `  ├─ Pragmas: ${pragmas.join(', ')}\n`;
    if (imports.length > 0) mapStr += `  ├─ Imports: ${imports.join(', ')}\n`;
    if (globalConstants.length > 0) mapStr += `  ├─ Global Constants: ${globalConstants.join(', ')}\n`;
    if (globalEnums.length > 0) mapStr += `  ├─ Global Enums: ${globalEnums.join(', ')}\n`;
    if (globalStructs.length > 0) mapStr += `  ├─ Global Structs: ${globalStructs.join(', ')}\n`;
    if (globalErrors.length > 0) mapStr += `  ├─ Global Errors: ${globalErrors.join(', ')}\n`;
    if (freeFunctions.length > 0) mapStr += `  ├─ Free Functions (Global): ${freeFunctions.join(', ')}\n`;

    // LEVEL 2: INSIDE A CONTRACT
    parser.visit(ast, {
      ContractDefinition(contractNode) {
        const inherits = contractNode.baseContracts.map(bc => bc.baseName.namePath).join(', ');
        mapStr += `  └─ ${contractNode.kind} ${contractNode.name} ${inherits ? 'is ' + inherits : ''}\n`;
        
        const stateVars: string[] = [];
        const modifiersDefined: string[] = [];
        const localStructs: string[] = [];
        const localEnums: string[] = [];
        const eventsDefined: string[] = [];
        const contractErrors: string[] = [];
        const functionsBlock: string[] = [];

        contractNode.subNodes.forEach((subNode) => {
          if (subNode.type === 'StateVariableDeclaration') {
            subNode.variables.forEach(v => stateVars.push(`${v.name} (${v.visibility || 'internal'})`));
          } 
          else if (subNode.type === 'ModifierDefinition') {
            modifiersDefined.push(subNode.name);
          } 
          else if (subNode.type === 'StructDefinition') {
            localStructs.push(subNode.name);
          } 
          else if (subNode.type === 'EnumDefinition') {
            localEnums.push(subNode.name);
          } 
          else if (subNode.type === 'EventDefinition') {
            eventsDefined.push(subNode.name);
          } 
          else if (subNode.type === 'CustomErrorDefinition') {
            contractErrors.push(subNode.name);
          }
          // LEVEL  3: INSIDE FUNCTIONS
          else if (subNode.type === 'FunctionDefinition') {
            const fName = subNode.name || (subNode.isConstructor ? 'constructor' : 'fallback');
            const visibility = subNode.visibility !== 'default' ? subNode.visibility : 'public';
            const mutability = subNode.stateMutability ? ` [${subNode.stateMutability}]` : '';
            const activeModifiers = subNode.modifiers.map(m => m.name);

            const calls: string[] = [];
            const emittedEvents: string[] = [];
            const localVarsDeclared: string[] = [];
            let hasAssembly = false;

            if (subNode.body) {
              parser.visit(subNode.body, {
                FunctionCall(callNode) {
                  const expr = callNode.expression;
                  if (expr.type === 'Identifier') {
                    calls.push(expr.name);
                  } else if (expr.type === 'MemberAccess' && expr.expression.type === 'Identifier') {
                    calls.push(`${expr.expression.name}.${expr.memberName}`);
                  }
                },
                EmitStatement(emitNode) {
                  if (emitNode.eventCall.expression.type === 'Identifier') {
                    emittedEvents.push(emitNode.eventCall.expression.name);
                  }
                },
                VariableDeclaration(varNode) {
                  if (varNode.name) localVarsDeclared.push(varNode.name);
                },
                InlineAssemblyStatement() {
                  hasAssembly = true;
                }
              });
            }

            const cleanCalls = [...new Set(calls)].filter(n => !['require', 'assert', 'revert', 'keccak256', 'address'].includes(n));
            const cleanEvents = [...new Set(emittedEvents)];
            const cleanLocalVars = [...new Set(localVarsDeclared)];

            let funcDetails = `function ${fName} (${visibility}${mutability})`;
            const interiorDetails: string[] = [];
            
            if (activeModifiers.length > 0) interiorDetails.push(`applied_mods: [${activeModifiers.join(', ')}]`);
            if (cleanCalls.length > 0) interiorDetails.push(`calls: [${cleanCalls.join(', ')}]`);
            if (cleanEvents.length > 0) interiorDetails.push(`emits: [${cleanEvents.join(', ')}]`);
            if (cleanLocalVars.length > 0) interiorDetails.push(`local_vars: [${cleanLocalVars.join(', ')}]`);
            if (hasAssembly) interiorDetails.push(`uses_assembly: true`);

            if (interiorDetails.length > 0) {
              funcDetails += ` -> ${interiorDetails.join(' | ')}`;
            }
            functionsBlock.push(funcDetails);
          }
        });

        if (stateVars.length > 0) mapStr += `     ├─ State Vars: ${stateVars.join(', ')}\n`;
        if (modifiersDefined.length > 0) mapStr += `     ├─ Modifiers Defined: ${modifiersDefined.join(', ')}\n`;
        if (localStructs.length > 0) mapStr += `     ├─ Structs Defined: ${localStructs.join(', ')}\n`;
        if (localEnums.length > 0) mapStr += `     ├─ Enums Defined: ${localEnums.join(', ')}\n`;
        if (eventsDefined.length > 0) mapStr += `     ├─ Events Defined: ${eventsDefined.join(', ')}\n`;
        if (contractErrors.length > 0) mapStr += `     ├─ Contract Errors: ${contractErrors.join(', ')}\n`;
        if (functionsBlock.length > 0) {
          mapStr += `     └─ Functions Anatomy:\n` + functionsBlock.map(f => `        • ${f}`).join('\n') + '\n';
        }
      }
    });

    return mapStr;
  } catch (error) {
    return `[Error parsing absolute file detailed schema layout: ${filePath}]\n`;
  }
}

/**
 * Resuelve y construye el entorno arquitectónico asimétrico de un archivo Solidity.
 */
export async function buildFileEnvironmentMap(
  activeFilePath: string,
  collectionName: string
): Promise<FileEnvironmentMap | undefined> {
  
  if (!fs.existsSync(activeFilePath)) {
    console.warn(`File path not found in server filesystem: ${activeFilePath}`);
    return undefined;
  }

  const activeDetailedSchema = codeMapAbsoluteFile(activeFilePath);

  const fileImports: string[] = [];
  const activeContent = fs.readFileSync(activeFilePath, 'utf8');
  
  try {
    const ast = parser.parse(activeContent, { tolerant: true });
    parser.visit(ast, {
      ImportDirective(node) {
        fileImports.push(node.path);
      }
    });
  } catch (astError) {
    console.warn(`Could not parse AST dynamically for active file: ${activeFilePath}`);
  }

  const dependentFiles = await getDependentFilesFromDB(collectionName, activeFilePath);

  let satelliteCodeMaps = "";

  for (const importPath of fileImports) {
    satelliteCodeMaps += codeMapFromFile(importPath);
  }

  for (const depPath of dependentFiles) {
    if (depPath !== activeFilePath) {
      satelliteCodeMaps += codeMapFromFile(depPath);
    }
  }

  const unifiedCodeMapSummary = `
=== ACTIVE FILE SCHEMA (HIGH DENSITY) ===
${activeDetailedSchema}

=== SURROUNDING DEPENDENCIES SCHEMA (LOW DENSITY) ===
${satelliteCodeMaps || 'No surrounding file dependencies found for this contract.'}
`;

  return {
    activeFile: activeFilePath,
    dependsOn: fileImports,
    usedBy: dependentFiles,
    codeMapSummary: unifiedCodeMapSummary
  };
}
