import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { getClientConsentById, getClientPhotoUrl, getShopStaffRoster } from '@/db/api';
import { CONSENT_FORM_TITLE } from '@/lib/consentForms';
import type { ClientConsent, StaffRosterEntry } from '@/types/types';

// 回看一筆已簽署的同意書：本來就簽完不可再改（migration 00090／00091 沒有 UPDATE 政策），
// 這裡是唯讀畫面。四種同意書（肖像／紋繡／接睫毛／除毛）共用這個畫面，內容區塊依 form_type 顯示不同。

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="font-rounded text-sm text-muted-foreground">{label}</Text>
      <Text className="font-rounded text-sm text-foreground">{value}</Text>
    </View>
  );
}

export default function ClientConsentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [consent, setConsent] = useState<ClientConsent | null>(null);
  const [customerSigUrl, setCustomerSigUrl] = useState<string | null>(null);
  const [staffSigUrl, setStaffSigUrl] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      setLoading(true);
      try {
        const c = await getClientConsentById(id);
        setConsent(c);
        if (c) {
          const [cu, su, roster] = await Promise.all([
            getClientPhotoUrl(c.customer_signature_path),
            getClientPhotoUrl(c.staff_signature_path),
            getShopStaffRoster().catch(() => [] as StaffRosterEntry[]),
          ]);
          setCustomerSigUrl(cu);
          setStaffSigUrl(su);
          setStaffName(roster.find(s => s.id === c.staff_id)?.name ?? '');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]));

  if (loading) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator size="large" color="#e8789a" /></View>;
  }
  if (!consent) {
    return <View className="flex-1 bg-background items-center justify-center"><Text className="font-rounded text-muted-foreground">找不到這筆同意書</Text></View>;
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">{CONSENT_FORM_TITLE[consent.form_type]}</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        <View className="bg-card border border-border rounded-2xl p-4">
          <Row label="顧客" value={`${consent.customer_name}　${consent.customer_phone}`} />
          <Row label="服務項目" value={consent.service_item ?? '—'} />
          <Row label="服務日期" value={consent.service_date} />
          <Row label="簽署人" value={`${consent.signer_name}${consent.is_minor ? '（法定代理人）' : ''}`} />
          <Row label="見證人員" value={staffName || '—'} />
          <Row label="簽署時間" value={new Date(consent.created_at).toLocaleString('zh-TW')} />
        </View>

        {consent.form_type === 'portrait' ? (
          <View className="bg-card border border-border rounded-2xl p-4 gap-2">
            <Text className="font-rounded text-sm font-semibold text-foreground mb-1">影像用途同意事項</Text>
            <Row label="① 內部留存比對" value={consent.consent_internal_use ? '同意' : '不同意'} />
            <Row label="② 行銷宣傳用途" value={consent.consent_marketing ? '同意' : '不同意'} />
            <Row label="③ 露出完整臉部" value={consent.consent_full_face ? '同意' : '不同意（須臉部遮蔽）'} />
          </View>
        ) : (
          <View className="bg-card border border-border rounded-2xl p-4 gap-2">
            <Text className="font-rounded text-sm font-semibold text-foreground mb-1">健康狀況調查</Text>
            {(consent.health_answers ?? []).map((h, i) => (
              <Row key={i} label={h.question} value={h.answer === 'yes' ? '是' : '否'} />
            ))}
            {consent.health_notes ? (
              <>
                <Text className="font-rounded text-xs font-semibold text-foreground mt-1">補充說明</Text>
                <Text className="font-rounded text-xs text-muted-foreground">{consent.health_notes}</Text>
              </>
            ) : null}
            {consent.form_type === 'tattoo' && (
              <Row label="同意書分組" value={consent.consent_group ?? '（未設定）'} />
            )}
          </View>
        )}

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">顧客簽名{consent.is_minor ? '（法定代理人）' : ''}</Text>
          {customerSigUrl
            ? <Image source={{ uri: customerSigUrl }} style={{ height: 140, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8dce8' }} contentFit="contain" />
            : <Text className="font-rounded text-xs text-muted-foreground">簽名圖檔讀取失敗</Text>}
        </View>

        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務人員簽名（見證）</Text>
          {staffSigUrl
            ? <Image source={{ uri: staffSigUrl }} style={{ height: 140, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8dce8' }} contentFit="contain" />
            : <Text className="font-rounded text-xs text-muted-foreground">簽名圖檔讀取失敗</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
