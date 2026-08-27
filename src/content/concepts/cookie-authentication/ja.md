---
title: "Cookie Authentication"
summary: "Cookie authentication は、ログインしたユーザーに cookie を植え、それ以降ブラウザーがそのサイトへ向かうすべてのリクエストに cookie を自動で付ける方式です。リクエストが自分のページから来たか他人のページから来たかは問いません。その自動性が便利さそのものであり、cross-site request forgery が狙うのもまさにそこです。"
category: "認証と認可"
scene: cookie-authentication
steps:
  - title: "Cookie でログイン状態になります"
    text: "一度ログインするとサーバーが cookie を植え、それ以降ブラウザーはこのサイトへのすべてのリクエストに自分で cookie を付けます。HttpOnly はスクリプトが読めないようにします。ページが触れないものを、ブラウザーが代わりに運びます。"
  - title: "自動とは、選ばないという意味です"
    text: "あなたが作っていないページがあなたのサイトへフォームを送信しても、ブラウザーは同じように cookie を付けます。サーバーにはログイン済みのリクエストに見えるだけで、あなたのページから来たのか他人のページから来たのか区別できません。それが cross-site request forgery であり、cookie がその乗り物です。"
  - title: "SameSite が最初の線を引きます"
    text: "cookie に Lax を付けると、他サイト発の POST には載らなくなります。偽造されたリクエストは手ぶらで到着して失敗します。トップレベルの遷移にはまだ載るのでリンクは動き続けます。Strict はその扉まで閉じる代わりに、外から入るすべてのリンクがログアウト状態で始まります。"
  - title: "あなたのページだけが返せるトークン"
    text: "サーバーはフォームの中に antiforgery トークンを隠しておきます。本物の送信は cookie とトークンを一緒に返しますが、偽造した側はページを読めないのでトークンを返せません。SameSite とオリジン確認を重ねれば、それぞれの線は違うふうに破れ、合わせれば持ちこたえます。"
related:
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
  - label: Sticky Session
    slug: sticky-session
references:
  - title: "Use cookie authentication without ASP.NET Core Identity"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Set-Cookie"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
---

## いつ使うか

- ブラウザーがそのままクライアントであるファーストパーティの Web アプリです。サーバーレンダリングのページ、Razor Pages、MVC、Blazor Server のように、リクエストを送る主体と資格情報を保管する主体が同じなら、資格情報を持ち歩かせるためのコードは一行もいりません。
- シングルページアプリの前に置く backend-for-frontend です。ブラウザーは cookie で BFF と話し、BFF はトークンで API と話すので、トークンが JavaScript まで降りてきません。このパターンが存在する理由が、cookie のほうが安全な半分だからです。
- スクリプトに資格情報を読ませてはいけない場合です。`HttpOnly` は `localStorage` に置いたトークンが決して持てない性質であり、本来ならトークンごと持ち出されていた cross-site scripting の欠陥が、ページが開いている間だけセッションを使える程度で済む理由でもあります。
- タブを閉じても、再読み込みしても、ブラウザーが落ちてもセッションが生き残ってほしいけれど、その保存コードは自分で書きたくない場合です。有効期限も更新もサイズ上限もブラウザー側の仕事になります。
- ログアウトが実際に意味を持たなければならない場合です。サーバー状態を背負った cookie セッションはその場で無効にできますが、自己完結したトークンにはそれができません。

## 注意点

- cross-site request forgery への防御がない cookie 認証は開いた扉であり、既定の状態がすでに開いた扉です。ブラウザーが cookie を付けるのは、リクエストがあなたのサイトへ向かったからであって、あなたのページが送ったからではありません。状態を変えるエンドポイントはすべて、他人のページからも届くものとして扱います。
- ブラウザーの既定値に頼らず、`SameSite=Lax` を明示的に指定します。いまの主要ブラウザーの既定値は `Lax` ですが、属性なしで書いた cookie はユーザーのブラウザーが今年どう決めたかに運命を委ねることになり、古いクライアントは依然として `None` として動きます。
- `Lax` が答えのすべてではありません。他サイト発の POST では cookie を押しとどめますが、トップレベルの GET 遷移にはまだ載るので、GET で状態を変えるエンドポイントはそのまま偽造できます。GET で状態を変えないでください。状態を変える側には antiforgery トークンを付けます。
- `Strict` は遷移の扉まで閉じ、その分の代価を取ります。検索結果やメールのリンクから来たユーザーはログアウト状態で着地し、次のクリックでもう一度ログインすることになります。銀行には合う設定で、コンテンツサイトには合わない設定です。
- `HttpOnly` と `Secure` は常に付け、可能なら `__Host-` 接頭辞まで使います。`HttpOnly` は cookie を `document.cookie` から外し、`Secure` は平文の接続に載せず、`__Host-` 接頭辞は `Domain` 属性なしでちょうど一つのホストに cookie を縛るので、隣のサブドメインが乗っ取られたときに自分のサイトが受け入れる cookie を書き込まれずに済みます。
- ログインの時点で cookie を発行し直します。session fixation は、被害者がログインする前に攻撃者が既知のセッション識別子をブラウザーへ植えておき、ログインが済んだらそのセッションに乗る攻撃です。認証のあとに `SignInAsync` を呼ぶことが、新しい識別子を作る作業にあたります。
- 寿命の長い cookie は、それが触れるすべての窓を広げます。スライディング有効期限は活動中のユーザーをログイン状態に保ちながら、遊んでいるセッションに無期限を与えません。その上に絶対的な有効期限を重ねれば、盗まれた cookie が価値を持つ期間に天井ができます。
- cookie はあくまでブラウザーの資格情報です。モバイルアプリ、デーモン、データセンターから API を呼ぶサービスには cookie の入れ物もなく、SameSite の保護もありません。そうした呼び出し元にはトークンが合っており、一つのエンドポイントに二つの方式を混ぜると、そのエンドポイントの安全さは弱いほうに揃います。
- 規模も実際の制約です。暗号化された principal を載せた cookie はすべてのリクエストに乗り、上限はおよそ 4 KB なので、クレームが多いならサーバー側に置き、cookie には鍵だけを載せます。

## .NET では

スキームの登録は一度きりで、オプションがそのままセキュリティの姿勢になります。以下に、そのままにしておいてよい既定値は一つもありません。

```csharp
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "__Host-session";
        options.Cookie.HttpOnly = true;                        // no script may read it
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;            // set it, never inherit it
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.LoginPath = "/signin";
        // An API call must get a status code, not a redirect to a login page.
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
```

cookie を作り出すのは `SignInAsync` であり、この呼び出しが session fixation を閉じる地点です。ブラウザーがそれまで持っていた識別子は、サーバーがいま作ったものに置き換わります。

```csharp
var claims = new List<Claim>
{
    new(ClaimTypes.NameIdentifier, user.Id),
    new(ClaimTypes.Name, user.DisplayName),
};
var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

await HttpContext.SignInAsync(
    CookieAuthenticationDefaults.AuthenticationScheme,
    new ClaimsPrincipal(identity),
    new AuthenticationProperties { IsPersistent = rememberMe });
```

antiforgery のほうは別の半分で、人が忘れるのもこちらです。MVC と Razor Pages では form タグヘルパーが隠しフィールドを代わりに書き、`[ValidateAntiForgeryToken]` がそれを検査します。ただし全体に `[AutoValidateAntiforgeryToken]` を掛けるほうがたいてい良い形です。安全でないメソッドをすべて検査して GET には触れないので、新しいアクションを作るたびに誰かが属性を覚えていてくれることを当てにせずに済みます。

```csharp
builder.Services.AddControllersWithViews(options =>
    options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
```

Minimal API は antiforgery ミドルウェアから同じ保護を受けます。このミドルウェアは認証のあとに動き、フォームを載せた安全でないリクエストごとにトークンを検査します。

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapPost("/transfer", (TransferRequest request) => Results.Ok())
   .RequireAuthorization();
```

トークンを自分で確かめる必要があるエンドポイント、たとえばスクリプトがヘッダーに載せて送る fetch のような場合は、`IAntiforgery.ValidateRequestAsync` がその呼び出しで、ページへ返すトークンを渡すのが `GetAndStoreTokens` です。

```csharp
app.MapGet("/antiforgery/token", (IAntiforgery antiforgery, HttpContext context) =>
{
    var tokens = antiforgery.GetAndStoreTokens(context);
    return Results.Ok(new { token = tokens.RequestToken });
});

app.MapPost("/api/transfer", async (IAntiforgery antiforgery, HttpContext context) =>
{
    await antiforgery.ValidateRequestAsync(context);   // throws when it does not match
    return Results.Ok();
});
```

このトークンは一つの値ではなく一組です。片方は専用の cookie へ、もう片方はフォームかヘッダーへ入り、検証は二つが一致するかを見ます。偽造されたページがこれを作り出せない理由がここにあります。セッション cookie を送らせることも antiforgery cookie を送らせることもできますが、フィールドに何を入れるべきかはあなたのページを読まなければ分からず、二つの片は互いに合っていなければなりません。

同じ姿勢に属する部品があと二つあります。`IUserClaimsPrincipalFactory` や `OnValidatePrincipal` は、生きている途中のセッションをデータベースと突き合わせ直す場所であり、すでに発行された cookie を持つ無効化済みアカウントがそれを使えなくなるのもここです。そして cookie は data protection のキーで暗号化されるため、サーバーファームはキーリングを共有する必要があります。共有していないと、リクエストが別のマシンに届くたびにユーザーがランダムにログアウトされる症状として現れます。
