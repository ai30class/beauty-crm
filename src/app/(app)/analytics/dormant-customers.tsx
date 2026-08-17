import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, TrendingDown, Phone, CalendarDays } from 'lucide-react-native';
import { getDormantCustomers } from '@/db/api';
import type { DormantCustomer } from '@/types/types';

const THRESHOLDS = [30, 60, 90] as const;

export default function DormantCustomersScreen() {
  const router = useRouter();
  const [days, setDays] = useState<number>(60);
  const [customers, setCustomers] = useState<DormantCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const data = await getDormantCustomers(d);
      setCustomers(data);
    } catch (e: any) {
      setError(e.message ?? '載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <TrendingDown size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">久未到店提醒</Text>
      </View>

      {/* 天數切換 */}
      <View className="flex-row items-center gap-2 mx-5 mb-4">
        {THRESHOLDS.map(t => (
          <Pressable
            key={t}
            className="flex-1 items-center py-2.5 rounded-2xl active:opacity-70"
            style={{ backgroundColor: days === t ? '#e8789a' : '#fce9f0' }}
            onPress={() => { setDays(t); load(t); }}
          >
            <Text className="font-rounded text-sm font-semibold" style={{ color: days === t ? '#fff' : '#e8789a' }}>
              超過 {t} 天
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mx-5 mb-3">
        <Text className="font-rounded text-xs text-muted-foreground">共 {customers.length} 位顧客超過 {days} 天沒到店（含從未到店過的顧客）</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text className="font-rounded text-sm text-destructive text-center">{error}</Text>
        </View>
      ) : customers.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text style={{ fontSize: 48 }}>🌸</Text>
          <Text className="font-rounded text-base text-muted-foreground text-center">
            沒有超過 {days} 天沒來的顧客
          </Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {customers.map(c => (
            <View
              key={c.id}
              className="bg-card border border-border rounded-2xl px-4 py-4 flex-row items-center gap-3"
            >
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
                <Text className="font-rounded text-xs font-bold" style={{ color: '#e8789a' }}>
                  {c.days_since}天
                </Text>
              </View>

              <View className="flex-1">
                <Text className="font-rounded text-base font-semibold text-foreground">{c.name}</Text>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Phone size={11} color="#c4a0ae" />
                  <Text className="font-rounded text-xs text-muted-foreground">{c.phone}</Text>
                </View>
              </View>

              <View className="items-end">
                <View className="flex-row items-center gap-1">
                  <CalendarDays size={11} color="#c4a0ae" />
                  <Text className="font-rounded text-sm text-muted-foreground">
                    {c.last_visit ? `上次 ${c.last_visit}` : '從未到店'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
