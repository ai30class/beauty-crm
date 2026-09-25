import { supabase } from '@/client/supabase';
import { randomUUID } from 'expo-crypto';
import { manualDurationMin } from '@/lib/schedule';
import type {
  Customer, ServiceRecord, TrendPoint, Appointment, ServiceTemplate,
  ServicePackage, PackageTransaction, Staff, TimeSlot, ShopProfile,
  ShopPaymentSettings, WaitlistEntry, WaitlistStatus,
  BusinessHours, Expense, Product, ProductUsage, RestockLog,
  Holiday, StaffReservedSlot, OnlineOrder, OnlineOrderAddon, Coupon, CustomerCoupon, ShopBlockedSlot,
  MonthlyStats, UnifiedAppointment, ProductSalesRow,
  BirthdayCustomer, CustomerRankRow, StaffPerformanceRow,
  StaffCommissionTier, StaffBonus, PayrollRecord, DormantCustomer, SignupRequest, StaffRosterEntry,
  OwnerNotification, ClientConsent,
} from '@/types/types';

// ─── 商家申請名單（關閉自助註冊後的替代入口）───────────────────────────────────
// 沒有對應的「查詢」函式：Emma 直接在 Supabase Table Editor 看名單、手動審核，
// App 這邊只需要能寫入，不需要讀回（也讀不到，這張表沒開 SELECT policy）。
export async function createSignupRequest(
  payload: Pick<SignupRequest, 'shop_name' | 'contact_name' | 'contact_info' | 'message'>
): Promise<void> {
  const { error } = await supabase.from('signup_requests').insert(payload);
  if (error) throw error;
}

// ─── 顧客 ────────────────────────────────────────────────────────────────────

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();
  return data ?? null;
}

/**
 * 線上預約表單即時顯示「您是我們的熟客」用：透過 SECURITY DEFINER RPC
 * 只回傳 boolean，不外洩顧客 PII，也不受顧客自助登入時的 RLS 限制。
 */
export async function customerExistsByPhone(ownerId: string, phone: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('customer_exists_by_phone', { p_owner_id: ownerId, p_phone: phone });
  if (error) throw error;
  return !!data;
}

// 已登入的回頭客：讀出這位顧客上次在這家店留的姓名/電話/生日，不用重打
export async function getMyCustomerProfile(ownerId: string): Promise<{ id: string; name: string; phone: string; birthday: string | null } | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, birthday')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function createCustomer(payload: Omit<Customer, 'id' | 'owner_id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('customers').insert(payload);
  if (error) throw error;
}

// 排預約現場建新顧客用：需要 id/name 才能直接掛上這筆預約。
// 員工帳號（沒開「瀏覽顧客名單」）對 customers 只有 INSERT policy、沒有 SELECT policy，
// 而 INSERT ... RETURNING（.insert().select()）要求寫入的那一列也得通過 SELECT policy，
// 否則整筆會被擋下（"new row violates row-level security policy"）。
// 所以 id 由前端先產生、insert 不帶 .select()（不回傳資料），name 直接用送出去的那個。
export async function createCustomerAndGetId(payload: Omit<Customer, 'id' | 'owner_id' | 'created_at' | 'updated_at'>): Promise<{ id: string; name: string }> {
  const id = randomUUID();
  const { error } = await supabase.from('customers').insert({ id, ...payload });
  if (error) throw error;
  return { id, name: payload.name };
}

export async function updateCustomer(id: string, payload: Partial<Pick<Customer, 'name' | 'phone' | 'birthday' | 'notes' | 'booking_restricted' | 'booking_allowed_hours' | 'tags' | 'referral_source'>>): Promise<void> {
  const { error } = await supabase.from('customers').update(payload).eq('id', id);
  if (error) throw error;
}

// 標記顧客一次未到場，累加 no_show_count（用於商家取消預約時勾選「同時標記未到場」）
export async function incrementCustomerNoShow(customerId: string): Promise<void> {
  const { data, error: selErr } = await supabase
    .from('customers')
    .select('no_show_count')
    .eq('id', customerId)
    .single();
  if (selErr) throw selErr;
  const { error } = await supabase
    .from('customers')
    .update({ no_show_count: (data?.no_show_count ?? 0) + 1 })
    .eq('id', customerId);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

export async function searchCustomers(query: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
    .order('name')
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 服務記錄 ────────────────────────────────────────────────────────────────

export async function getServiceRecordsByCustomer(customerId: string): Promise<ServiceRecord[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('customer_id', customerId)
    .order('service_date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createServiceRecord(payload: Omit<ServiceRecord, 'id' | 'owner_id' | 'created_at' | 'customer'>): Promise<ServiceRecord> {
  const { data, error } = await supabase.from('service_records').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateServiceRecord(
  id: string,
  payload: Partial<Pick<ServiceRecord, 'before_photo_path' | 'after_photo_path' | 'notes' | 'service_name' | 'amount' | 'co_staff_id' | 'staff_share_percent' | 'co_staff_share_percent'>>
): Promise<void> {
  const { error } = await supabase.from('service_records').update(payload).eq('id', id);
  if (error) throw error;
}

export async function getServiceRecordById(id: string): Promise<ServiceRecord | null> {
  const { data } = await supabase
    .from('service_records')
    .select('*, customer:customers!customer_id(name), staff:staff!staff_id(name, color), co_staff:staff!co_staff_id(name, color)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function deleteServiceRecord(id: string): Promise<void> {
  // 先記下照片路徑，記錄刪掉後再刪檔案（檔案刪除失敗不擋，只是可能留下孤兒檔）
  const { data: rec } = await supabase
    .from('service_records')
    .select('before_photo_path, after_photo_path')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase.from('service_records').delete().eq('id', id);
  if (error) throw error;
  await removeClientPhotos([rec?.before_photo_path, rec?.after_photo_path]);
}

// ─── 顧客施術前後照片（私有空間，見 migration 00083）────────────────────────────
export const CLIENT_PHOTO_BUCKET = 'client_service_photos';

// 目前登入者所屬的店家 ID：商家是自己，員工是所屬商家（照片資料夾以店家 ID 分開）
export async function getMyShopOwnerId(): Promise<string> {
  const link = await getMyStaffLink().catch(() => null);
  if (link) return link.staffOwnerId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('尚未登入');
  return user.id;
}

// 私有空間的照片要用「簽名網址」才看得到，1 小時後失效；取不到就回 null（畫面顯示未上傳）
export async function getClientPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(CLIENT_PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function removeClientPhotos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  await supabase.storage.from(CLIENT_PHOTO_BUCKET).remove(list).catch(() => {});
}

// ─── 顧客同意書電子簽名（migration 00090；目前只有 form_type='portrait'）──────────
// 簽名圖檔跟施術照片共用同一個私有空間，路徑另外加 consents/ 前綴區分，見 migration 00090 說明。
// staffId：登入者是員工帳號時，呼叫端要傳自己的 staff id（RLS 要求 staff_id 等於自己）；
// 商家本人簽署／見證則傳 null，或商家在畫面上選了某位員工代替，就傳那位員工的 id。
export async function createClientConsent(
  payload: Omit<ClientConsent, 'id' | 'owner_id' | 'created_at'>,
): Promise<void> {
  const ownerId = await getMyShopOwnerId();
  const { error } = await supabase.from('client_consents').insert({ ...payload, owner_id: ownerId });
  if (error) throw error;
}

export async function getClientConsentsByCustomer(customerId: string): Promise<ClientConsent[]> {
  const { data, error } = await supabase
    .from('client_consents')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getClientConsentById(id: string): Promise<ClientConsent | null> {
  const { data, error } = await supabase.from('client_consents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 查這位顧客某一種同意書「最近一次」簽的是哪一筆（用來判斷還要不要簽：見 appointments/[id].tsx 的提醒）
export async function getLatestConsentByFormType(
  customerId: string, formType: ClientConsent['form_type'],
): Promise<ClientConsent | null> {
  const { data, error } = await supabase
    .from('client_consents')
    .select('*')
    .eq('customer_id', customerId)
    .eq('form_type', formType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 補傳／更換單張照片。RLS 擋下時 update 不報錯、只更新 0 筆，所以要檢查筆數
export async function setServiceRecordPhoto(
  id: string,
  field: 'before_photo_path' | 'after_photo_path',
  path: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('service_records')
    .update({ [field]: path })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('沒有權限修改這筆服務記錄的照片');
}

export async function getServiceRecordsByMonth(year: number, month: number): Promise<ServiceRecord[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0);
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('service_records')
    .select('*, customer:customers!customer_id(name)')
    .gte('service_date', start)
    .lte('service_date', endStr)
    .eq('status', 'completed')
    .order('service_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 預約 ────────────────────────────────────────────────────────────────────

export async function getAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customer:customers!customer_id(name, phone), staff:staff!staff_id(name, color)')
    .order('appointment_time', { ascending: true })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customer:customers!customer_id(name, phone), staff:staff!staff_id(name, color)')
    .eq('customer_id', customerId)
    .order('appointment_time', { ascending: true })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// reminder_minutes 不再由畫面填寫（前一天提醒是排程固定發送，不讀這個欄位），新增時交給資料庫預設值 30
export async function createAppointment(payload: Omit<Appointment, 'id' | 'owner_id' | 'created_at' | 'customer' | 'staff' | 'reminder_minutes'>): Promise<void> {
  const { error } = await supabase.from('appointments').insert(payload);
  if (error) throw error;
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customer:customers!customer_id(name, phone), staff:staff!staff_id(name, color)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function updateAppointment(
  id: string,
  payload: Partial<Pick<Appointment, 'appointment_time' | 'notes' | 'status' | 'staff_id' | 'duration_minutes'>>
): Promise<void> {
  const { error } = await supabase.from('appointments').update(payload).eq('id', id);
  if (error) throw error;
}

export async function updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { data, error } = await supabase.from('appointments').delete().eq('id', id).select('id');
  if (error) throw error;
  // RLS 擋掉時 delete 不會報錯、只是刪 0 筆，畫面會像「刪了又跑出來」，這裡明確丟錯
  if (!data || data.length === 0) throw new Error('沒有權限刪除這筆預約，或它已經不存在');
}

export async function getDailyServiceRecords(dateStr: string): Promise<ServiceRecord[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select('*, customer:customers!customer_id(name)')
    .eq('service_date', dateStr)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 支出 ────────────────────────────────────────────────────────────────────

export async function getExpensesByMonth(year: number, month: number): Promise<Expense[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0);
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .gte('expense_date', start)
    .lte('expense_date', endStr)
    .order('expense_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createExpense(payload: Omit<Expense, 'id' | 'owner_id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('expenses').insert(payload);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── 服務項目模板 ─────────────────────────────────────────────────────────────

export async function getServiceTemplates(): Promise<ServiceTemplate[]> {
  const { data, error } = await supabase
    .from('service_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getServiceTemplateById(id: string): Promise<ServiceTemplate | null> {
  const { data, error } = await supabase.from('service_templates').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 顧客線上預約頁專用：見 getActiveStaffByOwner 的說明，同樣的理由要帶 owner_id
export async function getServiceTemplatesByOwner(ownerId: string): Promise<ServiceTemplate[]> {
  const { data, error } = await supabase
    .from('service_templates')
    .select('*')
    .eq('owner_id', ownerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createServiceTemplate(
  payload: Omit<ServiceTemplate, 'id' | 'owner_id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('service_templates').insert(payload);
  if (error) throw error;
}

export async function updateServiceTemplate(
  id: string,
  payload: Partial<Pick<ServiceTemplate, 'name' | 'category' | 'duration_minutes' | 'default_amount' | 'color' | 'sort_order' | 'allow_online_booking' | 'require_deposit' | 'deposit_percent' | 'break_after_minutes' | 'is_addon' | 'consent_form_type' | 'consent_group'>>
): Promise<void> {
  const { error } = await supabase.from('service_templates').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteServiceTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('service_templates').delete().eq('id', id);
  if (error) throw error;
}

// ─── 套票/儲值卡 ──────────────────────────────────────────────────────────────

export async function getPackagesByCustomer(customerId: string): Promise<ServicePackage[]> {
  const { data, error } = await supabase
    .from('service_packages')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 顧客端：查自己的儲值卡/套票餘額（RLS 依 online_orders.customer_user_id
// 反查 customer_id，只給選填的顯示欄位，不含商家內部備註）
export async function getMyPackages(): Promise<Pick<ServicePackage,
  'id' | 'package_type' | 'name' | 'total_sessions' | 'used_sessions' |
  'initial_amount' | 'remaining_amount' | 'purchase_date' | 'expire_date' | 'is_active'
>[]> {
  const { data, error } = await supabase
    .from('service_packages')
    .select('id, package_type, name, total_sessions, used_sessions, initial_amount, remaining_amount, purchase_date, expire_date, is_active')
    .order('is_active', { ascending: false })
    .order('purchase_date', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createServicePackage(
  payload: Omit<ServicePackage, 'id' | 'owner_id' | 'used_sessions' | 'created_at'> & {
    // 儲值卡可以「多送一點」：initial_amount/remaining_amount 是顧客實際可用的總餘額
    // （含贈送），但收入報表要照實收金額入帳，不能把贈送的部分也算成營收——
    // 不填就沿用舊行為（直接拿 initial_amount 當收入）
    actual_received_amount?: number;
  }
): Promise<void> {
  const { actual_received_amount, ...pkgPayload } = payload;

  // 1. 建立套票
  const { data: pkg, error } = await supabase
    .from('service_packages')
    .insert(pkgPayload)
    .select('id')
    .single();
  if (error) throw error;

  // 2. 同步建立服務記錄 → 計入當日收入（報表用）
  //    優先用實收金額（贈送情境下 < initial_amount）；沒有才退回用 initial_amount
  const incomeAmt = actual_received_amount ?? (payload.initial_amount ?? 0);

  if (incomeAmt > 0) {
    await supabase.from('service_records').insert({
      customer_id: payload.customer_id,
      service_name: `【套票購買】${payload.name}`,
      amount: incomeAmt,
      service_date: payload.purchase_date,
      notes: `套票購買，關聯套票 ID: ${pkg.id}`,
      before_photo_path: null,
      after_photo_path: null,
      payment_method: payload.purchase_payment_method ?? 'cash',
      package_id: null,
      status: 'completed',
    });
  }
}

export async function deactivatePackage(id: string): Promise<void> {
  const { error } = await supabase.from('service_packages').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function getPackageTransactions(packageId: string): Promise<PackageTransaction[]> {
  const { data, error } = await supabase
    .from('package_transactions')
    .select('*')
    .eq('package_id', packageId)
    .order('used_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function usePackageSession(packageId: string, sessions: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('use_package_session', {
    p_package_id: packageId,
    p_sessions: sessions,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function usePackageAmount(packageId: string, amount: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('use_package_amount', {
    p_package_id: packageId,
    p_amount: amount,
    p_note: note ?? null,
  });
  if (error) throw error;
}

// ─── 報表統計 ────────────────────────────────────────────────────────────────

export async function getMonthlyStats(year: number, month: number): Promise<MonthlyStats> {
  const [records, expenses] = await Promise.all([
    getServiceRecordsByMonth(year, month),
    getExpensesByMonth(year, month),
  ]);

  const totalIncome = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = totalIncome - totalExpenses;
  const serviceCount = records.length;

  // 統計服務項目
  const serviceMap: Record<string, { count: number; revenue: number }> = {};
  for (const r of records) {
    if (!serviceMap[r.service_name]) serviceMap[r.service_name] = { count: 0, revenue: 0 };
    serviceMap[r.service_name].count += 1;
    serviceMap[r.service_name].revenue += Number(r.amount);
  }
  const topServices = Object.entries(serviceMap)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return { totalIncome, totalExpenses, netIncome, serviceCount, topServices };
}

// ─── 趨勢圖資料 ──────────────────────────────────────────────────────────────

export async function getIncomeTrend(
  startYear: number, startMonth: number,
  endYear: number, endMonth: number
): Promise<TrendPoint[]> {
  const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(new Date(endYear, endMonth, 0).getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('monthly_income_summary')
    .select('year, month, total_income, service_count')
    .gte('year', startYear)
    .lte('year', endYear)
    .order('year', { ascending: true })
    .order('month', { ascending: true });
  if (error) throw error;

  // 過濾精確日期範圍
  const all: TrendPoint[] = (Array.isArray(data) ? data : []).filter(d => {
    const key = d.year * 100 + d.month;
    return key >= startYear * 100 + startMonth && key <= endYear * 100 + endMonth;
  }).map(d => ({
    year: d.year,
    month: d.month,
    total_income: Number(d.total_income),
    service_count: Number(d.service_count),
  }));

  // 補全缺失月份（補 0）
  const result: TrendPoint[] = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const found = all.find(d => d.year === y && d.month === m);
    result.push(found ?? { year: y, month: m, total_income: 0, service_count: 0 });
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
}

// 取得照片公開 URL
export function getPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage
    .from('appd2yss59nidj5_service_photos')
    .getPublicUrl(path);
  return data.publicUrl;
}

// ─── 服務人員 ────────────────────────────────────────────────────────────────

export async function getStaff(): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getActiveStaff(): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 顧客線上預約頁專用：走 get_booking_staff 函式（00106），只拿公開欄位（名字、顏色、簡介、大頭照），
// 拿不到底薪、抽成、權限開關——原本 select('*') 會把這些薪資欄位整列送到顧客瀏覽器。
// 函式內已限定這家店、服務中的人員，依建立時間排序。
export type PublicStaff = Pick<Staff, 'id' | 'owner_id' | 'name' | 'role' | 'color' | 'is_active' | 'bio' | 'avatar_url' | 'created_at'>;

export async function getActiveStaffByOwner(ownerId: string): Promise<PublicStaff[]> {
  const { data, error } = await supabase.rpc('get_booking_staff', { p_owner: ownerId });
  if (error) throw error;
  return Array.isArray(data) ? (data as PublicStaff[]) : [];
}

export async function createStaff(payload: Omit<Staff, 'id' | 'owner_id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('staff').insert(payload);
  if (error) throw error;
}

export async function updateStaff(id: string, payload: Partial<Pick<Staff, 'name' | 'role' | 'color' | 'is_active' | 'commission_rate' | 'bio' | 'avatar_url' | 'base_salary' | 'can_view_customers' | 'can_manage_pricing' | 'can_manage_shop_settings' | 'can_complete_online_orders'>>): Promise<void> {
  const { error } = await supabase.from('staff').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw error;
}

// ─── 公休日 ──────────────────────────────────────────────────────────────────

export async function getHolidays(year: number, month: number): Promise<Holiday[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0);
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .gte('holiday_date', start)
    .lte('holiday_date', endStr)
    .order('holiday_date');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 人員預留時間（週排班表點空白處直接標記時段已佔用，不綁定顧客）──────────────────
export async function getStaffReservedSlots(fromDate: string, toDate: string): Promise<StaffReservedSlot[]> {
  const { data, error } = await supabase
    .from('staff_reserved_slots')
    .select('*')
    .gte('reserved_date', fromDate)
    .lte('reserved_date', toDate)
    .order('start_time');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createStaffReservedSlot(
  payload: Omit<StaffReservedSlot, 'id' | 'owner_id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('staff_reserved_slots').insert(payload);
  if (error) throw error;
}

export async function deleteStaffReservedSlot(id: string): Promise<void> {
  const { error } = await supabase.from('staff_reserved_slots').delete().eq('id', id);
  if (error) throw error;
}

export async function getAllHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from('holidays')
    .select('*, staff:staff!staff_id(name, color)')
    .order('holiday_date');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 顧客線上預約頁專用：見 getActiveStaffByOwner 的說明，同樣的理由要帶 owner_id
export async function getHolidaysByOwner(ownerId: string): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from('holidays')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('owner_id', ownerId)
    .order('holiday_date');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createHoliday(holidayDate: string, note?: string, staffId?: string | null): Promise<void> {
  const { error } = await supabase.from('holidays').insert({
    holiday_date: holidayDate,
    note: note ?? null,
    staff_id: staffId ?? null,
  });
  if (error) throw error;
}

export async function deleteHoliday(id: string): Promise<void> {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
}

// ─── 可用時段查詢 ─────────────────────────────────────────────────────────────

export async function getAvailableSlots(
  ownerId: string,
  staffId: string | null,
  dateStr: string,
  durationMinutes: number,
  breakMinutes: number,
  customerPhone?: string,
  businessHours?: BusinessHours | null,
): Promise<TimeSlot[]> {
  // 取得當天已被佔用的時段：線上預約（已付款／已確認／還在等訂金確認的）、店裡手動預約、
  // 設計師的預留時間（上課、外出…）。顧客讀不到後兩張表，所以由資料庫函式 get_busy_ranges
  // 代查，且只回傳「設計師代號＋起訖時間」（沒有姓名電話）。
  // 指定設計師時只看那位的；沒指定（null）時以全店的去對衝突，避免超收。
  const dayStartDate = new Date(`${dateStr}T00:00:00`);
  const dayEndDate = new Date(dayStartDate.getTime() + 24 * 60 * 60 * 1000);
  type BusyRow = { busy_staff_id: string | null; busy_start: string; busy_end: string };
  let busyRows: BusyRow[] | null = null;
  const { data: busyData, error: busyError } = await supabase.rpc('get_busy_ranges', {
    p_owner_id: ownerId,
    p_from: dayStartDate.toISOString(),
    p_to: dayEndDate.toISOString(),
  });
  if (!busyError && Array.isArray(busyData)) {
    busyRows = busyData as BusyRow[];
  } else {
    // 函式還沒建立或呼叫失敗時退回舊做法（只看線上預約），避免整天時段都顯示可約
    console.warn('get_busy_ranges 失敗，退回只看線上預約：', busyError?.message);
    let legacyQuery = supabase
      .from('online_orders')
      .select('staff_id, appointment_time, end_time')
      .eq('owner_id', ownerId)
      .in('status', ['paid', 'confirmed'])
      .gte('appointment_time', dayStartDate.toISOString())
      .lt('appointment_time', dayEndDate.toISOString());
    if (staffId) legacyQuery = legacyQuery.eq('staff_id', staffId);
    const { data: legacyOrders } = await legacyQuery;
    busyRows = (legacyOrders ?? []).map((o: { staff_id: string | null; appointment_time: string; end_time: string }) => ({
      busy_staff_id: o.staff_id, busy_start: o.appointment_time, busy_end: o.end_time,
    }));
  }

  const busyRanges = busyRows
    .filter(r => !staffId || r.busy_staff_id === staffId)
    .map(r => ({
      start: new Date(r.busy_start).getTime(),
      end: new Date(r.busy_end).getTime(),
    }));

  // 取得全店封閉時段——specific_date 有設定時是「只有某一天」的單次封鎖，
  // 只在那一天生效，忽略 applies_to；沒設定則照原本的每週固定規則
  const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T12:00:00').getDay()];
  const { data: blockedRows } = await supabase
    .from('shop_blocked_slots')
    .select('start_time, end_time, applies_to, specific_date, staff_id')
    .eq('owner_id', ownerId);
  // staff_id 為 null 是全店封閉，永遠套用；有值是「只有那位設計師」的個人封鎖時段，
  // 只有查的就是那位設計師時才套用（沒指定設計師時只看全店封閉）
  const blockedSlots = (blockedRows ?? []).filter((b: { applies_to: string[]; start_time: string; end_time: string; specific_date: string | null; staff_id: string | null }) =>
    (!b.staff_id || b.staff_id === staffId) &&
    (b.specific_date ? b.specific_date === dateStr : (b.applies_to.length === 0 || b.applies_to.includes(dayKey)))
  );

  // 取得顧客限制（若有傳 customerPhone）
  let allowedHours: { start: string; end: string }[] = [];
  let customerRestricted = false;
  if (customerPhone) {
    const { data: cust } = await supabase
      .from('customers')
      .select('booking_restricted, booking_allowed_hours')
      .eq('owner_id', ownerId)
      .eq('phone', customerPhone)
      .maybeSingle();
    if (cust?.booking_restricted && Array.isArray(cust.booking_allowed_hours) && cust.booking_allowed_hours.length > 0) {
      customerRestricted = true;
      allowedHours = cust.booking_allowed_hours;
    }
  }

  // 時間字串 "HH:MM" → 當天的分鐘數
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // 商家當天的實際營業時間（沒有設定時退回 09:00–20:00 當預設，避免炸掉舊呼叫端）
  const dayHours = businessHours?.[dayKey as keyof BusinessHours];
  const openMins = dayHours?.open !== false && dayHours?.start ? toMins(dayHours.start) : 9 * 60;
  const closeMins = dayHours?.open !== false && dayHours?.end ? toMins(dayHours.end) : 20 * 60;

  // 依營業時間產生每 30 分鐘一格的時段
  const closeH = Math.floor(closeMins / 60);
  const closeM = closeMins % 60;
  // 用「當天 00:00＋分鐘數」算打烊時間：營業到 24:00（1440 分）時，`T24:00:00` 這種寫法不是每個瀏覽器都能解析
  const closeDate = new Date(dayStartDate.getTime() + closeMins * 60000);

  const slots: TimeSlot[] = [];
  for (let slotMins = openMins; slotMins < closeMins; slotMins += 30) {
    const h = Math.floor(slotMins / 60);
    const min = slotMins % 60;
    const slotStart = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`);
    const slotEnd = new Date(slotStart.getTime() + (durationMinutes + breakMinutes) * 60000);
    if (slotEnd > closeDate) continue;
    // 已經過去的時段不列出來（預約當天才會遇到）：資料庫送出時本來就會擋「不能預約已經過去的時間」，
    // 但畫面上還顯示可選、甚至可以點去登記候補，顧客會以為今天約不了
    if (slotStart.getTime() <= Date.now()) continue;

    // 既有預約衝突
    const conflict = busyRanges.some(r =>
      slotStart.getTime() < r.end && slotEnd.getTime() > r.start
    );

    // 全店封閉時段
    const shopBlocked = blockedSlots.some((b: { start_time: string; end_time: string }) => {
      const bs = toMins(b.start_time);
      const be = toMins(b.end_time);
      return slotMins >= bs && slotMins < be;
    });

    // 顧客限制：只允許特定時段
    const custBlocked = customerRestricted && !allowedHours.some(r => {
      const rs = toMins(r.start);
      const re = toMins(r.end);
      return slotMins >= rs && slotMins < re;
    });

    slots.push({
      time: `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,
      available: !conflict && !shopBlocked && !custBlocked,
    });
  }
  return slots;
}

// ─── 線上訂單 ─────────────────────────────────────────────────────────────────

// 送出預約／顧客改期的當下，資料庫（00080 觸發器）發現這個時段已被佔用會丟 SLOT_TAKEN，
// 轉成顧客看得懂的話；其他錯誤照原樣丟出。
export const SLOT_TAKEN_MESSAGE = '這個時段剛被預約了，請重新選擇其他時段。';
function throwBookingError(error: { message?: string }): never {
  if (error?.message?.includes('SLOT_TAKEN')) throw new Error(SLOT_TAKEN_MESSAGE);
  throw error;
}

// 員工調整線上預約的時間（migration 00086）：員工讀寫不到 online_orders，只能走這支函式，而且只能改時間
export async function staffRescheduleOnlineOrder(orderId: string, appointmentTimeISO: string): Promise<void> {
  const { error } = await supabase.rpc('staff_reschedule_online_order', {
    p_order_id: orderId,
    p_appointment_time: appointmentTimeISO,
  });
  if (!error) return;
  const msg = error.message ?? '';
  if (msg.includes('SLOT_TAKEN')) throw new Error('這位設計師在這個時段已經有預約了，請選其他時間。');
  if (msg.includes('ORDER_NOT_EDITABLE')) throw new Error('這筆預約已完成、取消或退款，不能再調整時間。');
  if (msg.includes('ORDER_NOT_FOUND')) throw new Error('找不到這筆預約，請重新整理後再試。');
  throw error;
}

// 員工完成線上預約並記帳（簡化版，migration 00087）：員工讀寫不到 online_orders／別人的服務記錄，
// 一律走下面三支專用函式；有沒有權限由商家在「服務人員管理」逐人開關（預設關）。
export async function staffCanCompleteOnlineOrders(): Promise<boolean> {
  const { data, error } = await supabase.rpc('staff_can_complete_online_orders');
  if (error) throw error;
  return data === true;
}

export interface OnlineOrderForCompletion {
  id: string;
  customer_id: string | null;
  customer_name: string;
  service_name: string;
  total_amount: number;
  deposit_amount: number;
  deposit_method: 'line_pay' | 'bank_transfer' | null;
  staff_id: string | null;
  appointment_time: string;
  status: string;
}

// 沒有權限、不是自己店家的訂單、或狀態不是已付訂金／已確認，都會回傳 null
export async function getOnlineOrderForCompletion(orderId: string): Promise<OnlineOrderForCompletion | null> {
  const { data, error } = await supabase.rpc('staff_get_online_order_for_completion', { p_order_id: orderId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { ...row, total_amount: Number(row.total_amount), deposit_amount: Number(row.deposit_amount ?? 0) };
}

const STAFF_COMPLETE_ERRORS: Record<string, string> = {
  NOT_ALLOWED: '你沒有「完成線上預約並記帳」的權限，請聯絡店家開啟。',
  INVALID_PAYMENT_METHOD: '付款方式不正確，請重新選擇。',
  INVALID_AMOUNT: '金額不正確，請重新輸入。',
  ORDER_NOT_FOUND: '找不到這筆預約，請重新整理後再試。',
  ORDER_NOT_COMPLETABLE: '這筆預約已經完成、取消，或還沒確認收款，不能完成服務。',
  NO_CUSTOMER: '這筆預約沒有對應的顧客資料，請由店家處理。',
  STAFF_REQUIRED: '請選擇這次服務的設計師。',
  INVALID_STAFF: '選擇的設計師不在這家店，請重新選擇。',
};

// 回傳新建立的服務記錄 id。建立服務記錄與把訂單標成已完成是同一個資料庫交易，不會只做一半。
export async function staffCompleteOnlineOrder(payload: {
  orderId: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'line_pay' | 'mobile_pay';
  notes: string;
  staffId: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('staff_complete_online_order', {
    p_order_id: payload.orderId,
    p_amount: payload.amount,
    p_payment_method: payload.paymentMethod,
    p_notes: payload.notes,
    p_staff_id: payload.staffId,
  });
  if (error) {
    const msg = error.message ?? '';
    const known = Object.keys(STAFF_COMPLETE_ERRORS).find(k => msg.includes(k));
    if (known) throw new Error(STAFF_COMPLETE_ERRORS[known]);
    throw error;
  }
  return data as string;
}

export async function getOnlineOrders(): Promise<OnlineOrder[]> {
  const { data, error } = await supabase
    .from('online_orders')
    .select('*, staff:staff!staff_id(name, color)')
    .order('appointment_time', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getOnlineOrderById(id: string): Promise<OnlineOrder | null> {
  const { data } = await supabase
    .from('online_orders')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function getOnlineOrderByOrderId(orderId: string): Promise<OnlineOrder | null> {
  const { data } = await supabase
    .from('online_orders')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('line_pay_order_id', orderId)
    .maybeSingle();
  return data;
}

export async function updateOnlineOrderStatus(id: string, status: OnlineOrder['status']): Promise<void> {
  const { error } = await supabase.from('online_orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteOnlineOrder(id: string): Promise<void> {
  const { data, error } = await supabase.from('online_orders').delete().eq('id', id).select('id');
  if (error) throw error;
  // 員工帳號對 online_orders 沒有刪除權限（只有商家自己能刪），RLS 擋掉時會刪 0 筆而且不報錯
  if (!data || data.length === 0) throw new Error('沒有權限刪除這筆線上預約（只有商家帳號可以刪除），或它已經不存在');
}

export async function updateOnlineOrder(id: string, payload: {
  appointment_time?: string;
  end_time?: string;
  staff_id?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('online_orders').update(payload).eq('id', id);
  if (error) throw error;
}

// 顧客自助查詢頁（未登入，靠手機號）專用：走 SECURITY DEFINER function，
// 資料庫端強制比對 customer_phone 吻合才能改，不能只憑訂單 id 就改到別人的預約
export async function updateOnlineOrderByPhone(
  id: string,
  phone: string,
  payload: { appointment_time: string; notes: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('update_online_order_by_phone', {
    p_id: id,
    p_phone: phone,
    p_appointment_time: payload.appointment_time,
    p_notes: payload.notes,
  });
  if (error) throwBookingError(error);
}

export async function cancelOnlineOrderByPhone(id: string, phone: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_online_order_by_phone', { p_id: id, p_phone: phone });
  if (error) throw error;
}

// 顧客自助查詢：依手機號查詢所有預約
// 走 SECURITY DEFINER function（不是直接 select 整張表）——RLS 沒辦法限制
// 「未登入的人只能用自己知道的手機號碼查」，只能靠資料庫端強制比對手機號碼。
export async function getOnlineOrdersByPhone(phone: string): Promise<OnlineOrder[]> {
  const { data, error } = await supabase.rpc('get_online_orders_by_phone', { p_phone: phone });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    ...row,
    staff: row.staff_name ? { name: row.staff_name, color: row.staff_color } : undefined,
  })) as OnlineOrder[];
}

// ─── 候補名單 ─────────────────────────────────────────────────────────────────
// 只有商家自己能查看名單（RLS 沒有給顧客的 SELECT 規則），顧客（含未登入）只能新增登記

export async function createWaitlistEntry(payload: {
  owner_id: string;
  customer_name: string;
  customer_phone: string;
  customer_user_id: string | null;
  staff_id: string | null;
  service_template_id: string | null;
  service_name: string;
  duration_minutes: number;
  desired_date: string;
  desired_time: string;
  notes?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('waitlist_entries').insert(payload);
  if (error) throw error;
}

export async function getWaitlistEntries(): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select('*, staff:staff!staff_id(name, color)')
    .order('desired_date', { ascending: true })
    .order('desired_time', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function updateWaitlistEntryStatus(id: string, status: WaitlistStatus): Promise<void> {
  const { error } = await supabase.from('waitlist_entries').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteWaitlistEntry(id: string): Promise<void> {
  const { error } = await supabase.from('waitlist_entries').delete().eq('id', id);
  if (error) throw error;
}

// 顧客送出線上預約（migration 00101）：只送「哪家店、哪個服務、哪位設計師、哪個時間、哪些加購、姓名電話生日」，
// 顧客檔案、價格、時長、訂金比例、熟客免訂金、狀態、結束時間、時段規則、主單＋加購，全部由資料庫決定，
// 前端不再直接寫入 online_orders / online_order_addons（舊的直接寫入規則已由 00102 拆掉）。
export async function createOnlineOrder(payload: {
  owner_id: string;
  customer_name: string;
  customer_phone: string;
  customer_birthday: string | null;
  staff_id: string | null;
  service_template_id: string;
  appointment_time: string;
  notes: string | null;
  addon_template_ids: string[];
}): Promise<{ orderId: string; bookingMode: 'deposit' | 'direct'; depositAmount: number; wasAlreadyRegistered: boolean }> {
  const { data, error } = await supabase
    .rpc('create_online_order', {
      p_owner_id:            payload.owner_id,
      p_name:                payload.customer_name,
      p_phone:               payload.customer_phone,
      p_birthday:            payload.customer_birthday,
      p_staff_id:            payload.staff_id,
      p_service_template_id: payload.service_template_id,
      p_appointment_time:    payload.appointment_time,
      p_notes:               payload.notes,
      p_addon_template_ids:  payload.addon_template_ids,
    })
    .single();
  if (error) throwBookingError(error);
  const row = data as { order_id: string; booking_mode: 'deposit' | 'direct'; deposit_amount: number; was_already_registered: boolean };
  return {
    orderId: row.order_id,
    bookingMode: row.booking_mode,
    depositAmount: Number(row.deposit_amount),
    wasAlreadyRegistered: row.was_already_registered,
  };
}

// ─── 加購服務 ─────────────────────────────────────────────────────────────────

// 商家後台用：一次查多筆訂單各自加購了什麼（訂單列表要顯示用）
export async function getOnlineOrderAddonsByOrderIds(orderIds: string[]): Promise<OnlineOrderAddon[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('online_order_addons')
    .select('*')
    .in('order_id', orderIds);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 保養品庫存 ───────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function createProduct(payload: Omit<Product, 'id' | 'owner_id' | 'created_at'>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, payload: Partial<Omit<Product, 'id' | 'owner_id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// 補貨（直接用 RPC 確保 authenticated 檢查）
export async function restockProduct(id: string, qty: number, costTotal = 0, note = ''): Promise<void> {
  const { error } = await supabase.rpc('restock_product', { p_id: id, qty });
  if (error) throw error;
  // 寫入補貨記錄
  const { error: logError } = await supabase.from('restock_log').insert({
    product_id: id,
    qty,
    cost_total: costTotal,
    note: note.trim() || null,
  });
  if (logError) throw logError;
}

// 原子扣庫存，回傳實際扣減量
export async function deductProductStock(id: string, qty: number): Promise<number> {
  const { data, error } = await supabase.rpc('deduct_product_stock', { p_id: id, qty });
  if (error) throw error;
  return data as number;
}

// 取得某筆服務記錄的保養品使用明細
export async function getProductUsageByRecord(serviceRecordId: string): Promise<ProductUsage[]> {
  const { data, error } = await supabase
    .from('product_usage')
    .select('*, product:products!product_id(name, spec)')
    .eq('service_record_id', serviceRecordId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ProductUsage[];
}

// 批量新增使用明細（保存服務記錄時呼叫）
export async function createProductUsageBatch(
  serviceRecordId: string,
  items: { product_id: string; quantity: number; sell_price?: number }[]
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map(i => ({
    service_record_id: serviceRecordId,
    product_id: i.product_id,
    quantity: i.quantity,
    sell_price: i.sell_price ?? 0,
  }));
  const { error } = await supabase.from('product_usage').insert(rows);
  if (error) throw error;
}

// 取得保養品月銷售報表
export async function getProductSalesReport(
  year: number,
  month: number
): Promise<ProductSalesRow[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('product_usage')
    .select('product_id, quantity, sell_price, sell_amount, product:products!product_id(name, spec, sell_price, cost_price), service_record:service_records!service_record_id(service_date)')
    .gte('created_at', startDate)
    .lt('created_at', endDate);
  if (error) throw error;
  // 彙總
  const map = new Map<string, ProductSalesRow>();
  for (const row of (data ?? []) as any[]) {
    const pid = row.product_id as string;
    const existing = map.get(pid);
    const qty = Number(row.quantity ?? 0);
    const amt = Number(row.sell_amount ?? 0);
    const costUnit = Number(row.product?.cost_price ?? 0);
    const cost = costUnit * qty;
    if (existing) {
      existing.total_qty += qty;
      existing.total_amount += amt;
      existing.total_cost += cost;
      existing.gross_profit = existing.total_amount - existing.total_cost;
      existing.gross_margin = existing.total_amount > 0
        ? existing.gross_profit / existing.total_amount : 0;
    } else {
      const grossProfit = amt - cost;
      map.set(pid, {
        product_id: pid,
        product_name: row.product?.name ?? '—',
        product_spec: row.product?.spec ?? '',
        sell_price: Number(row.sell_price ?? row.product?.sell_price ?? 0),
        cost_price: costUnit,
        total_qty: qty,
        total_amount: amt,
        total_cost: cost,
        gross_profit: grossProfit,
        gross_margin: amt > 0 ? grossProfit / amt : 0,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total_amount - a.total_amount);
}

// 取得補貨記錄
export async function getRestockLog(): Promise<RestockLog[]> {
  const { data, error } = await supabase
    .from('restock_log')
    .select('*, product:products!product_id(name, spec)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as RestockLog[];
}

// 合併手動預約 + 線上預約為統一格式
export async function getMergedAppointments(): Promise<UnifiedAppointment[]> {
  // 員工帳號對 online_orders 表沒有 SELECT 權限（整列含電話/金額），
  // 改走只回傳排班欄位的 RPC（migration 00071）；商家照舊直接讀表。
  const isStaff = (await getAccountType().catch(() => 'merchant' as const)) === 'staff';
  const [appts, orders] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, customer:customers!customer_id(name, phone), staff:staff!staff_id(name, color)')
      .order('appointment_time', { ascending: false })
      .limit(500)
      .then(r => r.data ?? []),
    isStaff
      ? supabase
          .rpc('get_shop_online_orders_for_schedule')
          .then(r => (r.data ?? []).map((o: any) => ({
            ...o, customer_phone: '', total_amount: 0, notes: null,
          })))
      : supabase
          .from('online_orders')
          .select('*, staff:staff!staff_id(name, color)')
          .order('appointment_time', { ascending: false })
          .limit(500)
          .then(r => r.data ?? []),
  ]);
  // 員工帳號讀不到 customers 表，上面 customer embed 是 null、姓名會變「—」：
  // 用只回傳 id＋姓名的批次 RPC（migration 00074）補上。RPC 還沒部署或失敗時保持「—」，不會壞。
  const staffNames = new Map<string, string>();
  if (isStaff) {
    const missingIds = Array.from(new Set(
      (appts as Appointment[]).filter(a => !a.customer && a.customer_id).map(a => a.customer_id),
    ));
    if (missingIds.length > 0) {
      const { data } = await supabase.rpc('get_customer_names', { p_customer_ids: missingIds });
      for (const row of (data ?? []) as { id: string; name: string }[]) staffNames.set(row.id, row.name);
    }
  }
  // 員工帳號對 staff 表沒有 SELECT 權限，上面 staff embed 是 null，設計師名字與顏色會是空的
  // （預約列表上的線上預約小視窗會顯示成「未指定」）。用排班表同一支只回傳安全欄位的名單函式補上；
  // 失敗時維持空白，不會壞。
  const rosterById = new Map<string, { name: string; color: string }>();
  if (isStaff) {
    const roster = await getShopStaffRoster().catch(() => [] as StaffRosterEntry[]);
    for (const s of roster) rosterById.set(s.id, { name: s.name, color: s.color });
  }
  // 上面兩個查詢都是「時間由新到舊取 500 筆」：歷史資料超過 500 筆時被截掉的是最舊的，
  // 今天以後的預約一定拿得到（原本是由舊到新取 500 筆，超過就會漏掉最新的）。
  // 最後回傳前有再依時間由舊到新排序。

  const manual: UnifiedAppointment[] = (appts as Appointment[]).map(a => ({
    id: `manual-${a.id}`,
    source: 'manual',
    appointment_time: a.appointment_time,
    customer_name: a.customer?.name ?? staffNames.get(a.customer_id) ?? '—',
    customer_phone: a.customer?.phone ?? '',
    service_name: '預約服務',
    duration_minutes: manualDurationMin(a),
    total_amount: 0,
    status: a.status,
    notes: a.notes,
    staff_id: a.staff_id,
    staff_name: (a.staff as any)?.name ?? (a.staff_id ? rosterById.get(a.staff_id)?.name : undefined),
    staff_color: (a.staff as any)?.color ?? (a.staff_id ? rosterById.get(a.staff_id)?.color : undefined),
  }));

  const online: UnifiedAppointment[] = (orders as OnlineOrder[]).map(o => ({
    id: `online-${o.id}`,
    source: 'online',
    appointment_time: o.appointment_time,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    service_name: o.service_name,
    duration_minutes: o.duration_minutes,
    total_amount: o.total_amount,
    status: o.status,
    notes: o.notes,
    staff_id: o.staff_id,
    staff_name: (o.staff as any)?.name ?? (o.staff_id ? rosterById.get(o.staff_id)?.name : undefined),
    staff_color: (o.staff as any)?.color ?? (o.staff_id ? rosterById.get(o.staff_id)?.color : undefined),
    booking_mode: o.booking_mode,
  }));

  return [...manual, ...online].sort(
    (a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime()
  );
}

// ─── 商家資訊 ────────────────────────────────────────────────────────────────

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: true,  start: '09:00', end: '18:00' },
  tue: { open: true,  start: '09:00', end: '18:00' },
  wed: { open: true,  start: '09:00', end: '18:00' },
  thu: { open: true,  start: '09:00', end: '18:00' },
  fri: { open: true,  start: '09:00', end: '18:00' },
  sat: { open: true,  start: '09:00', end: '18:00' },
  sun: { open: false, start: '09:00', end: '18:00' },
};

// ─── 帳號類型（商家 / 員工 / 顧客）─────────────────────────────────────────────
export async function getAccountType(): Promise<'merchant' | 'customer' | 'staff'> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_type')
    .maybeSingle();
  if (error) throw error;
  return (data?.account_type as 'merchant' | 'customer' | 'staff') ?? 'merchant';
}

// 員工帳號專用：拿自己屬於哪家店、對應 staff 表哪一筆。account_type 不是 'staff'
// 時回傳 null（商家/顧客帳號不需要這個）。
export async function getMyStaffLink(): Promise<{ staffOwnerId: string; staffId: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_type, staff_owner_id, staff_id')
    .maybeSingle();
  if (error) throw error;
  if (data?.account_type !== 'staff' || !data.staff_owner_id || !data.staff_id) return null;
  return { staffOwnerId: data.staff_owner_id, staffId: data.staff_id };
}

// 商家在員工管理頁幫某位員工建立登入帳號：寄邀請信，對方自己設密碼
// （不經過商家或這支 app 的手，見 create-staff-account Edge Function）。
export async function createStaffAccount(email: string, staffId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登入');
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  // 跟 sign-in.tsx 的 resetPasswordForEmail 用同一個落點：/auth/callback 才有
  // 解析網址 hash 裡 access_token/refresh_token 的邏輯，直接指到 /reset-password
  // 的話那個 hash 沒人處理，員工點信會看到「連結已失效」。
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
  const res = await fetch(`${supabaseUrl}/functions/v1/create-staff-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ email, staff_id: staffId, redirect_to: redirectTo }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? '建立員工帳號失敗，請稍後再試');
}

// 員工管理頁用：哪些員工已經有登入帳號了（商家沒辦法直接查別人的 profiles）。
export async function getStaffWithLoginAccounts(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_staff_with_login_accounts');
  if (error) throw error;
  return Array.isArray(data) ? data.map((r: { staff_id: string }) => r.staff_id) : [];
}

// 員工版排班表用：同店其他員工的安全欄位（不含薪資），走 RPC 不是查原始 staff 表。
export async function getShopStaffRoster(): Promise<StaffRosterEntry[]> {
  const { data, error } = await supabase.rpc('get_shop_staff_roster');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 任何畫面裡「選人員」下拉選單共用這個，不要各自判斷帳號類型——員工帳號對 staff 表
// 原始列完全沒有 SELECT 權限（怕薪資欄位洩漏，見 migration 00068），直接查
// getActiveStaff() 對員工帳號一定是空陣列。這裡統一判斷、改走安全的 roster RPC，
// 避免每個畫面各自複製這段邏輯、漏改一處就會有某個畫面的人員選單悄悄變空白。
export async function getStaffForPicker(): Promise<StaffRosterEntry[]> {
  const type = await getAccountType().catch(() => 'merchant' as const);
  return type === 'staff' ? getShopStaffRoster() : getActiveStaff();
}

// 進來的網址沒帶店家 ID、也沒有先前留下的紀錄時（例如新顧客從沒帶參數的連結進來），
// 頁面會因為沒有 ownerId 而不查服務項目、顯示「目前無開放線上預約的服務」。
// 如果目前只有「一家」店有開放線上預約的服務，就用那一家；兩家以上就回傳 null，不猜。
export async function getSoleOnlineBookingOwnerId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('service_templates')
    .select('owner_id')
    .eq('allow_online_booking', true)
    .limit(2000);
  if (error) throw error;
  const ids = Array.from(new Set((data ?? []).map((r: { owner_id: string }) => r.owner_id)));
  return ids.length === 1 ? ids[0] : null;
}

// 排班表專用：連「暫停服務」的員工也要拿，畫面才能讓「有預約的人」不管有沒有暫停都顯示。
// 一般「選人員」下拉選單不要用這個，那邊暫停的人本來就不該被選到（用 getStaffForPicker）。
export async function getScheduleStaff(): Promise<StaffRosterEntry[]> {
  const type = await getAccountType().catch(() => 'merchant' as const);
  if (type === 'staff') return getShopStaffRoster();
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, color, is_active')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 員工帳號專用：這個員工有沒有被開「瀏覽顧客名單」的權限（店長 vs 一般員工）。
// 商家呼叫這個會回傳 false（函式內部限定 account_type='staff'），呼叫端不用另外判斷角色。
export async function canViewCustomers(): Promise<boolean> {
  const { data, error } = await supabase.rpc('staff_can_view_customers');
  if (error) throw error;
  return data === true;
}

// 「我的」頁依帳號類型與員工權限開關決定要顯示哪些項目。
// 商家：isStaff=false（三個權限值不使用）；員工：三個開關由商家在員工管理頁設定，預設全關。
// 這只是「畫面該不該顯示入口」，真正擋資料的是資料庫 RLS，兩邊要一致。
export async function getMyStaffPermissions(): Promise<{
  isStaff: boolean; canViewCustomers: boolean; canManagePricing: boolean; canManageOwnTimeOff: boolean;
}> {
  const accountType = await getAccountType().catch(() => 'merchant' as const);
  if (accountType !== 'staff') {
    return { isStaff: false, canViewCustomers: true, canManagePricing: true, canManageOwnTimeOff: true };
  }
  const [view, pricing, shop] = await Promise.all([
    supabase.rpc('staff_can_view_customers'),
    supabase.rpc('staff_can_manage_pricing'),
    supabase.rpc('staff_can_manage_shop_settings'),
  ]);
  return {
    isStaff: true,
    canViewCustomers: view.data === true,
    canManagePricing: pricing.data === true,
    // DB 欄位／函式名稱是歷史命名 can_manage_shop_settings，意思已改為「可管理自己的休假、封鎖時段與預留時間」
    canManageOwnTimeOff: shop.data === true,
  };
}

// 員工排預約時查「這支電話有沒有登記過」：只回傳 id/name，不是開放整張 customers 表。
export async function searchCustomerByPhone(phone: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc('search_customer_by_phone', { p_phone: phone });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 沒有「顧客管理」權限的員工，看預約明細時用這個拿顧客姓名，不直接查 customers 表。
export async function getCustomerNameSafe(customerId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_customer_name', { p_customer_id: customerId });
  if (error) throw error;
  return data ?? null;
}

// 商家後台關掉自助註冊後，Google OAuth 是唯一還留著、會「登入或自動註冊」
// 二合一的入口——Supabase 第一次看到某個 Google 帳號時會自動建立新使用者，
// 這樣手動建帳號審核機制形同虛設。用這個判斷「這次登入是不是剛剛才自動建立
// 的全新帳號」（建立時間離現在很近），是就代表繞過了審核，呼叫端要擋下來、
// 登出、導去申請表單，而不是放行進商家後台。
export async function isFreshlyCreatedAuthUser(withinMs = 120000): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.created_at) return false;
  return Date.now() - new Date(user.created_at).getTime() < withinMs;
}

// ─── 新手引導 ─────────────────────────────────────────────────────────────────
export async function getOnboardingStatus(): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .maybeSingle();
  if (error) throw error;
  return data?.onboarding_completed ?? true;
}

export async function markOnboardingCompleted(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登入');
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', user.id);
  if (error) throw error;
}

// ─── 商家服務條款同意 ───────────────────────────────────────────────────────────
// 版本字串每次條款內容有實質修改就要更新；已同意舊版本的商家會被視為未同意，
// 下次進後台會再被攔下來簽一次。
export const MERCHANT_TERMS_VERSION = '2026-09-13';

export async function getMerchantTermsAccepted(): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('merchant_terms_accepted_version')
    .maybeSingle();
  if (error) throw error;
  return data?.merchant_terms_accepted_version === MERCHANT_TERMS_VERSION;
}

// 走 Edge Function 而不是直接 update：同意當下的 IP／裝置資訊要當簽署佐證，
// client-side JS 拿不到自己的公網 IP，一定要伺服器端讀 request header 才行。
export async function acceptMerchantTerms(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('未登入');
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const res = await fetch(`${supabaseUrl}/functions/v1/accept-merchant-terms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ version: MERCHANT_TERMS_VERSION }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? '同意條款失敗，請稍後再試');
}

export async function getShopProfile(): Promise<ShopProfile | null> {
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getShopProfileByOwner(ownerId: string): Promise<Pick<ShopProfile, 'shop_name' | 'phone' | 'address' | 'description' | 'business_hours' | 'line_oa_id' | 'parking_info'> | null> {
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('shop_name, phone, address, description, business_hours, line_oa_id, parking_info')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertShopProfile(payload: {
  shop_name: string;
  phone: string;
  address: string;
  description: string;
  business_hours: BusinessHours;
  line_oa_id?: string | null;
  no_show_alert_threshold?: number;
  parking_info?: string | null;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登入');
  const { error } = await supabase.from('shop_profiles').upsert(
    { ...payload, owner_id: user.id },
    { onConflict: 'owner_id' }
  );
  if (error) throw error;
}

// ─── LINE Pay 商家金鑰（獨立表，各店家自己的，不會出現在給顧客的公開查詢裡）────────
export async function getShopPaymentSettings(): Promise<ShopPaymentSettings | null> {
  const { data, error } = await supabase
    .from('shop_payment_settings')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertShopPaymentSettings(payload: {
  line_pay_channel_id: string | null;
  line_pay_channel_secret: string | null;
  line_pay_env: 'sandbox' | 'production';
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登入');
  const { error } = await supabase.from('shop_payment_settings').upsert(
    { ...payload, owner_id: user.id },
    { onConflict: 'owner_id' }
  );
  if (error) throw error;
}

export { DEFAULT_HOURS };

// ─── 壽星顧客 ────────────────────────────────────────────────────────────────
export async function getBirthdayCustomers(month: number): Promise<BirthdayCustomer[]> {
  // birthday 是 date 欄位，LIKE 對 date 無效（PostgREST 會回 42883），
  // 撈全部有生日的顧客後改在這裡用 JS 篩選月份
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, birthday')
    .not('birthday', 'is', null)
    .order('birthday');
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      birthday: r.birthday,
      birthday_month: parseInt(r.birthday.split('-')[1], 10),
      birthday_day: parseInt(r.birthday.split('-')[2], 10),
    }))
    .filter((c) => c.birthday_month === month);
}

// ─── 顧客消費排行 ─────────────────────────────────────────────────────────────
export async function getCustomerRanking(limit = 20): Promise<CustomerRankRow[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select('customer_id, amount, service_date, customer:customers!customer_id(name, phone)')
    .order('service_date', { ascending: false });
  if (error) throw error;
  const map = new Map<string, CustomerRankRow>();
  for (const r of (data ?? []) as any[]) {
    const cid = r.customer_id as string;
    const amt = Number(r.amount ?? 0);
    const existing = map.get(cid);
    if (existing) {
      existing.total_amount += amt;
      existing.visit_count += 1;
      if (r.service_date > existing.last_visit) existing.last_visit = r.service_date;
    } else {
      map.set(cid, {
        customer_id: cid,
        customer_name: r.customer?.name ?? '—',
        customer_phone: r.customer?.phone ?? '',
        total_amount: amt,
        visit_count: 1,
        last_visit: r.service_date,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, limit);
}

// ─── 員工業績 ─────────────────────────────────────────────────────────────────
export async function getStaffPerformance(year: number, month: number): Promise<StaffPerformanceRow[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('service_records')
    .select('staff_id, amount, co_staff_id, staff_share_percent, co_staff_share_percent, staff:staff!staff_id(name, color, commission_rate), co_staff:staff!co_staff_id(name, color, commission_rate)')
    .gte('service_date', startDate)
    .lt('service_date', endDate)
    .not('staff_id', 'is', null);
  if (error) throw error;
  const map = new Map<string, StaffPerformanceRow>();
  const addToMap = (sid: string, name: string, color: string, rate: number, revenueShare: number, commission: number) => {
    const existing = map.get(sid);
    if (existing) {
      existing.service_count += 1;
      existing.total_revenue += revenueShare;
      existing.commission_amount += commission;
    } else {
      map.set(sid, {
        staff_id: sid,
        staff_name: name,
        staff_color: color,
        service_count: 1,
        total_revenue: revenueShare,
        commission_rate: rate,
        commission_amount: commission,
      });
    }
  };
  for (const r of (data ?? []) as any[]) {
    const sid = r.staff_id as string;
    const amt = Number(r.amount ?? 0);
    const rate = Number(r.staff?.commission_rate ?? 0);
    // 多人協作：staff_share_percent／co_staff_share_percent 是兩人各自直接實拿佔總金額的%，
    // 不再乘以各自的 commission_rate（直接輸入就是實拿），店家實拿的差額不計入任何員工業績。
    if (r.co_staff_id && r.staff_share_percent != null) {
      const primaryTake = amt * Number(r.staff_share_percent) / 100;
      const coTake = amt * Number(r.co_staff_share_percent ?? 0) / 100;
      const coRate = Number(r.co_staff?.commission_rate ?? 0);
      addToMap(sid, r.staff?.name ?? '—', r.staff?.color ?? '#e8789a', rate, primaryTake, primaryTake);
      addToMap(r.co_staff_id as string, r.co_staff?.name ?? '—', r.co_staff?.color ?? '#e8789a', coRate, coTake, coTake);
    } else {
      addToMap(sid, r.staff?.name ?? '—', r.staff?.color ?? '#e8789a', rate, amt, amt * rate / 100);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue);
}

// 報表用：目前的訂金狀況（不分月份的即時快照）。
// received＝需訂金的預約，顧客已付且店家已確認收款、服務還沒完成（預收訂金，服務完成結帳時才算進營業額）；
// awaiting＝顧客送出預約、店家還沒核對匯款（待確認匯款，48 小時沒確認會自動取消）。
export async function getPendingDepositSummary(): Promise<{
  received: { count: number; amount: number }; awaiting: { count: number; amount: number };
}> {
  const { data, error } = await supabase
    .from('online_orders')
    .select('deposit_amount, status')
    .eq('booking_mode', 'deposit')
    .in('status', ['paid', 'confirmed', 'pending_transfer_confirm']);
  if (error) throw error;
  const out = { received: { count: 0, amount: 0 }, awaiting: { count: 0, amount: 0 } };
  for (const o of (data ?? []) as { deposit_amount: number | string | null; status: string }[]) {
    const bucket = o.status === 'pending_transfer_confirm' ? out.awaiting : out.received;
    bucket.count += 1;
    bucket.amount += Number(o.deposit_amount ?? 0);
  }
  return out;
}

// 員工帳號專用：自己每個月的服務次數與收入（migration 00076，只回傳彙總數字）。
// fromDate（含）～toDate（不含），格式 YYYY-MM-DD；沒有服務記錄的月份不會出現在結果裡。
export async function getMyPerformanceByMonth(fromDate: string, toDate: string): Promise<{ month: string; service_count: number; total_revenue: number }[]> {
  const { data, error } = await supabase.rpc('get_my_performance_by_month', { p_from: fromDate, p_to: toDate });
  if (error) throw error;
  return ((data ?? []) as { month_start: string; service_count: number; total_revenue: number | string }[]).map(r => ({
    month: r.month_start.slice(0, 7),
    service_count: Number(r.service_count),
    total_revenue: Number(r.total_revenue),
  }));
}

// ─── 階梯式抽成 ───────────────────────────────────────────────────────────────
export async function getStaffCommissionTiers(staffId: string): Promise<StaffCommissionTier[]> {
  const { data, error } = await supabase
    .from('staff_commission_tiers')
    .select('*')
    .eq('staff_id', staffId)
    .order('min_revenue', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createCommissionTier(
  payload: Omit<StaffCommissionTier, 'id' | 'owner_id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('staff_commission_tiers').insert(payload);
  if (error) throw error;
}

export async function deleteCommissionTier(id: string): Promise<void> {
  const { error } = await supabase.from('staff_commission_tiers').delete().eq('id', id);
  if (error) throw error;
}

// ─── 額外獎金 ─────────────────────────────────────────────────────────────────
export async function getStaffBonuses(year: number, month: number): Promise<StaffBonus[]> {
  const { data, error } = await supabase
    .from('staff_bonuses')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('year', year)
    .eq('month', month)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createStaffBonus(
  payload: Omit<StaffBonus, 'id' | 'owner_id' | 'created_at' | 'staff'>
): Promise<void> {
  const { error } = await supabase.from('staff_bonuses').insert(payload);
  if (error) throw error;
}

export async function deleteStaffBonus(id: string): Promise<void> {
  const { error } = await supabase.from('staff_bonuses').delete().eq('id', id);
  if (error) throw error;
}

// ─── 月薪計算 ─────────────────────────────────────────────────────────────────
// 就高適用制：業績落在哪一階（min_revenue <= 業績，且 max_revenue 為 null 或 業績 <= max_revenue），
// 整筆業績都用該階的 rate，不是超額累進制。員工完全沒設定階梯時，退回沿用 commission_rate。
function pickTierRate(revenue: number, tiers: StaffCommissionTier[], fallbackRate: number): number {
  if (tiers.length === 0) return fallbackRate;
  const matches = tiers.filter(t =>
    revenue >= Number(t.min_revenue) && (t.max_revenue == null || revenue <= Number(t.max_revenue))
  );
  if (matches.length === 0) return 0;
  return Number(matches.reduce((a, b) => (Number(a.min_revenue) >= Number(b.min_revenue) ? a : b)).rate);
}

export interface PayrollPreviewRow {
  staff_id: string;
  staff_name: string;
  staff_color: string;
  total_revenue: number;
  commission_rate_applied: number;
  commission_amount: number;
  base_salary: number;
  bonus_amount: number;
  total_salary: number;
}

// 即時預覽（未鎖定）：產生本月薪資前先看數字用，套用階梯抽成規則＋底薪＋當月已登記的額外獎金。
export async function computeMonthlyPayrollPreview(year: number, month: number): Promise<PayrollPreviewRow[]> {
  const [performance, staffList, tiersRes, bonuses] = await Promise.all([
    getStaffPerformance(year, month),
    getStaff(),
    supabase.from('staff_commission_tiers').select('*'),
    getStaffBonuses(year, month),
  ]);
  if (tiersRes.error) throw tiersRes.error;

  const tiersByStaff = new Map<string, StaffCommissionTier[]>();
  for (const t of (tiersRes.data ?? []) as StaffCommissionTier[]) {
    const arr = tiersByStaff.get(t.staff_id) ?? [];
    arr.push(t);
    tiersByStaff.set(t.staff_id, arr);
  }
  const bonusByStaff = new Map<string, number>();
  for (const b of bonuses) {
    bonusByStaff.set(b.staff_id, (bonusByStaff.get(b.staff_id) ?? 0) + Number(b.amount));
  }
  const perfByStaff = new Map(performance.map(p => [p.staff_id, p]));
  const staffById = new Map(staffList.map(s => [s.id, s]));

  // 涵蓋：目前在職員工（就算本月沒業績也列出，底薪+獎金仍要算），
  // 加上本月有業績但已離職/停用的員工（避免漏算他們當月該拿的錢）。
  const staffIds = new Set<string>([...staffList.filter(s => s.is_active).map(s => s.id), ...perfByStaff.keys()]);

  return Array.from(staffIds).map(id => {
    const s = staffById.get(id);
    const perf = perfByStaff.get(id);
    const revenue = perf?.total_revenue ?? 0;
    const tiers = tiersByStaff.get(id) ?? [];
    const rate = pickTierRate(revenue, tiers, Number(s?.commission_rate ?? 0));
    const commissionAmount = revenue * rate / 100;
    const bonusAmount = bonusByStaff.get(id) ?? 0;
    const baseSalary = Number(s?.base_salary ?? 0);
    return {
      staff_id: id,
      staff_name: s?.name ?? perf?.staff_name ?? '—',
      staff_color: s?.color ?? perf?.staff_color ?? '#e8789a',
      total_revenue: revenue,
      commission_rate_applied: rate,
      commission_amount: commissionAmount,
      base_salary: baseSalary,
      bonus_amount: bonusAmount,
      total_salary: baseSalary + commissionAmount + bonusAmount,
    };
  }).sort((a, b) => b.total_salary - a.total_salary);
}

// 產生本月薪資：把預覽數字鎖定寫入 payroll_records（每位員工每月一筆，upsert 覆蓋）。
// 之後即使原始服務記錄／抽成規則／獎金被修改，已產生的月份金額不會跟著變，
// 除非再次呼叫本函式明確「重新產生」覆蓋。
export async function generateMonthlyPayroll(year: number, month: number): Promise<void> {
  const preview = await computeMonthlyPayrollPreview(year, month);
  if (preview.length === 0) return;
  const rows = preview.map(p => ({
    staff_id: p.staff_id,
    year,
    month,
    total_revenue: p.total_revenue,
    commission_rate_applied: p.commission_rate_applied,
    commission_amount: p.commission_amount,
    base_salary: p.base_salary,
    bonus_amount: p.bonus_amount,
    total_salary: p.total_salary,
  }));
  const { error } = await supabase.from('payroll_records').upsert(rows, { onConflict: 'staff_id,year,month' });
  if (error) throw error;
}

export async function getPayrollRecords(year: number, month: number): Promise<PayrollRecord[]> {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('year', year)
    .eq('month', month)
    .order('total_salary', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 員工帳號專用：自己某個月的抽成與月薪（唯讀）。
// - 已按「產生本月薪資」鎖定的月份 → 直接讀自己的 payroll_records（員工本來就能讀自己的）。
// - 還沒鎖定 → 用跟商家預覽完全相同的算法即時估算：業績（get_my_performance_by_month）＋階梯抽成
//   （pickTierRate，沒設階梯就用個人抽成比例）＋底薪＋當月已登記獎金。
// 自己的抽成比例與底薪存在 staff 表（員工無 SELECT），用 get_my_pay_settings() 取（migration 00077）。
export interface MyPayrollMonth {
  source: 'locked' | 'preview';
  total_revenue: number;
  commission_rate_applied: number;
  commission_amount: number;
  base_salary: number;
  bonus_amount: number;
  bonus_items: { amount: number; note: string | null }[];
  total_salary: number;
}
export async function getMyPayrollMonth(year: number, month: number): Promise<MyPayrollMonth | null> {
  const link = await getMyStaffLink();
  if (!link) return null;
  const staffId = link.staffId;

  const bonusRes = await supabase
    .from('staff_bonuses')
    .select('amount, note')
    .eq('staff_id', staffId).eq('year', year).eq('month', month)
    .order('created_at', { ascending: true });
  if (bonusRes.error) throw bonusRes.error;
  const bonusItems = ((bonusRes.data ?? []) as { amount: number | string; note: string | null }[])
    .map(b => ({ amount: Number(b.amount), note: b.note }));

  const lockedRes = await supabase
    .from('payroll_records')
    .select('*')
    .eq('staff_id', staffId).eq('year', year).eq('month', month)
    .maybeSingle();
  if (lockedRes.error) throw lockedRes.error;
  if (lockedRes.data) {
    const r = lockedRes.data as PayrollRecord;
    return {
      source: 'locked',
      total_revenue: Number(r.total_revenue),
      commission_rate_applied: Number(r.commission_rate_applied),
      commission_amount: Number(r.commission_amount),
      base_salary: Number(r.base_salary),
      bonus_amount: Number(r.bonus_amount),
      bonus_items: bonusItems,
      total_salary: Number(r.total_salary),
    };
  }

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const [perf, tiersRes, settingsRes] = await Promise.all([
    getMyPerformanceByMonth(start, end),
    supabase.from('staff_commission_tiers').select('*').eq('staff_id', staffId),
    supabase.rpc('get_my_pay_settings'),
  ]);
  if (tiersRes.error) throw tiersRes.error;
  if (settingsRes.error) throw settingsRes.error;
  const settings = ((settingsRes.data ?? []) as { commission_rate: number | string; base_salary: number | string }[])[0];
  const revenue = perf.reduce((sum, r) => sum + r.total_revenue, 0);
  const rate = pickTierRate(revenue, (tiersRes.data ?? []) as StaffCommissionTier[], Number(settings?.commission_rate ?? 0));
  const commission = revenue * rate / 100;
  const base = Number(settings?.base_salary ?? 0);
  const bonus = bonusItems.reduce((sum, b) => sum + b.amount, 0);
  return {
    source: 'preview',
    total_revenue: revenue,
    commission_rate_applied: rate,
    commission_amount: commission,
    base_salary: base,
    bonus_amount: bonus,
    bonus_items: bonusItems,
    total_salary: base + commission + bonus,
  };
}

// ─── 久未到店提醒 ─────────────────────────────────────────────────────────────
export async function getDormantCustomers(days: number): Promise<DormantCustomer[]> {
  const [{ data: customers, error: custErr }, { data: records, error: recErr }] = await Promise.all([
    supabase.from('customers').select('id, name, phone, created_at'),
    supabase.from('service_records').select('customer_id, service_date'),
  ]);
  if (custErr) throw custErr;
  if (recErr) throw recErr;

  const lastVisitMap = new Map<string, string>();
  for (const r of (records ?? []) as { customer_id: string; service_date: string }[]) {
    const existing = lastVisitMap.get(r.customer_id);
    if (!existing || r.service_date > existing) lastVisitMap.set(r.customer_id, r.service_date);
  }

  const now = Date.now();
  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const result: DormantCustomer[] = [];
  for (const c of (customers ?? []) as { id: string; name: string; phone: string; created_at: string }[]) {
    const lastVisit = lastVisitMap.get(c.id) ?? null;
    const refDate = lastVisit ? new Date(lastVisit).getTime() : new Date(c.created_at).getTime();
    const daysSince = Math.floor((now - refDate) / (24 * 60 * 60 * 1000));
    if (now - refDate >= cutoffMs) {
      result.push({ id: c.id, name: c.name, phone: c.phone, last_visit: lastVisit, days_since: daysSince });
    }
  }
  return result.sort((a, b) => b.days_since - a.days_since);
}

// ─── 優惠券 ───────────────────────────────────────────────────────────────────
export async function getCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Coupon[];
}

export async function createCoupon(payload: Omit<Coupon, 'id' | 'owner_id' | 'issued' | 'created_at'>): Promise<Coupon> {
  const { data, error } = await supabase.from('coupons').insert(payload).select().single();
  if (error) throw error;
  return data as Coupon;
}

export async function toggleCouponActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('coupons').update({ is_active }).eq('id', id);
  if (error) throw error;
}

export async function issueCouponToCustomer(couponId: string, customerId: string, customerName: string, customerPhone: string, validDays: number): Promise<void> {
  const expire = new Date();
  expire.setDate(expire.getDate() + validDays);
  const expireStr = `${expire.getFullYear()}-${String(expire.getMonth()+1).padStart(2,'0')}-${String(expire.getDate()).padStart(2,'0')}`;
  const { error } = await supabase.from('customer_coupons').insert({
    coupon_id: couponId, customer_id: customerId,
    customer_name: customerName, customer_phone: customerPhone,
    expire_date: expireStr,
  });
  if (error) throw error;
  await supabase.rpc('increment_coupon_issued', { coupon_id: couponId });
}

export async function getCustomerCoupons(customerId?: string): Promise<CustomerCoupon[]> {
  let q = supabase.from('customer_coupons')
    .select('*, coupon:coupons!coupon_id(name, type, value, min_amount)')
    .order('created_at', { ascending: false });
  if (customerId) q = q.eq('customer_id', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustomerCoupon[];
}

export async function useCoupon(customerCouponId: string, usedAmount: number): Promise<void> {
  const { error } = await supabase.from('customer_coupons').update({
    is_used: true,
    used_at: new Date().toISOString(),
    used_amount: usedAmount,
  }).eq('id', customerCouponId);
  if (error) throw error;
}

// ─── 全店封閉時段 ──────────────────────────────────────────────────────────────

export async function getShopBlockedSlots(): Promise<ShopBlockedSlot[]> {
  const { data, error } = await supabase
    .from('shop_blocked_slots')
    .select('*')
    .order('start_time', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createShopBlockedSlot(
  payload: Pick<ShopBlockedSlot, 'label' | 'start_time' | 'end_time' | 'applies_to' | 'specific_date'> & { staff_id?: string | null }
): Promise<void> {
  const { error } = await supabase.from('shop_blocked_slots').insert(payload);
  if (error) throw error;
}

export async function deleteShopBlockedSlot(id: string): Promise<void> {
  const { error } = await supabase.from('shop_blocked_slots').delete().eq('id', id);
  if (error) throw error;
}

// ─── 店家後台的新預約通知（00082）────────────────────────────────────────────
// 只有店家本人讀得到自己的通知（RLS）；前端只能標已讀，新增由資料庫觸發器代寫。
export async function getOwnerNotifications(limit = 50): Promise<OwnerNotification[]> {
  const { data, error } = await supabase
    .from('owner_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUnreadOwnerNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('owner_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

// 不帶 ids ＝ 全部標為已讀
export async function markOwnerNotificationsRead(ids?: string[]): Promise<void> {
  let query = supabase
    .from('owner_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (ids && ids.length > 0) query = query.in('id', ids);
  const { error } = await query;
  if (error) throw error;
}

// ─── 刪除密碼（00084）：刪除預約前要輸入，防手滑。密碼只存加密後的雜湊，前端只能呼叫這三個函式 ──
export type DeletePinResult = 'ok' | 'wrong' | 'locked' | 'not_set' | 'invalid' | 'not_allowed';

export async function hasDeletePin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_delete_pin');
  if (error) throw error;
  return !!data;
}

export async function verifyDeletePin(pin: string): Promise<DeletePinResult> {
  const { data, error } = await supabase.rpc('verify_delete_pin', { p_pin: pin });
  if (error) throw error;
  return data as DeletePinResult;
}

// 第一次設定不用給舊密碼；已經設定過就要給對舊密碼
export async function setDeletePin(newPin: string, currentPin?: string): Promise<DeletePinResult> {
  const { data, error } = await supabase.rpc('set_delete_pin', { p_new_pin: newPin, p_current_pin: currentPin ?? null });
  if (error) throw error;
  return data as DeletePinResult;
}
