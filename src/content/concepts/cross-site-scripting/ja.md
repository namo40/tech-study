---
title: "Cross-Site Scripting"
summary: "Cross-site scripting は、ユーザーのテキストがコードとしてレンダリングされることです。スクリプトを載せたコメントが 1 つ保存されると、すべての読者のブラウザーで、その読者のセッションで実行されます。対処は、値が置かれる場所に合わせて出力時にエンコードし、raw 出力の通路を閉じておき、その下にコンテンツセキュリティポリシーの網を張ることです。"
category: "アプリケーションセキュリティ"
scene: cross-site-scripting
steps:
  - title: "読者のブラウザーで、読者の権限で実行されます"
    text: "ゴーストはスクリプトを載せたコメントを保存し、手を付けずにレンダリングします。ページは、開いた読者が誰であれその読者の Cookie とセッションで実行します。SQL インジェクションと同じ混同です。ユーザーのテキストが、ブラウザーにコードとして実行されます。"
  - title: "エンコードすれば、同じ文字たちが表示になります"
    text: "ストアのコメントはそのままです。出て行く道でマークアップの文字が無害な綴りに変わり、ページはスクリプトを実行する代わりに文字として見せます。保存するときではなく出力するときにエンコードします。原文が丸ごと残り、現れる場所ごとに違ってエンコードできるようにです。フィルターで除かれたのではなく、格下げされたのです。"
  - title: "置かれる場所がエンコードを決めます"
    text: "HTML 本文、属性、URL。文脈ごとに自分のエスケープ規則があり、間違った規則を当てると隙間が残ります。属性の中では、本文用のエンコードでも抜け出せます。問う質問は「エンコードしたか」ではなく「置かれる場所に合わせてエンコードしたか」です。"
  - title: "脱出口は鍵を掛け、網は二重に張ります"
    text: "どのテンプレートエンジンにも「信頼された」HTML のための raw 出力の扉があります。値が証明可能に自分たちのものであるとき以外は閉めておいてください。raw 呼び出し 1 つが上流のすべてのエンコーダーを無効にします。その下にはポリシーの網が掛かり、それでもすり抜けたものを受け止めます。"
related:
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
references:
  - title: "Cross Site Scripting (XSS)"
    url: https://owasp.org/www-community/attacks/xss/
  - title: "Cross Site Scripting Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: "Prevent Cross-Site Scripting (XSS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cross-site-scripting
---

## いつ使うか

これらの防御を採らないと決める状況はありません。変わるのは、道具がすでにどれだけやってくれているか、そしてそれをどれだけ注意深く壊さずにいられるかです。

- 自分で書いた値でないものはすべて、置かれる場所に合わせてエンコードします。Razor は `@value` について既定でこれを行い、React は `{value}` について行います。規律とはそれらを打ち負かさないことです。出力を手で組み立てる場所でだけ明示的なエンコーダーを取り出し、そのときも行き先に合うものを取り出します。
- フォームの入力欄だけでなく、すべてを信頼しない値として扱います。自社のデータベースから出てきた表示名も、誰かが入力したものです。パートナーのフィードから同期した商品説明、アップロード一覧のファイル名、サードパーティ API から返ってきたエラーメッセージ、去年に自分たちのサービスが書いた値も同じです。「信頼しない」とは「このコードベースが書いたのではない」という意味であり、ページの上のほとんどすべてがそれに当たります。
- 3 つの顔を知っておきます。3 つは 1 つの混同を共有しています。保存型はデータベースに住み、ページを開くすべての人に配信されます。反射型はリンクに住み、そのリンクを辿った人に対して実行されます。DOM 型はサーバーにまったく届きません。値が `location.hash` から `innerHTML` へブラウザーの中で渡り、サーバー側のエンコードはそれが起きるところを見ることができません。3 つとも、出力地点でテキストがコードになる出来事です。
- 防御を入力ではなく出力に置きます。同じコメントがある場所では安全で別の場所では危険なので、判断は行き先を知っている場所にあるべきです。入ってくるときにエンコードすると原文も一緒に壊れますが、その原文こそ、ユーザーが後で編集し、書き出し、検索する値です。
- 入力検証は答えではなく 2 層目として足します。`Guid` でない `Guid` を拒み、ページサイズを 1 から 100 の間に縛ることは、無意味なものをシステムの外に置きます。それ自体に値打ちがあります。ただし入力検証は形についてのフィルターであり、スクリプトを載せたコメントも形としては真っ当なコメントであり得るので、ある文字列が属性の中にレンダリングされることを止めてはくれません。
- コンテンツセキュリティポリシーを網として配置します。どのスクリプトの出どころが正当かを告げられたブラウザーは、こちらが名前を挙げていないものを拒みます。そのおかげで、エンコーダーを 1 つ見落とした事故が侵害ではなくレポートになります。この一覧の最後にあるのは、実務でも最後の層だからです。

## 注意点

- `Html.Raw`、`innerHTML`、`dangerouslySetInnerHTML` が脆弱性の面です。どれも「この文字列はもう HTML だからパーサーにそのまま渡せ」と言っており、その上流にあるすべてのエンコーダーを切ってしまいます。使うたびに、レビューで守れる根拠が要ります。値が自分の書いた定数である、サニタイザーを通っている、エンコード済みの断片から組み立てられている、のいずれかです。「テストでは問題なさそうだった」は根拠ではありません。
- リッチな HTML を無害化するのは専門家の仕事です。製品が本当にユーザーの書式入力を必要とするなら、要素と属性の許可リストを備えた保守されているサニタイザーライブラリを使い、ほかのセキュリティ依存と同じように更新してください。フィルターを自分で書かないでください。とくに正規表現では書かないでください。HTML は正規言語ではなく、迂回のリストはすでに他の人たちが何十年もかけて塞いできた道です。
- 文脈ごとに破れ方が違います。引用符のない属性に置かれた値は、山括弧なしで空白 1 つで抜け出します。ユーザーが決める URL はこちらの予期しないスキームを載せられるので、エンコードして期待するのではなく、`https:` か `/` で始まるかを検証します。`<script>` ブロックの中は 3 つ目の文法であり、そこでは HTML エンコードは何の役にも立ちません。
- 信頼しない値はインラインスクリプトにまったく入れません。HTML エンコーダーが仕事をできる `data-` 属性に入れ、JavaScript では `dataset` から読み、`innerHTML` ではなく `textContent` でページに書きます。全員にその文脈のエスケープを教える代わりに、文脈を 1 つコードベースから消す方法です。
- セッションを載せた Cookie には `HttpOnly` が要り、`Secure` と `SameSite` も一緒に要ります。`HttpOnly` は、Cookie を盗んで見せるお決まりの実演を封じてくれます。それだけでも値打ちがありますが、できないことも正直にしておきます。自分たちのページの中で走るスクリプトは、そのページを通じて読者として振る舞うことが依然としてできます。戦利品をなくすだけで、問題をなくすわけではありません。
- コンテンツセキュリティポリシーは網であって防御ではありません。レポート専用モードで始め、1 週間ほどレポートを読みます。最初の版はいつも、やっているとも気づいていなかった何かを壊すからです。そのうえで強制します。サイトをまた動かすために `unsafe-inline` で埋めたポリシーは、何も受け止めないポリシーです。インラインハンドラーを外す時間のほうを取っておきます。

## .NET では

- Razor は頼まれなくても、どこでも `@value` を出て行く道で HTML エンコードします。そうしないのは `@Html.Raw(value)` と、手で組み立てた `IHtmlContent` や `HtmlString` なので、これらが現れる場所をすべてレビューの地点とします。リポジトリ全体で `Html.Raw` と `HtmlString` を検索するのは 2 分の点検であり、リリースごとに回す値打ちがあります。
- 3 つのエンコーダーは `System.Text.Encodings.Web` にあります。`HtmlEncoder`、`UrlEncoder`、`JavaScriptEncoder` です。互いに置き換えられるものではなく、選び間違えることこそ、このシーンの 3 番目のステップが扱っている失敗です。

```csharp
using System.Text.Encodings.Web;

var body = HtmlEncoder.Default.Encode(comment);      // タグの間
var query = UrlEncoder.Default.Encode(searchTerm);   // URL の中
var script = JavaScriptEncoder.Default.Encode(name); // スクリプトリテラルの中
```

- ポリシーはミドルウェアから送ってすべての応答が載せるようにし、レポート専用モードで始めます。`report-uri` も指定します。ないと違反は読者自身のコンソールにしか届かず、こちらが読めるものが何もありません。その先のエンドポイントは JSON の POST を受け取って本文を記録するだけで足ります。

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers["Content-Security-Policy-Report-Only"] =
        "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; " +
        "report-uri /csp-reports";   // これがないと、どこにも何も報告されない
    await next();
});
```

- セッション Cookie のフラグは、認証スキームを設定する場所で指定します。既定値がずっとそのままであることを当てにしません。

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });
```

- クライアントのスクリプトへ値を渡すときは、生成した JavaScript ではなくマークアップを通します。`<div id="board" data-board-name="@board.Name"></div>` は値を HTML 属性に置いて Razor に正しくエンコードさせ、`document.getElementById("board").dataset.boardName` はパーサーがそれをコードとして見ることなく値を読み戻します。
- リッチテキストには自作のヘルパーではなく保守されているサニタイザーパッケージを足し、出力地点で回し、原文はデータベースに残します。無害化した形を保存してしまうと、後で許可リストを変えても適用し直す相手が残っていません。
