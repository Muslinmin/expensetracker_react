import { pdfJsEngine } from './engines/pdfjs';
import type { OcrEngine, OcrEngineId } from './types';

/**
 * All candidate engines, in the order the benchmark should try them.
 * Adding a new engine — or swapping which one the import flow uses — means
 * touching this list and nothing that calls getOcrEngine().
 */
export const OCR_ENGINES: readonly OcrEngine[] = [pdfJsEngine];

export function getOcrEngine(id: OcrEngineId): OcrEngine {
  const engine = OCR_ENGINES.find(e => e.id === id);
  if (!engine) throw new Error(`Unknown or not-yet-registered OCR engine: ${id}`);
  return engine;
}
