import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';

import { SessionProvider, useSession } from '@/ctx';
import "../global.css";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

function RootLayoutNav() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7' }}>
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 公開路由：顧客無需登入可訪問 */}
      <Stack.Screen name="index" />
      <Stack.Screen name="online-booking" />
      <Stack.Screen name="customer-lookup" />
      {/* 未登入才能訪問 auth */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* 已登入才能訪問 app（店家管理後台） */}
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

const RootLayout: React.FC = () => {
  const [fontsLoaded] = useFonts({
    'ResourceHanRoundedCN': { uri: 'https://resource-static.cdn.bcebos.com/fonts/ResourceHanRoundedCN-Regular.ttf' },
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7' }}>
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <RootLayoutNav />
        <PortalHost />
      </SessionProvider>
    </GestureHandlerRootView>
  );
};

export default Sentry.wrap(RootLayout);
