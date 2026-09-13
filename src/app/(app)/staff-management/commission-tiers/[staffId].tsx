import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, Layers } from 'lucide-react-native';
import { getStaff, getStaffCommissionTiers, createCommissionTier, deleteCommissionTier } from '@/db/api';
import type { Staff, StaffCommissionTier } from '@/types/types';

export default function CommissionTiersScreen() {
  const router = useRouter();
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const [staffMember, setStaffMember] = useState<Staff | null>(null);
  const [tiers, setTiers] = useState<StaffCommissionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [minRevenue, setMinRevenue] = useState('');
  const [maxRevenue, setMaxRevenue] = useState('');
  const [rate, setRate] = useState('');

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const [allStaff, tierRows] = await Promise.all([getStaff(), getStaffCommissionTiers(staffId)]);
      setStaffMember(allStaff.find(s => s.id === staffId) ?? null);
      setTiers(tierRows);
    } finally { setLoading(false); }
  }, [staffId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError('');
    if (!staffId) return;
    const min = parseFloat(minRevenue);
    const max = maxRevenue.trim() ? parseFloat(maxRevenue) : null;
    const r = parseFloat(rate);
    if (isNaN(min) || min < 0) { setError('業績下限請輸入 0 以上的數字'); return; }
    if (max != null && (isNaN(max) || max <= min)) { setError('業績上限要留空（無上限）或大於下限'); return; }
    if (isNaN(r) || r < 0 || r > 100) { setError('抽成率請輸入 0–100 之間的數字'); return; }
    setSaving(true);
    try {
      await createCommissionTier({ staff_id: staffId, min_revenue: min, max_revenue: max, rate: r });
      setMinRevenue(''); setMaxRevenue(''); setRate('');
      load();
    } catch (e: any) { setError(e.message ?? '新增失敗'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteCommissionTier(id);
    load();
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Layers size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">
          {staffMember ? `${staffMember.name}・階梯抽成` : '階梯抽成設定'}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color="#e8789a" /></View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-24 gap-3">
          <View className="bg-card border border-border rounded-2xl p-4 gap-1.5">
            <Text className="font-rounded text-xs text-muted-foreground">
              就高適用制：當月業績落在哪一階，整筆業績都用該階的抽成率計算（不是超額累進）。
            </Text>
            <Text className="font-rounded text-xs text-muted-foreground">
              沒有設定任何階梯時，計薪會退回沿用人員管理裡設定的固定抽成率（{staffMember ? `${staffMember.commission_rate}%` : '—'}）。
            </Text>
          </View>

          {tiers.length === 0 ? (
            <View className="items-center py-10 gap-2">
              <Text className="font-rounded text-sm text-muted-foreground">尚未設定階梯，目前用固定抽成率</Text>
            </View>
          ) : (
            <View className="bg-card border border-border rounded-2xl overflow-hidden">
              {tiers.map((t, i) => (
                <View key={t.id} className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-1">
                    <Text className="font-rounded text-sm text-foreground">
                      ${Number(t.min_revenue).toLocaleString()} ～ {t.max_revenue != null ? `$${Number(t.max_revenue).toLocaleString()}` : '無上限'}
                    </Text>
                    <Text className="font-rounded text-xs text-muted-foreground mt-0.5">抽成 {t.rate}%</Text>
                  </View>
                  <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={() => handleDelete(t.id)}>
                    <Trash2 size={15} color="#e85454" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View className="bg-card border border-primary/30 rounded-2xl p-4 gap-3">
            <Text className="font-rounded text-sm font-semibold text-foreground">新增一階</Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground mb-1.5">業績下限</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-3 h-10 font-rounded text-base text-foreground"
                  placeholder="0" placeholderTextColor="#c4a0ae"
                  value={minRevenue} onChangeText={setMinRevenue} keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground mb-1.5">業績上限（留空=無上限）</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-3 h-10 font-rounded text-base text-foreground"
                  placeholder="不填=無上限" placeholderTextColor="#c4a0ae"
                  value={maxRevenue} onChangeText={setMaxRevenue} keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1.5">這一階的抽成率（%）</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-3 h-10 font-rounded text-base text-foreground w-32"
                placeholder="例：40" placeholderTextColor="#c4a0ae"
                value={rate} onChangeText={setRate} keyboardType="decimal-pad"
              />
            </View>
            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
            <Pressable className="flex-row items-center justify-center gap-1.5 bg-primary rounded-xl py-2.5 active:opacity-80" onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Plus size={16} color="#fff" />
                  <Text className="font-rounded text-sm text-white font-medium">新增這一階</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
