import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, FlatList,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Check, X, ShoppingBag, Pencil } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { getOnlineOrders, updateOnlineOrderStatus, updateOnlineOrder, getStaff, getOnlineOrderAddonsByOrderIds } from '@/db/api';
import type { OnlineOrder, Staff } from '@/types/types';

// ── 共用常數 ──────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending_payment: { label: '待付款', bg: '#fef3e6', text: '#e8a000' },
  paid:            { label: '已付訂金', bg: '#e6f5ef', text: '#2ea87e' },
  confirmed:       { label: '已確認', bg: '#e8f0ff', text: '#4a6cf7' },
  completed:       { label: '已完成', bg: '#f0f0f0', text: '#888' },
  cancelled:       { label: '已取消', bg: '#fce8e8', text: '#e85454' },
  refunded:        { label: '已退款', bg: '#f5f5f5', text: '#aaa' },
};

const BOOKING_MODE_META: Record<string, { label: string; bg: string; text: string }> = {
  deposit: { label: '付訂金', bg: '#fce9f0', text: '#e8789a' },
  direct:  { label: '免訂金', bg: '#e8f5e9', text: '#3da870' },
};

// ── 編輯彈窗 ──────────────────────────────────────────────
function EditModal({
  order,
  staffList,
  onClose,
  onSaved,
}: {
  order: OnlineOrder;
  staffList: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initDate = new Date(order.appointment_time);
  const [apptDate, setApptDate] = useState<Date>(initDate);
  const [staffId, setStaffId] = useState<string | null>(order.staff_id);
  const [notes, setNotes] = useState(order.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const apptISO = apptDate.toISOString();
      const endDate = new Date(apptDate.getTime() + order.duration_minutes * 60000);
      await updateOnlineOrder(order.id, {
        appointment_time: apptISO,
        end_time: endDate.toISOString(),
        staff_id: staffId,
        notes: notes.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="bg-background rounded-t-3xl"
        style={{ paddingBottom: 34 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pt-5 pb-4 gap-4">
          {/* 標題 */}
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-rounded text-lg font-bold text-foreground">調整預約</Text>
            <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center rounded-full active:bg-muted">
              <X size={20} color="#c4a0ae" />
            </Pressable>
          </View>

          {/* 顧客 & 服務（唯讀提示） */}
          <View className="bg-muted/40 rounded-2xl px-4 py-3 gap-1">
            <Text className="font-rounded text-xs text-muted-foreground">顧客</Text>
            <Text className="font-rounded text-sm font-semibold text-foreground">{order.customer_name}　{order.customer_phone}</Text>
            <Text className="font-rounded text-xs text-muted-foreground mt-1">服務</Text>
            <Text className="font-rounded text-sm text-foreground">{order.service_name}　{order.duration_minutes} 分鐘</Text>
          </View>

          {/* 預約時間 */}
          <View>
            <Text className="font-rounded text-sm font-semibold text-foreground mb-2">預約時間</Text>
            <Pressable
              className="flex-row items-center bg-card border border-border rounded-xl px-4 py-3 active:opacity-70"
              onPress={() => setShowDatePicker(v => !v)}
            >
              <Text className="font-rounded text-sm text-foreground flex-1">{toLocalDateStr(apptDate)}</Text>
              <Pencil size={14} color="#e8789a" />
            </Pressable>
            {showDatePicker && (
              <View className="mt-2 bg-card rounded-2xl border border-border overflow-hidden">
                <DateTimePicker locale="zh-tw"
                  mode="single"
                  date={apptDate}
                  onChange={({ date }: { date: unknown }) => {
                    if (date) {
                      const next = new Date(date as string | Date);
                      next.setHours(apptDate.getHours(), apptDate.getMinutes(), 0, 0);
                      setApptDate(next);
                      setShowDatePicker(false);
                    }
                  }}
                />
              </View>
            )}
            {/* 時間微調：HH 與 MM */}
            <View className="flex-row gap-2 mt-2">
              {(['小時', '分鐘'] as const).map((label, idx) => {
                const val = idx === 0 ? apptDate.getHours() : apptDate.getMinutes();
                const max = idx === 0 ? 23 : 55;
                const step = idx === 0 ? 1 : 5;
                const set = (n: number) => {
                  const next = new Date(apptDate);
                  if (idx === 0) next.setHours(n); else next.setMinutes(n);
                  setApptDate(next);
                };
                return (
                  <View key={label} className="flex-1 bg-card border border-border rounded-xl flex-row items-center px-3 py-2">
                    <Pressable onPress={() => set(Math.max(0, val - step))} className="w-7 h-7 items-center justify-center active:opacity-60">
                      <Text className="font-rounded text-lg text-primary">‹</Text>
                    </Pressable>
                    <Text className="font-rounded text-sm text-foreground flex-1 text-center">
                      {String(val).padStart(2, '0')} {label}
                    </Text>
                    <Pressable onPress={() => set(Math.min(max, val + step))} className="w-7 h-7 items-center justify-center active:opacity-60">
                      <Text className="font-rounded text-lg text-primary">›</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 服務人員 */}
          {staffList.length > 0 && (
            <View>
              <Text className="font-rounded text-sm font-semibold text-foreground mb-2">服務人員</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                <View className="flex-row gap-2 px-1">
                  <Pressable
                    className="px-3 py-2 rounded-full border active:opacity-70"
                    style={{ borderColor: staffId === null ? '#e8789a' : '#e0d0d8', backgroundColor: staffId === null ? '#fce9f0' : '#fff' }}
                    onPress={() => setStaffId(null)}
                  >
                    <Text className="font-rounded text-sm" style={{ color: staffId === null ? '#e8789a' : '#c4a0ae' }}>不指定</Text>
                  </Pressable>
                  {staffList.map(s => (
                    <Pressable
                      key={s.id}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-full border active:opacity-70"
                      style={{ borderColor: staffId === s.id ? s.color : '#e0d0d8', backgroundColor: staffId === s.id ? s.color + '18' : '#fff' }}
                      onPress={() => setStaffId(s.id)}
                    >
                      <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <Text className="font-rounded text-sm" style={{ color: staffId === s.id ? s.color : '#c4a0ae' }}>{s.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* 備註 */}
          <View>
            <Text className="font-rounded text-sm font-semibold text-foreground mb-2">備註</Text>
            <TextInput
              className="bg-card border border-border rounded-xl px-4 py-3 font-rounded text-sm text-foreground"
              placeholder="可填寫客戶特殊需求..."
              placeholderTextColor="#c4a0ae"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          {error ? <Text className="font-rounded text-sm text-destructive">{error}</Text> : null}

          <Pressable
            className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80"
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text className="font-rounded text-base font-semibold text-white">儲存修改</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function OnlineOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [addonsByOrder, setAddonsByOrder] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending_payment' | 'confirmed'>('all');
  const [editingOrder, setEditingOrder] = useState<OnlineOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([getOnlineOrders(), getStaff()]);
      setOrders(o);
      setStaffList(s);
      const addons = await getOnlineOrderAddonsByOrderIds(o.map(x => x.id));
      const map: Record<string, string[]> = {};
      for (const a of addons) {
        (map[a.order_id] ??= []).push(a.name);
      }
      setAddonsByOrder(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.join('、')])));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const handleConfirm = async (o: OnlineOrder) => {
    await updateOnlineOrderStatus(o.id, 'confirmed');
    load();
  };

  const handleCancel = async (o: OnlineOrder) => {
    await updateOnlineOrderStatus(o.id, 'cancelled');
    load();
  };

  const FILTERS: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'pending_payment', label: '待付款' },
    { key: 'paid', label: '已付訂金' },
    { key: 'confirmed', label: '已確認' },
  ];

  // 可編輯的狀態（已取消 / 已完成 / 已退款 不可改）
  const canEdit = (o: OnlineOrder) => !['cancelled', 'completed', 'refunded'].includes(o.status);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">線上預約訂單</Text>
      </View>

      {/* 篩選標籤 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b border-border" contentContainerClassName="px-5 pb-2 gap-2 flex-row">
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            className="px-4 py-1.5 rounded-full active:opacity-70"
            style={{ backgroundColor: filter === f.key ? '#e8789a' : '#fce9f0' }}
            onPress={() => setFilter(f.key)}
          >
            <Text className="font-rounded text-sm font-medium" style={{ color: filter === f.key ? '#fff' : '#e8789a' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ShoppingBag size={48} color="#c4a0ae" />
          <Text className="font-rounded text-base text-muted-foreground">尚無預約訂單</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="px-5 py-4 gap-3"
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.cancelled;
            const d = new Date(item.appointment_time);
            const apptStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

            return (
              <View
                className="bg-card rounded-2xl p-4 border border-border gap-2"
                style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="font-rounded text-base font-bold text-foreground">{item.service_name}</Text>
                    {addonsByOrder[item.id] && (
                      <Text className="font-rounded text-xs mt-0.5" style={{ color: '#e8a87c' }}>+ 加購：{addonsByOrder[item.id]}</Text>
                    )}
                    <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{apptStr}</Text>
                  </View>
                  <View className="flex-row gap-1.5 ml-2 items-center">
                    {item.booking_mode && BOOKING_MODE_META[item.booking_mode] && (
                      <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: BOOKING_MODE_META[item.booking_mode].bg }}>
                        <Text className="font-rounded" style={{ fontSize: 10, color: BOOKING_MODE_META[item.booking_mode].text, fontWeight: '600' }}>
                          {BOOKING_MODE_META[item.booking_mode].label}
                        </Text>
                      </View>
                    )}
                    <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: meta.bg }}>
                      <Text className="font-rounded text-xs font-semibold" style={{ color: meta.text }}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row gap-4">
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground">顧客</Text>
                    <Text className="font-rounded text-sm text-foreground font-medium">{item.customer_name}</Text>
                  </View>
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground">電話</Text>
                    <Text className="font-rounded text-sm text-foreground">{item.customer_phone}</Text>
                  </View>
                  {item.staff && (
                    <View>
                      <Text className="font-rounded text-xs text-muted-foreground">人員</Text>
                  <Text className="font-rounded text-sm text-foreground">{item.staff.name}</Text>
                    </View>
                  )}
                </View>

                <View className="flex-row items-center justify-between border-t border-border pt-2">
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground">服務費 / 訂金</Text>
                    <Text className="font-rounded text-sm font-semibold text-foreground">
                      ${Number(item.total_amount).toLocaleString()} /{' '}
                      <Text style={{ color: '#e8789a' }}>${Number(item.deposit_amount).toLocaleString()}</Text>
                    </Text>
                  </View>
                  <View className="flex-row gap-2 items-center">
                    {/* 修改按鈕（可編輯狀態才顯示） */}
                    {canEdit(item) && (
                      <Pressable
                        className="flex-row items-center gap-1 bg-muted px-3 py-1.5 rounded-full active:opacity-70"
                        onPress={() => setEditingOrder(item)}
                      >
                        <Pencil size={12} color="#c4a0ae" />
                        <Text className="font-rounded text-xs font-medium text-muted-foreground">微調</Text>
                      </Pressable>
                    )}
                    {item.status === 'paid' && (
                      <>
                        <Pressable
                          className="flex-row items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-full active:opacity-70"
                          onPress={() => handleConfirm(item)}
                        >
                          <Check size={13} color="#e8789a" />
                          <Text className="font-rounded text-xs font-medium text-primary">確認</Text>
                        </Pressable>
                        <Pressable
                          className="flex-row items-center gap-1 bg-destructive/10 px-3 py-1.5 rounded-full active:opacity-70"
                          onPress={() => handleCancel(item)}
                        >
                          <X size={13} color="#e85454" />
                          <Text className="font-rounded text-xs font-medium text-destructive">取消</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
                {/* 完成服務按鈕：paid 或 confirmed 狀態皆可操作 */}
                {(item.status === 'paid' || item.status === 'confirmed') && (
                  <Pressable
                    className="flex-row items-center justify-center gap-2 rounded-2xl py-3 mt-1 active:opacity-80"
                    style={{ backgroundColor: '#e0f5ef' }}
                    onPress={() =>
                      router.push(
                        `/(app)/service-records/new?onlineOrderId=${item.id}` as any
                      )
                    }
                  >
                    <Check size={16} color="#5dc0a0" />
                    <Text className="font-rounded text-sm font-semibold" style={{ color: '#5dc0a0' }}>
                      完成服務並記錄收入
                    </Text>
                  </Pressable>
                )}
                {item.notes ? (
                  <Text className="font-rounded text-xs text-muted-foreground" numberOfLines={2}>備：{item.notes}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {/* 編輯彈窗 */}
      {editingOrder && (
        <EditModal
          order={editingOrder}
          staffList={staffList}
          onClose={() => setEditingOrder(null)}
          onSaved={load}
        />
      )}
    </View>
  );
}
