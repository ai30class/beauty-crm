import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/client/supabase';

// Google OAuth 回呼頁面
// expo-web-browser 會攔截並關閉瀏覽器，此頁通常不會真正顯示
export default function AuthCallback() {
  const router = useRouter();

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
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/(app)/home' as any);
      } else {
        router.replace('/(auth)/sign-in' as any);
      }
    })();
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color="#e8789a" />
    </View>
  );
}
