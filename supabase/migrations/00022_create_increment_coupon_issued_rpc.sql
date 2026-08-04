CREATE OR REPLACE FUNCTION increment_coupon_issued(coupon_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE coupons SET issued = issued + 1 WHERE id = coupon_id;
$$;