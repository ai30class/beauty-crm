import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, RotateCcw } from 'lucide-react-native';
import {
  getCustomerById, getShopProfile, getMyStaffLink, getStaffForPicker, createClientConsent,
  getMyShopOwnerId, getServiceTemplateById,
} from '@/db/api';
import { uploadSignature } from '@/lib/clientPhotos';
import { SignaturePad } from '@/components/SignaturePad';
import type { SignaturePadHandle } from '@/components/SignaturePad';
import { SERVICE_CONSENT_META } from '@/lib/consentForms';
import type { StaffRosterEntry, ConsentFormType } from '@/types/types';

// 同意書簽署流程。可以一次簽一份（例如從顧客詳細頁「+新增」進來，預設只簽肖像同意書），
// 也可以一次簽多份（從預約詳情頁的提醒進來，例如紋繡類會帶 types=tattoo,portrait，
// 兩份接連簽完才算完成，中途不用重新輸入顧客資料）。
// Emma 9/23 決定：紋繡／接睫毛／除毛三類都要簽「該服務同意書」＋「肖像同意書」。

function calcAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const notYetBirthday = now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (notYetBirthday) age--;
  return age;
}

const FORM_TITLES: Record<ConsentFormType, string> = {
  portrait: '肖像權暨影像蒐集使用同意書',
  tattoo: SERVICE_CONSENT_META.tattoo.title,
  lash: SERVICE_CONSENT_META.lash.title,
  hair_removal: SERVICE_CONSENT_META.hair_removal.title,
};

export default function NewClientConsentScreen() {
  const { customerId, types, serviceTemplateId } = useLocalSearchParams<{
    customerId: string; types?: string; serviceTemplateId?: string;
  }>();
  const router = useRouter();

  const formTypes: ConsentFormType[] = (types?.split(',').filter(Boolean) as ConsentFormType[] | undefined)?.length
    ? (types!.split(',').filter(Boolean) as ConsentFormType[])
    : ['portrait'];

  const [stepIndex, setStepIndex] = useState(0);
  const currentType = formTypes[stepIndex];
  const isLastStep = stepIndex === formTypes.length - 1;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [shopName, setShopName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerBirthday, setCustomerBirthday] = useState<string | null>(null);
  const [serviceItem, setServiceItem] = useState<string | null>(null);
  const [serviceConsentGroup, setServiceConsentGroup] = useState<string | null>(null);
  const serviceDate = new Date().toISOString().slice(0, 10);

  const [isMinor, setIsMinor] = useState(false);
  const [signerName, setSignerName] = useState('');

  // 肖像同意書專用：三層影像用途勾選
  const [consentInternalUse, setConsentInternalUse] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentFullFace, setConsentFullFace] = useState(false);

  // 紋繡／接睫毛／除毛專用：健康狀況調查
  const [healthAnswers, setHealthAnswers] = useState<Record<number, 'yes' | 'no'>>({});
  const [healthNotes, setHealthNotes] = useState('');

  // 登入者是員工帳號：見證人就是自己，不用選；是商家帳號：從人員名單選一位見證人
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const [checkingStaff, setCheckingStaff] = useState(true);
  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  const customerSigRef = useRef<SignaturePadHandle>(null);
  const staffSigRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    (async () => {
      try {
        const [shop, link] = await Promise.all([
          getShopProfile().catch(() => null),
          getMyStaffLink().catch(() => null),
        ]);
        setShopName(shop?.shop_name ?? '');
        if (link) {
          setMyStaffId(link.staffId);
        } else {
          const roster = await getStaffForPicker().catch(() => []);
          setStaffList(roster);
        }
        setCheckingStaff(false);

        if (customerId) {
          const c = await getCustomerById(customerId);
          if (c) {
            setCustomerName(c.name);
            setCustomerPhone(c.phone);
            setCustomerBirthday(c.birthday);
            setSignerName(c.name);
            const age = calcAge(c.birthday);
            if (age !== null && age < 18) setIsMinor(true);
          }
        }
        if (serviceTemplateId) {
          const tpl = await getServiceTemplateById(serviceTemplateId).catch(() => null);
          if (tpl) {
            setServiceItem(tpl.name);
            setServiceConsentGroup(tpl.consent_group ?? null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, serviceTemplateId]);

  // 換到下一份同意書時，清空「這一份」專屬的狀態；顧客資料、簽署人姓名、是否未成年是同一次到店共用，不清
  const resetStepState = () => {
    setConsentInternalUse(false); setConsentMarketing(false); setConsentFullFace(false);
    setHealthAnswers({}); setHealthNotes('');
    setError('');
    customerSigRef.current?.clear();
    staffSigRef.current?.clear();
  };

  const handleToggleMarketing = (v: boolean) => {
    setConsentMarketing(v);
    if (!v) setConsentFullFace(false); // ②沒勾，③一定不能是 true
  };

  const currentServiceMeta = currentType === 'portrait' ? null : SERVICE_CONSENT_META[currentType];
  const healthAllAnswered = !currentServiceMeta || currentServiceMeta.healthQuestions.every((_, i) => healthAnswers[i]);

  const handleSubmitStep = async () => {
    setError('');
    if (!customerId) { setError('缺少顧客資料，請從顧客詳細頁進入'); return; }
    if (!signerName.trim()) { setError('請填寫簽署人姓名'); return; }
    const effectiveStaffId = myStaffId ?? selectedStaffId;
    if (!effectiveStaffId) { setError('請選擇見證的服務人員'); return; }
    if (currentServiceMeta && !healthAllAnswered) { setError('請完成健康狀況調查每一項'); return; }
    if (customerSigRef.current?.isEmpty()) { setError('請先完成顧客簽名'); return; }
    if (staffSigRef.current?.isEmpty()) { setError('請先完成服務人員簽名'); return; }

    const customerDataUrl = customerSigRef.current?.toDataURL();
    const staffDataUrl = staffSigRef.current?.toDataURL();
    if (!customerDataUrl || !staffDataUrl) { setError('簽名讀取失敗，請重新簽名'); return; }

    setSaving(true);
    try {
      const ownerId = await getMyShopOwnerId();
      const folder = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const customerPath = `${ownerId}/consents/${folder}/customer.png`;
      const staffPath = `${ownerId}/consents/${folder}/staff.png`;
      await uploadSignature(customerDataUrl, customerPath);
      await uploadSignature(staffDataUrl, staffPath);

      await createClientConsent({
        customer_id: customerId,
        form_type: currentType,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_birthday: customerBirthday,
        service_item: serviceItem,
        service_date: serviceDate,
        consent_internal_use: currentType === 'portrait' ? consentInternalUse : false,
        consent_marketing: currentType === 'portrait' ? consentMarketing : false,
        consent_full_face: currentType === 'portrait' ? (consentMarketing ? consentFullFace : false) : false,
        is_minor: isMinor,
        signer_name: signerName.trim(),
        customer_signature_path: customerPath,
        staff_signature_path: staffPath,
        staff_id: effectiveStaffId,
        consent_group: currentType === 'tattoo' ? serviceConsentGroup : null,
        health_answers: currentServiceMeta
          ? currentServiceMeta.healthQuestions.map((q, i) => ({ question: q, answer: healthAnswers[i] }))
          : null,
        health_notes: currentServiceMeta ? (healthNotes.trim() || null) : null,
      });

      if (isLastStep) {
        if (router.canGoBack()) router.back();
        else router.replace(`/(app)/customers/${customerId}` as any);
      } else {
        setStepIndex(i => i + 1);
        resetStepState();
      }
    } catch (e: any) {
      setError(e.message ?? '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator size="large" color="#e8789a" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-rounded text-xl font-bold text-foreground">{FORM_TITLES[currentType]}</Text>
          {formTypes.length > 1 && (
            <Text className="font-rounded text-xs text-muted-foreground mt-0.5">第 {stepIndex + 1} / {formTypes.length} 份</Text>
          )}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        <View className="bg-muted/40 rounded-2xl px-4 py-3 gap-1">
          <Text className="font-rounded text-xs text-muted-foreground">顧客</Text>
          <Text className="font-rounded text-sm font-semibold text-foreground">{customerName || '（未知）'}　{customerPhone}</Text>
          <Text className="font-rounded text-xs text-muted-foreground mt-1">服務項目</Text>
          <Text className="font-rounded text-sm text-foreground">{serviceItem ?? '（未指定）'}　{serviceDate}</Text>
        </View>

        {currentType === 'portrait' ? (
          <>
            <View className="bg-card border border-border rounded-2xl p-4 gap-2.5">
              <Text className="font-rounded text-sm font-semibold text-foreground">個人資料蒐集與利用告知</Text>
              <Text className="font-rounded text-xs text-muted-foreground leading-5">
                {shopName || '本店'}為提供服務前、後（Before / After）效果比對紀錄，需拍攝並留存本人臉部或施作部位之影像。
                依《個人資料保護法》第8條規定，蒐集之目的為提供美容服務前、後效果比對、諮詢對照、服務品質追蹤及糾紛處理留存之用；
                蒐集之個人資料類別為本人臉部或施作部位之影像（照片，必要時包含短片）。
              </Text>
              <Text className="font-rounded text-xs text-muted-foreground leading-5">
                利用之期間：自本人簽署本同意書之日起，至服務關係終了為止；服務關係終了後，除依法令規定或本店執行業務所必須之保存期間外，
                本店將於合理期間內刪除或匿名化本人之影像資料。本人並得依個人資料保護法第3條規定，隨時要求查詢、閱覽、複製、更正、
                停止利用或刪除，亦得隨時撤回本同意書之全部或部分同意。
              </Text>
              <Text className="font-rounded text-xs text-muted-foreground leading-5">
                利用之地區：台灣境內（本店營業處所）；因本店預約系統之雲端資料庫服務商將資料存放於境外伺服器（南韓首爾），資料將因此跨境傳輸至該地區儲存。
                利用之對象：本店內部經授權之服務人員；因預約系統雲端資料庫服務所需，委由雲端資料庫服務商代為存放，本店對其負有監督義務；
                除前述受託處理者外，不提供予本店以外之其他第三人。
              </Text>
            </View>

            <View className="bg-card border border-border rounded-2xl p-4 gap-3">
              <Text className="font-rounded text-sm font-semibold text-foreground">影像用途同意事項（請逐項確認）</Text>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="font-rounded text-sm text-foreground flex-1">① 同意拍攝服務前／後影像，留存作為本店內部服務紀錄與效果比對使用</Text>
                <Switch value={consentInternalUse} onValueChange={setConsentInternalUse} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
              </View>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="font-rounded text-sm text-foreground flex-1">② 同意將影像用於本店社群媒體、官網、廣告等行銷宣傳用途</Text>
                <Switch value={consentMarketing} onValueChange={handleToggleMarketing} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
              </View>
              <View className="flex-row items-center justify-between gap-2" style={{ opacity: consentMarketing ? 1 : 0.4 }}>
                <Text className="font-rounded text-sm text-foreground flex-1">③ 若同意②：同意露出可辨識之完整臉部特徵（未勾選則須做臉部遮蔽處理）</Text>
                <Switch
                  value={consentFullFace}
                  onValueChange={setConsentFullFace}
                  disabled={!consentMarketing}
                  trackColor={{ false: '#e5dde0', true: '#e8789a' }}
                />
              </View>
              <Text className="font-rounded text-xs text-muted-foreground">
                第①項與第②③項為不同層次之同意，僅勾選①不代表同意對外使用；不勾選任何一項僅代表不同意提供影像，不影響接受其他服務項目。
              </Text>
            </View>
          </>
        ) : (
          <>
            <View className="bg-card border border-border rounded-2xl p-4 gap-2.5">
              <Text className="font-rounded text-xs text-muted-foreground leading-5">{currentServiceMeta!.intro}</Text>
            </View>

            <View className="bg-card border border-border rounded-2xl p-4 gap-3">
              <Text className="font-rounded text-sm font-semibold text-foreground">健康狀況調查（請如實填寫）</Text>
              {currentServiceMeta!.healthQuestions.map((q, i) => (
                <View key={i} className="gap-1.5">
                  <Text className="font-rounded text-sm text-foreground">{q}</Text>
                  <View className="flex-row gap-2">
                    {(['yes', 'no'] as const).map(opt => {
                      const active = healthAnswers[i] === opt;
                      return (
                        <Pressable
                          key={opt}
                          className="px-4 py-1.5 rounded-full border active:opacity-70"
                          style={{ borderColor: active ? '#e8789a' : '#e0d0d8', backgroundColor: active ? '#e8789a18' : '#fff' }}
                          onPress={() => setHealthAnswers(a => ({ ...a, [i]: opt }))}
                        >
                          <Text className="font-rounded text-sm" style={{ color: active ? '#e8789a' : '#c4a0ae' }}>{opt === 'yes' ? '是' : '否'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">若上述任一項目回答「是」，請詳細說明</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-4 py-2.5 font-rounded text-sm text-foreground"
                  placeholder="選填"
                  placeholderTextColor="#c4a0ae"
                  value={healthNotes}
                  onChangeText={setHealthNotes}
                  multiline
                  style={{ minHeight: 56, textAlignVertical: 'top' }}
                />
              </View>
            </View>

            <View className="bg-card border border-border rounded-2xl p-4 gap-2">
              <Text className="font-rounded text-xs font-semibold text-foreground">服務內容說明</Text>
              <Text className="font-rounded text-xs text-muted-foreground leading-5">{currentServiceMeta!.serviceDescription}</Text>
              <Text className="font-rounded text-xs font-semibold text-foreground mt-1">風險與注意事項</Text>
              {currentServiceMeta!.risks.map((r, i) => (
                <Text key={i} className="font-rounded text-xs text-muted-foreground leading-5">－ {r}</Text>
              ))}
              <Text className="font-rounded text-xs font-semibold text-foreground mt-1">術前與術後保養須知</Text>
              {currentServiceMeta!.careNotes.map((r, i) => (
                <Text key={i} className="font-rounded text-xs text-muted-foreground leading-5">－ {r}</Text>
              ))}
              <Text className="font-rounded text-xs text-muted-foreground mt-1">
                本人已詳細填寫並如實告知上述健康狀況，已充分理解本項服務之操作方式與可能風險，並自願接受本項服務；如有隱匿或不實致生之不良反應，願自行負責。
              </Text>
            </View>
          </>
        )}

        <View>
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="font-rounded text-sm font-medium text-foreground">未滿 18 歲</Text>
            <Switch value={isMinor} onValueChange={setIsMinor} trackColor={{ false: '#e5dde0', true: '#e8789a' }} />
          </View>
          <Text className="font-rounded text-xs text-muted-foreground mb-2">若未滿 18 歲，請由法定代理人陪同並代為簽署下方同意書</Text>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">簽署人姓名</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
            placeholder={isMinor ? '法定代理人姓名' : '顧客姓名'}
            placeholderTextColor="#c4a0ae"
            value={signerName}
            onChangeText={setSignerName}
          />
        </View>

        {!checkingStaff && !myStaffId && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">見證的服務人員</Text>
            <View className="flex-row flex-wrap gap-2">
              {staffList.filter(s => s.is_active).map(s => {
                const active = selectedStaffId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    className="px-3 py-2 rounded-full border active:opacity-70"
                    style={{ borderColor: active ? s.color : '#e0d0d8', backgroundColor: active ? s.color + '18' : '#fff' }}
                    onPress={() => setSelectedStaffId(s.id)}
                  >
                    <Text className="font-rounded text-sm" style={{ color: active ? s.color : '#c4a0ae' }}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View>
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="font-rounded text-sm font-medium text-foreground">顧客簽名{isMinor ? '（法定代理人）' : ''}</Text>
            <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={() => customerSigRef.current?.clear()}>
              <RotateCcw size={14} color="#c4a0ae" />
              <Text className="font-rounded text-xs text-muted-foreground">清除重簽</Text>
            </Pressable>
          </View>
          <SignaturePad ref={customerSigRef} height={180} key={`c-${stepIndex}`} />
        </View>

        <View>
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="font-rounded text-sm font-medium text-foreground">服務人員簽名（見證）</Text>
            <Pressable className="flex-row items-center gap-1 active:opacity-70" onPress={() => staffSigRef.current?.clear()}>
              <RotateCcw size={14} color="#c4a0ae" />
              <Text className="font-rounded text-xs text-muted-foreground">清除重簽</Text>
            </Pressable>
          </View>
          <SignaturePad ref={staffSigRef} height={180} key={`s-${stepIndex}`} />
        </View>

        {error ? <Text className="font-rounded text-xs text-center" style={{ color: '#e85454' }}>{error}</Text> : null}

        <Pressable
          className="h-14 rounded-2xl items-center justify-center active:opacity-80"
          style={{ backgroundColor: '#e8789a', opacity: saving ? 0.7 : 1 }}
          disabled={saving}
          onPress={handleSubmitStep}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text className="font-rounded text-base font-semibold text-white">
                {isLastStep ? '完成簽署' : `簽完，下一份：${FORM_TITLES[formTypes[stepIndex + 1]]}`}
              </Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
