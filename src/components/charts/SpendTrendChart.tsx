import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { Mono, Sans } from '@/components/base';
import { centsToDollars, formatCents } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export interface TrendPoint {
  label: string;
  cents: number;
}

interface Props {
  data: TrendPoint[];
  color: string;
}

interface PointerItem {
  value: number;
  label?: string;
}

const CHART_HEIGHT = 150;

/** Rounds up to a "nice" axis ceiling (1/2/2.5/5/10 × a power of ten) so gridlines land on round numbers. */
function niceAxisMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

/**
 * Uses the library's own internal horizontal scroll rather than a
 * hand-rolled one: gifted-charts renders the y-axis outside its ScrollView
 * and only the plotted line/x-axis-labels inside it, so the y-axis stays
 * fixed in place as you scroll through months — that behaviour is lost the
 * moment you wrap the whole chart (axis included) in an external ScrollView.
 *
 * The pointer activates on long-press rather than instant touch: an instant
 * activation claims the touch responder on press-down, before a plain drag
 * can be interpreted as a scroll, so a normal swipe never reaches the
 * ScrollView. Long-press-then-drag to inspect, plain-drag to scroll, is the
 * standard resolution for a chart that needs to support both gestures.
 */
export function SpendTrendChart({ data, color }: Props) {
  const { c } = useTheme();

  if (data.every(d => d.cents === 0)) {
    return (
      <View style={{ height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Sans tone="muted" size={12}>
          No spending in this range.
        </Sans>
      </View>
    );
  }

  const lineData = data.map(d => ({ value: centsToDollars(d.cents), label: d.label }));

  // gifted-charts doesn't leave headroom above the highest point by default,
  // so a point at or near the computed max plots right at (or past) the top
  // of the chart. Pad 15% and round to a clean ceiling.
  const maxDollars = Math.max(...lineData.map(d => d.value), 0);
  const axisMax = niceAxisMax(maxDollars * 1.15);

  return (
    <LineChart
      data={lineData}
      height={CHART_HEIGHT}
      color={color}
      thickness={2}
      dataPointsColor={color}
      dataPointsRadius={3}
      startFillColor={color}
      startOpacity={0.16}
      endOpacity={0}
      areaChart
      curved
      hideRules
      maxValue={axisMax}
      noOfSections={4}
      yAxisTextStyle={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'DMMono_400Regular' }}
      xAxisLabelTextStyle={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'DMMono_400Regular' }}
      xAxisColor={c.border}
      yAxisColor={c.border}
      yAxisLabelPrefix="$"
      initialSpacing={16}
      endSpacing={24}
      spacing={56}
      nestedScrollEnabled
      showScrollIndicator
      pointerConfig={{
        activatePointersOnLongPress: true,
        persistPointer: true,
        showPointerStrip: true,
        pointerStripColor: c.border,
        pointerColor: color,
        radius: 5,
        pointerLabelWidth: 96,
        pointerLabelHeight: 44,
        autoAdjustPointerLabelPosition: true,
        pointerLabelComponent: (items: PointerItem[]) => {
          const item = items[0];
          if (!item) return null;
          return (
            <View
              style={{
                backgroundColor: c.popover,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: space.sm,
                paddingVertical: 6,
                alignItems: 'center',
              }}>
              <Mono size={11} weight="medium">
                {formatCents(Math.round(item.value * 100))}
              </Mono>
              {item.label ? (
                <Sans size={9} tone="muted">
                  {item.label}
                </Sans>
              ) : null}
            </View>
          );
        },
      }}
    />
  );
}
