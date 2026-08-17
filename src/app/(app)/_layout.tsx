import { useEffect, useRef } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { getOnboardingStatus } from '@/db/api';

// 首次登入才顯示新手引導：檢查一次 profiles.onboarding_completed，
// 尚未完成且目前不在 onboarding 頁面時才導向過去。
function useOnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    (async () => {
      try {
        const completed = await getOnboardingStatus();
        if (!completed && !pathname.includes('/onboarding')) {
          router.replace('/(app)/onboarding' as any);
        }
      } catch { /* 查詢失敗不擋住正常使用 */ }
    })();
  }, [router, pathname]);
}

export default function AppLayout() {
  useOnboardingGate();
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
