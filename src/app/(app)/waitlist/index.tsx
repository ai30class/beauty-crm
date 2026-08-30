import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Clock, Phone, Trash2, CheckCircle2, XCircle, BellRing } from 'lucide-react-native';
import { getWaitlistEntries, updateWaitlistEntryStatus, deleteWaitlistEntry } from '@/db/api';
import type { WaitlistEntry, WaitlistStatus } from '@/types/types';

const STATUS_META: Record<WaitlistStatus, { label: string; bg: string; fg: string }> = {
  waiting:   { label: '候補中',   bg: '#fff8e0', fg: '#9a6400' },
  notified:  { label: '已通知',   bg: '#e8f0ff', fg: '#4a6cf7' },
  booked:    { label: '已預約',   bg: '#e0f5ef', fg: '#3da870' },
  cancelled: { label: '已取消',   bg: '#f5f0f3', fg: '#a48a94' },
};

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（週${weekday}）`;
}

function EntryCard({ entry, onChanged }: { entry: WaitlistEntry; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[entry.status];

  const setStatus = async (status: WaitlistStatus) => {
    setBusy(true);
    try {
      await updateWaitlistEntryStatus(entry.id, status);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteWaitlistEntry(entry.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="px-4 py-3 border-b border-border gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color="#e8789a" />
          <Text className="font-rounded text-sm font-bold text-foreground">{entry.desired_time}</Text>
          <Text className="font-rounded text-sm text-foreground">・{entry.service_name}</Text>
        </View>
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: meta.bg }}>
          <Text className="font-rounded text-xs font-medium" style={{ color: meta.fg }}>{meta.label}</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        <Text className="font-rounded text-sm text-foreground">{entry.customer_name}</Text>
        <View className="flex-row items-center gap-1">
          <Phone size={12} color="#c4a0ae" />
          <Text className="font-rounded text-sm text-muted-foreground">{entry.customer_phone}</Text>
        </View>
        {entry.staff?.name ? (
          <Text className="font-rounded text-xs text-muted-foreground">指定 {entry.staff.name}</Text>
        ) : null}
      </View>

      {entry.notes ? (
        <Text className="font-rounded text-xs text-muted-foreground">備註：{entry.notes}</Text>
      ) : null}

      {busy ? (
        <View className="py-1"><ActivityIndicator size="small" color="#e8789a" /></View>
      ) : entry.status === 'waiting' || entry.status === 'notified' ? (
        <View className="flex-row items-center gap-4 mt-1">
          {entry.status === 'waiting' && (
            <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={() => setStatus('notified')}>
              <BellRing size={14} color="#4a6cf7" />
              <Text className="font-rounded text-xs font-medium" style={{ color: '#4a6cf7' }}>標記已通知</Text>
            </Pressable>
          )}
          <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={() => setStatus('booked')}>
            <CheckCircle2 size={14} color="#3da870" />
            <Text className="font-rounded text-xs font-medium" style={{ color: '#3da870' }}>已預約</Text>
          </Pressable>
          <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={() => setStatus('cancelled')}>
            <XCircle size={14} color="#c4a0ae" />
            <Text className="font-rounded text-xs font-medium text-muted-foreground">取消</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable className="flex-row items-center gap-1 self-start active:opacity-70 mt-1" onPress={remove}>
          <Trash2 size={13} color="#e85454" />
          <Text className="font-rounded text-xs" style={{ color: '#e85454' }}>移除紀錄</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function WaitlistScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getWaitlistEntries();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = entries.reduce((acc, e) => {
    if (!acc.has(e.desired_date)) acc.set(e.desired_date, []);
    acc.get(e.desired_date)!.push(e);
    return acc;
  }, new Map<string, WaitlistEntry[]>());
  const dateEntries = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  const activeCount = entries.filter(e => e.status === 'waiting' || e.status === 'notified').length;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background border-b border-border">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-rounded text-xl font-bold text-foreground">候補名單</Text>
          <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{activeCount} 位候補中</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#e8789a" /></View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-16 pt-5 gap-5" className="bg-background">
          <Text className="font-rounded text-xs text-muted-foreground -mb-2">
            💡 顧客在線上預約時，遇到已滿的時段可以登記候補；有空位時請主動用電話聯繫顧客
          </Text>
          {dateEntries.length === 0 ? (
            <View className="items-center py-16">
              <Text className="font-rounded text-sm text-muted-foreground">目前沒有候補中的顧客</Text>
            </View>
          ) : (
            dateEntries.map(([date, items]) => (
              <View key={date}>
                <Text className="font-rounded text-sm font-semibold text-muted-foreground mb-2 px-1">{formatDate(date)}</Text>
                <View className="bg-card border border-border rounded-2xl overflow-hidden">
                  {items.map(item => (
                    <EntryCard key={item.id} entry={item} onChanged={load} />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
