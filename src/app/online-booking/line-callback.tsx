import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export default function LineCallbackScreen() {
  const router = useRouter();
  const { code, state, error: lineError } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (lineError) { setError('已取消 LINE 登入'); return; }
      if (!code || !state) { setError('連結不完整，請重新登入'); return; }

      // 不能靠 sessionStorage 存的暫存值來核對 state——LINE 常常會把授權流程整個
      // 交給 LINE App 自己的內建瀏覽器處理，跳回來時已經不是原本按登入那個
      // Safari 分頁了，兩邊的 sessionStorage 互相讀不到。state 只用來夾帶
      // ownerId，不是不能少的安全機制（真正驗證身份的是後面用 code 換 token
      // 這一步，一定要有 LINE 的 Channel Secret 才換得到）。
      let ownerId = '';
      try {
        const decoded = JSON.parse(atob(state));
        ownerId = decoded.o ?? '';
      } catch {
        setError('連結格式錯誤，請重新登入');
        return;
      }

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/line-login/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
          body: JSON.stringify({
            code,
            redirect_uri: `${window.location.origin}/online-booking/line-callback`,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'LINE 登入失敗');

        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: json.token_hash,
          type: 'magiclink',
        });
        if (otpErr) throw otpErr;

        router.replace(`/online-booking?ownerId=${ownerId}` as any);
      } catch (e: any) {
        setError(e.message ?? 'LINE 登入失敗，請稍後再試');
      }
    })();
  }, [code, state, lineError]);

  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {error ? (
        <View className="items-center gap-4">
          <Text className="font-rounded text-base text-destructive text-center">{error}</Text>
          <Pressable
            className="bg-primary rounded-2xl px-6 h-12 items-center justify-center active:opacity-80"
            onPress={() => router.replace('/online-booking' as any)}
          >
            <Text className="font-rounded text-sm text-white font-semibold">重新登入</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center gap-3">
          <ActivityIndicator size="large" color="#e8789a" />
          <Text className="font-rounded text-sm text-muted-foreground">登入中，請稍候…</Text>
        </View>
      )}
    </View>
  );
}
