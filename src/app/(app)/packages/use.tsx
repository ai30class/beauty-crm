import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Minus, Hash, CreditCard, Clock, AlertCircle } from 'lucide-react-native';
import {
  getPackagesByCustomer, getPackageTransactions,
  usePackageSession, usePackageAmount, deactivatePackage
} from '@/db/api';
import type { ServicePackage, PackageTransaction } from '@/types/types';

function PackageCard({
  pkg, isSelected, onSelect
}: {
  pkg: ServicePackage;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isSession = pkg.package_type === 'session';
  const remaining = isSession
    ? (pkg.total_sessions ?? 0) - pkg.used_sessions
    : pkg.remaining_amount ?? 0;
  const total = isSession ? (pkg.total_sessions ?? 1) : (pkg.initial_amount ?? 1);
  const pct = Math.max(0, Math.min(1, Number(remaining) / Number(total)));
  const expired = pkg.expire_date && new Date(pkg.expire_date) < new Date();

  return (
    <Pressable
      className="rounded-2xl p-4 mb-3 border-2 active:opacity-80"
      style={{
        borderColor: isSelected ? '#e8789a' : '#f0dde5',
        backgroundColor: !pkg.is_active || expired ? '#f5f5f5' : isSelected ? '#fce9f0' : '#fff',
      }}
      onPress={onSelect}
      disabled={!pkg.is_active || !!expired}
    >
      <View className="flex-row items-center mb-2 gap-2">
        {isSession
          ? <Hash size={16} color="#e8789a" />
          : <CreditCard size={16} color="#8b9de8" />
        }
        <Text className="font-rounded text-sm font-semibold text-foreground flex-1" numberOfLines={1}>
          {pkg.name}
        </Text>
        {(!pkg.is_active || expired) && (
          <View className="px-2 py-0.5 bg-muted rounded-full">
            <Text className="font-rounded text-xs text-muted-foreground">已失效</Text>
          </View>
        )}
      </View>

      {/* 進度條 */}
      <View className="bg-muted rounded-full overflow-hidden mb-1.5" style={{ height: 6 }}>
        <View
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: isSession ? '#e8789a' : '#8b9de8' }}
        />
      </View>

      <View className="flex-row justify-between">
        <Text className="font-rounded text-xs text-muted-foreground">
          {isSession
            ? `剩餘 ${remaining} / ${total} 次`
            : `剩餘 $${Number(remaining).toLocaleString()} / $${Number(total).toLocaleString()}`
          }
        </Text>
        {pkg.expire_date && (
          <View className="flex-row items-center gap-1">
            <Clock size={10} color="#c4a0ae" />
            <Text className="font-rounded text-xs text-muted-foreground">到期 {pkg.expire_date}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function UsePackageScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const router = useRouter();

  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<ServicePackage | null>(null);
  const [transactions, setTransactions] = useState<PackageTransaction[]>([]);
  const [sessions, setSessions] = useState('1');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadPackages = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const pkgs = await getPackagesByCustomer(customerId);
      setPackages(pkgs);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  const loadTransactions = useCallback(async () => {
    if (!selectedPkg) return;
    const txs = await getPackageTransactions(selectedPkg.id);
    setTransactions(txs);
  }, [selectedPkg]);

  useEffect(() => { loadPackages(); }, [loadPackages]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleUse = async () => {
    setError('');
    if (!selectedPkg) { setError('請選擇套票'); return; }
    setSaving(true);
    try {
      if (selectedPkg.package_type === 'session') {
        const n = parseInt(sessions, 10);
        if (isNaN(n) || n <= 0) { setError('請輸入有效次數'); setSaving(false); return; }
        await usePackageSession(selectedPkg.id, n, note.trim() || undefined);
      } else {
        const a = parseFloat(amount);
        if (isNaN(a) || a <= 0) { setError('請輸入扣款金額'); setSaving(false); return; }
        await usePackageAmount(selectedPkg.id, a, note.trim() || undefined);
      }
      await loadPackages();
      setNote(''); setSessions('1'); setAmount('');
      // 重新選取最新版本
      const fresh = await getPackagesByCustomer(customerId!);
      setPackages(fresh);
      const updated = fresh.find(p => p.id === selectedPkg.id) ?? null;
      setSelectedPkg(updated);
    } catch (e: any) {
      setError(e.message ?? '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const activePackages = packages.filter(p => p.is_active && !(p.expire_date && new Date(p.expire_date) < new Date()));
  const inactivePackages = packages.filter(p => !p.is_active || (p.expire_date && new Date(p.expire_date) < new Date()));

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">套票 / 儲值卡</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#e8789a" />
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-16 gap-4" keyboardShouldPersistTaps="handled">

          {/* 有效套票 */}
          {activePackages.length > 0 ? (
            <View>
              <Text className="font-rounded text-sm font-medium text-muted-foreground mb-2">有效套票</Text>
              {activePackages.map(pkg => (
                <PackageCard
                  key={pkg.id} pkg={pkg}
                  isSelected={selectedPkg?.id === pkg.id}
                  onSelect={() => setSelectedPkg(prev => prev?.id === pkg.id ? null : pkg)}
                />
              ))}
            </View>
          ) : (
            <View className="items-center py-10 bg-card rounded-2xl border border-border">
              <CreditCard size={36} color="#c4a0ae" />
              <Text className="font-rounded text-sm text-muted-foreground mt-2">此顧客尚無有效套票</Text>
            </View>
          )}

          {/* 扣次/扣款操作 */}
          {selectedPkg && (
            <View className="bg-card rounded-2xl p-4 border border-border gap-3">
              <Text className="font-rounded text-base font-semibold text-foreground">
                使用「{selectedPkg.name}」
              </Text>

              {selectedPkg.package_type === 'session' ? (
                <View>
                  <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">扣除次數</Text>
                  <View className="flex-row items-center bg-background border border-border rounded-2xl px-4 gap-3" style={{ height: 52 }}>
                    <Pressable onPress={() => setSessions(s => String(Math.max(1, parseInt(s, 10) - 1)))} className="active:opacity-60">
                      <Minus size={18} color="#e8789a" />
                    </Pressable>
                    <TextInput
                      className="flex-1 font-rounded text-base text-foreground text-center"
                      value={sessions}
                      onChangeText={setSessions}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                    <Pressable onPress={() => setSessions(s => String(parseInt(s, 10) + 1))} className="active:opacity-60">
                      <Text className="font-rounded text-xl text-primary">+</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View>
                  <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">扣款金額</Text>
                  <View className="flex-row items-center bg-background border border-border rounded-2xl px-4" style={{ height: 52 }}>
                    <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
                    <TextInput
                      className="flex-1 font-rounded text-base text-foreground"
                      placeholder="0"
                      placeholderTextColor="#c4a0ae"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              )}

              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註（選填）</Text>
                <TextInput
                  className="bg-background border border-border rounded-2xl px-4 py-2.5 font-rounded text-sm text-foreground"
                  placeholder="例：染髮一次"
                  placeholderTextColor="#c4a0ae"
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              {error ? (
                <View className="flex-row items-center gap-2">
                  <AlertCircle size={14} color="#e85454" />
                  <Text className="font-rounded text-sm text-destructive">{error}</Text>
                </View>
              ) : null}

              <Pressable
                className="bg-primary rounded-2xl items-center justify-center active:opacity-80"
                style={{ height: 52 }}
                onPress={handleUse}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text className="font-rounded text-white text-base font-semibold">確認使用</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* 使用記錄 */}
          {selectedPkg && transactions.length > 0 && (
            <View className="bg-card rounded-2xl p-4 border border-border">
              <Text className="font-rounded text-base font-semibold text-foreground mb-3">使用記錄</Text>
              {transactions.map((tx, i) => (
                <View key={tx.id} className={`py-2.5 flex-row items-center ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-1">
                    <Text className="font-rounded text-xs text-muted-foreground">
                      {new Date(tx.used_at).toLocaleDateString('zh-TW')} {new Date(tx.used_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {tx.note ? <Text className="font-rounded text-sm text-foreground mt-0.5">{tx.note}</Text> : null}
                  </View>
                  <Text className="font-rounded text-sm font-semibold text-primary">
                    {tx.sessions_used > 0 ? `-${tx.sessions_used} 次` : `-$${Number(tx.amount_deducted).toLocaleString()}`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 已失效套票 */}
          {inactivePackages.length > 0 && (
            <View>
              <Text className="font-rounded text-sm font-medium text-muted-foreground mb-2">已失效</Text>
              {inactivePackages.map(pkg => (
                <PackageCard key={pkg.id} pkg={pkg} isSelected={false} onSelect={() => {}} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
