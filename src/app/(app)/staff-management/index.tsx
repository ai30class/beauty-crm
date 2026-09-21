import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Switch, Modal
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, User2, Camera, Layers, KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readUriAsArrayBuffer } from '@/lib/clientPhotos';
import { supabase } from '@/client/supabase';
import { getStaff, createStaff, updateStaff, deleteStaff, getPhotoUrl, getStaffWithLoginAccounts, createStaffAccount } from '@/db/api';
import type { Staff } from '@/types/types';

const COLORS = ['#e8789a', '#8b9de8', '#5dc0a0', '#e8a87c', '#c49de8', '#e8d47c', '#7cbde8'];

// 跟施術前後照片共用同一個 Storage bucket——用不同的路徑前綴區分，不用另外
// 開一個新 bucket、多一份 migration 跟權限設定
const BUCKET = 'appd2yss59nidj5_service_photos';

async function compressAndUploadAvatar(uri: string, mimeType?: string, width?: number): Promise<string> {
  const isPng = mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = (width && width > 500) ? [{ resize: { width: 500 } }] : [];
  const compressed = await manipulateAsync(uri, actions, { compress: isPng ? 1 : 0.85, format });
  const ext = isPng ? 'png' : 'jpg';
  const path = `staff-avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const body = await readUriAsArrayBuffer(compressed.uri);
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: isPng ? 'image/png' : 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  return path;
}

export default function StaffManagementScreen() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newCommissionRate, setNewCommissionRate] = useState('');
  const [newBaseSalary, setNewBaseSalary] = useState('');
  const [newBio, setNewBio] = useState('');
  const [newAvatarAsset, setNewAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editCommissionRate, setEditCommissionRate] = useState('');
  const [editBaseSalary, setEditBaseSalary] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
  const [editAvatarAsset, setEditAvatarAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [editCanViewCustomers, setEditCanViewCustomers] = useState(false);
  const [editCanManagePricing, setEditCanManagePricing] = useState(false);
  const [editCanManageShopSettings, setEditCanManageShopSettings] = useState(false);
  const [editCanCompleteOnlineOrders, setEditCanCompleteOnlineOrders] = useState(false);

  // 員工登入帳號：哪些人已經建過了（不能重複邀請）、邀請表單的 email 草稿／
  // 狀態，用 staffId 當 key，因為同一頁可能好幾個人都在編輯狀態
  const [staffWithLogin, setStaffWithLogin] = useState<Set<string>>(new Set());
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<Record<string, string>>({});
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());

  const pickAvatar = async (target: 'new' | 'edit') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('需要相簿存取權限才能上傳照片'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (r.canceled) return;
    const asset = r.assets[0];
    if (target === 'new') setNewAvatarAsset(asset);
    else setEditAvatarAsset(asset);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, withLogin] = await Promise.all([getStaff(), getStaffWithLoginAccounts()]);
      setStaff(list);
      setStaffWithLogin(new Set(withLogin));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError('');
    if (!newName.trim()) { setError('請輸入姓名'); return; }
    const rate = newCommissionRate.trim() ? Number(newCommissionRate) : 0;
    if (Number.isNaN(rate) || rate < 0 || rate > 100) { setError('抽成比例請輸入 0–100 之間的數字'); return; }
    const baseSalary = newBaseSalary.trim() ? Number(newBaseSalary) : 0;
    if (Number.isNaN(baseSalary) || baseSalary < 0) { setError('底薪請輸入 0 以上的數字'); return; }
    setSaving(true);
    try {
      const avatarPath = newAvatarAsset
        ? await compressAndUploadAvatar(newAvatarAsset.uri, newAvatarAsset.mimeType ?? undefined, newAvatarAsset.width ?? undefined)
        : null;
      await createStaff({
        name: newName.trim(), role: 'therapist', color: newColor, is_active: true, commission_rate: rate, base_salary: baseSalary, bio: newBio.trim() || null, avatar_url: avatarPath,
        // 新員工預設沒有任何登入帳號權限開關（跟還沒建立登入帳號無關，這是獨立的預設值）
        can_view_customers: false, can_manage_pricing: false, can_manage_shop_settings: false, can_complete_online_orders: false,
      });
      setNewName(''); setNewCommissionRate(''); setNewBaseSalary(''); setNewBio(''); setNewAvatarAsset(null); setShowAdd(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const rate = editCommissionRate.trim() ? Number(editCommissionRate) : 0;
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return;
    const baseSalary = editBaseSalary.trim() ? Number(editBaseSalary) : 0;
    if (Number.isNaN(baseSalary) || baseSalary < 0) return;
    const avatarPath = editAvatarAsset
      ? await compressAndUploadAvatar(editAvatarAsset.uri, editAvatarAsset.mimeType ?? undefined, editAvatarAsset.width ?? undefined)
      : editAvatarUrl;
    await updateStaff(id, {
      name: editName.trim(), color: editColor, commission_rate: rate, base_salary: baseSalary,
      bio: editBio.trim() || null, avatar_url: avatarPath,
      can_view_customers: editCanViewCustomers,
      can_manage_pricing: editCanManagePricing,
      can_manage_shop_settings: editCanManageShopSettings,
      can_complete_online_orders: editCanCompleteOnlineOrders,
    });
    setEditId(null); setEditAvatarAsset(null); load();
  };

  const handleInvite = async (s: Staff) => {
    const email = (inviteEmail[s.id] ?? '').trim();
    if (!email) { setInviteError(prev => ({ ...prev, [s.id]: '請輸入電子郵件' })); return; }
    setInviteError(prev => ({ ...prev, [s.id]: '' }));
    setInvitingId(s.id);
    try {
      await createStaffAccount(email, s.id);
      setInviteSent(prev => new Set(prev).add(s.id));
      setStaffWithLogin(prev => new Set(prev).add(s.id));
    } catch (e: any) {
      setInviteError(prev => ({ ...prev, [s.id]: e.message }));
    } finally {
      setInvitingId(null);
    }
  };

  const handleToggleActive = async (s: Staff) => {
    await updateStaff(s.id, { is_active: !s.is_active });
    load();
  };

  // 刪除人員會連帶刪掉他的休假與預留時間、無法復原，所以先跳確認視窗（做法同公休日管理）
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingStaff, setDeletingStaff] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deletingStaff) return;
    setDeleteError('');
    setDeletingStaff(true);
    try {
      await deleteStaff(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      setDeleteError(e?.message ?? '刪除失敗，請稍後再試');
    } finally {
      setDeletingStaff(false);
    }
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
            <Pressable className="items-center active:opacity-70" onPress={() => pickAvatar('new')}>
              {newAvatarAsset ? (
                <Image source={{ uri: newAvatarAsset.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} />
              ) : (
                <View className="rounded-full items-center justify-center bg-muted" style={{ width: 72, height: 72 }}>
                  <Camera size={22} color="#c4a0ae" />
                </View>
              )}
              <Text className="font-rounded text-xs text-primary mt-1.5">{newAvatarAsset ? '重新選擇照片' : '上傳大頭照（選填）'}</Text>
            </Pressable>
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
              <Text className="font-rounded text-xs text-muted-foreground mb-2">業績抽成比例（%，選填，沒設定階梯抽成時用這個算薪水）</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
                placeholder="例：30"
                placeholderTextColor="#c4a0ae"
                value={newCommissionRate}
                onChangeText={setNewCommissionRate}
                keyboardType="decimal-pad"
              />
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-2">底薪（選填，沒有底薪就留空，薪水完全靠抽成+獎金）</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
                placeholder="例：25000"
                placeholderTextColor="#c4a0ae"
                value={newBaseSalary}
                onChangeText={setNewBaseSalary}
                keyboardType="decimal-pad"
              />
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-2">資歷簡介（選填，顧客線上預約選人員時會看到）</Text>
              <TextInput
                className="bg-background border border-border rounded-xl px-4 py-2.5 font-rounded text-base text-foreground"
                placeholder="例：美睫證照 5 年經驗，擅長韓式霧眉..."
                placeholderTextColor="#c4a0ae"
                value={newBio}
                onChangeText={setNewBio}
                multiline
                numberOfLines={3}
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>
            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
            <View className="flex-row gap-2">
              <Pressable className="flex-1 bg-primary rounded-xl py-2.5 items-center active:opacity-80" onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">確認新增</Text>}
              </Pressable>
              <Pressable className="flex-1 bg-muted rounded-xl py-2.5 items-center active:opacity-70"
                onPress={() => { setShowAdd(false); setNewName(''); setNewCommissionRate(''); setNewBaseSalary(''); setNewBio(''); setNewAvatarAsset(null); setError(''); }}>
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
                  <Pressable className="items-center active:opacity-70" onPress={() => pickAvatar('edit')}>
                    {editAvatarAsset ? (
                      <Image source={{ uri: editAvatarAsset.uri }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                    ) : editAvatarUrl ? (
                      <Image source={{ uri: getPhotoUrl(editAvatarUrl) ?? undefined }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                    ) : (
                      <View className="items-center justify-center bg-muted rounded-full" style={{ width: 72, height: 72 }}>
                        <Camera size={22} color="#c4a0ae" />
                      </View>
                    )}
                    <Text className="font-rounded text-xs text-primary mt-1.5">更換照片</Text>
                  </Pressable>
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
                    <Text className="font-rounded text-xs text-muted-foreground mb-2">業績抽成比例（%，沒設定階梯抽成時用這個算薪水）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 h-10 font-rounded text-base text-foreground"
                      value={editCommissionRate}
                      onChangeText={setEditCommissionRate}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground mb-2">底薪（沒有底薪就留空）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 h-10 font-rounded text-base text-foreground"
                      value={editBaseSalary}
                      onChangeText={setEditBaseSalary}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Pressable
                    className="flex-row items-center gap-1.5 self-start active:opacity-70"
                    onPress={() => router.push(`/(app)/staff-management/commission-tiers/${s.id}` as any)}
                  >
                    <Layers size={14} color="#e8789a" />
                    <Text className="font-rounded text-sm font-semibold text-primary">設定階梯抽成（進階，選填）</Text>
                  </Pressable>
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground mb-2">資歷簡介（顧客線上預約選人員時會看到）</Text>
                    <TextInput
                      className="bg-background border border-border rounded-xl px-4 py-2.5 font-rounded text-base text-foreground"
                      value={editBio}
                      onChangeText={setEditBio}
                      multiline
                      numberOfLines={3}
                      style={{ minHeight: 72, textAlignVertical: 'top' }}
                    />
                  </View>
                  {/* 員工登入帳號：權限開關（預設全部關閉，跟排班/自己業績等基本層權限無關，那些不可關）*/}
                  <View className="bg-background rounded-xl p-3 gap-2.5 border border-border">
                    <View className="flex-row items-center gap-1.5">
                      <ShieldCheck size={14} color="#e8789a" />
                      <Text className="font-rounded text-xs font-semibold text-foreground">員工登入帳號權限（預設全部關閉）</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-rounded text-sm text-foreground flex-1 pr-2">可瀏覽完整顧客名單（含電話，不能編輯／刪除——這兩項一律只有你能做）</Text>
                      <Switch value={editCanViewCustomers} onValueChange={setEditCanViewCustomers} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-rounded text-sm text-foreground flex-1 pr-2">可管理服務項目與定價</Text>
                      <Switch value={editCanManagePricing} onValueChange={setEditCanManagePricing} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-rounded text-sm text-foreground flex-1 pr-2">可管理自己的休假與封鎖時段（整家店的營業時間、店休一律只有你能改）</Text>
                      <Switch value={editCanManageShopSettings} onValueChange={setEditCanManageShopSettings} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-rounded text-sm text-foreground flex-1 pr-2">可替全店的線上預約「完成服務並記錄收入」（只有金額、付款方式、備註；套票、保養品、分帳、照片仍由你處理）</Text>
                      <Switch value={editCanCompleteOnlineOrders} onValueChange={setEditCanCompleteOnlineOrders} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
                    </View>
                  </View>

                  {/* 員工登入帳號：建立／已建立狀態 */}
                  <View className="bg-background rounded-xl p-3 gap-2 border border-border">
                    <View className="flex-row items-center gap-1.5">
                      <KeyRound size={14} color="#e8789a" />
                      <Text className="font-rounded text-xs font-semibold text-foreground">員工登入帳號</Text>
                    </View>
                    {staffWithLogin.has(s.id) ? (
                      <Text className="font-rounded text-xs text-muted-foreground">✓ 已建立登入帳號，上面的權限開關改完會立刻生效，不用重新邀請</Text>
                    ) : inviteSent.has(s.id) ? (
                      <Text className="font-rounded text-xs text-muted-foreground">✓ 邀請信已寄出，請 {s.name} 到信箱點連結設定密碼</Text>
                    ) : (
                      <>
                        <Text className="font-rounded text-xs text-muted-foreground">輸入 {s.name} 的電子郵件，寄一封邀請信讓她自己設密碼</Text>
                        <TextInput
                          className="bg-card border border-border rounded-xl px-3 h-9 font-rounded text-sm text-foreground"
                          placeholder="example@mail.com"
                          placeholderTextColor="#c4a0ae"
                          autoCapitalize="none"
                          keyboardType="email-address"
                          value={inviteEmail[s.id] ?? ''}
                          onChangeText={v => setInviteEmail(prev => ({ ...prev, [s.id]: v }))}
                        />
                        {inviteError[s.id] ? <Text className="font-rounded text-xs text-destructive">{inviteError[s.id]}</Text> : null}
                        <Pressable
                          className="bg-primary rounded-xl py-2 items-center active:opacity-80"
                          onPress={() => handleInvite(s)}
                          disabled={invitingId === s.id}
                        >
                          {invitingId === s.id ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">建立登入帳號並寄邀請信</Text>}
                        </Pressable>
                      </>
                    )}
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
                  {s.avatar_url ? (
                    <Image source={{ uri: getPhotoUrl(s.avatar_url) ?? undefined }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                  ) : (
                    <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: s.color + '22' }}>
                      <Text className="font-rounded text-base font-bold" style={{ color: s.color }}>{s.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="font-rounded text-base font-semibold text-foreground">{s.name}</Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <View className="w-2 h-2 rounded-full" style={{ backgroundColor: s.is_active ? '#5dc0a0' : '#c4a0ae' }} />
                      <Text className="font-rounded text-xs text-muted-foreground">
                        {s.is_active ? '服務中' : '暫停服務'}　抽成 {s.commission_rate}%{s.base_salary > 0 ? `　底薪 $${s.base_salary.toLocaleString()}` : ''}
                      </Text>
                    </View>
                    {s.bio ? (
                      <Text className="font-rounded text-xs text-muted-foreground mt-1" numberOfLines={2}>{s.bio}</Text>
                    ) : null}
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
                    onPress={() => {
                      setEditId(s.id); setEditName(s.name); setEditColor(s.color); setEditCommissionRate(String(s.commission_rate)); setEditBaseSalary(String(s.base_salary ?? 0)); setEditBio(s.bio ?? ''); setEditAvatarUrl(s.avatar_url); setEditAvatarAsset(null);
                      setEditCanViewCustomers(s.can_view_customers); setEditCanManagePricing(s.can_manage_pricing); setEditCanManageShopSettings(s.can_manage_shop_settings); setEditCanCompleteOnlineOrders(s.can_complete_online_orders ?? false);
                    }}>
                    <Pencil size={15} color="#c4a0ae" />
                  </Pressable>
                  <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
                    onPress={() => { setDeleteError(''); setDeleteTarget({ id: s.id, name: s.name }); }}>
                    <Trash2 size={15} color="#e85454" />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* 刪除服務人員確認 Modal */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-8"
          onPress={() => { if (!deletingStaff) setDeleteTarget(null); }}
        >
          <Pressable
            className="bg-card w-full rounded-3xl p-6 gap-4"
            onPress={() => {/* 阻止冒泡 */}}
          >
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff0f3' }}>
                <AlertTriangle size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確認刪除服務人員？</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                {deleteTarget ? `「${deleteTarget.name}」` : ''}{'\n'}刪除後，這位人員的休假與預留時間也會一併刪除，無法復原。{'\n'}如果只是暫時不接客，建議按「暫停」就好，可以保留歷史資料。
              </Text>
              {deleteError ? (
                <Text className="font-rounded text-xs text-center" style={{ color: '#e85454' }}>{deleteError}</Text>
              ) : null}
            </View>
            <View className="flex-row gap-3 mt-2">
              <Pressable
                className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                disabled={deletingStaff}
                onPress={() => setDeleteTarget(null)}
              >
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#e85454' }}
                disabled={deletingStaff}
                onPress={handleConfirmDelete}
              >
                {deletingStaff
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
