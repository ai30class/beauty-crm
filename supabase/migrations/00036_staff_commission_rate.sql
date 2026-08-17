-- 業績抽成試算：幫每位員工設定抽成比例（0~100 的百分比），
-- 服務人員業績報表據此算出應發獎金，不涉及勞健保/稅務代扣等正式薪資項目。
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,2) NOT NULL DEFAULT 0
  CHECK (commission_rate >= 0 AND commission_rate <= 100);
