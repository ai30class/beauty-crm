import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Trophy, Phone, CalendarDays } from 'lucide-react-native';
import { getCustomerRanking } from '@/db/api';
import type { CustomerRankRow } from '@/types/types';

const MEDAL_COLORS = ['#f5d87a', '#c0c0c0', '#cd7f32'];
const MEDAL_EMOJI  = ['🥇', '🥈', '🥉'];

export default function CustomerRankingScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try { setRows(await getCustomerRanking(20)); }
      finally { setLoading(false); }
    })();
  }, []));

  const maxAmt = rows[0]?.total_amount ?? 1;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Trophy size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">顧客消費排行</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" />
        </View>
      ) : rows.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text className="font-rounded text-base text-muted-foreground text-center">
            尚無服務記錄可供排行
          </Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {/* Top 3 大卡 */}
          {rows.slice(0, 3).length > 0 && (
            <View className="flex-row gap-2 mb-1">
              {[rows[1], rows[0], rows[2]].filter(Boolean).map((row, podiumIdx) => {
                const rank = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2;
                const realRank = rank === 1 ? 1 : rank === 0 ? 0 : 2;
                const heights = [100, 124, 88];
                return (
                  <View key={row.customer_id} className="flex-1 items-center gap-1">
                    <Text className="font-rounded text-lg">{MEDAL_EMOJI[realRank]}</Text>
                    <Text className="font-rounded text-sm font-bold text-foreground text-center" numberOfLines={1}>
                      {row.customer_name}
                    </Text>
                    <Text className="font-rounded text-xs font-semibold" style={{ color: '#e8789a' }}>
                      ${row.total_amount.toLocaleString()}
                    </Text>
                    <View className="w-full rounded-t-xl items-center justify-end pb-2"
                      style={{ height: heights[podiumIdx], backgroundColor: MEDAL_COLORS[realRank] + '33',
                        borderWidth: 1, borderColor: MEDAL_COLORS[realRank] + '66' }}>
                      <Text className="font-rounded text-xs text-muted-foreground">
                        {row.visit_count} 次
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 完整排行清單 */}
          <View className="bg-card border border-border rounded-2xl overflow-hidden">
            <View className="px-4 py-3 border-b border-border">
              <Text className="font-rounded text-sm font-semibold text-foreground">完整排行（前 20 名）</Text>
            </View>
            {rows.map((row, i) => {
              const barPct = maxAmt > 0 ? row.total_amount / maxAmt : 0;
              return (
                <View key={row.customer_id}
                  className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-row items-center gap-3">
                    <View className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: i < 3 ? MEDAL_COLORS[i] + '33' : '#f5f5f5' }}>
                      <Text className="font-rounded text-xs font-bold"
                        style={{ color: i < 3 ? '#7a6000' : '#888' }}>
                        {i < 3 ? MEDAL_EMOJI[i] : i + 1}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-rounded text-sm font-semibold text-foreground">{row.customer_name}</Text>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Phone size={10} color="#c4a0ae" />
                        <Text className="font-rounded text-xs text-muted-foreground">{row.customer_phone}</Text>
                      </View>
                    </View>
                    <View className="items-end gap-0.5">
                      <Text className="font-rounded text-sm font-bold" style={{ color: '#5dc0a0' }}>
                        ${row.total_amount.toLocaleString()}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <CalendarDays size={10} color="#c4a0ae" />
                        <Text className="font-rounded text-xs text-muted-foreground">{row.visit_count} 次</Text>
                      </View>
                    </View>
                  </View>
                  {/* 進度條 */}
                  <View className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${barPct * 100}%`, backgroundColor: '#e8789a' }} />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
