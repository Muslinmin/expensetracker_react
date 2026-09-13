import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Eyebrow, Mono, Sans } from '@/components/base';
import { useApi, useApiReady } from '@/hooks/useApi';
import { ApiAuthError, ApiNetworkError, type UploadFile } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { invalidateAfterDataChange } from '@/lib/api/queryClient';
import { ingestInsertedCount, type CategoriseStats, type IngestResponse } from '@/lib/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Status = 'idle' | 'picked' | 'uploading' | 'categorising' | 'done';
type PickedFile = UploadFile & { size?: number };

/** Job poll cadence — matches the backend's `Retry-After: 3` on pending/running. */
const POLL_INTERVAL_MS = 3000;
/** Client-side backstop; the server itself fails a job stuck >10min as stale. */
const MAX_POLL_ATTEMPTS = 220;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiAuthError) return 'Server key was rejected — check it in Settings.';
  if (err instanceof ApiNetworkError) return 'Could not reach the server. Check your connection and try again.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export default function ImportScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const api = useApi();
  const apiReady = useApiReady();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [categoriseResult, setCategoriseResult] = useState<CategoriseStats | null>(null);
  const [categoriseError, setCategoriseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recategorising, setRecategorising] = useState(false);
  // Bumped on reset so a poll loop still in flight from a previous upload
  // knows to stop touching state instead of clobbering the new attempt.
  const pollGeneration = useRef(0);

  async function pickFile() {
    setError(null);
    // copyToCacheDirectory is off deliberately. With it on, the picker reports
    // a file:// URI under its own cache directory that does not actually
    // exist — `new File(uri).exists` is false immediately after picking on
    // Android 16 / Expo Go SDK 57 — and the upload then fails inside React
    // Native's networking layer with "Could not retrieve file for uri". That
    // surfaced to the user as "Could not reach the server", which sent anyone
    // debugging it after the network instead of the file.
    //
    // With it off, the picker returns the provider's content:// URI, which
    // ContentResolver opens directly and React Native's FormData handles.
    //
    // Verified on Android only — there is no iOS device here. On iOS this
    // returns a URI into the originating app's sandbox rather than a copy, so
    // if an import ever fails there, this flag is the first thing to revisit.
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
      copyToCacheDirectory: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (!asset.name.toLowerCase().endsWith('.csv')) {
      setError(`Not a CSV file: ${asset.name}`);
      return;
    }

    // Fail here, where the cause is knowable, rather than several seconds
    // later as an indistinguishable network error.
    try {
      if (!new FsFile(asset.uri).exists) {
        setError(`Could not read ${asset.name}. Try picking it again.`);
        return;
      }
    } catch {
      // Some providers hand back a URI this API cannot stat. That is not
      // itself a failure — let the upload be the judge.
    }
    setFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'text/csv',
      size: asset.size ?? undefined,
    });
    setStatus('picked');
  }

  async function upload() {
    if (!file) return;
    const generation = ++pollGeneration.current;
    setStatus('uploading');
    setProgress(0);
    setError(null);
    setCategoriseResult(null);
    setCategoriseError(null);
    try {
      const response = await endpoints.ingest(api, file, setProgress);
      setResult(response);
      setStatus('categorising');
      await pollJob(generation, response.job_id);
    } catch (err) {
      setError(errorMessage(err));
      setStatus('picked');
    }
  }

  /**
   * Ingest returns as soon as the (fast, DB-only) insert finishes — the
   * categorisation it kicks off runs as a background job, so we poll for it
   * rather than expecting it in the ingest response itself.
   */
  async function pollJob(generation: number, jobId: string) {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      let job;
      try {
        job = await endpoints.ingestJob(api, jobId);
      } catch (err) {
        if (pollGeneration.current !== generation) return;
        setError(errorMessage(err));
        setStatus('done');
        return;
      }
      if (pollGeneration.current !== generation) return;

      if (job.status === 'completed') {
        setCategoriseResult(job.result);
        setStatus('done');
        await invalidateAfterDataChange(queryClient);
        return;
      }
      if (job.status === 'failed') {
        setCategoriseError(job.error ?? 'Categorisation failed.');
        setStatus('done');
        await invalidateAfterDataChange(queryClient);
        return;
      }
      await delay(POLL_INTERVAL_MS);
    }
    if (pollGeneration.current !== generation) return;
    setCategoriseError('Categorisation is taking longer than expected — check back later.');
    setStatus('done');
    await invalidateAfterDataChange(queryClient);
  }

  async function retryCategorise() {
    setRecategorising(true);
    setError(null);
    try {
      const stats = await endpoints.categorise(api);
      setCategoriseResult(stats);
      setCategoriseError(null);
      await invalidateAfterDataChange(queryClient);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRecategorising(false);
    }
  }

  function reset() {
    pollGeneration.current++;
    setStatus('idle');
    setFile(null);
    setProgress(0);
    setResult(null);
    setCategoriseResult(null);
    setCategoriseError(null);
    setError(null);
  }

  const insertedCount = result ? ingestInsertedCount(result) : 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: space.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
        }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>Import</Eyebrow>
          <Sans size={20} weight="semibold">
            Add Transactions
          </Sans>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <X size={22} color={c.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}>
        {!apiReady ? (
          <Card>
            <Sans tone="destructive">Set a server address and key in Settings before importing.</Sans>
          </Card>
        ) : status === 'done' && result ? (
          <>
            <Card style={{ gap: space.md, alignItems: 'center' }}>
              <CheckCircle2 size={32} color={c.success} />
              <Sans size={16} weight="semibold">
                {insertedCount} transaction{insertedCount === 1 ? '' : 's'} imported
              </Sans>
            </Card>

            <Card style={{ gap: space.sm }}>
              <Eyebrow>Files</Eyebrow>
              {result.files.map((f, i) => (
                <View
                  key={`${f.file}-${i}`}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                  {f.status === 'ok' ? (
                    <CheckCircle2 size={14} color={c.success} style={{ marginTop: 2 }} />
                  ) : (
                    <AlertCircle size={14} color={c.destructive} style={{ marginTop: 2 }} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Sans size={12} numberOfLines={1}>
                      {f.file}
                    </Sans>
                    <Mono size={10} tone={f.status === 'ok' ? 'muted' : 'destructive'} numeric={false}>
                      {f.status === 'ok' ? `${f.inserted ?? 0} inserted, ${f.skipped ?? 0} skipped` : f.error}
                    </Mono>
                  </View>
                </View>
              ))}
            </Card>

            {categoriseError ? (
              <Card style={{ gap: space.sm }}>
                <Eyebrow>Categorisation</Eyebrow>
                <Sans size={12} tone="muted">
                  Rows were imported but categorisation failed to run — they&apos;re sitting as Uncategorised
                  for now.
                </Sans>
                <Mono size={10} tone="destructive" numeric={false}>
                  {categoriseError}
                </Mono>
                <Button
                  title={recategorising ? 'Retrying…' : 'Retry Categorisation'}
                  variant="outline"
                  loading={recategorising}
                  onPress={retryCategorise}
                />
              </Card>
            ) : categoriseResult ? (
              <Card style={{ gap: space.sm }}>
                <Eyebrow>Categorisation</Eyebrow>
                <View style={{ gap: 6 }}>
                  <StatRow label="Rules" value={categoriseResult.resolved_by_rules} />
                  <StatRow label="Cache" value={categoriseResult.resolved_by_cache} />
                  <StatRow label="Cluster" value={categoriseResult.resolved_by_cluster} />
                  <StatRow label="Fuzzy match" value={categoriseResult.resolved_by_fuzzy} />
                  <StatRow label="LLM" value={categoriseResult.resolved_by_llm} />
                </View>
                {(categoriseResult.llm_batches_failed ?? 0) > 0 ? (
                  <Sans size={11} tone="destructive">
                    {categoriseResult.llm_batches_failed} LLM batch
                    {categoriseResult.llm_batches_failed === 1 ? '' : 'es'} failed — some rows may still be
                    Uncategorised.
                  </Sans>
                ) : null}
              </Card>
            ) : null}

            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button title="Import Another" variant="outline" onPress={reset} style={{ flex: 1 }} />
              <Button title="Done" onPress={() => router.back()} style={{ flex: 1 }} />
            </View>
          </>
        ) : status === 'categorising' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <ActivityIndicator size="large" color={c.primary} />
            <Sans tone="muted">Categorising transactions…</Sans>
          </View>
        ) : status === 'uploading' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <Upload size={28} color={c.primary} />
            <View style={{ width: '100%', gap: space.sm }}>
              <View style={{ height: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${Math.round(progress * 100)}%`,
                    backgroundColor: c.primary,
                  }}
                />
              </View>
              <Mono size={11} tone="muted" style={{ textAlign: 'center' }}>
                Uploading {Math.round(progress * 100)}%
              </Mono>
            </View>
          </View>
        ) : status === 'picked' && file ? (
          <>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <FileSpreadsheet size={24} color={c.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Sans size={13} numberOfLines={1}>
                  {file.name}
                </Sans>
                {file.size ? (
                  <Mono size={10} tone="muted">
                    {formatBytes(file.size)}
                  </Mono>
                ) : null}
              </View>
            </Card>
            {error ? (
              <Sans size={12} tone="destructive">
                {error}
              </Sans>
            ) : null}
            <View style={{ flex: 1 }} />
            <View style={{ gap: space.sm }}>
              <Button title="Upload" onPress={upload} />
              <Button title="Choose Different File" variant="outline" onPress={pickFile} />
            </View>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <View
              style={{
                width: 56,
                height: 56,
                backgroundColor: c.secondary,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <FileSpreadsheet size={26} color={c.primary} />
            </View>
            <Sans tone="muted" style={{ textAlign: 'center' }}>
              Pick a CSV export from your bank to add its transactions.
            </Sans>
            {error ? (
              <Sans size={12} tone="destructive">
                {error}
              </Sans>
            ) : null}
            <Button title="Choose CSV File" onPress={pickFile} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Sans size={12} tone="muted">
        {label}
      </Sans>
      <Mono size={12}>{value}</Mono>
    </View>
  );
}
