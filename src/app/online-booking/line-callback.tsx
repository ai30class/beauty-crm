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

      let ownerId = '';
      try {
        const decoded = JSON.parse(atob(state));
        const expected = sessionStorage.getItem('line_login_state');
        if (!expected || decoded.r !== expected) { setError('驗證失敗，請重新登入'); return; }
        ownerId = decoded.o ?? '';
        sessionStorage.removeItem('line_login_state');
      } catch {
        setError('驗證失敗，請重新登入');
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
