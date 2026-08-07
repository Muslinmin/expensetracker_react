import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, Sans } from '@/components/base';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function BudgetScreen() {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: space.lg, gap: space.xs }}>
        <Eyebrow>Budget</Eyebrow>
        <Sans size={20} weight="semibold">Budget</Sans>
      </View>
    </SafeAreaView>
  );
}
