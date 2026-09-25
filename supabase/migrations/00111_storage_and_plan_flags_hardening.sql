-- 00111：照片空間與方案開關補三道鎖（2026-09-25，handoff 已知限制三項）
--
-- 問題 1：公開的大頭照空間（appd2yss59nidj5_service_photos）任何人都能「列出」所有檔名
--   00004 的 public_read_service_photos 讓沒登入的人也有 SELECT，auth_select_service_photos 讓任何
--   登入帳號（含顧客）都有 SELECT；有 SELECT 就能用 list() 列出整個空間的檔名。
--   修法：拿掉匿名的 SELECT；登入者只能看到「自己店資料夾」裡的檔案。
--   顧客預約頁顯示大頭照不受影響：公開空間的「公開網址」（getPublicUrl）本來就不經過這些規則。
--
-- 問題 2：不同店家的老闆（或員工）可以互刪對方的大頭照
--   舊路徑 staff-avatars/<時間>_<亂數>.jpg 沒有店家資料夾，00100 只擋了顧客帳號。
--   修法：新上傳的大頭照改放 staff-avatars/<店家 ID>/…（程式同一次改好），上傳、刪除都只能動自己店的資料夾。
--   舊路徑的檔案（目前只有椏椏 Gloria 一張）照常可以公開顯示，但之後任何人都無法從 App 刪除
--   （App 本來就沒有刪大頭照的功能，換照片是另外上傳一張新的）。
--
-- 問題 3：「施術照片是進階版限定」只在前端擋
--   ① shop_profiles 的 service_photos_enabled（00097）、line_reminders_enabled（00089）是平台管理者
--     設定的商務開關，但店家本人（和有權限的員工）對自己那一列有 UPDATE 權限，可以自己改成 true。
--     修法：加觸發器——從 App 來的更新（登入身分是 authenticated／anon）一律保留原值；從 App 新增店家資料時
--     一律為 false。SQL Editor（postgres）與系統（service_role）不受影響，Emma 照舊用 SQL 開關。
--   ② 私有照片空間（client_service_photos）上傳時沒檢查開關。
--     修法：上傳施術照片要該店 service_photos_enabled = true；同意書簽名（<店家 ID>/consents/…）是基礎版功能，不受限。
--
-- ⚠️ 順序：程式先上線（大頭照改存 staff-avatars/<店家 ID>/…，舊規則也允許），再執行這份。
--    反過來的話，新規則上線到程式部署之間，上傳大頭照會失敗。
--
-- 驗證（唯讀）：
--   select policyname, cmd, array_to_string(roles, ',') roles from pg_policies
--   where schemaname = 'storage' and tablename = 'objects' order by 1;
--   預期：沒有 public_read_service_photos；auth_*_service_photos 都多了 staff-avatars/<店家 ID> 條件；
--         client_photos_insert 多了 consents 或 service_photos_enabled 條件。
--   select tgname from pg_trigger where tgrelid = 'public.shop_profiles'::regclass and not tgisinternal;
--   預期：多了 shop_profiles_lock_plan_flags。

-- ── 大頭照空間 ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_service_photos" ON storage.objects;

DROP POLICY IF EXISTS "auth_select_service_photos" ON storage.objects;
CREATE POLICY "auth_select_service_photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'appd2yss59nidj5_service_photos'
  AND (storage.foldername(name))[1] = 'staff-avatars'
  AND (storage.foldername(name))[2] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
);

DROP POLICY IF EXISTS "auth_upload_service_photos" ON storage.objects;
CREATE POLICY "auth_upload_service_photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'appd2yss59nidj5_service_photos'
  AND (storage.foldername(name))[1] = 'staff-avatars'
  AND (storage.foldername(name))[2] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
);

DROP POLICY IF EXISTS "auth_delete_service_photos" ON storage.objects;
CREATE POLICY "auth_delete_service_photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'appd2yss59nidj5_service_photos'
  AND (storage.foldername(name))[1] = 'staff-avatars'
  AND (storage.foldername(name))[2] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
);

-- ── 私有照片空間：施術照片要進階版開關打開，同意書簽名不限 ────────────────────
DROP POLICY IF EXISTS client_photos_insert ON storage.objects;
CREATE POLICY client_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
    AND (
      (storage.foldername(name))[2] = 'consents'
      OR EXISTS (
        SELECT 1 FROM public.shop_profiles sp
        WHERE sp.owner_id::text = (storage.foldername(name))[1]
          AND sp.service_photos_enabled = true
      )
    )
  );

-- ── 商務開關只能由平台管理者改 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_profiles_lock_plan_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 只擋從 App 來的請求（登入者 authenticated、沒登入 anon）；SQL Editor 與系統沒有這個身分，不受影響
  IF COALESCE(auth.role(), '') IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.service_photos_enabled := false;
      NEW.line_reminders_enabled := false;
    ELSE
      NEW.service_photos_enabled := OLD.service_photos_enabled;
      NEW.line_reminders_enabled := OLD.line_reminders_enabled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_profiles_lock_plan_flags ON public.shop_profiles;
CREATE TRIGGER shop_profiles_lock_plan_flags
  BEFORE INSERT OR UPDATE ON public.shop_profiles
  FOR EACH ROW EXECUTE FUNCTION public.shop_profiles_lock_plan_flags();
