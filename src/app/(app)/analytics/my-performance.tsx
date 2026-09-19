import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, BarChart2, ChevronLeft, ChevronRight, Scissors, DollarSign } from 'lucide-react-native';
import { getMyPerformanceByMonth } from '@/db/api';

// 員工帳號「我的業績」：只看自己的服務次數與收入（唯讀）。
// 資料來自 get_my_performance_by_month()（migration 00076），只有彙總數字；收入算法與商家的「服務人員業績」相同
// （多人協作依分帳比例）。抽成與月薪不在這頁。

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const TREND_MONTHS = 6;

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`;
}
function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export default function MyPerformanceScreen() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [byMonth, setByMonth] = useState<Record<string, { count: number; revenue: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 一次抓「選定月份往前 6 個月」，用來顯示趨勢與跟上個月比較
  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError('');
    try {
      const start = shiftMonth(y, m, -(TREND_MONTHS - 1));
      const end = shiftMonth(y, m, 1);
      const rows = await getMyPerformanceByMonth(`${monthKey(start.y, start.m)}-01`, `${monthKey(end.y, end.m)}-01`);
      const map: Record<string, { count: number; revenue: number }> = {};
      for (const r of rows) map[r.month] = { count: r.service_count, revenue: r.total_revenue };
      setByMonth(map);
    } catch (e: any) {
      setError(e?.message ?? '載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [load, year, month]));

  const go = (delta: number) => {
    const n = shiftMonth(year, month, delta);
    setYear(n.y); setMonth(n.m);
  };

  const cur = byMonth[monthKey(year, month)] ?? { count: 0, revenue: 0 };
  const prevKey = shiftMonth(year, month, -1);
  const prev = byMonth[monthKey(prevKey.y, prevKey.m)] ?? { count: 0, revenue: 0 };
  const avg = cur.count > 0 ? Math.round(cur.revenue / cur.count) : 0;
  const diff = cur.revenue - prev.revenue;

  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const t = shiftMonth(year, month, -(TREND_MONTHS - 1) + i);
    const v = byMonth[monthKey(t.y, t.m)] ?? { count: 0, revenue: 0 };
    return { key: monthKey(t.y, t.m), label: MONTH_NAMES[t.m - 1], ...v };
  });
  const maxRevenue = Math.max(1, ...trend.map(t => t.revenue));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/staff-schedule' as any))}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <BarChart2 size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">我的業績</Text>
      </View>

      {/* 月份切換 */}
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
        <View className="flex-1 items-center justify-center px-8 gap-2">
          <Text className="font-rounded text-sm text-center" style={{ color: '#e85454' }}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <View className="flex-row items-center gap-1.5 mb-1">
                <DollarSign size={14} color="#5dc0a0" />
                <Text className="font-rounded text-xs text-muted-foreground">本月收入</Text>
              </View>
              <Text className="font-rounded text-xl font-bold" style={{ color: '#5dc0a0' }}>${cur.revenue.toLocaleString()}</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Scissors size={14} color="#e8789a" />
                <Text className="font-rounded text-xs text-muted-foreground">服務次數</Text>
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground">{cur.count} 次</Text>
            </View>
          </View>

          <View className="bg-card border border-border rounded-2xl p-4 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-rounded text-xs text-muted-foreground">平均每次收入</Text>
              <Text className="font-rounded text-sm font-semibold text-foreground">${avg.toLocaleString()}</Text>
            </View>
            <View className="flex-row items-center justify-between border-t border-border pt-2">
              <Text className="font-rounded text-xs text-muted-foreground">
                比 {MONTH_NAMES[prevKey.m - 1]}（${prev.revenue.toLocaleString()}）
              </Text>
              <Text className="font-rounded text-sm font-semibold" style={{ color: diff > 0 ? '#5dc0a0' : diff < 0 ? '#e85454' : '#c4a0ae' }}>
                {diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : ''}${Math.abs(diff).toLocaleString()}
              </Text>
            </View>
          </View>

          {cur.count === 0 && (
            <View className="bg-card border border-border rounded-2xl p-4">
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                這個月還沒有您的服務記錄。建立服務記錄時選自己當服務人員，業績才會算進來。
              </Text>
            </View>
          )}

          {/* 近 6 個月 */}
          <View className="bg-card border border-border rounded-2xl p-4 gap-3">
            <Text className="font-rounded text-sm font-semibold text-foreground">近 {TREND_MONTHS} 個月收入</Text>
            {trend.map(t => (
              <View key={t.key} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-rounded text-xs text-muted-foreground">{t.label}・{t.count} 次</Text>
                  <Text className="font-rounded text-xs font-semibold text-foreground">${t.revenue.toLocaleString()}</Text>
                </View>
                <View className="h-2 bg-muted rounded-full overflow-hidden">
                  <View className="h-full rounded-full" style={{ width: `${(t.revenue / maxRevenue) * 100}%`, backgroundColor: t.key === monthKey(year, month) ? '#e8789a' : '#f0b8c8' }} />
                </View>
              </View>
            ))}
          </View>

          <Text className="font-rounded text-xs text-muted-foreground text-center mt-1">
            業績來自服務記錄；多人協作的服務依分帳比例計算。抽成與月薪不在這頁。
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
