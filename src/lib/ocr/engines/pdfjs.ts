import { File } from 'expo-file-system';

import { isPdfJsBridgeMounted, runPdfJsExtraction } from '../pdfjsBridge';
import type { ExtractedPage, OcrEngine } from '../types';

/**
 * Text-layer extraction via pdf.js running inside a hidden WebView. Only
 * useful for born-digital PDFs — a scanned/image-only page comes back with
 * zero text runs, same as it would in a real browser.
 *
 * The only engine here that needs no native module: works in Expo Go.
 */
export const pdfJsEngine: OcrEngine = {
  id: 'pdfjs',
  label: 'pdf.js (text layer)',

  isAvailable() {
    return isPdfJsBridgeMounted();
  },

  async extractPdf(fileUri: string): Promise<ExtractedPage[]> {
    const base64 = await new File(fileUri).base64();
    return runPdfJsExtraction(base64);
  },
};
