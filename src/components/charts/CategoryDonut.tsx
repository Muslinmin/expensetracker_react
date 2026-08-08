import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

import { Mono, Sans } from '@/components/base';
import { formatCents } from '@/lib/money';
import { space } from '@/theme/tokens';

export interface DonutSlice {
  category: string;
  cents: number;
  color: string;
}

interface Props {
  data: DonutSlice[];
}

/**
 * The scaffold's pie tooltip was hover-driven (recharts <Tooltip>), which has
 * no touch equivalent. A tap on a slice or a legend row selects it instead,
 * and the centre readout persists until the next tap rather than vanishing
 * when a finger lifts — the touch analogue of a hover state.
 */
export function CategoryDonut({ data }: Props) {
  const [selected, setSelected] = useState(0);
  const active = data[selected] ?? data[0];

  const pieData = useMemo(
    () => data.map((d, i) => ({ value: d.cents, color: d.color, focused: i === selected })),
    [data, selected],
  );

  if (data.length === 0) {
    return (
      <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
        <Sans tone="muted" size={12}>
          No spending in this period.
        </Sans>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <View style={{ width: 112, height: 112 }}>
        <PieChart
          data={pieData}
          donut
          radius={56}
          innerRadius={32}
          focusOnPress
          sectionAutoFocus
          onPress={(_item: unknown, index: number) => setSelected(index)}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center', maxWidth: 84 }}>
              <Mono size={13} weight="medium" numberOfLines={1}>
                {formatCents(active.cents)}
              </Mono>
              <Sans size={9} tone="muted" numberOfLines={1} style={{ maxWidth: 80 }}>
                {active.category}
              </Sans>
            </View>
          )}
        />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        {data.map((d, i) => (
          <Pressable
            key={d.category}
            onPress={() => setSelected(i)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View
              style={{
                width: 6,
                height: 6,
                backgroundColor: d.color,
                opacity: i === selected ? 1 : 0.5,
              }}
            />
            <Sans size={11} numberOfLines={1} style={{ flex: 1 }} tone={i === selected ? 'default' : 'muted'}>
              {d.category}
            </Sans>
            <Mono size={11} tone={i === selected ? 'default' : 'muted'}>
              {formatCents(d.cents)}
            </Mono>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
