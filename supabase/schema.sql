-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_cron"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";


--
-- Name: EXTENSION "pg_net"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_net" IS 'Async HTTP';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


--
-- Name: EXTENSION "pg_graphql"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pg_graphql" IS 'pg_graphql: GraphQL support';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: booking_mode_enum; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'booking_mode_enum'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."booking_mode_enum" AS ENUM (
    'deposit',
    'direct'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_type; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'package_type'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."package_type" AS ENUM (
    'session',
    'stored_value'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: payment_method_enum; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'payment_method_enum'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."payment_method_enum" AS ENUM (
    'cash',
    'card',
    'line_pay',
    'package'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_record_status_enum; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'service_record_status_enum'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."service_record_status_enum" AS ENUM (
    'completed',
    'pending'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deduct_product_stock("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."deduct_product_stock"("p_id" "uuid", "qty" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  current_stock integer;
  actual_deduct integer;
BEGIN
  SELECT stock INTO current_stock FROM products WHERE id = p_id FOR UPDATE;
  actual_deduct := LEAST(qty, current_stock);
  UPDATE products SET stock = stock - actual_deduct WHERE id = p_id;
  RETURN actual_deduct;
END;
$$;


--
-- Name: get_user_role("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."get_user_role"("uid" "uuid") RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role)
  VALUES (NEW.id, NEW.phone, 'user'::public.user_role);
  RETURN NEW;
END;
$$;


--
-- Name: increment_coupon_issued("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."increment_coupon_issued"("coupon_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE coupons SET issued = issued + 1 WHERE id = coupon_id;
$$;


--
-- Name: restock_product("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."restock_product"("p_id" "uuid", "qty" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE products SET stock = stock + qty WHERE id = p_id AND owner_id = auth.uid();
END;
$$;


--
-- Name: update_shop_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_shop_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: use_package_amount("uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."use_package_amount"("p_package_id" "uuid", "p_amount" numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pkg service_packages%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM service_packages WHERE id = p_package_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '儲值卡不存在'; END IF;
  IF pkg.package_type != 'stored_value' THEN RAISE EXCEPTION '此套票非儲值型'; END IF;
  IF pkg.remaining_amount < p_amount THEN RAISE EXCEPTION '儲值餘額不足'; END IF;
  UPDATE service_packages SET remaining_amount = remaining_amount - p_amount WHERE id = p_package_id;
  INSERT INTO package_transactions(package_id, sessions_used, amount_deducted, note)
    VALUES (p_package_id, 0, p_amount, p_note);
  UPDATE service_packages SET is_active = false
    WHERE id = p_package_id AND remaining_amount <= 0;
END;
$$;


--
-- Name: use_package_session("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."use_package_session"("p_package_id" "uuid", "p_sessions" integer DEFAULT 1, "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pkg service_packages%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM service_packages WHERE id = p_package_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '套票不存在'; END IF;
  IF pkg.package_type != 'session' THEN RAISE EXCEPTION '此套票非次數型'; END IF;
  IF (pkg.used_sessions + p_sessions) > pkg.total_sessions THEN RAISE EXCEPTION '剩餘次數不足'; END IF;
  UPDATE service_packages SET used_sessions = used_sessions + p_sessions WHERE id = p_package_id;
  INSERT INTO package_transactions(package_id, sessions_used, amount_deducted, note)
    VALUES (p_package_id, p_sessions, 0, p_note);
  -- 若用完則自動標記非啟用
  UPDATE service_packages SET is_active = false
    WHERE id = p_package_id AND used_sessions >= total_sessions;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "appointment_time" timestamp with time zone NOT NULL,
    "reminder_minutes" integer DEFAULT 30 NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "min_amount" numeric DEFAULT 0 NOT NULL,
    "quota" integer,
    "issued" integer DEFAULT 0 NOT NULL,
    "valid_days" integer DEFAULT 90 NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupons_type_check" CHECK (("type" = ANY (ARRAY['discount_pct'::"text", 'discount_amt'::"text", 'free_service'::"text"])))
);


--
-- Name: customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."customer_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: customer_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."customer_coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "customer_name" "text" DEFAULT ''::"text" NOT NULL,
    "customer_phone" "text" DEFAULT ''::"text" NOT NULL,
    "expire_date" "date" NOT NULL,
    "used_at" timestamp with time zone,
    "used_amount" numeric,
    "is_used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "birthday" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_restricted" boolean DEFAULT false NOT NULL,
    "booking_allowed_hours" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "expense_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric))
);


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "holiday_date" "date" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "staff_id" "uuid"
);


--
-- Name: monthly_expense_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."monthly_expense_summary" AS
 SELECT "owner_id",
    (EXTRACT(year FROM "expense_date"))::integer AS "year",
    (EXTRACT(month FROM "expense_date"))::integer AS "month",
    "sum"("amount") AS "total_expenses"
   FROM "public"."expenses"
  GROUP BY "owner_id", ((EXTRACT(year FROM "expense_date"))::integer), ((EXTRACT(month FROM "expense_date"))::integer);


--
-- Name: service_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."service_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "service_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "before_photo_path" "text",
    "after_photo_path" "text",
    "payment_method" "public"."payment_method_enum" DEFAULT 'cash'::"public"."payment_method_enum" NOT NULL,
    "status" "public"."service_record_status_enum" DEFAULT 'completed'::"public"."service_record_status_enum" NOT NULL,
    "package_id" "uuid",
    CONSTRAINT "service_records_amount_check" CHECK (("amount" >= (0)::numeric))
);


--
-- Name: monthly_income_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."monthly_income_summary" AS
 SELECT "owner_id",
    (EXTRACT(year FROM "service_date"))::integer AS "year",
    (EXTRACT(month FROM "service_date"))::integer AS "month",
    "sum"("amount") AS "total_income",
    "count"(*) AS "service_count"
   FROM "public"."service_records"
  GROUP BY "owner_id", ((EXTRACT(year FROM "service_date"))::integer), ((EXTRACT(month FROM "service_date"))::integer);


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "ref_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "sent_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: online_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."online_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "customer_user_id" "uuid",
    "staff_id" "uuid",
    "service_template_id" "uuid",
    "service_name" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "deposit_amount" numeric(10,2) NOT NULL,
    "appointment_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending_payment'::"text" NOT NULL,
    "line_pay_transaction_id" "text",
    "line_pay_order_id" "text",
    "line_pay_payment_url" "text",
    "line_pay_paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_mode" "public"."booking_mode_enum" DEFAULT 'deposit'::"public"."booking_mode_enum" NOT NULL,
    "customer_id" "uuid",
    CONSTRAINT "online_orders_status_check" CHECK (("status" = ANY (ARRAY['pending_payment'::"text", 'paid'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


--
-- Name: package_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."package_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "service_record_id" "uuid",
    "sessions_used" integer DEFAULT 0 NOT NULL,
    "amount_deducted" numeric(10,2) DEFAULT 0 NOT NULL,
    "note" "text",
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: product_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."product_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "service_record_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sell_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "sell_amount" numeric(10,2) GENERATED ALWAYS AS (("sell_price" * ("quantity")::numeric)) STORED,
    CONSTRAINT "product_usage_quantity_check" CHECK (("quantity" > 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "spec" "text" DEFAULT ''::"text" NOT NULL,
    "cost_price" numeric DEFAULT 0 NOT NULL,
    "sell_price" numeric DEFAULT 0 NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "safety_stock" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "products_safety_stock_check" CHECK (("safety_stock" >= 0)),
    CONSTRAINT "products_sell_price_check" CHECK (("sell_price" >= (0)::numeric)),
    CONSTRAINT "products_stock_check" CHECK (("stock" >= 0))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "display_name" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: restock_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."restock_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "qty" integer NOT NULL,
    "cost_total" numeric(10,2) DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restock_log_qty_check" CHECK (("qty" > 0))
);


--
-- Name: service_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."service_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "package_type" "public"."package_type" DEFAULT 'session'::"public"."package_type" NOT NULL,
    "name" "text" NOT NULL,
    "total_sessions" integer,
    "used_sessions" integer DEFAULT 0 NOT NULL,
    "initial_amount" numeric(10,2),
    "remaining_amount" numeric(10,2),
    "purchase_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expire_date" "date",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchase_payment_method" "text" DEFAULT 'cash'::"text",
    CONSTRAINT "service_packages_purchase_payment_method_check" CHECK (("purchase_payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'line_pay'::"text"])))
);


--
-- Name: service_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."service_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "default_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "color" "text" DEFAULT '#e8789a'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allow_online_booking" boolean DEFAULT true NOT NULL,
    "break_after_minutes" integer DEFAULT 30 NOT NULL,
    "require_deposit" boolean DEFAULT true NOT NULL
);


--
-- Name: shop_blocked_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."shop_blocked_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "applies_to" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: shop_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."shop_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "shop_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "business_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'therapist'::"text" NOT NULL,
    "color" "text" DEFAULT '#e8789a'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'appointments_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'coupons_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_accounts_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_accounts"
    ADD CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_accounts_user_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_accounts"
    ADD CONSTRAINT "customer_accounts_user_id_key" UNIQUE ("user_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_coupons customer_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_coupons_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_coupons"
    ADD CONSTRAINT "customer_coupons_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customers_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'expenses_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: holidays holidays_owner_id_holiday_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'holidays_owner_id_holiday_date_key'
      AND n.nspname = 'public'
      AND c.relname = 'holidays'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."holidays"
    ADD CONSTRAINT "holidays_owner_id_holiday_date_key" UNIQUE ("owner_id", "holiday_date");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'holidays_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'holidays'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."holidays"
    ADD CONSTRAINT "holidays_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notification_logs_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'notification_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_logs notification_logs_ref_id_type_sent_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'notification_logs_ref_id_type_sent_date_key'
      AND n.nspname = 'public'
      AND c.relname = 'notification_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_ref_id_type_sent_date_key" UNIQUE ("ref_id", "type", "sent_date");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_line_pay_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'online_orders_line_pay_order_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."online_orders"
    ADD CONSTRAINT "online_orders_line_pay_order_id_key" UNIQUE ("line_pay_order_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'online_orders_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."online_orders"
    ADD CONSTRAINT "online_orders_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions package_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'package_transactions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'package_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."package_transactions"
    ADD CONSTRAINT "package_transactions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_usage product_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_usage_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_usage'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_usage"
    ADD CONSTRAINT "product_usage_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_owner_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_owner_id_name_key'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_owner_id_name_key" UNIQUE ("owner_id", "name");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'products_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: restock_log restock_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'restock_log_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'restock_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."restock_log"
    ADD CONSTRAINT "restock_log_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_packages service_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_packages_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_packages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_packages"
    ADD CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records service_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_records_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_templates service_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_templates_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_templates"
    ADD CONSTRAINT "service_templates_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_blocked_slots shop_blocked_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shop_blocked_slots_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'shop_blocked_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shop_blocked_slots"
    ADD CONSTRAINT "shop_blocked_slots_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_profiles shop_profiles_owner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shop_profiles_owner_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'shop_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_owner_id_key" UNIQUE ("owner_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_profiles shop_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shop_profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'shop_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'staff_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'staff'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: shop_profiles shop_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE OR REPLACE TRIGGER "shop_profiles_updated_at" BEFORE UPDATE ON "public"."shop_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_shop_profiles_updated_at"();


--
-- Name: appointments appointments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'appointments_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments appointments_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'appointments_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer_accounts_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_accounts_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_accounts"
    ADD CONSTRAINT "customer_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer_accounts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_accounts_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_accounts"
    ADD CONSTRAINT "customer_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_accounts_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_accounts"
    ADD CONSTRAINT "customer_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_coupons customer_coupons_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_coupons_coupon_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_coupons"
    ADD CONSTRAINT "customer_coupons_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_coupons customer_coupons_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customer_coupons_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customer_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customer_coupons"
    ADD CONSTRAINT "customer_coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers customers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'customers_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'expenses_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: holidays holidays_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'holidays_staff_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'holidays'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."holidays"
    ADD CONSTRAINT "holidays_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'online_orders_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."online_orders"
    ADD CONSTRAINT "online_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_service_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'online_orders_service_template_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."online_orders"
    ADD CONSTRAINT "online_orders_service_template_id_fkey" FOREIGN KEY ("service_template_id") REFERENCES "public"."service_templates"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'online_orders_staff_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."online_orders"
    ADD CONSTRAINT "online_orders_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions package_transactions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'package_transactions_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'package_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."package_transactions"
    ADD CONSTRAINT "package_transactions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions package_transactions_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'package_transactions_package_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'package_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."package_transactions"
    ADD CONSTRAINT "package_transactions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."service_packages"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions package_transactions_service_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'package_transactions_service_record_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'package_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."package_transactions"
    ADD CONSTRAINT "package_transactions_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "public"."service_records"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_usage product_usage_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_usage_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_usage'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_usage"
    ADD CONSTRAINT "product_usage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: product_usage product_usage_service_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'product_usage_service_record_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'product_usage'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."product_usage"
    ADD CONSTRAINT "product_usage_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "public"."service_records"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: restock_log restock_log_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'restock_log_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'restock_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."restock_log"
    ADD CONSTRAINT "restock_log_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: restock_log restock_log_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'restock_log_product_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'restock_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."restock_log"
    ADD CONSTRAINT "restock_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_packages service_packages_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_packages_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_packages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_packages"
    ADD CONSTRAINT "service_packages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_packages service_packages_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_packages_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_packages'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_packages"
    ADD CONSTRAINT "service_packages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records service_records_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_records_customer_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records service_records_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_records_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records service_records_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_records_package_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_records"
    ADD CONSTRAINT "service_records_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."service_packages"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_templates service_templates_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'service_templates_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'service_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."service_templates"
    ADD CONSTRAINT "service_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_blocked_slots shop_blocked_slots_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shop_blocked_slots_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'shop_blocked_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shop_blocked_slots"
    ADD CONSTRAINT "shop_blocked_slots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_profiles shop_profiles_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'shop_profiles_owner_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'shop_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."shop_profiles"
    ADD CONSTRAINT "shop_profiles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles Admin 全權訪問 profiles; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'Admin 全權訪問 profiles'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "Admin 全權訪問 profiles" ON "public"."profiles" TO "authenticated" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"public"."user_role"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_templates anon can read online booking services; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon can read online booking services'
      AND n.nspname = 'public'
      AND c.relname = 'service_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon can read online booking services" ON "public"."service_templates" FOR SELECT TO "anon" USING (("allow_online_booking" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders anon can update active online order; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon can update active online order'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon can update active online order" ON "public"."online_orders" FOR UPDATE TO "anon" USING (("status" = ANY (ARRAY['confirmed'::"text", 'pending'::"text"]))) WITH CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'pending'::"text", 'cancelled'::"text"])));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: restock_log anon_no_access_restock_log; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'anon_no_access_restock_log'
      AND n.nspname = 'public'
      AND c.relname = 'restock_log'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "anon_no_access_restock_log" ON "public"."restock_log" TO "anon" USING (false);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: restock_log auth_own_restock_log; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_own_restock_log'
      AND n.nspname = 'public'
      AND c.relname = 'restock_log'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_own_restock_log" ON "public"."restock_log" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_accounts customer can insert own account; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'customer can insert own account'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "customer can insert own account" ON "public"."customer_accounts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts customer can view own account; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'customer can view own account'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "customer can view own account" ON "public"."customer_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."customer_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."customer_coupons" ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."holidays" ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays holidays_anon_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'holidays_anon_select'
      AND n.nspname = 'public'
      AND c.relname = 'holidays'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "holidays_anon_select" ON "public"."holidays" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: holidays holidays_owner_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'holidays_owner_all'
      AND n.nspname = 'public'
      AND c.relname = 'holidays'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "holidays_owner_all" ON "public"."holidays" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: online_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."online_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: online_orders online_orders_anon_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'online_orders_anon_insert'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "online_orders_anon_insert" ON "public"."online_orders" FOR INSERT TO "anon" WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_anon_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'online_orders_anon_select'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "online_orders_anon_select" ON "public"."online_orders" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: online_orders online_orders_owner_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'online_orders_owner_all'
      AND n.nspname = 'public'
      AND c.relname = 'online_orders'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "online_orders_owner_all" ON "public"."online_orders" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_blocked_slots owner can manage blocked slots; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner can manage blocked slots'
      AND n.nspname = 'public'
      AND c.relname = 'shop_blocked_slots'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner can manage blocked slots" ON "public"."shop_blocked_slots" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: shop_profiles owner can manage own profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner can manage own profile'
      AND n.nspname = 'public'
      AND c.relname = 'shop_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner can manage own profile" ON "public"."shop_profiles" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_accounts owner can view customer accounts; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner can view customer accounts'
      AND n.nspname = 'public'
      AND c.relname = 'customer_accounts'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner can view customer accounts" ON "public"."customer_accounts" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions owner full access package_transactions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner full access package_transactions'
      AND n.nspname = 'public'
      AND c.relname = 'package_transactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner full access package_transactions" ON "public"."package_transactions" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_packages owner full access service_packages; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner full access service_packages'
      AND n.nspname = 'public'
      AND c.relname = 'service_packages'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner full access service_packages" ON "public"."service_packages" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_templates owner full access service_templates; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner full access service_templates'
      AND n.nspname = 'public'
      AND c.relname = 'service_templates'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner full access service_templates" ON "public"."service_templates" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: coupons owner manages coupons; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner manages coupons'
      AND n.nspname = 'public'
      AND c.relname = 'coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner manages coupons" ON "public"."coupons" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customer_coupons owner manages customer_coupons; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner manages customer_coupons'
      AND n.nspname = 'public'
      AND c.relname = 'customer_coupons'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner manages customer_coupons" ON "public"."customer_coupons" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: notification_logs owner_all_notification_logs; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'owner_all_notification_logs'
      AND n.nspname = 'public'
      AND c.relname = 'notification_logs'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "owner_all_notification_logs" ON "public"."notification_logs" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: package_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."package_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."product_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_usage product_usage_owner_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'product_usage_owner_all'
      AND n.nspname = 'public'
      AND c.relname = 'product_usage'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "product_usage_owner_all" ON "public"."product_usage" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_owner_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'products_owner_all'
      AND n.nspname = 'public'
      AND c.relname = 'products'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "products_owner_all" ON "public"."products" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_profiles public read shop profile by owner; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public read shop profile by owner'
      AND n.nspname = 'public'
      AND c.relname = 'shop_profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "public read shop profile by owner" ON "public"."shop_profiles" FOR SELECT TO "anon" USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: restock_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."restock_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_packages" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."service_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_blocked_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shop_blocked_slots" ENABLE ROW LEVEL SECURITY;

--
-- Name: shop_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shop_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff staff_customer_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'staff_customer_select'
      AND n.nspname = 'public'
      AND c.relname = 'staff'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "staff_customer_select" ON "public"."staff" FOR SELECT TO "anon" USING (("is_active" = true));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: staff staff_owner_all; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'staff_owner_all'
      AND n.nspname = 'public'
      AND c.relname = 'staff'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "staff_owner_all" ON "public"."staff" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses 用戶刪除支出; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶刪除支出'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶刪除支出" ON "public"."expenses" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records 用戶刪除服務記錄; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶刪除服務記錄'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶刪除服務記錄" ON "public"."service_records" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers 用戶刪除自己的顧客; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶刪除自己的顧客'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶刪除自己的顧客" ON "public"."customers" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments 用戶刪除預約; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶刪除預約'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶刪除預約" ON "public"."appointments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses 用戶新增支出; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶新增支出'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶新增支出" ON "public"."expenses" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records 用戶新增服務記錄; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶新增服務記錄'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶新增服務記錄" ON "public"."service_records" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments 用戶新增預約; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶新增預約'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶新增預約" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers 用戶新增顧客; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶新增顧客'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶新增顧客" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses 用戶更新支出; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶更新支出'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶更新支出" ON "public"."expenses" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records 用戶更新服務記錄; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶更新服務記錄'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶更新服務記錄" ON "public"."service_records" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用戶更新自己的 profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶更新自己的 profile'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶更新自己的 profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((NOT ("role" IS DISTINCT FROM "public"."get_user_role"("auth"."uid"()))));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers 用戶更新自己的顧客; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶更新自己的顧客'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶更新自己的顧客" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments 用戶更新預約; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶更新預約'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶更新預約" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles 用戶查看自己的 profile; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶查看自己的 profile'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶查看自己的 profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses 用戶查看自己的支出; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶查看自己的支出'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶查看自己的支出" ON "public"."expenses" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: service_records 用戶查看自己的服務記錄; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶查看自己的服務記錄'
      AND n.nspname = 'public'
      AND c.relname = 'service_records'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶查看自己的服務記錄" ON "public"."service_records" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: appointments 用戶查看自己的預約; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶查看自己的預約'
      AND n.nspname = 'public'
      AND c.relname = 'appointments'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶查看自己的預約" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: customers 用戶查看自己的顧客; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = '用戶查看自己的顧客'
      AND n.nspname = 'public'
      AND c.relname = 'customers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "用戶查看自己的顧客" ON "public"."customers" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "owner_id"));
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.

-- auth.users trigger: on_auth_user_created
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_delete_service_photos on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_delete_service_photos'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_delete_service_photos ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = ''appd2yss59nidj5_service_photos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_select_service_photos on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_select_service_photos'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_select_service_photos ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = ''appd2yss59nidj5_service_photos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: auth_upload_service_photos on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_upload_service_photos'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY auth_upload_service_photos ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''appd2yss59nidj5_service_photos''::text));';
  END IF;
END
$pg_schema_restore$;
-- policy: public_read_service_photos on storage.objects
DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'public_read_service_photos'
      AND n.nspname = 'storage'
      AND c.relname = 'objects'
  ) THEN
    EXECUTE 'CREATE POLICY public_read_service_photos ON storage.objects AS PERMISSIVE FOR SELECT TO anon USING ((bucket_id = ''appd2yss59nidj5_service_photos''::text));';
  END IF;
END
$pg_schema_restore$;

-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES ('appd2yss59nidj5_service_photos', 'appd2yss59nidj5_service_photos', NULL, '2026-07-17 18:31:14.872428+00', '2026-07-17 18:31:14.872428+00', 'true', 'false', '5242880', '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "owner" = EXCLUDED."owner", "created_at" = EXCLUDED."created_at", "updated_at" = EXCLUDED."updated_at", "public" = EXCLUDED."public", "avif_autodetection" = EXCLUDED."avif_autodetection", "file_size_limit" = EXCLUDED."file_size_limit", "allowed_mime_types" = EXCLUDED."allowed_mime_types", "owner_id" = EXCLUDED."owner_id", "type" = EXCLUDED."type";

-- ============================================================
-- SECTION: CRON JOBS
-- ============================================================
-- 用户自定义 pg_cron 任务。

DO $pg_cron_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'birthday-reminders-daily') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'birthday-reminders-daily'),
      schedule := '0 1 * * *',
      command := '
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_URL'') || ''/functions/v1/send-reminders'',
    headers := jsonb_build_object(
                 ''Content-Type'',  ''application/json'',
                 ''Authorization'', ''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_ANON_KEY'')
               ),
    body    := ''{"type":"birthday"}''::jsonb
  );
  ',
      active := true
    );
  ELSE
    PERFORM cron.schedule('birthday-reminders-daily', '0 1 * * *', '
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_URL'') || ''/functions/v1/send-reminders'',
    headers := jsonb_build_object(
                 ''Content-Type'',  ''application/json'',
                 ''Authorization'', ''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_ANON_KEY'')
               ),
    body    := ''{"type":"birthday"}''::jsonb
  );
  ');
  END IF;
END
$pg_cron_restore$;
DO $pg_cron_restore$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'appointment-reminders-15min') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'appointment-reminders-15min'),
      schedule := '*/15 * * * *',
      command := '
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_URL'') || ''/functions/v1/send-reminders'',
    headers := jsonb_build_object(
                 ''Content-Type'',  ''application/json'',
                 ''Authorization'', ''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_ANON_KEY'')
               ),
    body    := ''{"type":"appointment"}''::jsonb
  );
  ',
      active := true
    );
  ELSE
    PERFORM cron.schedule('appointment-reminders-15min', '*/15 * * * *', '
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_URL'') || ''/functions/v1/send-reminders'',
    headers := jsonb_build_object(
                 ''Content-Type'',  ''application/json'',
                 ''Authorization'', ''Bearer '' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''SUPABASE_ANON_KEY'')
               ),
    body    := ''{"type":"appointment"}''::jsonb
  );
  ');
  END IF;
END
$pg_cron_restore$;
