---
title: "Role"
summary: "Role は、物ではなく人に付いた、名前の付いた付与の束です。安くて読みやすい外側の門になり、明らかな部外者を締め出します。リソースを見る検査の手前に層として置いたとき、最も価値があります。"
category: "認証と認可"
scene: resource-based-authorization
sceneStep: 3
related:
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Authorization
    slug: authorization
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
---

場面の第三段階は、ロールが間違いかどうかという議論が終わるところです。Check の中に `admin` カードが上がり、ある呼び出し元にバッジが付き、所有のルールなら断ったはずのリクエストが通ります。それが管理者という言葉の意味であり、そのルールを owner ルールと同じスタックにカードとして描いたことが要点です。リソース検査が来たからといってロールが消えたわけでも、ロールが勝ったわけでもありません。ロールはリストの中で owner ルールの上に一行を占め、ちょうど一つのことだけを言います。

Role は付与の束に付けた名前です。その価値のすべては圧縮です。権限十一個のかわりに「Support」、テーブル九つへの読み取りのかわりに「Auditor」、長い相談のかわりに「Admin」。その圧縮のおかげでロールはレビューで読め、エンジニアでない人にも割り当てられ、人がチームを移るときに一度の操作で取り消せます。どれも小さな性質ではなく、権限を一つずつ与えるやり方ではどれも手に入りません。

圧縮は同時に限界でもあります。ロールは人に付いてトークンに乗って動くので、特定のオブジェクトに触れない質問にしか答えられません。「この呼び出し元はドキュメント領域に近づいてよいか」はロールの質問です。「この呼び出し元はドキュメント 417 を編集してよいか」は違い、ロールをどれだけうまく設計してもそうはなりません。`Editor_Project_417` のような名前を作り出しているなら、モデルに置き場所がなくてオブジェクトを名前の中に書き込んだということであり、オブジェクトごとにロールを一つ作り、割り当て、片づける仕事を永久に引き受けると静かに署名したことになります。

だから理にかなった配置は層であり、場面はその層を実行される順に描きます。粗い門は安く、先に効きます。この呼び出し元は認証されているか、スコープを持っているか、この機能に近づける集団に属しているか。この検査にはトークン以外何も要らないので、データベース接続を開く前に部外者を返せます。精密な検査はそのあと、読み込んだリソースの上で走り、同じ種類のオブジェクト二つの間で実際に違う場合を判定します。ロールは量を減らし、リソース検査が質問を判定します。

場面の admin カードはわざと狭くしてあります。名前の付いた操作を一つだけ与え、すべてではないので、字幕はマスターキーではなく名前の付いた付与と呼びます。非常口がモデルになってしまわないよう保つ規律がこれです。`Update` に限って所有を飛び越える管理者ロールは、読めて、監査でき、テストできる決定です。すべてのハンドラーを飛び越える管理者ロールは、事故のときにしか走らないテストされていない経路であり、それは何が許されるのかを初めて知りたくない瞬間そのものです。

実務の習慣が二つ続きます。ロールは個人ではなく集団に与え、チームへの出入りだけを覚えていればよい形にしてください。そしてロールをポリシーそのものではなく、ポリシーの入力として扱ってください。エンドポイントの本体に散らばった `IsInRole` は、やがて「誰がこれをできるのか」に検索なしでは答えられないシステムになります。今日はロール一つを求める名前付きポリシーなら、明日はエンドポイントを一行も触らずに別のものを求められます。

正直な要約は場面が示すとおりです。ロールは消えません。もともと答える形をしていなかった質問に答えるふりをやめ、安くて速い先頭に移り、判定はドキュメントを手にした検査に任せます。
