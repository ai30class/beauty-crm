import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';

import { SessionProvider, useSession } from '@/ctx';
import "../global.css";

// ── PWA：Service Worker 註冊＋自動更新（僅 Web）──────────────
//
// ⚠️ 這段的存在理由：Service Worker 會讓使用者裝置沿用舊版程式，而
// 「請你清快取」對真實使用者（店家、顧客）是不可行的要求——2026-09-08
// 就因為這個，新增的路由在舊程式包裡不存在，使用者點信只看到
// "Unmatched Route"，前後折騰了好幾輪。
//
// 所以這裡讓更新自己發生：偵測到新版 Service Worker 接手後，自動重新
// 載入一次頁面。使用者不需要做任何事，也不需要知道有這回事。
const RELOADED_FLAG = 'bcrm_sw_reloaded';

function usePWA() {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (cancelled) return;
        // 每次開啟頁面都主動問一次有沒有新版
        reg.update().catch(() => { /* 檢查失敗就算了，不影響使用 */ });

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // 只有在「本來就已經被舊版 SW 控制」的情況才需要重載；
            // 第一次安裝（controller 是 null）不用重載，避免多跳一次。
            if (installing.state === 'activated' && navigator.serviceWorker.controller) {
              reloadOnce();
            }
          });
        });
      })
      .catch(() => { /* SW 註冊失敗不影響主流程 */ });

    // 舊版 SW 被新版取代、控制權轉移時也重載一次
    const onControllerChange = () => reloadOnce();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}

// 保險：整個分頁只自動重載一次，避免任何情況下變成無限重整
function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOADED_FLAG)) return;
    sessionStorage.setItem(RELOADED_FLAG, '1');
  } catch {
    // sessionStorage 不可用（私密瀏覽等）就直接放棄自動重載，
    // 寧可讓使用者看到舊版，也不要冒無限重整的風險
    return;
  }
  window.location.reload();
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
      {/* 設定新密碼：⚠️ 一定要放在這裡，不能放進 (auth)。
          (auth) 有 guard={!session}，只有「未登入」才進得去；而重設密碼的
          前提本來就是「點信之後已經拿到 recovery session」＝已登入，
          放進 (auth) 會讓這頁在唯一會用到它的情境下直接不存在
          （實際發生過：點信後畫面一直轉圈圈出不來）。 */}
      <Stack.Screen name="reset-password" />
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
