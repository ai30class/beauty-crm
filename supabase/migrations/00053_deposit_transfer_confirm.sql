-- 訂金收款新增「銀行轉帳＋私訊確認」模式（不需要 LINE Pay 商家審核就能先用）。
-- 顧客送出預約後，畫面請她私訊店家的 LINE 官方帳號，帳號、核對、確認轉帳全部
-- 在 LINE 對話裡人工處理，避免在公開的線上預約頁直接曝光銀行帳號（詐騙風險）。
-- 店家核對完銀行帳戶後，自己在後台把訂單標記「已收訂金」。

-- 1. status 允許新的中繼狀態：pending_transfer_confirm（待確認匯款）
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.online_orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%IN%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.online_orders DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.online_orders
  ADD CONSTRAINT online_orders_status_check
  CHECK (status IN (
    'pending_payment', 'pending_transfer_confirm', 'paid',
    'confirmed', 'completed', 'cancelled', 'refunded'
  ));

-- 2. 待確認匯款的預約，超過這個時間點還沒被店家標記已收訂金，就會被排程
--    （見 send-reminders 的 expire_pending_deposit 類型）自動取消、釋出時段，
--    避免顧客佔著時段卻遲遲不付款也不私訊。
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS deposit_confirm_deadline timestamptz;

-- 3. 商家的 LINE 官方帳號 Basic ID（例如 @abc1234），線上預約頁用來組出
--    「私訊確認付款」的深連結。放在 shop_profiles 是因為這本來就是公開資訊
--    （跟電話、地址同一張表），不是要保密的東西，不用另外開私密表。
ALTER TABLE public.shop_profiles
  ADD COLUMN IF NOT EXISTS line_oa_id text;
