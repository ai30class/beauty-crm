import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, CalendarDays, Clock, User, Globe, ChevronLeft, ChevronRight, Users,
} from 'lucide-react-native';
import { getMergedAppointments, getActiveStaff, getShopProfile, getHolidays } from '@/db/api';
import type { UnifiedAppointment, Staff, BusinessHours, Holiday } from '@/types/types';

const DAY_KEYS: (keyof BusinessHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ── 工具 ─────────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toApptDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const prefix = dateStr === today ? '今天' : dateStr === tomorrow ? '明天' : '';
  return `${prefix ? prefix + '・' : ''}${d.getMonth() + 1}/${d.getDate()}（週${weekdays[d.getDay()]}）`;
}
// 週一為一週起點，符合排班表慣例
function getMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
function timeToMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:         { label: '待服務', color: '#e8789a', bg: '#fce9f0' },
  confirmed:       { label: '已確認', color: '#4a6cf7', bg: '#eef0ff' },
  paid:            { label: '已付訂金', color: '#2ea87e', bg: '#e0f5ef' },
  pending_payment: { label: '待付款', color: '#e8a000', bg: '#fef3e6' },
  completed:       { label: '已完成', color: '#999', bg: '#f0f0f0' },
  cancelled:       { label: '已取消', color: '#c4a0ae', bg: '#f5eaef' },
};

// ── 預約卡 ────────────────────────────────────────────────────────────────────
function ApptCard({ item }: { item: UnifiedAppointment }) {
  const status = STATUS_META[item.status] ?? STATUS_META.pending;
  return (
    <View
      className="bg-card rounded-2xl px-4 py-3 border border-border gap-2"
      style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}
    >
      {/* 頂排：姓名 + 狀態 */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <View
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: item.source === 'online' ? '#eef0ff' : '#fce9f0' }}
          >
            {item.source === 'online'
              ? <Globe size={13} color="#4a6cf7" />
              : <User size={13} color="#e8789a" />
            }
          </View>
          <Text className="font-rounded text-sm font-bold text-foreground flex-1" numberOfLines={1}>
            {item.customer_name}
          </Text>
        </View>
        <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: status.bg }}>
          <Text className="font-rounded" style={{ fontSize: 11, color: status.color, fontWeight: '600' }}>{status.label}</Text>
        </View>
      </View>

      {/* 服務名稱 */}
      <Text className="font-rounded text-sm text-muted-foreground" numberOfLines={1}>{item.service_name}</Text>

      {/* 時間 + 人員 + 費用 */}
      <View className="flex-row items-center gap-3 flex-wrap">
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#c4a0ae" />
          <Text className="font-rounded text-xs text-muted-foreground">
            {formatTime(item.appointment_time)}
            {item.duration_minutes > 0 ? ` · ${item.duration_minutes}分` : ''}
          </Text>
        </View>
        {item.staff_name && (
          <View className="flex-row items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.staff_color ?? '#e8789a' }} />
            <Text className="font-rounded text-xs text-muted-foreground">{item.staff_name}</Text>
          </View>
        )}
        {item.customer_phone ? (
          <Text className="font-rounded text-xs text-muted-foreground">{item.customer_phone}</Text>
        ) : null}
        {item.total_amount > 0 && (
          <Text className="font-rounded text-xs font-semibold" style={{ color: '#e8789a' }}>
            ${Number(item.total_amount).toLocaleString()}
          </Text>
        )}
      </View>

      {item.notes ? (
        <Text className="font-rounded text-xs text-muted-foreground" numberOfLines={1}>📝 {item.notes}</Text>
      ) : null}
    </View>
  );
}

// 週視圖時間軸：固定假設範圍 9:00–21:00，涵蓋大多數美業診所的營業時段
const TIMELINE_START_MIN = 9 * 60;
const TIMELINE_END_MIN = 21 * 60;
const TRACK_HEIGHT = 260;
const HOUR_MARKS = [9, 12, 15, 18, 21];

// ── 主頁面 ────────────────────────────────────────────────────────────────────
export default function StaffScheduleScreen() {
  const router = useRouter();
  const today = toDateStr(new Date());

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [allAppts, setAllAppts] = useState<UnifiedAppointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = 全部
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, staff, profile] = await Promise.all([
        getMergedAppointments(),
        getActiveStaff(),
        getShopProfile(),
      ]);
      // 只顯示今天及之後、非取消的
      const upcoming = data.filter(a =>
        toApptDateStr(a.appointment_time) >= today &&
        !['cancelled', 'refunded'].includes(a.status)
      );
      setAllAppts(upcoming);
      setStaffList(staff);
      setBusinessHours(profile?.business_hours ?? null);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 目前這一週涵蓋到的月份可能跨月，公休資料兩個月都要查
  const loadHolidays = useCallback(async (start: Date) => {
    const end = addDays(start, 6);
    const monthKeys = new Set([
      `${start.getFullYear()}-${start.getMonth() + 1}`,
      `${end.getFullYear()}-${end.getMonth() + 1}`,
    ]);
    const results = await Promise.all(
      [...monthKeys].map(key => {
        const [y, m] = key.split('-').map(Number);
        return getHolidays(y, m);
      })
    );
    setHolidays(results.flat());
  }, []);

  useFocusEffect(useCallback(() => { loadHolidays(weekStart); }, [weekStart, loadHolidays]));

  // 有預約的日期集合（月曆用）
  const markedDates = new Set(allAppts.map(a => toApptDateStr(a.appointment_time)));

  // 選定日期的預約（依時間排序，月曆模式用）
  const dayAppts = allAppts
    .filter(a => toApptDateStr(a.appointment_time) === selectedDate)
    .sort((a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime());

  // ── 月曆 ─────────────────────────────────────────────────────────────────
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const calCells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calCells.length % 7 !== 0) calCells.push(null);

  // ── 週視圖 ─────────────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];
  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Users size={20} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">設計師排班表</Text>
        <Pressable
          className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
          onPress={load}
        >
          <CalendarDays size={18} color="#e8789a" />
        </Pressable>
      </View>

      {/* 週／月切換 */}
      <View className="flex-row gap-2 px-5 mb-3">
        {(['week', 'month'] as const).map(m => (
          <Pressable
            key={m}
            className="px-4 py-1.5 rounded-full active:opacity-70"
            style={{ backgroundColor: viewMode === m ? '#e8789a' : '#f5e6ec' }}
            onPress={() => setViewMode(m)}
          >
            <Text className="font-rounded text-sm font-medium" style={{ color: viewMode === m ? '#fff' : '#c4a0ae' }}>
              {m === 'week' ? '週' : '月'}
            </Text>
          </Pressable>
        ))}
      </View>

      {viewMode === 'week' ? (
        <ScrollView className="flex-1" contentContainerClassName="pb-10">
          {/* 週切換 */}
          <View className="flex-row items-center justify-between px-5 mb-3">
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => setWeekStart(w => addDays(w, -7))}>
              <ChevronLeft size={18} color="#e8789a" />
            </Pressable>
            <Text className="font-rounded text-sm font-bold text-foreground">{weekLabel}</Text>
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => setWeekStart(w => addDays(w, 7))}>
              <ChevronRight size={18} color="#e8789a" />
            </Pressable>
          </View>

          {/* 人員篩選 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="px-5 gap-2">
            <Pressable
              className="px-3.5 py-1.5 rounded-full active:opacity-70"
              style={{ backgroundColor: selectedStaffId === null ? '#e8789a' : '#f5e6ec' }}
              onPress={() => setSelectedStaffId(null)}
            >
              <Text className="font-rounded text-xs font-medium" style={{ color: selectedStaffId === null ? '#fff' : '#c4a0ae' }}>全部</Text>
            </Pressable>
            {staffList.map(s => (
              <Pressable
                key={s.id}
                className="px-3.5 py-1.5 rounded-full active:opacity-70"
                style={{ backgroundColor: selectedStaffId === s.id ? s.color : s.color + '18' }}
                onPress={() => setSelectedStaffId(s.id)}
              >
                <Text className="font-rounded text-xs font-medium" style={{ color: selectedStaffId === s.id ? '#fff' : s.color }}>{s.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View className="items-center py-10"><ActivityIndicator color="#e8789a" /></View>
          ) : (
            <View className="px-5 flex-row" style={{ gap: 2 }}>
              {/* 時間刻度 */}
              <View style={{ width: 28, height: TRACK_HEIGHT }}>
                {HOUR_MARKS.map(h => (
                  <Text
                    key={h}
                    className="font-rounded"
                    style={{
                      position: 'absolute',
                      top: ((h * 60 - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT - 6,
                      fontSize: 10,
                      color: '#c4a0ae',
                    }}
                  >
                    {h}
                  </Text>
                ))}
              </View>

              {/* 7 天欄位 */}
              {weekDays.map(d => {
                const dateStr = toDateStr(d);
                const dayKey = DAY_KEYS[d.getDay()];
                const dayHours = businessHours?.[dayKey];
                const shopClosed = dayHours?.open === false || holidays.some(h => h.holiday_date === dateStr && !h.staff_id);
                const dayAppointments = allAppts.filter(a => toApptDateStr(a.appointment_time) === dateStr);

                return (
                  <View key={dateStr} style={{ flex: 1, gap: 4 }}>
                    <Text className="font-rounded text-center" style={{ fontSize: 11, color: dateStr === today ? '#e8789a' : '#7a6a70', fontWeight: dateStr === today ? '700' : '400' }}>
                      {d.getDate()}
                    </Text>
                    <View style={{ height: TRACK_HEIGHT, backgroundColor: shopClosed ? '#f5f0f2' : '#fdf1f5', borderRadius: 8, overflow: 'hidden', position: 'relative', flexDirection: 'row', gap: 1 }}>
                      {shopClosed ? (
                        <Text className="font-rounded" style={{ position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#c4a0ae' }}>休</Text>
                      ) : selectedStaffId === null ? (
                        // 全部模式：一人一條細軌道，不重疊混色
                        staffList.map(s => {
                          const staffOff = holidays.some(h => h.holiday_date === dateStr && h.staff_id === s.id);
                          return (
                            <View key={s.id} style={{ flex: 1, height: '100%', position: 'relative' }}>
                              {staffOff ? null : dayAppointments.filter(a => a.staff_name === s.name).map(a => {
                                const startMin = Math.max(timeToMinutes(a.appointment_time), TIMELINE_START_MIN);
                                const endMin = Math.min(startMin + (a.duration_minutes || 30), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <View key={a.id} style={{ position: 'absolute', left: 1, right: 1, top, height: h, backgroundColor: s.color, borderRadius: 3 }} />
                                );
                              })}
                            </View>
                          );
                        })
                      ) : (
                        // 單一人員模式：只顯示這位的預約
                        (() => {
                          const staff = staffList.find(s => s.id === selectedStaffId);
                          const staffOff = holidays.some(h => h.holiday_date === dateStr && h.staff_id === selectedStaffId);
                          if (staffOff || !staff) {
                            return staffOff ? (
                              <Text className="font-rounded" style={{ position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#c4a0ae' }}>休</Text>
                            ) : null;
                          }
                          return (
                            <View style={{ flex: 1, height: '100%', position: 'relative' }}>
                              {dayAppointments.filter(a => a.staff_name === staff.name).map(a => {
                                const startMin = Math.max(timeToMinutes(a.appointment_time), TIMELINE_START_MIN);
                                const endMin = Math.min(startMin + (a.duration_minutes || 30), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <View key={a.id} style={{ position: 'absolute', left: 2, right: 2, top, height: h, backgroundColor: staff.color, borderRadius: 4 }} />
                                );
                              })}
                            </View>
                          );
                        })()
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 人員色圖例 */}
          {selectedStaffId === null && staffList.length > 0 && (
            <View className="flex-row flex-wrap gap-3 px-5 mt-4">
              {staffList.map(s => (
                <View key={s.id} className="flex-row items-center gap-1.5">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <Text className="font-rounded text-xs text-muted-foreground">{s.name}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
      <ScrollView className="flex-1" contentContainerClassName="pb-10">
        {/* 月曆卡 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border"
          style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}>

          {/* 月份切換 */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => {
                if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                else setCalMonth(m => m - 1);
              }}>
              <ChevronLeft size={18} color="#e8789a" />
            </Pressable>
            <Text className="font-rounded text-base font-bold text-foreground">
              {calYear} 年 {monthNames[calMonth]}
            </Text>
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => {
                if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                else setCalMonth(m => m + 1);
              }}>
              <ChevronRight size={18} color="#e8789a" />
            </Pressable>
          </View>

          {/* 星期標題 */}
          <View className="flex-row mb-1">
            {weekLabels.map((w, i) => (
              <View key={w} className="flex-1 items-center">
                <Text className="font-rounded text-xs font-semibold"
                  style={{ color: i === 0 ? '#f87171' : i === 6 ? '#818cf8' : '#c4a0ae' }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* 日期格 */}
          {Array.from({ length: calCells.length / 7 }, (_, row) => (
            <View key={row} className="flex-row">
              {calCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} className="flex-1" />;
                const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isMarked = markedDates.has(ds);
                const isSel = selectedDate === ds;
                const isToday = ds === today;
                const isPast = ds < today;
                return (
                  <Pressable key={col} className="flex-1 items-center py-0.5 gap-0.5 active:opacity-70"
                    onPress={() => setSelectedDate(ds)}>
                    <View className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: isSel ? '#e8789a' : isToday ? '#fce9f0' : 'transparent' }}>
                      <Text className="font-rounded text-sm font-semibold"
                        style={{
                          color: isSel ? '#fff' : isToday ? '#e8789a' : isPast ? '#d0c0c8'
                            : col === 0 ? '#f87171' : col === 6 ? '#818cf8' : '#444',
                        }}>
                        {day}
                      </Text>
                    </View>
                    <View className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isMarked ? (isSel ? '#fff' : '#e8789a') : 'transparent' }} />
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* 說明列 */}
          <View className="flex-row items-center gap-4 pt-2 mt-1 border-t border-border">
            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-primary" />
              <Text className="font-rounded text-xs text-muted-foreground">有預約</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-5 h-5 rounded-full bg-primary/15 items-center justify-center">
                <User size={10} color="#e8789a" />
              </View>
              <Text className="font-rounded text-xs text-muted-foreground">手動</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: '#eef0ff' }}>
                <Globe size={10} color="#4a6cf7" />
              </View>
              <Text className="font-rounded text-xs text-muted-foreground">線上</Text>
            </View>
          </View>
        </View>

        {/* 選定日期標題 */}
        <View className="px-5 mb-3 flex-row items-center justify-between">
          <Text className="font-rounded text-sm font-bold text-foreground">
            {formatDateLabel(selectedDate)}
          </Text>
          <Text className="font-rounded text-xs text-muted-foreground">
            共 {dayAppts.length} 筆
          </Text>
        </View>

        {/* 當日預約列表 */}
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#e8789a" />
          </View>
        ) : dayAppts.length === 0 ? (
          <View className="mx-5 bg-card rounded-2xl p-8 border border-border items-center gap-3">
            <CalendarDays size={36} color="#c4a0ae" />
            <Text className="font-rounded text-sm text-muted-foreground">此日無預約 🌸</Text>
          </View>
        ) : (
          <View className="px-5 gap-3">
            {dayAppts.map(item => <ApptCard key={item.id} item={item} />)}
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}
