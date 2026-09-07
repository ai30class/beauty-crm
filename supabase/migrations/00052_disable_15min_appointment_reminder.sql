-- 只保留「預約前一天」提醒，取消「預約前 15-75 分鐘」那個（使用者決定不需要兩則都發，
-- 一天只發一次比較不會浪費 LINE 官方帳號的每月免費訊息額度）
SELECT cron.unschedule('appointment-reminders-15min');
