import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { ensureModulesRegistryEntry, ensureThemeImport } from './vite-studio-api';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('vite-studio-api AST patch helpers', () => {
  it('adds import and modulesRegistry entry idempotently across formatting variants', () => {
    const initial = `
import { alphaThemeConfig } from '../../data/alphaTheme';

export const modulesRegistry = {
  alpha: alphaThemeConfig
}
`;

    const withImport = ensureThemeImport(initial, 'bicyclemaintenanceTheme', 'bicyclemaintenanceThemeConfig');
    const withEntry = ensureModulesRegistryEntry(withImport, 'bicyclemaintenance', 'bicyclemaintenanceThemeConfig');
    const withImportAgain = ensureThemeImport(withEntry, 'bicyclemaintenanceTheme', 'bicyclemaintenanceThemeConfig');
    const finalOutput = ensureModulesRegistryEntry(withImportAgain, 'bicyclemaintenance', 'bicyclemaintenanceThemeConfig');

    expect(countOccurrences(finalOutput, "import { bicyclemaintenanceThemeConfig } from '../../data/bicyclemaintenanceTheme';")).toBe(1);
    expect(countOccurrences(finalOutput, 'bicyclemaintenance: bicyclemaintenanceThemeConfig')).toBe(1);

    const sourceFile = ts.createSourceFile('registry.ts', finalOutput, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(sourceFile.parseDiagnostics.length).toBe(0);
  });

  it('adds missing named import even when same module path is already imported with a different symbol', () => {
    const initial = `
import { alphaThemeConfig } from '../../data/alphaTheme';
import { someOtherConfig } from '../../data/bicyclemaintenanceTheme';

export const modulesRegistry = {
  alpha: alphaThemeConfig
}
`;
    const output = ensureThemeImport(initial, 'bicyclemaintenanceTheme', 'bicyclemaintenanceThemeConfig');
    expect(countOccurrences(output, "import { bicyclemaintenanceThemeConfig } from '../../data/bicyclemaintenanceTheme';")).toBe(1);

    const sourceFile = ts.createSourceFile('registry.ts', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(sourceFile.parseDiagnostics.length).toBe(0);
  });

  it('quotes non-identifier module IDs when adding registry entries', () => {
    const initial = `
export const modulesRegistry = {
  alpha: alphaThemeConfig
}
`;
    const output = ensureModulesRegistryEntry(initial, 'my-module', 'myModuleThemeConfig');
    expect(output).toContain('"my-module": myModuleThemeConfig');

    const sourceFile = ts.createSourceFile('registry.ts', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    expect(sourceFile.parseDiagnostics.length).toBe(0);
  });
});
