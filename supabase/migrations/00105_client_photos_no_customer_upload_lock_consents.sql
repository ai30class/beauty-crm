-- 00105：私人照片空間補兩道鎖（2026-09-23 安全檢查「Storage 權限」）
--
-- client_service_photos 放施術前後照片與同意書手寫簽名，路徑第一層是店家 ID（00083、00090）。
--
-- 問題 1：上傳規則是「資料夾 = COALESCE(員工所屬店, 自己的帳號)」，顧客帳號不是員工，就會落到
--   「自己的帳號」——任何用 LINE／Google 登入的顧客都能在這個空間開一個自己的資料夾無限上傳圖片
--   （每張 5MB 上限、沒有張數上限）。看不到任何店家的檔案，不會外洩，但能塞爆免費方案的 1GB，
--   塞滿後所有店家的施術照片、同意書簽名都傳不上去。
--   修法：上傳只開給非顧客帳號（profiles.account_type <> 'customer'），跟 00100 大頭照空間同一種做法。
--
-- 問題 2：刪除規則只限「同一家店的資料夾」，同意書簽名（<店家 ID>/consents/...）也能被員工或老闆從
--   App 刪掉。簽名是糾紛時的證據，說明書也寫「簽完的同意書無法修改」，應該鎖住。
--   修法：consents/ 底下的檔案，任何人都不能透過 App 刪除（要處理請走資料庫管理者）。
--   App 程式本來就不會刪同意書檔案（只有施術照片會刪），所以不影響任何現有功能。
--
-- 讀取（client_photos_select）不動；這個空間沒有 UPDATE 規則（預設全擋），也不動。
--
-- 驗證：
--   select policyname, cmd, coalesce(qual, with_check) as rule from pg_policies
--   where schemaname = 'storage' and tablename = 'objects' and policyname like 'client_photos_%' order by 1;
--   預期：insert 多了 account_type <> 'customer'；delete 多了 foldername(name))[2] IS DISTINCT FROM 'consents'。

DROP POLICY IF EXISTS client_photos_insert ON storage.objects;
CREATE POLICY client_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
  );

DROP POLICY IF EXISTS client_photos_delete ON storage.objects;
CREATE POLICY client_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
    AND (storage.foldername(name))[2] IS DISTINCT FROM 'consents'
  );
