---
title: "Attribute-Based Access Control"
summary: "ABAC はロール名を引くのではなく、主体・リソース・アクション・環境の属性を評価してアクセスを判断します。ロールでは文にできない問いに答えるモデルであり、ロールが掛け算で増える場所で属性は足し算で済みます。"
category: "認証と認可"
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Default Deny
    slug: default-deny
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "What is Azure attribute-based access control (Azure ABAC)?"
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/conditions-overview
---

シーンの 3 番目のステップは、ロールが言えない一文を見せます。バッジは持ち主が何をしてよいかを書くだけで、誰のものに対してかは書かないので、editor のバッジは他人の文書への変更もそのまま通します。属性ベースアクセス制御は、その欠けた一文を正面から受け止めるモデルです。呼び出し元を名前と照合する代わりに、事実の上に組み立てた真偽式を評価します。トークンに載る部署や機密区分といった主体の事実、所有者やテナントや分類といったリソースの事実、そしてアクションの事実と、時刻や管理対象デバイスかどうかといった環境の事実です。式が真なら許可し、そうでなければ拒否します。これは 4 番目のステップが描く既定拒否と同じ姿勢を、名前ではなくデータの上で表現したものです。

```text
subject.department == resource.department
  and resource.classification != "restricted"
  and environment.device == "managed"
```

正直な動機は美しさではなく算数です。ロールは次元が増え始めるまでは権限をうまく圧縮します。editor ロールがテナントごとに 1 つになり、次にリージョンごとに 1 つになり、機密文書用が別に生まれ、最後にはディレクトリに誰かが必要とした全次元の直積が残ります。これがロール爆発で、掛け算です。属性は代わりに足します。リージョンが 1 つ増えても、増えるのは 1 つの節で比較される属性であって、既存のロールごとの新しい行ではありません。規則はそもそも名前の一覧ではなかったので、組織が大きくなっても意味を保ちます。コストも一緒に移ります。多数のロールを付与し剥奪する管理の負担が、属性を正確に保つ負担に変わり、ユーザーの部署が間違っていれば、いまやどこでも答えが間違います。

2 つのモデルは競合ではなく、競合として扱うことが ABAC の導入を失敗させる道筋です。ロールは他の属性のうちの 1 つにすぎず、たいていは最も粗く、最も安く確認できる属性です。そのため実務の形は、呼び出し元がこの操作の近くに来てよいかを決めるロールの門があり、その後ろにいま目の前のリソースが範囲内かを決める条件が続く、という並びになります。Azure の実装はまさにその配置です。ロール割り当てが権限を与え、割り当てに付けた任意の条件がリソースのタグと主体の属性を比べて範囲を狭めます。Resource-based authorization は同じ発想の最も狭い形で、目の前のインスタンスの所有関係だけを見ます。ABAC はその一般形であり、検査をアプリケーションのどこに配線するかは policy が扱う別の問いです。

このモデルが引き換えに求めるのは、属性が信頼でき、判断の瞬間に手元にあることです。呼び出し元が自分について自由に決められる値は属性ではなくリクエストなので、主体の属性は署名されたトークンで届くか、呼び出し元が書き換えられないディレクトリから読まれる必要があります。リソースの属性は答えを出す前に読み込まれる必要があり、だからこの判断はゲートウェイではなくデータのそばに住みます。複雑さも消えず、場所を移します。重なり合う条件が増えれば、ロールが多い場合と同じくらい見通しが悪くなり、しかも「この文書を誰が読めるか」が 1 回の照会ではなく式の総当たりになるという難しさが加わります。式は少なく保って名前を付け、許可と同じ丁寧さで拒否も検証するテストを置き、どの属性がその判断を生んだかを記録できるようにします。誰も説明できない答えは、誰も点検できない答えです。
