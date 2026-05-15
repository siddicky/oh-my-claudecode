/**
 * Read and JSON-parse a file. Returns defaultValue on any error.
 */
import { existsSync, readFileSync } from 'fs';

export function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!existsSync(filePath)) return defaultValue;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return defaultValue;
  }
}
