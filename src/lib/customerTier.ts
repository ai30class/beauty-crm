// 顧客分級簡化版（CRM 建議功能第 3 項）：用「消費排行」本來就有算的到店次數＋最近到店日，
// 換算成三個標籤，取代死板的「前 20 名」排行——不用再自己開一頁看排行才知道誰是常客。
// 沉睡門檻沿用「久未到店」畫面既有的預設值（60 天），維持同一套認定標準，不要各算各的。

export type CustomerTier = 'frequent' | 'dormant' | 'regular' | 'new';

export const DORMANT_DAYS = 60;
export const FREQUENT_VISITS = 3;

export function classifyCustomerTier(params: { visitCount: number; lastVisit: string | null }): CustomerTier {
  const { visitCount, lastVisit } = params;
  if (visitCount <= 0 || !lastVisit) return 'new';
  const daysSince = Math.floor((Date.now() - new Date(lastVisit).getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince > DORMANT_DAYS) return 'dormant';
  if (visitCount >= FREQUENT_VISITS) return 'frequent';
  return 'regular';
}

export const TIER_LABEL: Record<CustomerTier, string> = {
  frequent: '常客',
  dormant: '沉睡客',
  regular: '一般',
  new: '新顧客',
};

export const TIER_COLOR: Record<CustomerTier, string> = {
  frequent: '#5dc0a0',
  dormant: '#e8a05a',
  regular: '#8b9de8',
  new: '#c4a0ae',
};
