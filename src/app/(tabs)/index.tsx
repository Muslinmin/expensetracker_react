import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Upload, Wallet } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { SpendTrendChart } from '@/components/charts/SpendTrendChart';
import { Select, type SelectOption } from '@/components/Select';
import { Card, ErrorState, Eyebrow, Loading, Mono, Sans } from '@/components/base';
import { useCategories } from '@/hooks/useCategories';
import { useMonthlySummary } from '@/hooks/useSummary';
import { bucketStatus, resolveBudget, spendForBucket, totalSpend } from '@/lib/budget';
import { colorFor, UNCATEGORISED_COLOR } from '@/lib/categoryColor';
import { UNCATEGORISED } from '@/lib/categoryTree';
import { periodsWithData, totalsByRootCategory, trendSeries, TREND_ALL } from '@/lib/dashboardStats';
import { formatCents } from '@/lib/money';
import {
  currentPeriod,
  mostRecentPeriodWithData,
  periodLabel,
  periodLabelUpper,
  periodShortLabel,
  trailingTwelvePeriods,
} from '@/lib/period';
import { useBudgets } from '@/store/budgets';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const TREND_SPANS = [
  { value: '3', label: 'Last 3 Months', months: 3 },
  { value: '6', label: 'Last 6 Months', months: 6 },
  { value: '12', label: 'Last 12 Months', months: 12 },
] as const;

export default function DashboardScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { prefs } = useSettings();
  const { tree, isLoading: catsLoading } = useCategories();
  const { data: monthlyRows, isLoading: summaryLoading, error, refetch } = useMonthlySummary(false);
  const { configs, hydrated: budgetsHydrated, reconcile } = useBudgets();

  const [trendCategory, setTrendCategory] = useState<string>(TREND_ALL);
  const [trendSpan, setTrendSpan] = useState<(typeof TREND_SPANS)[number]['value']>('6');

  // Buckets keyed to a category the taxonomy no longer has must not silently
  // keep budgeting a name nothing can ever match again.
  useEffect(() => {
    if (tree.all.length > 0) reconcile(new Set(tree.all.map(cat => cat.name)));
  }, [tree, reconcile]);

  const rows = useMemo(() => monthlyRows ?? [], [monthlyRows]);

  // The live database's history doesn't necessarily reach "today" (see the
  // frontend doc §2), so the current calendar month can have zero rows.
  const selectedPeriod = useMemo(
    () => mostRecentPeriodWithData(periodsWithData(rows), currentPeriod()),
    [rows],
  );
  const periodRows = useMemo(() => rows.filter(r => r.period === selectedPeriod), [rows, selectedPeriod]);

  const totalSpentCents = useMemo(() => totalSpend(periodRows), [periodRows]);
  const budget = useMemo(() => resolveBudget(configs, selectedPeriod), [configs, selectedPeriod]);
  const spentPct = budget && budget.totalBudgetCents > 0 ? (totalSpentCents / budget.totalBudgetCents) * 100 : 0;
  const balanceCents = budget ? budget.totalBudgetCents - totalSpentCents : 0;

  const donutData = useMemo(
    () =>
      totalsByRootCategory(periodRows, tree).map(t => ({
        ...t,
        color: t.category === UNCATEGORISED ? UNCATEGORISED_COLOR : colorFor(t.category, tree),
      })),
    [periodRows, tree],
  );

  const trendCategoryOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: TREND_ALL, label: 'All Spend' }];
    for (const root of tree.roots) {
      opts.push({ value: root.name, label: root.name, swatch: colorFor(root.name, tree) });
    }
    opts.push({ value: UNCATEGORISED, label: UNCATEGORISED, swatch: UNCATEGORISED_COLOR });
    return opts;
  }, [tree]);

  const trendPeriods = useMemo(() => {
    const months = TREND_SPANS.find(s => s.value === trendSpan)?.months ?? 6;
    const all = trailingTwelvePeriods();
    return all.slice(all.length - months);
  }, [trendSpan]);

  const trendPoints = useMemo(() => {
    const series = trendSeries(rows, trendPeriods, trendCategory, tree);
    return trendPeriods.map((p, i) => ({ label: periodShortLabel(p), cents: series[i] }));
  }, [rows, trendPeriods, trendCategory, tree]);

  const trendColor =
    trendCategory === TREND_ALL
      ? c.primary
      : trendCategory === UNCATEGORISED
        ? UNCATEGORISED_COLOR
        : colorFor(trendCategory, tree);

  const bucketEntries = useMemo(
    () => (budget ? Object.entries(budget.buckets).sort(([a], [b]) => a.localeCompare(b)) : []),
    [budget],
  );

  const loading = catsLoading || summaryLoading || !budgetsHydrated;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      {loading ? (
        <Loading label="Loading dashboard" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
          <View style={{ gap: 2 }}>
            <Eyebrow>{periodLabelUpper(selectedPeriod)}</Eyebrow>
            <Sans size={20} weight="semibold">
              {prefs.name ? `Hello, ${prefs.name.split(' ')[0]}.` : 'Dashboard'}
            </Sans>
          </View>

          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 2 }}>
                <Eyebrow>Monthly Balance</Eyebrow>
                <Mono size={24} weight="medium" tone={balanceCents >= 0 ? 'default' : 'destructive'}>
                  {budget ? formatCents(balanceCents) : formatCents(totalSpentCents)}
                </Mono>
              </View>
              <View
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: c.secondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Wallet size={16} color={c.primary} />
              </View>
            </View>

            {budget ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Mono size={10} tone="muted">
                    SPENT {formatCents(totalSpentCents)}
                  </Mono>
                  <Mono size={10} tone="muted">
                    BUDGET {formatCents(budget.totalBudgetCents)}
                  </Mono>
                </View>
                <View style={{ height: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.max(0, Math.min(100, spentPct))}%`,
                      backgroundColor: spentPct >= 100 ? c.destructive : spentPct >= 80 ? c.warning : c.primary,
                    }}
                  />
                </View>
                <Mono size={10} tone="muted">
                  {Math.round(spentPct)}% used
                </Mono>
              </View>
            ) : configs.length > 0 ? (
              <Sans size={11} tone="muted">
                You have {configs.length} budget{configs.length === 1 ? '' : 's'} configured, but none
                apply to {periodLabel(selectedPeriod)} — check its scope in the Budget tab (a &ldquo;Single
                Month&rdquo; or &ldquo;Custom Period&rdquo; budget only applies within its own dates).
              </Sans>
            ) : (
              <Sans size={11} tone="muted">
                No budget set for this period — total spent shown instead. Configure one in the Budget tab.
              </Sans>
            )}
          </Card>

          <Card style={{ gap: space.md }}>
            <Eyebrow>By Category</Eyebrow>
            <CategoryDonut data={donutData} />
          </Card>

          <Card style={{ gap: space.md }}>
            <Eyebrow>Spending Trend</Eyebrow>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Select label="Category" value={trendCategory} options={trendCategoryOptions} onChange={setTrendCategory} />
              <Select
                label="Range"
                value={trendSpan}
                options={TREND_SPANS.map(s => ({ value: s.value, label: s.label }))}
                onChange={v => setTrendSpan(v as (typeof TREND_SPANS)[number]['value'])}
              />
            </View>
            <SpendTrendChart data={trendPoints} color={trendColor} />
          </Card>

          {budget && bucketEntries.length === 0 ? (
            <Card style={{ gap: space.sm }}>
              <Eyebrow>Budget Buckets</Eyebrow>
              <Sans size={11} tone="muted">
                This budget doesn&apos;t have any per-category amounts set yet — add some in the Buckets
                section of the Budget tab to see them broken out here.
              </Sans>
            </Card>
          ) : null}

          {budget && bucketEntries.length > 0 ? (
            <Card style={{ gap: space.md }}>
              <Eyebrow>Budget Buckets — {periodLabelUpper(selectedPeriod)}</Eyebrow>
              <View style={{ gap: space.md }}>
                {bucketEntries.map(([category, budgetCents]) => {
                  const spent = spendForBucket(periodRows, category, tree);
                  const status = bucketStatus(category, budgetCents, spent);
                  const color = category === UNCATEGORISED ? UNCATEGORISED_COLOR : colorFor(category, tree);
                  return (
                    <View key={category} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <View style={{ width: 6, height: 6, backgroundColor: color }} />
                          <Sans size={12} numberOfLines={1} style={{ flex: 1 }}>
                            {category}
                          </Sans>
                        </View>
                        <Mono size={10} weight="medium" tone={status.over ? 'destructive' : 'default'}>
                          {status.over
                            ? `−${formatCents(Math.abs(status.remainingCents))}`
                            : `${formatCents(status.remainingCents)} left`}
                        </Mono>
                      </View>
                      <View style={{ height: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
                        <View
                          style={{
                            height: '100%',
                            width: `${Math.max(0, Math.min(100, status.pct))}%`,
                            backgroundColor: status.over ? c.destructive : status.warning ? c.warning : color,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}
        </ScrollView>
      )}

      <Pressable
        onPress={() => router.push('/import')}
        hitSlop={8}
        style={({ pressed }) => ({
          position: 'absolute',
          right: space.lg,
          bottom: space.xl,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 4,
        })}>
        <Upload size={22} color={c.primaryForeground} />
      </Pressable>
    </SafeAreaView>
  );
}
