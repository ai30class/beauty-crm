import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { acceptMerchantTerms } from '@/db/api';
import { MerchantTermsContent } from '@/components/MerchantTermsContent';

// 補問關卡：涵蓋沒經過 sign-in.tsx 註冊勾選框的路徑（Google 一鍵註冊、
// 或條款版本更新後的既有商家）。見 (app)/_layout.tsx 的 useTermsGate。
export default function AcceptTermsScreen() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const handleAccept = async () => {
    if (!agreed) { setError('請先閱讀並勾選同意'); return; }
    setError('');
    setSaving(true);
    try {
      await acceptMerchantTerms();
      router.replace('/(app)/home' as any);
    } catch (e: any) {
      setError(e.message ?? '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

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
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="px-5 pt-14 pb-4 border-b border-border">
        <Text className="font-rounded text-xl font-bold text-foreground">商家服務條款</Text>
        <Text className="font-rounded text-sm text-muted-foreground mt-1">
          條款內容有更新，請閱讀後同意才能繼續使用後台
        </Text>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 py-6 pb-16">
        <MerchantTermsContent />
      </ScrollView>

      <View className="px-5 pt-3 pb-8 border-t border-border bg-background gap-3">
        <Pressable className="flex-row items-start" onPress={() => setAgreed(v => !v)}>
          <View className={`w-5 h-5 rounded-md border-2 mr-2 mt-0.5 items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}>
            {agreed && <Text className="text-white text-xs font-bold">✓</Text>}
          </View>
          <Text className="font-rounded text-sm text-muted-foreground flex-1">我已閱讀並同意上述商家服務條款</Text>
        </Pressable>

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80"
          style={{ height: 52 }}
          onPress={handleAccept}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-rounded text-white text-base font-semibold">同意並繼續</Text>}
        </Pressable>

        <Pressable className="items-center py-1 active:opacity-70" onPress={handleSignOut} disabled={signingOut}>
          <Text className="font-rounded text-sm text-muted-foreground">
            {signingOut ? '登出中…' : '暫不同意，先登出'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
