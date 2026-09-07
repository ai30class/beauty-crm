import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, Pressable } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { Heart, Scissors, CalendarDays } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';

export default function LandingScreen() {
  const router = useRouter();
  const { session } = useSession();

  // 「忘記密碼」信件點進來的人會落在這裡。
  //
  // 從 App 內按忘記密碼寄的信會帶 redirectTo 指向 /auth/callback，但從
  // Supabase 後台按 Send password recovery 寄的信一律用專案的 Site URL，
  // 也就是首頁——token 帶在網址 hash 上。而這個專案的 supabase client 是
  // detectSessionInUrl: false，不會自動處理網址上的 token，所以那段 hash
  // 會被整個忽略：本來就還留著登入狀態的人被直接丟進後台，沒登入的人則
  // 停在首頁，兩種情況都找不到可以設定新密碼的地方（實際發生過）。
  // 這裡認出 type=recovery，用信裡的 token 換好 session 再帶去設定密碼頁。
  const [handlingRecovery, setHandlingRecovery] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('type=recovery'),
  );

  useEffect(() => {
    if (!handlingRecovery) return;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        router.replace('/(auth)/reset-password' as any);
      } catch {
        // 換 session 失敗就讓他停在首頁，不要卡在轉圈圈
        setHandlingRecovery(false);
      }
    })();
  }, [handlingRecovery, router]);

  if (handlingRecovery) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
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
