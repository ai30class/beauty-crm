import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Wallet, ChevronLeft, ChevronRight, Plus, Trash2, Lock, RefreshCw, AlertTriangle } from 'lucide-react-native';
import {
  getStaff, getStaffBonuses, createStaffBonus, deleteStaffBonus,
  computeMonthlyPayrollPreview, generateMonthlyPayroll, getPayrollRecords,
} from '@/db/api';
import type { PayrollPreviewRow } from '@/db/api';
import type { Staff, StaffBonus, PayrollRecord } from '@/types/types';

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export default function PayrollScreen() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState<PayrollRecord[]>([]);
  const [preview, setPreview] = useState<PayrollPreviewRow[]>([]);
  const [bonuses, setBonuses] = useState<StaffBonus[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [error, setError] = useState('');

  const [bonusStaffId, setBonusStaffId] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [addingBonus, setAddingBonus] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError('');
    try {
      const lockedRows = await getPayrollRecords(y, m);
      if (lockedRows.length > 0) {
        setLocked(lockedRows);
      } else {
        setLocked([]);
        const [previewRows, bonusRows, staff] = await Promise.all([
          computeMonthlyPayrollPreview(y, m),
          getStaffBonuses(y, m),
          getStaff(),
        ]);
        setPreview(previewRows);
        setBonuses(bonusRows);
        setStaffList(staff);
      }
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [load, year, month]));

  const prevMonth = () => {
    const nm = month === 1 ? 12 : month - 1;
    const ny = month === 1 ? year - 1 : year;
    setMonth(nm); setYear(ny); load(ny, nm);
  };
  const nextMonth = () => {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    setMonth(nm); setYear(ny); load(ny, nm);
  };

  const handleAddBonus = async () => {
    setError('');
    if (!bonusStaffId) { setError('請先選擇人員'); return; }
    const amt = parseFloat(bonusAmount);
    if (isNaN(amt) || amt === 0) { setError('獎金金額請輸入非 0 的數字'); return; }
    setAddingBonus(true);
    try {
      await createStaffBonus({ staff_id: bonusStaffId, year, month, amount: amt, note: bonusNote.trim() || null });
      setBonusAmount(''); setBonusNote('');
      load(year, month);
    } catch (e: any) { setError(e.message ?? '新增失敗'); }
    finally { setAddingBonus(false); }
  };

  const handleDeleteBonus = async (id: string) => {
    await deleteStaffBonus(id);
    load(year, month);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      await generateMonthlyPayroll(year, month);
      setShowRegenConfirm(false);
      load(year, month);
    } catch (e: any) { setError(e.message ?? '產生失敗'); }
    finally { setGenerating(false); }
  };

  const totalSalary = (locked.length > 0 ? locked : preview).reduce((s, r) => s + Number(r.total_salary), 0);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Wallet size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">月薪計算</Text>
      </View>

      <View className="flex-row items-center justify-between mx-5 mb-4 bg-card border border-border rounded-2xl px-4 py-3">
        <Pressable onPress={prevMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-lg font-bold text-foreground">{year}年 {MONTH_NAMES[month - 1]}</Text>
        <Pressable onPress={nextMonth} className="w-9 h-9 items-center justify-center rounded-full active:bg-muted">
          <ChevronRight size={22} color="#e8789a" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#e8789a" /></View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-24 gap-3">
          {/* 月度薪資合計 */}
          <View className="bg-card border border-border rounded-2xl p-4 gap-1">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Wallet size={14} color="#e8789a" />
              <Text className="font-rounded text-xs text-muted-foreground">本月薪資合計</Text>
            </View>
            <Text className="font-rounded text-xl font-bold" style={{ color: '#e8789a' }}>${totalSalary.toLocaleString()}</Text>
          </View>

          {locked.length > 0 ? (
            <>
              {/* 已鎖定 */}
              <View className="flex-row items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3">
                <Lock size={14} color="#5dc0a0" />
                <Text className="font-rounded text-xs text-muted-foreground flex-1">
                  已於 {new Date(locked[0].generated_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 產生並鎖定，之後資料異動不會影響這個月的金額
                </Text>
              </View>

              {locked.map(r => (
                <View key={r.id} className="bg-card border border-border rounded-2xl p-4 gap-2">
                  <View className="flex-row items-center gap-3">
                    <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: (r.staff?.color ?? '#e8789a') + '33' }}>
                      <Text className="font-rounded text-sm font-bold" style={{ color: r.staff?.color ?? '#e8789a' }}>
                        {(r.staff?.name ?? '—').charAt(0)}
                      </Text>
                    </View>
                    <Text className="font-rounded text-base font-semibold text-foreground flex-1">{r.staff?.name ?? '—'}</Text>
                    <Text className="font-rounded text-lg font-bold" style={{ color: '#e8789a' }}>${Number(r.total_salary).toLocaleString()}</Text>
                  </View>
                  <View className="border-t border-border pt-2 gap-1">
                    <Row label="業績" value={`$${Number(r.total_revenue).toLocaleString()}`} />
                    <Row label={`抽成（${r.commission_rate_applied}%）`} value={`$${Number(r.commission_amount).toLocaleString()}`} />
                    {Number(r.base_salary) > 0 && <Row label="底薪" value={`$${Number(r.base_salary).toLocaleString()}`} />}
                    {Number(r.bonus_amount) !== 0 && <Row label="額外獎金" value={`$${Number(r.bonus_amount).toLocaleString()}`} />}
                  </View>
                </View>
              ))}

              {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
              <Pressable
                className="flex-row items-center justify-center gap-1.5 bg-muted rounded-xl py-3 active:opacity-70"
                onPress={() => setShowRegenConfirm(true)}
              >
                <RefreshCw size={15} color="#e8789a" />
                <Text className="font-rounded text-sm font-medium text-primary">重新產生本月薪資</Text>
              </Pressable>
            </>
          ) : (
            <>
              {preview.length === 0 ? (
                <View className="items-center py-16 gap-2">
                  <Text className="font-rounded text-sm text-muted-foreground">本月尚無在職人員或業績資料</Text>
                </View>
              ) : (
                preview.map(r => (
                  <View key={r.staff_id} className="bg-card border border-border rounded-2xl p-4 gap-2">
                    <View className="flex-row items-center gap-3">
                      <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: r.staff_color + '33' }}>
                        <Text className="font-rounded text-sm font-bold" style={{ color: r.staff_color }}>{r.staff_name.charAt(0)}</Text>
                      </View>
                      <Text className="font-rounded text-base font-semibold text-foreground flex-1">{r.staff_name}</Text>
                      <Text className="font-rounded text-lg font-bold" style={{ color: '#e8789a' }}>${r.total_salary.toLocaleString()}</Text>
                    </View>
                    <View className="border-t border-border pt-2 gap-1">
                      <Row label="業績" value={`$${r.total_revenue.toLocaleString()}`} />
                      <Row label={`抽成（${r.commission_rate_applied}%）`} value={`$${r.commission_amount.toLocaleString()}`} />
                      {r.base_salary > 0 && <Row label="底薪" value={`$${r.base_salary.toLocaleString()}`} />}
                      {r.bonus_amount !== 0 && <Row label="額外獎金" value={`$${r.bonus_amount.toLocaleString()}`} />}
                    </View>
                  </View>
                ))
              )}

              {/* 本月獎金管理 */}
              <View className="bg-card border border-border rounded-2xl p-4 gap-3">
                <Text className="font-rounded text-sm font-semibold text-foreground">本月額外獎金</Text>
                {bonuses.map(b => (
                  <View key={b.id} className="flex-row items-center justify-between border-t border-border pt-2">
                    <View className="flex-1">
                      <Text className="font-rounded text-sm text-foreground">{b.staff?.name ?? '—'} ${Number(b.amount).toLocaleString()}</Text>
                      {b.note ? <Text className="font-rounded text-xs text-muted-foreground">{b.note}</Text> : null}
                    </View>
                    <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={() => handleDeleteBonus(b.id)}>
                      <Trash2 size={14} color="#e85454" />
                    </Pressable>
                  </View>
                ))}
                <View className="border-t border-border pt-3 gap-2">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-2">
                      {staffList.map(s => {
                        const isSelected = bonusStaffId === s.id;
                        return (
                          <Pressable
                            key={s.id}
                            className="rounded-xl px-3 py-2 active:opacity-70"
                            style={{ backgroundColor: isSelected ? s.color + '22' : '#fafafa', borderWidth: 1.5, borderColor: isSelected ? s.color : '#e8dce8' }}
                            onPress={() => setBonusStaffId(s.id)}
                          >
                            <Text className="font-rounded text-sm font-medium" style={{ color: isSelected ? s.color : '#b0a0b0' }}>{s.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 bg-background border border-border rounded-xl px-3 h-10 font-rounded text-base text-foreground"
                      placeholder="獎金金額（負數＝扣款）" placeholderTextColor="#c4a0ae"
                      value={bonusAmount} onChangeText={setBonusAmount} keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <TextInput
                    className="bg-background border border-border rounded-xl px-3 h-10 font-rounded text-base text-foreground"
                    placeholder="備註（選填，例：全勤獎金）" placeholderTextColor="#c4a0ae"
                    value={bonusNote} onChangeText={setBonusNote}
                  />
                  {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
                  <Pressable className="flex-row items-center justify-center gap-1.5 bg-primary/10 rounded-xl py-2.5 active:opacity-70" onPress={handleAddBonus} disabled={addingBonus}>
                    {addingBonus ? <ActivityIndicator size="small" color="#e8789a" /> : (
                      <>
                        <Plus size={15} color="#e8789a" />
                        <Text className="font-rounded text-sm font-medium text-primary">新增獎金</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              <Pressable className="bg-primary rounded-xl py-3.5 items-center active:opacity-80" onPress={handleGenerate} disabled={generating || preview.length === 0}>
                {generating ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-base text-white font-semibold">產生本月薪資（鎖定）</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}

      {/* 重新產生確認 Modal */}
      <Modal visible={showRegenConfirm} transparent animationType="fade" onRequestClose={() => setShowRegenConfirm(false)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setShowRegenConfirm(false)}>
          <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" onPress={() => {/* 阻止冒泡 */}}>
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
                <AlertTriangle size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確定要重新產生？</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                會用目前最新的服務記錄、抽成規則、獎金重新計算，覆蓋這個月已鎖定的薪資金額。
              </Text>
            </View>
            <View className="flex-row gap-3 mt-2">
              <Pressable className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70" onPress={() => setShowRegenConfirm(false)}>
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80" style={{ backgroundColor: '#e85454' }} onPress={handleGenerate} disabled={generating}>
                {generating ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm font-semibold text-white">確認重新產生</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-rounded text-xs text-muted-foreground">{label}</Text>
      <Text className="font-rounded text-xs font-medium text-foreground">{value}</Text>
    </View>
  );
}
