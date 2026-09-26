import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Link2, UserCheck, UserX } from 'lucide-react-native';
import { resolveCustomerLinkRequest } from '@/db/api';
import type { CustomerLinkRequest } from '@/db/api';

// 顧客用 LINE 預約時，填的電話對到一份還沒連結 LINE 的舊顧客檔（00115）：
// 系統先不連結，由店家左右對照後按「是本人」或「不是本人」。
// 「線上預約訂單」與「顧客資料」兩頁共用這張卡片；只有店家本人拿得到待確認資料（員工看不到）。

const fmtDate = (d: string | null) => (d ? d.replace(/-/g, '/') : '—');

export default function CustomerLinkCard({
  request,
  onResolved,
}: {
  request: CustomerLinkRequest;
  onResolved: () => void;
}) {
  // 按下去之前多問一次：是本人會把這份顧客檔連給這個 LINE 帳號，之後她看得到套票
  const [confirming, setConfirming] = useState<null | 'self' | 'not_self'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const handle = async (isSelf: boolean) => {
    setBusy(true);
    setError('');
    try {
      const msg = await resolveCustomerLinkRequest(request.id, isSelf);
      setDone(msg);
      setConfirming(null);
      // 讓店家看一下結果再重新整理（重新整理後這張卡片就不見了）
      setTimeout(onResolved, 1500);
    } catch (e: any) {
      setError(e?.message ?? '處理失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#e6f5ef' }}>
        <Text className="font-rounded text-sm" style={{ color: '#2ea87e' }}>✓ {done}</Text>
      </View>
    );
  }

  return (
    <View className="rounded-2xl p-3 gap-3" style={{ backgroundColor: '#fff8ee', borderWidth: 1, borderColor: '#f5d9a8' }}>
      <View className="flex-row items-center gap-2">
        <Link2 size={15} color="#c98a1a" />
        <Text className="font-rounded text-sm font-semibold flex-1" style={{ color: '#9a6a12' }}>
          有 LINE 帳號想連結這位顧客，是本人嗎？
        </Text>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1 bg-card rounded-xl px-3 py-2 gap-0.5">
          <Text className="font-rounded text-muted-foreground" style={{ fontSize: 11 }}>預約時填的（LINE 帳號）</Text>
          <View className="flex-row items-center gap-1.5">
            {request.line_picture_url ? (
              <Image source={{ uri: request.line_picture_url }} style={{ width: 20, height: 20, borderRadius: 10 }} contentFit="cover" />
            ) : null}
            <Text className="font-rounded text-xs text-foreground flex-1" numberOfLines={1}>
              LINE：{request.line_display_name ?? '（沒有 LINE 名稱）'}
            </Text>
          </View>
          <Text className="font-rounded text-xs text-foreground">姓名：{request.requested_name}</Text>
          <Text className="font-rounded text-xs text-foreground">生日：{fmtDate(request.requested_birthday)}</Text>
        </View>
        <View className="flex-1 bg-card rounded-xl px-3 py-2 gap-0.5">
          <Text className="font-rounded text-muted-foreground" style={{ fontSize: 11 }}>店裡的顧客資料</Text>
          <Text className="font-rounded text-xs text-foreground">姓名：{request.customer_name}</Text>
          <Text className="font-rounded text-xs text-foreground">生日：{fmtDate(request.customer_birthday)}</Text>
          <Text className="font-rounded text-xs text-foreground">
            上次來店：{fmtDate(request.last_visit_date)}{request.visit_count > 0 ? `（共 ${request.visit_count} 次）` : ''}
          </Text>
        </View>
      </View>

      {confirming ? (
        <View className="gap-2">
          <Text className="font-rounded text-xs text-foreground">
            {confirming === 'self'
              ? `確定是「${request.customer_name}」本人？連結後她用這個 LINE 登入就看得到自己的套票，下次預約會直接被認得。`
              : '確定不是本人？這筆預約會照常保留；之後這個 LINE 帳號再用這支電話預約，會改成需要付訂金，也不會再問你。'}
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              className="flex-1 h-10 rounded-xl border border-border items-center justify-center active:opacity-70"
              disabled={busy}
              onPress={() => setConfirming(null)}
            >
              <Text className="font-rounded text-sm text-muted-foreground">先不要</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-10 rounded-xl items-center justify-center active:opacity-80"
              style={{ backgroundColor: confirming === 'self' ? '#e8789a' : '#8a7f7a' }}
              disabled={busy}
              onPress={() => handle(confirming === 'self')}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text className="font-rounded text-sm font-semibold text-white">
                  {confirming === 'self' ? '確定是本人' : '確定不是本人'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Pressable
            className="flex-1 h-10 rounded-xl flex-row items-center justify-center gap-1.5 active:opacity-80"
            style={{ backgroundColor: '#e8789a' }}
            onPress={() => { setError(''); setConfirming('self'); }}
          >
            <UserCheck size={15} color="#fff" />
            <Text className="font-rounded text-sm font-semibold text-white">是本人，連結</Text>
          </Pressable>
          <Pressable
            className="flex-1 h-10 rounded-xl flex-row items-center justify-center gap-1.5 bg-card border border-border active:opacity-70"
            onPress={() => { setError(''); setConfirming('not_self'); }}
          >
            <UserX size={15} color="#8a7f7a" />
            <Text className="font-rounded text-sm text-foreground">不是本人</Text>
          </Pressable>
        </View>
      )}

      {error ? (
        <Text className="font-rounded text-xs" style={{ color: '#e85454' }}>{error}</Text>
      ) : (
        <Text className="font-rounded text-muted-foreground" style={{ fontSize: 11 }}>
          認不出來的話可以先不按，等她到店看到本人再確認；不按也不影響這筆預約。
        </Text>
      )}
    </View>
  );
}
