import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, User2 } from 'lucide-react-native';
import { getStaff, createStaff, updateStaff, deleteStaff } from '@/db/api';
import type { Staff } from '@/types/types';

const COLORS = ['#e8789a', '#8b9de8', '#5dc0a0', '#e8a87c', '#c49de8', '#e8d47c', '#7cbde8'];

export default function StaffManagementScreen() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newCommissionRate, setNewCommissionRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editCommissionRate, setEditCommissionRate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setStaff(await getStaff()); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError('');
    if (!newName.trim()) { setError('請輸入姓名'); return; }
    const rate = newCommissionRate.trim() ? Number(newCommissionRate) : 0;
    if (Number.isNaN(rate) || rate < 0 || rate > 100) { setError('抽成比例請輸入 0–100 之間的數字'); return; }
    setSaving(true);
    try {
      await createStaff({ name: newName.trim(), role: 'therapist', color: newColor, is_active: true, commission_rate: rate });
      setNewName(''); setNewCommissionRate(''); setShowAdd(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const rate = editCommissionRate.trim() ? Number(editCommissionRate) : 0;
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return;
    await updateStaff(id, { name: editName.trim(), color: editColor, commission_rate: rate });
    setEditId(null); load();
  };

  const handleToggleActive = async (s: Staff) => {
    await updateStaff(s.id, { is_active: !s.is_active });
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteStaff(id); load();
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">服務人員管理</Text>
        <Pressable
          className="flex-row items-center gap-1 bg-primary/10 px-3 py-2 rounded-full active:opacity-70"
          onPress={() => setShowAdd(true)}
        >
          <Plus size={16} color="#e8789a" />
          <Text className="font-rounded text-sm text-primary font-medium">新增</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-24 gap-3">

        {/* 新增表單 */}
        {showAdd && (
          <View className="bg-card rounded-2xl p-4 border border-primary/30 gap-3">
            <Text className="font-rounded text-sm font-semibold text-foreground">新增人員</Text>
            <TextInput
              className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
              placeholder="姓名"
              placeholderTextColor="#c4a0ae"
              value={newName}
              onChangeText={setNewName}
            />
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-2">選擇顏色</Text>
              <View className="flex-row gap-2">
                {COLORS.map(c => (
                  <Pressable
                    key={c}
                    className="w-7 h-7 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: c, borderWidth: newColor === c ? 3 : 0, borderColor: '#fff', shadowColor: c, shadowOpacity: 0.5, shadowRadius: 4, elevation: 2 }}
                    onPress={() => setNewColor(c)}
                  >
                    {newColor === c && <Check size={12} color="#fff" />}
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-2">業績抽成比例（%，選填，用於員工業績報表試算獎金）</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
                placeholder="例：30"
                placeholderTextColor="#c4a0ae"
                value={newCommissionRate}
                onChangeText={setNewCommissionRate}
                keyboardType="decimal-pad"
              />
            </View>
            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
            <View className="flex-row gap-2">
              <Pressable className="flex-1 bg-primary rounded-xl py-2.5 items-center active:opacity-80" onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">確認新增</Text>}
              </Pressable>
              <Pressable className="flex-1 bg-muted rounded-xl py-2.5 items-center active:opacity-70"
                onPress={() => { setShowAdd(false); setNewName(''); setNewCommissionRate(''); setError(''); }}>
                <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <View className="py-20 items-center"><ActivityIndicator color="#e8789a" /></View>
        ) : staff.length === 0 ? (
          <View className="items-center py-20 gap-3">
            <User2 size={48} color="#c4a0ae" />
            <Text className="font-rounded text-base text-muted-foreground">尚未新增服務人員</Text>
          </View>
        ) : (
          staff.map(s => (
            <View
              key={s.id}
              className="bg-card rounded-2xl px-4 py-3 border border-border"
              style={{ shadowColor: s.color, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}
            >
              {editId === s.id ? (
                /* 編輯模式 */
                <View className="gap-3">
                  <TextInput
                    className="bg-background border border-border rounded-xl px-4 h-10 font-rounded text-base text-foreground"
                    value={editName}
                    onChangeText={setEditName}
                    autoFocus
                  />
                  <View className="flex-row gap-2">
                    {COLORS.map(c => (
                      <Pressable
                        key={c}
                        className="w-7 h-7 rounded-full items-center justify-center active:opacity-70"
                        style={{ backgroundColor: c, borderWidth: editColor === c ? 3 : 0, borderColor: '#fff' }}
                        onPress={() => setEditColor(c)}
                      >
                        {editColor === c && <Check size={12} color="#fff" />}
                      </Pressable>
                    ))}
                  </View>
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground mb-2">業績抽成比例（%）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 h-10 font-rounded text-base text-foreground"
                      value={editCommissionRate}
                      onChangeText={setEditCommissionRate}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable className="flex-1 bg-primary rounded-xl py-2 items-center active:opacity-80" onPress={() => handleSaveEdit(s.id)}>
                      <Text className="font-rounded text-sm text-white font-medium">儲存</Text>
                    </Pressable>
                    <Pressable className="flex-1 bg-muted rounded-xl py-2 items-center active:opacity-70" onPress={() => setEditId(null)}>
                      <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                /* 顯示模式 */
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: s.color + '22' }}>
                    <Text className="font-rounded text-base font-bold" style={{ color: s.color }}>{s.name.charAt(0)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-rounded text-base font-semibold text-foreground">{s.name}</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="w-2 h-2 rounded-full" style={{ backgroundColor: s.is_active ? '#5dc0a0' : '#c4a0ae' }} />
                      <Text className="font-rounded text-xs text-muted-foreground">{s.is_active ? '服務中' : '暫停服務'}　抽成 {s.commission_rate}%</Text>
                    </View>
                  </View>
                  <Pressable
                    className="px-2 py-1 rounded-full mr-1 active:opacity-70"
                    style={{ backgroundColor: s.is_active ? '#e0f5ef' : '#f5e6ec' }}
                    onPress={() => handleToggleActive(s)}
                  >
                    <Text className="font-rounded text-xs font-medium" style={{ color: s.is_active ? '#5dc0a0' : '#e8789a' }}>
                      {s.is_active ? '暫停' : '啟用'}
                    </Text>
                  </Pressable>
                  <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted mr-1"
                    onPress={() => { setEditId(s.id); setEditName(s.name); setEditColor(s.color); setEditCommissionRate(String(s.commission_rate)); }}>
                    <Pencil size={15} color="#c4a0ae" />
                  </Pressable>
                  <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
                    onPress={() => handleDelete(s.id)}>
                    <Trash2 size={15} color="#e85454" />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
