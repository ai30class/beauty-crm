import { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, TrendingDown, Plus } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { createExpense, getExpensesByMonth, deleteExpense } from '@/db/api';
import type { Expense } from '@/types/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

// 常用支出類別快選
const QUICK_TAGS = ['耗材採購', '場地租金', '水電費', '設備維修', '廣告行銷', '員工薪資', '清潔用品', '其他'];

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewExpenseScreen() {
  const router = useRouter();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 當月已有支出列表（供快速查閱）
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const now = new Date();
    const list = await getExpensesByMonth(now.getFullYear(), now.getMonth() + 1);
    setRecentExpenses(list);
  }, []);

  useFocusEffect(useCallback(() => { (async () => { await loadRecent(); })(); }, [loadRecent]));

  const handleSave = async () => {
    setError(''); setSuccessMsg('');
    if (!description.trim()) { setError('請填寫支出說明'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('請輸入有效金額'); return; }
    setSaving(true);
    try {
      await createExpense({
        description: description.trim(),
        amount: amt,
        expense_date: fmtDate(expenseDate),
      });
      setSuccessMsg(`已記錄 $${amt.toLocaleString()} 支出 ✓`);
      setDescription(''); setAmount('');
      await loadRecent();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteExpense(id);
      await loadRecent();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="flex-row items-center gap-2 flex-1">
          <TrendingDown size={20} color="#e8789a" />
          <Text className="font-rounded text-xl font-bold text-foreground">記錄支出</Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 pb-12 gap-4"
        className="bg-background"
      >
        {/* 說明 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">支出說明 *</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
            style={{ height: 52 }}
            placeholder="例：採購護膚材料、水電費"
            placeholderTextColor="#c4a0ae"
            value={description}
            onChangeText={setDescription}
          />
          {/* 快選標籤 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 -mx-1">
            <View className="flex-row gap-2 px-1">
              {QUICK_TAGS.map(tag => (
                <Pressable
                  key={tag}
                  className="px-3 py-1.5 rounded-full border active:opacity-70"
                  style={{
                    borderColor: description === tag ? '#e8789a' : '#f0dde5',
                    backgroundColor: description === tag ? '#fce9f0' : '#fff',
                  }}
                  onPress={() => setDescription(tag)}
                >
                  <Text className="font-rounded text-xs" style={{ color: description === tag ? '#e8789a' : '#c4a0ae' }}>
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 金額 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">金額 *</Text>
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
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

        {/* 日期 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">支出日期</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowDatePicker(v => !v)}
          >
            <Text className="font-rounded text-base text-foreground">{fmtDate(expenseDate)}</Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw"
                mode="single"
                date={expenseDate}
                onChange={(p) => {
                  if (p.date) setExpenseDate(new Date(p.date as string | Date));
                  setShowDatePicker(false);
                }}
              />
            </View>
          )}
        </View>

        {/* 錯誤 / 成功 */}
        {error ? <Text className="font-rounded text-sm text-destructive">{error}</Text> : null}
        {successMsg ? (
          <View className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <Text className="font-rounded text-sm text-green-700 font-medium">{successMsg}</Text>
          </View>
        ) : null}

        {/* 儲存 */}
        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 flex-row gap-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Plus size={18} color="#fff" />
                <Text className="font-rounded text-white text-base font-semibold">記錄此筆支出</Text>
              </>
          }
        </Pressable>

        {/* 本月支出列表 */}
        {recentExpenses.length > 0 && (
          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
              <Text className="font-rounded text-sm font-semibold text-foreground">本月支出記錄</Text>
              <Text className="font-rounded text-sm font-bold text-destructive">
                合計 ${recentExpenses.reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
              </Text>
            </View>
            {recentExpenses.map((e, i) => (
              <View
                key={e.id}
                className="flex-row items-center px-4 py-3"
                style={{ borderTopWidth: i === 0 ? 1 : 0.5, borderColor: '#f0dde5' }}
              >
                <View className="flex-1">
                  <Text className="font-rounded text-sm text-foreground">{e.description}</Text>
                  <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{e.expense_date}</Text>
                </View>
                <Text className="font-rounded text-sm font-semibold text-destructive mr-3">
                  -${Number(e.amount).toLocaleString()}
                </Text>
                <Pressable
                  className="w-7 h-7 items-center justify-center active:opacity-60"
                  onPress={() => handleDelete(e.id)}
                  disabled={deleting === e.id}
                >
                  {deleting === e.id
                    ? <ActivityIndicator size="small" color="#c4a0ae" />
                    : <Text style={{ color: '#c4a0ae', fontSize: 16 }}>✕</Text>
                  }
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
