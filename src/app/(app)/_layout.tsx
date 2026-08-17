import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { getOnboardingStatus, getAccountType } from '@/db/api';

// 商家/顧客帳號共用同一張登入表，沒有角色區分：顧客帳號如果直接打開
// 商家後台網址，過去會被放行（RLS 讓他們只看到空資料，不是外洩，但
// 概念上不該讓顧客進到商家管理介面）。這裡擋掉 account_type = 'customer'
// 的帳號，導回顧客自己的「我的預約記錄」。
function useAccountTypeGate() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const type = await getAccountType();
        if (cancelled) return;
        if (type === 'customer') {
          setBlocked(true);
          router.replace('/online-booking/my-orders' as any);
        }
      } catch {
        /* 查詢失敗不擋住正常使用 */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return { checking, blocked };
}

// 首次登入才顯示新手引導：檢查一次 profiles.onboarding_completed，
// 尚未完成且目前不在 onboarding 頁面時才導向過去。
function useOnboardingGate(enabled: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const checked = useRef(false);

  useEffect(() => {
    if (!enabled || checked.current) return;
    checked.current = true;
    (async () => {
      try {
        const completed = await getOnboardingStatus();
        if (!completed && !pathname.includes('/onboarding')) {
          router.replace('/(app)/onboarding' as any);
        }
      } catch { /* 查詢失敗不擋住正常使用 */ }
    })();
  }, [enabled, router, pathname]);
}

export default function AppLayout() {
  const { checking, blocked } = useAccountTypeGate();
  useOnboardingGate(!checking && !blocked);

  if (checking || blocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7' }}>
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="customers" />
      <Stack.Screen name="service-records" />
      <Stack.Screen name="appointments" />
      <Stack.Screen name="packages" />
      <Stack.Screen name="service-templates" />
      <Stack.Screen name="expenses" />
    </Stack>
  );
}
