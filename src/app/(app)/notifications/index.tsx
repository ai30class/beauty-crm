import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight, CheckCheck } from 'lucide-react-native';
import { getOwnerNotifications, markOwnerNotificationsRead } from '@/db/api';
import type { OwnerNotification } from '@/types/types';

// 通知收到的時間：今天顯示「今天 14:32」，其他日子顯示「9/20 14:32」
function formatReceived(iso: string): string {
  const d = new Date(iso);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return isToday ? `今天 ${hhmm}` : `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

function NotificationCard({ item, onOpen }: { item: OwnerNotification; onOpen: (n: OwnerNotification) => void }) {
  const unread = !item.read_at;
  const waitingTransfer = item.title.includes('待確認匯款');
  return (
    <Pressable
      className="rounded-2xl px-4 py-3 mb-3 border active:opacity-80"
      style={{
        backgroundColor: unread ? '#fff5f8' : '#ffffff',
        borderColor: unread ? '#f5c0d3' : '#eee2e8',
      }}
      onPress={() => onOpen(item)}
    >
      <View className="flex-row items-center gap-2 mb-1">
        {unread && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#e8789a' }} />}
        <Text
          className="font-rounded text-sm font-bold flex-1"
          style={{ color: waitingTransfer ? '#9a6400' : '#3d2b32' }}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.is_new_customer && (
          <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: '#e0f5ef' }}>
            <Text className="font-rounded" style={{ fontSize: 11, color: '#2ea87e', fontWeight: '600' }}>新客</Text>
          </View>
        )}
      </View>
      <Text className="font-rounded text-sm" style={{ color: unread ? '#3d2b32' : '#9a9497' }}>{item.body}</Text>
      <View className="flex-row items-center justify-between mt-2">
        <Text className="font-rounded text-xs text-muted-foreground">{formatReceived(item.created_at)}</Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="font-rounded text-xs" style={{ color: '#e8789a' }}>查看訂單</Text>
          <ChevronRight size={12} color="#e8789a" />
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<OwnerNotification[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await getOwnerNotifications());
      setError('');
    } catch (e: any) {
      setError(e?.message ?? '載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unreadCount = items.filter(i => !i.read_at).length;

  // 點一筆：先在畫面上標成已讀，再到「線上預約訂單」處理；標已讀失敗不擋操作，下次進來會再顯示未讀
  const openItem = (n: OwnerNotification) => {
    if (!n.read_at) {
      const now = new Date().toISOString();
      setItems(prev => prev.map(i => (i.id === n.id ? { ...i, read_at: now } : i)));
      markOwnerNotificationsRead([n.id]).catch(() => {});
    }
    router.push('/(app)/online-orders' as any);
  };

  const readAll = async () => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(i => (i.read_at ? i : { ...i, read_at: now })));
    try {
      await markOwnerNotificationsRead();
    } catch {
      load();
    }
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background border-b border-border">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-rounded text-xl font-bold text-foreground">新預約通知</Text>
          <Text className="font-rounded text-xs text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} 筆未讀` : '全部都看過了'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            className="flex-row items-center gap-1 px-3 py-2 rounded-full active:opacity-70"
            style={{ backgroundColor: '#fce9f0' }}
            onPress={readAll}
          >
            <CheckCheck size={14} color="#e8789a" />
            <Text className="font-rounded text-xs font-medium" style={{ color: '#e8789a' }}>全部標為已讀</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#e8789a" /></View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-16 pt-5" className="bg-background">
          <Text className="font-rounded text-xs text-muted-foreground mb-3">
            💡 顧客從預約頁預約成功時，這裡會自動出現一筆。你或員工自己在後台排的預約不會通知。
          </Text>
          {error ? (
            <View className="items-center py-16">
              <Text className="font-rounded text-sm" style={{ color: '#e85454' }}>{error}</Text>
            </View>
          ) : items.length === 0 ? (
            <View className="items-center py-16">
              <Text className="font-rounded text-sm text-muted-foreground">目前還沒有新預約通知</Text>
            </View>
          ) : (
            <>
              {items.map(item => <NotificationCard key={item.id} item={item} onOpen={openItem} />)}
              {items.length >= 50 && (
                <Text className="font-rounded text-xs text-muted-foreground text-center mt-1">只顯示最近 50 筆</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
