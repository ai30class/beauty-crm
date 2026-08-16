import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, User2, Clock, DollarSign, CalendarDays, CheckCircle, Cake, Store, Phone, MapPin, FileText, LogIn, ClipboardList } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { getActiveStaff, getServiceTemplates, getAvailableSlots, getAllHolidays, createDirectOnlineOrder, getCustomerByPhone, upsertCustomerByPhone, getShopProfileByOwner } from '@/db/api';
import { supabase } from '@/client/supabase';
import { fetch } from 'expo/fetch';
import type { Staff, ServiceTemplate, TimeSlot, ShopProfile, BusinessHours } from '@/types/types';

const DAY_KEYS: (keyof BusinessHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type Step = 'identity' | 'service' | 'staff' | 'datetime' | 'info' | 'payment';

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export default function OnlineBookingScreen() {
  const router = useRouter();
  const { ownerId: presetOwnerId } = useLocalSearchParams<{ ownerId?: string }>();

  // ── 顧客登入狀態 ──────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [customerSession, setCustomerSession] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setCustomerSession(!!session);
      setAuthChecked(true);
      if (!session) {
        // 未登入 → 跳轉到顧客登入頁，帶回 redirect 參數
        router.replace(`/online-booking/customer-auth?ownerId=${presetOwnerId ?? ''}` as any);
      }
    })();
  }, [presetOwnerId]);

  // 步驟狀態
  const [step, setStep] = useState<Step>('identity');

  // 資料載入
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // 使用者選擇
  const [selectedTemplate, setSelectedTemplate] = useState<ServiceTemplate | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerBirthday, setCustomerBirthday] = useState<Date | null>(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [directSuccess, setDirectSuccess] = useState(false);
  const [isRegisteredCustomer, setIsRegisteredCustomer] = useState<boolean | null>(null); // null=未查詢

  // 取得老闆 ID（用於查公休和時段衝突）
  const [ownerId, setOwnerId] = useState(presetOwnerId ?? '');
  const [shopProfile, setShopProfile] = useState<Pick<ShopProfile, 'shop_name' | 'phone' | 'address' | 'description' | 'business_hours'> | null>(null);

  useEffect(() => {
    (async () => {
      const [tpls, staff, hols] = await Promise.all([
        getServiceTemplates(),
        getActiveStaff(),
        getAllHolidays(),
      ]);
      // 只顯示開放線上預約的
      setTemplates(tpls.filter(t => t.allow_online_booking));
      setStaffList(staff);
      setHolidays(hols.map(h => h.holiday_date));

      // 若 presetOwnerId 未傳，嘗試從 staff owner 推斷
      const resolvedOwnerId = presetOwnerId || (staff.length > 0 ? staff[0].owner_id : '');
      if (!presetOwnerId && resolvedOwnerId) {
        setOwnerId(resolvedOwnerId);
      }

      // 載入商家公開資訊
      if (resolvedOwnerId) {
        const profile = await getShopProfileByOwner(resolvedOwnerId).catch(() => null);
        setShopProfile(profile);
      }
    })();
  }, [presetOwnerId]);

  // 日期/人員/服務改變時重新撈時段
  useEffect(() => {
    if (!selectedTemplate || !ownerId) return;
    (async () => {
      setSlotsLoading(true);
      try {
        const s = await getAvailableSlots(
          ownerId,
          selectedStaff?.id ?? null,
          toLocalDateStr(selectedDate),
          selectedTemplate.duration_minutes,
          selectedTemplate.break_after_minutes,
          customerPhone || undefined,
        );
        setSlots(s);
        setSelectedTime('');
      } finally {
        setSlotsLoading(false);
      }
    })();
  }, [selectedStaff, selectedTemplate, selectedDate, ownerId]);

  const isHoliday = (d: Date) => holidays.includes(toLocalDateStr(d));

  // 依商家 business_hours 判斷某日是否公休
  const isBusinessHoliday = (d: Date): boolean => {
    if (!shopProfile?.business_hours) return false;
    const dayKey = DAY_KEYS[d.getDay()];
    return !shopProfile.business_hours[dayKey]?.open;
  };

  const depositAmount = selectedTemplate
    ? Math.round(selectedTemplate.default_amount * 0.5)
    : 0;

  const handleSubmit = async () => {
    setError('');
    if (!customerName.trim()) { setError('請輸入姓名'); return; }
    if (!/^09\d{8}$/.test(customerPhone)) { setError('請輸入正確的手機號碼（09 開頭 10 碼）'); return; }
    if (!customerBirthday) { setError('請選擇生日'); return; }
    if (!selectedTemplate || !selectedTime) { setError('請完成所有選擇'); return; }

    // 優先從已選員工直接取 owner_id，避免 race condition
    const resolvedOwnerId = selectedStaff?.owner_id || ownerId;
    if (!resolvedOwnerId) { setError('無法確認店家資訊，請重新整理後再試'); return; }

    const [hh, mm] = selectedTime.split(':').map(Number);
    const apptTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hh, mm);
    const endTime = new Date(apptTime.getTime() + selectedTemplate.duration_minutes * 60000);

    // 生日字串
    const by = customerBirthday.getFullYear();
    const bm = String(customerBirthday.getMonth() + 1).padStart(2, '0');
    const bd = String(customerBirthday.getDate()).padStart(2, '0');
    const birthdayStr = `${by}-${bm}-${bd}`;

    setSubmitting(true);
    try {
      // ── 先查是否為已建檔熟客（upsert 前查，避免 upsert 後必然有 birthday 導致判斷失真）
      const priorCustomer = await getCustomerByPhone(customerPhone.trim());
      const wasAlreadyRegistered = !!(priorCustomer && priorCustomer.birthday);
      const needDeposit = selectedTemplate.require_deposit && !wasAlreadyRegistered;

      // ── Upsert 顧客檔案，取得 customer_id ──────────────────────────────
      const customerId = await upsertCustomerByPhone(
        customerName.trim(),
        customerPhone.trim(),
        birthdayStr,
      );

      // ── 直接預約（免訂金）──────────────────────────────
      if (!needDeposit) {
        await createDirectOnlineOrder({
          owner_id:            resolvedOwnerId,
          customer_name:       customerName.trim(),
          customer_phone:      customerPhone.trim(),
          customer_id:         customerId,
          staff_id:            selectedStaff?.id ?? null,
          service_template_id: selectedTemplate.id,
          service_name:        selectedTemplate.name,
          duration_minutes:    selectedTemplate.duration_minutes,
          total_amount:        selectedTemplate.default_amount,
          appointment_time:    apptTime.toISOString(),
          end_time:            endTime.toISOString(),
          notes:               notes.trim() || null,
        });
        setDirectSuccess(true);
        return;
      }

      // ── 需付訂金 → LINE Pay ────────────────────────────
      const res = await fetch(`${SUPABASE_URL}/functions/v1/line-pay/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        body: JSON.stringify({
          owner_id:            resolvedOwnerId,
          customer_name:       customerName.trim(),
          customer_phone:      customerPhone.trim(),
          customer_id:         customerId,
          staff_id:            selectedStaff?.id ?? null,
          service_template_id: selectedTemplate.id,
          service_name:        selectedTemplate.name,
          duration_minutes:    selectedTemplate.duration_minutes,
          total_amount:        selectedTemplate.default_amount,
          appointment_time:    apptTime.toISOString(),
          notes:               notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? '建立失敗');
      }

      const { orderId, paymentUrl } = await res.json() as { orderId: string; paymentUrl: string; orderDbId: string };
      router.push(`/online-booking/payment?orderId=${orderId}&paymentUrl=${encodeURIComponent(paymentUrl)}` as any);
    } catch (e: any) {
      setError(e.message ?? '提交失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 進度指示器 ──────────────────────────────────────────────────────────────
  // identity 步驟不計入進度條（前置確認步驟）
  const STEPS: Step[] = ['identity', 'service', 'staff', 'datetime', 'info', 'payment'];
  const PROGRESS_STEPS: Step[] = ['service', 'staff', 'datetime', 'info', 'payment'];
  const stepIdx = STEPS.indexOf(step);
  const progressIdx = PROGRESS_STEPS.indexOf(step); // -1 表示在 identity 步驟
  const STEP_LABELS = ['服務', '人員', '時間', '確認', '付款'];

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Auth 檢查中 */}
      {!authChecked && (
        <View className="flex-1 bg-background items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#e8789a" />
          <Text className="font-rounded text-sm text-muted-foreground">驗證身份中…</Text>
        </View>
      )}

      {/* 已登入才顯示主體 */}
      {authChecked && customerSession && (
        <>
        {/* 直接預約成功畫面 */}
        {directSuccess && (
          <View className="flex-1 bg-background items-center justify-center px-8 gap-6">
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center">
            <CheckCircle size={52} color="#e8789a" />
          </View>
          <View className="items-center gap-2">
            <Text className="font-rounded text-2xl font-bold text-foreground">預約成功！</Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center">
              您的預約已確認，{'\n'}我們期待在 {toLocalDateStr(selectedDate)} {selectedTime} 為您服務 🌸
            </Text>
          </View>
          <View className="w-full bg-card rounded-2xl p-4 border border-border gap-2">
            <SummaryRow label="服務" value={selectedTemplate?.name ?? ''} />
            <SummaryRow label="人員" value={selectedStaff?.name ?? ''} />
            <SummaryRow label="日期時間" value={`${toLocalDateStr(selectedDate)} ${selectedTime}`} />
            <SummaryRow label="付款方式" value="到店付款" />
          </View>
          <Pressable
            className="w-full bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80"
            onPress={() => router.back()}
          >
            <Text className="font-rounded text-base text-white font-semibold">返回首頁</Text>
          </Pressable>
          {/* 我的預約記錄 */}
          <Pressable
            className="w-full border border-border rounded-2xl h-12 flex-row items-center justify-center gap-2 bg-card active:opacity-70"
            onPress={() => router.push('/online-booking/my-orders' as any)}
          >
            <ClipboardList size={16} color="#e8789a" />
            <Text className="font-rounded text-sm text-foreground font-semibold">查看我的預約記錄</Text>
          </Pressable>
        </View>
      )}

      {/* 正常預約流程 */}
      {!directSuccess && (
        <>
        {/* Header */}
        <View className="flex-row items-center px-5 pt-14 pb-3 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => {
            if (stepIdx === 0) router.back();
            else setStep(STEPS[stepIdx - 1]);
          }}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">線上預約</Text>
      </View>

      {/* 商家資訊卡（有資料才顯示） */}
      {shopProfile && (shopProfile.shop_name || shopProfile.phone || shopProfile.address) && (
        <View
          className="mx-5 mb-3 rounded-2xl overflow-hidden border border-border"
          style={{ backgroundColor: '#fff5f9' }}
        >
          {/* 店名 */}
          <View className="px-4 pt-4 pb-2 flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
              <Store size={15} color="#e8789a" />
            </View>
            <Text className="font-rounded text-base font-bold text-foreground flex-1" numberOfLines={1}>
              {shopProfile.shop_name || '美業管家'}
            </Text>
          </View>

          {/* 簡介 */}
          {!!shopProfile.description && (
            <View className="px-4 pb-2 flex-row items-start gap-2">
              <FileText size={12} color="#c4a0ae" style={{ marginTop: 2 }} />
              <Text className="font-rounded text-xs text-muted-foreground flex-1 leading-5">
                {shopProfile.description}
              </Text>
            </View>
          )}

          {/* 電話 & 地址 */}
          <View className="flex-row px-4 pb-3 gap-4 flex-wrap">
            {!!shopProfile.phone && (
              <View className="flex-row items-center gap-1.5">
                <Phone size={12} color="#c4a0ae" />
                <Text className="font-rounded text-xs text-muted-foreground">{shopProfile.phone}</Text>
              </View>
            )}
            {!!shopProfile.address && (
              <View className="flex-row items-center gap-1.5 flex-1">
                <MapPin size={12} color="#c4a0ae" />
                <Text className="font-rounded text-xs text-muted-foreground flex-1" numberOfLines={2}>
                  {shopProfile.address}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 步驟進度條（identity 步驟隱藏） */}
      {progressIdx >= 0 && (
      <View className="px-5 mb-4">
        <View className="flex-row items-center justify-between">
          {PROGRESS_STEPS.map((s, i) => (
            <View key={s} className="items-center" style={{ flex: 1 }}>
              <View className="flex-row items-center w-full">
                {i > 0 && (
                  <View className="flex-1 h-0.5 mr-1" style={{ backgroundColor: i <= progressIdx ? '#e8789a' : '#f0d8e4' }} />
                )}
                <View
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{ backgroundColor: i < progressIdx ? '#e8789a' : i === progressIdx ? '#e8789a' : '#f5e6ec' }}
                >
                  {i < progressIdx
                    ? <CheckCircle size={14} color="#fff" />
                    : <Text className="font-rounded text-xs font-bold" style={{ color: i === progressIdx ? '#fff' : '#c4a0ae' }}>{i + 1}</Text>
                  }
                </View>
                {i < PROGRESS_STEPS.length - 1 && (
                  <View className="flex-1 h-0.5 ml-1" style={{ backgroundColor: i < progressIdx ? '#e8789a' : '#f0d8e4' }} />
                )}
              </View>
              <Text className="font-rounded mt-1" style={{ fontSize: 10, color: i === progressIdx ? '#e8789a' : '#c4a0ae' }}>
                {STEP_LABELS[i]}
              </Text>
            </View>
          ))}
        </View>
      </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-16 gap-4" className="bg-background">

        {/* ── Step 0: 身份確認（前置步驟）── */}
        {step === 'identity' && (
          <View className="gap-5 pt-2">
            {/* 歡迎說明 */}
            <View className="bg-primary/5 rounded-2xl p-5 items-center gap-2 border border-primary/10">
              <Text className="text-3xl">🌸</Text>
              <Text className="font-rounded text-lg font-bold text-foreground text-center">歡迎預約</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center leading-5">
                請先填寫您的姓名和手機號碼{'\n'}方便我們為您安排服務
              </Text>
            </View>

            {/* 姓名 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">您的姓名 *</Text>
              <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
                <User2 size={16} color="#c4a0ae" />
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground ml-3"
                  placeholder="請輸入姓名"
                  placeholderTextColor="#c4a0ae"
                  value={customerName}
                  onChangeText={setCustomerName}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* 手機號 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">手機號碼 *</Text>
              <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
                <Text className="font-rounded text-base text-muted-foreground mr-1">📱</Text>
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground"
                  placeholder="09xxxxxxxx"
                  placeholderTextColor="#c4a0ae"
                  value={customerPhone}
                  onChangeText={async (v) => {
                    setCustomerPhone(v);
                    if (/^09\d{8}$/.test(v)) {
                      const found = await getCustomerByPhone(v.trim());
                      setIsRegisteredCustomer(!!found);
                    } else {
                      setIsRegisteredCustomer(null);
                    }
                  }}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              {/* 即時身份提示 */}
              {isRegisteredCustomer === true && (
                <View className="mt-2 flex-row items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                  <CheckCircle size={14} color="#5dc0a0" />
                  <Text className="font-rounded text-sm" style={{ color: '#2ea87e' }}>
                    您是我們的熟客 🌸 本次預約免付訂金
                  </Text>
                </View>
              )}
              {isRegisteredCustomer === false && (
                <View className="mt-2 flex-row items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <Text className="font-rounded text-xs text-amber-700">
                    首次預約的服務項目若需訂金，將於確認時說明
                  </Text>
                </View>
              )}
            </View>

            {/* 生日 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">生日 *</Text>
              <Pressable
                className="flex-row items-center bg-card border border-border rounded-2xl px-4 active:opacity-80"
                style={{ height: 52 }}
                onPress={() => setShowBirthdayPicker(p => !p)}
              >
                <Cake size={16} color="#e8789a" />
                <Text className={`font-rounded text-base ml-3 flex-1 ${customerBirthday ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {customerBirthday
                    ? `${customerBirthday.getFullYear()}-${String(customerBirthday.getMonth()+1).padStart(2,'0')}-${String(customerBirthday.getDate()).padStart(2,'0')}`
                    : '請選擇您的生日'}
                </Text>
              </Pressable>
              {showBirthdayPicker && (
                <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
                  <DateTimePicker
                    mode="single"
                    date={customerBirthday ?? new Date(1990, 0, 1)}
                    onChange={(params) => {
                      if (params.date) setCustomerBirthday(params.date as Date);
                      setShowBirthdayPicker(false);
                    }}
                  />
                </View>
              )}
              <Text className="font-rounded text-xs text-muted-foreground mt-1.5 px-1">
                用於生日優惠提醒，資料安全保存 🔒
              </Text>
            </View>

            {error ? <Text className="font-rounded text-sm text-destructive">{error}</Text> : null}

            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center flex-row gap-2 active:opacity-80"
              onPress={() => {
                setError('');
                if (!customerName.trim()) { setError('請輸入姓名'); return; }
                if (!/^09\d{8}$/.test(customerPhone)) { setError('請輸入正確的手機號碼（09 開頭 10 碼）'); return; }
                if (!customerBirthday) { setError('請選擇您的生日'); return; }
                setStep('service');
              }}
            >
              <Text className="font-rounded text-base text-white font-semibold">開始選擇服務</Text>
              <ArrowRight size={18} color="#fff" />
            </Pressable>
          </View>
        )}
        {step === 'service' && (
          <View className="gap-3">
            <Text className="font-rounded text-base font-semibold text-foreground">選擇服務項目</Text>
            {templates.length === 0 ? (
              <Text className="font-rounded text-sm text-muted-foreground text-center py-8">目前無開放線上預約的服務</Text>
            ) : templates.map(t => (
              <Pressable
                key={t.id}
                className="bg-card rounded-2xl p-4 border active:opacity-80 flex-row items-center gap-3"
                style={{ borderColor: selectedTemplate?.id === t.id ? t.color : '#f0e0e8' }}
                onPress={() => setSelectedTemplate(t)}
              >
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: t.color + '22' }}>
                  <Text className="font-rounded text-base font-bold" style={{ color: t.color }}>{t.name.charAt(0)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-rounded text-base font-semibold text-foreground">{t.name}</Text>
                  <View className="flex-row gap-3 mt-0.5">
                    <View className="flex-row items-center gap-1">
                      <Clock size={11} color="#c4a0ae" />
                      <Text className="font-rounded text-xs text-muted-foreground">{t.duration_minutes} 分鐘</Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <DollarSign size={11} color="#c4a0ae" />
                      <Text className="font-rounded text-xs text-muted-foreground">${Number(t.default_amount).toLocaleString()}</Text>
                    </View>
                  </View>
                </View>
                {selectedTemplate?.id === t.id && <CheckCircle size={18} color={t.color} />}
              </Pressable>
            ))}
            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center flex-row gap-2 mt-2 active:opacity-80"
              onPress={() => { if (selectedTemplate) setStep('staff'); else setError('請選擇服務項目'); }}
            >
              <Text className="font-rounded text-base text-white font-semibold">下一步</Text>
              <ArrowRight size={18} color="#fff" />
            </Pressable>
            {error ? <Text className="font-rounded text-xs text-destructive text-center">{error}</Text> : null}
          </View>
        )}

        {/* ── Step 2: 選人員 ── */}
        {step === 'staff' && (
          <View className="gap-3">
            <Text className="font-rounded text-base font-semibold text-foreground">選擇服務人員</Text>
            {staffList.length === 0 && (
              <Text className="font-rounded text-sm text-muted-foreground">店家尚未指定服務人員，將由店家統一安排</Text>
            )}
            {staffList.map(s => (
              <Pressable
                key={s.id}
                className="bg-card rounded-2xl p-4 border active:opacity-80 flex-row items-center gap-3"
                style={{ borderColor: selectedStaff?.id === s.id ? s.color : '#f0e0e8' }}
                onPress={() => setSelectedStaff(s)}
              >
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: s.color + '22' }}>
                  <Text className="font-rounded text-base font-bold" style={{ color: s.color }}>{s.name.charAt(0)}</Text>
                </View>
                <Text className="font-rounded text-base font-semibold text-foreground flex-1">{s.name}</Text>
                {selectedStaff?.id === s.id && <CheckCircle size={18} color={s.color} />}
              </Pressable>
            ))}
            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center flex-row gap-2 mt-2 active:opacity-80"
              onPress={() => { if (selectedStaff || staffList.length === 0) { setError(''); setStep('datetime'); } else setError('請選擇服務人員'); }}
            >
              <Text className="font-rounded text-base text-white font-semibold">下一步</Text>
              <ArrowRight size={18} color="#fff" />
            </Pressable>
            {error ? <Text className="font-rounded text-xs text-destructive text-center">{error}</Text> : null}
          </View>
        )}

        {/* ── Step 3: 選日期時間 ── */}
        {step === 'datetime' && (
          <View className="gap-4">
            <Text className="font-rounded text-base font-semibold text-foreground">選擇預約日期</Text>

            <Pressable
              className="bg-card border border-border rounded-2xl px-4 flex-row items-center justify-between h-14 active:opacity-80"
              onPress={() => setShowDatePicker(!showDatePicker)}
            >
              <View className="flex-row items-center gap-2">
                <CalendarDays size={16} color="#e8789a" />
                <Text className="font-rounded text-base text-foreground">{toLocalDateStr(selectedDate)}</Text>
              </View>
              {(isHoliday(selectedDate) || isBusinessHoliday(selectedDate)) && (
                <View className="bg-destructive/10 px-2 py-0.5 rounded-full">
                  <Text className="font-rounded text-xs text-destructive">公休日</Text>
                </View>
              )}
            </Pressable>

            {showDatePicker && (
              <View className="bg-card border border-border rounded-2xl overflow-hidden">
                <DateTimePicker
                  mode="single"
                  date={selectedDate}
                  minDate={new Date()}
                  onChange={(params) => {
                    if (params.date) setSelectedDate(params.date as Date);
                    setShowDatePicker(false);
                  }}
                />
              </View>
            )}

            {(isHoliday(selectedDate) || isBusinessHoliday(selectedDate)) ? (
              <View className="rounded-2xl p-4 items-center gap-1.5"
                style={{ backgroundColor: '#fff8e0', borderWidth: 1, borderColor: '#f5d87a' }}>
                <Text className="font-rounded text-sm font-semibold" style={{ color: '#9a6400' }}>
                  🌙 此日期為公休日
                </Text>
                <Text className="font-rounded text-xs text-center" style={{ color: '#b08000' }}>
                  請選擇其他日期進行預約
                </Text>
              </View>
            ) : (
              <>
                <Text className="font-rounded text-base font-semibold text-foreground">
                  選擇時段
                  {selectedTemplate && <Text className="font-rounded text-sm text-muted-foreground font-normal">（含 {selectedTemplate.break_after_minutes} 分鐘休息）</Text>}
                </Text>
                {slotsLoading ? (
                  <View className="py-10 items-center"><ActivityIndicator color="#e8789a" /></View>
                ) : slots.length === 0 ? (
                  <Text className="font-rounded text-sm text-muted-foreground text-center py-6">此日期無可用時段</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {slots.map(slot => (
                      <Pressable
                        key={slot.time}
                        className="rounded-xl px-4 py-2.5 active:opacity-70"
                        style={{
                          backgroundColor: !slot.available ? '#f5f0f3' :
                            selectedTime === slot.time ? '#e8789a' : '#fce9f0',
                          opacity: slot.available ? 1 : 0.4,
                        }}
                        disabled={!slot.available}
                        onPress={() => setSelectedTime(slot.time)}
                      >
                        <Text
                          className="font-rounded text-sm font-medium"
                          style={{ color: !slot.available ? '#c4a0ae' : selectedTime === slot.time ? '#fff' : '#e8789a' }}
                        >
                          {slot.time}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center flex-row gap-2 mt-2 active:opacity-80"
              onPress={() => {
                setError('');
                if (isHoliday(selectedDate)) { setError('請選擇非公休日'); return; }
                if (!selectedTime) { setError('請選擇時段'); return; }
                setStep('info');
              }}
            >
              <Text className="font-rounded text-base text-white font-semibold">下一步</Text>
              <ArrowRight size={18} color="#fff" />
            </Pressable>
            {error ? <Text className="font-rounded text-xs text-destructive text-center">{error}</Text> : null}
          </View>
        )}

        {/* ── Step 4: 確認預約 ── */}
        {step === 'info' && (
          <View className="gap-4">
            <Text className="font-rounded text-base font-semibold text-foreground">確認預約資訊</Text>

            {/* 顧客身份卡片 */}
            <View className="bg-card rounded-2xl p-4 border border-border flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <User2 size={18} color="#e8789a" />
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-base font-semibold text-foreground">{customerName}</Text>
                <Text className="font-rounded text-sm text-muted-foreground">{customerPhone}</Text>
              </View>
              {isRegisteredCustomer === true && (
                <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-green-50 border border-green-100">
                  <CheckCircle size={11} color="#5dc0a0" />
                  <Text className="font-rounded text-xs" style={{ color: '#2ea87e' }}>熟客</Text>
                </View>
              )}
            </View>

            {/* 備註 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註（選填）</Text>
              <TextInput
                className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
                placeholder="過敏、特殊需求等"
                placeholderTextColor="#c4a0ae"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* 預約摘要 */}
            <View className="bg-card rounded-2xl p-4 border border-border gap-2">
              <Text className="font-rounded text-sm font-semibold text-foreground mb-1">預約摘要</Text>
              <SummaryRow label="服務" value={selectedTemplate?.name ?? ''} />
              <SummaryRow label="人員" value={selectedStaff?.name ?? ''} />
              <SummaryRow label="日期" value={toLocalDateStr(selectedDate)} />
              <SummaryRow label="時間" value={selectedTime} />
              <SummaryRow label="服務費" value={`$${Number(selectedTemplate?.default_amount ?? 0).toLocaleString()}`} />
              <View className="border-t border-border pt-2 mt-1">
                {selectedTemplate?.require_deposit && isRegisteredCustomer !== true ? (
                  <SummaryRow label="需付訂金（50%）" value={`$${depositAmount.toLocaleString()}`} highlight />
                ) : (
                  <SummaryRow
                    label="付款方式"
                    value={isRegisteredCustomer ? '到店付款（熟客免訂金）' : '到店付款（免訂金）'}
                  />
                )}
              </View>
            </View>

            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center flex-row gap-2 active:opacity-80"
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : (selectedTemplate?.require_deposit && isRegisteredCustomer !== true)
                  ? <>
                      <Text className="font-rounded text-base text-white font-semibold">前往付款訂金</Text>
                      <ArrowRight size={18} color="#fff" />
                    </>
                  : <>
                      <Text className="font-rounded text-base text-white font-semibold">確認預約</Text>
                      <CheckCircle size={18} color="#fff" />
                    </>
              }
            </Pressable>
          </View>
        )}

      </ScrollView>
        </>
      )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-rounded text-sm text-muted-foreground">{label}</Text>
      <Text className="font-rounded text-sm font-semibold" style={{ color: highlight ? '#e8789a' : '#333' }}>{value}</Text>
    </View>
  );
}
