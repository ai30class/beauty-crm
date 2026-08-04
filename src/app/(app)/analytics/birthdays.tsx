import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Cake, ChevronLeft, ChevronRight, Phone } from 'lucide-react-native';
import { getBirthdayCustomers } from '@/db/api';
import type { BirthdayCustomer } from '@/types/types';

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function BirthdaysScreen() {
  const router = useRouter();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [customers, setCustomers] = useState<BirthdayCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number) => {
    setLoading(true);
    try {
      const data = await getBirthdayCustomers(m);
      setCustomers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(month); }, [load, month]));

  const prevMonth = () => {
    const m = month === 1 ? 12 : month - 1;
    setMonth(m); load(m);
  };
  const nextMonth = () => {
    const m = month === 12 ? 1 : month + 1;
    setMonth(m); load(m);
  };

  const currentMonthBirthdays = customers.filter(c => c.birthday_month === month);
  const todayStr = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Cake size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">生日壽星提醒</Text>
      </View>

      {/* 月份切換 */}
      <View className="flex-row items-center justify-between mx-5 mb-4 bg-card border border-border rounded-2xl px-4 py-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="items-center">
          <Text className="font-rounded text-lg font-bold text-foreground">{MONTH_NAMES[month - 1]}</Text>
          <Text className="font-rounded text-xs text-muted-foreground">共 {currentMonthBirthdays.length} 位壽星</Text>
        </View>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronRight size={22} color="#e8789a" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" />
        </View>
      ) : currentMonthBirthdays.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text style={{ fontSize: 48 }}>🎂</Text>
          <Text className="font-rounded text-base text-muted-foreground text-center">
            {MONTH_NAMES[month - 1]}沒有生日的顧客
          </Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          {currentMonthBirthdays.map(c => {
            const mmdd = `${String(c.birthday_month).padStart(2,'0')}-${String(c.birthday_day).padStart(2,'0')}`;
            const isToday = mmdd === todayStr;
            return (
              <View
                key={c.id}
                className="bg-card border rounded-2xl px-4 py-4 flex-row items-center gap-3"
                style={{ borderColor: isToday ? '#e8789a' : '#f0e0e8',
                  backgroundColor: isToday ? '#fff5f7' : undefined }}
              >
                {/* 日期圓圈 */}
                <View className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: isToday ? '#e8789a' : '#fce9f0' }}>
                  <Text className="font-rounded text-xs font-bold"
                    style={{ color: isToday ? '#fff' : '#e8789a' }}>
                    {c.birthday_day}日
                  </Text>
                </View>

                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-rounded text-base font-semibold text-foreground">{c.name}</Text>
                    {isToday && (
                      <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: '#e8789a' }}>
                        <Text className="font-rounded text-xs text-white font-bold">🎉 今日壽星</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Phone size={11} color="#c4a0ae" />
                    <Text className="font-rounded text-xs text-muted-foreground">{c.phone}</Text>
                  </View>
                </View>

                <View className="items-end">
                  <Text className="font-rounded text-sm text-muted-foreground">
                    {MONTH_NAMES[c.birthday_month - 1]}{c.birthday_day}日
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
