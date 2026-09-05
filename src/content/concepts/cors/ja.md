---
title: "CORS"
summary: "CORS は、別のオリジンのページがレスポンスを読んでよいかをブラウザーがサーバーに尋ねる仕組みです。リクエスト自体はたいていサーバーまで届き、CORS が決めるのはページがその答えを見られるかどうかであり、だからこそブラウザー以外のものにとってはセキュリティ境界になりません。"
category: "アプリケーションセキュリティ"
scene: cors
steps:
  - title: "リクエストは通り、答えは届かない"
    text: "shop.example のページがまず自分のオリジンを呼び（許可は要りません）、次に api.example を呼びます。サーバーはそちらを 2 回とも処理します。ブラウザーは 2 回とも応答を捨てます。サーバーがこのオリジンは読んでよいと言っていないからです。"
  - title: "正確に許可する"
    text: "サーバーが読んでよいオリジンを名指しすると、ブラウザーはその応答を通します。ワイルドカードは公開データなら構いませんが、Cookie と一緒には決して使えません。"
  - title: "プリフライト"
    text: "単純な GET やフォーム送信を超えるリクエストでは、ブラウザーがまず OPTIONS でどのメソッドとヘッダーが許可されるかを尋ね、答えをキャッシュしてから実際のリクエストを送ります。サーバーが一覧に入れなかったメソッドはブラウザーから出ていきません。"
  - title: "セキュリティ境界ではない"
    text: "サーバー、スクリプト、curl はブラウザーの関門をまったく見ません。悪意あるページは依然としてブラウザーにユーザーの Cookie を API へ送らせることができます。CORS は答えを隠すだけです。SameSite は Cookie をリクエストに載せず、antiforgery トークンはそのリクエストを拒みます。"
related:
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Authorization Code
    slug: authorization-code
  - label: API Gateway
    slug: api-gateway
references:
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Fetch Standard, CORS protocol"
    url: https://fetch.spec.whatwg.org/#http-cors-protocol
---

## いつ使うか

- あるオリジンのブラウザーページが別のオリジンの API のレスポンスを読む必要があるときに使います。別ホストの自前 API を呼ぶシングルページアプリ、顧客サイトに埋め込むウィジェット、サブドメインで分かれたフロントエンドが該当します。
- サードパーティの Web アプリから利用される公開 API には欠かせません。CORS ヘッダーがないと、そうしたアプリは呼び出せても何も受け取れず、相手の開発者には API が壊れているように見えます。
- クライアントがブラウザーのときだけ意味を持ちます。サーバー間の呼び出し、バックグラウンドジョブ、モバイルアプリ、コマンドラインツールは CORS を参照しないので、それらのためにヘッダーを足しても何も変わりません。

## 注意点

- CORS はリクエストがサーバーに届くのを止めず、ページがレスポンスを読むのを止めます。状態を変えるエンドポイントは CORS ではなく SameSite Cookie と antiforgery トークンで守ってください。
- `Access-Control-Allow-Origin: *` と資格情報を組み合わせてはいけません。正確なオリジンを列挙します。ワイルドカードはデータが公開であるというブラウザー向けの合図であり、ブラウザーはそれを Cookie や `Authorization` ヘッダーと組み合わせません。
- `Origin` ヘッダーを検査せずにそのまま返さないでください。一覧と照合せずに反射したオリジンに `Allow-Credentials: true` が付けば、インターネット上のすべてのサイトに扉を開けたのと同じです。
- プリフライトは往復が 1 回増えます。`Access-Control-Max-Age` を設定し、カスタムヘッダーは最小限に保ってください。単純リクエストのメソッドとコンテンツタイプの範囲に収まれば、そもそも質問が発生しません。
- `UseCors` はルーティングの後、認証と認可の前に置きます。そうすれば認証がプリフライトを拒否する前に答えが返ります。`OPTIONS` リクエストは資格情報を運ばないので、認可フィルターが先に動くとプリフライトは拒否され、実際のリクエストは送られません。
- 何を公開したのか理解しないまま、すべてを自分のオリジン経由のプロキシにして CORS を「解決」しないでください。プロキシを挟むとすべての呼び出しが同一オリジンになり、ブラウザーは何も確認しなくなります。

## .NET では

ASP.NET Core は CORS を名前付きポリシーとして構成し、ミドルウェアとして適用します。antiforgery の設定をすぐ隣に置くのは、この 2 つが同じ問いの別々の半分を担当するからです。

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("shop", policy => policy
        .WithOrigins("https://shop.example")
        .WithMethods("GET", "PUT")
        .WithHeaders("Content-Type", "Authorization")
        .AllowCredentials()
        .SetPreflightMaxAge(TimeSpan.FromHours(1)));
});
builder.Services.AddAntiforgery(options => options.Cookie.SameSite = SameSiteMode.Lax);

var app = builder.Build();
app.UseRouting();
app.UseCors("shop");          // ルーティングの後、認証の前
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPut("/orders/{id:int}", UpdateOrder).RequireCors("shop").RequireAuthorization();
```

`WithOrigins` はスキームと既定以外のポートまで含めた正確なオリジンを受け取り、文字列として比較するため、`https://shop.example` と `https://shop.example/` は同じ値になりません。`AllowAnyOrigin` と `AllowCredentials` を併用すると例外になります。どのみちブラウザーが拒否するヘッダーを、フレームワークが先に止めているわけです。まとまった範囲のオリジンを受け入れたい場合は自分で書いた述語を `SetIsOriginAllowed` に渡し、受け取った値をそのまま返すのではなく検査する処理にしてください。

サーバー間の呼び出しとモバイルアプリはこの流れを一切通らないので、認可はトークンとポリシーで別に行う必要があります。同じ `PUT /orders/{id}` を呼ぶバックグラウンドサービスには CORS も antiforgery の検査も適用されず、そのサービスとエンドポイントの間に残るのは `RequireAuthorization` だけです。CORS は本物の認可の上に乗ったブラウザー向けの便宜と考え、認可そのものにはしないでください。
