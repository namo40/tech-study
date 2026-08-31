---
title: "Resource-based Authorization"
summary: "Resource-based authorization はリソースを手に持って判定します。「このユーザーはドキュメントを編集できるか」ではなく「このユーザーはこのドキュメントを編集できるか」を問います。所有と状態は対象の上にあり、ロールは粗い外側の門として残り、どのルールも良いと言わなければ答えは拒否です。"
category: "認証と認可"
scene: resource-based-authorization
steps:
  - title: "ロールだけを見る検査は、ドキュメントを見ていません"
    text: "ゴーストは質問をひとつだけ投げます。「このユーザーは editor か?」そして届いたものを何でも編集します。他人のドキュメントでもです。失敗したものはありません。ルールは書かれたとおりに働き、まさにそれが問題です。質問が小さすぎたのです。意味のある認可は三つを同時に問います。誰が、何を、どのリソースに。"
  - title: "判定はリソースを手に持って下します"
    text: "まったく同じリクエストが二つ、doc 1 を編集せよ。ハンドラーはドキュメントを読み込み、所有者を読み、異なる二つの答えを出します。A には許可、B には拒否。これがパターンの全部です。決め手となる事実はリソースの上に住んでいるので、ルールはトークンだけでは動けません。同じロール、同じ行動でも、ドキュメントが違えば答えが違うのです。"
  - title: "ロールは消えるのではなく、居場所を見つけます"
    text: "admin カードは所有を飛び越えます。それが管理者という言葉の意味ですから。しかしそれは名前の付いた狭い付与のひとつであって、マスターキーではありません。粗いロールの門は明らかな部外者を安く締め出し、リソース検査が本当に大事な場合を判定します。二つの層は別々の質問に答え、だからこそ両方を置くのです。"
  - title: "沈黙は拒否です"
    text: "どのルールも聞いたことのない新しい行動が届き、システムは断ります。あるルールがだめと言ったからではなく、どれも良いと言わなかったからです。その既定値が、まだ書いていないすべてのルールを支える安全網です。ハンドラーを忘れたミスは、テスト環境でうるさく閉じたまま失敗すべきです。本番で静かに開いたまま失敗してはいけません。"
related:
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Role
    slug: role
  - label: Default Deny
    slug: default-deny
  - label: Role-based Access Control
    slug: role-based-access-control
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-based Access Control
    slug: attribute-based-access-control
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
references:
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

## いつ使うか

判断基準は単純です。対象を見ないと答えられない質問なら、その検査はリソースの上にあるべきです。

- 所有。書き手が自分の記事を直し、顧客が自分の注文を取り消し、会員が自分のコメントを消します。ロールは「書き手」としか言わず、誰のものかはリソースが言います。A を B の下書きから遠ざけるのは二つ目だけです。
- 状態。支払い済みの注文は編集できず、ロックされたドキュメントは名前を変えられず、閉じたチケットは担当者を移せません。権限は行を読み込んだあとにしか存在しないフィールドに依存するので、ログイン時にクレームをいくら詰め込んでもこの答えは出ません。
- 関係。マネージャーが自分の部下の評価を読み、教師が自分のクラスを採点し、医師が自分の担当患者のカルテを開きます。呼び出し元とリソースをつなぐ線がそのまま権限であり、その線はトークンではなくデータベースにあります。
- テナント。複数テナントのシステムで「同じロール、別のテナント」は必ず失敗しなければならず、空のリストを返すのではなく入口で止まらなければなりません。リソースに付いたテナント識別子がそのまま検査であり、事故報告書のたびに「これがあれば」と惜しまれる検査です。
- ロール検査で正直にやろうとすると、オブジェクトごとにロールを一つ作る羽目になるすべての場所。`Editor_Project_417` のような名前を思い浮かべているなら、その権限が人ではなくオブジェクトについてのものだと気づいたということです。そこはハンドラーを書く場面です。

粗いロールの門は、これらすべての手前にそのまま置いておく価値があります。安く、読みやすく、何も読み込む前に明らかな部外者を締め出します。できないのは、ドキュメント二つを見分けることだけです。

## 注意点

- 検査にリソースが要るので、読み込みのあとに走ります。欠点ではありませんが、オブジェクトがすでに存在する地点まで判定が後ろにずれるため、ハンドラーは失敗から何が漏れるかも同時に決めることになります。404 と 403 のどちらを返すかは意図して選んでください。403 は対象があることを認め、404 は認めないので、リソースの種類ごとに一つ選んで守るほうが、例外フィルターに任せるより良いです。
- ハンドラーは小さく、一つのことだけを問う形に保ちます。要件一つは質問一つであるべきです。「呼び出し元は所有者か」「注文はまだ開いているか」くらいに。そうすれば、それらを束ねたポリシーが口に出して言いそうな文のように読めます。条件を五つ抱えたハンドラー一つは、誰も手を出せないハンドラーになります。
- リソースのルールをクエリフィルターだけに押し込みません。フィルターは行を隠し、ハンドラーは行動を断り、それは別々の仕事です。すべてのクエリを現在のテナントに絞る全体フィルターは優秀ですが、フィルターが届かない経路で識別子から取ってきた行を呼び出し元が更新することは依然として止められません。たいていは両方が必要で、エンドポイントごとにどちらが守っているかを言えるべきです。
- 判定結果のキャッシュは慎重に、あるいは置かずに。認可の答えはある瞬間の呼び出し元とリソースについての事実であり、所有が変わるか、共有が取り消されるか、注文が支払われた時点でその瞬間は終わります。どうしてもキャッシュするなら、リソースが変わると一緒に変わる値をキーにし、約束した最短の取り消し時間より寿命を短くしてください。
- 拒否を監査ログに残します。断られたリクエストは、最も早く最も安い侵害の兆候であり、費用はログ一行です。ある呼び出し元が一分に四十回も所有ハンドラーに引っかかっているなら、成功したリクエストが決して教えてくれないことを教えてくれています。
- リソース検査を唯一の検査にしません。この検査は遅く、読み込んだデータの上で、精密な仕事をします。認証されていないリクエストの洪水とデータベースの間に一人で立たないよう、安い門を手前に置いてください。

## .NET では

命令形の書き方は `IAuthorizationService.AuthorizeAsync` で、リソースを読み込んだあとにエンドポイントの中から呼びます。この仕事に属性はありません。属性は、見るべき対象が存在する前に走るからです。

```csharp
app.MapPut("/documents/{id:guid}", async (
    Guid id,
    DocumentUpdate update,
    ClaimsPrincipal user,
    AppDb db,
    IAuthorizationService auth,
    CancellationToken ct) =>
{
    var document = await db.Documents.FindAsync([id], ct);
    if (document is null) return Results.NotFound();

    var result = await auth.AuthorizeAsync(user, document, Operations.Update);
    if (!result.Succeeded) return Results.Forbid();

    document.Body = update.Body;
    await db.SaveChangesAsync(ct);
    return Results.NoContent();
});
```

要件は名前ひとつであり、動詞ごとに型を作らなくて済むように `OperationAuthorizationRequirement` が用意されています。

```csharp
public static class Operations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = nameof(Read) };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = nameof(Update) };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = nameof(Delete) };
}
```

ハンドラーは、リソースとルールがようやく出会う場所です。`AuthorizationHandler<TRequirement, TResource>` が両方を渡してくれ、面白い行は呼び出し元とリソースのフィールドを比べる一行だけです。

```csharp
public sealed class DocumentOwnerHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null && resource.OwnerId == userId)
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}
```

ハンドラーは組み合わさります。同じ要件に二つ目のハンドラーを登録することが、粗い門が居場所を保つやり方です。所有ハンドラーは所有者に対して成功し、別の管理者ハンドラーは名前の付いた操作ひとつについて、ドキュメントの持ち主が誰であっても成功します。二つは互いを知らず、どれか一つが成功した時点で要件は満たされます。

```csharp
public sealed class DocumentAdminHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Document resource)
    {
        // 名前の付いた狭い付与ひとつ。すべての操作ではない点が肝心です。
        if (requirement.Name == nameof(Operations.Update) && context.User.IsInRole("DocumentAdmin"))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

builder.Services.AddScoped<IAuthorizationHandler, DocumentOwnerHandler>();
builder.Services.AddScoped<IAuthorizationHandler, DocumentAdminHandler>();
```

名前の付いたポリシーは、エンドポイントごとに同じハンドラーを書き直さずに再利用する方法です。ポリシー一つに安いクレーム検査とリソース要件をまとめておけば、門を通った呼び出し元についてだけ高い部分が走ります。

```csharp
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("EditDocument", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim("scope", "documents.write");
        policy.AddRequirements(Operations.Update);
    });
```

最後の部品は既定値です。許可するのは `context.Succeed` だけなので、誰も処理しなかった要件はひとりでに失敗します。ただしそれは、尋ねるエンドポイントでしか助けになりません。忘れたエンドポイントにも尋ねさせるのがフォールバックポリシーです。

```csharp
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());
```

これらの部品を順に読み返せば、それがそのまま場面です。安い粗い門、判定の前にドキュメントを読み込むハンドラー、仮定ではなく名前で書かれた例外、そして誰も良いと言わなかったときにだめと言う既定値。
