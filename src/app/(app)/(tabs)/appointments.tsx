import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, ActivityIndicator, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Calendar, Plus, Clock, User, CheckCircle, Globe, Trash2, AlertTriangle } from 'lucide-react-native';
import { getMergedAppointments, updateAppointmentStatus, deleteAppointment, deleteOnlineOrder } from '@/db/api';
import type { UnifiedAppointment } from '@/types/types';

// 統一狀態顯示
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:         { label: '待服務', color: '#e8789a', bg: '#fce9f0' },
  confirmed:       { label: '已確認', color: '#4a6cf7', bg: '#eef0ff' },
  paid:            { label: '已付訂金', color: '#2ea87e', bg: '#e0f5ef' },
  pending_payment: { label: '待付款', color: '#e8a000', bg: '#fef3e6' },
  completed:       { label: '已完成', color: '#5dc0a0', bg: '#e0f5ef' },
  cancelled:       { label: '已取消', color: '#c4a0ae', bg: '#f5eaef' },
};

function formatDateTime(iso: string) {
  const dt = new Date(iso);
  return {
    date: `${dt.getMonth() + 1}/${dt.getDate()}`,
    time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
  };
}

function AppointmentCard({ item, onStatusChange }: { item: UnifiedAppointment; onStatusChange: () => void }) {
  const { date, time } = formatDateTime(item.appointment_time);
  const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending;
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleComplete = async () => {
    if (item.source === 'manual') {
      await updateAppointmentStatus(item.id.replace('manual-', ''), 'completed');
      onStatusChange();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (item.source === 'manual') {
        await deleteAppointment(item.id.replace('manual-', ''));
      } else {
        await deleteOnlineOrder(item.id.replace('online-', ''));
      }
      setShowDeleteConfirm(false);
      onStatusChange();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <Pressable
      className="bg-card rounded-2xl px-4 py-3 mb-3 active:opacity-90"
      style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}
      onPress={() => {
        if (item.source === 'manual') {
          router.push(`/(app)/appointments/${item.id.replace('manual-', '')}` as any);
        } else {
          router.push(`/(app)/online-orders` as any);
        }
      }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          {/* 來源標籤 */}
          <View className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: item.source === 'online' ? '#eef0ff' : '#fce9f0' }}>
            {item.source === 'online'
              ? <Globe size={13} color="#4a6cf7" />
              : <User size={13} color="#e8789a" />
            }
          </View>
          <View className="flex-1">
            <Text className="font-rounded text-sm font-semibold text-foreground" numberOfLines={1}>
              {item.customer_name}
            </Text>
            <Text className="font-rounded text-xs text-muted-foreground" numberOfLines={1}>
              {item.service_name}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: status.bg }}>
            <Text className="font-rounded text-xs font-medium" style={{ color: status.color }}>{status.label}</Text>
          </View>
          {/* 所有來源都顯示刪除按鈕 */}
          <Pressable
            className="w-7 h-7 rounded-full items-center justify-center active:opacity-60"
            style={{ backgroundColor: '#fff0f3' }}
            onPress={(e) => { e.stopPropagation?.(); setShowDeleteConfirm(true); }}
          >
            <Trash2 size={13} color="#e85454" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center gap-1">
          <Calendar size={12} color="#c4a0ae" />
          <Text className="font-rounded text-xs text-muted-foreground">{date}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#c4a0ae" />
          <Text className="font-rounded text-xs text-muted-foreground">{time}</Text>
        </View>
        {item.staff_name && (
          <View className="flex-row items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.staff_color ?? '#ccc' }} />
            <Text className="font-rounded text-xs text-muted-foreground">{item.staff_name}</Text>
          </View>
        )}
        {item.total_amount > 0 && (
          <Text className="font-rounded text-xs font-semibold" style={{ color: '#e8789a' }}>
            ${Number(item.total_amount).toLocaleString()}
          </Text>
        )}
      </View>

      {item.notes ? (
        <Text className="font-rounded text-xs text-muted-foreground mt-1" numberOfLines={1}>
          備註：{item.notes}
        </Text>
      ) : null}

      {item.status === 'pending' && item.source === 'manual' && (
        <Pressable
          className="flex-row items-center justify-center mt-3 py-2 rounded-xl bg-secondary active:opacity-70"
          onPress={(e) => { e.stopPropagation?.(); handleComplete(); }}
        >
          <CheckCircle size={15} color="#5dc0a0" />
          <Text className="font-rounded text-sm text-secondary-foreground ml-1 font-medium">標記完成</Text>
        </Pressable>
      )}
      {item.source === 'online' && (item.status === 'confirmed' || item.status === 'paid') && (
        <Pressable
          className="flex-row items-center justify-center mt-3 gap-2 py-2.5 rounded-xl active:opacity-70"
          style={{ backgroundColor: '#e0f5ef' }}
          onPress={(e) => {
            e.stopPropagation?.();
            router.push(
              `/(app)/service-records/new?onlineOrderId=${item.id.replace('online-', '')}` as any
            );
          }}
        >
          <CheckCircle size={15} color="#5dc0a0" />
          <Text className="font-rounded text-sm font-semibold" style={{ color: '#5dc0a0' }}>完成服務並記錄收入</Text>
        </Pressable>
      )}
      {item.source === 'online' && item.status !== 'confirmed' && item.status !== 'paid' && (
        <View className="flex-row items-center mt-2 gap-1">
          <Globe size={11} color="#4a6cf7" />
          <Text className="font-rounded text-xs" style={{ color: '#4a6cf7' }}>線上訂單，可至「線上預約訂單」查看詳情與修改</Text>
        </View>
      )}
    </Pressable>

    {/* 刪除確認 Modal */}
    <Modal
      visible={showDeleteConfirm}
      transparent
      animationType="fade"
      onRequestClose={() => setShowDeleteConfirm(false)}
    >
      <Pressable
        className="flex-1 bg-black/40 items-center justify-center px-8"
        onPress={() => setShowDeleteConfirm(false)}
      >
        <Pressable
          className="bg-card w-full rounded-3xl p-6 gap-4"
          onPress={() => {/* 阻止冒泡 */}}
        >
          <View className="items-center gap-3">
            <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff0f3' }}>
              <AlertTriangle size={32} color="#e85454" />
            </View>
            <Text className="font-rounded text-lg font-bold text-foreground">確認刪除預約？</Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center">
              刪除後無法復原，{'\n'}確定要刪除此預約嗎？
            </Text>
          </View>
          <View className="flex-row gap-3 mt-2">
            <Pressable
              className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
              onPress={() => setShowDeleteConfirm(false)}
            >
              <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
              style={{ backgroundColor: '#e85454' }}
              disabled={deleting}
              onPress={handleDelete}
            >
              {deleting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

export default function AppointmentsTab() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<UnifiedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMergedAppointments();
      setAppointments(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === 'pending'
    ? appointments.filter(a => ['pending', 'confirmed', 'paid', 'pending_payment'].includes(a.status))
    : appointments;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="px-5 pt-14 pb-3 bg-background">
        <Text className="font-rounded text-2xl font-bold text-foreground mb-3">預約管理</Text>
        <View className="flex-row gap-2">
          {(['pending', 'all'] as const).map(f => (
            <Pressable
              key={f}
              className="px-4 py-1.5 rounded-full active:opacity-70"
              style={{ backgroundColor: filter === f ? '#e8789a' : '#f5e6ec' }}
              onPress={() => setFilter(f)}
            >
              <Text className="font-rounded text-sm font-medium" style={{ color: filter === f ? '#fff' : '#c4a0ae' }}>
                {f === 'pending' ? '待服務' : '全部'}
              </Text>
            </Pressable>
          ))}
          {/* 圖例 */}
          <View className="flex-row items-center gap-1 ml-auto">
            <View className="w-5 h-5 rounded-full bg-primary/15 items-center justify-center">
              <User size={10} color="#e8789a" />
            </View>
            <Text className="font-rounded text-xs text-muted-foreground">手動</Text>
            <View className="w-5 h-5 rounded-full items-center justify-center ml-2" style={{ backgroundColor: '#eef0ff' }}>
              <Globe size={10} color="#4a6cf7" />
            </View>
            <Text className="font-rounded text-xs text-muted-foreground">線上</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#e8789a" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerClassName="px-5 pb-24"
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => <AppointmentCard item={item} onStatusChange={load} />}
          ListEmptyComponent={
            <View className="items-center py-20 gap-3">
              <Calendar size={48} color="#c4a0ae" />
              <Text className="font-rounded text-base text-muted-foreground">目前沒有預約</Text>
            </View>
          }
        />
      )}

      <Pressable
        className="absolute bottom-24 right-5 w-14 h-14 bg-primary rounded-full items-center justify-center active:opacity-80"
        style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 }}
        onPress={() => router.push('/(app)/appointments/new' as any)}
      >
        <Plus size={26} color="#fff" />
      </Pressable>
    </View>
  );
}
