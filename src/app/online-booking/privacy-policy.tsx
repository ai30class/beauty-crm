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
        <Text className="font-rounded text-xl font-bold text-foreground">服務條款及隱私權政策</Text>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-5 py-6 pb-16"
      >
        {/* 生效日期 */}
        <View className="bg-card rounded-2xl p-4 border border-border mb-6">
          <Text className="font-rounded text-xs text-muted-foreground">生效日期／最後更新日期：西元 2026 年 09 月 09 日</Text>
        </View>

        <Para>
          歡迎使用椏椏眉睫藝術（以下簡稱「本服務」），由椏椏眉睫藝術（以下簡稱「本公司」）提供。請於預約或使用本服務前詳閱下列內容；您完成預約、註冊或以任何方式使用本服務，即表示您已閱讀、理解並同意本頁全部內容。
        </Para>

        <Section title="一、服務內容與帳號">
          <Para>
            本服務提供線上預約、會員資料管理及相關通知功能。您得以 LINE 帳號或 Email 註冊登入；以 LINE 登入時，本公司將取得您的 LINE 顯示名稱、大頭貼及識別碼，用於身分辨識及後續預約提醒推播。您應提供真實、正確且完整的個人資料（姓名、電話等），若因資料不實導致無法收受通知或影響服務權益，由您自行負責。
          </Para>
        </Section>

        <Section title="二、預約成立與確認">
          <Para>
            預約送出後，系統將以 LINE 通知或站內訊息回覆「預約成功確認」，收到確認後方視為預約正式成立。如遇天災、設備故障、人力調配等不可抗力因素，本公司保留調整或取消該次預約之權利，並將儘速與您聯繫改期。
          </Para>
        </Section>

        <Section title="三、預約、取消與未到場">
          <Para>1. 完成預約後，本服務將為您保留該時段；逾預約時間 15 分鐘尚未到場且未事先聯繫，恕不保留，視為未到場。</Para>
          <Para>2. 如需取消或改期，請於預約時間前 24 小時透過 LINE 官方帳號或電話主動告知；逾前述期限之取消、改期或未事先聯繫，均視為未到場。</Para>
          <Para>3. 部分服務項目預約時需支付訂金；符合第 1、2 項所定「未到場」情形者，已付訂金恕不退還，不因取消時間早晚而有不同。本服務如屬消費者保護法所稱通訊交易，是否適用及排除該法所定之 7 日猶豫期，將於付款頁面另行明確告知。</Para>
        </Section>

        <Section title="四、個人資料的蒐集、處理及利用">
          <Para>1. 為完成預約及提供服務，我們會蒐集您的姓名、電話、生日及（若以 LINE 登入）LINE 識別資料，用於預約安排、身分核對、預約提醒推播及生日優惠通知。</Para>
          <Para>2. 若您原為本公司既有客戶（例如透過過往其他系統留下之資料），我們可能將該等既有資料轉移至本服務系統中繼續使用，以維持服務之連續性；如您有疑義，得依第七點方式與我們聯繫，我們將依規定處理。</Para>
          <Para>3. 除法令另有規定或經您同意外，本公司不會將您的個人資料提供予服務提供所需範圍以外之第三人。</Para>
          <Para>4. 您的資料將保存至您要求刪除、帳號終止或法令所定保存期限屆滿為止。</Para>
        </Section>

        <Section title="五、資料安全">
          <Para>
            本公司採取合理之技術及管理措施（如密碼加密、存取權限控管）保護您的個人資料，僅限經授權人員因業務需要接觸，並負保密義務。
          </Para>
        </Section>

        <Section title="六、Cookie 與委外服務">
          <Para>
            本服務可能使用 Cookie 及委外雲端服務（資料庫、訊息推播等）以提供功能，該等服務提供者僅得於提供服務之必要範圍內處理您的資料，不得另作他用。
          </Para>
        </Section>

        <Section title="七、您的權利與聯絡方式">
          <Para>
            您得請求查閱、複製、補充更正、停止處理或刪除您的個人資料，請透過電話 0975 273 176 或 LINE 官方帳號（@hzw4396n）與我們聯繫，我們將於受理後合理期間內處理。
          </Para>
        </Section>

        <Section title="八、免責聲明">
          <Para>
            本服務將盡力維護系統運作穩定；惟因電信業者網路中斷、系統維護、駭客攻擊等不可歸責於本公司之事由，導致預約失敗或服務中斷者，本公司不負損害賠償責任，但依法應盡之義務不在此限。
          </Para>
        </Section>

        <Section title="九、條款之修改">
          <Para>
            本公司得因法令變更或服務需要修改本頁內容，重大變更將以站內公告或 LINE 訊息通知；您於修改後繼續使用本服務，視為同意修改後之內容。
          </Para>
        </Section>
      </ScrollView>
    </View>
  );
}
