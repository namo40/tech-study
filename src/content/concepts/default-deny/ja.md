---
title: "Default Deny"
summary: "Default deny は、何も許可していない行動は断るというルールです。忘れたハンドラーを開いた扉ではなく閉じた扉に変えてくれるので、新しいエンドポイントごとに少しの摩擦を払う価値があります。"
category: "認証と認可"
scene: resource-based-authorization
sceneStep: 4
related:
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Role
    slug: role
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Claims
    slug: claims
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

シーンの 4 番目のステップでは、Check のどのカードも口にしたことのない動詞を抱えてリクエストが届きます。何もそれを拒否しません。owner カードは編集についてのものであり、admin カードも編集についてのもので、どちらも共有については意見を持ちません。それでもリクエストは断られ、その理由がこのページの全部です。何かが禁じたからではなく、何も許可しなかったから断られたのです。そのあとルールが 1 つ書かれ、同じリクエストが戻ってきて通ります。アクセス制御の事故は、すべてその 2 つの瞬間の間に住んでいます。

既定値が効いてくる理由は非対称性です。既定が許可のシステムは開いたまま失敗し、しかも情報が最も少ない状況でそうなります。新しいエンドポイント、新しい動詞、ルートは追加したのに属性を忘れたマージがそれです。既定が拒否のシステムは閉じたまま失敗し、うるさく失敗し、たいていは誰かがテスト環境で新機能を試した 1 分以内に露わになります。どちらもミスです。ただし片方だけが、見知らぬ人からではなく自分のチームから知らされるミスです。

既定を拒否にしておくことは、認可モデルの残りを読めるものにもしてくれます。沈黙が拒否を意味するなら、ポリシーは完結した記述です。許可するものがすべて書かれているので、リストを見ることがそのままシステムを見ることになります。沈黙が許可を意味するなら、付与のリストは何も教えてくれません。面白い振る舞いが、誰もルールを書かなかった場所にあるからです。無いものは監査できません。

ASP.NET Core の部品はすでにこちら側に傾いていて、仕事は最後の隙間を塞ぐことです。要件は明示的な `context.Succeed` でしか満たされないので、何もしないハンドラーは断り、ポリシーに合うハンドラーが 1 つもないエンドポイントも断ります。それがポリシー内側の default deny です。隙間は、そもそも尋ねなかったエンドポイントです。`[Authorize]` 属性やそれに相当するものがなければ、パイプラインは手を触れずに通します。`SetFallbackPolicy` は、ポリシーを指定しなかったすべてのエンドポイントにポリシーを適用してその隙間を塞ぎ、「これを守り忘れた」を公開ルートではなく 401 に変えます。本当に公開のエンドポイントはそこで `[AllowAnonymous]` と言い、それは検索して数えられる決定です。

失敗の口調は、失敗するという事実と同じくらい大事です。拒否は開発とテストでは目立つべきで、本番では呼び出し元に対して静かであるべきです。満たされなかった要件と、呼び出し元と、リソース識別子をログに残してください。断られたリクエストは最も早い侵害の兆候であり、費用は 1 行です。呼び出し元には味気ないものを返し、403 と 404 のどちらを使うかはリソースの種類ごとに意図して選び、失敗が何が存在するかを数え上げる手段にならないようにしてください。

費用は実在し、小さいです。Default deny は、何が許されるかを誰かが言うまで新しい作業が止まるということであり、その摩擦は最後のセキュリティレビューではなく、すべての機能ブランチに乗ります。わざとしている取引がそれです。あとで一度きりの無限の驚きを受けるかわりに、今の小さな摩擦を均等に配ることです。これをテストとして書けば摩擦は自動になります。登録されたすべてのルートがポリシーを持つか明示的に外れているかを確かめるテストは、忘れたプルリクエストで失敗し、そこが世界でいちばん安く気づける場所です。

字幕は一文で言います。沈黙は拒否です。このページ全体は、なぜもう一方ではなくその既定値の上に積む価値があるのかを解いた、長い注釈です。
