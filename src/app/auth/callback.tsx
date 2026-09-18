import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/client/supabase';
import { isFreshlyCreatedAuthUser } from '@/db/api';

// 認證回呼頁面：Google OAuth 登入、以及「忘記密碼」信件點進來都會到這裡。
// expo-web-browser 會攔截並關閉瀏覽器，走 Google 登入時此頁通常不會真正顯示。
export default function AuthCallback() {
  const router = useRouter();
  const [blockedNewSignup, setBlockedNewSignup] = useState(false);

  useEffect(() => {
    (async () => {
      // Web：登入完成後 Google/Supabase 會整頁導回這裡，token 帶在網址 hash 上
      // （detectSessionInUrl 關閉了，因為原生 App 走的是彈出瀏覽器 + deep link，不需要它）
      if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined' && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
        // 從「忘記密碼」信點進來的，hash 會帶 type=recovery；員工帳號的邀請信
        // （inviteUserByEmail）帶的是 type=invite——兩種都還沒有密碼／要換密碼，
        // 目的都不是直接進後台。少判斷 invite 的話，被邀請的員工會直接帶著
        // session 掉進商家首頁，但從頭到尾沒有機會設密碼，下次登入不出來。
        if (params.get('type') === 'recovery' || params.get('type') === 'invite') {
          // ⚠️ 是 '/reset-password'，不是 '/(auth)/reset-password'：這頁必須放在
          // 公開路由，因為 (auth) 的 guard 是 !session，而走到這裡的人一定已經
          // 有 recovery session。改動這個路徑前先看開發筆記三十四節。
          router.replace('/reset-password' as any);
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // 商家後台關掉自助註冊了，Google 登入不能是「順便自動註冊」的後門——
        // 這個帳號如果是這次 OAuth 才剛自動建立的全新使用者，代表繞過了審核，
        // 立刻登出並停在這頁講清楚，不放行進商家後台（跟 sign-in.tsx 原生
        // App 那條路徑用同一個判斷函式，網頁版走到這裡處理）。
        if (await isFreshlyCreatedAuthUser()) {
          await supabase.auth.signOut();
          setBlockedNewSignup(true);
          return;
        }
        router.replace('/(app)/home' as any);
      } else {
        router.replace('/(auth)/sign-in' as any);
      }
    })();
  }, []);

  if (blockedNewSignup) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8 gap-4">
        <Text className="font-rounded text-lg font-bold text-foreground text-center">
          目前商家帳號採邀請制
        </Text>
        <Text className="font-rounded text-sm text-muted-foreground text-center leading-6">
          這個 Google 帳號還沒有對應的商家帳號。{'\n'}
          請先填寫申請表單，我們審核後會協助你開通帳號。
        </Text>
        <Pressable
          className="bg-primary rounded-2xl px-6 py-3 active:opacity-80 mt-2"
          onPress={() => router.replace('/join-request' as any)}
        >
          <Text className="font-rounded text-sm text-white font-semibold">前往申請表單</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color="#e8789a" />
    </View>
  );
}
