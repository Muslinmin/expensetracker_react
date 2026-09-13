/** pdf.js's own build output, bundled as a raw asset and injected into a WebView as text — see src/lib/ocr/pdfjsBridge.tsx. */
declare module '*.rawjs' {
  const assetId: number;
  export default assetId;
}
