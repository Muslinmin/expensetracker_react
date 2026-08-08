import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Select, type SelectOption } from '@/components/Select';
import { Button, Card, Eyebrow, Loading, Mono, Sans } from '@/components/base';
import { useCategories } from '@/hooks/useCategories';
import type { BudgetConfig, BudgetScope } from '@/lib/budget';
import { makeEmptyConfig, totalAllocated } from '@/lib/budget';
import { colorFor } from '@/lib/categoryColor';
import { formatCents, formatCentsBare, parseDollarsToCents } from '@/lib/money';
import { currentPeriod, nearbyMonths, periodLabel } from '@/lib/period';
import { useBudgets } from '@/store/budgets';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';

const SCOPES: BudgetScope[] = ['continuous', 'month', 'period'];

const SCOPE_LABELS: Record<BudgetScope, string> = {
  continuous: 'All Months',
  month: 'Single Month',
  period: 'Custom Period',
};

function configTabLabel(cfg: BudgetConfig): string {
  if (cfg.scope === 'continuous') return 'Default';
  if (cfg.scope === 'month') return periodLabel(cfg.startMonth);
  return `${periodLabel(cfg.startMonth)} – ${periodLabel(cfg.endMonth)}`;
}

/**
 * Split from the outer screen so `draft`'s initial value can be a plain
 * `useState` lazy initializer seeded from the already-hydrated store, rather
 * than an Effect that calls `setState` once storage finishes loading — this
 * component simply doesn't mount until `hydrated` is true.
 */
export default function BudgetScreen() {
  const { c } = useTheme();
  const { isLoading: catsLoading } = useCategories();
  const { hydrated } = useBudgets();

  if (catsLoading || !hydrated) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
        <Loading label="Loading budgets" />
      </SafeAreaView>
    );
  }

  return <BudgetForm />;
}

function BudgetForm() {
  const { c } = useTheme();
  const { tree } = useCategories();
  const { configs, saveConfig, deleteConfig } = useBudgets();

  const [draft, setDraft] = useState<BudgetConfig>(
    () => configs[0] ?? makeEmptyConfig(`cfg-${Date.now()}`, 'continuous', currentPeriod()),
  );
  const [saved, setSaved] = useState(false);

  const monthOptions = useMemo<SelectOption[]>(
    () => nearbyMonths().map(p => ({ value: p, label: periodLabel(p) })),
    [],
  );

  const categoryOptions = useMemo(
    () =>
      tree.ordered.map(cat => ({
        value: cat.name,
        label: cat.name,
        swatch: colorFor(cat.name, tree),
        indented: !!cat.parent_name,
      })),
    [tree],
  );

  const isExisting = configs.some(cfg => cfg.id === draft.id);
  const allocated = totalAllocated(draft.buckets);
  const unallocated = draft.totalBudgetCents - allocated;

  function selectConfig(cfg: BudgetConfig) {
    setDraft({ ...cfg, buckets: { ...cfg.buckets } });
    setSaved(false);
  }

  function beginNew() {
    // Defaults to 'continuous' rather than the current calendar month: the
    // Dashboard shows the most recent period *with data*, which is often not
    // "this month" (see the frontend doc §2), and a 'month' budget scoped to
    // today would silently never match, reading as "no budget set" there.
    setDraft(makeEmptyConfig(`cfg-${Date.now()}`, 'continuous', currentPeriod()));
    setSaved(false);
  }

  function patchDraft(patch: Partial<BudgetConfig>) {
    setDraft(prev => ({ ...prev, ...patch }));
  }

  function updateBucket(category: string, dollars: string) {
    const cents = parseDollarsToCents(dollars);
    setDraft(prev => {
      const buckets = { ...prev.buckets };
      if (cents > 0) buckets[category] = cents;
      else delete buckets[category];
      return { ...prev, buckets };
    });
  }

  async function handleSave() {
    await saveConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    const remaining = configs.filter(cfg => cfg.id !== draft.id);
    await deleteConfig(draft.id);
    if (remaining[0]) selectConfig(remaining[0]);
    else beginNew();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          padding: space.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>Budget</Eyebrow>
          <Sans size={20} weight="semibold">
            Configure Budgets
          </Sans>
        </View>
        <Pressable
          onPress={beginNew}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            backgroundColor: c.primary,
            opacity: pressed ? 0.75 : 1,
          })}>
          <Plus size={14} color={c.primaryForeground} />
          <Sans size={12} weight="semibold" style={{ color: c.primaryForeground }}>
            New
          </Sans>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
        {configs.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {configs.map(cfg => {
              const active = cfg.id === draft.id;
              return (
                <Pressable
                  key={cfg.id}
                  onPress={() => selectConfig(cfg)}
                  style={{
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.accent : 'transparent',
                  }}>
                  <Sans size={12} tone={active ? 'primary' : 'muted'}>
                    {configTabLabel(cfg)}
                  </Sans>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Card style={{ gap: space.md }}>
          <Eyebrow>Scope</Eyebrow>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {SCOPES.map(scope => {
              const active = draft.scope === scope;
              return (
                <Pressable
                  key={scope}
                  onPress={() =>
                    patchDraft({
                      scope,
                      endMonth: scope === 'month' ? draft.startMonth : draft.endMonth,
                    })
                  }
                  style={{
                    flex: 1,
                    paddingVertical: space.sm,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? c.primary : c.border,
                    backgroundColor: active ? c.accent : 'transparent',
                    alignItems: 'center',
                  }}>
                  <Sans size={11} tone={active ? 'primary' : 'muted'} style={{ textAlign: 'center' }}>
                    {SCOPE_LABELS[scope]}
                  </Sans>
                </Pressable>
              );
            })}
          </View>

          {draft.scope !== 'continuous' ? (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Select
                label={draft.scope === 'month' ? 'Month' : 'Start Month'}
                value={draft.startMonth}
                options={monthOptions}
                onChange={v => patchDraft({ startMonth: v, endMonth: draft.scope === 'month' ? v : draft.endMonth })}
              />
              {draft.scope === 'period' ? (
                <Select
                  label="End Month"
                  value={draft.endMonth}
                  options={monthOptions}
                  onChange={v => patchDraft({ endMonth: v })}
                />
              ) : null}
            </View>
          ) : (
            <Sans size={11} tone="muted">
              Applies to every month unless a Single Month or Custom Period budget overrides it.
            </Sans>
          )}
        </Card>

        {/* Keyed on the config id so switching configs remounts these
            uncontrolled inputs with the new draft's values — defaultValue
            only applies on mount, and these fields intentionally stay
            uncontrolled so a keystroke never remounts and drops focus (see
            the Field/Dropdown note in components/base.tsx). */}
        <View key={draft.id} style={{ gap: space.lg }}>
          <Card style={{ gap: space.md }}>
            <Eyebrow>Total Budget</Eyebrow>
            <View style={{ justifyContent: 'center' }}>
              <TextInput
                keyboardType="decimal-pad"
                defaultValue={draft.totalBudgetCents ? formatCentsBare(draft.totalBudgetCents) : ''}
                onChangeText={v => patchDraft({ totalBudgetCents: parseDollarsToCents(v) })}
                placeholder="0.00"
                placeholderTextColor={c.mutedForeground}
                style={{
                  backgroundColor: c.inputBackground,
                  color: c.foreground,
                  paddingHorizontal: space.md,
                  paddingVertical: 12,
                  fontFamily: font.mono,
                  fontSize: 13,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Mono size={10} tone="muted">
                ALLOCATED {formatCents(allocated)}
              </Mono>
              <Mono size={10} tone={unallocated < 0 ? 'destructive' : 'muted'}>
                {unallocated < 0
                  ? `OVER-ALLOCATED ${formatCents(Math.abs(unallocated))}`
                  : `UNALLOCATED ${formatCents(unallocated)}`}
              </Mono>
            </View>
          </Card>

          <Card style={{ gap: space.md }}>
            <Eyebrow>Buckets</Eyebrow>
            <Sans size={11} tone="muted">
              Set an amount for any category worth tracking separately. Leave at zero to skip it.
            </Sans>
            <View style={{ gap: space.sm }}>
              {categoryOptions.map(opt => (
                <View
                  key={opt.value}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingLeft: opt.indented ? space.xl : 0,
                  }}>
                  <View style={{ width: 6, height: 6, backgroundColor: opt.swatch }} />
                  <Sans size={12} numberOfLines={1} style={{ flex: 1 }}>
                    {opt.label}
                  </Sans>
                  <TextInput
                    keyboardType="decimal-pad"
                    defaultValue={draft.buckets[opt.value] ? formatCentsBare(draft.buckets[opt.value]) : ''}
                    onChangeText={v => updateBucket(opt.value, v)}
                    placeholder="0.00"
                    placeholderTextColor={c.mutedForeground}
                    style={{
                      width: 90,
                      textAlign: 'right',
                      color: c.foreground,
                      fontFamily: font.mono,
                      fontSize: 13,
                      backgroundColor: c.inputBackground,
                      paddingHorizontal: space.sm,
                      paddingVertical: 8,
                    }}
                  />
                </View>
              ))}
            </View>
          </Card>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            title={saved ? 'Saved' : 'Save Budget'}
            onPress={handleSave}
            variant={saved ? 'success' : 'primary'}
            style={{ flex: 1 }}
          />
          {isExisting ? (
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => ({
                paddingHorizontal: space.lg,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.destructive,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Trash2 size={16} color={c.destructive} />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
