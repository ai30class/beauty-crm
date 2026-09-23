import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, Alert
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Clock, Camera, ImageIcon, X, Package, Plus, Trash2 } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import * as ImagePicker from 'expo-image-picker';
import { uploadClientPhoto } from '@/lib/clientPhotos';
import { PAYMENT_META } from '@/lib/payments';
import type { PaymentMethod } from '@/lib/payments';
import {
  createServiceRecord, getCustomerById, removeClientPhotos,
  getServiceTemplates, getPackagesByCustomer, usePackageSession, usePackageAmount,
  getProducts, deductProductStock, createProductUsageBatch,
  getOnlineOrderById, updateOnlineOrderStatus, getCustomerByPhone, getStaffForPicker,
  getShopProfile,
} from '@/db/api';
import type { ServiceTemplate, Product, StaffRosterEntry } from '@/types/types';

export default function NewServiceRecordScreen() {
  const { customerId: customerIdParam, templateId, onlineOrderId } =
    useLocalSearchParams<{ customerId?: string; templateId?: string; onlineOrderId?: string }>();
  const router = useRouter();

  // resolvedCustomerId 可能來自 URL param 或線上訂單查詢結果
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | undefined>(customerIdParam);
  const [customerName, setCustomerName] = useState('');
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [serviceName, setServiceName] = useState('');
  // 點快速選擇的服務項目時記住是哪一筆（migration 00091）：存檔要記 service_template_id／category
  // 才能拆分月報表；使用者手動打字改掉服務名稱時清空，因為那已經不是原本選的那個項目了
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [serviceDate, setServiceDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');

  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);
  const [beforeAsset, setBeforeAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [afterAsset, setAfterAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  // 線上預約已收的訂金：結帳時自動抵扣，只收尾款（訂金屬於服務總額的一部分）
  const [paidDeposit, setPaidDeposit] = useState(0);
  const [depositMethod, setDepositMethod] = useState<'bank_transfer' | 'line_pay'>('bank_transfer');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [activePackages, setActivePackages] = useState<import('@/types/types').ServicePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  // 多人協作分帳：兩位人員一起完成同一筆服務時，依比例拆分營收＋抽成
  const [showCoStaff, setShowCoStaff] = useState(false);
  const [coStaffId, setCoStaffId] = useState<string>('');
  const [staffSharePercent, setStaffSharePercent] = useState('50');
  const [coStaffSharePercent, setCoStaffSharePercent] = useState('50');

  // 保養品明細
  const [products, setProducts] = useState<Product[]>([]);
  const [usageItems, setUsageItems] = useState<{ product_id: string; quantity: number }[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // 僅在線上訂單流程時使用，用來最後更新訂單狀態
  const [linkedOnlineOrderId, setLinkedOnlineOrderId] = useState<string | undefined>(onlineOrderId);

  useEffect(() => {
    (async () => {
      // 若帶入 onlineOrderId，先解析線上訂單資料
      let effectiveCustomerId = customerIdParam;
      if (onlineOrderId) {
        try {
          const order = await getOnlineOrderById(onlineOrderId);
          if (order) {
            setLinkedOnlineOrderId(order.id);
            // 自動填入服務名稱與金額
            setServiceName(order.service_name);
            setAmount(String(order.total_amount));
            // 已收訂金（需訂金的預約，顧客付完、店家確認後）：結帳時抵扣
            if (order.booking_mode === 'deposit' && (order.status === 'paid' || order.status === 'confirmed')) {
              setPaidDeposit(Number(order.deposit_amount ?? 0));
              setDepositMethod(order.line_pay_transaction_id ? 'line_pay' : 'bank_transfer');
            }
            // 設定服務日期為預約日期
            setServiceDate(new Date(order.appointment_time));
            // 優先使用 customer_id（線上預約時已 upsert 建檔）
            if (order.customer_id) {
              effectiveCustomerId = order.customer_id;
              setResolvedCustomerId(order.customer_id);
              setCustomerName(order.customer_name);
            } else if (order.customer_phone) {
              // fallback：舊資料無 customer_id，仍嘗試電話查詢
              const customer = await getCustomerByPhone(order.customer_phone);
              if (customer) {
                effectiveCustomerId = customer.id;
                setResolvedCustomerId(customer.id);
                setCustomerName(customer.name);
              } else {
                setCustomerName(`${order.customer_name}（線上預約）`);
              }
            }
          }
        } catch {
          // 解析失敗不阻擋流程
        }
      }

      const [c, tpls] = await Promise.all([
        effectiveCustomerId && !onlineOrderId ? getCustomerById(effectiveCustomerId) : Promise.resolve(null),
        getServiceTemplates(),
      ]);
      if (c) setCustomerName(c.name);
      setTemplates(tpls);
      // 帶入快捷模板
      if (templateId && tpls.length > 0) {
        const tpl = tpls.find(t => t.id === templateId);
        if (tpl) {
          setServiceName(tpl.name);
          setAmount(String(tpl.default_amount));
        }
      }
      // 載入顧客有效套票
      if (effectiveCustomerId) {
        const pkgs = await getPackagesByCustomer(effectiveCustomerId);
        setActivePackages(pkgs.filter(p => p.is_active));
      }
      // 載入保養品列表
      const prods = await getProducts();
      setProducts(prods);
      // 載入服務人員列表
      const staff = await getStaffForPicker();
      setStaffList(staff);
      // 施術前後照片是進階版功能，逐店開關（見 migration 00097）
      const profile = await getShopProfile();
      setPhotosEnabled(profile?.service_photos_enabled ?? false);
    })();
  }, [customerIdParam, templateId, onlineOrderId]);

  const pickPhoto = async (type: 'before' | 'after', source: 'camera' | 'gallery') => {
    if (!photosEnabled) {
      Alert.alert('進階版功能', '服務記錄施術前後照片是進階版功能，如需使用請聯繫我們升級方案。');
      return;
    }
    let asset: ImagePicker.ImagePickerAsset | undefined;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { setPermissionDenied(true); return; }
      const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
      if (!r.canceled) asset = r.assets[0];
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { setPermissionDenied(true); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
      if (!r.canceled) asset = r.assets[0];
    }
    if (!asset) return;
    if (type === 'before') { setBeforeUri(asset.uri); setBeforeAsset(asset); }
    else { setAfterUri(asset.uri); setAfterAsset(asset); }
  };

  // 快速選擇服務的類別分頁：沿用「服務項目管理」設好的分類（沒設分類的歸「未分類」）；只有一種類別時不顯示分頁
  const templateCategories = ['全部', ...Array.from(new Set(templates.map(t => t.category.trim() || '未分類')))];
  const activeCategory = templateCategories.includes(selectedCategory) ? selectedCategory : '全部';
  const visibleTemplates = activeCategory === '全部'
    ? templates
    : templates.filter(t => (t.category.trim() || '未分類') === activeCategory);

  const handleSave = async () => {
    setError('');
    if (!serviceName.trim()) { setError('請輸入服務項目'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { setError('請輸入有效金額'); return; }
    if (!resolvedCustomerId) { setError('缺少顧客資料'); return; }
    if (paymentMethod === 'package' && !selectedPackageId) { setError('請選擇要使用的套票'); return; }
    const sharePercent = parseFloat(staffSharePercent);
    const coSharePercent = parseFloat(coStaffSharePercent);
    if (coStaffId) {
      if (isNaN(sharePercent) || sharePercent <= 0 || sharePercent >= 100) {
        setError('主要人員實拿% 請輸入 1–99 之間的數字');
        return;
      }
      if (isNaN(coSharePercent) || coSharePercent <= 0 || coSharePercent >= 100) {
        setError('協作人員實拿% 請輸入 1–99 之間的數字');
        return;
      }
      if (sharePercent + coSharePercent > 100) {
        setError('兩人實拿% 相加不能超過 100%');
        return;
      }
    }
    // 訂金不會超過服務總額；用套票扣款時不處理訂金
    const effectiveDeposit = paymentMethod === 'package' ? 0 : Math.min(paidDeposit, amt);
    setLoading(true);
    // 照片先上傳：任何一張失敗就整個停下來（並清掉已傳的那張），還沒建立任何記錄，可以直接重按儲存
    let bPath: string | null = null;
    let aPath: string | null = null;
    if (beforeAsset || afterAsset) {
      const [b, a] = await Promise.allSettled([
        beforeAsset ? uploadClientPhoto(beforeAsset) : Promise.resolve(null),
        afterAsset ? uploadClientPhoto(afterAsset) : Promise.resolve(null),
      ]);
      bPath = b.status === 'fulfilled' ? b.value : null;
      aPath = a.status === 'fulfilled' ? a.value : null;
      const failed = b.status === 'rejected' ? b : a.status === 'rejected' ? a : null;
      if (failed) {
        await removeClientPhotos([bPath, aPath]);
        setError(`照片上傳失敗，記錄還沒有儲存，請再按一次儲存：${(failed.reason as any)?.message ?? '請稍後再試'}`);
        setLoading(false);
        return;
      }
    }
    let recordCreated = false;
    try {
      const y = serviceDate.getFullYear();
      const m = String(serviceDate.getMonth() + 1).padStart(2, '0');
      const d = String(serviceDate.getDate()).padStart(2, '0');
      const record = await createServiceRecord({
        customer_id: resolvedCustomerId,
        service_name: serviceName.trim(),
        amount: paymentMethod === 'package' ? 0 : amt,
        deposit_amount: effectiveDeposit,
        deposit_method: effectiveDeposit > 0 ? depositMethod : null,
        service_date: `${y}-${m}-${d}`,
        notes: notes.trim() || null,
        before_photo_path: bPath,
        after_photo_path: aPath,
        payment_method: paymentMethod,
        package_id: paymentMethod === 'package' ? selectedPackageId : null,
        status: 'completed',
        staff_id: selectedStaffId || null,
        co_staff_id: (selectedStaffId && coStaffId) ? coStaffId : null,
        staff_share_percent: (selectedStaffId && coStaffId) ? sharePercent : null,
        co_staff_share_percent: (selectedStaffId && coStaffId) ? coSharePercent : null,
        // 記下選的是哪個服務項目、當時的分類（migration 00091），月報表按分類統計要靠這個；
        // 自由輸入（沒點快速選擇）就是空的，跟決定 8「類別分頁只做篩選」的舊行為一致，不強迫分類
        service_template_id: selectedTemplateId,
        category: selectedTemplateId ? (templates.find(t => t.id === selectedTemplateId)?.category ?? null) : null,
      });
      recordCreated = true;
      // 套票扣款
      if (paymentMethod === 'package' && selectedPackageId) {
        const pkg = activePackages.find(p => p.id === selectedPackageId);
        if (pkg?.package_type === 'session') {
          await usePackageSession(selectedPackageId, 1, `${serviceName.trim()} - ${y}-${m}-${d}`);
        } else if (pkg?.package_type === 'stored_value') {
          await usePackageAmount(selectedPackageId, amt, `${serviceName.trim()} - ${y}-${m}-${d}`);
        }
      }
      // 保養品扣庫 + 寫入明細（帶入 sell_price 快照）
      const stockWarnings: string[] = [];
      if (usageItems.length > 0) {
        for (const item of usageItems) {
          const actual = await deductProductStock(item.product_id, item.quantity);
          if (actual < item.quantity) {
            const p = products.find(x => x.id === item.product_id);
            stockWarnings.push(`${p?.name ?? '品項'} 庫存不足，已扣減 ${actual} 件`);
          }
        }
        const itemsWithPrice = usageItems.map(item => {
          const p = products.find(x => x.id === item.product_id);
          return { ...item, sell_price: p?.sell_price ?? 0 };
        });
        await createProductUsageBatch(record.id, itemsWithPrice);
      }
      // 線上訂單：儲存後同步更新狀態為 completed
      if (linkedOnlineOrderId) {
        await updateOnlineOrderStatus(linkedOnlineOrderId, 'completed');
      }
      // 直接用網址進來（沒有上一頁）時 router.back() 不會有反應，改回該顧客的頁面
      const leaveScreen = () => {
        if (router.canGoBack()) router.back();
        else router.replace(`/(app)/customers/${resolvedCustomerId}` as any);
      };
      if (stockWarnings.length > 0) {
        setError(`記錄已儲存，但注意：${stockWarnings.join('；')}`);
        setLoading(false);
        setTimeout(leaveScreen, 2500);
      } else {
        setLoading(false);
        leaveScreen();
      }
    } catch (e: any) {
      // 記錄沒建起來，但照片已經傳了：把照片刪掉，不留孤兒檔
      if (!recordCreated) await removeClientPhotos([bPath, aPath]);
      setError(e.message ?? '儲存失敗');
      setLoading(false);
    }
  };

  const PhotoSlot = ({ label, uri, onCamera, onGallery, onRemove }: {
    label: string; uri: string | null;
    onCamera: () => void; onGallery: () => void; onRemove: () => void;
  }) => (
    <View className="flex-1">
      <Text className="font-rounded text-xs text-muted-foreground mb-1.5 text-center">{label}</Text>
      {uri ? (
        <View className="rounded-2xl overflow-hidden" style={{ aspectRatio: 1 }}>
          <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
          <Pressable className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 items-center justify-center" onPress={onRemove}>
            <X size={12} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View className="rounded-2xl border-2 border-dashed border-border bg-muted/40 items-center justify-center gap-3 py-6" style={{ aspectRatio: 1 }}>
          <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={onCamera}>
            <Camera size={16} color="#e8789a" />
            <Text className="font-rounded text-xs text-primary">拍照</Text>
          </Pressable>
          <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={onGallery}>
            <ImageIcon size={16} color="#a8d5ba" />
            <Text className="font-rounded text-xs" style={{ color: '#a8d5ba' }}>相簿</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">新增服務記錄</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">顧客</Text>
          <View className="bg-muted border border-border rounded-2xl px-4 justify-center" style={{ height: 52 }}>
            <Text className="font-rounded text-base text-muted-foreground">{customerName || '—'}</Text>
          </View>
          {linkedOnlineOrderId && (
            <Text className="font-rounded text-xs mt-1" style={{ color: '#4a6cf7' }}>
              ✦ 線上預約訂單，完成後將自動更新訂單狀態
            </Text>
          )}
        </View>

        {templates.length > 0 && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">快速選擇服務</Text>
            {templateCategories.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-2">
                <View className="flex-row gap-2 px-1 pb-1">
                  {templateCategories.map(c => (
                    <Pressable
                      key={c}
                      className="px-4 py-1.5 rounded-full active:opacity-70"
                      style={{ backgroundColor: activeCategory === c ? '#e8789a' : '#fce9f0' }}
                      onPress={() => setSelectedCategory(c)}
                    >
                      <Text className="font-rounded text-sm font-medium" style={{ color: activeCategory === c ? '#fff' : '#e8789a' }}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                {visibleTemplates.map(tpl => (
                  <Pressable key={tpl.id} className="rounded-xl px-3 py-2 active:opacity-70"
                    style={{ backgroundColor: tpl.color + '22', borderWidth: 1.5, borderColor: serviceName === tpl.name ? tpl.color : tpl.color + '44' }}
                    onPress={() => { setServiceName(tpl.name); setAmount(String(tpl.default_amount)); setSelectedTemplateId(tpl.id); }}>
                    <Text className="font-rounded text-sm font-medium" style={{ color: tpl.color }}>{tpl.name}</Text>
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Clock size={9} color={tpl.color} />
                      <Text className="font-rounded text-xs" style={{ color: tpl.color + 'cc' }}>{tpl.duration_minutes}分</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務項目 *</Text>
          <TextInput className="bg-card border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
            style={{ height: 52 }} placeholder="例：剪髮、染髮、護膚..." placeholderTextColor="#c4a0ae"
            value={serviceName} onChangeText={t => { setServiceName(t); setSelectedTemplateId(null); }} />
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務金額 *</Text>
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
            <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
            <TextInput className="flex-1 font-rounded text-base text-foreground" placeholder="0"
              placeholderTextColor="#c4a0ae" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          </View>
          {paidDeposit > 0 && (() => {
            const total = parseFloat(amount) || 0;
            const dep = paymentMethod === 'package' ? 0 : Math.min(paidDeposit, total);
            return (
              <View className="mt-2 rounded-2xl px-4 py-3 gap-1" style={{ backgroundColor: '#fff8e0', borderWidth: 1, borderColor: '#f5d87a' }}>
                <View className="flex-row items-center justify-between">
                  <Text className="font-rounded text-sm" style={{ color: '#9a6400' }}>
                    已收訂金（{depositMethod === 'line_pay' ? 'LINE Pay' : '銀行轉帳'}）
                  </Text>
                  <Text className="font-rounded text-sm font-bold" style={{ color: '#9a6400' }}>
                    {paymentMethod === 'package' ? '不帶入' : `− $${dep.toLocaleString()}`}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-rounded text-sm font-semibold" style={{ color: '#9a6400' }}>現場應收尾款</Text>
                  <Text className="font-rounded text-base font-bold" style={{ color: '#9a6400' }}>${Math.max(total - dep, 0).toLocaleString()}</Text>
                </View>
                {paymentMethod === 'package' && (
                  <Text className="font-rounded text-xs" style={{ color: '#9a6400' }}>選擇套票扣款時，這筆訂金不會帶入報表，請另外處理（例如退還）。</Text>
                )}
              </View>
            );
          })()}
        </View>

        {staffList.length > 0 && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-2">服務人員（選填）</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                {staffList.map(s => {
                  const isSelected = selectedStaffId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      className="rounded-xl px-3 py-2 active:opacity-70"
                      style={{
                        backgroundColor: isSelected ? s.color + '22' : '#fafafa',
                        borderWidth: 1.5,
                        borderColor: isSelected ? s.color : '#e8dce8',
                      }}
                      onPress={() => {
                        const next = isSelected ? '' : s.id;
                        setSelectedStaffId(next);
                        if (!next || next === coStaffId) { setShowCoStaff(false); setCoStaffId(''); }
                      }}
                    >
                      <Text className="font-rounded text-sm font-medium" style={{ color: isSelected ? s.color : '#b0a0b0' }}>
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* 多人協作分帳：兩位人員一起做同一筆服務時，依比例拆分營收與抽成 */}
        {selectedStaffId && staffList.length > 1 && (
          <View>
            {!showCoStaff ? (
              <Pressable
                className="flex-row items-center gap-1.5 self-start active:opacity-70"
                onPress={() => { setShowCoStaff(true); const first = staffList.find(s => s.id !== selectedStaffId); if (first) setCoStaffId(first.id); }}
              >
                <Plus size={14} color="#e8789a" />
                <Text className="font-rounded text-sm font-semibold text-primary">加入第二位協作人員（拆分實拿金額）</Text>
              </Pressable>
            ) : (
              <View className="bg-card border border-border rounded-2xl p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-rounded text-sm font-medium text-foreground">協作人員</Text>
                  <Pressable onPress={() => { setShowCoStaff(false); setCoStaffId(''); }}>
                    <Text className="font-rounded text-xs text-muted-foreground">移除</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {staffList.filter(s => s.id !== selectedStaffId).map(s => {
                    const isSelected = coStaffId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        className="rounded-xl px-3 py-2 active:opacity-70"
                        style={{
                          backgroundColor: isSelected ? s.color + '22' : '#fafafa',
                          borderWidth: 1.5,
                          borderColor: isSelected ? s.color : '#e8dce8',
                        }}
                        onPress={() => setCoStaffId(s.id)}
                      >
                        <Text className="font-rounded text-sm font-medium" style={{ color: isSelected ? s.color : '#b0a0b0' }}>
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View className="gap-3">
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground mb-1.5">
                      {staffList.find(s => s.id === selectedStaffId)?.name ?? '主要人員'} 實拿 %（直接輸入實拿金額佔比，不透過抽成率計算）
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        className="bg-background border border-border rounded-xl px-3 font-rounded text-base text-foreground w-20 text-center"
                        style={{ height: 44 }}
                        value={staffSharePercent}
                        onChangeText={setStaffSharePercent}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                      <Text className="font-rounded text-sm text-muted-foreground">%</Text>
                    </View>
                  </View>
                  <View>
                    <Text className="font-rounded text-xs text-muted-foreground mb-1.5">
                      {staffList.find(s => s.id === coStaffId)?.name ?? '協作人員'} 實拿 %
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        className="bg-background border border-border rounded-xl px-3 font-rounded text-base text-foreground w-20 text-center"
                        style={{ height: 44 }}
                        value={coStaffSharePercent}
                        onChangeText={setCoStaffSharePercent}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                      <Text className="font-rounded text-sm text-muted-foreground">%</Text>
                    </View>
                  </View>
                  <Text className="font-rounded text-xs text-muted-foreground">
                    店家實拿 {Math.max(0, 100 - (parseFloat(staffSharePercent) || 0) - (parseFloat(coStaffSharePercent) || 0))}%
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">
            {paidDeposit > 0 && paymentMethod !== 'package' ? '尾款付款方式 *' : '付款方式 *'}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(['cash', 'card', 'bank_transfer', 'line_pay', 'mobile_pay', 'package'] as PaymentMethod[]).map(key => ({ key, label: PAYMENT_META[key].label, color: PAYMENT_META[key].color })).map(opt => (
              <Pressable
                key={opt.key}
                className="rounded-xl py-2.5 items-center border active:opacity-70"
                style={{
                  width: '47%',
                  backgroundColor: paymentMethod === opt.key ? opt.color + '22' : '#fafafa',
                  borderColor: paymentMethod === opt.key ? opt.color : '#e8dce8',
                }}
                onPress={() => { setPaymentMethod(opt.key); setSelectedPackageId(''); }}
              >
                <Text className="font-rounded text-sm font-semibold" style={{ color: paymentMethod === opt.key ? opt.color : '#b0a0b0' }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* 套票選擇列表 */}
          {paymentMethod === 'package' && (
            <View className="mt-3 gap-2">
              {activePackages.length === 0 ? (
                <View className="bg-muted/40 rounded-2xl px-4 py-3">
                  <Text className="font-rounded text-sm text-muted-foreground text-center">此顧客尚無有效套票</Text>
                </View>
              ) : (
                activePackages.map(pkg => {
                  const isSelected = selectedPackageId === pkg.id;
                  const info = pkg.package_type === 'session'
                    ? `剩 ${(pkg.total_sessions ?? 0) - pkg.used_sessions} 次`
                    : `餘額 $${Number(pkg.remaining_amount ?? 0).toLocaleString()}`;
                  return (
                    <Pressable
                      key={pkg.id}
                      className="flex-row items-center justify-between rounded-2xl px-4 py-3 border active:opacity-80"
                      style={{
                        borderColor: isSelected ? '#e8789a' : '#f0dde5',
                        backgroundColor: isSelected ? '#fce9f0' : '#fff',
                      }}
                      onPress={() => setSelectedPackageId(pkg.id)}
                    >
                      <View className="flex-1">
                        <Text className="font-rounded text-sm font-semibold text-foreground">{pkg.name}</Text>
                        <Text className="font-rounded text-xs text-muted-foreground mt-0.5">
                          {pkg.package_type === 'session' ? '次數套票' : '儲值卡'}
                        </Text>
                      </View>
                      <Text className="font-rounded text-sm font-bold" style={{ color: isSelected ? '#e8789a' : '#c4a0ae' }}>{info}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          )}
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務日期</Text>          <Pressable className="bg-card border border-border rounded-2xl px-4 items-start justify-center active:opacity-80"
            style={{ height: 52 }} onPress={() => setShowDatePicker(!showDatePicker)}>
            <Text className="font-rounded text-base text-foreground">
              {serviceDate.getFullYear()}-{String(serviceDate.getMonth()+1).padStart(2,'0')}-{String(serviceDate.getDate()).padStart(2,'0')}
            </Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw" mode="single" date={serviceDate}
                onChange={(p) => { if (p.date) setServiceDate(p.date as Date); setShowDatePicker(false); }} />
            </View>
          )}
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">施術前後照片（選填）</Text>
          <View className="flex-row gap-3">
            <PhotoSlot label="施術前" uri={beforeUri}
              onCamera={() => pickPhoto('before', 'camera')}
              onGallery={() => pickPhoto('before', 'gallery')}
              onRemove={() => { setBeforeUri(null); setBeforeAsset(null); }} />
            <PhotoSlot label="施術後" uri={afterUri}
              onCamera={() => pickPhoto('after', 'camera')}
              onGallery={() => pickPhoto('after', 'gallery')}
              onRemove={() => { setAfterUri(null); setAfterAsset(null); }} />
          </View>
          {permissionDenied && (
            <Text className="font-rounded text-xs text-destructive mt-1">需要相機或相簿權限，請在設定中開啟</Text>
          )}
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">備註</Text>
          <TextInput className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
            placeholder="備註（選填）" placeholderTextColor="#c4a0ae" value={notes} onChangeText={setNotes}
            multiline numberOfLines={3} textAlignVertical="top" />
        </View>

        {/* 保養品使用明細 */}
        {products.length > 0 && (
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="font-rounded text-sm font-medium text-foreground">保養品使用明細（選填）</Text>
              <Pressable
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl active:opacity-70"
                style={{ backgroundColor: '#fce9f0' }}
                onPress={() => setShowProductPicker(!showProductPicker)}
              >
                <Plus size={12} color="#e8789a" />
                <Text className="font-rounded text-xs font-semibold text-primary">新增品項</Text>
              </Pressable>
            </View>

            {/* 品項選擇器 */}
            {showProductPicker && (
              <View className="bg-card border border-border rounded-2xl overflow-hidden mb-2">
                {products
                  .filter(p => !usageItems.some(u => u.product_id === p.id))
                  .map((p, i) => (
                    <Pressable
                      key={p.id}
                      className={`px-4 py-3 active:bg-muted flex-row items-center justify-between ${i > 0 ? 'border-t border-border' : ''}`}
                      onPress={() => {
                        setUsageItems(prev => [...prev, { product_id: p.id, quantity: 1 }]);
                        setShowProductPicker(false);
                      }}
                    >
                      <View>
                        <Text className="font-rounded text-sm font-semibold text-foreground">{p.name}</Text>
                        <Text className="font-rounded text-xs text-muted-foreground">{p.spec || '—'} · 庫存 {p.stock}</Text>
                      </View>
                      <Plus size={16} color="#e8789a" />
                    </Pressable>
                  ))}
                {products.filter(p => !usageItems.some(u => u.product_id === p.id)).length === 0 && (
                  <View className="px-4 py-3">
                    <Text className="font-rounded text-sm text-muted-foreground text-center">所有品項已加入</Text>
                  </View>
                )}
              </View>
            )}

            {/* 已選品項列表 */}
            {usageItems.length > 0 && (
              <View className="gap-2">
                {usageItems.map((item) => {
                  const p = products.find(x => x.id === item.product_id);
                  const lineTotal = (p?.sell_price ?? 0) * item.quantity;
                  return (
                    <View
                      key={item.product_id}
                      className="flex-row items-center bg-card border border-border rounded-2xl px-4 gap-3"
                      style={{ height: 60 }}
                    >
                      <Package size={16} color="#e8789a" />
                      <View className="flex-1">
                        <Text className="font-rounded text-sm font-semibold text-foreground" numberOfLines={1}>
                          {p?.name ?? '—'}
                        </Text>
                        <Text className="font-rounded text-xs text-muted-foreground">
                          售價 ${p?.sell_price ?? 0} ·{' '}
                          <Text style={{ color: '#5dc0a0' }}>小計 ${lineTotal.toLocaleString()}</Text>
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          className="w-7 h-7 rounded-lg items-center justify-center active:opacity-70"
                          style={{ backgroundColor: '#f5eaef' }}
                          onPress={() =>
                            setUsageItems(prev =>
                              prev.map(u => u.product_id === item.product_id
                                ? { ...u, quantity: Math.max(1, u.quantity - 1) }
                                : u
                              )
                            )
                          }
                        >
                          <Text className="font-rounded text-base font-bold text-primary">−</Text>
                        </Pressable>
                        <Text className="font-rounded text-sm font-bold text-foreground w-6 text-center">{item.quantity}</Text>
                        <Pressable
                          className="w-7 h-7 rounded-lg items-center justify-center active:opacity-70"
                          style={{ backgroundColor: '#fce9f0' }}
                          onPress={() =>
                            setUsageItems(prev =>
                              prev.map(u => u.product_id === item.product_id
                                ? { ...u, quantity: u.quantity + 1 }
                                : u
                              )
                            )
                          }
                        >
                          <Text className="font-rounded text-base font-bold text-primary">＋</Text>
                        </Pressable>
                        <Pressable
                          className="w-7 h-7 rounded-lg items-center justify-center active:opacity-70 ml-1"
                          style={{ backgroundColor: '#fce9f0' }}
                          onPress={() => setUsageItems(prev => prev.filter(u => u.product_id !== item.product_id))}
                        >
                          <Trash2 size={13} color="#e85454" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                {/* 保養品總計 */}
                <View className="flex-row justify-between items-center px-2 py-1">
                  <Text className="font-rounded text-xs text-muted-foreground">保養品小計</Text>
                  <Text className="font-rounded text-sm font-bold" style={{ color: '#5dc0a0' }}>
                    ${usageItems.reduce((sum, item) => {
                      const p = products.find(x => x.id === item.product_id);
                      return sum + (p?.sell_price ?? 0) * item.quantity;
                    }, 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }} onPress={handleSave} disabled={loading}>
          {loading
            ? <View className="flex-row items-center gap-2"><ActivityIndicator color="#fff" /><Text className="font-rounded text-white text-base">上傳中...</Text></View>
            : <Text className="font-rounded text-white text-base font-semibold">儲存記錄</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
