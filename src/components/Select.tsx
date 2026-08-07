import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { Eyebrow, Sans } from './base';

export interface SelectOption {
  value: string;
  label: string;
  /** Colour swatch shown before the label, e.g. a category colour. */
  swatch?: string;
  /** Indent one level — used for carved child categories. */
  indented?: boolean;
  /**
   * A stem category holds no transactions itself. It stays selectable (we
   * expand it to its children when querying) but is labelled so the user
   * understands they're picking a group.
   */
  hint?: string;
}

interface Props {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  style?: object;
}

/**
 * A modal picker rather than an absolutely-positioned dropdown. The scaffold's
 * dropdowns were `absolute` panels that never closed on outside click; on
 * mobile a sheet is both the platform convention and immune to that class of
 * bug — dismissal is handled by the Modal itself.
 */
export function Select({ label, value, options, onChange, style }: Props) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={[{ flex: 1, gap: 6 }, style]}>
      <Eyebrow>{label}</Eyebrow>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          backgroundColor: c.inputBackground,
          paddingHorizontal: space.md,
          paddingVertical: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: pressed ? c.primary : 'transparent',
        })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
          {selected?.swatch ? (
            <View style={{ width: 8, height: 8, backgroundColor: selected.swatch }} />
          ) : null}
          <Sans numberOfLines={1} style={{ flex: 1 }}>
            {selected?.label ?? value}
          </Sans>
        </View>
        <ChevronDown size={14} color={c.mutedForeground} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          {/* Stop propagation so taps inside the sheet don't dismiss it. */}
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              backgroundColor: c.popover,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.border,
              maxHeight: '70%',
              paddingBottom: space.xl,
            }}>
            <View style={{ padding: space.lg, paddingBottom: space.sm }}>
              <Eyebrow>{label}</Eyebrow>
            </View>
            <FlatList
              data={options}
              keyExtractor={o => o.value}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: 14,
                      paddingHorizontal: space.lg,
                      paddingLeft: item.indented ? space.xxl : space.lg,
                      backgroundColor: pressed ? c.secondary : 'transparent',
                    })}>
                    {item.swatch ? (
                      <View style={{ width: 8, height: 8, backgroundColor: item.swatch }} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Sans tone={active ? 'primary' : 'default'} numberOfLines={1}>
                        {item.label}
                      </Sans>
                      {item.hint ? (
                        <Sans size={11} tone="muted">
                          {item.hint}
                        </Sans>
                      ) : null}
                    </View>
                    {active ? <Check size={16} color={c.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
