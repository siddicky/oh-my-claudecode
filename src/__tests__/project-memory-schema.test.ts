/**
 * Tests for ProjectMemory Zod schema validation
 *
 * Covers: valid input, missing required fields, wrong types,
 * passthrough of unknown fields, defaulting of null arrays/objects.
 */

import { describe, it, expect } from 'vitest';
import { ProjectMemorySchema, ProjectMemoryPartial } from '../hooks/project-memory/schema.js';

// Minimal valid ProjectMemory payload (no optional fields)
const minimalValid = {
  version: '1.0.0',
  lastScanned: 1716000000000,
  projectRoot: '/home/user/project',
};

// Full valid payload for reference
const fullValid = {
  ...minimalValid,
  techStack: {
    languages: [{ name: 'TypeScript', version: '5.0', confidence: 'high', markers: ['tsconfig.json'] }],
    frameworks: [{ name: 'Vitest', version: '1.0', category: 'testing' }],
    packageManager: 'npm',
    runtime: 'node',
  },
  build: {
    buildCommand: 'npm run build',
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
    devCommand: 'npm run dev',
    scripts: { build: 'tsc', test: 'vitest' },
  },
  conventions: {
    namingStyle: 'camelCase',
    importStyle: 'esm',
    testPattern: '**/*.test.ts',
    fileOrganization: 'feature-based',
  },
  structure: {
    isMonorepo: false,
    workspaces: [],
    mainDirectories: ['src', 'dist'],
    gitBranches: { defaultBranch: 'main', branchingStrategy: 'trunk' },
  },
  customNotes: [{ timestamp: 1716000000000, source: 'manual', category: 'note', content: 'hi' }],
  directoryMap: {
    src: { path: 'src', purpose: 'source', fileCount: 10, lastAccessed: 1716000000000, keyFiles: [] },
  },
  hotPaths: [{ path: 'src/index.ts', accessCount: 5, lastAccessed: 1716000000000, type: 'file' }],
  userDirectives: [
    {
      timestamp: 1716000000000,
      directive: 'always use ESM',
      context: 'import style',
      source: 'explicit',
      priority: 'high',
    },
  ],
};

describe('ProjectMemorySchema', () => {
  it('accepts a valid minimal input (no optional fields)', () => {
    const result = ProjectMemorySchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.projectRoot).toBe('/home/user/project');
      expect(result.data.lastScanned).toBe(1716000000000);
    }
  });

  it('accepts a full valid payload', () => {
    const result = ProjectMemorySchema.safeParse(fullValid);
    expect(result.success).toBe(true);
  });

  it('fails when version is missing', () => {
    const { version: _v, ...withoutVersion } = minimalValid;
    const result = ProjectMemorySchema.safeParse(withoutVersion);
    expect(result.success).toBe(false);
  });

  it('fails when lastScanned is a string instead of number', () => {
    const bad = { ...minimalValid, lastScanned: '2024-01-01T00:00:00Z' };
    const result = ProjectMemorySchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('fails when projectRoot is missing', () => {
    const { projectRoot: _r, ...withoutRoot } = minimalValid;
    const result = ProjectMemorySchema.safeParse(withoutRoot);
    expect(result.success).toBe(false);
  });

  it('allows unknown extra fields to pass through (passthrough)', () => {
    const withExtras = { ...minimalValid, unknownFutureField: 'some value', anotherExtra: 42 };
    const result = ProjectMemorySchema.safeParse(withExtras);
    expect(result.success).toBe(true);
    if (result.success) {
      // passthrough: extra fields preserved — cast through unknown to access dynamic props
      const data = result.data as unknown as Record<string, unknown>;
      expect(data['unknownFutureField']).toBe('some value');
      expect(data['anotherExtra']).toBe(42);
    }
  });

  it('defaults missing optional arrays to []', () => {
    // Provide techStack without languages/frameworks arrays
    const withPartialTechStack = {
      ...minimalValid,
      techStack: { packageManager: 'npm', runtime: 'node' },
    };
    const result = ProjectMemorySchema.safeParse(withPartialTechStack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.techStack.languages).toEqual([]);
      expect(result.data.techStack.frameworks).toEqual([]);
    }
  });

  it('defaults entire techStack to empty when techStack is omitted', () => {
    const result = ProjectMemorySchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.techStack).toEqual({
        languages: [],
        frameworks: [],
        packageManager: null,
        runtime: null,
      });
    }
  });

  it('fails when techStack is null (wrong type — not omitted, but explicitly null)', () => {
    const bad = { ...minimalValid, techStack: null };
    const result = ProjectMemorySchema.safeParse(bad);
    // null is not a valid object for TechStackSchema
    expect(result.success).toBe(false);
  });

  it('defaults customNotes to [] when omitted', () => {
    const result = ProjectMemorySchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customNotes).toEqual([]);
    }
  });

  it('defaults structure.gitBranches to null when omitted', () => {
    const withStructureNoGit = {
      ...minimalValid,
      structure: { isMonorepo: false, workspaces: [], mainDirectories: [] },
    };
    const result = ProjectMemorySchema.safeParse(withStructureNoGit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.structure.gitBranches).toBeNull();
    }
  });
});

describe('ProjectMemoryPartial', () => {
  it('accepts an object with just the 3 required fields', () => {
    const result = ProjectMemoryPartial.safeParse(minimalValid);
    expect(result.success).toBe(true);
  });

  it('fails when version is missing', () => {
    const { version: _v, ...withoutVersion } = minimalValid;
    const result = ProjectMemoryPartial.safeParse(withoutVersion);
    expect(result.success).toBe(false);
  });
});
