import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Search, Plus, User, Phone, ChevronRight, Scissors, Clock, CalendarDays, AlertCircle, BellRing } from 'lucide-react-native';
import { getCustomers, searchCustomers, getServiceTemplates, getShopProfileByOwner, getMergedAppointments } from '@/db/api';
import { supabase } from '@/client/supabase';
import type { Customer, ServiceTemplate, BusinessHours, UnifiedAppointment } from '@/types/types';

const DAY_KEYS: (keyof BusinessHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getTodayDayKey(): keyof BusinessHours {
  return DAY_KEYS[new Date().getDay()];
}

function CustomerCard({ item, onPress }: { item: Customer; onPress: () => void }) {
  const initial = item.name.charAt(0);
  return (
    <Pressable
      className="flex-row items-center bg-card rounded-2xl px-4 py-3 mb-3 active:opacity-80"
      style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}
      onPress={onPress}
    >
      <View className="w-12 h-12 rounded-full bg-primary/20 items-center justify-center mr-3">
        <Text className="font-rounded text-primary text-lg font-bold">{initial}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-rounded text-base font-semibold text-foreground">{item.name}</Text>
        <View className="flex-row items-center mt-0.5">
          <Phone size={12} color="#c4a0ae" />
          <Text className="font-rounded text-sm text-muted-foreground ml-1">{item.phone}</Text>
        </View>
      </View>
      <ChevronRight size={18} color="#c4a0ae" />
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [isTodayHoliday, setIsTodayHoliday] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [upcomingSoon, setUpcomingSoon] = useState<UnifiedAppointment[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [data, tpls, { data: { user } }, appts] = await Promise.all([
        getCustomers(),
        getServiceTemplates(),
        supabase.auth.getUser(),
        getMergedAppointments().catch(() => []),
      ]);
      setCustomers(data);
      setTemplates(tpls);
      setOwnerId(user?.id ?? null);
      // 24 小時內即將到來、尚未取消的預約提醒
      const now = Date.now();
      const in24h = now + 24 * 60 * 60 * 1000;
      setUpcomingSoon(appts.filter(a => {
        const t = new Date(a.appointment_time).getTime();
        return t >= now && t <= in24h && a.status !== 'cancelled' && a.status !== 'refunded';
      }));
      // 判斷今日是否公休
      if (user) {
        const profile = await getShopProfileByOwner(user.id).catch(() => null);
        if (profile?.business_hours) {
          const todayKey = getTodayDayKey();
          const todayHours = profile.business_hours[todayKey];
          setIsTodayHoliday(!todayHours?.open);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadCustomers(); }, [loadCustomers]));

  const handleSearch = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!text.trim()) {
      loadCustomers();
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchCustomers(text);
        setCustomers(data);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {/* Header */}
      <View className="px-5 pt-14 pb-2 bg-background">
        <Text className="font-rounded text-2xl font-bold text-foreground mb-1">顧客管理</Text>
        <Text className="font-rounded text-sm text-muted-foreground">共 {customers.length} 位顧客</Text>
      </View>

      {/* 24 小時內預約提醒 */}
      {upcomingSoon.length > 0 && (
        <Pressable
          className="mx-5 mb-2 flex-row items-center gap-2.5 px-4 py-3 rounded-2xl border active:opacity-80"
          style={{ backgroundColor: '#eef0ff', borderColor: '#c9d0ff' }}
          onPress={() => router.push('/(app)/(tabs)/appointments' as any)}
        >
          <BellRing size={16} color="#4a6cf7" />
          <Text className="font-rounded text-sm font-semibold flex-1" style={{ color: '#3a53c4' }}>
            🔔 24 小時內有 {upcomingSoon.length} 筆預約：{upcomingSoon.slice(0, 2).map(a => a.customer_name).join('、')}{upcomingSoon.length > 2 ? ' 等' : ''}
          </Text>
          <ChevronRight size={14} color="#4a6cf7" />
        </Pressable>
      )}

      {/* 今日公休橫幅 */}
      {isTodayHoliday && (
        <View className="mx-5 mb-2 flex-row items-center gap-2.5 px-4 py-3 rounded-2xl border"
          style={{ backgroundColor: '#fff8e0', borderColor: '#f5d87a' }}>
          <AlertCircle size={16} color="#c4860a" />
          <Text className="font-rounded text-sm font-semibold flex-1" style={{ color: '#9a6400' }}>
            今日公休 🌙 請記得更新預約狀態
          </Text>
        </View>
      )}

      {/* 服務項目快捷入口 */}
      {templates.length > 0 && (
        <View className="px-5 mb-3 mt-2">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-1.5">
              <Scissors size={14} color="#e8789a" />
              <Text className="font-rounded text-sm font-semibold text-foreground">服務項目</Text>
            </View>
            <Pressable
              className="flex-row items-center gap-1 active:opacity-70"
              onPress={() => router.push('/(app)/service-templates' as any)}
            >
              <Text className="font-rounded text-xs text-primary">管理</Text>
              <ChevronRight size={12} color="#e8789a" />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
            <View className="flex-row gap-2 px-1 pb-1">
              {templates.map(tpl => (
                <Pressable
                  key={tpl.id}
                  className="rounded-2xl px-3 py-2.5 active:opacity-70"
                  style={{ backgroundColor: tpl.color + '18', borderWidth: 1, borderColor: tpl.color + '44', minWidth: 80 }}
              onPress={() => router.push({ pathname: '/(app)/service-records/new', params: { customerId: undefined, templateId: tpl.id } } as any)}
                >
                  <Text className="font-rounded text-sm font-semibold" style={{ color: tpl.color }}>{tpl.name}</Text>
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Clock size={9} color={tpl.color} />
                    <Text className="font-rounded text-xs" style={{ color: tpl.color + 'aa' }}>{tpl.duration_minutes}分</Text>
                    <Text className="font-rounded text-xs font-medium" style={{ color: tpl.color }}>${Number(tpl.default_amount).toLocaleString()}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                className="rounded-2xl px-3 py-2.5 items-center justify-center active:opacity-70"
                style={{ backgroundColor: '#f5e6ec', borderWidth: 1, borderColor: '#f0d0da', minWidth: 60 }}
                onPress={() => router.push('/(app)/service-templates' as any)}
              >
                <Plus size={16} color="#e8789a" />
                <Text className="font-rounded text-xs text-primary mt-0.5">新增</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}

      {/* 無服務項目時的提示 */}
      {!loading && templates.length === 0 && (
        <Pressable
          className="mx-5 mb-3 bg-card border border-dashed border-primary/40 rounded-2xl p-3 flex-row items-center gap-3 active:opacity-70"
          onPress={() => router.push('/(app)/service-templates' as any)}
        >
          <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
            <Scissors size={18} color="#e8789a" />
          </View>
          <View className="flex-1">
            <Text className="font-rounded text-sm font-semibold text-foreground">設定服務項目模板</Text>
            <Text className="font-rounded text-xs text-muted-foreground">新增常用服務，快速建立預約與記錄</Text>
          </View>
          <ChevronRight size={16} color="#c4a0ae" />
        </Pressable>
      )}

      {/* 搜索欄 */}
      <View className="px-5 mb-3">
        <View className="flex-row items-center bg-card rounded-2xl px-4 border border-border" style={{ height: 48 }}>
          <Search size={18} color="#c4a0ae" />
          <TextInput
            className="flex-1 font-rounded text-base text-foreground ml-2"
            placeholder="搜尋姓名或電話..."
            placeholderTextColor="#c4a0ae"
            value={query}
            onChangeText={handleSearch}
          />
          {searching && <ActivityIndicator size="small" color="#e8789a" />}
        </View>
      </View>

      {/* 顧客列表 */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#e8789a" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item => item.id}
          contentContainerClassName="px-5 pb-24"
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => (
            <CustomerCard
              item={item}
              onPress={() => router.push(`/(app)/customers/${item.id}` as any)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-20 gap-3">
              <User size={48} color="#c4a0ae" />
              <Text className="font-rounded text-base text-muted-foreground">
                {query ? '找不到符合的顧客' : '尚未新增任何顧客'}
              </Text>
            </View>
          }
        />
      )}

      {/* 新增按鈕 */}
      <Pressable
        className="absolute bottom-24 right-5 w-14 h-14 bg-primary rounded-full items-center justify-center active:opacity-80"
        style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}
        onPress={() => router.push('/(app)/customers/new' as any)}
      >
        <Plus size={26} color="#fff" />
      </Pressable>

      {/* 線上預約浮動按鈕 */}
      <Pressable
        className="absolute left-5 flex-row items-center gap-2 bg-primary px-4 rounded-full active:opacity-80"
        style={{ bottom: 96, height: 44, shadowColor: '#e8789a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 }}
        onPress={() => router.push(`/online-booking${ownerId ? `?ownerId=${ownerId}` : ''}` as any)}
      >
        <CalendarDays size={16} color="#fff" />
        <Text className="font-rounded text-sm font-semibold text-white">立即線上預約</Text>
      </Pressable>
    </View>
  );
}
