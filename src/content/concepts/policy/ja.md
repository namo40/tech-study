---
title: "Policy"
summary: "ポリシーは、決定の時点で呼び出し元とリソースを一緒に置いて評価する認可の規則です。だから同じバッジでも、行が違えば違う答えを受け取ります。"
category: "認証と認可"
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Least Privilege
    slug: least-privilege
  - label: Claims
    slug: claims
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

場面の三番目の段階は、ロールが尽きる場所です。`A` は editor なので、ロールは `A` が `B` の文書を直すことも快く許します。束には動詞が並んでいて、「自分のものだけ」は動詞ではないからです。ゲートをポリシーに切り替えると、同じ要求が違う質問に出会います。この呼び出し元はこのリソースの所有者か。バッジも要求もそのままですが、いまはリソースが判断の一部であり、答えは拒否へ裏返ります。

覚えておく値打ちのある区別はこれで全部です。ロールの確認は呼び出し元についての言明です。ポリシーは呼び出し元と対象を一緒に置いた言明で、トークンを発行したときではなく呼び出しが起きたときに評価されます。所有権がいちばん分かりやすい例ですが、テナント、作業の状態、誰かが開いたままで施錠されたレコード、承認の上限を超える金額、そもそも変更が許される時間帯も、すべて同じ仲間です。

構造で見ればポリシーは一つ以上の要件に付けた名前で、要件にはハンドラーが答えます。名前を付けるのは整頓以上の意味があります。規則の書き方が一つに定まるので、必要なすべてのエンドポイントで同じ一文が守られ、規則が Web サーバーなしで単体試験できる場所に置かれます。一つの要件に複数のハンドラーが答えられ、たいていはそのうち一つが成功すれば十分です。「所有者または管理者」を、双方が互いを知らないまま表現できるのはそのおかげです。

評価の順序は大切で、しかも静かにずれやすいところです。ハンドラーはリソースを手にするまで判断できないので、エンドポイントが先に行を読んでから尋ねる必要があります。判断は取得のあと、変更の前に置かれます。データを一度も見ていないゲートウェイやミドルウェアがポリシーを評価できない理由もここにあります。手前では対象を狭められますが、行単位の答えはその行のある場所に属します。

よく出る失敗が二つあります。一つは判断せずに終わるハンドラーです。沈黙は拒否でなければならないので、成功を告げ忘れた規則は断り、既定で成功する規則は名前の付いた穴になります。もう一つは、要求ごとに、さらに一覧の項目ごとに小さなデータベース照会へ化けるポリシーです。規則にデータが要るなら、まとまり全体のために一度だけ読み、ハンドラーにはすでにメモリにあるものを見せてください。そうしないと認可がそのまま性能の問題になります。

ポリシーがあってはじめて、認可は入り口の壁から離れます。ロールは一度確かめればセッション全体に色が付きますが、ポリシーは呼び出しごとに、目の前の対象を置いて尋ね直します。手間は増え、その分がちょうど適量です。「他人のものではなく自分のもの」と言える規則の形は、これしかないからです。
