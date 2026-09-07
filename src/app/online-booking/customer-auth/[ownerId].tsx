import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

// LIFF 連結用「路徑」帶 ownerId（例：liff.line.me/<liffId>/<ownerId>），
// 不是查詢字串（?ownerId=...）——實測發現 LIFF 轉跳到 Endpoint URL 時，
// 查詢字串常常沒有被正確帶過來，但路徑帶的部分比較底層、應該比較可靠。
// 這個畫面唯一的工作：把路徑上的 ownerId 轉成查詢字串，導去原本的
// customer-auth.tsx（用我們自己的 router 導頁，同源導頁向來穩定可靠）。
export default function CustomerAuthOwnerIdPathRedirect() {
  const router = useRouter();
  const { ownerId } = useLocalSearchParams<{ ownerId?: string }>();

  useEffect(() => {
    router.replace(`/online-booking/customer-auth?ownerId=${ownerId ?? ''}` as any);
  }, [ownerId]);

  return <View />;
}
