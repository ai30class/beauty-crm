import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/ctx';
import "../global.css";

// ── PWA：Service Worker 註冊（僅 Web）────────────────────────
function usePWA() {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => { /* SW 註冊失敗不影響主流程 */ });
  }, []);
}

// ── PWA：注入 <head> meta tags（僅 Web）─────────────────────
function usePWAMeta() {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;

    const setMeta = (name: string, content: string, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    const setLink = (rel: string, href: string, extra?: Record<string, string>) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
      if (extra) Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
    };

    // 基本 PWA meta
    setMeta('application-name', '美業管家');
    setMeta('theme-color', '#e8789a');
    setMeta('mobile-web-app-capable', 'yes');
    // iOS 專屬
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'default');
    setMeta('apple-mobile-web-app-title', '美業管家');
    // manifest
    setLink('manifest', '/manifest.json');
    // Apple touch icon
    setLink('apple-touch-icon', '/assets/icon.png', { sizes: '192x192' });
  }, []);
}

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
  usePWA();
  usePWAMeta();

  const [fontsLoaded, fontError] = useFonts({
    'ResourceHanRoundedCN': { uri: 'https://resource-static.cdn.bcebos.com/fonts/ResourceHanRoundedCN-Regular.ttf' },
  });

  if (!fontsLoaded && !fontError) {
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
