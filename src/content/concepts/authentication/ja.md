---
title: "Authentication"
summary: "Authentication は ID の主張を証明することです。主張と証拠をそろえて受け取り、その場で検証します。人にはパスワードと防御を、機械には鍵を、両側にはそれぞれの証明書を使います。システムは受け入れる証拠のうち最も弱いものの分だけ強いのです。"
category: "認証と認可"
scene: authentication
steps:
  - title: "主張はただで、認証は証拠の検査です"
    text: "名乗るだけなら費用はかかりません。名前しか聞かない扉を、ゴーストはそのまま通り抜けます。本物の認証は証拠を求め、その場で検証します。知っているもの、持っているもの、その人自身であるものです。扉は検査した瞬間から飾りではなくなります。"
  - title: "証拠は盗めるものであり、システムは最も弱い証拠の分だけ強いのです"
    text: "正しいパスワードは、間違った手の中でも同じ検査を通ります。検証者は意図ではなく証拠を見るからです。だからパスワードは単独ではなく、防御に囲まれて運ばれます。検証は金庫ではなく扉です。"
  - title: "機械にも ID があり、パスワードを打つ指はありません"
    text: "何も示せなければ、サービスもほかと同じく断られます。一度発行され、呼び出しのたびに提示され、台帳と照合される鍵があれば通ります。所持こそが証拠であり、だから漏れた鍵はそのまま ID の漏洩です。"
  - title: "mTLS は証明を相互にします。両側が証明書を差し出します"
    text: "これまでは呼ぶ側だけが自分を証明し、サーバーは信頼で受け入れられていました。mutual TLS では互いが信頼する機関の署名した証明書をそれぞれ提示し、接続そのものが ID になります。秘密は回線を渡らず、どちら側になりすますにも、盗み聞きではなく秘密鍵を盗む必要があります。"
related:
  - label: Authorization
    slug: authorization
  - label: API Key
    slug: api-key
  - label: Mutual TLS
    slug: mutual-tls
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
references:
  - title: "Overview of ASP.NET Core authentication"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "What is Microsoft Entra authentication?"
    url: https://learn.microsoft.com/en-us/entra/identity/authentication/overview-authentication
---

## いつ使うか

- 応答が誰の呼び出しかによって変わるすべてのエンドポイントで、最初の質問として使います。公開の価格表には誰の ID もいりませんが、注文履歴にはちょうど 1 人分の ID がいります。応答が呼び出し元ごとに変わる瞬間から、この呼び出し元が誰なのかを確定する何かが必要になり、その確定は誰かが書き込んだヘッダーではなく証拠から出てこなければなりません。
- 人をサインインさせるときに使います。パスワードはよくある 1 つ目の要素ですが、省略できない仕組み一式を連れてきます。保存時の適応的なハッシュ、成功時に発行するセッション、セッションを運ぶ Cookie、そして失敗すると痛い操作のための 2 つ目の要素です。設計の中でパスワードは最も小さい部分です。
- 誰も画面の前に座っていないサービス間の呼び出しに使います。バックグラウンドのワーカー、webhook の受け口、別のマイクロサービスを呼ぶマイクロサービスは、それぞれ自分の ID を必要とし、それは手に持っているもので証明されます。API キー、クライアント証明書、あるいは秘密そのものをなくしてくれるプラットフォーム発行のトークンです。
- 認可が動く前に使います。2 つの質問は分かれていて順番があります。認証が ID を作り、認可がそれを消費します。誰も確定していない ID に対する権限の検査は、推測に対する権限の検査であり、シーンの 1 番目のステップが描いているのはまさにそれです。
- 証拠がネットワークを渡る場所ならどこでも使います。ここに出てくるどの方式も、相手が検査できる何かを送ることに帰着するので、通信路はデプロイの細部ではなく方式の一部です。平文で送った証拠は寄付した証拠であり、世界で一番丈夫な検証者でも、誰でも読める回線を直してはくれません。

## 注意点

- サインインの成功は権限ではありません。認証は「これは誰か」に答えてそこで止まります。この呼び出し元がこの対象にこの操作をしてよいかは、独自の規則を持つ 2 つ目の判断です。1 つ目の答えを 2 つ目の答えとして扱うことがアクセス制御の欠陥であり、実際のアプリケーションで最もよく見つかる重大な指摘の 1 つです。
- パスワードを元に戻せる形で保存しないでください。暗号化は鍵を手にした人なら誰でも戻せますし、その鍵はデータのすぐ隣にあります。ソルト付きの適応的なハッシュを使ってください。PBKDF2、bcrypt、scrypt、Argon2 のどれかを、パスワード 1 つの検証はサーバーにとって安く、10 億個の試行は攻撃者にとって安くならないように調整して使います。方式を自作せず、フレームワークが用意したものを使ってください。
- 失敗に速度制限とロックをかけないと、検証者がオラクルになります。即座に、しかも永遠に答えてくれる扉は、数百万回の推測も喜んで確認してくれます。しかも「そのようなユーザーはいない」と「パスワードが違う」を区別して答えるなら、まずアカウントの一覧が抜き取られます。失敗が数回たまったら遅くし、どちらの場合も同じ答えを返し、何が起きたかを記録します。
- サインインのときにセッションを発行し直します。ブラウザーがすでに持っていた識別子がサインイン後も生き残ると、その識別子を仕込んだ攻撃者が被害者としてサインインしている状態になります。セッション固定は規則 1 つで閉じます。認証された ID を運ぶセッションは、認証より前に存在したセッションであってはなりません。
- API キーは ID なので、ID として扱います。鍵ごとに必要な最小の範囲を与え、リポジトリに入る設定ではなく秘密として保管し、URL とログから外し、続けられる周期でローテーションします。漏れた鍵は漏れたパスワードではなく、気づく人のいない漏れたアカウントです。
- トークンの形式を自作せず、他人が作ったものの検証も飛ばさないでください。署名は検証がする分だけの値打ちしかありません。アルゴリズム、issuer、audience、有効期限を毎回確認し、トークン自身が提案してくるアルゴリズムは決して受け入れません。
- 受け入れる方式のうち最も弱いものがシステムを決めます。丁寧に組んだ mTLS の経路と、昔の連携から残って忘れられた basic auth のエンドポイントが同居していれば、そのシステムは basic auth です。今のチームが作っていないものも含めて入口を全部数え上げ、守らないものは消します。

## .NET では

ASP.NET Core は認証をスキーム単位に分けます。スキームとは、リクエストから証拠を読み出して `ClaimsPrincipal` に変える方法を知っている名前付きのハンドラーで、既定のスキームは何も指定されなかったときに動くものです。ブラウザーには Cookie、API には bearer token というのが普通の 2 つの場合で、1 つのアプリケーションが両方を持てます。ただし既定にできるのは一方だけなので、API のエンドポイントはもう一方を名指しする必要があります。`[Authorize(AuthenticationSchemes = "api")]` か、`AddAuthenticationSchemes("api")` で組んだポリシーです。

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
        // 絶対的な 8 時間です。操作しても延びないので、どのセッションにも
        // 誰かが決めた終わりがあります。スライディング有効期限も妥当なもう 1 つの
        // 答えで、Cookie Authentication のページはそちらを勧めています。
        options.SlidingExpiration = false;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
    })
    .AddJwtBearer("api", options =>
    {
        options.Authority = "https://login.example.com/";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidAudience = "orders-api",
            // リクエストごとにこれらが全部確認されます。どれか 1 つでも
            // 飛ばす検証は、署名の検査でしかありません。
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
        };
    });

app.UseAuthentication();
app.UseAuthorization();
```

パスワードの保存は自分で書かないほうがよい部分です。ASP.NET Core Identity は今どきの反復回数とバージョン付きの形式を持つハッシュ器を用意しているので、設定を上げても全アカウントが壊れることはなく、次のサインイン成功時にハッシュし直されます。

```csharp
// SignInManager が一連の手順をまとめて行います。ハッシュの比較、ロックアウトの
// 回数の計上、そして成功時の新しいセッションまでです。ここでパスワードは変数になりません。
var result = await signInManager.PasswordSignInAsync(
    userName, password, isPersistent: false, lockoutOnFailure: true);

if (result.RequiresTwoFactor) return Results.Redirect("/mfa");

// ロックアウトは呼び出し元に知らせません。実在するアカウントしかロックされないので、
// 区別された答えはどのアカウントが存在するかを確認させてしまいます。ログに残し、
// 警報を出し、間違ったパスワードとまったく同じ応答を返します。
if (result.IsLockedOut) logger.LogWarning("Lockout on {UserName}", userName);
if (!result.Succeeded) return Results.Unauthorized();
```

ロックアウトはコードではなく設定であり、扉とオラクルを分けるのがまさにこれです。

```csharp
builder.Services.Configure<IdentityOptions>(options =>
{
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.User.RequireUniqueEmail = true;
});
```

機械の側では、証明書認証も他と同じスキームです。ハンドシェイクはリクエストがパイプラインに届く前にサーバーで終わっているので、ハンドラーはすでに届いた証明書の連鎖と取り消しの状態を検証し、そのうえで `OnCertificateValidated` が、開発者にしか答えられない問いを尋ねます。この正しい証明書が、登録済みの呼び出し元のものかどうかです。そもそも Kestrel が証明書を要求しなければならず、それはスキームのオプションではなくトランスポートの設定です。その側は Mutual TLS のページにあります。

```csharp
builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
        options.Events = new CertificateAuthenticationEvents
        {
            OnCertificateValidated = context =>
            {
                var thumbprint = context.ClientCertificate.Thumbprint;
                if (!registry.IsKnown(thumbprint))
                {
                    context.Fail("unknown client certificate");
                    return Task.CompletedTask;
                }

                context.Principal = registry.PrincipalFor(thumbprint);
                context.Success();
                return Task.CompletedTask;
            },
        };
    });
```

いちばんよい秘密は、存在しない秘密です。Azure ではマネージド ID が、動いているワークロードにプラットフォームの発行しローテーションする資格情報を与えるので、接続文字列にはホスト名しか残りません。

```csharp
// 設定にも鍵がなく、ボールトにも鍵がなく、ローテーションする鍵もありません。
var client = new BlobServiceClient(
    new Uri("https://contoso.blob.core.windows.net"),
    new DefaultAzureCredential());
```

持っておく価値のある習慣が 2 つあります。ID は claim に入れ、呼び出し元が渡したパラメーターではなく `ClaimsPrincipal` から読みます。そもそもスキームを置いた目的が、その点で呼び出し元を信じないことだったからです。そして、呼び出し元が誰かを証明していないときは `401` を、証明していてなお許されないときは `403` を返します。前者はサインインを促し、後者は促しません。混ぜてしまうと、サインイン済みのユーザーがログイン画面を回り続けることになります。
