import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, Pressable } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { Heart, Scissors, CalendarDays } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useSession } from '@/ctx';

// 首頁把信裡的憑證交給設定密碼頁時共用的暫存 key
export const RECOVERY_TOKENS_KEY = 'bcrm_recovery_tokens';

export default function LandingScreen() {
  const router = useRouter();
  const { session } = useSession();

  // 「忘記密碼」信件點進來的人會落在這裡。
  //
  // 從 App 內按忘記密碼寄的信會帶 redirectTo 指向 /auth/callback，但從
  // Supabase 後台按 Send password recovery 寄的信一律用專案的 Site URL，
  // 也就是首頁——token 帶在網址 hash 上。而這個專案的 supabase client 是
  // detectSessionInUrl: false，不會自動處理網址上的 token。
  //
  // 這裡只做一件事：把信裡的憑證搬進 sessionStorage、清掉網址上的 hash、
  // 帶去設定密碼頁。**不要在這裡 setSession**——之前那版在這裡等 setSession
  // 跑完才導頁，實際使用時卡在轉圈圈出不來，使用者以為沒反應就回頭再點一次
  // 信，而 recovery token 是一次性的、第一次已經用掉，第二次反而換不到身分，
  // 掉回原本的登入狀態（實際發生過，見開發筆記三十四）。
  const [handingOver] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

  useEffect(() => {
    if (!handingOver) return;
    try {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        sessionStorage.setItem(RECOVERY_TOKENS_KEY, JSON.stringify({ accessToken, refreshToken }));
      }
      // 清掉網址上的憑證，免得它留在網址列或被再次誤用
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* sessionStorage 不可用時，設定密碼頁會顯示連結失效並引導重新申請 */
    }
    router.replace('/reset-password' as any);

    // 後備：萬一 router 沒把人帶過去（畫面就會停在轉圈圈），2.5 秒後直接用
    // 瀏覽器硬導過去，不要讓使用者對著一個不動的轉圈圈猜發生什麼事。
    const fallback = setTimeout(() => {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('reset-password')) {
        window.location.replace('/reset-password');
      }
    }, 2500);
    return () => clearTimeout(fallback);
  }, [handingOver, router]);

  if (handingOver) {
    return (
      <View className="flex-1 bg-background items-center justify-center gap-3">
        <ActivityIndicator size="large" color="#e8789a" />
        <Text className="font-rounded text-sm text-muted-foreground">正在開啟設定密碼頁…</Text>
      </View>
    );
  }

  // 已登入的店家直接進入管理後台
  if (session) {
    return <Redirect href={'/(app)/home' as any} />;
  }
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {/* Logo */}
      <View className="items-center mb-14">
        <View className="w-24 h-24 rounded-full bg-primary/20 items-center justify-center mb-6">
          <Heart size={44} color="#e8789a" />
        </View>
        <Text className="font-rounded text-3xl font-bold text-foreground mb-2">美業管家</Text>
        <Text className="font-rounded text-base text-muted-foreground text-center leading-6">
          輕鬆管理顧客資料、預約排程{'\n'}讓您的美業生意更有條理
        </Text>
      </View>

      {/* 兩個入口 */}
      <View className="w-full gap-3">
        {/* 顧客：線上預約 */}
        <Pressable
          className="w-full bg-primary rounded-2xl py-4 items-center active:opacity-80 flex-row justify-center gap-2"
          onPress={() => router.push('/online-booking' as any)}
        >
          <CalendarDays size={20} color="#fff" />
          <Text className="font-rounded text-white text-base font-semibold">立即線上預約</Text>
        </Pressable>

        {/* 顧客：查詢預約 */}
        <Pressable
          className="w-full rounded-2xl py-3.5 items-center active:opacity-80 border flex-row justify-center gap-2"
          style={{ borderColor: '#f0b0c8', backgroundColor: '#fff8fa' }}
          onPress={() => router.push('/customer-lookup' as any)}
        >
          <Text className="font-rounded text-sm font-medium" style={{ color: '#e8789a' }}>查詢 / 修改我的預約</Text>
        </Pressable>

        {/* 分隔線 */}
        <View className="flex-row items-center gap-3 my-1">
          <View className="flex-1 h-px bg-border" />
          <Text className="font-rounded text-xs text-muted-foreground">店家入口</Text>
          <View className="flex-1 h-px bg-border" />
        </View>

        {/* 店家：管理後台 */}
        <Pressable
          className="w-full rounded-2xl py-3.5 items-center active:opacity-80 border flex-row justify-center gap-2"
          style={{ borderColor: '#d8c0d8', backgroundColor: '#fdf4ff' }}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Scissors size={16} color="#9b59b6" />
          <Text className="font-rounded text-sm font-medium" style={{ color: '#9b59b6' }}>店家 / 設計師管理後台</Text>
        </Pressable>
      </View>
    </View>
  );
}
