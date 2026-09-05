---
title: "SameSite Cookie"
summary: "SameSite は、別のサイトが開始したリクエストに Cookie を載せてよいかをブラウザーに伝える属性です。Lax はトップレベルの遷移を除くすべてで Cookie を外し、Strict はその遷移でも外し、None はすべてに付け直す代わりに Secure を要求します。"
category: "アプリケーションセキュリティ"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

シーンの 4 番目のステップでは、同じ偽造 `POST` が 2 回送られ、2 回目はサーバーに届きません。その間にサーバーの CORS ポリシーは何も変わっていません。変わったのは、セッション Cookie が `SameSite=Lax` で宣言され、別のサイトが開始したリクエストにブラウザーが Cookie を付けなくなったことだけです。リクエストはユーザーを示すものを何も持たずに到着し、エンドポイントは入口で追い返します。答えを隠すことと、そもそも呼び出しを成立させないことの違いがここにあります。

値は 3 つあります。`Strict` は、尋ねられるサイトと尋ねるサイトが同じ場合にだけ Cookie を付けます。他所からリンクをたどって来た場合も外れるため、リンク直後の最初のページはログアウトしているように見えます。`Lax` はちょうど 1 つの場合だけ緩めます。安全なメソッドによるトップレベルの遷移、つまり普通のリンククリックです。そのためユーザーはログインした状態で到着しますが、クロスサイトの `POST`、`fetch`、画像、iframe、フォーム送信は依然として何も運びません。`None` はどこにでも Cookie を付ける以前の挙動に戻し、ブラウザーは `Secure` が一緒にある場合のみ受け入れるので、平文の HTTP では送られません。

「同じサイト」は「同じオリジン」ではなく、この違いは構成図を描くときに効いてきます。サイトは登録可能ドメインで比較されるので、`app.example.com` と `api.example.com` は同じサイトであり `Lax` でも Cookie は付きます。一方 `shop.example` と `api.example` は別のサイトなので付きません。仕様が定めるサイトの定義ではスキームも数えるため、`http` のページが `https` のページを呼べばクロスサイトです。だからこそ、1 つの親ドメインの下に置いたフロントエンドと API は `Lax` のまま Cookie セッションを保てますし、本当に別ドメインにあるフロントエンドは、`None` に他のすべての防御を足すか、Cookie をやめて明示的に送るトークンにするかを選ぶことになります。

Chromium 系のブラウザーは属性のない Cookie を `Lax` として扱いますが、それは Cookie を設定してから 2 分以内の `POST` をまだ許す緩い形ですし、すべてのブラウザーが同じ扱いをするわけでもありません。これこそ値を書いておく最大の理由です。既定はこれまでにも変わっており、クライアントごとに挙動が異なり、明示した値は読む人に見える判断だからです。全体で一律に決めるのではなく、Cookie ごとに意図を込めて指定してください。セッション Cookie はたいてい `Lax` が適切で、埋め込みウィジェットや決済リダイレクトがサードパーティの文脈で必要とする Cookie は `None` と `Secure` にする必要があり、その場合は `SameSite` がやるはずだった仕事を antiforgery トークンが引き受けます。

ASP.NET Core では値は機能ごとの Cookie ビルダーにあります。Cookie 認証ハンドラーの `options.Cookie.SameSite = SameSiteMode.Lax`、`AddAntiforgery` の同じ設定、セッション Cookie の `SameSiteMode.Lax` です。`SameSiteMode.None` には自分で `CookieSecurePolicy.Always` を組み合わせなければなりません。フレームワークは何も確認せず、`Secure` なしで出ていった `None` の Cookie はブラウザーに捨てられます。`SameSiteMode.Unspecified` は代わりに選ぶのではなく属性そのものを省きます。これは防御の 1 層として扱ってください。クロスサイトのリクエストから自動的な資格情報を取り除くだけであり、そこで足りない部分は antiforgery トークンとオリジンの検査が埋める必要があります。
