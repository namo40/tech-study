---
title: "Least Privilege"
summary: "最小権限は、アイデンティティごとに必要なものだけを与え、それ以上は与えない原則です。だから侵害が起きても漏れるのはシステム全体ではなく、そのアイデンティティの分だけになります。通過すべきレビューではなく、権限の形についての設計上の決定です。"
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

シーンの四段階目は、この考えのすべてを一枚の絵で描いています。pod A の role はストレージを開き、pod B の role はデータベースを開くので、それぞれが自分の資源に届いて ok を受け取り、pod A がデータベースへ手を伸ばすと断られます。その拒否には劇的なところが一つもありません。攻撃もなく、異常もなく、誰かを起こすほどの警報もありません。その接近が role に入っていなかっただけで、role とはそのワークロードが触れてよい範囲の形です。

この絵を描く価値があるのは、その裏返しにあります。二つのポッドが共用サービスアカウント一つで動いていたら、あの三回の接近はすべて成功し、どちらかのワークロードが侵害される直前までシステムはいまとまったく同じに見えたはずです。その瞬間、違いは事故の大きさとして現れます。ワークロードごとに role が一つなら、pod A に入り込んだ攻撃者が握るのはストレージだけで、データベースは依然として他人の問題です。最小権限は侵害の確率をまったく下げません。侵害がいくらのものになるかを前もって決めるだけです。

この原則が書類仕事という評判を得たのは、適用に費用がかかるからです。アカウント一つを十に分けるとはアイデンティティを十作ることであり、アイデンティティが、発行して保存してローテーションしてやがて漏れる資格を意味していた時代には、十は一より問題が九つ多いということでした。チームを気前のよいロール一つへ押しやったのがこの計算で、ワークロードアイデンティティが変えるのがまさにこの計算です。アイデンティティをプラットフォームが起動時に発行し、それが自分で失効するなら、ワークロード一つにアイデンティティ一つは作る費用も保つ費用もかかりません。細かさが高くつくのをやめれば、共有する理由もなくなります。

三つの習慣がほとんどの仕事をします。動く範囲でもっとも狭いスコープに付与します。ストレージアカウント一つではなくコンテナー一つに、サーバー一つではなくデータベース一つに、という具合です。たいていはロール名よりスコープのほうが大きなてこになります。広いロールより具体的な組み込みロールを選び、自分で保守することになるカスタムロールを作るくらいなら広い組み込みロールを選びます。そして書き込みと読み取りを分けておきます。報告するだけのサービスが何かを変更できてはならず、そう書いておく費用は割り当て一つです。

.NET ではこの形はコードではなく割り当てから出てきます。そこが肝心で、アプリケーションはリソース向けのトークンを求めるだけで、ロールがあるかないかのどちらかです。

```bash
# ワークロード一つ、ロール一つ、スコープ一つ
az role assignment create --assignee $ORDERS_CLIENT_ID \
  --role "Storage Blob Data Contributor" \
  --scope ".../storageAccounts/orders/blobServices/default/containers/receipts"
```

API の中でも、入ってきた呼び出し元が何をしてよいかに同じ原則が当てはまります。クレームを鍵にしたポリシーは判断を一か所にまとめ、エンドポイントを読みやすく保つので、新しい権限は散らばった `if` 文ではなくポリシー一つになります。

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("orders:read", policy => policy.RequireClaim("scp", "Orders.Read"));
    options.AddPolicy("orders:write", policy => policy.RequireClaim("scp", "Orders.Write"));
});

app.MapGet("/orders/{id}", GetOrder).RequireAuthorization("orders:read");
app.MapPost("/orders", PlaceOrder).RequireAuthorization("orders:write");
```

気をつけるべき故障の型は漂流です。権限は障害対応の最中に足され、そのまま外されず、狭く始まったロールがチームの経験したあらゆる非常事態の和集合になっていきます。処方は退屈ですが効きます。一時的なアクセスは一時的に付与し、依存関係を見直すように割り当てを定期的に見直し、「このアイデンティティが実際に使っているものは何か」を答えのある問いとして扱ってください。アクセスログにその答えが入っています。

最小権限は、そもそも一度も破らないときがもっとも守りやすいものです。新しいワークロードは何も持たない状態から始め、最初の呼び出しを通す権限を一つ足し、一覧が意図的に一行ずつ育つのに任せてください。すべてを握って始めて後から少しずつ取り返そうとするやり方とはまったく別の作業で、後者は終わることがありません。
