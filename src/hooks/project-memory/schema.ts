/**
 * Zod schema for ProjectMemory
 *
 * Lenient/permissive: catches type-level corruption while defaulting
 * all optional/nested fields so partial files degrade gracefully.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Leaf schemas
// ---------------------------------------------------------------------------

const LanguageDetectionSchema = z.object({
  name: z.string(),
  version: z.string().nullable().default(null),
  confidence: z.enum(['high', 'medium', 'low']),
  markers: z.array(z.string()).default([]),
});

const FrameworkDetectionSchema = z.object({
  name: z.string(),
  version: z.string().nullable().default(null),
  category: z.enum(['frontend', 'backend', 'fullstack', 'testing', 'build']),
});

const GitBranchPatternSchema = z.object({
  defaultBranch: z.string(),
  branchingStrategy: z.string().nullable().default(null),
});

const CustomNoteSchema = z.object({
  timestamp: z.number(),
  source: z.enum(['manual', 'learned']),
  category: z.string(),
  content: z.string(),
});

const DirectoryInfoSchema = z.object({
  path: z.string(),
  purpose: z.string().nullable().default(null),
  fileCount: z.number().default(0),
  lastAccessed: z.number().default(0),
  keyFiles: z.array(z.string()).default([]),
});

const HotPathSchema = z.object({
  path: z.string(),
  accessCount: z.number().default(0),
  lastAccessed: z.number().default(0),
  type: z.enum(['file', 'directory']),
});

const UserDirectiveSchema = z.object({
  timestamp: z.number(),
  directive: z.string(),
  context: z.string(),
  source: z.enum(['explicit', 'inferred']),
  priority: z.enum(['high', 'normal']),
});

// ---------------------------------------------------------------------------
// Nested object schemas
// ---------------------------------------------------------------------------

const TechStackSchema = z.object({
  languages: z.array(LanguageDetectionSchema).default([]),
  frameworks: z.array(FrameworkDetectionSchema).default([]),
  packageManager: z.string().nullable().default(null),
  runtime: z.string().nullable().default(null),
});

const BuildInfoSchema = z.object({
  buildCommand: z.string().nullable().default(null),
  testCommand: z.string().nullable().default(null),
  lintCommand: z.string().nullable().default(null),
  devCommand: z.string().nullable().default(null),
  scripts: z.record(z.string(), z.string()).default({}),
});

const CodeConventionsSchema = z.object({
  namingStyle: z.string().nullable().default(null),
  importStyle: z.string().nullable().default(null),
  testPattern: z.string().nullable().default(null),
  fileOrganization: z.string().nullable().default(null),
});

const ProjectStructureSchema = z.object({
  isMonorepo: z.boolean().default(false),
  workspaces: z.array(z.string()).default([]),
  mainDirectories: z.array(z.string()).default([]),
  gitBranches: GitBranchPatternSchema.nullable().default(null),
});

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

/**
 * Full ProjectMemory schema.
 * - Required fields: version, lastScanned, projectRoot
 * - All nested objects are optional with sensible defaults
 * - Unknown extra fields pass through (forward-compatible)
 */
export const ProjectMemorySchema = z
  .object({
    version: z.string(),
    lastScanned: z.number(),
    projectRoot: z.string(),
    techStack: TechStackSchema.optional().default({
      languages: [],
      frameworks: [],
      packageManager: null,
      runtime: null,
    }),
    build: BuildInfoSchema.optional().default({
      buildCommand: null,
      testCommand: null,
      lintCommand: null,
      devCommand: null,
      scripts: {},
    }),
    conventions: CodeConventionsSchema.optional().default({
      namingStyle: null,
      importStyle: null,
      testPattern: null,
      fileOrganization: null,
    }),
    structure: ProjectStructureSchema.optional().default({
      isMonorepo: false,
      workspaces: [],
      mainDirectories: [],
      gitBranches: null,
    }),
    customNotes: z.array(CustomNoteSchema).optional().default([]),
    directoryMap: z.record(z.string(), DirectoryInfoSchema).optional().default({}),
    hotPaths: z.array(HotPathSchema).optional().default([]),
    userDirectives: z.array(UserDirectiveSchema).optional().default([]),
  })
  .passthrough();

/**
 * Partial schema for validating only the 3 required identity fields.
 * Useful for quick pre-checks before full parsing.
 */
export const ProjectMemoryPartial = z.object({
  version: z.string(),
  lastScanned: z.number(),
  projectRoot: z.string(),
});

export type ProjectMemorySchemaType = z.infer<typeof ProjectMemorySchema>;
