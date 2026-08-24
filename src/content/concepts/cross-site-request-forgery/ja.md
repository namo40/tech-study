---
title: "Cross-Site Request Forgery"
summary: "Cross-site request forgery は、自分が書いたのではないページがブラウザーを使って、ログイン済みのサイトへ認証済みリクエストを送らせる攻撃です。ブラウザーが cookie を付ける基準はリクエストの宛先であって、それを求めたページの出どころではありません。サーバーは、どこから来たのかを誰も見ないうちにその呼び出しを実行します。"
category: "アプリケーションセキュリティ"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
---

シーンの 4 番目のステップが、この攻撃のすべてです。`evil.example` のタブが `api.example` へ `POST /transfer` を送ると、cookie が `api.example` のものであり、リクエストもそこへ向かうため、ブラウザーは利用者の cookie を付けます。サーバーはそれを実行し、カウンターが増えます。ブラウザーが応答をページに渡さないと決めるのはその後で、そのときにはもうお金は動いています。「サーバーは実行した」と「ページは答えを読めない」の間にあるこの隙間が、あらゆる cross-site request forgery の住処です。

成立する理由は、ブラウザーの資格情報が周囲の空気のように自動で付いてくることにあります。cookie は宛先を基準に付き、本物のログインで作られたセッションと、利用者が信頼していないページに乗っ取られたセッションは、通信上まったく区別できません。攻撃ページは何も読む必要がありません。読み込み時に送信されるフォーム、状態を変える URL を指す画像タグ、`credentials: "include"` を付けた `fetch` があれば十分です。結果を見ることが目的ではなく、副作用が目的だからです。

CORS は防御にはならず、シーンはその理由をあえて見せています。関門は応答しか調べないので、ブロックされた応答はブロックされた「答え」であって、ブロックされたリクエストではありません。さらに厄介なことに、最も危険な形はたいてい単純リクエストで、preflight がまったく発生しません。フォームエンコードの `POST` は誰の許可も求めずにブラウザーを出ていきます。`Access-Control-Allow-Origin` で部外者を締め出そうとするのは、被害が終わってから走る検査に頼ることです。

実際に止める手段は 4 つあり、重ねて使います。セッション cookie を `SameSite=Lax` か `Strict` で宣言し、そもそもクロスサイトのリクエストに cookie を付けさせないこと。これだけで攻撃が頼っている自動的な資格情報が消えます。状態を変えるエンドポイントごとに antiforgery トークンを要求し、自分のオリジンが配ったページだけが読める値をリクエストに持たせること。状態を変えるリクエストでは `Origin` ヘッダーを検査する安価な二段目の確認を入れ、ヘッダーなしで届いたものは拒否すること。そして `GET` では何も変えないこと。`GET` は攻撃者が画像タグ 1 つで引き起こせる唯一の形です。

ASP.NET Core では `AddAntiforgery` と `app.UseAntiforgery()` が、フォーム送信とフォームデータを受け取る minimal API エンドポイントを担当します。Razor Pages と MVC ビューは隠しフィールドを自動的に出力し、JavaScript クライアントは antiforgery cookie からトークンを読んでリクエストヘッダーで返します。純粋なトークン API は事情が違います。`Authorization: Bearer` ヘッダーは自動では付かないので、偽造されたリクエストは単に未認証のまま届きます。bearer トークンがこの攻撃に強いと言われる本当の理由はこれであり、利便性のためにトークンを cookie に入れると決めた瞬間に成り立たなくなります。
