---
title: "Audience"
summary: "Audience はトークンが宛てられた相手の名前です。これを検証してはじめて、受け手が他人のために鋳造された証明を受け入れずに済みます。署名が有効であることと、ここで有効であることの違いがそこにあります。"
category: "認証と認可"
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Issuer
    slug: issuer
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
  - label: Least Privilege
    slug: least-privilege
  - label: Mutual TLS
    slug: mutual-tls
references:
  - title: Access token claims reference
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0
  - title: Workload identity federation
    url: https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
---

シーンの三段階目は二つの名前の上で回っており、面白いのは二つ目のほうです。クラウドは発行者を読み、信頼すると合意した署名者が作ったトークンだと判断します。この検査は手渡された二つのトークンの両方が通ります。次にクラウドは対象を読みます。トークンが誰に宛てて書かれたかを言う名前で、二つのうち一つだけが「私」と言っています。もう一つはまったく本物であるにもかかわらずその場で断られ、その拒否こそがこの検査の存在理由のすべてです。

署名が証明するのは、発行者がそのトークンを書いたという事実だけです。誰が受け取るはずだったかについては何も言いません。対象の検査がなければ、ある発行者を信頼するすべてのサービスが、その発行者の署名したすべてのトークンを受け入れることになります。つまり、そのうちのどれか一つが正当に受け取ったトークンを、残りのどれにでも差し出せてしまいます。それが混乱した代理です。呼び出し元より腕の長い部品が、呼び出し元の証明を持って呼び出し元の用を足してしまう状況です。対象は、トークンをちょうど一か所でだけ役に立つものにして、その穴を塞ぎます。

仕組み自体は小さなものです。JWT では対象は `aud` クレームで、受け手はそれを自分が名乗っている識別子と比べます。OAuth のフローではクライアントが特定のリソース向けのトークンを求め、認可サーバーがそのリソースの識別子を `aud` に書きます。ワークロードアイデンティティのフェデレーションでは同じ規則が一階層上で回ります。プラットフォームは交換が行われるアイデンティティプロバイダーを対象とするトークンを鋳造するので、あるクラウド向けのトークンを別のクラウドで再生することはできません。

間違え方は三つ挙げておく価値があります。検査を無効にするのがもっとも目立つやり方で、たいていは金曜日に連携を成立させようとして起こります。設定は `ValidateAudience = false` の一行で、いったん設定ファイルに入ると誰も二度と読みません。受け入れる集合を広げるのはもっと静かなやり方です。三つの呼び出し元がトークンを別々に要求したという理由で三つの対象を受け入れる API は、他人の証明を手渡される機会を三つ持ちます。そして見当違いの種類の識別子を受け入れるのがもっとも微妙です。自分の API 向けのアクセストークンには自分の API の識別子が載るべきで、クライアント ID やグラフのエンドポイントが載ってはいけません。別のリソース向けに鋳造されたトークンを受け入れる受け手は、口に出さないままそのリソースの対象とフェデレーションしたのと同じです。

.NET ではこの検査は発行者の隣、`TokenValidationParameters` の中に置かれ、受け継ぐより自分で書き下す価値があります。

```csharp
options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidIssuer = "https://login.microsoftonline.com/<tenant>/v2.0",
    ValidateAudience = true,
    ValidAudience = "api://orders",   // 名前は一つ、そしてそれは私だ
    ValidateLifetime = true,
};
```

検査する側ではなく求める側になるときは、要求するスコープが対象を決めるので、同じ規律が反対側にも当てはまります。これから呼ぶリソース向けのトークンを求め、たまたま受け入れられるからといって別のリソースに使い回さないでください。

身につける価値のある習慣は、二つの名前を一つの文として読むことです。「これは私が信頼する誰かが書いた」は発行者に対する認証です。「これは私のために書かれた」が、それを自分が処理してよいものにします。前者だけを検査するシステムは、本物でありさえすれば自分宛てでもあると決めたことになりますが、そんな決定を意図して下した人は誰もいません。
