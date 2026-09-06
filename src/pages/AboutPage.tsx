import { Card, SectionHeading } from '@/components/ui';

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">關於本站</h1>
        <p className="mt-2 text-sm text-ink-600">
          English Vocabulary Lab 是一個針對繁體中文母語者設計的 B2–C2 英語字彙學習工具，
          提供 TOEFL／GRE 字義辨識練習，以及深入說明單字<strong>實際怎麼用</strong>的精選課程。
        </p>
      </header>

      <Card className="p-5">
        <SectionHeading>設計理念</SectionHeading>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-700">
          <li>所有詞條附有中英文釋義；精選課程另有中文用法解析與翻譯例句。</li>
          <li>搭配詞、文法句型、易混淆字比較都是第一級的學習內容，而不是附註。</li>
          <li>例句取材自專業溝通、軟體工程、學術寫作與日常語境，力求自然。</li>
          <li>常見錯誤只在真的有教學價值時才列出，不為了填欄位而編造。</li>
        </ul>
      </Card>

      <Card className="p-5">
        <SectionHeading>TOEFL／GRE 擴充字彙</SectionHeading>
        <p className="text-sm leading-7 text-ink-700">
          字典擴充詞條取自 <a className="underline" href="https://github.com/skywind3000/ECDICT">ECDICT</a>
          （<a className="underline" href="/licenses/ECDICT-MIT.txt">MIT 授權</a>），
          繁體中文經 OpenCC 自動轉換，尚未逐條人工校訂。擴充詞條目前提供字義辨識與複習，
          尚未附上人工例句與用法解析。考試標籤來自來源字典，並非官方必考清單；
          其 CEFR 等級為依詞頻估計的學習分組。
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading>關於 KK 音標</SectionHeading>
        <p className="text-sm text-ink-700">
          本站的音標採用 KK 系統（Kenyon &amp; Knott），標註美式英語發音，這也是台灣英語教學中
          最普遍使用的系統。頁面上的發音按鈕使用瀏覽器內建的語音合成功能，僅作為聽覺輔助，
          <strong>不能視為發音權威</strong>；實際發音請以 KK 標註為準。
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeading>資料與隱私</SectionHeading>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-700">
          <li>未登入時，學習進度只儲存在您的瀏覽器（localStorage）。</li>
          <li>登入後，進度儲存在 Cloudflare D1，可跨裝置同步。</li>
          <li>GitHub 登入只取得公開的帳號識別資訊，不索取儲存庫或電子郵件權限。</li>
          <li>GitHub 存取權杖在取得個人資料後即被丟棄，不會儲存，也不會傳給瀏覽器。</li>
        </ul>
      </Card>
    </div>
  );
}
