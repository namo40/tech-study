---
title: "Authorization"
summary: "認可はログインの次に来る質問です。認証が誰の呼び出しかを証明し、ロールがその人に許された操作を束ね、ポリシーがリソースそのものを見て判断します。そして安全な既定値は、沈黙を拒否として読むことです。"
category: "認証と認可"
scene: authorization
steps:
  - title: "ログインは扉を開けるだけで、すべての引き出しを開けるわけではありません"
    text: "認可の段階がなければ、ログインしたユーザーは何でも触れます。ゴーストは B が A の文書に書き込んで成功する様子を見せます。認証は「誰なのか」に答え、認可は「してよいのか」に答えます。安全は 2 番目に住んでいます。"
  - title: "ロールは名前の付いた権限の束です"
    text: "ゲートはバッジを見ます。editor は書け、viewer は読め、viewer の書き込みはどの文書にも触れないまま断られます。ロールがあってこそ 1000 人のユーザーを扱えます。人ごとにリストを渡す代わりに、束を渡すからです。"
  - title: "editor というロールは「自分のものだけ」を言えません"
    text: "A は editor なので、ロールは A が B の文書を直すことも喜んで許します。束は動詞を知っていて、所有を知りません。ポリシーは決定の時点で質問を投げます。呼び出し元はこのリソースの所有者か。同じリクエスト、同じバッジ、違う答えです。今はリソースが決定の一部だからです。"
  - title: "既定は拒否、付与は最小です"
    text: "どの規則も明示的に許していないリクエストは断られます。沈黙は拒否です。各 ID は必要な最小だけを握り、だから盗まれたバッジが開ける扉はできるだけ少なくなります。認可は入り口の壁ではなく、すべての扉の前の決定であり、毎回新しく下されます。"
related:
  - label: Authentication
    slug: authentication
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Least Privilege
    slug: least-privilege
  - label: Default Deny
    slug: default-deny
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
references:
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## いつ使うか

- 実際に何かをするすべてのエンドポイントで、2 番目の質問として使います。認証は誰が呼んでいるかまでしか教えません。その呼び出し元が何をどこにしてよいかは認可が決め、玄関で一度ではなくリクエストごとに答え直す必要があります。
- 大まかな権限の区別にはロールを使います。管理画面、編集ツール、サポートコンソールは、ある種類のユーザーにまとめて開くかまとめて閉じるかの領域です。こういう場合は名前の付いた権限の束が、いちばん安くて正確な表現になります。
- 答えがデータ次第になるものには、リソースを見るポリシーを使います。所有権、テナント、作業状態、誰かが開いたままにしている文書などは、呼び出し元だけを見ても決まりません。同じ呼び出し元でも行が違えば答えが変わるからです。
- サービス同士の呼び出しにも必要です。有効なトークンはどのサービスが呼んでいるかを証明するだけで、そのサービスが何をしてよいかは言いません。マシンの ID で動くバックグラウンドワーカーも、人と同じくらい慎重に権限を決める必要があり、たいていは人より少なくすべきです。
- 書いておいたどの規則にも当たらないリクエストが届きうる場所では、どこでも必要です。マップされていない経路、属性を付け忘れたエンドポイント、既存のコントローラーに追加された新しい操作がそれにあたります。大事な質問はそうしたリクエストに何が許されるかではなく、誰も意見を持っていないときに何が起きるかであり、答えは拒否でなければなりません。

## 注意点

- ログインの成功は権限ではありません。それを権限として扱うとアクセス制御が壊れ、この欠陥は現実の Web 脆弱性の一覧でいつも上位にあります。シーンの 1 番目のステップがまさにその姿です。呼び出し元がログインしているというだけでリクエストが通り、この呼び出し元がこの文書を触ってよいかは誰も尋ねません。
- ロールがリソースを抱え込み始めると、すぐに破綻します。`editor-of-project-x` はリソース識別子を飲み込んだロールで、こういうものが 1 つできれば、やがて数千になります。アプリケーションのコードが作っては消すので、監査もできず追いかけることも困難です。名前がこうして増え始めたら、判断をリソースを読むポリシーへ移す合図です。
- サーバーで、リクエストごとに確認します。ボタンを隠すのはユーザーへの配慮であって制御ではありません。その後ろのエンドポイントはそのまま生きていて、攻撃者が呼ぶのはそちらです。サーバーがどのみち断るものを UI が隠すのは構いませんが、サーバーが許すものを UI だけが隠しているなら、その UI が防御のすべてということになります。
- 閉じる方向に倒れるようにしてください。マップされていない経路、誰も属性を付けなかったコントローラー、判断せずに戻る認可ハンドラーは、すべて拒否で終わるべきです。既定拒否があってはじめて、システムが許すものの集合と、書き留めたものの集合が一致します。
- 最小権限は人だけの話ではありません。サービスが持っているアクセストークン、ジョブが使うサービスアカウント、接続文字列に書かれたデータベースユーザーも同じです。どれも仕事が成り立つ最小限だけができれば十分です。何かが漏れたとき、攻撃者がそのまま受け継ぐのはその権限だからです。
- 拒否をログに残し、見守ります。拒否は自分のクライアントの不具合か、誰かが扉を試しているかのどちらかで、どちらも知る値打ちがあります。1 つのエンドポイントで拒否率が跳ねるのは、いちばん早く得られる合図の 1 つで、追加の費用もかかりません。
- 判断は 1 か所で一度だけ下します。コントローラーのあちこちに散らばった認可のロジックは時とともにずれ、更新を忘れた写しが穴になります。規則にポリシー名を付けてその名前だけを使えば、規則そのものを読み、試し、直せるようになります。

## .NET では

ASP.NET Core は 2 つの質問をシーンと同じやり方で分けます。認証が `ClaimsPrincipal` を作り、認可がその principal と、必要ならリソースまで受け取って判断を返します。引数のない `[Authorize]` は最初の質問しか投げないので、それだけで答えの全部になることはまれです。

ロールは大まかな側で、ほかと同じく 1 つのクレームです。

```csharp
// 名前の付いた権限の束です。ここにあるものは文書について何も知りません。
app.MapPost("/documents/{id}", CreateRevision).RequireAuthorization("CanEdit");

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("CanEdit", policy => policy.RequireRole("editor"))
    .AddPolicy("CanRead", policy => policy.RequireRole("editor", "viewer"));
```

答えがリソース次第になった時点で、ロールでは表せずポリシーが要ります。要件は質問を指す目印で、ハンドラーがその質問に答えます。リソースを受け取るのはジェネリック引数が 2 つの `AuthorizationHandler` です。

```csharp
public sealed record OwnerRequirement : IAuthorizationRequirement;

public sealed class OwnerHandler : AuthorizationHandler<OwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, OwnerRequirement requirement, Document document)
    {
        var caller = context.User.FindFirstValue(ClaimTypes.NameIdentifier);

        // 成功は明示し、それ以外は何も言いません。Succeed を呼ばないハンドラーは
        // 何も許可していないということで、それが既定拒否です。
        if (caller is not null && document.OwnerId == caller) context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

何かがリソースを渡すまでハンドラーは動けないので、エンドポイントは先に文書を読んでから尋ねます。この順序が肝心です。判断はその行を前にして、呼び出しの時点で下されます。

```csharp
static async Task<IResult> CreateRevision(
    string id, RevisionInput input, ClaimsPrincipal user,
    IAuthorizationService authorization, DocumentStore store)
{
    var document = await store.FindAsync(id);
    if (document is null) return Results.NotFound();

    var result = await authorization.AuthorizeAsync(user, document, "OwnerOnly");
    if (!result.Succeeded) return Results.Forbid();

    await store.AppendAsync(document, input);
    return Results.NoContent();
}
```

規則の書き方を 1 つに保つため、要件を名前付きのポリシーとして登録し、ハンドラーはシングルトンとして追加します。ここでは依存関係を持たないので安全です。`DbContext` などスコープ付きのものを注入するハンドラーはスコープ付きで登録する必要があり、Resource-Based Authorization のページはそうしています。

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("OwnerOnly", policy => policy.AddRequirements(new OwnerRequirement()));

builder.Services.AddSingleton<IAuthorizationHandler, OwnerHandler>();
```

既定拒否は 1 行で済み、誰も属性を付けなかったエンドポイントの振る舞いを決めるのがまさにその 1 行です。`FallbackPolicy` はほかに認可の指定がない場所へ適用されるので、新しく作ったコントローラーは誰かが保護を思い出すより先に保護されています。すると `[AllowAnonymous]` が意図した例外になり、例外が必要な場所にだけ書かれます。

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
```

小さな習慣も 2 つ、値打ちがあります。ポリシーの中ではロール名より権限の形をしたクレームを使います。`RequireClaim("permission", "documents.write")` は組織の改編でロール名が全部変わっても生き残り、束の定義をいくつもの属性に散らさず 1 か所にまとめておけます。そして認証は済んでいるが権限のない呼び出し元には `404` ではなく `403` を返します。リソースの存在そのものを秘密だと決めた場合だけが例外です。`Results.Forbid()` と `Results.Challenge()` は意味が違い、この 2 つを混ぜると、ログイン済みのユーザーがログイン画面を巡り続けることになります。`Forbid` はスキームに委ねるので、呼び出し元が実際に受け取るものはどのスキームが答えたかで変わります。JWT bearer ハンドラーは `403` を書き、Cookie ハンドラーは `OnRedirectToAccessDenied` を上書きしないかぎり `AccessDeniedPath` へリダイレクトします。
