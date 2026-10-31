import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

interface DeployPayload {
  moduleId: string;
  themeFile: string;
  fileName: string;
}

function findModulesRegistryObjectLiteral(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'modulesRegistry') continue;
      if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
        return decl.initializer;
      }
    }
  }
  return null;
}

export function ensureThemeImport(source: string, baseName: string, configExport: string): string {
  const modulePath = `../../data/${baseName}`;
  const sourceFile = ts.createSourceFile('registry.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const importDecls = sourceFile.statements.filter(ts.isImportDeclaration);
  const hasExactNamedImport = importDecls.some((decl) => {
    const spec = decl.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || spec.text !== modulePath) return false;
    const clause = decl.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
    return clause.namedBindings.elements.some((el) => el.name.text === configExport);
  });
  if (hasExactNamedImport) return source;
  if (importDecls.length === 0) {
    return `import { ${configExport} } from '${modulePath}';\n${source}`;
  }
  const lastImport = importDecls[importDecls.length - 1];
  const insertAt = lastImport.getEnd();
  const importLine = `\nimport { ${configExport} } from '${modulePath}';`;
  return source.slice(0, insertAt) + importLine + source.slice(insertAt);
}

export function ensureModulesRegistryEntry(source: string, moduleId: string, configExport: string): string {
  const sourceFile = ts.createSourceFile('registry.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const registryObject = findModulesRegistryObjectLiteral(sourceFile);
  if (!registryObject) {
    throw new Error('Unable to locate modulesRegistry object literal in registry.ts');
  }
  const hasEntry = registryObject.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return false;
    const name = prop.name;
    if (ts.isIdentifier(name)) return name.text === moduleId;
    if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text === moduleId;
    return false;
  });
  if (hasEntry) return source;

  const insertAt = registryObject.getEnd() - 1; // before closing brace
  const isIdentifierKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(moduleId);
  const keyLiteral = isIdentifierKey ? moduleId : JSON.stringify(moduleId);
  const props = registryObject.properties;
  if (props.length === 0) {
    const insertion = `\n  ${keyLiteral}: ${configExport},\n`;
    return source.slice(0, insertAt) + insertion + source.slice(insertAt);
  }

  const lastProp = props[props.length - 1];
  const between = source.slice(lastProp.getEnd(), insertAt);
  const needsComma = !between.includes(',');
  const insertion = `${needsComma ? ',' : ''}\n  ${keyLiteral}: ${configExport},`;
  return source.slice(0, insertAt) + insertion + source.slice(insertAt);
}

/**
 * Vite dev-server plugin that exposes POST /api/studio/deploy.
 * Only active during `vite dev` (apply: 'serve').
 *
 * On a successful request it:
 *   1. Writes src/data/<fileName> to disk
 *   2. Idempotently adds the import + registry entry to registry.ts
 * Vite's HMR then picks up both file changes automatically.
 */
export function studioApiPlugin(): Plugin {
  const attachDeployMiddleware = (
    middlewares: {
      use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
    },
    root: string
  ) => {
    middlewares.use((req, res, next) => {
      if (req.method !== 'POST' || req.url !== '/api/studio/deploy') {
        next();
        return;
      }

      res.setHeader('Content-Type', 'application/json');

      console.log('[studio-api] POST /api/studio/deploy received');

      // Collect request body
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('error', (err) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      });
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          const payload = JSON.parse(body) as DeployPayload;
          const { moduleId, themeFile, fileName } = payload;

          if (!moduleId || !themeFile || !fileName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing required fields: moduleId, themeFile, fileName' }));
            return;
          }

          // Reject path traversal: fileName must be a plain alphanumeric .ts filename
          if (!/^[a-zA-Z0-9_-]+\.ts$/.test(fileName)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid fileName: must match [a-zA-Z0-9_-]+.ts' }));
            return;
          }

          // ── 1. Write the theme file ──────────────────────────────────────
          const dataDir = path.join(root, 'src', 'data');
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, fileName), themeFile, 'utf-8');

          // ── 2. Patch registry.ts (AST-anchored, not regex-based) ───────
          const registryPath = path.join(
            root,
            'src',
            'lib',
            'training-core',
            'registry.ts'
          );
          let registry = fs.readFileSync(registryPath, 'utf-8');

          const baseName = fileName.replace(/\.ts$/, '');
          const configExport = `${moduleId}ThemeConfig`;
          registry = ensureThemeImport(registry, baseName, configExport);
          registry = ensureModulesRegistryEntry(registry, moduleId, configExport);

          fs.writeFileSync(registryPath, registry, 'utf-8');

          console.log('[studio-api] Deploy successful:', fileName);
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, moduleId, fileName }));
        } catch (err) {
          console.error('[studio-api] Deploy error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    });
  };

  return {
    name: 'studio-api',
    configureServer(server) {
      attachDeployMiddleware(server.middlewares, server.config.root);
    },

    configurePreviewServer(server) {
      attachDeployMiddleware(server.middlewares, server.config.root);
    }
  };
}
