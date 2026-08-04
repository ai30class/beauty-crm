import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Tag, Plus, ToggleLeft, ToggleRight, Ticket, ChevronRight } from 'lucide-react-native';
import { getCoupons, toggleCouponActive } from '@/db/api';
import type { Coupon } from '@/types/types';

function couponTypeLabel(type: string) {
  if (type === 'discount_pct') return '折扣券';
  if (type === 'discount_amt') return '折抵券';
  return '免費體驗';
}

function couponValueText(c: Coupon) {
  if (c.type === 'discount_pct') return `${c.value}% OFF`;
  if (c.type === 'discount_amt') return `折抵 $${c.value}`;
  return '免費一次';
}

const TYPE_COLORS: Record<string, string> = {
  discount_pct: '#8b9de8',
  discount_amt: '#5dc0a0',
  free_service: '#e8789a',
};

export default function CouponsScreen() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCoupons(await getCoupons()); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggle = async (c: Coupon) => {
    setToggling(c.id);
    try {
      await toggleCouponActive(c.id, !c.is_active);
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
    } finally {
      setToggling(null);
    }
  };

  const active = coupons.filter(c => c.is_active);
  const inactive = coupons.filter(c => !c.is_active);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Tag size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">優惠券管理</Text>
        <Pressable
          className="flex-row items-center gap-1 px-3 py-2 rounded-xl active:opacity-70"
          style={{ backgroundColor: '#fce9f0' }}
          onPress={() => router.push('/(app)/coupons/new' as any)}
        >
          <Plus size={16} color="#e8789a" />
          <Text className="font-rounded text-sm font-semibold" style={{ color: '#e8789a' }}>新增</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#e8789a" /></View>
      ) : coupons.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Ticket size={52} color="#c4a0ae" />
          <Text className="font-rounded text-base text-muted-foreground text-center">
            還沒有優惠券，點右上角「新增」來建立第一張
          </Text>
          <Pressable
            className="bg-primary rounded-2xl px-8 py-3 active:opacity-80"
            onPress={() => router.push('/(app)/coupons/new' as any)}
          >
            <Text className="font-rounded text-white font-semibold">建立優惠券</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-4">
          {/* 發券入口 */}
          <Pressable
            className="flex-row items-center gap-3 bg-card border border-border rounded-2xl px-4 py-4 active:opacity-80"
            onPress={() => router.push('/(app)/coupons/issue' as any)}
          >
            <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
              <Ticket size={20} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base font-semibold text-foreground">發放優惠券給顧客</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">選擇顧客並發送指定優惠券</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>

          {/* 核銷入口 */}
          <Pressable
            className="flex-row items-center gap-3 bg-card border border-border rounded-2xl px-4 py-4 active:opacity-80"
            onPress={() => router.push('/(app)/coupons/redeem' as any)}
          >
            <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#e8f5ef' }}>
              <Tag size={20} color="#5dc0a0" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base font-semibold text-foreground">核銷顧客優惠券</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">查詢顧客持有的券並核銷使用</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>

          {/* 啟用中的券 */}
          {active.length > 0 && (
            <View>
              <Text className="font-rounded text-xs font-semibold text-muted-foreground mb-2 px-1">啟用中（{active.length}）</Text>
              <View className="gap-3">
                {active.map(c => (
                  <CouponCard key={c.id} coupon={c} toggling={toggling === c.id} onToggle={() => handleToggle(c)} />
                ))}
              </View>
            </View>
          )}

          {/* 已停用的券 */}
          {inactive.length > 0 && (
            <View>
              <Text className="font-rounded text-xs font-semibold text-muted-foreground mb-2 px-1">已停用（{inactive.length}）</Text>
              <View className="gap-3 opacity-60">
                {inactive.map(c => (
                  <CouponCard key={c.id} coupon={c} toggling={toggling === c.id} onToggle={() => handleToggle(c)} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function CouponCard({ coupon: c, toggling, onToggle }: { coupon: Coupon; toggling: boolean; onToggle: () => void }) {
  const color = TYPE_COLORS[c.type] ?? '#e8789a';
  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* 色條頂部 */}
      <View style={{ height: 4, backgroundColor: color }} />
      <View className="px-4 py-4 gap-2">
        <View className="flex-row items-start">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '22' }}>
                <Text className="font-rounded text-xs font-semibold" style={{ color }}>{couponTypeLabel(c.type)}</Text>
              </View>
              {c.min_amount > 0 && (
                <Text className="font-rounded text-xs text-muted-foreground">滿 ${c.min_amount} 使用</Text>
              )}
            </View>
            <Text className="font-rounded text-lg font-bold text-foreground">{c.name}</Text>
            <Text className="font-rounded text-2xl font-bold" style={{ color }}>{couponValueText(c)}</Text>
          </View>
          {/* 開關 */}
          <Pressable onPress={onToggle} disabled={toggling} className="active:opacity-70 mt-1">
            {toggling
              ? <ActivityIndicator size="small" color={color} />
              : c.is_active
                ? <ToggleRight size={28} color={color} />
                : <ToggleLeft size={28} color="#c4a0ae" />}
          </Pressable>
        </View>
        <View className="flex-row gap-4 pt-1 border-t border-border">
          <Text className="font-rounded text-xs text-muted-foreground">
            有效期 {c.valid_days} 天
          </Text>
          <Text className="font-rounded text-xs text-muted-foreground">
            已發行 {c.issued}{c.quota != null ? `/${c.quota}` : ''} 張
          </Text>
          {c.note ? (
            <Text className="font-rounded text-xs text-muted-foreground flex-1" numberOfLines={1}>{c.note}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
