import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CalendarDays, Clock, LogOut, Plus, User2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {ActivityIndicator,Pressable, ScrollView, Text, 
  View, 
} from 'react-native';
import { supabase } from '@/client/supabase';
import type { OnlineOrder } from '@/types/types';

export default function MyOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/online-booking/customer-auth' as any); return; }
        setUserEmail(user.email ?? '');
        setUserPhone(user.phone ?? '');

        // 查詢此帳號的所有預約（依 customer_phone 或 customer_email 比對）
        const phone = user.phone ?? '';
        const email = user.email ?? '';

        let query = supabase
          .from('online_orders')
          .select('*')
          .order('appointment_time', { ascending: false });

        if (phone) {
          query = query.eq('customer_phone', phone.replace(/^\+886/, '0'));
        } else if (email) {
          query = query.eq('customer_email', email);
        }

        const { data } = await query;
        setOrders(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/online-booking' as any);
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return { text: '待確認', color: '#e8a050', bg: '#fff8ee' };
      case 'confirmed': return { text: '已確認', color: '#2ea87e', bg: '#e6f7f2' };
      case 'cancelled': return { text: '已取消', color: '#c4a0ae', bg: '#f5eef2' };
      case 'completed': return { text: '已完成', color: '#8b9de8', bg: '#eef0fd' };
      default: return { text: s, color: '#666', bg: '#f0f0f0' };
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background border-b border-border">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">我的預約記錄</Text>
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted"
          onPress={handleLogout}
        >
          <LogOut size={18} color="#c4a0ae" />
        </Pressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-12">
        {/* 用戶資訊 */}
        <View className="mx-5 mt-4 mb-3 bg-card rounded-2xl p-4 border border-border flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center">
            <User2 size={20} color="#e8789a" />
          </View>
          <View className="flex-1">
            <Text className="font-rounded text-sm font-semibold text-foreground">
              {userPhone ? `+886 ${userPhone.replace(/^\+?886/, '')}` : userEmail}
            </Text>
            <Text className="font-rounded text-xs text-muted-foreground">已登入</Text>
          </View>
          <Pressable
            className="flex-row items-center gap-1 px-3 py-2 rounded-xl bg-primary/10 active:opacity-70"
            onPress={() => router.push('/online-booking' as any)}
          >
            <Plus size={13} color="#e8789a" />
            <Text className="font-rounded text-xs text-primary font-semibold">新增預約</Text>
          </Pressable>
        </View>

        {/* 預約列表 */}
        {orders.length === 0 ? (
          <View className="items-center py-16 gap-3">
            <CalendarDays size={48} color="#d4b8c4" />
            <Text className="font-rounded text-base font-semibold text-muted-foreground">尚無預約記錄</Text>
            <Text className="font-rounded text-sm text-muted-foreground">立即預約您的第一次服務吧 🌸</Text>
            <Pressable
              className="mt-2 bg-primary rounded-2xl px-6 py-3 active:opacity-80"
              onPress={() => router.push('/online-booking' as any)}
            >
              <Text className="font-rounded text-sm text-white font-semibold">立即預約</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mx-5 gap-3">
            {orders.map(order => {
              const s = statusLabel(order.status);
              const apptDate = new Date(order.appointment_time);
              return (
                <View key={order.id} className="bg-card rounded-2xl p-4 border border-border">
                  <View className="flex-row items-start justify-between mb-2">
                    <Text className="font-rounded text-base font-semibold text-foreground flex-1 mr-2" numberOfLines={1}>
                      {order.service_name ?? '服務'}
                    </Text>
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg }}>
                      <Text className="font-rounded text-xs font-semibold" style={{ color: s.color }}>{s.text}</Text>
                    </View>
                  </View>
                  <View className="gap-1.5">
                    <View className="flex-row items-center gap-2">
                      <CalendarDays size={12} color="#c4a0ae" />
                      <Text className="font-rounded text-xs text-muted-foreground">
                        {apptDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Clock size={12} color="#c4a0ae" />
                      <Text className="font-rounded text-xs text-muted-foreground">
                        {apptDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        {order.staff?.name ? `　${order.staff.name}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
