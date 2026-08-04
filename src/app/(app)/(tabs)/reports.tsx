import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, TextInput
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { TrendingUp, TrendingDown, DollarSign, Scissors, Plus, Trash2, CalendarDays } from 'lucide-react-native';
import {
  getMonthlyStats, getExpensesByMonth, createExpense, deleteExpense,
  getIncomeTrend, getServiceRecordsByMonth, getDailyServiceRecords
} from '@/db/api';
import type { MonthlyStats, Expense, TrendPoint, ServiceRecord } from '@/types/types';
import TrendLineChart from '@/components/TrendLineChart';

type TrendMode = 'quarter' | 'year';
type ReportTab = 'monthly' | 'daily';

// 服務項目類別圓餅圖（純 RN，不依賴 canvas/svg 外部庫）
const PIE_COLORS = ['#e8789a', '#a8d5ba', '#8b9de8', '#e8a87c', '#c4a0ae', '#f5c6d0', '#b5ddd8'];

function PieChart({ data }: { data: { name: string; count: number; revenue: number }[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.revenue, 0);
  if (total === 0) return null;

  // 計算每個項目佔比，渲染為橫向條狀佔比圖（跨平台無需 SVG）
  return (
    <View className="mx-5 bg-card rounded-2xl p-4 mb-5 border border-border">
      <Text className="font-rounded text-base font-semibold text-foreground mb-3">服務項目收入佔比</Text>
      {/* 橫條色帶 */}
      <View className="flex-row rounded-full overflow-hidden mb-4" style={{ height: 14 }}>
        {data.map((d, i) => (
          <View
            key={d.name}
            style={{ flex: d.revenue / total, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
          />
        ))}
      </View>
      {/* 圖例 */}
      <View className="gap-2">
        {data.map((d, i) => {
          const pct = Math.round((d.revenue / total) * 100);
          return (
            <View key={d.name} className="flex-row items-center">
              <View
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <Text className="font-rounded text-sm text-foreground flex-1" numberOfLines={1}>{d.name}</Text>
              <Text className="font-rounded text-xs text-muted-foreground mr-3">{d.count} 次</Text>
              <Text className="font-rounded text-xs font-semibold" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string; color: string; bg: string }) {
  return (
    <View className="flex-1 rounded-2xl p-4 mx-1" style={{ backgroundColor: bg, shadowColor: color, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 }}>
      <View className="mb-2">{icon}</View>
      <Text className="font-rounded text-xs text-muted-foreground mb-0.5">{label}</Text>
      <Text className="font-rounded text-lg font-bold" style={{ color }}>{value}</Text>
    </View>
  );
}

export default function ReportsTab() {
  const today = new Date();
  const [reportTab, setReportTab] = useState<ReportTab>('monthly');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthRecords, setMonthRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [expError, setExpError] = useState('');

  // 日報表
  const [dailyDate, setDailyDate] = useState<Date>(today);
  const [dailyRecords, setDailyRecords] = useState<ServiceRecord[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  // 趨勢折線圖
  const [trendMode, setTrendMode] = useState<TrendMode>('quarter');
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const getTrendRange = (y: number, m: number, mode: TrendMode) => {
    if (mode === 'quarter') {
      let sy = y; let sm = m - 2;
      if (sm <= 0) { sy--; sm += 12; }
      return { sy, sm, ey: y, em: m };
    } else {
      let sy = y; let sm = m - 11;
      if (sm <= 0) { sy--; sm += 12; }
      return { sy, sm, ey: y, em: m };
    }
  };

  const formatDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e, r] = await Promise.all([
        getMonthlyStats(year, month),
        getExpensesByMonth(year, month),
        getServiceRecordsByMonth(year, month),
      ]);
      setStats(s);
      setExpenses(e);
      setMonthRecords(r);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const { sy, sm, ey, em } = getTrendRange(year, month, trendMode);
      const data = await getIncomeTrend(sy, sm, ey, em);
      setTrendData(data);
    } finally {
      setTrendLoading(false);
    }
  }, [year, month, trendMode]);

  const loadDaily = useCallback(async () => {
    setDailyLoading(true);
    try {
      const r = await getDailyServiceRecords(formatDateStr(dailyDate));
      setDailyRecords(r);
    } finally {
      setDailyLoading(false);
    }
  }, [dailyDate]);

  useFocusEffect(useCallback(() => {
    loadMonthly();
    loadTrend();
    loadDaily();
  }, [loadMonthly, loadTrend, loadDaily]));

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const prevDay = () => { const d = new Date(dailyDate); d.setDate(d.getDate() - 1); setDailyDate(d); };
  const nextDay = () => { const d = new Date(dailyDate); d.setDate(d.getDate() + 1); setDailyDate(d); };

  const handleAddExpense = async () => {
    if (!expDesc.trim()) { setExpError('請輸入支出說明'); return; }
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) { setExpError('請輸入有效金額'); return; }
    setSaving(true);
    try {
      await createExpense({
        description: expDesc.trim(),
        amount: amt,
        expense_date: `${year}-${String(month).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
      });
      setExpDesc(''); setExpAmount(''); setShowAddExpense(false); setExpError('');
      loadMonthly();
    } catch (e: any) {
      setExpError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    await deleteExpense(id);
    loadMonthly();
  };

  // 月報表按日期分組
  const dailyGroups = monthRecords.reduce<Record<string, ServiceRecord[]>>((acc, r) => {
    if (!acc[r.service_date]) acc[r.service_date] = [];
    acc[r.service_date].push(r);
    return acc;
  }, {});
  const sortedDays = Object.keys(dailyGroups).sort((a, b) => b.localeCompare(a));

  const dailyTotal = dailyRecords.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {/* 頂部 Tab */}
      <View className="px-5 pt-14 pb-3 bg-background">
        <Text className="font-rounded text-2xl font-bold text-foreground mb-3">財務報表</Text>
        <View className="flex-row gap-2">
          {([['monthly', '月報表'], ['daily', '日報表']] as [ReportTab, string][]).map(([t, label]) => (
            <Pressable
              key={t}
              className="px-5 py-2 rounded-full active:opacity-70"
              style={{ backgroundColor: reportTab === t ? '#e8789a' : '#f5e6ec' }}
              onPress={() => setReportTab(t)}
            >
              <Text className="font-rounded text-sm font-semibold" style={{ color: reportTab === t ? '#fff' : '#c4a0ae' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {reportTab === 'daily' ? (
        /* ─── 日報表 ─── */
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-24">
          {/* 日期選擇器 */}
          <View className="flex-row items-center justify-between mx-5 mb-4 bg-card rounded-2xl px-4 py-3 border border-border">
            <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={prevDay}>
              <Text className="font-rounded text-primary text-lg font-bold">‹</Text>
            </Pressable>
            <View className="flex-row items-center gap-2">
              <CalendarDays size={16} color="#e8789a" />
              <Text className="font-rounded text-base font-semibold text-foreground">
                {dailyDate.getFullYear()} 年 {dailyDate.getMonth() + 1} 月 {dailyDate.getDate()} 日
              </Text>
            </View>
            <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={nextDay}>
              <Text className="font-rounded text-primary text-lg font-bold">›</Text>
            </Pressable>
          </View>

          {/* 今日總收入 */}
          <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border"
            style={{ shadowColor: '#5dc0a0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
            <Text className="font-rounded text-sm text-muted-foreground mb-1">當日總收入</Text>
            <Text className="font-rounded text-3xl font-bold" style={{ color: '#5dc0a0' }}>${dailyTotal.toLocaleString()}</Text>
            <Text className="font-rounded text-xs text-muted-foreground mt-1">{dailyRecords.length} 筆服務</Text>
          </View>

          {/* 付款方式小計 */}
          {dailyRecords.length > 0 && (() => {
            const byMethod = {
              cash:     { label: '💵 現金',    color: '#5dc0a0', total: 0 },
              card:     { label: '💳 刷卡',    color: '#8b9de8', total: 0 },
              line_pay: { label: '📱 LINE Pay', color: '#06c755', total: 0 },
            } as Record<string, { label: string; color: string; total: number }>;
            dailyRecords.forEach(r => {
              const key = (r.payment_method ?? 'cash') as string;
              if (byMethod[key]) byMethod[key].total += Number(r.amount);
            });
            const active = Object.entries(byMethod).filter(([, v]) => v.total > 0);
            if (active.length === 0) return null;
            return (
              <View className="mx-5 mb-4 flex-row gap-3">
                {active.map(([key, v]) => (
                  <View key={key} className="flex-1 rounded-2xl py-3 items-center border" style={{ backgroundColor: v.color + '12', borderColor: v.color + '33' }}>
                    <Text className="font-rounded text-xs text-muted-foreground mb-0.5">{v.label}</Text>
                    <Text className="font-rounded text-sm font-bold" style={{ color: v.color }}>${v.total.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* 當日明細 */}
          <View className="mx-5 bg-card rounded-2xl p-4 border border-border">
            <Text className="font-rounded text-base font-semibold text-foreground mb-3">服務明細</Text>
            {dailyLoading ? (
              <View className="py-8 items-center"><ActivityIndicator color="#e8789a" /></View>
            ) : dailyRecords.length === 0 ? (
              <View className="items-center py-10 gap-2">
                <Scissors size={36} color="#c4a0ae" />
                <Text className="font-rounded text-sm text-muted-foreground">當日無服務記錄</Text>
              </View>
            ) : (
              dailyRecords.map((r, i) => {
                const pmMap: Record<string, { label: string; color: string }> = {
                  cash:     { label: '現金',    color: '#5dc0a0' },
                  card:     { label: '刷卡',    color: '#8b9de8' },
                  line_pay: { label: 'LINE Pay', color: '#06c755' },
                };
                const pm = pmMap[(r.payment_method ?? 'cash') as string] ?? pmMap.cash;
                return (
                  <View key={r.id} className={`py-3 flex-row items-center ${i > 0 ? 'border-t border-border' : ''}`}>
                    <View className="w-8 h-8 rounded-full bg-primary/15 items-center justify-center mr-3">
                      <Scissors size={14} color="#e8789a" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-rounded text-sm font-semibold text-foreground">{r.service_name}</Text>
                      <View className="flex-row items-center gap-2 mt-0.5">
                        <Text className="font-rounded text-xs text-muted-foreground">{r.customer?.name ?? '—'}</Text>
                        <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: pm.color + '20' }}>
                          <Text className="font-rounded" style={{ fontSize: 10, color: pm.color }}>{pm.label}</Text>
                        </View>
                      </View>
                    </View>
                    <Text className="font-rounded text-sm font-bold text-primary">${Number(r.amount).toLocaleString()}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : (
        /* ─── 月報表 ─── */
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-24">
          {/* 月份選擇器 */}
          <View className="flex-row items-center justify-between mx-5 mb-4 bg-card rounded-2xl px-4 py-3 border border-border">
            <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={prevMonth}>
              <Text className="font-rounded text-primary text-lg font-bold">‹</Text>
            </Pressable>
            <Text className="font-rounded text-base font-semibold text-foreground">
              {year} 年 {month} 月
            </Text>
            <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={nextMonth}>
              <Text className="font-rounded text-primary text-lg font-bold">›</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#e8789a" />
            </View>
          ) : stats ? (
            <>
              {/* 統計卡片 */}
              <View className="flex-row px-4 mb-4">
                <StatCard icon={<TrendingUp size={18} color="#5dc0a0" />} label="本月收入" value={`$${stats.totalIncome.toLocaleString()}`} color="#5dc0a0" bg="#e0f5ef" />
                <StatCard icon={<TrendingDown size={18} color="#e8789a" />} label="本月支出" value={`$${stats.totalExpenses.toLocaleString()}`} color="#e8789a" bg="#fce9f0" />
              </View>
              <View className="flex-row px-4 mb-5">
                <StatCard icon={<DollarSign size={18} color="#8b9de8" />} label="淨收入" value={`$${stats.netIncome.toLocaleString()}`} color={stats.netIncome >= 0 ? '#5dc0a0' : '#e8789a'} bg="#eef0fc" />
                <StatCard icon={<Scissors size={18} color="#e8a87c" />} label="服務次數" value={`${stats.serviceCount} 次`} color="#e8a87c" bg="#fdf0e8" />
              </View>

              {/* 收入趨勢折線圖 */}
              <View className="mx-5 bg-card rounded-2xl p-4 mb-5 border border-border">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-rounded text-base font-semibold text-foreground">收入趨勢</Text>
                  <View className="flex-row bg-muted rounded-xl overflow-hidden">
                    {(['quarter', 'year'] as TrendMode[]).map(m => (
                      <Pressable
                        key={m}
                        className="px-3 py-1.5 active:opacity-70"
                        style={{ backgroundColor: trendMode === m ? '#e8789a' : 'transparent' }}
                        onPress={() => setTrendMode(m)}
                      >
                        <Text className="font-rounded text-xs font-medium"
                          style={{ color: trendMode === m ? '#fff' : '#c4a0ae' }}>
                          {m === 'quarter' ? '近3月' : '近12月'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {trendLoading ? (
                  <View className="items-center py-8"><ActivityIndicator color="#e8789a" /></View>
                ) : (
                  <TrendLineChart data={trendData} height={140} />
                )}
              </View>

              {/* 熱門服務 */}
              {stats.topServices.length > 0 && (
                <View className="mx-5 bg-card rounded-2xl p-4 mb-5 border border-border">
                  <Text className="font-rounded text-base font-semibold text-foreground mb-3">熱門服務項目</Text>
                  {stats.topServices.map((s, i) => (
                    <View key={s.name} className="flex-row items-center mb-2">
                      <View className="w-6 h-6 rounded-full bg-primary/15 items-center justify-center mr-2">
                        <Text className="font-rounded text-xs text-primary font-bold">{i + 1}</Text>
                      </View>
                      <Text className="font-rounded text-sm text-foreground flex-1">{s.name}</Text>
                      <Text className="font-rounded text-sm text-muted-foreground mr-3">{s.count} 次</Text>
                      <Text className="font-rounded text-sm font-semibold text-primary">${s.revenue.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 服務類別佔比圖 */}
              <PieChart data={stats.topServices} />

              {/* 月收入每日明細 */}
              {monthRecords.length > 0 && (
                <View className="mx-5 bg-card rounded-2xl p-4 mb-5 border border-border">
                  <Text className="font-rounded text-base font-semibold text-foreground mb-3">每日收入明細</Text>
                  {sortedDays.map((day, di) => {
                    const dayTotal = dailyGroups[day].reduce((s, r) => s + Number(r.amount), 0);
                    return (
                      <View key={day} className={`${di > 0 ? 'border-t border-border' : ''} py-3`}>
                        <View className="flex-row items-center justify-between mb-2">
                          <Text className="font-rounded text-sm font-semibold text-foreground">{day}</Text>
                          <Text className="font-rounded text-sm font-bold text-primary">${dayTotal.toLocaleString()}</Text>
                        </View>
                        {dailyGroups[day].map(r => (
                          <View key={r.id} className="flex-row items-center pl-3 mb-1">
                            <View className="w-1.5 h-1.5 rounded-full bg-primary/40 mr-2" />
                            <Text className="font-rounded text-xs text-muted-foreground flex-1">{r.service_name} · {r.customer?.name}</Text>
                            <Text className="font-rounded text-xs font-semibold" style={{ color: '#5dc0a0' }}>${Number(r.amount).toLocaleString()}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* 支出記錄 */}
              <View className="mx-5 bg-card rounded-2xl p-4 border border-border">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-rounded text-base font-semibold text-foreground">支出記錄</Text>
                  <Pressable
                    className="flex-row items-center gap-1 active:opacity-70"
                    onPress={() => setShowAddExpense(!showAddExpense)}
                  >
                    <Plus size={16} color="#e8789a" />
                    <Text className="font-rounded text-sm text-primary">新增支出</Text>
                  </Pressable>
                </View>

                {showAddExpense && (
                  <View className="bg-muted rounded-xl p-3 mb-3 gap-2">
                    <TextInput
                      className="font-rounded text-sm text-foreground bg-card rounded-xl px-3 py-2 border border-border"
                      placeholder="支出說明"
                      placeholderTextColor="#c4a0ae"
                      value={expDesc}
                      onChangeText={setExpDesc}
                    />
                    <TextInput
                      className="font-rounded text-sm text-foreground bg-card rounded-xl px-3 py-2 border border-border"
                      placeholder="金額"
                      placeholderTextColor="#c4a0ae"
                      value={expAmount}
                      onChangeText={setExpAmount}
                      keyboardType="numeric"
                    />
                    {expError ? <Text className="font-rounded text-xs text-destructive">{expError}</Text> : null}
                    <View className="flex-row gap-2">
                      <Pressable
                        className="flex-1 bg-primary rounded-xl py-2 items-center active:opacity-80"
                        onPress={handleAddExpense}
                        disabled={saving}
                      >
                        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">確認</Text>}
                      </Pressable>
                      <Pressable
                        className="flex-1 bg-card border border-border rounded-xl py-2 items-center active:opacity-70"
                        onPress={() => { setShowAddExpense(false); setExpDesc(''); setExpAmount(''); setExpError(''); }}
                      >
                        <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {expenses.length === 0 ? (
                  <Text className="font-rounded text-sm text-muted-foreground text-center py-4">本月尚無支出記錄</Text>
                ) : (
                  expenses.map(e => (
                    <View key={e.id} className="flex-row items-center py-2 border-t border-border">
                      <View className="flex-1">
                        <Text className="font-rounded text-sm text-foreground">{e.description}</Text>
                        <Text className="font-rounded text-xs text-muted-foreground">{e.expense_date}</Text>
                      </View>
                      <Text className="font-rounded text-sm font-semibold text-destructive mr-3">
                        -${Number(e.amount).toLocaleString()}
                      </Text>
                      <Pressable className="active:opacity-60" onPress={() => handleDeleteExpense(e.id)}>
                        <Trash2 size={15} color="#c4a0ae" />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : (
            <View className="items-center py-20">
              <Text className="font-rounded text-muted-foreground">本月暫無資料</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
