import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Users2, ChevronLeft, ChevronRight, Scissors, DollarSign } from 'lucide-react-native';
import { getStaffPerformance } from '@/db/api';
import type { StaffPerformanceRow } from '@/types/types';

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function StaffPerformanceScreen() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState<StaffPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try { setRows(await getStaffPerformance(y, m)); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [load, year, month]));

  const prevMonth = () => {
    const nm = month === 1 ? 12 : month - 1;
    const ny = month === 1 ? year - 1 : year;
    setMonth(nm); setYear(ny); load(ny, nm);
  };
  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    setMonth(nm); setYear(ny); load(ny, nm);
  };

  const totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0);
  const totalCount   = rows.reduce((s, r) => s + r.service_count, 0);
  const maxRevenue   = rows[0]?.total_revenue ?? 1;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Users2 size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">服務人員業績</Text>
      </View>

      {/* 月份切換 */}
      <View className="flex-row items-center justify-between mx-5 mb-4 bg-card border border-border rounded-2xl px-4 py-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-lg font-bold text-foreground">
          {year}年 {MONTH_NAMES[month - 1]}
        </Text>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronRight size={22} color="#e8789a" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" />
        </View>
      ) : rows.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Users2 size={48} color="#c4a0ae" />
          <Text className="font-rounded text-base text-muted-foreground text-center">
            本月尚無含員工的服務記錄
          </Text>
          <Text className="font-rounded text-xs text-muted-foreground text-center">
            建立服務記錄時請記得選擇服務人員
          </Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {/* 月度摘要 */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <View className="flex-row items-center gap-1.5 mb-1">
                <DollarSign size={14} color="#5dc0a0" />
                <Text className="font-rounded text-xs text-muted-foreground">月度總收入</Text>
              </View>
              <Text className="font-rounded text-xl font-bold" style={{ color: '#5dc0a0' }}>
                ${totalRevenue.toLocaleString()}
              </Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Scissors size={14} color="#e8789a" />
                <Text className="font-rounded text-xs text-muted-foreground">服務總次數</Text>
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground">
                {totalCount} 次
              </Text>
            </View>
          </View>

          {/* 員工業績卡 */}
          {rows.map((row, i) => {
            const barPct = maxRevenue > 0 ? row.total_revenue / maxRevenue : 0;
            const revShare = totalRevenue > 0 ? (row.total_revenue / totalRevenue * 100).toFixed(1) : '0.0';
            return (
              <View key={row.staff_id} className="bg-card border border-border rounded-2xl p-4 gap-3">
                {/* 員工名 + 排名 */}
                <View className="flex-row items-center gap-3">
                  <View className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: row.staff_color + '33' }}>
                    <Text className="font-rounded text-base font-bold"
                      style={{ color: row.staff_color }}>
                      {row.staff_name.charAt(0)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-rounded text-base font-semibold text-foreground">{row.staff_name}</Text>
                      {i === 0 && (
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f5d87a33' }}>
                          <Text className="font-rounded text-xs font-bold" style={{ color: '#9a7000' }}>🏆 No.1</Text>
                        </View>
                      )}
                    </View>
                    <Text className="font-rounded text-xs text-muted-foreground mt-0.5">
                      服務 {row.service_count} 次・佔比 {revShare}%
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-rounded text-lg font-bold" style={{ color: '#5dc0a0' }}>
                      ${row.total_revenue.toLocaleString()}
                    </Text>
                    <Text className="font-rounded text-xs text-muted-foreground">
                      均 ${row.service_count > 0 ? Math.round(row.total_revenue / row.service_count).toLocaleString() : 0}/次
                    </Text>
                  </View>
                </View>
                {/* 收入占比條 */}
                <View className="h-2 bg-muted rounded-full overflow-hidden">
                  <View className="h-full rounded-full"
                    style={{ width: `${barPct * 100}%`, backgroundColor: row.staff_color }} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
