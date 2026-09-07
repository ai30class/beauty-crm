import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { supabase } from '@/client/supabase';
import { getOnboardingStatus, getAccountType } from '@/db/api';

// 商家/顧客帳號共用同一張登入表，沒有角色區分：顧客帳號如果直接打開
// 商家後台網址，過去會被放行（RLS 讓他們只看到空資料，不是外洩，但
// 概念上不該進到商家管理介面）。這裡擋掉 account_type = 'customer'。
//
// ⚠️ 以前是「靜默 router.replace 到我的預約記錄」，實務上出過大問題：
// 店家自己用同一支手機做過一次顧客預約後，瀏覽器的登入狀態就被換成顧客，
// 之後不管怎麼點後台都會被瞬間彈走、連登入畫面都看不到，店家的感受是
// 「整個後台壞掉、通通進不去」，也沒有任何線索知道要先登出。
// 改成停在這一頁、明講身分並給登出按鈕，不要自動跳走。
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


// 顧客身分誤入商家後台時顯示：講清楚現在是什麼身分、為什麼進不去、
// 怎麼切回商家帳號。最重要的是那顆登出按鈕——沒有它，使用者會被
// 自己的顧客登入狀態鎖在門外，而且完全不知道發生什麼事。
function CustomerBlockedNotice() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.replace('/(auth)/sign-in' as any);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#3d2b32' }}>
          您目前登入的是顧客帳號
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 22, color: '#7a6a70' }}>
          顧客帳號無法進入商家管理後台。
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 22, color: '#7a6a70' }}>
          如果你是店家：這支裝置先前用來做過顧客預約，登入狀態還留在顧客身分。
          請按下方按鈕登出，再用你的商家帳號登入。
        </Text>
        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          style={{ backgroundColor: '#e8789a', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 8, opacity: signingOut ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {signingOut ? '登出中…' : '登出並改用商家帳號登入'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/online-booking/my-orders' as any)}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#e8789a', fontSize: 14, fontWeight: '600' }}>
            我是顧客，前往我的預約記錄
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const { checking, blocked } = useAccountTypeGate();
  useOnboardingGate(!checking && !blocked);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7' }}>
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  if (blocked) return <CustomerBlockedNotice />;

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
