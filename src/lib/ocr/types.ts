/** One recognised line of text on a page, in reading order. */
export type ExtractedLine = {
  text: string;
  /** 0-1 confidence if the engine reports one; text-layer extractors have none. */
  confidence?: number;
};

export type ExtractedPage = {
  pageIndex: number;
  lines: ExtractedLine[];
};

export type OcrEngineId = 'pdfjs' | 'expo-pdf-text-extract' | 'mlkit' | 'paddle-ocr';

/**
 * Strategy interface: every engine — text-layer extractor or true OCR — is
 * swappable behind this shape, so the import pipeline and the benchmark
 * harness both call `extractPdf` without knowing which library backs it.
 */
export interface OcrEngine {
  readonly id: OcrEngineId;
  readonly label: string;
  /** False when the engine needs a native module absent from the current runtime (e.g. Expo Go). */
  isAvailable(): boolean;
  extractPdf(fileUri: string): Promise<ExtractedPage[]>;
}
