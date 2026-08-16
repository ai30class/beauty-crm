import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Search, Clock, AlertTriangle, UserCheck, Cake } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { createAppointment, getCustomers, getCustomerById, getServiceTemplates, updateCustomer } from '@/db/api';
import { supabase } from '@/client/supabase';
import type { Customer, ServiceTemplate } from '@/types/types';

const REMINDER_OPTIONS = [
  { label: '15 分鐘前', value: 15 },
  { label: '30 分鐘前', value: 30 },
  { label: '1 小時前', value: 60 },
  { label: '2 小時前', value: 120 },
  { label: '1 天前', value: 1440 },
];

export default function NewAppointmentScreen() {
  const { customerId: presetCustomerId } = useLocalSearchParams<{ customerId?: string }>();
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(!presetCustomerId);
  const [customerQuery, setCustomerQuery] = useState('');

  // 會員資料補填狀態
  const [needsProfileFill, setNeedsProfileFill] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBirthday, setProfileBirthday] = useState<Date | null>(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ServiceTemplate | null>(null);

  const [apptDate, setApptDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const [all, tpls] = await Promise.all([
        getCustomers(),
        getServiceTemplates(),
      ]);
      setCustomers(all);
      setTemplates(tpls);
      if (presetCustomerId) {
        const c = await getCustomerById(presetCustomerId);
        if (c) selectCustomer(c);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCustomerId]);

  // 選擇顧客後立即檢查資料完整性
  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setShowCustomerPicker(false);
    const missing = !c.name?.trim() || !c.phone?.trim() || !c.birthday;
    if (missing) {
      setNeedsProfileFill(true);
      setProfileName(c.name ?? '');
      setProfilePhone(c.phone ?? '');
      setProfileBirthday(c.birthday ? new Date(c.birthday) : null);
      setProfileError('');
    } else {
      setNeedsProfileFill(false);
    }
  };

  // 儲存補填的會員資料
  const handleSaveProfile = async () => {
    setProfileError('');
    if (!profileName.trim()) { setProfileError('請輸入姓名'); return; }
    if (!profilePhone.trim()) { setProfileError('請輸入電話'); return; }
    if (!profileBirthday) { setProfileError('請選擇生日'); return; }
    if (!selectedCustomer) return;
    setProfileSaving(true);
    try {
      const y = profileBirthday.getFullYear();
      const m = String(profileBirthday.getMonth() + 1).padStart(2, '0');
      const d = String(profileBirthday.getDate()).padStart(2, '0');
      const birthdayStr = `${y}-${m}-${d}`;
      await updateCustomer(selectedCustomer.id, {
        name: profileName.trim(),
        phone: profilePhone.trim(),
        birthday: birthdayStr,
      });
      // 更新本地顧客狀態
      const updated: Customer = { ...selectedCustomer, name: profileName.trim(), phone: profilePhone.trim(), birthday: birthdayStr };
      setSelectedCustomer(updated);
      setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
      setNeedsProfileFill(false);
    } catch (e: any) {
      setProfileError(e.message ?? '儲存失敗');
    } finally {
      setProfileSaving(false);
    }
  };

  const filteredCustomers = customerQuery.trim()
    ? customers.filter(c => c.name.includes(customerQuery) || c.phone.includes(customerQuery))
    : customers;

  // 衝突檢查：查 appointments + online_orders 是否有重疊時段
  const checkConflict = async (date: Date, durationMins: number) => {
    setConflictWarning(null);
    setConflictChecking(true);
    try {
      const startMs = date.getTime();
      const endMs = startMs + durationMins * 60000;
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();

      // 查 appointments（老闆端）
      const { data: appts } = await supabase
        .from('appointments')
        .select('appointment_time, notes')
        .in('status', ['pending', 'confirmed'])
        .gte('appointment_time', new Date(startMs - 3 * 3600000).toISOString())
        .lte('appointment_time', end);

      const apptConflict = (appts ?? []).find((a: { appointment_time: string; notes: string | null }) => {
        const t = new Date(a.appointment_time).getTime();
        return t < endMs && t + 120 * 60000 > startMs; // 假設最長 2h
      });

      // 查 online_orders（線上預約）
      const { data: orders } = await supabase
        .from('online_orders')
        .select('appointment_time, end_time, customer_name')
        .in('status', ['paid', 'confirmed'])
        .gte('appointment_time', new Date(startMs - 3 * 3600000).toISOString())
        .lte('appointment_time', end);

      const orderConflict = (orders ?? []).find((o: { appointment_time: string; end_time: string; customer_name: string }) => {
        const s = new Date(o.appointment_time).getTime();
        const e = new Date(o.end_time).getTime();
        return s < endMs && e > startMs;
      });

      if (orderConflict) {
        setConflictWarning(`此時段已有線上預約（${(orderConflict as { customer_name: string }).customer_name}），請確認是否繼續`);
      } else if (apptConflict) {
        setConflictWarning('此時段可能與現有預約重疊，請確認是否繼續');
      }
    } finally {
      setConflictChecking(false);
    }
  };

  // 日期或服務模板改變時觸發衝突檢查
  useEffect(() => {
    if (apptDate > new Date()) {
      const dur = selectedTemplate?.duration_minutes ?? 60;
      checkConflict(apptDate, dur);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptDate, selectedTemplate]);

  const handleSave = async () => {
    setError('');
    if (!selectedCustomer) { setError('請選擇顧客'); return; }
    if (needsProfileFill) { setError('請先完善顧客會員資料（姓名、電話、生日）'); return; }
    if (apptDate <= new Date()) { setError('預約時間不能早於現在'); return; }
    setLoading(true);
    try {
      await createAppointment({
        customer_id: selectedCustomer.id,
        appointment_time: apptDate.toISOString(),
        reminder_minutes: reminderMinutes,
        notes: notes.trim() || null,
        status: 'pending',
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">新增預約</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">

        {/* 顧客選擇 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">顧客 *</Text>
          {selectedCustomer && !showCustomerPicker ? (
            <Pressable
              className="bg-card border border-primary rounded-2xl px-4 flex-row items-center active:opacity-80"
              style={{ height: 52 }}
              onPress={() => { setShowCustomerPicker(true); setNeedsProfileFill(false); }}
            >
              <Text className="font-rounded text-base text-foreground flex-1">{selectedCustomer.name}</Text>
              <Text className="font-rounded text-sm text-primary">更換</Text>
            </Pressable>
          ) : (
            <View className="bg-card border border-border rounded-2xl overflow-hidden">
              <View className="flex-row items-center px-4 border-b border-border" style={{ height: 48 }}>
                <Search size={16} color="#c4a0ae" />
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground ml-2"
                  placeholder="搜尋顧客姓名或電話"
                  placeholderTextColor="#c4a0ae"
                  value={customerQuery}
                  onChangeText={setCustomerQuery}
                />
              </View>
              <FlatList
                data={filteredCustomers.slice(0, 6)}
                keyExtractor={c => c.id}
                style={{ maxHeight: 200 }}
                renderItem={({ item }) => (
                  <Pressable
                    className="px-4 py-3 border-b border-border active:bg-muted"
                    onPress={() => selectCustomer(item)}
                  >
                    <Text className="font-rounded text-sm text-foreground">{item.name} · {item.phone}</Text>
                    {!item.birthday && (
                      <Text className="font-rounded text-xs mt-0.5" style={{ color: '#e8a000' }}>⚠ 缺少生日資料</Text>
                    )}
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>

        {/* 會員資料補填卡片 */}
        {needsProfileFill && selectedCustomer && (
          <View className="rounded-2xl overflow-hidden border-2" style={{ borderColor: '#e8789a' }}>
            {/* 標題 */}
            <View className="flex-row items-center gap-2 px-4 py-3" style={{ backgroundColor: '#fce9f0' }}>
              <UserCheck size={16} color="#e8789a" />
              <Text className="font-rounded text-sm font-semibold" style={{ color: '#e8789a' }}>
                請先完善會員資料才能建立預約
              </Text>
            </View>
            <View className="bg-card px-4 pt-3 pb-4 gap-3">
              {/* 姓名 */}
              <View>
                <Text className="font-rounded text-xs font-medium text-muted-foreground mb-1">姓名 *</Text>
                <View className="bg-background border border-border rounded-xl px-4" style={{ height: 46 }}>
                  <TextInput
                    className="flex-1 font-rounded text-sm text-foreground"
                    style={{ height: 46 }}
                    placeholder="顧客姓名"
                    placeholderTextColor="#c4a0ae"
                    value={profileName}
                    onChangeText={setProfileName}
                  />
                </View>
              </View>
              {/* 電話 */}
              <View>
                <Text className="font-rounded text-xs font-medium text-muted-foreground mb-1">電話 *</Text>
                <View className="bg-background border border-border rounded-xl px-4" style={{ height: 46 }}>
                  <TextInput
                    className="flex-1 font-rounded text-sm text-foreground"
                    style={{ height: 46 }}
                    placeholder="手機號碼"
                    placeholderTextColor="#c4a0ae"
                    value={profilePhone}
                    onChangeText={setProfilePhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              {/* 生日 */}
              <View>
                <Text className="font-rounded text-xs font-medium text-muted-foreground mb-1">生日 *</Text>
                <Pressable
                  className="bg-background border border-border rounded-xl px-4 flex-row items-center gap-2 active:opacity-80"
                  style={{ height: 46 }}
                  onPress={() => setShowBirthdayPicker(p => !p)}
                >
                  <Cake size={14} color="#e8789a" />
                  <Text className={`font-rounded text-sm flex-1 ${profileBirthday ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {profileBirthday
                      ? `${profileBirthday.getFullYear()}-${String(profileBirthday.getMonth()+1).padStart(2,'0')}-${String(profileBirthday.getDate()).padStart(2,'0')}`
                      : '選擇生日'}
                  </Text>
                </Pressable>
                {showBirthdayPicker && (
                  <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
                    <DateTimePicker locale="zh-tw"
                      mode="single"
                      date={profileBirthday ?? new Date(1990, 0, 1)}
                      onChange={(params) => {
                        if (params.date) setProfileBirthday(params.date as Date);
                        setShowBirthdayPicker(false);
                      }}
                    />
                  </View>
                )}
              </View>

              {profileError ? (
                <Text className="font-rounded text-xs text-destructive">{profileError}</Text>
              ) : null}

              <Pressable
                className="rounded-xl items-center justify-center active:opacity-80"
                style={{ height: 44, backgroundColor: '#e8789a' }}
                onPress={handleSaveProfile}
                disabled={profileSaving}
              >
                {profileSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className="font-rounded text-sm font-semibold text-white">儲存會員資料</Text>}
              </Pressable>
            </View>
          </View>
        )}

        {/* 服務項目快速選擇 */}
        {templates.length > 0 && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務項目（選填）</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                {templates.map(tpl => {
                  const active = selectedTemplate?.id === tpl.id;
                  return (
                    <Pressable
                      key={tpl.id}
                      className="rounded-xl px-3 py-2 active:opacity-70"
                      style={{
                        backgroundColor: tpl.color + '22',
                        borderWidth: 1.5,
                        borderColor: active ? tpl.color : tpl.color + '44',
                      }}
                      onPress={() => {
                        setSelectedTemplate(prev => prev?.id === tpl.id ? null : tpl);
                        if (!notes) setNotes(tpl.name);
                      }}
                    >
                      <Text className="font-rounded text-sm font-medium" style={{ color: tpl.color }}>
                        {tpl.name}
                      </Text>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <Clock size={9} color={tpl.color} />
                        <Text className="font-rounded text-xs" style={{ color: tpl.color + 'cc' }}>
                          {tpl.duration_minutes}分
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* 預約日期 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約日期 *</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 items-start justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => { setShowDatePicker(!showDatePicker); }}
          >
            <Text className="font-rounded text-base text-foreground">{formatDate(apptDate)}</Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw"
                mode="single"
                date={apptDate}
                onChange={(params) => {
                  if (params.date) {
                    const nd = params.date as Date;
                    const merged = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), apptDate.getHours(), apptDate.getMinutes());
                    setApptDate(merged);
                  }
                  setShowDatePicker(false);
                }}
              />
            </View>
          )}
        </View>

        {/* 預約時間（手動輸入 HH:MM） */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約時間 *</Text>
          <View className="bg-card border border-border rounded-2xl px-4 flex-row items-center gap-2" style={{ height: 52 }}>
            <TextInput
              className="font-rounded text-base text-foreground w-14 text-center"
              placeholder="HH"
              placeholderTextColor="#c4a0ae"
              value={String(apptDate.getHours()).padStart(2, '0')}
              onChangeText={(v) => {
                const h = parseInt(v, 10);
                if (!isNaN(h) && h >= 0 && h <= 23) {
                  setApptDate(new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), h, apptDate.getMinutes()));
                }
              }}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text className="font-rounded text-base text-muted-foreground">:</Text>
            <TextInput
              className="font-rounded text-base text-foreground w-14 text-center"
              placeholder="MM"
              placeholderTextColor="#c4a0ae"
              value={String(apptDate.getMinutes()).padStart(2, '0')}
              onChangeText={(v) => {
                const m = parseInt(v, 10);
                if (!isNaN(m) && m >= 0 && m <= 59) {
                  setApptDate(new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), apptDate.getHours(), m));
                }
              }}
              keyboardType="numeric"
              maxLength={2}
            />
          </View>
        </View>

        {/* 提醒時間 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">提醒時間</Text>
          <View className="flex-row flex-wrap gap-2">
            {REMINDER_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                className="px-4 py-2 rounded-full active:opacity-70"
                style={{ backgroundColor: reminderMinutes === opt.value ? '#e8789a' : '#f5e6ec' }}
                onPress={() => setReminderMinutes(opt.value)}
              >
                <Text
                  className="font-rounded text-sm font-medium"
                  style={{ color: reminderMinutes === opt.value ? '#fff' : '#c4a0ae' }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 備註 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
            placeholder="備註（選填）"
            placeholderTextColor="#c4a0ae"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* 衝突警示 */}
        {conflictChecking && (
          <View className="flex-row items-center gap-2 px-3 py-2 bg-muted rounded-xl">
            <ActivityIndicator size="small" color="#e8a000" />
            <Text className="font-rounded text-xs text-muted-foreground">檢查時段衝突中…</Text>
          </View>
        )}
        {!conflictChecking && conflictWarning && (
          <View className="flex-row items-start gap-2 px-3 py-3 rounded-xl border" style={{ backgroundColor: '#fffbec', borderColor: '#f0d080' }}>
            <AlertTriangle size={16} color="#e8a000" style={{ marginTop: 1 }} />
            <Text className="font-rounded text-sm flex-1" style={{ color: '#b07800' }}>{conflictWarning}</Text>
          </View>
        )}

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="font-rounded text-white text-base font-semibold">確認預約</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
