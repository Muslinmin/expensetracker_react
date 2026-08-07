import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Sans } from '@/components/base';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function Screen() {
  const { c } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: space.lg }}>
        <Sans>Coming in a later phase.</Sans>
      </View>
    </SafeAreaView>
  );
}
