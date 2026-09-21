-- 00085：員工帳號不能刪除預約（只能新增、修改、取消）
--
-- 背景：00068 的 staff_appointments_all 是 FOR ALL（含 DELETE），員工可以刪掉全店任何一筆預約。
-- Emma（9/21）決定：員工只能取消預約，不能刪除。畫面同步隱藏垃圾桶（appointments/[id].tsx、(tabs)/appointments.tsx）。
--
-- 做法：把 FOR ALL 拆成 SELECT／INSERT／UPDATE 三條，條件跟原本一樣，只是不再有 DELETE。
-- 店家本人的刪除權限在 00001 的「用戶刪除預約」（auth.uid() = owner_id），不受影響。
--
-- 注意：RLS 擋掉刪除時不會報錯、只是刪 0 筆；App 的 deleteAppointment 已經會在 0 筆時丟出
-- 「沒有權限刪除這筆預約，或它已經不存在」，所以員工即使繞過畫面也會看到明確的錯誤。

DROP POLICY IF EXISTS "staff_appointments_all" ON public.appointments;

CREATE POLICY "staff_appointments_select" ON public.appointments FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id());

CREATE POLICY "staff_appointments_insert" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.staff_shop_owner_id());

CREATE POLICY "staff_appointments_update" ON public.appointments FOR UPDATE TO authenticated
  USING (owner_id = public.staff_shop_owner_id())
  WITH CHECK (owner_id = public.staff_shop_owner_id());
