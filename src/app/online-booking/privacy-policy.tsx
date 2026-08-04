import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="font-rounded text-base font-bold text-foreground mb-2">{title}</Text>
      {children}
    </View>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-rounded text-sm text-muted-foreground leading-6 mb-1">{children}</Text>
  );
}

function TableRow({ label, desc }: { label: string; desc: string }) {
  return (
    <View className="flex-row border-b border-border py-2 gap-2">
      <Text className="font-rounded text-xs font-semibold text-foreground" style={{ width: 110 }}>{label}</Text>
      <Text className="font-rounded text-xs text-muted-foreground flex-1 leading-5">{desc}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 border-b border-border">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground">隱私政策</Text>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 py-6 pb-16"
      >
        {/* 生效日期 */}
        <View className="bg-card rounded-2xl p-4 border border-border mb-6">
          <Text className="font-rounded text-xs text-muted-foreground">生效日期：【西元○○○○年○○月○○日】</Text>
          <Text className="font-rounded text-xs text-muted-foreground mt-1">最後更新日期：【西元○○○○年○○月○○日】</Text>
        </View>

        <Para>
          【服務名稱】（以下簡稱「本服務」）由【公司名稱／經營者姓名】提供，本公司非常重視您的個人資料保護。本隱私政策依據中華民國《個人資料保護法》第8條及第9條規定，向您說明本公司於您註冊、使用本服務過程中，蒐集、處理及利用您個人資料之方式，請於註冊前詳閱本政策。
        </Para>

        <Section title="一、蒐集個人資料之目的">
          <Para>本公司基於下列特定目的蒐集您的個人資料：</Para>
          {[
            '會員管理與帳號認證（如信箱驗證、登入身分辨識）',
            '提供、維護、優化本服務功能及使用者體驗',
            '客服聯繫、爭議處理及帳號安全通知',
            '行銷推廣、電子報寄送及活動通知（僅於您同意之範圍內進行）',
            '網站流量分析、服務品質改善及數據統計',
            '依法令規定或主管機關要求須履行之義務',
          ].map((item, i) => (
            <Para key={i}>{i + 1}. {item}</Para>
          ))}
        </Section>

        <Section title="二、蒐集之個人資料類別">
          <View className="bg-card rounded-2xl border border-border overflow-hidden mb-2">
            <View className="flex-row bg-muted px-3 py-2 gap-2">
              <Text className="font-rounded text-xs font-bold text-foreground" style={{ width: 110 }}>資料類別</Text>
              <Text className="font-rounded text-xs font-bold text-foreground flex-1">說明</Text>
            </View>
            <View className="px-3">
              <TableRow label="帳號識別資料" desc="電子郵件信箱、密碼（經加密儲存）" />
              <TableRow label="基本資料" desc="姓名／暱稱、聯絡電話" />
              <TableRow label="自動蒐集資料" desc="裝置資訊、IP位址、使用行為記錄等（用於流量統計與服務優化）" />
              <TableRow label="行銷聯絡資料" desc="若您訂閱電子報，本公司將以您提供之電子郵件信箱寄送相關訊息" />
            </View>
          </View>
          <Para>本公司不會於未告知您本政策內容前，蒐集金融帳戶、健康醫療、犯罪前科等特種個人資料。</Para>
        </Section>

        <Section title="三、個人資料利用之期間、地區、對象及方式">
          {[
            '利用期間：自您註冊帳號起，至您申請刪除帳號或法定保存期限屆滿為止。',
            '利用地區：原則於中華民國境內；若使用境外雲端服務，資料可能傳輸至該服務所在地區。',
            '利用對象：本公司及依法委託之受託處理業者（如雲端服務供應商、電子郵件發送平台）。本公司不會將您的個人資料出售予第三人。',
            '利用方式：於前述蒐集目的之必要範圍內處理及利用。',
          ].map((item, i) => (
            <Para key={i}>{i + 1}. {item}</Para>
          ))}
        </Section>

        <Section title="四、您依個資法得行使之權利">
          <Para>依個資法第3條規定，您就本公司保有之個人資料，得行使下列權利：</Para>
          {['查詢或請求閱覽', '請求製給複製本', '請求補充或更正', '請求停止蒐集、處理或利用', '請求刪除'].map((item, i) => (
            <Para key={i}>{i + 1}. {item}</Para>
          ))}
          <Para>如欲行使上述權利，請透過本政策第十二點所列聯絡方式提出申請，本公司將於受理後15日內（最長不逾30日）回覆。</Para>
        </Section>

        <Section title="五、委外處理與第三方分享">
          <Para>本服務可能使用下列第三方服務：</Para>
          {[
            '電子郵件寄送服務（如驗證信、預約通知）',
            '雲端主機與資料儲存服務',
            '數據分析服務（用於了解使用者行為與優化服務）',
          ].map((item, i) => (
            <Para key={i}>• {item}</Para>
          ))}
          <Para>除經您同意、依法令規定或主管機關要求外，本公司不會將您的個人資料提供予前述以外之第三人。</Para>
        </Section>

        <Section title="六、行銷推廣與退出機制">
          <Para>本公司僅於您明示同意之範圍內，寄送行銷推廣或活動通知。您得隨時透過電子郵件中之「取消訂閱」連結或聯繫客服，要求停止接收行銷通知。</Para>
        </Section>

        <Section title="七、資料安全維護措施">
          {[
            '密碼以加密方式儲存，本公司員工無法直接讀取您的原始密碼',
            '限制僅授權人員得存取個人資料，並要求其負保密義務',
            '採用防火牆、存取控制等合理資訊安全防護措施',
            '如發生個人資料外洩，本公司將依個資法第12條規定以適當方式通知您',
          ].map((item, i) => (
            <Para key={i}>{i + 1}. {item}</Para>
          ))}
        </Section>

        <Section title="八、未成年人之保護">
          <Para>本服務原則上不主動蒐集未滿七歲兒童之個人資料。七歲以上未滿十八歲之未成年人，應於法定代理人同意及陪同下使用本服務。</Para>
        </Section>

        <Section title="九、政策之修改">
          <Para>本公司得因法令修訂或服務調整修改本政策，修改後將公布於應用程式內並更新「最後更新日期」。如有重大變更，本公司將以電子郵件或站內公告另行通知您。</Para>
        </Section>

        <Section title="十、聯絡方式與申訴管道">
          <Para>若您對本政策有任何疑問，歡迎透過以下方式聯繫：</Para>
          <Para>• 個人資料保護聯絡窗口：【姓名／部門】</Para>
          <Para>• 電子郵件：【privacy@example.com】</Para>
          <Para>• 服務時間：【週一至週五 09:00–18:00】</Para>
          <Para>• 地址：【公司地址】</Para>
          <Para>您亦得向國家發展委員會或其他權責機關提出申訴。</Para>
        </Section>

        {/* 提醒 */}
        <View className="bg-primary/5 rounded-2xl p-4 border border-primary/20">
          <Text className="font-rounded text-xs text-primary leading-5">
            ⚠️ 本文件為通用範本，請務必依實際資料流程逐項核實填寫【　】處內容，並於正式上線前委請熟悉個資法之律師審閱把關。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
