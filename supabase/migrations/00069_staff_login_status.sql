-- 員工管理頁需要知道「這位員工是不是已經有登入帳號了」，才能顯示正確的按鈕
-- （還沒建就顯示邀請表單，已經建了就顯示狀態、不能重複邀請）。
-- 商家沒辦法直接查 profiles 表看別人的帳號（RLS 只開放「查自己」），
-- 所以用這個函式回傳「屬於我這家店、且已經是員工登入帳號」的 staff_id 清單。
CREATE OR REPLACE FUNCTION public.get_staff_with_login_accounts() RETURNS TABLE(staff_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.staff_id FROM public.profiles p
  WHERE p.account_type = 'staff' AND p.staff_owner_id = auth.uid()
$$;
