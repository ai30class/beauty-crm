import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Search, Clock, AlertTriangle, UserCheck, Cake } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import {
  createAppointment, getCustomers, getCustomerById, getServiceTemplates, updateCustomer, getStaffForPicker,
  getAccountType, canViewCustomers, searchCustomerByPhone, createCustomerAndGetId,
} from '@/db/api';
import { normalizePhone } from '@/lib/phone';
import TimeOfDayPicker from '@/components/TimeOfDayPicker';
import { supabase } from '@/client/supabase';
import type { Customer, ServiceTemplate, StaffRosterEntry } from '@/types/types';

export default function NewAppointmentScreen() {
  const { customerId: presetCustomerId, date: presetDate, time: presetTime, staffId: presetStaffId } =
    useLocalSearchParams<{ customerId?: string; date?: string; time?: string; staffId?: string }>();
  const router = useRouter();

  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(presetStaffId ?? null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(!presetCustomerId);
  const [customerQuery, setCustomerQuery] = useState('');

  // 一般員工（沒有「瀏覽顧客名單」權限的帳號）：不能瀏覽全部顧客，只能用完整電話
  // 查「有沒有登記過」，查不到就直接在這裡建一筆新的。跟商家／有瀏覽權限的店長
  // 用的「瀏覽＋篩選」picker 是兩套完全不同的 UI，因為底層資料權限本來就不一樣
  // （見 migration 00070：staff 對 customers 只有 INSERT + 條件式 SELECT，沒有 UPDATE）。
  const [staffPhoneOnlyMode, setStaffPhoneOnlyMode] = useState(false);
  const [phoneSearchQuery, setPhoneSearchQuery] = useState('');
  const [phoneSearchResults, setPhoneSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [phoneSearchTried, setPhoneSearchTried] = useState(false);
  const [showCreateNewCustomer, setShowCreateNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustBirthday, setNewCustBirthday] = useState<Date | null>(null);
  const [showNewCustBirthdayPicker, setShowNewCustBirthdayPicker] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createCustError, setCreateCustError] = useState('');

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
  const [selectedCategory, setSelectedCategory] = useState('全部');

  const [apptDate, setApptDate] = useState<Date>(() => {
    if (presetDate) {
      const [y, m, day] = presetDate.split('-').map(Number);
      const [hh, mm] = (presetTime ?? '10:00').split(':').map(Number);
      return new Date(y, m - 1, day, hh, mm, 0, 0);
    }
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const accountType = await getAccountType().catch(() => 'merchant' as const);
      const canBrowse = accountType === 'staff' ? await canViewCustomers().catch(() => false) : true;
      const phoneOnly = accountType === 'staff' && !canBrowse;
      setStaffPhoneOnlyMode(phoneOnly);

      const [all, tpls, staff] = await Promise.all([
        phoneOnly ? Promise.resolve([]) : getCustomers(),
        getServiceTemplates(),
        getStaffForPicker(),
      ]);
      setCustomers(all);
      setTemplates(tpls);
      setStaffList(staff);
      if (presetCustomerId) {
        const c = await getCustomerById(presetCustomerId);
        if (c) selectCustomer(c);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCustomerId]);

  const handlePhoneSearch = async () => {
    const phone = normalizePhone(phoneSearchQuery);
    if (!phone) return;
    setPhoneSearching(true);
    setPhoneSearchTried(true);
    setShowCreateNewCustomer(false);
    try {
      const results = await searchCustomerByPhone(phone);
      setPhoneSearchResults(results);
    } finally {
      setPhoneSearching(false);
    }
  };

  const selectFoundCustomer = (result: { id: string; name: string }) => {
    // 只有 id/name，其餘欄位（電話/生日等）員工看不到——只有 .id 會在建立預約時真正用到，
    // 其他欄位填假值純粹是為了滿足 Customer 型別，畫面上不會顯示這些假值。
    setSelectedCustomer({
      id: result.id, owner_id: '', name: result.name, phone: '', birthday: null, notes: null,
      created_at: '', updated_at: '', booking_restricted: false, booking_allowed_hours: [], no_show_count: 0,
    });
    setShowCustomerPicker(false);
    setNeedsProfileFill(false); // 員工沒有編輯權限，不能也不需要走補資料流程
  };

  const handleCreateNewCustomer = async () => {
    setCreateCustError('');
    if (!newCustName.trim()) { setCreateCustError('請輸入姓名'); return; }
    if (!phoneSearchQuery.trim()) { setCreateCustError('請輸入電話'); return; }
    setCreatingCustomer(true);
    try {
      const birthdayStr = newCustBirthday
        ? `${newCustBirthday.getFullYear()}-${String(newCustBirthday.getMonth() + 1).padStart(2, '0')}-${String(newCustBirthday.getDate()).padStart(2, '0')}`
        : null;
      const created = await createCustomerAndGetId({
        name: newCustName.trim(), phone: normalizePhone(phoneSearchQuery), birthday: birthdayStr, notes: null,
        booking_restricted: false, booking_allowed_hours: [], no_show_count: 0,
      });
      selectFoundCustomer(created);
      setShowCreateNewCustomer(false);
      setNewCustName(''); setNewCustBirthday(null);
    } catch (e: any) {
      setCreateCustError(e.message ?? '建立失敗');
    } finally {
      setCreatingCustomer(false);
    }
  };

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
        phone: normalizePhone(profilePhone),
        birthday: birthdayStr,
      });
      // 更新本地顧客狀態
      const updated: Customer = { ...selectedCustomer, name: profileName.trim(), phone: normalizePhone(profilePhone), birthday: birthdayStr };
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

  // 服務項目的類別分頁：沿用「服務項目管理」設好的分類（沒設分類的歸「未分類」）；只有一種類別時不顯示分頁。
  // 跟「新增服務記錄」的快速選擇服務同一套做法，只是篩選、不影響已選的服務。
  const templateCategories = ['全部', ...Array.from(new Set(templates.map(t => t.category.trim() || '未分類')))];
  const activeCategory = templateCategories.includes(selectedCategory) ? selectedCategory : '全部';
  const visibleTemplates = activeCategory === '全部'
    ? templates
    : templates.filter(t => (t.category.trim() || '未分類') === activeCategory);

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
        notes: notes.trim() || null,
        status: 'pending',
        staff_id: selectedStaffId,
        // 存下所選服務的時長（沒選服務就 60 分）；排班表、顧客預約的空檔計算都靠這個
        duration_minutes: selectedTemplate?.duration_minutes ?? 60,
      });
      // 直接用網址進來（沒有上一頁）時 router.back() 不會有反應，改回預約列表
      if (router.canGoBack()) router.back();
      else router.replace('/(app)/(tabs)/appointments' as any);
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
              onPress={() => {
                setShowCustomerPicker(true); setNeedsProfileFill(false);
                setPhoneSearchQuery(''); setPhoneSearchResults([]); setPhoneSearchTried(false); setShowCreateNewCustomer(false);
              }}
            >
              <Text className="font-rounded text-base text-foreground flex-1">{selectedCustomer.name}</Text>
              <Text className="font-rounded text-sm text-primary">更換</Text>
            </Pressable>
          ) : staffPhoneOnlyMode ? (
            /* 一般員工：不能瀏覽顧客名單，只能用完整電話查、查不到就現場建一筆新的 */
            <View className="bg-card border border-border rounded-2xl overflow-hidden p-4 gap-3">
              <Text className="font-rounded text-xs text-muted-foreground">輸入顧客完整電話查詢，查不到的話可以直接建立新顧客</Text>
              <View className="flex-row gap-2">
                <View className="flex-1 flex-row items-center px-4 border border-border rounded-xl" style={{ height: 46 }}>
                  <Search size={16} color="#c4a0ae" />
                  <TextInput
                    className="flex-1 font-rounded text-base text-foreground ml-2"
                    placeholder="輸入完整手機號碼"
                    placeholderTextColor="#c4a0ae"
                    keyboardType="phone-pad"
                    value={phoneSearchQuery}
                    onChangeText={t => { setPhoneSearchQuery(t); setPhoneSearchTried(false); setPhoneSearchResults([]); setShowCreateNewCustomer(false); }}
                    onSubmitEditing={handlePhoneSearch}
                  />
                </View>
                <Pressable
                  className="bg-primary rounded-xl items-center justify-center px-4 active:opacity-80"
                  style={{ height: 46 }}
                  onPress={handlePhoneSearch}
                  disabled={phoneSearching || !phoneSearchQuery.trim()}
                >
                  {phoneSearching ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">查詢</Text>}
                </Pressable>
              </View>

              {phoneSearchTried && phoneSearchResults.length > 0 && (
                <View className="border border-border rounded-xl overflow-hidden">
                  {phoneSearchResults.map(r => (
                    <Pressable key={r.id} className="px-4 py-3 border-b border-border active:bg-muted" onPress={() => selectFoundCustomer(r)}>
                      <Text className="font-rounded text-sm text-foreground">{r.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {phoneSearchTried && phoneSearchResults.length === 0 && !phoneSearching && (
                showCreateNewCustomer ? (
                  <View className="border border-primary rounded-xl p-3 gap-2.5">
                    <Text className="font-rounded text-xs font-semibold text-foreground">建立新顧客（電話：{phoneSearchQuery.trim()}）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 font-rounded text-sm text-foreground"
                      style={{ height: 42 }}
                      placeholder="姓名 *"
                      placeholderTextColor="#c4a0ae"
                      value={newCustName}
                      onChangeText={setNewCustName}
                    />
                    <Pressable
                      className="bg-background border border-border rounded-xl px-4 justify-center"
                      style={{ height: 42 }}
                      onPress={() => setShowNewCustBirthdayPicker(p => !p)}
                    >
                      <Text className="font-rounded text-sm" style={{ color: newCustBirthday ? '#3d2b32' : '#c4a0ae' }}>
                        {newCustBirthday ? formatDate(newCustBirthday) : '生日（選填）'}
                      </Text>
                    </Pressable>
                    {showNewCustBirthdayPicker && (
                      <View className="bg-background border border-border rounded-xl overflow-hidden">
                        <DateTimePicker locale="zh-tw"
                          mode="single"
                          date={newCustBirthday ?? new Date(1990, 0, 1)}
                          onChange={(params: any) => {
                            if (params.date) setNewCustBirthday(params.date as Date);
                            setShowNewCustBirthdayPicker(false);
                          }}
                        />
                      </View>
                    )}
                    {createCustError ? <Text className="font-rounded text-xs text-destructive">{createCustError}</Text> : null}
                    <Pressable
                      className="bg-primary rounded-xl py-2.5 items-center active:opacity-80"
                      onPress={handleCreateNewCustomer}
                      disabled={creatingCustomer}
                    >
                      {creatingCustomer ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">建立並選擇</Text>}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable className="items-center py-2 active:opacity-70" onPress={() => setShowCreateNewCustomer(true)}>
                    <Text className="font-rounded text-sm text-primary font-medium">查無此人，點此建立新顧客</Text>
                  </Pressable>
                )
              )}
            </View>
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
            {templateCategories.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-2">
                <View className="flex-row gap-2 px-1 pb-1">
                  {templateCategories.map(c => (
                    <Pressable
                      key={c}
                      className="px-4 py-1.5 rounded-full active:opacity-70"
                      style={{ backgroundColor: activeCategory === c ? '#e8789a' : '#fce9f0' }}
                      onPress={() => setSelectedCategory(c)}
                    >
                      <Text className="font-rounded text-sm font-medium" style={{ color: activeCategory === c ? '#fff' : '#e8789a' }}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                {visibleTemplates.map(tpl => {
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

        {/* 服務人員 */}
        {staffList.length > 0 && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務人員（選填）</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                <Pressable
                  className="rounded-xl px-3 py-2 active:opacity-70"
                  style={{
                    backgroundColor: selectedStaffId === null ? '#e8789a' : '#f5e6ec',
                  }}
                  onPress={() => setSelectedStaffId(null)}
                >
                  <Text className="font-rounded text-sm font-medium" style={{ color: selectedStaffId === null ? '#fff' : '#c4a0ae' }}>
                    不指定
                  </Text>
                </Pressable>
                {staffList.map(s => (
                  <Pressable
                    key={s.id}
                    className="rounded-xl px-3 py-2 active:opacity-70"
                    style={{
                      backgroundColor: selectedStaffId === s.id ? s.color : s.color + '22',
                      borderWidth: 1.5,
                      borderColor: selectedStaffId === s.id ? s.color : s.color + '44',
                    }}
                    onPress={() => setSelectedStaffId(s.id)}
                  >
                    <Text className="font-rounded text-sm font-medium" style={{ color: selectedStaffId === s.id ? '#fff' : s.color }}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
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

        {/* 預約時間（點一下跳出選單選時、分；不用打字） */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約時間 *</Text>
          <TimeOfDayPicker
            hour={apptDate.getHours()}
            minute={apptDate.getMinutes()}
            onChange={(h, m) => setApptDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), h, m))}
          />
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
