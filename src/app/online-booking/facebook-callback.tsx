import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';

// Facebook 一鍵登入的專屬回呼頁——邏輯跟 google-callback.tsx 完全對稱，
// 理由也一樣：不能共用商家後台的 /auth/callback（那頁登入完一律導去商家
// 後台），顧客用 Facebook 登入完成後要回到「這家店」的線上預約頁，
// ownerId 要跟著 redirectTo 網址一起帶過來、帶回去。
export default function FacebookCallbackScreen() {
  const router = useRouter();
  const { ownerId, returnTo } = useLocalSearchParams<{ ownerId?: string; returnTo?: string }>();
  // 只認白名單裡的回跳目的地（目前只有「查詢我的預約」頁）
  const afterLoginPath = returnTo === 'customer-lookup' ? '/customer-lookup' : `/online-booking?ownerId=${ownerId ?? ''}`;
  const [blockedAsMerchant, setBlockedAsMerchant] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // 這個 Facebook 帳號如果已經是正在營運的商家帳號（擁有 shop_profiles），
        // 絕對不能把它標記成 'customer'——會讓商家自己下次登入後台時被
        // _layout.tsx 的身分守門擋下，要靠人工回 SQL 改 account_type 才能救回來。
        const { data: ownShop } = await supabase
          .from('shop_profiles')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();
        if (ownShop) {
          setBlockedAsMerchant(true);
          return;
        }

        // Facebook OAuth 沒有像 email 註冊那樣可以帶 account_type metadata 的管道，
        // 新建的 profiles 列預設是 'merchant'（見 00038_account_type_separation.sql），
        // 顧客用 Facebook 登入一定要補標記成 'customer'，不然會被當成商家帳號，
        // 點進商家後台會被 _layout.tsx 的身分守門擋下，卡在莫名其妙的畫面。
        await supabase.rpc('mark_self_as_customer'); // profiles 的 account_type 不能由用戶自己 UPDATE（migration 00068），改走 RPC（00072）
      }

      router.replace(afterLoginPath as any);
    })();
  }, [ownerId, afterLoginPath, router]);

  if (blockedAsMerchant) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8 gap-4">
        <StatusBar style="dark" backgroundColor="#fff5f7" />
        <Text className="font-rounded text-lg font-bold text-foreground text-center">
          這個 Facebook 帳號是商家後台帳號
        </Text>
        <Text className="font-rounded text-sm text-muted-foreground text-center leading-6">
          這個 Facebook 帳號已經用來管理商家後台，不能同時當作顧客預約帳號。{'\n'}
          請改用 LINE 一鍵登入、Gmail 一鍵登入、Email 註冊，或其他 Facebook 帳號進行預約。
        </Text>
        <Pressable
          className="bg-primary rounded-2xl px-6 py-3 active:opacity-80 mt-2"
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace(`/online-booking/customer-auth?ownerId=${ownerId ?? ''}` as any);
          }}
        >
          <Text className="font-rounded text-sm text-white font-semibold">登出並改用其他方式登入</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background gap-4">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <ActivityIndicator size="large" color="#e8789a" />
      <Text className="font-rounded text-sm text-muted-foreground">登入中，請稍候…</Text>
    </View>
  );
}
