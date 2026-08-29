import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, Clock, DollarSign, Pencil, HelpCircle, X } from 'lucide-react-native';
import {
  getServiceTemplates, createServiceTemplate,
  updateServiceTemplate, deleteServiceTemplate
} from '@/db/api';
import type { ServiceTemplate } from '@/types/types';

const PRESET_COLORS = [
  '#e8789a', '#a8d5ba', '#8b9de8', '#e8a87c',
  '#c4a0ae', '#b5ddd8', '#f5c6d0', '#d4b8e0',
];

function TemplateRow({
  tpl, onEdit, onDelete
}: {
  tpl: ServiceTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="flex-row items-center py-3 border-b border-border last:border-0">
      <View
        className="w-3 h-3 rounded-full mr-3"
        style={{ backgroundColor: tpl.color }}
      />
      <View className="flex-1">
        <Text className="font-rounded text-sm font-semibold text-foreground">{tpl.name}</Text>
        <View className="flex-row gap-2 mt-1 flex-wrap">
          <View className="flex-row items-center gap-1">
            <Clock size={10} color="#c4a0ae" />
            <Text className="font-rounded text-xs text-muted-foreground">{tpl.duration_minutes} 分鐘</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <DollarSign size={10} color="#c4a0ae" />
            <Text className="font-rounded text-xs text-muted-foreground">${Number(tpl.default_amount).toLocaleString()}</Text>
          </View>
          {tpl.allow_online_booking && (
            <View
              className="px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: tpl.require_deposit ? '#8b9de822' : '#a8d5ba22' }}
            >
              <Text className="font-rounded" style={{ fontSize: 10, color: tpl.require_deposit ? '#8b9de8' : '#3da870' }}>
                {tpl.require_deposit ? '需付訂金' : '免訂金預約'}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View className="flex-row gap-1">
        <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={onEdit}>
          <Pencil size={14} color="#e8789a" />
        </Pressable>
        <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted" onPress={onDelete}>
          <Trash2 size={14} color="#c4a0ae" />
        </Pressable>
      </View>
    </View>
  );
}

type FormState = {
  name: string;
  duration_minutes: string;
  default_amount: string;
  color: string;
  allow_online_booking: boolean;
  require_deposit: boolean;
  break_after_minutes: string;
};

const EMPTY_FORM: FormState = {
  name: '', duration_minutes: '', default_amount: '', color: '#e8789a',
  allow_online_booking: true, require_deposit: true, break_after_minutes: '30',
};

export default function ServiceTemplatesScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBreakInfo, setShowBreakInfo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await getServiceTemplates());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (tpl: ServiceTemplate) => {
    setForm({
      name: tpl.name,
      duration_minutes: String(tpl.duration_minutes),
      default_amount: String(tpl.default_amount),
      color: tpl.color,
      allow_online_booking: tpl.allow_online_booking,
      require_deposit: tpl.require_deposit,
      break_after_minutes: String(tpl.break_after_minutes),
    });
    setEditingId(tpl.id);
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('請輸入服務名稱'); return; }
    const dur = parseInt(form.duration_minutes, 10);
    const amt = parseFloat(form.default_amount);
    if (isNaN(dur) || dur <= 0) { setError('請輸入有效時長'); return; }
    if (isNaN(amt) || amt < 0) { setError('請輸入有效金額'); return; }

    setSaving(true);
    try {
      const brk = parseInt(form.break_after_minutes, 10);
      const payload = {
        name: form.name.trim(),
        duration_minutes: dur,
        default_amount: amt,
        color: form.color,
        sort_order: editingId ? (templates.find(t => t.id === editingId)?.sort_order ?? 0) : templates.length,
        allow_online_booking: form.allow_online_booking,
        require_deposit: form.require_deposit,
        break_after_minutes: isNaN(brk) || brk < 0 ? 0 : brk,
      };
      if (editingId) {
        await updateServiceTemplate(editingId, payload);
      } else {
        await createServiceTemplate(payload);
      }
      await load();
      setShowForm(false);
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteServiceTemplate(id);
    await load();
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">服務項目管理</Text>
        <Pressable className="flex-row items-center gap-1 px-3 py-1.5 bg-primary rounded-xl active:opacity-80" onPress={openAdd}>
          <Plus size={15} color="#fff" />
          <Text className="font-rounded text-sm text-white font-medium">新增</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-12" keyboardShouldPersistTaps="handled">
        {/* 新增/編輯表單 */}
        {showForm && (
          <View className="bg-card rounded-2xl p-4 mb-5 border border-border gap-3">
            <Text className="font-rounded text-base font-semibold text-foreground">
              {editingId ? '編輯服務項目' : '新增服務項目'}
            </Text>

            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1">服務名稱 *</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-3 font-rounded text-sm text-foreground"
                style={{ height: 44 }}
                placeholder="例：剪髮、染髮、護膚"
                placeholderTextColor="#c4a0ae"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="font-rounded text-sm font-medium text-foreground mb-1">時長（分鐘）*</Text>
                <View className="flex-row items-center bg-background border border-border rounded-xl px-3" style={{ height: 44 }}>
                  <TextInput
                    className="flex-1 font-rounded text-sm text-foreground"
                    placeholder="請輸入分鐘數"
                    placeholderTextColor="#c4a0ae"
                    value={form.duration_minutes}
                    onChangeText={v => setForm(f => ({ ...f, duration_minutes: v }))}
                    keyboardType="numeric"
                  />
                  <Text className="font-rounded text-xs text-muted-foreground">分</Text>
                </View>
                <Text className="font-rounded text-xs text-muted-foreground mt-1">以 30 分鐘為基準，例如：30、60、90</Text>
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-sm font-medium text-foreground mb-1">預設金額</Text>
                <View className="flex-row items-center bg-background border border-border rounded-xl px-3" style={{ height: 44 }}>
                  <Text className="font-rounded text-sm text-muted-foreground mr-1">$</Text>
                  <TextInput
                    className="flex-1 font-rounded text-sm text-foreground"
                    placeholder="0"
                    placeholderTextColor="#c4a0ae"
                    value={form.default_amount}
                    onChangeText={v => setForm(f => ({ ...f, default_amount: v }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* 顏色選擇 */}
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-2">標示顏色</Text>
              <View className="flex-row gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <Pressable
                    key={c}
                    className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                    style={{ backgroundColor: c, borderWidth: form.color === c ? 3 : 0, borderColor: '#fff', shadowColor: c, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 3 }}
                    onPress={() => setForm(f => ({ ...f, color: c }))}
                  >
                    {form.color === c && <View className="w-2 h-2 rounded-full bg-white" />}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 線上預約設定 */}
            <View className="border-t border-border pt-3 gap-3">
              <Text className="font-rounded text-sm font-semibold text-foreground">線上預約設定</Text>

              {/* 開放線上預約開關 */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="font-rounded text-sm font-medium text-foreground">開放線上預約</Text>
                  <Text className="font-rounded text-xs text-muted-foreground mt-0.5">顧客可在預約流程中選擇此服務</Text>
                </View>
                <Pressable
                  className="w-12 h-7 rounded-full items-center justify-center active:opacity-80"
                  style={{ backgroundColor: form.allow_online_booking ? '#e8789a' : '#e0d8e0' }}
                  onPress={() => setForm(f => ({ ...f, allow_online_booking: !f.allow_online_booking }))}
                >
                  <View
                    className="w-5 h-5 rounded-full bg-white"
                    style={{ marginLeft: form.allow_online_booking ? 10 : -10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }}
                  />
                </Pressable>
              </View>

              {/* 預付訂金開關（僅當開放線上預約時顯示） */}
              {form.allow_online_booking && (
                <View className="flex-row items-center justify-between pl-3 border-l-2 border-primary/20">
                  <View className="flex-1 mr-3">
                    <Text className="font-rounded text-sm font-medium text-foreground">需要預付訂金（50%）</Text>
                    <Text className="font-rounded text-xs text-muted-foreground mt-0.5">
                      {form.require_deposit ? '顧客須先付 LINE Pay 訂金才能完成預約' : '顧客可直接預約，無需付款'}
                    </Text>
                  </View>
                  <Pressable
                    className="w-12 h-7 rounded-full items-center justify-center active:opacity-80"
                    style={{ backgroundColor: form.require_deposit ? '#8b9de8' : '#e0d8e0' }}
                    onPress={() => setForm(f => ({ ...f, require_deposit: !f.require_deposit }))}
                  >
                    <View
                      className="w-5 h-5 rounded-full bg-white"
                      style={{ marginLeft: form.require_deposit ? 10 : -10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }}
                    />
                  </Pressable>
                </View>
              )}

              {/* 服務後休息時間 */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <View className="flex-row items-center gap-1">
                    <Text className="font-rounded text-sm font-medium text-foreground">服務後休息時間</Text>
                    <Pressable
                      className="w-5 h-5 items-center justify-center active:opacity-60"
                      onPress={() => setShowBreakInfo(true)}
                      hitSlop={8}
                    >
                      <HelpCircle size={14} color="#c4a0ae" />
                    </Pressable>
                  </View>
                  <Text className="font-rounded text-xs text-muted-foreground mt-0.5">完成服務後自動封鎖的時段</Text>
                </View>
                <View className="flex-row items-center bg-background border border-border rounded-xl px-3" style={{ width: 90, height: 40 }}>
                  <TextInput
                    className="flex-1 font-rounded text-sm text-foreground text-center"
                    value={form.break_after_minutes}
                    onChangeText={v => setForm(f => ({ ...f, break_after_minutes: v }))}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                  <Text className="font-rounded text-xs text-muted-foreground">分</Text>
                </View>
              </View>
            </View>

            {error ? <Text className="font-rounded text-destructive text-xs">{error}</Text> : null}

            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 bg-card border border-border rounded-xl py-3 items-center active:opacity-70"
                onPress={() => setShowForm(false)}
              >
                <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-primary rounded-xl py-3 items-center active:opacity-80"
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text className="font-rounded text-sm text-white font-semibold">儲存</Text>
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* 列表 */}
        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#e8789a" />
          </View>
        ) : templates.length === 0 ? (
          <View className="py-16 items-center bg-card rounded-2xl border border-border">
            <Text className="font-rounded text-3xl mb-2">✂️</Text>
            <Text className="font-rounded text-sm text-muted-foreground">尚無服務項目</Text>
            <Text className="font-rounded text-xs text-muted-foreground mt-1">點擊右上角「新增」建立項目</Text>
          </View>
        ) : (
          <View className="bg-card rounded-2xl p-4 border border-border">
            {templates.map(tpl => (
              <TemplateRow
                key={tpl.id}
                tpl={tpl}
                onEdit={() => openEdit(tpl)}
                onDelete={() => handleDelete(tpl.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* 服務後休息時間說明 */}
      <Modal visible={showBreakInfo} transparent animationType="fade" onRequestClose={() => setShowBreakInfo(false)}>
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-8" onPress={() => setShowBreakInfo(false)}>
          <Pressable className="bg-card w-full rounded-3xl p-5 gap-3" onPress={() => {/* 阻止冒泡 */}}>
            <View className="flex-row items-center justify-between">
              <Text className="font-rounded text-base font-bold text-foreground">服務後休息時間是什麼？</Text>
              <Pressable className="w-7 h-7 items-center justify-center rounded-full active:bg-muted" onPress={() => setShowBreakInfo(false)}>
                <X size={16} color="#c4a0ae" />
              </Pressable>
            </View>
            <Text className="font-rounded text-sm text-muted-foreground leading-6">
              顧客線上預約時，系統會用「服務時長 + 這裡設定的休息分鐘數」來判斷這個時段還能不能被預約，確保服務完成後有留出足夠的準備／休息時間，才會開放下一個時段給顧客約。
            </Text>
            <View className="bg-background rounded-2xl p-3 gap-1">
              <Text className="font-rounded text-xs text-muted-foreground">舉例：服務 60 分鐘、休息 30 分鐘</Text>
              <Text className="font-rounded text-sm text-foreground">顧客約 14:00 → 佔用到 15:30，下一位顧客最早只能約 15:30</Text>
            </View>
            <Text className="font-rounded text-xs text-muted-foreground">
              設成 0 代表不留休息時間，服務一結束下一個時段就能立刻被預約。
            </Text>
            <Pressable
              className="bg-primary rounded-2xl items-center justify-center mt-1"
              style={{ height: 44 }}
              onPress={() => setShowBreakInfo(false)}
            >
              <Text className="font-rounded text-sm font-semibold text-white">知道了</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
