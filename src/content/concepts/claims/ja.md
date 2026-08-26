---
title: "Claims"
summary: "Claim は、トークンが誰のためのものか、何を許すか、それがいつまで真かをキーと値で述べたものです。検証はそれらを広く読む作業ではなく、決まった数のゲートであり、各ゲートは名前の付いたクレーム一つを API がすでに知っている値と突き合わせます。"
category: "認証と認可"
scene: bearer-token
sceneStep: 3
related:
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: ID Token
    slug: id-token
  - label: Authorization
    slug: authorization
  - label: Token Revocation
    slug: token-revocation
  - label: Authorization Code
    slug: authorization-code
  - label: Refresh Token
    slug: refresh-token
references:
  - title: "JSON Web Token (RFC 7519), registered claim names"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Provide optional claims to your app
    url: https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims
  - title: ClaimsPrincipal
    url: https://learn.microsoft.com/en-us/dotnet/api/system.security.claims.claimsprincipal
---

シーンの第三段階は、すべてのリクエストを同じ短いゲートの列に通します。ゲートの一つ一つは、クレーム一つを API がすでに知っている値一つと突き合わせているだけです。検証とはそれです。API が呼び出し元について見解を作るのではなく、設定に書かれた値との等値比較が四つか五つあるだけで、だからこそ呼び出しごとに回せるほど安く、ネットワークがいらないほどローカルです。

ゲートは登録済みクレームから来ていて、それぞれ別の問いに答えます。`iss` は誰が発行したかを言い、信頼すると決めた発行者と照合されます。`aud` は誰のために発行したかを言い、この API 自身の識別子と照合されます。レポート用 API 向けの完全に有効なトークンが決済 API を開けてしまうのを止めるのがこの確認です。`exp` はいつ真でなくなるかを、`nbf` はいつから真かを言い、どちらも時計と比べつつ少しのずれを許します。`sub` は主体の名前で、誰が何をしたかを記録するときに保存すべきなのはこれです。メールアドレスや表示名と違って安定しているからです。

その次に、身元ではなく権限を運ぶクレームがあります。`scope` は利用者がアプリにどこまで許したかを言い、委譲全体を囲む粗い柵です。`orders.read` しか持たないアプリは、誰がサインインしていても注文を書けません。ロールやグループは、この主体が何をしてよいかを言い、まったく別の軸です。二つを分けておくことが大切です。混ぜると、アプリが利用者の権限をそのまま引き継ぐか、逆にアプリの要求が足りないという理由で利用者が自分のデータを見られない API ができます。

残りはすべて、請求書の付いた設計上の決定です。クレームはリクエストごとに運ばれるので、一つ増やすたびに呼び出しごとのバイトになり、いつか要求全体を拒む、どこかのヘッダーサイズの上限になります。グループのクレームがその典型です。利用者の所属グループをすべて出すディレクトリは、ある利用者については数百個を出しますし、ID プロバイダはそういうとき一覧のかわりに取りに行くためのポインタを返します。避けようとしていた往復が戻ってくるわけです。認可の規則が実際に読む数個だけを載せ、残りは引きに行ってください。

もう一つの罠は古さで、この形式全体が結んだ取引と同じものです。クレームはトークンが作られた瞬間についての記述であり、トークンの寿命のあいだ凍りついています。誰かをグループから外しても、いま持っているトークンは満了まで、その人がグループにいると言い続けます。これは呼び出しごとの照会で回避すべきバグではありません。呼び出しごとに照会した時点で、状態を持たない設計を捨てているからです。これは意図して選ぶ寿命であり、古いままの窓が受け入れられる長さであればよいのです。

.NET ではこのすべてが `HttpContext.User` 上の `ClaimsPrincipal` として届き、個々の記述は `User.FindFirst("scope")` や `User.FindFirstValue(ClaimTypes.NameIdentifier)` で返ってきます。二つ知っておくと時間が節約できます。フレームワークは既定で短い JWT のクレーム名の一部を長い WS-Federation の URI に対応づけるので、`DefaultInboundClaimTypeMap` を空にしないかぎり `sub` は `nameidentifier` として届きます。あるはずの名前が見つからないときは、ほとんどいつもこれです。そして認可の判断は `if` ではなくポリシーに置いてください。scope を要求する、あるいは特定の値のクレームを要求するポリシーは、規則を一か所にまとめ、その規則に頼るすべてのハンドラから規則を追い出します。
