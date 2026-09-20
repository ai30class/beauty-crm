-- 結帳與金流：新增付款方式（銀行轉帳、行動支付）、服務記錄記錄「已收訂金」，讓月報表能依付款方式統計金流。
--
-- 背景：顧客線上預約需訂金時走「銀行轉帳＋私訊確認」，但結帳（服務記錄）原本只有現金／刷卡／LINE Pay／套票扣款，
-- 沒有匯款這個選項，也不會扣掉已收的訂金，金額直接帶入整筆服務費，所以金流統計對不上。
--
-- 做法：
-- 1. payment_method_enum 新增 bank_transfer（銀行轉帳）、mobile_pay（行動支付）。
-- 2. service_records 新增 deposit_amount（已收訂金，屬於該筆 amount 的一部分，預設 0）與 deposit_method（訂金當時的收款方式）。
--    amount 仍是「這筆服務的總金額」（營業額）；payment_method 是「尾款／現場」的付款方式；
--    現場實收 ＝ amount － deposit_amount。舊資料 deposit_amount 都是 0，行為完全不變。
-- 3. service_packages.purchase_payment_method 的 CHECK 放寬，套票購買也能選銀行轉帳、行動支付。
ALTER TYPE public.payment_method_enum ADD VALUE IF NOT EXISTS 'bank_transfer';
ALTER TYPE public.payment_method_enum ADD VALUE IF NOT EXISTS 'mobile_pay';

ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  ADD COLUMN IF NOT EXISTS deposit_method public.payment_method_enum;

ALTER TABLE public.service_packages DROP CONSTRAINT IF EXISTS service_packages_purchase_payment_method_check;
ALTER TABLE public.service_packages ADD CONSTRAINT service_packages_purchase_payment_method_check
  CHECK (purchase_payment_method IN ('cash', 'card', 'line_pay', 'bank_transfer', 'mobile_pay'));
