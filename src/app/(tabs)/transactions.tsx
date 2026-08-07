import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryChip } from '@/components/CategoryChip';
import { Select, type SelectOption } from '@/components/Select';
import { EmptyState, ErrorState, Eyebrow, Loading, Mono, Sans } from '@/components/base';
import { useCategories } from '@/hooks/useCategories';
import { useTransactions } from '@/hooks/useTransactions';
import type { Transaction } from '@/lib/api/types';
import { categoryColor } from '@/lib/categoryColor';
import { formatCents } from '@/lib/money';
import { PERIOD_PRESETS, type PeriodPreset, formatShortDate, presetToRange } from '@/lib/period';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ALL = '__all__';

export default function TransactionsScreen() {
  const { c } = useTheme();
  const [preset, setPreset] = useState<PeriodPreset>('This Month');
  const [category, setCategory] = useState(ALL);

  const { tree, isLoading: catsLoading } = useCategories();
  const range = useMemo(() => presetToRange(preset), [preset]);

  // A stem holds no transactions of its own, so selecting one has to query its
  // children instead — filtering by the stem name would return nothing.
  const categories = useMemo(
    () => (category === ALL ? [] : tree.expand(category)),
    [category, tree],
  );

  const { data, isLoading, error, refetch, isFetching } = useTransactions({ range, categories });

  const categoryOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: ALL, label: 'All categories' }];
    for (const cat of tree.ordered) {
      const isStem = tree.isStem(cat.name);
      opts.push({
        value: cat.name,
        label: cat.name,
        swatch: categoryColor(cat.name, tree),
        indented: !!cat.parent_name,
        hint: isStem ? 'Group — includes its subcategories' : undefined,
      });
    }
    return opts;
  }, [tree]);

  const rows = data?.rows ?? [];
  // The API returns no total count, so these come from the fetched set — which
  // is the whole range, not one page.
  const net = rows.reduce((sum, t) => sum + t.amount_cents, 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          padding: space.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
          gap: space.lg,
        }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>Transactions</Eyebrow>
          <Sans size={20} weight="semibold">
            Expenses
          </Sans>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Select
            label="Period"
            value={preset}
            options={PERIOD_PRESETS.map(p => ({ value: p, label: p }))}
            onChange={v => setPreset(v as PeriodPreset)}
          />
          <Select
            label="Category"
            value={category}
            options={categoryOptions}
            onChange={setCategory}
          />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Mono size={10} tone="muted" numeric={false}>
            {rows.length} TRANSACTION{rows.length === 1 ? '' : 'S'}
          </Mono>
          <Mono size={10} tone={net < 0 ? 'default' : 'success'}>
            NET {formatCents(net, { signed: true })}
          </Mono>
        </View>

        {data?.truncated ? (
          <Mono size={10} tone="destructive" numeric={false}>
            Showing the first 1000 per category — narrow the period to see all.
          </Mono>
        ) : null}
      </View>

      {isLoading || catsLoading ? (
        <Loading label="Loading transactions" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions found."
          hint="Try a wider period, or import a statement with the + button."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={t => String(t.id)}
          refreshing={isFetching}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item }) => <Row tx={item} tree={tree} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ tx, tree }: { tx: Transaction; tree: ReturnType<typeof useCategories>['tree'] }) {
  const { c } = useTheme();
  const debit = tx.amount_cents < 0;

  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
        gap: 6,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Sans style={{ flex: 1 }} numberOfLines={1}>
          {tx.vendor_name?.trim() || tx.description}
        </Sans>
        {/* Credits are not debits: Income, Interest and Transfer In come back
            positive and must not render as red minus amounts. */}
        <Mono size={14} weight="medium" tone={debit ? 'default' : 'success'}>
          {formatCents(tx.amount_cents, { signed: true })}
        </Mono>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Mono size={11} tone="muted">
          {formatShortDate(tx.transaction_date)}
        </Mono>
        <CategoryChip category={tx.category} tree={tree} />
        {!tx.is_settled ? (
          <Mono size={10} tone="muted" numeric={false}>
            PENDING
          </Mono>
        ) : null}
      </View>
    </View>
  );
}
