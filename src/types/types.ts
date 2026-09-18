export interface Profile {
  id: string;
  phone: string | null;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

// ─── 商家申請名單（關閉自助註冊後的替代入口）───────────────────────────────────
export interface SignupRequest {
  id: string;
  shop_name: string;
  contact_name: string;
  contact_info: string;
  message: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected';
  created_at: string;
}

export interface Customer {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  birthday: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  booking_restricted: boolean;
  booking_allowed_hours: { start: string; end: string }[];
  no_show_count: number;
}

// 全店封閉時段
export interface ShopBlockedSlot {
  id: string;
  owner_id: string;
  label: string;
  start_time: string;   // "HH:MM"
  end_time: string;     // "HH:MM"
  applies_to: string[]; // ["mon","tue",...] 空=每天（僅在 specific_date 為 null 時生效）
  specific_date: string | null; // "YYYY-MM-DD"，設定時只封鎖這一天，忽略 applies_to
  created_at: string;
  updated_at: string;
}

export interface ServiceRecord {
  id: string;
  owner_id: string;
  customer_id: string;
  service_name: string;
  amount: number;
  service_date: string;
  notes: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
  payment_method: 'cash' | 'card' | 'line_pay' | 'package';
  package_id: string | null;
  status: 'completed' | 'pending';
  staff_id: string | null;
  created_at: string;
  // 多人協作：co_staff_id 有值時，staff_share_percent／co_staff_share_percent 是
  // staff_id／co_staff_id 各自直接實拿佔總金額的%（直接輸入，不透過各自 commission_rate 計算），
  // 兩者相加不必等於100，差額歸店家；co_staff_id 為 null 時整筆都算 staff_id 的業績（原本行為）。
  co_staff_id: string | null;
  staff_share_percent: number | null;
  co_staff_share_percent: number | null;
  customer?: { name: string };
  staff?: { name: string; color: string } | null;
  co_staff?: { name: string; color: string } | null;
}

export interface TrendPoint {
  year: number;
  month: number;
  total_income: number;
  service_count: number;
}

export interface Appointment {
  id: string;
  owner_id: string;
  customer_id: string;
  appointment_time: string;
  reminder_minutes: number;
  notes: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  staff_id: string | null;
  customer?: { name: string; phone: string };
  staff?: { name: string; color: string } | null;
}

// 合併手動預約 + 線上預約的統一格式
export interface UnifiedAppointment {
  id: string;
  source: 'manual' | 'online';
  appointment_time: string;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  duration_minutes: number;
  total_amount: number;
  status: string;
  notes: string | null;
  staff_name?: string;
  staff_color?: string;
  booking_mode?: 'deposit' | 'direct';
}

export interface Expense {
  id: string;
  owner_id: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
}

export interface MonthlyStats {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  serviceCount: number;
  topServices: { name: string; count: number; revenue: number }[];
}

export interface ServiceTemplate {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  duration_minutes: number;
  default_amount: number;
  color: string;
  sort_order: number;
  allow_online_booking: boolean;
  require_deposit: boolean;
  break_after_minutes: number;
  is_addon: boolean;
  created_at: string;
}

// 一筆線上訂單實際加購了哪些項目
export interface OnlineOrderAddon {
  id: string;
  order_id: string;
  owner_id: string;
  service_template_id: string | null;
  name: string;
  amount: number;
  duration_minutes: number;
  created_at: string;
}

export type PackageType = 'session' | 'stored_value';

export interface ServicePackage {
  id: string;
  owner_id: string;
  customer_id: string;
  package_type: PackageType;
  name: string;
  total_sessions: number | null;
  used_sessions: number;
  initial_amount: number | null;
  remaining_amount: number | null;
  purchase_date: string;
  expire_date: string | null;
  notes: string | null;
  is_active: boolean;
  purchase_payment_method: 'cash' | 'card' | 'line_pay';
  created_at: string;
}

export interface Staff {
  id: string;
  owner_id: string;
  name: string;
  role: string;
  color: string;
  is_active: boolean;
  commission_rate: number;
  bio: string | null;
  avatar_url: string | null;
  // 底薪：可選，預設0（沒設底薪的員工完全靠抽成+獎金）
  base_salary: number;
  created_at: string;
  // 員工登入帳號的權限開關，預設全部關閉，商家在員工管理頁自行開。
  // 只有這三項可以開放，排班/預約/自己的服務記錄/自己的業績數字等基本層是不可關的。
  // can_view_customers：只給「瀏覽」完整顧客名單（含電話），不含編輯——編輯顧客資料
  // 不管有沒有開這個開關都不開放給員工，一律只有商家能改（Emma 明確要求的兩層設計）。
  can_view_customers: boolean;
  can_manage_pricing: boolean;
  can_manage_shop_settings: boolean;
}

// 員工版排班表用的安全欄位——不含 commission_rate/base_salary 等同事不該看到的欄位，
// 走 get_shop_staff_roster() RPC 取得，不是查原始 staff 表。
export interface StaffRosterEntry {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

// ─── 階梯式抽成 ───────────────────────────────────────────────────────────────
// 就高適用制：業績落在哪一階（min_revenue <= 業績，且 max_revenue 為 null 或 業績 <= max_revenue），
// 整筆業績都用該階的 rate 計算。員工沒有設定任何階梯時，計薪退回沿用 staff.commission_rate。
export interface StaffCommissionTier {
  id: string;
  owner_id: string;
  staff_id: string;
  min_revenue: number;
  max_revenue: number | null; // null = 無上限（最高一階）
  rate: number;
  created_at: string;
}

// ─── 額外獎金 ─────────────────────────────────────────────────────────────────
export interface StaffBonus {
  id: string;
  owner_id: string;
  staff_id: string;
  year: number;
  month: number;
  amount: number;
  note: string | null;
  created_at: string;
  staff?: { name: string; color: string } | null;
}

// ─── 月結薪資快照 ─────────────────────────────────────────────────────────────
// 按「產生本月薪資」寫入的鎖定記錄；之後原始資料再改，已產生的月份金額不會跟著變。
export interface PayrollRecord {
  id: string;
  owner_id: string;
  staff_id: string;
  year: number;
  month: number;
  total_revenue: number;
  commission_rate_applied: number;
  commission_amount: number;
  base_salary: number;
  bonus_amount: number;
  total_salary: number;
  generated_at: string;
  staff?: { name: string; color: string } | null;
}

export interface Holiday {
  id: string;
  owner_id: string;
  holiday_date: string;
  note: string | null;
  staff_id: string | null;
  staff?: { name: string; color: string } | null;
  created_at: string;
}

// 人員預留時間：週排班表點空白處可直接標記時段已佔用，不綁定顧客／預約
export interface StaffReservedSlot {
  id: string;
  owner_id: string;
  staff_id: string;
  reserved_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  label: string;
  created_at: string;
}

export type OnlineOrderStatus =
  | 'pending_payment' | 'pending_transfer_confirm' | 'paid' | 'confirmed'
  | 'completed' | 'cancelled' | 'refunded';

export interface OnlineOrder {
  id: string;
  owner_id: string;
  customer_name: string;
  customer_phone: string;
  customer_id: string | null;      // 對應 customers 表的 UUID（upsert 後填入）
  customer_user_id: string | null;
  staff_id: string | null;
  service_template_id: string | null;
  service_name: string;
  duration_minutes: number;
  total_amount: number;
  deposit_amount: number;
  appointment_time: string;
  end_time: string;
  notes: string | null;
  status: OnlineOrderStatus;
  booking_mode: 'deposit' | 'direct';
  line_pay_transaction_id: string | null;
  line_pay_order_id: string | null;
  line_pay_payment_url: string | null;
  line_pay_paid_at: string | null;
  deposit_confirm_deadline: string | null;
  created_at: string;
  staff?: Pick<Staff, 'name' | 'color'>;
}

export interface TimeSlot {
  time: string;      // "HH:MM"
  available: boolean;
}

export interface PackageTransaction {
  id: string;
  owner_id: string;
  package_id: string;
  service_record_id: string | null;
  sessions_used: number;
  amount_deducted: number;
  note: string | null;
  used_at: string;
}

// 保養品庫存
export interface Product {
  id: string;
  owner_id: string;
  name: string;
  spec: string;
  cost_price: number;
  sell_price: number;
  stock: number;
  safety_stock: number;
  created_at: string;
}

// 服務記錄使用明細
export interface ProductUsage {
  id: string;
  owner_id: string;
  service_record_id: string;
  product_id: string;
  quantity: number;
  sell_price: number;
  sell_amount: number;
  created_at: string;
  product?: Pick<Product, 'name' | 'spec' | 'sell_price'>;
}

// 補貨記錄
export interface RestockLog {
  id: string;
  owner_id: string;
  product_id: string;
  qty: number;
  cost_total: number;
  note: string | null;
  created_at: string;
  product?: Pick<Product, 'name' | 'spec'>;
}

// 保養品月銷售統計
export interface ProductSalesRow {
  product_id: string;
  product_name: string;
  product_spec: string;
  total_qty: number;
  total_amount: number;
  sell_price: number;
  cost_price: number;       // 每備進貨成本
  total_cost: number;       // 本月總成本
  gross_profit: number;     // 本月毛利
  gross_margin: number;     // 毛利率 0~1
}

// 庫存狀態
export type StockStatus = 'normal' | 'warning' | 'out';

// ─── 壽星顧客 ────────────────────────────────────────────────────────────────
export interface BirthdayCustomer {
  id: string;
  name: string;
  phone: string;
  birthday: string;   // YYYY-MM-DD
  birthday_month: number;
  birthday_day: number;
}

// ─── 顧客消費排行 ─────────────────────────────────────────────────────────────
export interface CustomerRankRow {
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  visit_count: number;
  last_visit: string;
}

// ─── 員工業績 ─────────────────────────────────────────────────────────────────
export interface StaffPerformanceRow {
  staff_id: string;
  staff_name: string;
  staff_color: string;
  service_count: number;
  total_revenue: number;
  commission_rate: number;
  commission_amount: number;
}

// ─── 久未到店提醒 ─────────────────────────────────────────────────────────────
export interface DormantCustomer {
  id: string;
  name: string;
  phone: string;
  last_visit: string | null;
  days_since: number;
}

// ─── 優惠券 ───────────────────────────────────────────────────────────────────
export type CouponType = 'discount_pct' | 'discount_amt' | 'free_service';

export interface Coupon {
  id: string;
  owner_id: string;
  name: string;
  type: CouponType;
  value: number;
  min_amount: number;
  quota: number | null;
  issued: number;
  valid_days: number;
  note: string;
  is_active: boolean;
  created_at: string;
}

export interface CustomerCoupon {
  id: string;
  owner_id: string;
  coupon_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  expire_date: string;
  used_at: string | null;
  used_amount: number | null;
  is_used: boolean;
  created_at: string;
  coupon?: Pick<Coupon, 'name' | 'type' | 'value' | 'min_amount'>;
}

// ─── 商家資訊 ────────────────────────────────────────────────────────────────

export interface DayHours {
  open: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface BusinessHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
}

export interface ShopProfile {
  id: string;
  owner_id: string;
  shop_name: string;
  phone: string;
  address: string;
  description: string;
  business_hours: BusinessHours;
  line_oa_id: string | null;
  no_show_alert_threshold: number;
  parking_info: string | null;
  created_at: string;
  updated_at: string;
}

// 獨立表存放，只有商家自己（owner_id = auth.uid()）能讀寫，不會出現在給顧客的公開查詢裡
export interface ShopPaymentSettings {
  owner_id: string;
  line_pay_channel_id: string | null;
  line_pay_channel_secret: string | null;
  line_pay_env: 'sandbox' | 'production';
  created_at: string;
  updated_at: string;
}

export type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'cancelled';

// 候補名單：只有商家自己能查看（沒有給顧客的 SELECT 規則），顧客只能新增登記
export interface WaitlistEntry {
  id: string;
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
  notes: string | null;
  status: WaitlistStatus;
  created_at: string;
  updated_at: string;
  staff?: { name: string; color: string } | null;
}
