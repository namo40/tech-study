---
title: "Authorization Code"
summary: "Authorization code フローは、アプリがユーザーのパスワードを一度も見ずにトークンを得る方法です。ブラウザーが認可サーバーへ行ってログインし、一度しか使えない code を持って戻ってくると、アプリはブラウザーが触れない経路でその code をトークンと交換します。"
category: "認証と認可"
scene: authorization-code
steps:
  - title: "手順"
    text: "アプリはブラウザーを認可サーバーに送ってログインさせます。サーバーは寿命の短い code を付けてブラウザーを送り返します。アプリはブラウザーが触れない経路で code をトークンと交換し、アクセストークンで API を呼びます。"
  - title: "なぜ code なのか"
    text: "ブラウザーを通るものは何でも漏れえます。URL、履歴、referrer、ログです。だから front channel には、一度きりで、アプリの secret なしには無価値な code だけを乗せます。トークンも同じ場所に落ちるので、back channel だけを通ります。"
  - title: "PKCE"
    text: "ブラウザーやモバイルアプリは secret を保持できません。そこでログインのたびに 1 つ作り出します。ランダムな verifier を、code を求めるときはハッシュで、code を使うときは平文で送ります。verifier なしに盗んだ code は役に立ちません。"
  - title: "短いトークンと、ローテーションする refresh"
    text: "アクセストークンは数分しか生きません。期限が切れると API は 401 を返し、アプリはリフレッシュトークンで新しいペアを受け取ります。リフレッシュトークンは一度しか使えません。古いものの再利用は盗難の兆候なので、サーバーはその系列全体を取り消します。"
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: CORS
    slug: cors
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: "Proof Key for Code Exchange (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
---

## いつ使うか

- ユーザーが ID プロバイダーを通してサインインするアプリすべてで使います。サーバーでレンダリングする Web アプリは client secret とともに、シングルページアプリやモバイルアプリは secret の代わりに PKCE とともに使います。
- ユーザーの代わりに API を呼ぶためのアクセストークンが必要なときに使います。ユーザーが登場しないサーバー間の呼び出しは client credentials フローを使い、そちらにはブラウザーも code も要りません。
- パスワードを ID プロバイダーだけに見せたいときに使います。アプリはパスワードを受け取らないので、アプリが破られてもアカウントが破られるわけではありません。

## 注意点

- client secret があっても PKCE を併用します。implicit フローと password grant は廃止された方式です。新しい設計には入れず、すでに使っているなら取り除く計画を立ててください。
- redirect URI は正確に登録し、正確に照合します。ワイルドカードや緩い前方一致、登録済みオリジンのどこかにある open redirect は、code をそのまま他人に渡すのと同じです。
- 戻ってきた応答では `state` を検証し、OpenID Connect なら ID トークンの `nonce` も検証します。`state` は応答をこのブラウザーが出したリクエストに結び付け、`nonce` は ID トークンをそのリクエストに結び付けます。
- アクセストークンは短命に保ち、リフレッシュトークンはローテーションさせます。使用済みのリフレッシュトークンが再び届いたら盗難とみなし、再利用されたそのトークンだけでなく系列全体を取り消してください。
- トークンはブラウザーが読めない場所に置きます。サーバーレンダリングのアプリならセッションかサーバー側のトークンストアです。`localStorage` に入れるのは、注入されたスクリプトにトークンを手渡すことです。
- ID トークンは API に送りません。ID トークンは誰がサインインしたかを述べるもので、それを要求したクライアントのためのものです。API が求めるのはアクセストークンと audience の検査です。

## .NET では

ASP.NET Core の Web アプリは、セッション用の Cookie ハンドラーとフロー用の OpenID Connect ハンドラーでユーザーをサインインさせます。以下のように `ResponseType = Code` を設定すれば、`AddOpenIdConnect` が code フローを実行し、`state` と `nonce` を検証し、PKCE を既定で有効にします。ハンドラー自身の既定の response type は `id_token` なので、code フローは勝手に得られるものではなく、求めるものです。

```csharp
// Web アプリ: authorization code フローでユーザーをサインインさせる。
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie()
.AddOpenIdConnect(options =>
{
    options.Authority = "https://login.example.com";
    options.ClientId = "shop-web";
    options.ClientSecret = builder.Configuration["Oidc:ClientSecret"];   // public client にはない
    options.ResponseType = OpenIdConnectResponseType.Code;
    options.UsePkce = true;
    options.SaveTokens = true;                                          // トークンは認証 Cookie に乗って運ばれる
    options.Scope.Add("openid");
    options.Scope.Add("profile");
    options.Scope.Add("offline_access");                                // リフレッシュトークンを要求する
    options.Scope.Add("shop.api");
});

// API: アクセストークンを受け取り、この audience 向けに発行されたことを確かめる。
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        options.Audience = "shop.api";
    });
```

`SaveTokens = true` はトークンを認証チケットのプロパティに入れ、そのチケットは暗号化された認証 Cookie の中に乗って運ばれます。スクリプトからは読めませんが Cookie が大きくなるので、このオプションは既定で無効です。チケットをサーバーに置いてブラウザーには鍵だけを渡すには、Cookie ハンドラーの `options.SessionStore` を設定します。更新は自動ではありません。アクセストークンの期限が近づいたらリフレッシュトークンで `/token` を自分で呼ぶか、それを代わりに行って新しいペアをセッションに書き戻すトークン管理ライブラリを使ってください。

シングルページアプリやモバイルアプリは保持できる secret がないので、public client として登録して PKCE に頼ります。SPA では backend-for-frontend を勧めます。サーバーがフローを完了させてトークンを保持し、ブラウザーには自分のオリジンの Cookie だけを渡します。
