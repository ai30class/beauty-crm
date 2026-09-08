import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MessageCircle, ArrowLeft, ExternalLink } from 'lucide-react-native';
import { getOnlineOrderById, getShopProfileByOwner } from '@/db/api';
import type { OnlineOrder } from '@/types/types';

export default function DepositTransferScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<OnlineOrder | null>(null);
  const [lineOaId, setLineOaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!orderId) { setLoading(false); return; }
      try {
        const o = await getOnlineOrderById(orderId);
        setOrder(o);
        if (o) {
          const profile = await getShopProfileByOwner(o.owner_id).catch(() => null);
          setLineOaId(profile?.line_oa_id ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const apptDisplay = order?.appointment_time
    ? (() => {
        const d = new Date(order.appointment_time);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      })()
    : '';

  const handleOpenLine = () => {
    if (!lineOaId) return;
    const id = lineOaId.startsWith('@') ? lineOaId.slice(1) : lineOaId;
    Linking.openURL(`https://line.me/R/ti/p/@${id}`);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.replace('/')}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground">預約已送出</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-24 items-center gap-6">
        <View className="items-center gap-3 py-6">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
            <MessageCircle size={40} color="#e8789a" />
          </View>
          <Text className="font-rounded text-xl font-bold text-foreground">請私訊我們確認付款</Text>
          <Text className="font-rounded text-sm text-muted-foreground text-center px-4">
            這項服務需要先支付訂金，為了保護您的付款安全，請透過 LINE 私訊與我們確認匯款帳號
          </Text>
        </View>

        {order && (
          <View className="bg-card rounded-2xl p-4 border border-border w-full gap-2">
            <Text className="font-rounded text-sm font-semibold text-foreground mb-1">訂單詳情</Text>
            <OrderRow label="服務項目" value={order.service_name} />
            <OrderRow label="顧客姓名" value={order.customer_name} />
            <OrderRow label="預約時間" value={apptDisplay} />
            <View className="border-t border-border pt-2 mt-1 gap-1.5">
              <OrderRow label="服務費用" value={`$${Number(order.total_amount).toLocaleString()}`} />
              <OrderRow label="需付訂金" value={`$${Number(order.deposit_amount).toLocaleString()}`} highlight />
              <OrderRow label="尾款到場付" value={`$${(Number(order.total_amount) - Number(order.deposit_amount)).toLocaleString()}`} />
            </View>
          </View>
        )}

        {lineOaId ? (
          <Pressable
            className="w-full h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-80"
            style={{ backgroundColor: '#06C755' }}
            onPress={handleOpenLine}
          >
            <ExternalLink size={18} color="#fff" />
            <Text className="font-rounded text-base text-white font-semibold">私訊 LINE 官方帳號</Text>
          </Pressable>
        ) : (
          <Text className="font-rounded text-sm text-muted-foreground text-center">
            請直接透過店家提供的聯絡方式確認付款
          </Text>
        )}

        <Text className="font-rounded text-xs text-muted-foreground text-center">
          您的預約時段已先為您保留，我們確認收到訂金後會盡快回覆您
        </Text>

        <Pressable
          className="w-full h-12 rounded-2xl items-center justify-center active:opacity-80"
          onPress={() => router.replace('/')}
        >
          <Text className="font-rounded text-sm font-medium text-muted-foreground">回到首頁</Text>
        </Pressable>
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
