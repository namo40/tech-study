---
title: "OAuth 2.0"
summary: "OAuth 2.0 はパスワードを渡す代わりに、スコープと寿命が決まった委任トークンを使います。アプリはしばらくの間だけ 1 つの扉を開ける鍵を受け取り、ローテーションはトークンの盗難を検知できる出来事に変え、OpenID Connect がその上に「誰なのか」への答えを載せます。"
category: "認証と認可"
scene: oauth-2-0
steps:
  - title: "家全体の鍵を渡しません"
    text: "昔のやり方では、アプリはパスワードを要求し、そのときからユーザーの名前で何でも永遠にできました。OAuth はそれを委任に変えます。本人が承認すれば、サーバーはしばらくの間だけ 1 つの扉を開ける鍵を発行することになります。鍵そのものは次のステップです。"
  - title: "code は領収書で、トークンが鍵です"
    text: "アプリはユーザーを認可サーバーへ送り、本人が同意すると使い捨ての code が戻ってきます。アプリはそれを read のスコープを持つアクセストークンと、後のためのリフレッシュトークンに交換します。アクセストークンが短命なのはわざとです。API は人ではなくトークンを検査します。"
  - title: "有効期限は設計であり、ローテーションは警報です"
    text: "アクセストークンが死ぬと API は 401 を返し、リフレッシュトークンが静かに新しいものを買ってきます。新しいリフレッシュトークンも一緒に来ます。それぞれがちょうど 1 回しか通らないからです。盗まれた古いリフレッシュトークンが再使用されると、サーバーは再使用に気づいてその系列全体を取り消します。盗難は永続的なものではなく、騒がしいものになります。"
  - title: "OAuth は何をしてよいかに答え、OpenID Connect は誰なのかに答えます"
    text: "もう一度サインインするとき、アプリは openid スコープを要求し、アクセストークンの隣に ID トークンが届きます。ID についての署名付きの言明であり、アプリが読むものであって API へ送るものではありません。2 つの質問に 2 つのトークン、これで両方に答えがあります。"
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Token Rotation
    slug: token-rotation
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Key Rotation
    slug: key-rotation
references:
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "Refresh tokens in the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

## いつ使うか

OAuth 2.0 は委任のプロトコルです。ある 1 つの状況のために存在していて、その状況を見分けられるようになれば、残りの設計はそこから出てきます。何かのソフトウェアが人の代わりに、その人が持つリソースに対して、その人になってしまわずに動く必要がある状況です。

- アプリがユーザーの代わりに API を呼びます。予定を読み取るツール、アルバムを取りに行く印刷サービス、サインインした社員として注文サービスに問い合わせる社内ダッシュボードがそうです。アプリに必要なのは ID ではなくアクセスで、しかも境界のあるアクセスです。
- 自社の SPA やモバイルアプリが自社の API と話します。これも委任です。ブラウザーや携帯電話は秘密を守れないからです。ここでの流れは authorization code と PKCE で、理由は URL から code を写し取った相手にとってその code が無価値でなければならないからです。
- サーバーで描画する Web アプリがユーザーをサインインさせてから API を呼びます。ここでも流れは authorization code で、PKCE も同様です。RFC 9700 は public client には MUST、confidential client には RECOMMENDED としています。本当に client secret を保管できるアプリでも、PKCE は費用がかからず、注入の穴を 1 つふさぎます。
- ユーザーがまったく登場しないサービス間の通信です。client credentials は委任の部分が抜けた OAuth です。トークンはどのサービスが呼んでいるかを述べ、スコープはそのサービスが何をしてよいかを述べます。同意する人がいないという点こそが、この流れが正しい理由です。
- 代わりの案が他人のパスワードを保存することになる場所すべてです。設計文書に「資格情報を預かる必要がある」という一文があれば、まだ誰もその言葉を出していなくても、そこが OAuth の出番です。

合わないのは 1 つだけです。間に API のない、自社アプリケーションへの普通のログインです。OAuth は「このアプリがこの操作をしてよいか」に答え、セッションの Cookie は「1 分前と同じブラウザーか」に答えます。トークンが現代的に見えるという理由で手を伸ばすと、単純なサインインがトークンキャッシュと更新ループを抱え、Cookie よりセキュリティが弱い結果に終わります。

## 注意点

- トークンは持参人払いの証書です。期限が切れるまで、API から見れば持っている人が本人です。この一文からほとんどの規則が出てきます。短い寿命、すべての区間での TLS、URL やログ行や分析用の送信内容には決して入れないこと、クロスサイトスクリプティングの欠陥が届き得るなら `localStorage` にも置かないことです。
- アクセストークンはセッションではありません。有効期限はありますが、サインアウトも、無操作時間の上限も、期限切れより前に当てにできる取り消しもありません。アプリケーションのログイン状態をアクセストークンで組み立てると、セッションの制御手段を 1 つも持たないセッションができあがります。
- ID トークンを API へ送ってはいけません。そしてクライアントがアクセストークンから誰がサインインしたかを割り出してもいけません。ID トークンはアプリ宛て、アクセストークンは API 宛てに発行され、それぞれ自分の受け取り手に向けて署名されています。ID トークンを受け入れる API は別の受け取り手のために作られたトークンを受け入れており、`aud` の検証はまさにその取り違えを防ぐためにあります。アクセストークンから ID のクレームを読んでよい唯一の当事者は API で、それも自分の audience に対してそのトークンを検証したあとに限ります。
- リフレッシュトークンにはローテーションと再使用検知が必要です。それがなければ、盗まれたリフレッシュトークンは静かで永続的なアクセスになります。それがあれば、使い終わったトークンの 2 度目の使用が信号になり、正しい対応はトークン 1 つではなく系列全体を取り消すことです。
- スコープは粗い権限であって、ドメインの認可モデルではありません。`orders.read` は入口にある扉です。このユーザーがまさにこの注文を読んでよいかは、ドメインだけが答えられる問いです。スコープを答えのすべてとして扱うと、扉さえ通れば誰にでも開ききった API になります。
- 呼び出しごとにトークンをすべて検証します。issuer が公開している鍵で署名を確かめ、`iss`、`aud`、`exp`、`nbf` を見ます。形が整っているだけのトークンは自分宛てに発行されたトークンではなく、audience の検証を飛ばすことは認可と飾りの差です。
- redirect URI もセキュリティモデルの一部です。完全一致の登録、ワイルドカードなし、ドメインのどこにも開いたリダイレクターを置かないことです。authorization code はその URI にだけ届きますが、それはサーバーが勝手に判断しないときにだけ本当のことになります。
- 同意は形式的な手続きではありません。要求するスコープが、そのままユーザーの承諾する内容です。必要より多く求めれば同意画面は怖くなり、承認は通りにくくなり、事故が起きたときの被害も大きくなります。

## .NET では

API 側の仕事は検証です。`Microsoft.AspNetCore.Authentication.JwtBearer` は issuer のディスカバリー文書から署名鍵を取得し、署名を確かめ、指定した条件を強制します。

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            // 他人の API 向けに発行されたトークンが自分の API で通ることを
            // 止めてくれるのが、この audience の検査です。2 つの項目はどちらも
            // この 1 つの API です。v2.0 のトークンはクライアント ID を、
            // v1.0 のトークンは代わりに `api://` リソース URI を運ぶことがあります。
            ValidateAudience = true,
            ValidAudiences = [ordersClientId, $"api://{ordersClientId}"],
            ValidateIssuer = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
```

スコープはポリシーになります。粗い扉を一度だけ宣言しておき、各エンドポイントは自分がどの扉の後ろにいるかだけを述べます。アプリがすでに Microsoft.Identity.Web を参照しているなら、`RequireScope` と `[RequiredScope]` が同じ分割をしてくれます。

```csharp
builder.Services.AddAuthorization(options =>
{
    // `scp` は空白区切りの 1 つの文字列として届くので、クレームの完全一致では
    // 複数のスコープを許可されたトークンが拒まれます。
    options.AddPolicy("orders.read", policy => policy.RequireAssertion(context =>
        (context.User.FindFirstValue("scp") ?? "").Split(' ').Contains("orders.read")));
});

app.MapGet("/orders/{id}", async (string id, ClaimsPrincipal user, IOrders orders) =>
{
    // スコープは呼び出し側が注文を読んでよいと述べます。まさにこの注文を読んで
    // よいかはドメインの問いで、その問いはここで立てる必要があります。
    var order = await orders.FindAsync(id);
    return order is null || !order.BelongsTo(user.FindFirstValue("oid"))
        ? Results.NotFound()
        : Results.Ok(order);
}).RequireAuthorization("orders.read");
```

ユーザーをサインインさせる Web アプリなら、`ResponseType` で求めたときに OpenID Connect のハンドラーが authorization code の流れを走らせ、そのとき PKCE は既定で有効です。

```csharp
builder.Services
    .AddAuthentication(options =>
    {
        // アプリが以後のすべてのリクエストで読むのは Cookie で、OpenID Connect
        // ハンドラーはサインインだけを担当します。こちらを既定スキームにすると
        // 起動時エラーになります。リモートハンドラーが自分自身にサインインさせ
        // られることになるからです。
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddOpenIdConnect(options =>
    {
        options.Authority = "https://login.microsoftonline.com/{tenant}/v2.0";
        options.ClientId = configuration["Oidc:ClientId"];
        options.ClientSecret = configuration["Oidc:ClientSecret"];
        options.ResponseType = "code";           // "token" や "id_token token" は使いません
        options.UsePkce = true;
        options.SaveTokens = true;
        options.Scope.Add("offline_access");     // リフレッシュトークンを求めるのがこの行です
        options.Scope.Add("api://orders/orders.read");
    })
    .AddCookie();                                // ID トークンは Cookie のセッションになります
```

最後の行は一度立ち止まって見る価値があります。ハンドラーは ID トークンを持たせたままにしません。一度検証して `ClaimsPrincipal` に変え、Cookie を発行します。そこから先、アプリにはセッションがあり、トークンは API を呼ぶために使います。これが正しい分担で、シーンの 4 番目のステップが描いているものと同じ分担です。

アクセストークンの取得と保管は Microsoft.Identity.Web の担当です。`ITokenAcquisition` がリフレッシュトークンを保管し、キャッシュされたアクセストークンの期限が近づけば交換し、ローテーションを呼び出す側に気づかせずに処理します。

```csharp
builder.Services
    .AddMicrosoftIdentityWebAppAuthentication(configuration)
    .EnableTokenAcquisitionToCallDownstreamApi(["api://orders/orders.read"])
    .AddDistributedTokenCaches();                // 共有キャッシュなら台数を増やしても承認が残ります

public sealed class OrdersClient(ITokenAcquisition tokens, HttpClient http)
{
    public async Task<Order?> GetAsync(string id, CancellationToken ct)
    {
        var accessToken = await tokens.GetAccessTokenForUserAsync(["api://orders/orders.read"]);

        // DefaultRequestHeaders ではなくリクエストごとに設定します。クライアントは
        // 共有されるので、ある呼び出し元のトークンを次の呼び出し元のために
        // 残してはいけません。
        using var message = new HttpRequestMessage(HttpMethod.Get, $"/orders/{id}");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await http.SendAsync(message, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Order>(ct);
    }
}
```

これが本番で持ちこたえるかは 2 つの点で決まります。トークンキャッシュは分散キャッシュである必要があります。そうでないと、台数を増やしたアプリはリクエストが別のインスタンスに届くたびにリフレッシュトークンを失い、ユーザーは見なくてよいサインイン画面をまた見ることになります。そして client credentials 版の `GetAccessTokenForAppAsync` は audience の異なる別の許可方式です。ユーザートークンの扱いが面倒だからとリクエスト処理の途中でこちらへ手を伸ばすと、「このユーザーの代わりに動く」が「サービス全体として動く」へ静かに置き換わります。OAuth が防ぐために存在している、まさにその置き換えです。
