import { Tabs } from 'expo-router';
import { LayoutDashboard, ReceiptText, Settings2, Target } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

export default function TabsLayout() {
  const { c } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        sceneStyle: { backgroundColor: c.background },
        tabBarStyle: {
          backgroundColor: c.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.border,
          // The design has no elevation on the bar; Android adds one by default.
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <LayoutDashboard size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color }) => <ReceiptText size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ color }) => <Target size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings2 size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
