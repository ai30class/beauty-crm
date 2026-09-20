import { Platform, Share } from 'react-native';
import type { ServiceRecord } from '@/types/types';

// 付款方式與金流統計的共用邏輯（結帳、日報表、月報表、匯出共用，避免各處算法不一致）。
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'line_pay' | 'mobile_pay' | 'package';

export const PAYMENT_META: Record<PaymentMethod, { label: string; short: string; color: string }> = {
  cash:          { label: '💵 現金',      short: '現金',     color: '#5dc0a0' },
  card:          { label: '💳 刷卡',      short: '刷卡',     color: '#8b9de8' },
  bank_transfer: { label: '🏦 銀行轉帳',  short: '銀行轉帳', color: '#e8a000' },
  line_pay:      { label: '📱 LINE Pay',  short: 'LINE Pay', color: '#06c755' },
  mobile_pay:    { label: '📲 行動支付',  short: '行動支付', color: '#c76ae8' },
  package:       { label: '🎫 套票扣款',  short: '套票扣款', color: '#e8789a' },
};

// 統計時列出的順序（套票扣款不是收錢，另外計次數）
export const CASHFLOW_METHODS: Exclude<PaymentMethod, 'package'>[] = ['cash', 'card', 'bank_transfer', 'line_pay', 'mobile_pay'];

type RecordLike = Pick<ServiceRecord, 'amount' | 'payment_method'> & {
  deposit_amount?: number | string | null;
  deposit_method?: string | null;
};

// 把一筆服務記錄拆成「各付款方式實際收到多少」：
// 已收訂金算在訂金當時的收款方式（沒記錄就當銀行轉帳），其餘（現場／尾款）算在付款方式。
// 套票扣款的服務 amount 為 0（收入在購買套票當下已計入），這裡不產生金額。
export function splitByMethod(r: RecordLike): { method: PaymentMethod; amount: number }[] {
  const total = Number(r.amount ?? 0);
  if (!(total > 0)) return [];
  const deposit = Math.min(Math.max(Number(r.deposit_amount ?? 0), 0), total);
  const out: { method: PaymentMethod; amount: number }[] = [];
  if (deposit > 0) out.push({ method: ((r.deposit_method as PaymentMethod) || 'bank_transfer'), amount: deposit });
  const onsite = total - deposit;
  if (onsite > 0) out.push({ method: (r.payment_method as PaymentMethod) || 'cash', amount: onsite });
  return out;
}

export interface CashFlowSummary {
  total: number;          // 營業額（本月服務記錄金額合計，含套票購買）
  deposit: number;        // 其中已預收的訂金
  onsite: number;         // 其中現場／尾款實收
  byMethod: Record<string, number>;
  packageUseCount: number; // 套票扣款次數
  byDay: Record<string, Record<string, number>>; // 日期 → 付款方式 → 金額
  countByDay: Record<string, number>;
}

export function summarizeCashFlow(records: (RecordLike & { service_date: string })[]): CashFlowSummary {
  const s: CashFlowSummary = { total: 0, deposit: 0, onsite: 0, byMethod: {}, packageUseCount: 0, byDay: {}, countByDay: {} };
  for (const r of records) {
    s.countByDay[r.service_date] = (s.countByDay[r.service_date] ?? 0) + 1;
    if (r.payment_method === 'package') s.packageUseCount += 1;
    const total = Number(r.amount ?? 0);
    if (total > 0) {
      const dep = Math.min(Math.max(Number(r.deposit_amount ?? 0), 0), total);
      s.total += total; s.deposit += dep; s.onsite += total - dep;
    }
    for (const part of splitByMethod(r)) {
      s.byMethod[part.method] = (s.byMethod[part.method] ?? 0) + part.amount;
      const day = (s.byDay[r.service_date] ??= {});
      day[part.method] = (day[part.method] ?? 0) + part.amount;
    }
  }
  return s;
}

function csvCell(v: string | number) {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
export function toCsv(rows: (string | number)[][]) {
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

// 網頁：下載成 CSV 檔（加 BOM，Excel 開啟中文不會亂碼）；手機 App：改用分享。
export async function downloadCsv(filename: string, csv: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    await Share.share({ message: csv, title: filename });
  }
}
