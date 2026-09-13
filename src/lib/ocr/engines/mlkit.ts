import TextRecognition from '@react-native-ml-kit/text-recognition';
import { File, Paths } from 'expo-file-system';

import { fromBase64 } from '@/lib/crypto/keys';

import { renderPdfPages } from '../pdfjsBridge';
import type { ExtractedPage, OcrEngine } from '../types';

/**
 * Genuine on-device OCR (Google's local Text Recognition model — confirmed
 * no network call for the standard API, unlike ML Kit's separate cloud-only
 * "Document" API). Needs a rendered page image, not raw PDF bytes, so page
 * rendering is delegated to the same pdf.js WebView bridge the `pdfjs`
 * engine uses (see pdfjsBridge.tsx) rather than adding a second native
 * PDF-rendering module.
 *
 * Requires a custom dev client — the native module isn't present in Expo Go.
 */
export const mlKitEngine: OcrEngine = {
  id: 'mlkit',
  label: 'ML Kit (on-device OCR)',

  isAvailable() {
    return typeof TextRecognition.recognize === 'function';
  },

  async extractPdf(fileUri: string): Promise<ExtractedPage[]> {
    const pdfBase64 = await new File(fileUri).base64();
    const pageImagesBase64 = await renderPdfPages(pdfBase64);

    const pages: ExtractedPage[] = [];
    for (let i = 0; i < pageImagesBase64.length; i++) {
      const tmpFile = new File(Paths.cache, `mlkit-page-${Date.now()}-${i}.png`);
      tmpFile.write(fromBase64(pageImagesBase64[i]));
      try {
        const result = await TextRecognition.recognize(tmpFile.uri);
        const lines = result.blocks.flatMap(block => block.lines.map(line => ({ text: line.text })));
        pages.push({ pageIndex: i, lines });
      } finally {
        tmpFile.delete();
      }
    }
    return pages;
  },
};
