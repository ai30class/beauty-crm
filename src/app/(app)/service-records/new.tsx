import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Clock, Camera, ImageIcon, X, Package, Plus, Trash2 } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/client/supabase';
import {
  createServiceRecord, updateServiceRecord, getCustomerById,
  getServiceTemplates, getPackagesByCustomer, usePackageSession, usePackageAmount,
  getProducts, deductProductStock, createProductUsageBatch,
  getOnlineOrderById, updateOnlineOrderStatus, getCustomerByPhone,
} from '@/db/api';
import type { ServiceTemplate, Product } from '@/types/types';

const BUCKET = 'appd2yss59nidj5_service_photos';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes.buffer;
}

async function compressAndUpload(uri: string, mimeType?: string, width?: number): Promise<string> {
  const isPng = mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = (width && width > 1080) ? [{ resize: { width: 1080 } }] : [];
  const compressed = await manipulateAsync(uri, actions, { compress: isPng ? 1 : 0.8, format });
  const ext = isPng ? 'png' : 'jpg';
  const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, { encoding: 'base64' });
  const { error } = await supabase.storage.from(BUCKET).upload(path, base64ToArrayBuffer(base64), {
    contentType: isPng ? 'image/png' : 'image/jpeg', upsert: false,
  });
  if (error) throw error;
  return path;
}

export default function NewServiceRecordScreen() {
  const { customerId: customerIdParam, templateId, onlineOrderId } =
    useLocalSearchParams<{ customerId?: string; templateId?: string; onlineOrderId?: string }>();
  const router = useRouter();

  // resolvedCustomerId 可能來自 URL param 或線上訂單查詢結果
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | undefined>(customerIdParam);
  const [customerName, setCustomerName] = useState('');
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [serviceName, setServiceName] = useState('');
  const [amount, setAmount] = useState('');
  const [serviceDate, setServiceDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');

  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);
  const [beforeAsset, setBeforeAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [afterAsset, setAfterAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'line_pay' | 'package'>('cash');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [activePackages, setActivePackages] = useState<import('@/types/types').ServicePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    })();
  }, [customerIdParam, templateId, onlineOrderId]);

  const pickPhoto = async (type: 'before' | 'after', source: 'camera' | 'gallery') => {
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

  const handleSave = async () => {
    setError('');
    if (!serviceName.trim()) { setError('請輸入服務項目'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { setError('請輸入有效金額'); return; }
    if (!resolvedCustomerId) { setError('缺少顧客資料'); return; }
    if (paymentMethod === 'package' && !selectedPackageId) { setError('請選擇要使用的套票'); return; }
    setLoading(true);
    try {
      const y = serviceDate.getFullYear();
      const m = String(serviceDate.getMonth() + 1).padStart(2, '0');
      const d = String(serviceDate.getDate()).padStart(2, '0');
      const record = await createServiceRecord({
        customer_id: resolvedCustomerId,
        service_name: serviceName.trim(),
        amount: paymentMethod === 'package' ? 0 : amt,
        service_date: `${y}-${m}-${d}`,
        notes: notes.trim() || null,
        before_photo_path: null,
        after_photo_path: null,
        payment_method: paymentMethod,
        package_id: paymentMethod === 'package' ? selectedPackageId : null,
        status: 'completed',
      });
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
      const [bPath, aPath] = await Promise.all([
        beforeAsset ? compressAndUpload(beforeAsset.uri, beforeAsset.mimeType ?? undefined, beforeAsset.width ?? undefined) : Promise.resolve(null),
        afterAsset ? compressAndUpload(afterAsset.uri, afterAsset.mimeType ?? undefined, afterAsset.width ?? undefined) : Promise.resolve(null),
      ]);
      if (bPath || aPath) {
        await updateServiceRecord(record.id, {
          before_photo_path: bPath ?? undefined,
          after_photo_path: aPath ?? undefined,
        });
      }
      // 線上訂單：儲存後同步更新狀態為 completed
      if (linkedOnlineOrderId) {
        await updateOnlineOrderStatus(linkedOnlineOrderId, 'completed');
      }
      if (stockWarnings.length > 0) {
        setError(`記錄已儲存，但注意：${stockWarnings.join('；')}`);
        setLoading(false);
        setTimeout(() => router.back(), 2500);
      } else {
        router.back();
      }
    } catch (e: any) {
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                {templates.map(tpl => (
                  <Pressable key={tpl.id} className="rounded-xl px-3 py-2 active:opacity-70"
                    style={{ backgroundColor: tpl.color + '22', borderWidth: 1.5, borderColor: serviceName === tpl.name ? tpl.color : tpl.color + '44' }}
                    onPress={() => { setServiceName(tpl.name); setAmount(String(tpl.default_amount)); }}>
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
            value={serviceName} onChangeText={setServiceName} />
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務金額 *</Text>
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
            <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
            <TextInput className="flex-1 font-rounded text-base text-foreground" placeholder="0"
              placeholderTextColor="#c4a0ae" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          </View>
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">付款方式 *</Text>
          <View className="flex-row flex-wrap gap-2">
            {([
              { key: 'cash', label: '💵 現金', color: '#5dc0a0' },
              { key: 'card', label: '💳 刷卡', color: '#8b9de8' },
              { key: 'line_pay', label: '📱 LINE Pay', color: '#06c755' },
              { key: 'package', label: '🎫 套票扣款', color: '#e8789a' },
            ] as { key: 'cash' | 'card' | 'line_pay' | 'package'; label: string; color: string }[]).map(opt => (
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
