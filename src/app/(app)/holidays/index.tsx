import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, CalendarX, ChevronDown, User2 } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { getAllHolidays, createHoliday, deleteHoliday, getActiveStaff } from '@/db/api';
import type { Holiday, Staff } from '@/types/types';

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HolidaysScreen() {
  const router = useRouter();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = 全店
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([getAllHolidays(), getActiveStaff()]);
      setHolidays(h);
      setStaffList(s);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError('');
    const dateStr = toLocalDateStr(pickedDate);
    const conflict = holidays.find(h =>
      h.holiday_date === dateStr &&
      (h.staff_id === selectedStaffId || (h.staff_id === null && selectedStaffId === null))
    );
    if (conflict) { setError('該日期已設定相同的公休紀錄'); return; }
    setSaving(true);
    try {
      await createHoliday(dateStr, note.trim() || undefined, selectedStaffId);
      setNote(''); setSelectedStaffId(null); setShowAdd(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteHoliday(id); load();
  };

  // 依月份分組
  const grouped = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const key = h.holiday_date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const selectedStaffName = selectedStaffId
    ? (staffList.find(s => s.id === selectedStaffId)?.name ?? '—')
    : '全店公休';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">公休日管理</Text>
        <Pressable
          className="flex-row items-center gap-1 bg-primary/10 px-3 py-2 rounded-full active:opacity-70"
          onPress={() => setShowAdd(!showAdd)}
        >
          <Plus size={16} color="#e8789a" />
          <Text className="font-rounded text-sm text-primary font-medium">新增</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-24 gap-4">

        {/* 新增公休 */}
        {showAdd && (
          <View className="bg-card rounded-2xl p-4 border border-primary/30 gap-3">
            <Text className="font-rounded text-sm font-semibold text-foreground">設定公休日期</Text>

            {/* 人員選擇 */}
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1.5">適用對象</Text>
              <Pressable
                className="bg-background border border-border rounded-xl px-4 h-11 flex-row items-center justify-between active:opacity-80"
                onPress={() => setShowStaffPicker(!showStaffPicker)}
              >
                <View className="flex-row items-center gap-2">
                  <User2 size={14} color="#e8789a" />
                  <Text className="font-rounded text-sm text-foreground">{selectedStaffName}</Text>
                </View>
                <ChevronDown size={14} color="#c4a0ae" />
              </Pressable>
              {showStaffPicker && (
                <View className="bg-background border border-border rounded-xl mt-1 overflow-hidden">
                  {/* 全店選項 */}
                  <Pressable
                    className="px-4 py-3 flex-row items-center border-b border-border active:bg-muted"
                    onPress={() => { setSelectedStaffId(null); setShowStaffPicker(false); }}
                  >
                    <View className="w-6 h-6 rounded-full bg-primary/15 items-center justify-center mr-2">
                      <Text className="font-rounded text-xs text-primary">全</Text>
                    </View>
                    <Text className="font-rounded text-sm text-foreground flex-1">全店公休</Text>
                    {selectedStaffId === null && <Text className="font-rounded text-xs text-primary">✓</Text>}
                  </Pressable>
                  {staffList.map(s => (
                    <Pressable
                      key={s.id}
                      className="px-4 py-3 flex-row items-center border-b border-border last:border-0 active:bg-muted"
                      onPress={() => { setSelectedStaffId(s.id); setShowStaffPicker(false); }}
                    >
                      <View className="w-6 h-6 rounded-full items-center justify-center mr-2" style={{ backgroundColor: s.color + '33' }}>
                        <Text className="font-rounded text-xs font-bold" style={{ color: s.color }}>{s.name.charAt(0)}</Text>
                      </View>
                      <Text className="font-rounded text-sm text-foreground flex-1">{s.name}</Text>
                      {selectedStaffId === s.id && <Text className="font-rounded text-xs text-primary">✓</Text>}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* 日期選擇 */}
            <Pressable
              className="bg-background border border-border rounded-xl px-4 h-11 flex-row items-center justify-between active:opacity-80"
              onPress={() => setShowPicker(!showPicker)}
            >
              <Text className="font-rounded text-base text-foreground">{toLocalDateStr(pickedDate)}</Text>
              <CalendarX size={16} color="#e8789a" />
            </Pressable>

            {showPicker && (
              <View className="bg-background border border-border rounded-xl overflow-hidden">
                <DateTimePicker locale="zh-tw"
                  mode="single"
                  date={pickedDate}
                  onChange={(params) => {
                    if (params.date) setPickedDate(params.date as Date);
                    setShowPicker(false);
                  }}
                />
              </View>
            )}

            <TextInput
              className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
              placeholder="備註（選填，如：農曆春節）"
              placeholderTextColor="#c4a0ae"
              value={note}
              onChangeText={setNote}
            />

            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

            <View className="flex-row gap-2">
              <Pressable className="flex-1 bg-primary rounded-xl py-2.5 items-center active:opacity-80" onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">確認新增</Text>}
              </Pressable>
              <Pressable className="flex-1 bg-muted rounded-xl py-2.5 items-center active:opacity-70"
                onPress={() => { setShowAdd(false); setNote(''); setError(''); setSelectedStaffId(null); }}>
                <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <View className="py-20 items-center"><ActivityIndicator color="#e8789a" /></View>
        ) : holidays.length === 0 ? (
          <View className="items-center py-20 gap-3">
            <CalendarX size={48} color="#c4a0ae" />
            <Text className="font-rounded text-base text-muted-foreground">尚未設定公休日</Text>
          </View>
        ) : (
          months.map(monthKey => {
            const [y, m] = monthKey.split('-');
            return (
              <View key={monthKey} className="bg-card rounded-2xl p-4 border border-border">
                <Text className="font-rounded text-sm font-semibold text-muted-foreground mb-3">
                  {y} 年 {Number(m)} 月
                </Text>
                {grouped[monthKey].map((h, i) => {
                  const d = new Date(h.holiday_date + 'T00:00:00');
                  const weekDay = ['日','一','二','三','四','五','六'][d.getDay()];
                  const staffInfo = h.staff as { name: string; color: string } | null | undefined;
                  return (
                    <View key={h.id} className={`flex-row items-center py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                        <Text className="font-rounded text-sm font-bold text-primary">{d.getDate()}</Text>
                        <Text className="font-rounded text-primary" style={{ fontSize: 9 }}>週{weekDay}</Text>
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-rounded text-sm text-foreground font-medium">{h.holiday_date}</Text>
                          {/* 人員標籤 */}
                          {staffInfo ? (
                            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: staffInfo.color + '22' }}>
                              <Text className="font-rounded text-xs font-medium" style={{ color: staffInfo.color }}>{staffInfo.name}</Text>
                            </View>
                          ) : (
                            <View className="px-2 py-0.5 rounded-full bg-primary/10">
                              <Text className="font-rounded text-xs text-primary">全店</Text>
                            </View>
                          )}
                        </View>
                        {h.note && <Text className="font-rounded text-xs text-muted-foreground">{h.note}</Text>}
                      </View>
                      <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
                        onPress={() => handleDelete(h.id)}>
                        <Trash2 size={15} color="#e85454" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
