import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, TrendingUp, ChevronLeft, ChevronRight, Package, RefreshCcw, ShoppingBag, TrendingDown } from 'lucide-react-native';
import { getProductSalesReport, getRestockLog } from '@/db/api';
import type { ProductSalesRow, RestockLog } from '@/types/types';

type Tab = 'sales' | 'restock';

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InventoryReportScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('sales');

  const [salesRows, setSalesRows] = useState<ProductSalesRow[]>([]);
  const [restockLogs, setRestockLogs] = useState<RestockLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        getProductSalesReport(year, month),
        getRestockLog(),
      ]);
      setSalesRows(s);
      setRestockLogs(r);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 月份切換
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const nextY = month === 12 ? year + 1 : year;
    const nextM = month === 12 ? 1 : month + 1;
    if (nextY > now.getFullYear() || (nextY === now.getFullYear() && nextM > now.getMonth() + 1)) return;
    setYear(nextY); setMonth(nextM);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const totalSalesAmount = salesRows.reduce((s, r) => s + r.total_amount, 0);
  const totalSalesQty = salesRows.reduce((s, r) => s + r.total_qty, 0);
  const totalCost = salesRows.reduce((s, r) => s + r.total_cost, 0);
  const totalGrossProfit = totalSalesAmount - totalCost;
  const totalGrossMargin = totalSalesAmount > 0 ? totalGrossProfit / totalSalesAmount : 0;

  // 本月補貨記錄（用 created_at 篩選）
  const monthRestocks = restockLogs.filter(r => {
    const d = new Date(r.created_at);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
  const totalRestockCost = monthRestocks.reduce((s, r) => s + Number(r.cost_total ?? 0), 0);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* 標題列 */}
      <View className="flex-row items-center px-5 pt-14 pb-3 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <TrendingUp size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">保養品報表</Text>
      </View>

      {/* 月份選擇器 */}
      <View className="flex-row items-center justify-center gap-4 py-2 bg-background border-b border-border mx-5 mb-2">
        <Pressable className="w-9 h-9 rounded-full items-center justify-center active:bg-muted" onPress={prevMonth}>
          <ChevronLeft size={20} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-base font-bold text-foreground w-24 text-center">
          {year} 年 {month} 月
        </Text>
        <Pressable
          className="w-9 h-9 rounded-full items-center justify-center active:bg-muted"
          onPress={nextMonth}
          style={{ opacity: isCurrentMonth ? 0.3 : 1 }}
          disabled={isCurrentMonth}
        >
          <ChevronRight size={20} color="#e8789a" />
        </Pressable>
      </View>

      {/* Tab 切換 */}
      <View className="flex-row mx-5 mb-3 gap-2">
        {([
          { key: 'sales' as Tab, label: '銷售收入', icon: <ShoppingBag size={14} color={tab === 'sales' ? '#fff' : '#e8789a'} /> },
          { key: 'restock' as Tab, label: '補貨記錄', icon: <RefreshCcw size={14} color={tab === 'restock' ? '#fff' : '#4a6cf7'} /> },
        ]).map(t => (
          <Pressable
            key={t.key}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-2xl active:opacity-80"
            style={{ backgroundColor: tab === t.key ? (t.key === 'sales' ? '#e8789a' : '#4a6cf7') : '#f5eaef' }}
            onPress={() => setTab(t.key)}
          >
            {t.icon}
            <Text className="font-rounded text-sm font-semibold"
              style={{ color: tab === t.key ? '#fff' : (t.key === 'sales' ? '#e8789a' : '#4a6cf7') }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" size="large" />
        </View>
      ) : tab === 'sales' ? (
        /* ── 銷售收入 tab ── */
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {/* 摘要卡 row 1：銷售額 + 件數 */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <Text className="font-rounded text-xs text-muted-foreground">銷售總額</Text>
              <Text className="font-rounded text-xl font-bold" style={{ color: '#5dc0a0' }}>
                ${totalSalesAmount.toLocaleString()}
              </Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <Text className="font-rounded text-xs text-muted-foreground">銷售件數</Text>
              <Text className="font-rounded text-xl font-bold text-foreground">
                {totalSalesQty} 件
              </Text>
            </View>
          </View>

          {/* 損益摘要卡 */}
          {salesRows.length > 0 && (
            <View className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: totalGrossProfit >= 0 ? '#f0faf5' : '#fff5f5',
                borderColor: totalGrossProfit >= 0 ? '#b8e8d4' : '#f5b8b8' }}>
              <View className="px-4 py-3 border-b"
                style={{ borderColor: totalGrossProfit >= 0 ? '#b8e8d4' : '#f5b8b8' }}>
                <Text className="font-rounded text-sm font-semibold text-foreground">本月損益摘要</Text>
              </View>
              <View className="px-4 py-3 gap-2.5">
                <View className="flex-row justify-between">
                  <Text className="font-rounded text-sm text-muted-foreground">銷售收入</Text>
                  <Text className="font-rounded text-sm font-semibold" style={{ color: '#5dc0a0' }}>
                    + ${totalSalesAmount.toLocaleString()}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="font-rounded text-sm text-muted-foreground">進貨成本</Text>
                  <Text className="font-rounded text-sm font-semibold" style={{ color: '#e85454' }}>
                    - ${totalCost.toLocaleString()}
                  </Text>
                </View>
                <View className="h-px bg-border" />
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center gap-1.5">
                    {totalGrossProfit >= 0
                      ? <TrendingUp size={14} color="#5dc0a0" />
                      : <TrendingDown size={14} color="#e85454" />}
                    <Text className="font-rounded text-sm font-bold text-foreground">毛利</Text>
                  </View>
                  <View className="items-end">
                    <Text className="font-rounded text-base font-bold"
                      style={{ color: totalGrossProfit >= 0 ? '#5dc0a0' : '#e85454' }}>
                      {totalGrossProfit >= 0 ? '+' : ''}${totalGrossProfit.toLocaleString()}
                    </Text>
                    <Text className="font-rounded text-xs text-muted-foreground">
                      毛利率 {(totalGrossMargin * 100).toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* 品項銷售排行 */}
          {salesRows.length === 0 ? (
            <View className="items-center justify-center py-16 gap-3">
              <Package size={44} color="#c4a0ae" />
              <Text className="font-rounded text-base text-muted-foreground">本月尚無保養品銷售記錄</Text>
            </View>
          ) : (
            <View className="bg-card border border-border rounded-2xl overflow-hidden">
              <View className="px-4 py-3 border-b border-border">
                <Text className="font-rounded text-sm font-semibold text-foreground">品項銷售排行</Text>
              </View>
              {salesRows.map((row, i) => (
                <View key={row.product_id}
                  className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-row items-center">
                    {/* 排名圓點 */}
                    <View className="w-6 h-6 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: i === 0 ? '#fce9f0' : i === 1 ? '#fff8e0' : '#f0f5f0' }}>
                      <Text className="font-rounded text-xs font-bold"
                        style={{ color: i === 0 ? '#e8789a' : i === 1 ? '#d4a017' : '#5dc0a0' }}>
                        {i + 1}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-rounded text-sm font-semibold text-foreground">{row.product_name}</Text>
                      {row.product_spec ? (
                        <Text className="font-rounded text-xs text-muted-foreground">{row.product_spec}</Text>
                      ) : null}
                    </View>
                    <View className="items-end gap-0.5">
                      <Text className="font-rounded text-sm font-bold" style={{ color: '#5dc0a0' }}>
                        ${row.total_amount.toLocaleString()}
                      </Text>
                      <Text className="font-rounded text-xs text-muted-foreground">{row.total_qty} 件</Text>
                    </View>
                  </View>
                  {/* 利潤小列 */}
                  {row.cost_price > 0 && (
                    <View className="mt-2 flex-row gap-3 pl-9">
                      <View className="flex-row items-center gap-1">
                        <Text className="font-rounded text-xs text-muted-foreground">成本</Text>
                        <Text className="font-rounded text-xs" style={{ color: '#e85454' }}>
                          ${row.total_cost.toLocaleString()}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="font-rounded text-xs text-muted-foreground">毛利</Text>
                        <Text className="font-rounded text-xs font-semibold"
                          style={{ color: row.gross_profit >= 0 ? '#5dc0a0' : '#e85454' }}>
                          {row.gross_profit >= 0 ? '+' : ''}${row.gross_profit.toLocaleString()}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="font-rounded text-xs text-muted-foreground">毛利率</Text>
                        <Text className="font-rounded text-xs font-semibold"
                          style={{ color: row.gross_margin >= 0.3 ? '#5dc0a0' : row.gross_margin >= 0.1 ? '#d4a017' : '#e85454' }}>
                          {(row.gross_margin * 100).toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        /* ── 補貨記錄 tab ── */
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {/* 本月進貨成本摘要 */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <Text className="font-rounded text-xs text-muted-foreground">本月進貨成本</Text>
              <Text className="font-rounded text-xl font-bold" style={{ color: '#4a6cf7' }}>
                ${totalRestockCost.toLocaleString()}
              </Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4 gap-1">
              <Text className="font-rounded text-xs text-muted-foreground">補貨次數</Text>
              <Text className="font-rounded text-xl font-bold text-foreground">{monthRestocks.length} 次</Text>
            </View>
          </View>

          {/* 補貨清單 */}
          {monthRestocks.length === 0 ? (
            <View className="items-center justify-center py-16 gap-3">
              <RefreshCcw size={44} color="#c4a0ae" />
              <Text className="font-rounded text-base text-muted-foreground">本月尚無補貨記錄</Text>
            </View>
          ) : (
            <View className="bg-card border border-border rounded-2xl overflow-hidden">
              <View className="px-4 py-3 border-b border-border">
                <Text className="font-rounded text-sm font-semibold text-foreground">本月補貨清單</Text>
              </View>
              {monthRestocks.map((log, i) => (
                <View key={log.id}
                  className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="font-rounded text-sm font-semibold text-foreground">
                        {log.product?.name ?? '—'}
                      </Text>
                      {log.product?.spec ? (
                        <Text className="font-rounded text-xs text-muted-foreground">
                          {log.product.spec}
                        </Text>
                      ) : null}
                      {log.note ? (
                        <Text className="font-rounded text-xs text-muted-foreground mt-0.5">備：{log.note}</Text>
                      ) : null}
                    </View>
                    <View className="items-end gap-0.5 ml-3">
                      <Text className="font-rounded text-sm font-bold text-foreground">+{log.qty} 件</Text>
                      {Number(log.cost_total) > 0 ? (
                        <Text className="font-rounded text-xs" style={{ color: '#4a6cf7' }}>
                          ${Number(log.cost_total).toLocaleString()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text className="font-rounded text-xs text-muted-foreground mt-1">{formatDate(log.created_at)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 歷史補貨（本月以外） */}
          {restockLogs.filter(r => {
            const d = new Date(r.created_at);
            return !(d.getFullYear() === year && d.getMonth() + 1 === month);
          }).length > 0 && (
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-2 px-1">歷史補貨記錄</Text>
              <View className="bg-card border border-border rounded-2xl overflow-hidden">
                {restockLogs
                  .filter(r => {
                    const d = new Date(r.created_at);
                    return !(d.getFullYear() === year && d.getMonth() + 1 === month);
                  })
                  .map((log, i) => (
                    <View key={log.id}
                      className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                      <View className="flex-1">
                        <Text className="font-rounded text-sm text-foreground">
                        {log.product?.name ?? '—'} +{log.qty} 件
                        </Text>
                        <Text className="font-rounded text-xs text-muted-foreground">{formatDate(log.created_at)}</Text>
                      </View>
                      {Number(log.cost_total) > 0 && (
                        <Text className="font-rounded text-xs" style={{ color: '#4a6cf7' }}>
                          ${Number(log.cost_total).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
