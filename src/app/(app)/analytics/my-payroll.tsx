import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Wallet, ChevronLeft, ChevronRight, Lock } from 'lucide-react-native';
import { getMyPayrollMonth } from '@/db/api';
import type { MyPayrollMonth } from '@/db/api';

// 員工帳號「我的抽成與月薪」：只看自己的（唯讀）。
// 已結算（商家按過「產生本月薪資」）的月份顯示結算金額；還沒結算的月份用跟商家預覽相同的算法估算，實際以結算為準。

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-row items-start justify-between py-2.5">
      <View className="flex-1 pr-3">
        <Text className="font-rounded text-sm text-foreground">{label}</Text>
        {sub ? <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{sub}</Text> : null}
      </View>
      <Text className="font-rounded text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}

export default function MyPayrollScreen() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MyPayrollMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError('');
    try {
      setData(await getMyPayrollMonth(y, m));
    } catch (e: any) {
      setData(null);
      setError(e?.message ?? '載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [load, year, month]));

  const go = (delta: number) => {
    const idx = year * 12 + (month - 1) + delta;
    setYear(Math.floor(idx / 12));
    setMonth((idx % 12) + 1);
  };

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/staff-schedule' as any))}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Wallet size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">我的抽成與月薪</Text>
      </View>

      <View className="flex-row items-center justify-between mx-5 mb-4 bg-card border border-border rounded-2xl px-4 py-3">
        <Pressable onPress={() => go(-1)} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-lg font-bold text-foreground">{year}年 {MONTH_NAMES[month - 1]}</Text>
        <Pressable onPress={() => go(1)} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronRight size={22} color="#e8789a" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#e8789a" /></View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-rounded text-sm text-center" style={{ color: '#e85454' }}>{error}</Text>
        </View>
      ) : !data ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-rounded text-sm text-muted-foreground text-center">找不到您的員工資料，請重新登入。</Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {/* 狀態 */}
          {data.source === 'locked' ? (
            <View className="flex-row items-center gap-1.5 self-start px-3 py-1 rounded-full" style={{ backgroundColor: '#e0f5ef' }}>
              <Lock size={12} color="#2ea87e" />
              <Text className="font-rounded text-xs font-semibold" style={{ color: '#2ea87e' }}>已結算</Text>
            </View>
          ) : (
            <View className="self-start px-3 py-1 rounded-full" style={{ backgroundColor: '#fef3e6' }}>
              <Text className="font-rounded text-xs font-semibold" style={{ color: '#e8a000' }}>預估・尚未結算，實際以結算金額為準</Text>
            </View>
          )}

          {/* 合計 */}
          <View className="bg-card border border-border rounded-2xl p-5 items-center gap-1">
            <Text className="font-rounded text-xs text-muted-foreground">{data.source === 'locked' ? '本月薪資' : '本月預估薪資'}</Text>
            <Text className="font-rounded text-3xl font-bold" style={{ color: '#e8a87c' }}>{money(data.total_salary)}</Text>
          </View>

          {/* 明細 */}
          <View className="bg-card border border-border rounded-2xl px-4 py-2">
            <Row label="本月業績" value={money(data.total_revenue)} sub="來自您的服務記錄；協作服務依分帳比例" />
            <View className="h-px bg-border" />
            <Row
              label={`抽成（${data.commission_rate_applied}%）`}
              value={money(data.commission_amount)}
              sub="依本月業績落在的階級，整筆業績用該階級的抽成比例"
            />
            <View className="h-px bg-border" />
            <Row label="底薪" value={money(data.base_salary)} />
            <View className="h-px bg-border" />
            <Row label="額外獎金" value={money(data.bonus_amount)} />
            {data.bonus_items.map((b, i) => (
              <View key={i} className="flex-row items-center justify-between pb-2 pl-3">
                <Text className="font-rounded text-xs text-muted-foreground flex-1 pr-3">{b.note || '獎金'}</Text>
                <Text className="font-rounded text-xs text-muted-foreground">{money(b.amount)}</Text>
              </View>
            ))}
          </View>

          <Text className="font-rounded text-xs text-muted-foreground text-center mt-1">
            這裡只有您自己的數字，別人看不到您的，您也看不到別人的。
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
