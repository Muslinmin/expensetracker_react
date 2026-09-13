import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

import type { ExtractedPage } from './types';

type PendingJob = {
  resolve: (pages: ExtractedPage[]) => void;
  reject: (err: Error) => void;
};

type BridgeMessage =
  | { type: 'ready' }
  | { type: 'result'; pages: ExtractedPage[] }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string };

let webviewRef: WebView | null = null;
let bridgeReady = false;
let queuedJob: { base64: string; job: PendingJob } | null = null;
let currentJob: PendingJob | null = null;
// Set by PdfJsBridgeHost while mounted — lets runPdfJsExtraction trigger the
// (one-time, lazy) library load without the host needing to expose a ref.
let ensureLoad: (() => Promise<void>) | null = null;

function postToBridge(base64: string) {
  webviewRef?.postMessage(JSON.stringify({ type: 'extract', base64 }));
}

function handleBridgeMessage(raw: string) {
  let msg: BridgeMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === 'log') {
    console.log('[pdfjsBridge]', msg.message);
    return;
  }
  if (msg.type === 'ready') {
    bridgeReady = true;
    if (queuedJob) {
      currentJob = queuedJob.job;
      postToBridge(queuedJob.base64);
      queuedJob = null;
    }
    return;
  }
  if (msg.type === 'result') {
    currentJob?.resolve(msg.pages);
    currentJob = null;
    return;
  }
  if (msg.type === 'error') {
    currentJob?.reject(new Error(msg.message));
    currentJob = null;
  }
}

export async function runPdfJsExtraction(base64: string): Promise<ExtractedPage[]> {
  if (!ensureLoad) {
    throw new Error('PDF.js bridge is not mounted — is <PdfJsBridgeHost /> in the app tree?');
  }
  await ensureLoad();
  return new Promise((resolve, reject) => {
    const job: PendingJob = { resolve, reject };
    if (bridgeReady && webviewRef) {
      currentJob = job;
      postToBridge(base64);
    } else {
      queuedJob = { base64, job };
    }
  });
}

export function isPdfJsBridgeMounted(): boolean {
  return ensureLoad !== null;
}

/**
 * Both the library and its worker are inlined as Blobs. The library loads via
 * dynamic import() — a plain `<script type=module src=blobUrl>` silently
 * never finished executing past the import in testing, dynamic import() did
 * not have that problem. getDocument() hard-throws if no workerSrc is set (no
 * silent main-thread fallback in this pdf.js version), so the worker blob is
 * loaded as a module Worker.
 */
const HTML_SHELL = (pdfJsSource: string, pdfWorkerSource: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head><body>
<script>
window.__PDFJS_SOURCE__ = ${JSON.stringify(pdfJsSource)};
window.__PDFJS_WORKER_SOURCE__ = ${JSON.stringify(pdfWorkerSource)};

function post(obj) {
  window.ReactNativeWebView.postMessage(JSON.stringify(obj));
}

// Surfaced as RN console.log calls (see handleBridgeMessage's 'log' case) —
// without this, a failure inside the injected module script (e.g. blob-URL
// module import unsupported on this WebView) never reaches the RN side at all.
window.addEventListener('error', function (e) {
  post({ type: 'log', message: 'window error: ' + (e.message || e) });
});
window.addEventListener('unhandledrejection', function (e) {
  post({ type: 'log', message: 'unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason) });
});

function groupLines(items) {
  // Each text run carries its own baseline y (transform[5]); runs sharing a
  // baseline within a small tolerance are one visual line.
  const tolerance = 2;
  const rows = [];
  for (const item of items) {
    const y = item.transform[5];
    let row = rows.find(function (r) { return Math.abs(r.y - y) <= tolerance; });
    if (!row) {
      row = { y: y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x: item.transform[4], text: item.str });
  }
  rows.sort(function (a, b) { return b.y - a.y; });
  return rows
    .map(function (r) {
      return { text: r.parts.sort(function (a, b) { return a.x - b.x; }).map(function (p) { return p.text; }).join(' ').replace(/\\s+/g, ' ').trim() };
    })
    .filter(function (l) { return l.text.length > 0; });
}

async function extract(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push({ pageIndex: i - 1, lines: groupLines(content.items) });
  }
  return pages;
}

function onMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch (e) {
    return;
  }
  if (msg.type !== 'extract') return;
  extract(msg.base64)
    .then(function (pages) { post({ type: 'result', pages: pages }); })
    .catch(function (err) { post({ type: 'error', message: String(err && err.message ? err.message : err) }); });
}
document.addEventListener('message', onMessage);
window.addEventListener('message', onMessage);

post({ type: 'log', message: 'building blob, source len ' + window.__PDFJS_SOURCE__.length });
const mainBlobUrl = URL.createObjectURL(new Blob([window.__PDFJS_SOURCE__], { type: 'text/javascript' }));
post({ type: 'log', message: 'dynamic import() starting' });
import(/* webpackIgnore: true */ mainBlobUrl)
  .then(function (ns) {
    post({ type: 'log', message: 'dynamic import resolved, has getDocument=' + !!ns.getDocument });
    window.pdfjsLib = ns;
    const workerBlobUrl = URL.createObjectURL(new Blob([window.__PDFJS_WORKER_SOURCE__], { type: 'text/javascript' }));
    ns.GlobalWorkerOptions.workerSrc = workerBlobUrl;
    post({ type: 'ready' });
  })
  .catch(function (err) {
    post({ type: 'error', message: 'dynamic import failed: ' + (err && err.message ? err.message : String(err)) });
  });
</script>
</body></html>`;

/**
 * Always mounted (see app/_layout.tsx), invisible. Loading the ~500KB pdf.js
 * build only happens once, lazily, on the first extraction request rather
 * than at app start.
 */
export function PdfJsBridgeHost() {
  const [html, setHtml] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    ensureLoad = async () => {
      if (requestedRef.current) return;
      requestedRef.current = true;
      console.log('[pdfjsBridge] ensureLoad: resolving asset modules');
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset require, not a code module
      const mainAsset = Asset.fromModule(require('../../../assets/vendor/pdfjs-main.rawjs'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset require, not a code module
      const workerAsset = Asset.fromModule(require('../../../assets/vendor/pdfjs-worker.rawjs'));
      console.log('[pdfjsBridge] ensureLoad: downloading assets');
      await Promise.all([mainAsset.downloadAsync(), workerAsset.downloadAsync()]);
      console.log('[pdfjsBridge] ensureLoad: assets downloaded, localUris', mainAsset.localUri, workerAsset.localUri);
      const [mainSource, workerSource] = await Promise.all([
        new File(mainAsset.localUri!).text(),
        new File(workerAsset.localUri!).text(),
      ]);
      console.log('[pdfjsBridge] ensureLoad: text read, lengths', mainSource.length, workerSource.length);
      setHtml(HTML_SHELL(mainSource, workerSource));
      console.log('[pdfjsBridge] ensureLoad: setHtml called');
    };
    return () => {
      ensureLoad = null;
    };
  }, []);

  if (!html) return null;

  return (
    // A genuinely zero-sized WebView gets throttled by Chromium and never
    // runs its JS at all — 1x1 off-screen keeps it "visible" enough to stay
    // active while still being invisible to the user.
    <View style={{ position: 'absolute', top: -1000, left: -1000, width: 1, height: 1, overflow: 'hidden' }}>
      <WebView
        ref={ref => {
          webviewRef = ref;
        }}
        source={{ html }}
        onMessage={e => handleBridgeMessage(e.nativeEvent.data)}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}
