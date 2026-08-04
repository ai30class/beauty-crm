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

export default function TermsScreen() {
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
        <Text className="font-rounded text-xl font-bold text-foreground">服務條款</Text>
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
          歡迎使用【服務名稱】（以下簡稱「本平台」或「本服務」）。本平台由【公司名稱】（統一編號：【○○○○○○○○】）提供，係一套供商家用於客戶管理、預約管理及行銷服務之軟體服務（SaaS）。
        </Para>
        <Para>
          本條款適用於以商業／營業目的註冊使用本平台之商家。商家完成註冊、勾選同意，或以任何方式使用本服務，即表示商家已閱讀、理解並同意接受本條款之全部拘束。
        </Para>

        <Section title="一、定義">
          {[
            '本平台／本服務：指本公司提供之 SaaS 軟體服務，含網頁後台、應用程式、API 及相關功能。',
            '商家／租戶：指以事業體（公司、商號、工作室等）名義註冊，使用本平台經營其業務之使用者。',
            '商家帳號：商家於本平台建立之管理者帳號及其下轄之子帳號（如員工帳號）。',
            '終端客戶：指商家透過本平台服務之消費者、會員或客戶，其個人資料由商家蒐集並委由本平台處理。',
            '商家內容：指商家上傳、輸入至本平台之一切資料，包括但不限於商品資訊、訂單資料、終端客戶名單、行銷素材等。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="二、商家資格與帳號註冊">
          {[
            '商家應為依法登記之公司、商號或具備完全行為能力之自然人事業經營者，並提供真實、正確、完整之營業登記資訊。',
            '商家應指定管理者帳號之聯絡電子郵件信箱，作為帳號驗證、帳務通知及重要公告之送達方式。',
            '商家得於其帳號下建立子帳號供員工使用，並自行負責子帳號之權限設定與使用行為，該等行為視為商家之行為。',
            '商家應妥善保管帳號密碼及登入憑證。因保管不當、遭盜用或員工濫用所生之損害，由商家自行承擔。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="三、服務內容與授權範圍">
          <Para>本公司於商家訂閱期間內，授予商家一項非專屬、不可轉讓、可撤銷之權利，得依本條款及所選訂閱方案之範圍，存取並使用本平台服務。</Para>
          <Para>商家不得：</Para>
          {[
            '將本平台之帳號、服務權限轉售、出租、出借予未經授權之第三人',
            '對本平台軟體進行還原工程、反編譯或試圖取得原始碼',
            '以自動化方式大量擷取、備份本平台非屬商家自身之資料',
            '利用本平台從事違法、詐欺、洗錢、侵害第三人權利或其他不當行為',
            '上傳含有病毒、惡意程式碼或足以癱瘓本平台系統之內容',
          ].map((item, i) => <Para key={i}>• {item}</Para>)}
        </Section>

        <Section title="四、訂閱方案、費用與計費">
          {[
            '本平台採訂閱制，各方案之功能範圍、使用額度及費用，以本平台官網或商家後台公告之價目表為準。',
            '試用期（如適用）：試用期屆滿後，除商家於期限前主動取消，否則將自動轉為付費訂閱並開始計費，本公司將於試用期屆滿前以電子郵件提醒商家。',
            '計費週期與自動續約：訂閱費用依商家選定之計費週期預先收取；除商家於當期到期日前取消訂閱外，訂閱將自動按原方案續約收費。',
            '逾期未繳費：商家逾期未繳納費用者，本公司得暫停商家帳號之全部或部分功能；經催告後仍未繳費者，本公司得逕行終止服務。',
            '退款政策：除法令另有規定或本公司另行公告外，已收取之訂閱費用原則上不予退還。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="五、商家內容之權利與責任">
          {[
            '商家內容之智慧財產權歸商家或原權利人所有。商家授予本公司非專屬、全球性、免權利金之授權，使本公司得於提供、維護、優化本服務之必要範圍內，儲存、處理、備份、顯示商家內容。',
            '商家應確保其上傳之商家內容（含終端客戶資料）之取得、使用均已取得必要之合法權源與當事人同意，未侵害第三人之智慧財產權、隱私權或其他權利。',
            '商家應自行對其商家內容進行備份；本公司雖採取合理備份機制，惟不保證商家內容永久不遺失，建議商家定期自行匯出重要資料。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="六、終端客戶個人資料之處理（資料受託處理條款）">
          {[
            '角色定位：就終端客戶之個人資料而言，商家為個人資料保護法所定之蒐集者／控管者（Data Controller），本公司則為受託處理者（Data Processor），僅依商家之指示及本條款範圍處理終端客戶個人資料。',
            '蒐集合法性由商家負責：商家應自行確保其對終端客戶個人資料之蒐集、處理及利用，已依個人資料保護法及相關法令踐行告知義務、取得必要同意或具備其他合法依據。',
            '處理範圍限制：本公司僅為提供、維護本平台服務之必要目的，處理終端客戶個人資料，不得為商家指示範圍以外之目的處理或利用該等資料。',
            '安全維護義務：本公司應採取合理之技術與組織措施（如存取控制、加密傳輸、備份機制），保護終端客戶個人資料之安全。',
            '資料外洩通知：如發生終端客戶個人資料外洩或其他安全事件，本公司應於知悉後儘速通知商家，並提供必要協助。',
            '資料返還與刪除：商家終止使用本服務時，得於終止前30日內向本公司申請匯出其商家內容；本公司將於契約終止後合理期間內刪除或匿名化該等資料，法令另有要求保存者不在此限。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="七、服務水準與維護">
          {[
            '本公司將以合理之商業努力維持本平台之可用性，惟不保證服務全年無休、無中斷或無錯誤。',
            '本公司得為系統維護、升級進行預定性停機，並將提前以合理方式通知商家；不可抗力（如天災、駭客攻擊、電信中斷）導致之非預定性中斷，本公司將盡速修復但不負賠償責任。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="八、保密義務">
          <Para>雙方對於因履行本條款而知悉之對方非公開營業秘密、技術資訊、商家內容及終端客戶資料，應負保密義務，不得洩漏予無關第三人或用於本條款目的以外之用途，本條款終止後保密義務仍存續2年。</Para>
        </Section>

        <Section title="九、服務暫停與終止">
          {[
            '商家得隨時終止：商家得依訂閱方案之約定，於計費週期屆滿前通知本公司終止訂閱，惟不影響已到期或已發生之付款義務。',
            '本公司得暫停或終止之情形：商家違反本條款、逾期未繳費、涉及違法使用、或本平台因故全面停止營運時，本公司得暫停或終止商家帳號，並依合理方式事先通知。',
            '服務終止後，本公司將依第六條第6項處理商家內容及終端客戶資料；商家逾期未申請匯出者，視為放棄該等資料，本公司得逕行刪除。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="十、免責聲明與責任限制">
          {[
            '本服務依「現況」提供，本公司不保證服務完全符合商家之特定商業需求。',
            '於法令允許之最大範圍內，本公司對商家因使用或無法使用本服務所生之間接、附帶、衍生性損害（如商譽損失、預期利益損失、資料損失所生之營業損害）不負賠償責任。',
            '本公司因可歸責事由對商家所負之賠償責任總額，以商家於求償事由發生前12個月內已實際支付予本公司之訂閱費用總額為上限；本項限制不適用於因本公司故意或重大過失所致之損害。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="十一、智慧財產權">
          <Para>本平台之軟體、系統架構、介面設計、商標及相關技術，其智慧財產權均歸本公司或授權人所有。本條款不移轉任何智慧財產權予商家，商家僅取得第三條所定之使用授權。</Para>
        </Section>

        <Section title="十二、準據法與管轄法院">
          <Para>本條款之解釋與適用以中華民國法律為準據法。因本條款所生之爭議，雙方同意以【臺灣○○地方法院】為第一審管轄法院。</Para>
        </Section>

        <Section title="十三、其他約定">
          {[
            '本條款經雙方同意得不時修改，本公司將於修改生效前合理期間通知商家；商家於修改生效後繼續使用本服務，視為同意修改後之條款。',
            '商家不得將其於本條款下之權利義務轉讓予第三人，除經本公司書面同意。',
            '本條款任何條款如經有管轄權法院判定無效，不影響其餘條款之效力。',
          ].map((item, i) => <Para key={i}>{i + 1}. {item}</Para>)}
        </Section>

        <Section title="十四、聯絡方式">
          <Para>• 商務／客服聯繫：【business@example.com】</Para>
          <Para>• 資料保護聯絡窗口：【privacy@example.com】</Para>
          <Para>• 地址：【公司地址】</Para>
        </Section>

        {/* 提醒 */}
        <View className="bg-primary/5 rounded-2xl p-4 border border-primary/20">
          <Text className="font-rounded text-xs text-primary leading-5">
            ⚠️ 本文件為通用範本，請務必依實際業務情況填寫【　】處內容，並建議於正式上線前委請熟悉個資法之律師審閱把關。
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
