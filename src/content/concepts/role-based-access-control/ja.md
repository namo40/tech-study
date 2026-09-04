---
title: "Role-Based Access Control"
summary: "ロールベースアクセス制御は、権限を人ではなく名前の付いた束に与えます。呼び出し元はロールを持ち、ロールは許された動詞を並べ、ゲートはバッジだけを見て判断します。"
category: "認証と認可"
scene: authorization
sceneStep: 2
related:
  - label: Authorization
    slug: authorization
  - label: Policy
    slug: policy
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

場面の二番目の段階は、ゲートに段が二つできたあとにできる、いちばん安くて正しいことです。呼び出し元はそれぞれバッジを持ち、バッジにはできる動詞が並び、ゲートはその二つを見比べます。`A` は editor なので書けて、`B` は viewer なので読めます。だから viewer の書き込みは、どの文書にも届く前に断られます。この判断のどこにも文書を覗いた部分はなく、だからこそ速く、キャッシュしやすく、追いかけやすいのです。

ロールが存在する理由は算術です。人ごとに権限を配れば権限の数は人数に比例して増え、利用者千人に機能四十個のシステムは四万マスの表になります。その表を誰かが正しく保ち続けなければなりません。ロールはそれを二つに分けます。製品が変わるときだけ変わる束がいくつかと、人が職を移るときだけ変わる一人あたり一つの割り当てです。入社の手続きは確認リストではなく「サポートのロールを渡す」になり、退職の手続きは探し回る代わりに回収一回になります。

ロールは、ゲートが引く値というより呼び出し元が持ってくる claim だと考えたほうが実態に合います。この違いは実務に出ます。ロールがトークンやクッキーに乗って届くので判断に費用がかからず、その代わりロールはトークンと同じだけ古びます。さっき降格された人も、トークンが切れるまでは古いバッジを持ち歩きます。access token を短くしておく理由の一つがこれで、本当に急ぐ取り消しがロールの表より先まで届かなければならない理由でもあります。

ロールは、答えがリソース次第になり始めるところで力を失います。「この利用者は文書を編集してよいか」はロールの質問です。「この利用者は*この*文書を編集してよいか」は違います。名前をいくら整えてもロールの質問にはなりません。その圧力はまず名前に現れます。誰かが `editor-of-project-x` を持ち出した瞬間、ロールはリソース識別子を飲み込んでいて、ロールの数は製品ではなくデータに比例して増え始めます。アプリケーションのコードが実行中にロールを作っては消すのも同じ匂いです。

モデルを長く健やかに保つ習慣が二つあります。権限はロールに、ロールは人に与え、権限を人へ直接は与えません。そうすれば誰が何をできるかを尋ねたとき、見る場所は一つだけで済みます。そしてポリシーの中では、あちこちの属性にまいたロール名より、権限の形をした claim を使います。`editor` ではなく `documents.write` を確かめれば、組織の改編でロール名が全部変わっても生き残り、束の定義がエンドポイント百か所ではなくファイル一つに残ります。

ロールでは言えなくなったとき、答えはより大きなロールではありません。決定の時点でリソースを読むポリシーであり、場面の次の段階が見せるのがまさにそれです。二つは仲よく共存します。ロールが対象を狭め、ポリシーがその行を決着させます。
