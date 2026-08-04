import { supabase } from '@/client/supabase';
import type {
  Customer, ServiceRecord, TrendPoint, Appointment, ServiceTemplate,
  ServicePackage, PackageTransaction, Staff, TimeSlot, ShopProfile,
  BusinessHours, Expense, Product, ProductUsage, RestockLog,
  Holiday, OnlineOrder, Coupon, CustomerCoupon, ShopBlockedSlot,
  MonthlyStats, UnifiedAppointment, ProductSalesRow,
  BirthdayCustomer, CustomerRankRow, StaffPerformanceRow,
} from '@/types/types';

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
 * 線上預約用：依電話號碼 upsert 顧客檔案。
 * - 已建檔：若 birthday 尚未填寫則補上；name 一律更新。
 * - 未建檔：新增一筆（owner_id 從 session 取得）。
 * 回傳最終 customer_id。
 */
export async function upsertCustomerByPhone(
  name: string,
  phone: string,
  birthday: string,
): Promise<string> {
  const existing = await getCustomerByPhone(phone);
  if (existing) {
    const patch: Partial<Pick<Customer, 'name' | 'birthday'>> = { name };
    if (!existing.birthday) patch.birthday = birthday;
    const { error } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }
  // 新顧客：insert，owner_id 由 RLS 政策從 auth.uid() 取得
  const { data, error } = await supabase
    .from('customers')
    .insert({ name, phone, birthday, notes: null })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
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

export async function updateCustomer(id: string, payload: Partial<Pick<Customer, 'name' | 'phone' | 'birthday' | 'notes' | 'booking_restricted' | 'booking_allowed_hours'>>): Promise<void> {
  const { error } = await supabase.from('customers').update(payload).eq('id', id);
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
  payload: Partial<Pick<ServiceRecord, 'before_photo_path' | 'after_photo_path' | 'notes' | 'service_name' | 'amount'>>
): Promise<void> {
  const { error } = await supabase.from('service_records').update(payload).eq('id', id);
  if (error) throw error;
}

export async function getServiceRecordById(id: string): Promise<ServiceRecord | null> {
  const { data } = await supabase
    .from('service_records')
    .select('*, customer:customers!customer_id(name)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function deleteServiceRecord(id: string): Promise<void> {
  const { error } = await supabase.from('service_records').delete().eq('id', id);
  if (error) throw error;
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
    .select('*, customer:customers!customer_id(name, phone)')
    .order('appointment_time', { ascending: true })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customer:customers!customer_id(name, phone)')
    .eq('customer_id', customerId)
    .order('appointment_time', { ascending: true })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createAppointment(payload: Omit<Appointment, 'id' | 'owner_id' | 'created_at' | 'customer'>): Promise<void> {
  const { error } = await supabase.from('appointments').insert(payload);
  if (error) throw error;
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, customer:customers!customer_id(name, phone)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function updateAppointment(
  id: string,
  payload: Partial<Pick<Appointment, 'appointment_time' | 'reminder_minutes' | 'notes' | 'status'>>
): Promise<void> {
  const { error } = await supabase.from('appointments').update(payload).eq('id', id);
  if (error) throw error;
}

export async function updateAppointmentStatus(id: string, status: Appointment['status']): Promise<void> {
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
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

export async function createServiceTemplate(
  payload: Omit<ServiceTemplate, 'id' | 'owner_id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('service_templates').insert(payload);
  if (error) throw error;
}

export async function updateServiceTemplate(
  id: string,
  payload: Partial<Pick<ServiceTemplate, 'name' | 'duration_minutes' | 'default_amount' | 'color' | 'sort_order'>>
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

export async function createServicePackage(
  payload: Omit<ServicePackage, 'id' | 'owner_id' | 'used_sessions' | 'created_at'>
): Promise<void> {
  // 1. 建立套票
  const { data: pkg, error } = await supabase
    .from('service_packages')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;

  // 2. 同步建立服務記錄 → 計入當日收入（報表用）
  //    次數型：金額用 initial_amount（0 表示贈品套票，仍建記錄）
  //    儲值型：金額用 initial_amount
  const incomeAmt =
    payload.package_type === 'stored_value'
      ? (payload.initial_amount ?? 0)
      : (payload.initial_amount ?? 0); // 次數型購買金額由呼叫方傳入

  if (incomeAmt > 0) {
    await supabase.from('service_records').insert({
      customer_id: payload.customer_id,
      service_name: `【套票購買】${payload.name}`,
      amount: incomeAmt,
      service_date: payload.purchase_date,
      notes: `套票購買，關聯套票 ID: ${pkg.id}`,
      before_photo_path: null,
      after_photo_path: null,
      payment_method: (payload.purchase_payment_method ?? 'cash') as 'cash' | 'card' | 'line_pay',
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

export async function createStaff(payload: Omit<Staff, 'id' | 'owner_id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('staff').insert(payload);
  if (error) throw error;
}

export async function updateStaff(id: string, payload: Partial<Pick<Staff, 'name' | 'role' | 'color' | 'is_active'>>): Promise<void> {
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

export async function getAllHolidays(): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from('holidays')
    .select('*, staff:staff!staff_id(name, color)')
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
  staffId: string,
  dateStr: string,
  durationMinutes: number,
  breakMinutes: number,
  customerPhone?: string,
): Promise<TimeSlot[]> {
  // 取得當天已預約（online_orders paid/confirmed）
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;
  const { data: orders } = await supabase
    .from('online_orders')
    .select('appointment_time, end_time')
    .eq('owner_id', ownerId)
    .eq('staff_id', staffId)
    .in('status', ['paid', 'confirmed'])
    .gte('appointment_time', dayStart)
    .lte('appointment_time', dayEnd);

  const busyRanges = (orders ?? []).map((o: { appointment_time: string; end_time: string }) => ({
    start: new Date(o.appointment_time).getTime(),
    end: new Date(o.end_time).getTime(),
  }));

  // 取得全店封閉時段
  const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date(dateStr + 'T12:00:00').getDay()];
  const { data: blockedRows } = await supabase
    .from('shop_blocked_slots')
    .select('start_time, end_time, applies_to')
    .eq('owner_id', ownerId);
  const blockedSlots = (blockedRows ?? []).filter((b: { applies_to: string[]; start_time: string; end_time: string }) =>
    b.applies_to.length === 0 || b.applies_to.includes(dayKey)
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

  // 產生 09:00–20:00 每 30 分鐘一格的時段
  const slots: TimeSlot[] = [];
  for (let h = 9; h < 20; h++) {
    for (const min of [0, 30]) {
      const slotStart = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`);
      const slotEnd = new Date(slotStart.getTime() + (durationMinutes + breakMinutes) * 60000);
      if (slotEnd > new Date(`${dateStr}T20:00:00`)) continue;

      // 既有預約衝突
      const conflict = busyRanges.some(r =>
        slotStart.getTime() < r.end && slotEnd.getTime() > r.start
      );

      // 全店封閉時段
      const slotMins = h * 60 + min;
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
  }
  return slots;
}

// ─── 線上訂單 ─────────────────────────────────────────────────────────────────

export async function getOnlineOrders(): Promise<OnlineOrder[]> {
  const { data, error } = await supabase
    .from('online_orders')
    .select('*, staff:staff!staff_id(name, color)')
    .order('appointment_time', { ascending: false })
    .limit(200);
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
  const { error } = await supabase.from('online_orders').delete().eq('id', id);
  if (error) throw error;
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

// 顧客自助查詢：依手機號查詢所有預約
export async function getOnlineOrdersByPhone(phone: string): Promise<OnlineOrder[]> {  const { data, error } = await supabase
    .from('online_orders')
    .select('*, staff:staff!staff_id(name, color)')
    .eq('customer_phone', phone)
    .order('appointment_time', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// 直接預約（免訂金）——在 client 端直接寫入 DB，不經 LINE Pay
export async function createDirectOnlineOrder(payload: {
  owner_id: string;
  customer_name: string;
  customer_phone: string;
  customer_id: string;
  staff_id: string;
  service_template_id: string;
  service_name: string;
  duration_minutes: number;
  total_amount: number;
  appointment_time: string;
  end_time: string;
  notes: string | null;
}): Promise<OnlineOrder> {
  const { data, error } = await supabase
    .from('online_orders')
    .insert({
      ...payload,
      deposit_amount: 0,
      status: 'confirmed',
      booking_mode: 'direct',
    })
    .select('*, staff:staff!staff_id(name, color)')
    .single();
  if (error) throw error;
  return data as OnlineOrder;
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
  await supabase.from('restock_log').insert({
    product_id: id,
    qty,
    cost_total: costTotal,
    note: note.trim() || null,
  });
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
  const [appts, orders] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, customer:customers!customer_id(name, phone)')
      .order('appointment_time', { ascending: true })
      .limit(500)
      .then(r => r.data ?? []),
    supabase
      .from('online_orders')
      .select('*, staff:staff!staff_id(name, color)')
      .not('status', 'in', '("cancelled","refunded")')
      .order('appointment_time', { ascending: true })
      .limit(500)
      .then(r => r.data ?? []),
  ]);

  const manual: UnifiedAppointment[] = (appts as Appointment[]).map(a => ({
    id: `manual-${a.id}`,
    source: 'manual',
    appointment_time: a.appointment_time,
    customer_name: a.customer?.name ?? '—',
    customer_phone: a.customer?.phone ?? '',
    service_name: '預約服務',
    duration_minutes: 60,
    total_amount: 0,
    status: a.status,
    notes: a.notes,
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
    staff_name: (o.staff as any)?.name,
    staff_color: (o.staff as any)?.color,
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

export async function getShopProfile(): Promise<ShopProfile | null> {
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getShopProfileByOwner(ownerId: string): Promise<Pick<ShopProfile, 'shop_name' | 'phone' | 'address' | 'description' | 'business_hours'> | null> {
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('shop_name, phone, address, description, business_hours')
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
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登入');
  const { error } = await supabase.from('shop_profiles').upsert(
    { ...payload, owner_id: user.id },
    { onConflict: 'owner_id' }
  );
  if (error) throw error;
}

export { DEFAULT_HOURS };

// ─── 壽星顧客 ────────────────────────────────────────────────────────────────
export async function getBirthdayCustomers(month: number): Promise<BirthdayCustomer[]> {
  const mm = String(month).padStart(2, '0');
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone, birthday')
    .not('birthday', 'is', null)
    .like('birthday', `%-${mm}-%`)
    .order('birthday');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    birthday: r.birthday,
    birthday_month: parseInt(r.birthday.split('-')[1], 10),
    birthday_day: parseInt(r.birthday.split('-')[2], 10),
  }));
}

// ─── 顧客消費排行 ─────────────────────────────────────────────────────────────
export async function getCustomerRanking(limit = 20): Promise<CustomerRankRow[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select('customer_id, total_amount, service_date, customer:customers!customer_id(name, phone)')
    .order('service_date', { ascending: false });
  if (error) throw error;
  const map = new Map<string, CustomerRankRow>();
  for (const r of (data ?? []) as any[]) {
    const cid = r.customer_id as string;
    const amt = Number(r.total_amount ?? 0);
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
    .select('staff_id, staff_name, total_amount, staff:staff!staff_id(color)')
    .gte('service_date', startDate)
    .lt('service_date', endDate)
    .not('staff_id', 'is', null);
  if (error) throw error;
  const map = new Map<string, StaffPerformanceRow>();
  for (const r of (data ?? []) as any[]) {
    const sid = r.staff_id as string;
    const amt = Number(r.total_amount ?? 0);
    const existing = map.get(sid);
    if (existing) {
      existing.service_count += 1;
      existing.total_revenue += amt;
    } else {
      map.set(sid, {
        staff_id: sid,
        staff_name: r.staff_name ?? '—',
        staff_color: r.staff?.color ?? '#e8789a',
        service_count: 1,
        total_revenue: amt,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue);
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
  payload: Pick<ShopBlockedSlot, 'label' | 'start_time' | 'end_time' | 'applies_to'>
): Promise<void> {
  const { error } = await supabase.from('shop_blocked_slots').insert(payload);
  if (error) throw error;
}

export async function deleteShopBlockedSlot(id: string): Promise<void> {
  const { error } = await supabase.from('shop_blocked_slots').delete().eq('id', id);
  if (error) throw error;
}
