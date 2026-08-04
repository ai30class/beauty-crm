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
