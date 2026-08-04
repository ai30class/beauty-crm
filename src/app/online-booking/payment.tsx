import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, ActivityIndicator, Linking, ScrollView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CheckCircle, XCircle, ArrowLeft, ExternalLink, Clock3 } from 'lucide-react-native';
import { fetch } from 'expo/fetch';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type PayStatus = 'waiting' | 'paid' | 'cancelled' | 'failed';

interface OrderInfo {
  status: string;
  service_name: string;
  customer_name: string;
  deposit_amount: number;
  total_amount: number;
  appointment_time: string;
}

export default function PaymentScreen() {
  const router = useRouter();
  const { orderId, paymentUrl } = useLocalSearchParams<{ orderId: string; paymentUrl: string }>();

  const [payStatus, setPayStatus] = useState<PayStatus>('waiting');
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const decodedUrl = paymentUrl ? decodeURIComponent(paymentUrl) : '';

  const pollStatus = async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/line-pay/status?orderId=${orderId}`, {
        headers: { 'apikey': ANON_KEY },
      });
      if (!res.ok) return;
      const data = await res.json() as OrderInfo;
      setOrderInfo(data);
      if (data.status === 'paid' || data.status === 'confirmed') {
        setPayStatus('paid');
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (data.status === 'cancelled') {
        setPayStatus('cancelled');
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    pollStatus();
    pollRef.current = setInterval(pollStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const handleOpenLinePay = () => {
    if (decodedUrl) Linking.openURL(decodedUrl);
  };

  const apptDisplay = orderInfo?.appointment_time
    ? (() => {
        const d = new Date(orderInfo.appointment_time);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      })()
    : '';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground">付款訂金</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-24 items-center gap-6">

        {/* 狀態圖示 */}
        <View className="items-center gap-3 py-6">
          {payStatus === 'waiting' && (
            <>
              <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
                <Clock3 size={40} color="#e8789a" />
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground">等待付款</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                請點擊下方按鈕前往 LINE Pay 完成 50% 訂金付款
              </Text>
              <View className="flex-row items-center gap-1.5 mt-1">
                <ActivityIndicator size="small" color="#e8789a" />
                <Text className="font-rounded text-xs text-muted-foreground">等待付款確認中…</Text>
              </View>
            </>
          )}
          {payStatus === 'paid' && (
            <>
              <View className="w-20 h-20 rounded-full bg-secondary items-center justify-center">
                <CheckCircle size={40} color="#5dc0a0" />
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground">預約成功！</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                訂金已付款，我們會盡快與您確認預約
              </Text>
            </>
          )}
          {payStatus === 'cancelled' && (
            <>
              <View className="w-20 h-20 rounded-full bg-muted items-center justify-center">
                <XCircle size={40} color="#c4a0ae" />
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground">付款已取消</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                您已取消付款，如需重新預約請回到上一頁
              </Text>
            </>
          )}
        </View>

        {/* 訂單摘要 */}
        {orderInfo && (
          <View className="bg-card rounded-2xl p-4 border border-border w-full gap-2">
            <Text className="font-rounded text-sm font-semibold text-foreground mb-1">訂單詳情</Text>
            <OrderRow label="訂單編號" value={orderId ?? ''} />
            <OrderRow label="服務項目" value={orderInfo.service_name} />
            <OrderRow label="顧客姓名" value={orderInfo.customer_name} />
            <OrderRow label="預約時間" value={apptDisplay} />
            <View className="border-t border-border pt-2 mt-1 gap-1.5">
              <OrderRow label="服務費用" value={`$${Number(orderInfo.total_amount).toLocaleString()}`} />
              <OrderRow label="訂金（50%）" value={`$${Number(orderInfo.deposit_amount).toLocaleString()}`} highlight />
              <OrderRow label="尾款到場付" value={`$${(Number(orderInfo.total_amount) - Number(orderInfo.deposit_amount)).toLocaleString()}`} />
            </View>
          </View>
        )}

        {/* 操作按鈕 */}
        {payStatus === 'waiting' && decodedUrl && (
          <Pressable
            className="w-full h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-80"
            style={{ backgroundColor: '#06C755' }}
            onPress={handleOpenLinePay}
          >
            <ExternalLink size={18} color="#fff" />
            <Text className="font-rounded text-base text-white font-semibold">前往 LINE Pay 付款</Text>
          </Pressable>
        )}

        {(payStatus === 'paid' || payStatus === 'cancelled') && (
          <Pressable
            className="w-full h-14 bg-primary rounded-2xl items-center justify-center active:opacity-80"
            onPress={() => router.replace(payStatus === 'paid' ? '/' : '/online-booking' as any)}
          >
            <Text className="font-rounded text-base text-white font-semibold">
              {payStatus === 'paid' ? '回到首頁' : '重新預約'}
            </Text>
          </Pressable>
        )}

        {payStatus === 'waiting' && (
          <Text className="font-rounded text-xs text-muted-foreground text-center">
            完成 LINE Pay 付款後，此頁面將自動更新
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function OrderRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-rounded text-sm text-muted-foreground">{label}</Text>
      <Text
        className="font-rounded text-sm font-semibold flex-1 text-right ml-4"
        style={{ color: highlight ? '#e8789a' : '#333' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
