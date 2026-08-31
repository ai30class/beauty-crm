import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Animated, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Search, CalendarDays, ChevronLeft, ChevronRight,
  Clock, User2, Phone, FileText, CheckCircle, Loader, XCircle, Edit3,
} from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { getOnlineOrdersByPhone, updateOnlineOrderByPhone, cancelOnlineOrderByPhone } from '@/db/api';
import type { OnlineOrder } from '@/types/types';

// ── 工具 ────────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseLocalDate(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDateFull(iso: string) {
  const d = new Date(iso);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日（週${weekdays[d.getDay()]}）`;
}

// ── 狀態設定 ─────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_payment: { label: '待付款', color: '#e8a000', icon: <Loader size={12} color="#e8a000" /> },
  paid:            { label: '已付訂金', color: '#2ea87e', icon: <CheckCircle size={12} color="#2ea87e" /> },
  confirmed:       { label: '已確認', color: '#4a6cf7', icon: <CheckCircle size={12} color="#4a6cf7" /> },
  completed:       { label: '已完成', color: '#999', icon: <CheckCircle size={12} color="#999" /> },
  cancelled:       { label: '已取消', color: '#e85454', icon: <XCircle size={12} color="#e85454" /> },
  refunded:        { label: '已退款', color: '#aaa', icon: <XCircle size={12} color="#aaa" /> },
};

// ── 月曆元件 ──────────────────────────────────────────────────────────────────
function MonthCalendar({
  year, month, markedDates, selectedDate, onSelectDate,
}: {
  year: number;
  month: number;
  markedDates: Set<string>;
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=週日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];

  const cells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 補齊到 7 的倍數
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View className="gap-1">
      {/* 星期標題 */}
      <View className="flex-row">
        {weekLabels.map((w, i) => (
          <View key={w} className="flex-1 items-center py-1">
            <Text
              className="font-rounded text-xs font-semibold"
              style={{ color: i === 0 ? '#f87171' : i === 6 ? '#818cf8' : '#c4a0ae' }}
            >
              {w}
            </Text>
          </View>
        ))}
      </View>

      {/* 日期格 */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} className="flex-row">
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} className="flex-1" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isMarked = markedDates.has(dateStr);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === todayStr;
            const isSun = col === 0;
            const isSat = col === 6;

            return (
              <Pressable
                key={col}
                className="flex-1 items-center py-1 gap-0.5 active:opacity-70"
                onPress={() => onSelectDate(isSelected ? '' : dateStr)}
              >
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isSelected ? '#e8789a' : isToday ? '#fce9f0' : 'transparent',
                  }}
                >
                  <Text
                    className="font-rounded text-sm font-semibold"
                    style={{
                      color: isSelected ? '#fff'
                        : isToday ? '#e8789a'
                        : isSun ? '#f87171'
                        : isSat ? '#818cf8'
                        : '#555',
                    }}
                  >
                    {day}
                  </Text>
                </View>
                {/* 預約點標記 */}
                <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isMarked ? (isSelected ? '#fff' : '#e8789a') : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── 預約卡片 ──────────────────────────────────────────────────────────────────
function OrderCard({
  order,
  onRefresh,
}: {
  order: OnlineOrder;
  onRefresh: () => void;
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.confirmed;
  const staff = order.staff as { name: string; color: string } | undefined;
  const canEdit = order.status !== 'cancelled' && order.status !== 'refunded' && order.status !== 'completed';

  const [showModal, setShowModal] = useState(false);
  const [editNotes, setEditNotes] = useState(order.notes ?? '');
  const [editDate, setEditDate] = useState<Date>(new Date(order.appointment_time));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editError, setEditError] = useState('');

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const handleSave = async () => {
    setSaving(true); setEditError('');
    try {
      await updateOnlineOrderByPhone(order.id, order.customer_phone, {
        appointment_time: editDate.toISOString(),
        notes: editNotes.trim() || null,
      });
      setShowModal(false);
      onRefresh();
    } catch (e: any) {
      setEditError(e.message ?? '儲存失敗');
    } finally { setSaving(false); }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelOnlineOrderByPhone(order.id, order.customer_phone);
      setShowModal(false);
      onRefresh();
    } catch (e: any) {
      setEditError(e.message ?? '取消失敗');
    } finally { setCancelling(false); }
  };

  return (
    <>
      <View
        className="bg-card rounded-2xl p-4 border border-border gap-3"
        style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 }}
      >
        {/* 服務名稱 + 狀態 */}
        <View className="flex-row items-center justify-between">
          <Text className="font-rounded text-base font-bold text-foreground flex-1 mr-2">{order.service_name}</Text>
          <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: `${meta.color}18` }}>
            {meta.icon}
            <Text className="font-rounded text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</Text>
          </View>
        </View>

        {/* 時間 + 人員 */}
        <View className="flex-row gap-4">
          <View className="flex-row items-center gap-1.5">
            <Clock size={13} color="#c4a0ae" />
            <Text className="font-rounded text-sm text-muted-foreground">{formatTime(order.appointment_time)}</Text>
          </View>
          {staff && (
            <View className="flex-row items-center gap-1.5">
              <View className="w-3 h-3 rounded-full" style={{ backgroundColor: staff.color }} />
              <Text className="font-rounded text-sm text-muted-foreground">{staff.name}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Text className="font-rounded text-sm font-semibold" style={{ color: '#e8789a' }}>
              ${Number(order.total_amount).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* 備註 */}
        {order.notes ? (
          <View className="flex-row items-start gap-1.5 bg-muted/40 rounded-xl px-3 py-2">
            <FileText size={12} color="#c4a0ae" style={{ marginTop: 2 }} />
            <Text className="font-rounded text-xs text-muted-foreground flex-1">{order.notes}</Text>
          </View>
        ) : null}

        {/* 訂金資訊 */}
        {order.booking_mode === 'deposit' && (
          <View className="flex-row items-center justify-between border-t border-border pt-2">
            <Text className="font-rounded text-xs text-muted-foreground">已付訂金</Text>
            <Text className="font-rounded text-xs font-semibold" style={{ color: '#2ea87e' }}>
              ${Number(order.deposit_amount).toLocaleString()}
            </Text>
          </View>
        )}

        {/* 操作按鈕 */}
        {canEdit && (
          <View className="flex-row gap-2 border-t border-border pt-3">
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl active:opacity-70"
              style={{ backgroundColor: '#fce9f0', borderWidth: 1, borderColor: '#f0b0c8' }}
              onPress={() => { setShowModal(true); setEditError(''); }}
            >
              <Edit3 size={14} color="#e8789a" />
              <Text className="font-rounded text-sm font-medium" style={{ color: '#e8789a' }}>修改預約</Text>
            </Pressable>
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-xl active:opacity-70"
              style={{ backgroundColor: '#fff0f3', borderWidth: 1, borderColor: '#f0b0b8' }}
              onPress={handleCancel}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator size="small" color="#e85454" />
                : <>
                    <XCircle size={14} color="#e85454" />
                    <Text className="font-rounded text-sm font-medium" style={{ color: '#e85454' }}>取消預約</Text>
                  </>
              }
            </Pressable>
          </View>
        )}
      </View>

      {/* 修改預約 Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable className="flex-1 bg-black/30" onPress={() => setShowModal(false)} />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8 gap-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="font-rounded text-lg font-bold text-foreground">修改預約</Text>
              <Pressable onPress={() => setShowModal(false)} className="w-8 h-8 items-center justify-center rounded-full active:bg-muted">
                <XCircle size={20} color="#c4a0ae" />
              </Pressable>
            </View>

            {/* 日期 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約日期</Text>
              <Pressable
                className="bg-card border border-border rounded-2xl px-4 justify-center active:opacity-80"
                style={{ height: 48 }}
                onPress={() => setShowDatePicker(v => !v)}
              >
                <Text className="font-rounded text-base text-foreground">{fmtDate(editDate)}</Text>
              </Pressable>
              {showDatePicker && (
                <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
                  <DateTimePicker locale="zh-tw"
                    mode="single"
                    date={editDate}
                    onChange={(p) => {
                      if (p.date) {
                        const nd = p.date as Date;
                        setEditDate(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(),
                          editDate.getHours(), editDate.getMinutes()));
                      }
                      setShowDatePicker(false);
                    }}
                  />
                </View>
              )}
            </View>

            {/* 時間 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約時間</Text>
              <View className="bg-card border border-border rounded-2xl px-4 flex-row items-center gap-2" style={{ height: 48 }}>
                <Clock size={15} color="#c4a0ae" />
                <TextInput
                  className="font-rounded text-base text-foreground w-12 text-center"
                  placeholder="HH" placeholderTextColor="#c4a0ae"
                  value={String(editDate.getHours()).padStart(2, '0')}
                  onChangeText={(v) => {
                    const h = parseInt(v, 10);
                    if (!isNaN(h) && h >= 0 && h <= 23)
                      setEditDate(new Date(editDate.getFullYear(), editDate.getMonth(), editDate.getDate(), h, editDate.getMinutes()));
                  }}
                  keyboardType="numeric" maxLength={2}
                />
                <Text className="font-rounded text-base text-muted-foreground">:</Text>
                <TextInput
                  className="font-rounded text-base text-foreground w-12 text-center"
                  placeholder="MM" placeholderTextColor="#c4a0ae"
                  value={String(editDate.getMinutes()).padStart(2, '0')}
                  onChangeText={(v) => {
                    const m = parseInt(v, 10);
                    if (!isNaN(m) && m >= 0 && m <= 59)
                      setEditDate(new Date(editDate.getFullYear(), editDate.getMonth(), editDate.getDate(), editDate.getHours(), m));
                  }}
                  keyboardType="numeric" maxLength={2}
                />
              </View>
            </View>

            {/* 備註 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註</Text>
              <TextInput
                className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
                placeholder="備註（選填）" placeholderTextColor="#c4a0ae"
                value={editNotes} onChangeText={setEditNotes}
                multiline numberOfLines={2} textAlignVertical="top"
              />
            </View>

            {editError ? <Text className="font-rounded text-sm text-destructive">{editError}</Text> : null}

            <Pressable
              className="bg-primary rounded-2xl items-center justify-center active:opacity-80"
              style={{ height: 52 }}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text className="font-rounded text-white text-base font-semibold">儲存修改</Text>
              }
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────
export default function CustomerLookupScreen() {
  const router = useRouter();
  const { phone: initPhone } = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(initPhone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<OnlineOrder[] | null>(null);

  // 月曆狀態
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>('');

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleSearch = async (searchPhone?: string) => {
    const target = searchPhone ?? phone;
    setError('');
    if (!/^09\d{8}$/.test(target)) {
      setError('請輸入正確的手機號碼（09 開頭 10 碼）');
      return;
    }
    setLoading(true);
    setOrders(null);
    setSelectedDate('');
    try {
      const result = await getOnlineOrdersByPhone(target);
      setOrders(result);
      // 自動跳到最近預約的月份
      if (result.length > 0) {
        const next = result.find(o => new Date(o.appointment_time) >= today) ?? result[0];
        const d = new Date(next.appointment_time);
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
      }
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      // 自動捲到結果區
      setTimeout(() => scrollRef.current?.scrollTo({ y: 300, animated: true }), 100);
    } catch {
      setError('查詢失敗，請稍後重試');
    } finally {
      setLoading(false);
    }
  };

  // 若從預約成功頁帶入手機號，自動觸發查詢
  useEffect(() => {
    if (initPhone && /^09\d{8}$/.test(initPhone)) {
      handleSearch(initPhone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 有預約的日期集合
  const markedDates = new Set<string>(
    (orders ?? []).map(o => toDateStr(parseLocalDate(o.appointment_time)))
  );

  // 選定日期的預約
  const dayOrders = selectedDate
    ? (orders ?? []).filter(o => toDateStr(parseLocalDate(o.appointment_time)) === selectedDate)
    : [];

  // 全部預約按時間排序（未選日期時顯示）
  const allOrders = [...(orders ?? [])].sort(
    (a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime()
  );

  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <CalendarDays size={20} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">查詢我的預約</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-10 gap-4"
        className="flex-1 bg-background"
      >
        {/* 手機號輸入卡 */}
        <View
          className="bg-card rounded-2xl p-4 border border-border gap-3"
          style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}
        >
          <Text className="font-rounded text-sm font-semibold text-foreground">輸入預約時使用的手機號碼</Text>
          <View className="flex-row gap-2">
            <View className="flex-1 flex-row items-center bg-background border border-border rounded-xl px-3 gap-2" style={{ height: 48 }}>
              <Phone size={16} color="#c4a0ae" />
              <TextInput
                ref={inputRef}
                className="flex-1 font-rounded text-sm text-foreground"
                placeholder="09xxxxxxxx"
                placeholderTextColor="#c4a0ae"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={v => { setPhone(v); setError(''); }}
                onSubmitEditing={() => handleSearch()}
                returnKeyType="search"
              />
            </View>
            <Pressable
              className="w-12 h-12 rounded-xl bg-primary items-center justify-center active:opacity-80"
              onPress={() => handleSearch()}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Search size={18} color="#fff" />
              }
            </Pressable>
          </View>
          {error ? (
            <Text className="font-rounded text-xs text-destructive">{error}</Text>
          ) : null}
        </View>

        {/* 查詢結果 */}
        {orders !== null && (
          <Animated.View style={{ opacity: fadeAnim }} className="gap-4">

            {orders.length === 0 ? (
              <View className="bg-card rounded-2xl p-8 border border-border items-center gap-3">
                <User2 size={40} color="#c4a0ae" />
                <Text className="font-rounded text-base font-semibold text-muted-foreground">查無預約紀錄</Text>
                <Text className="font-rounded text-xs text-muted-foreground text-center">
                  此手機號碼目前沒有預約紀錄{'\n'}如需預約請點選「立即線上預約」
                </Text>
              </View>
            ) : (
              <>
                {/* 月曆卡 */}
                <View
                  className="bg-card rounded-2xl p-4 border border-border gap-3"
                  style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}
                >
                  {/* 月份切換 */}
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
                      onPress={() => {
                        if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                        else setCalMonth(m => m - 1);
                        setSelectedDate('');
                      }}
                    >
                      <ChevronLeft size={18} color="#e8789a" />
                    </Pressable>
                    <Text className="font-rounded text-base font-bold text-foreground">
                      {calYear} 年 {monthNames[calMonth]}
                    </Text>
                    <Pressable
                      className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
                      onPress={() => {
                        if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                        else setCalMonth(m => m + 1);
                        setSelectedDate('');
                      }}
                    >
                      <ChevronRight size={18} color="#e8789a" />
                    </Pressable>
                  </View>

                  <MonthCalendar
                    year={calYear}
                    month={calMonth}
                    markedDates={markedDates}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                  />

                  {/* 說明 */}
                  <View className="flex-row items-center gap-2 pt-1">
                    <View className="w-2 h-2 rounded-full bg-primary" />
                    <Text className="font-rounded text-xs text-muted-foreground">有預約的日期</Text>
                  </View>
                </View>

                {/* 選定日期的預約 */}
                {selectedDate ? (
                  <View className="gap-3">
                    <Text className="font-rounded text-sm font-semibold text-foreground">
                      {formatDateFull(selectedDate + 'T00:00:00')} 的預約
                    </Text>
                    {dayOrders.length === 0 ? (
                      <View className="bg-card rounded-2xl p-5 border border-border items-center gap-2">
                        <Text className="font-rounded text-sm text-muted-foreground">此日期無預約</Text>
                      </View>
                    ) : (
                      dayOrders.map(o => <OrderCard key={o.id} order={o} onRefresh={handleSearch} />)
                    )}
                  </View>
                ) : (
                  /* 未選日期：顯示全部預約（依時間排序） */
                  <View className="gap-3">
                    <Text className="font-rounded text-sm font-semibold text-foreground">
                      全部預約（{orders.length} 筆）
                    </Text>
                    {allOrders.map(o => (
                      <View key={o.id} className="gap-1">
                        <Text className="font-rounded text-xs text-muted-foreground px-1">
                          {formatDateFull(o.appointment_time)}
                        </Text>
                        <OrderCard order={o} onRefresh={handleSearch} />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
