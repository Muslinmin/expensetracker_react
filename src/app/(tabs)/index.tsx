import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, Sans } from '@/components/base';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function DashboardScreen() {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: space.lg, gap: space.xs }}>
        <Eyebrow>Dashboard</Eyebrow>
        <Sans size={20} weight="semibold">Dashboard</Sans>
      </View>
    </SafeAreaView>
  );
}
