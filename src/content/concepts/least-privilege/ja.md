---
title: "Least Privilege"
summary: "最小権限は、ID ごとに必要なものだけを与え、それ以上は与えない原則です。だから侵害が起きても漏れるのはシステム全体ではなく、その ID の分だけになります。通過すべきレビューではなく、権限の形についての設計上の決定です。"
category: "認証と認可"
scene: workload-identity
sceneStep: 4
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Authorization
    slug: authorization
  - label: Default Deny
    slug: default-deny
  - label: Audience
    slug: audience
  - label: Claims
    slug: claims
  - label: Authentication
    slug: authentication
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Management
    slug: secret-management
  - label: API Key
    slug: api-key
references:
  - title: Increase security with the principle of least privilege
    url: https://learn.microsoft.com/en-us/entra/identity-platform/secure-least-privileged-access
  - title: Best practices for Azure RBAC
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/best-practices
  - title: Use Microsoft Entra Workload ID with Azure Kubernetes Service
    url: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
---

シーンの 4 番目のステップは、この考えのすべてを 1 枚の絵で描いています。ポッド A の role はストレージを開き、ポッド B の role はデータベースを開くので、それぞれが自分のリソースに届いて ok を受け取り、ポッド A がデータベースへ手を伸ばすと断られます。その拒否には劇的なところが 1 つもありません。攻撃もなく、異常もなく、誰かを起こすほどの警報もありません。その接近が role に入っていなかっただけで、role とはそのワークロードが触れてよい範囲の形です。

この絵を描く価値があるのは、その裏返しにあります。2 つのポッドが共用サービスアカウント 1 つで動いていたら、あの 3 回の接近はすべて成功し、どちらかのワークロードが侵害される直前までシステムはいまとまったく同じに見えたはずです。その瞬間、違いは事故の大きさとして現れます。ワークロードごとに role が 1 つなら、ポッド A に入り込んだ攻撃者が握るのはストレージだけで、データベースは依然として他人の問題です。最小権限は侵害の確率をまったく下げません。侵害がいくらのものになるかを前もって決めるだけです。

この原則が書類仕事という評判を得たのは、適用に費用がかかるからです。アカウント 1 つを 10 に分けるとは ID を 10 作ることであり、ID が、発行して保存してローテーションしてやがて漏れる資格情報を意味していた時代には、10 は 1 より問題が 9 つ多いということでした。チームを気前のよいロール 1 つへ押しやったのがこの計算で、ワークロード ID が変えるのがまさにこの計算です。ID をプラットフォームが起動時に発行し、それが自分で期限切れになるなら、ワークロード 1 つに ID 1 つは作る費用も保つ費用もかかりません。細かさが高くつくのをやめれば、共有する理由もなくなります。

3 つの習慣がほとんどの仕事をします。動く範囲でもっとも狭いスコープに付与します。ストレージアカウント 1 つではなくコンテナー 1 つに、サーバー 1 つではなくデータベース 1 つに、という具合です。たいていはロール名よりスコープのほうが大きなてこになります。広いロールより具体的な組み込みロールを選び、自分で保守することになるカスタムロールを作るくらいなら広い組み込みロールを選びます。そして書き込みと読み取りを分けておきます。報告するだけのサービスが何かを変更できてはならず、そう書いておく費用は割り当て 1 つです。

.NET ではこの形はコードではなく割り当てから出てきます。そこが肝心で、アプリケーションはリソース向けのトークンを求めるだけで、ロールがあるかないかのどちらかです。

```bash
# ワークロード 1 つ、ロール 1 つ、スコープ 1 つ
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope ".../storageAccounts/orders/blobServices/default/containers/receipts"
```

API の中でも、入ってきた呼び出し元が何をしてよいかに同じ原則が当てはまります。クレームを鍵にしたポリシーは判断を 1 か所にまとめ、エンドポイントを読みやすく保つので、新しい権限は散らばった `if` 文ではなくポリシー 1 つになります。

```csharp
// `scp` は空白区切りの 1 つの文字列として届くので、クレームの完全一致では
// 両方のスコープを許可されたトークンが拒まれます。
static bool HasScope(ClaimsPrincipal user, string scope) =>
    (user.FindFirstValue("scp") ?? "").Split(' ').Contains(scope);

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders:read", policy =>
        policy.RequireAssertion(context => HasScope(context.User, "Orders.Read")));
    options.AddPolicy("orders:write", policy =>
        policy.RequireAssertion(context => HasScope(context.User, "Orders.Write")));
});

app.MapGet("/orders/{id}", GetOrder).RequireAuthorization("orders:read");
app.MapPost("/orders", PlaceOrder).RequireAuthorization("orders:write");
```

気をつけるべき故障の型は権限のドリフトです。権限は障害対応の最中に足され、そのまま外されず、狭く始まったロールがチームの経験したあらゆる非常事態の和集合になっていきます。処方は退屈ですが効きます。一時的なアクセスは一時的に付与し、依存関係を見直すように割り当てを定期的に見直し、「この ID が実際に使っているものは何か」を答えのある問いとして扱ってください。アクセスログにその答えが入っています。

最小権限は、そもそも一度も破らないときがもっとも守りやすいものです。新しいワークロードは何も持たない状態から始め、最初の呼び出しを通す権限を 1 つ足し、一覧が意図的に 1 行ずつ育つのに任せてください。すべてを握って始めて後から少しずつ取り返そうとするやり方とはまったく別の作業で、後者は終わることがありません。
