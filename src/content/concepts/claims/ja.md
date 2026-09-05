---
title: "Claims"
summary: "Claim は、トークンが誰のためのものか、何を許すか、それがいつまで真かをキーと値で述べたものです。検証はそれらを広く読む作業ではなく、決まった数のゲートであり、各ゲートは名前の付いたクレーム 1 つを API がすでに知っている値と突き合わせます。"
category: "認証と認可"
scene: bearer-token
sceneStep: 2
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

シーンの 2 番目のステップは、ペイロードを開いて中のクレームをそのまま読み上げます。このトークンが誰のためのものか、何を許すか、いつまで真であるか、です。そのまま並んだ同じ行が、以降すべてのリクエストを測る物差しになります。1 つずつゲートを通り、どのゲートも、クレーム 1 つを API がすでに知っている値 1 つと突き合わせています。検証とはそれです。API が呼び出し元について見解を作るのではなく、設定に書かれた値との等値比較が 4 つか 5 つあるだけで、だからこそ呼び出しごとに回せるほど安く、ネットワークがいらないほどローカルです。

ゲートは登録済みクレームから来ていて、それぞれ別の問いに答えます。`iss` は誰が発行したかを言い、信頼すると決めた issuer と照合されます。`aud` は誰のために発行したかを言い、この API 自身の識別子と照合されます。レポート用 API 向けの完全に有効なトークンが決済 API を開けてしまうのを止めるのがこの確認です。`exp` はいつ真でなくなるかを、`nbf` はいつから真かを言い、どちらも時計と比べつつ少しのずれを許します。`sub` は主体の名前で、誰が何をしたかを記録するときに保存すべきなのはこれです。メールアドレスや表示名と違って安定しているからです。

その次に、ID ではなく権限を運ぶクレームがあります。`scope` はユーザーがアプリにどこまで許したかを言い、委譲全体を囲む粗い柵です。`orders.read` しか持たないアプリは、誰がサインインしていても注文を書けません。ロールやグループは、この主体が何をしてよいかを言い、まったく別の軸です。2 つを分けておくことが大切です。混ぜると、アプリがユーザーの権限をそのまま引き継ぐか、逆にアプリの要求が足りないという理由でユーザーが自分のデータを見られない API ができます。

残りはすべて、請求書の付いた設計上の決定です。クレームはリクエストごとに運ばれるので、1 つ増やすたびに呼び出しごとのバイトになり、いつかリクエスト全体を拒む、どこかのヘッダーサイズの上限になります。グループのクレームがその典型です。ユーザーの所属グループをすべて出すディレクトリは、あるユーザーについては数百個を出しますし、ID プロバイダーはそういうとき一覧のかわりに取りに行くためのポインターを返します。避けようとしていた往復が戻ってくるわけです。認可の規則が実際に読む数個だけを載せ、残りは引きに行ってください。

もう 1 つの罠は古さで、この形式全体が結んだ取引と同じものです。クレームはトークンが作られた瞬間についての記述であり、トークンの寿命のあいだ凍りついています。誰かをグループから外しても、いま持っているトークンは満了まで、その人がグループにいると言い続けます。これは呼び出しごとの照会で回避すべきバグではありません。呼び出しごとに照会した時点で、状態を持たない設計を捨てているからです。これは意図して選ぶ寿命であり、古いままの窓が受け入れられる長さであればよいのです。

.NET ではこのすべてが `HttpContext.User` 上の `ClaimsPrincipal` として届き、個々の記述は `User.FindFirst("scope")` や `User.FindFirstValue(ClaimTypes.NameIdentifier)` で返ってきます。2 つ知っておくと時間が節約できます。フレームワークは既定で短い JWT のクレーム名の一部を長い WS-Federation の URI に対応づけるので、ハンドラーのオプション（API なら `JwtBearerOptions`、サインインなら `OpenIdConnectOptions`、どちらも既定は true）で `MapInboundClaims = false` を設定しないかぎり、`sub` は `nameidentifier` として届きます。あるはずの名前が見つからないときは、ほとんどいつもこれです。そして認可の判断は `if` ではなくポリシーに置いてください。スコープを要求する、あるいは特定の値のクレームを要求するポリシーは、規則を 1 か所にまとめ、その規則に頼るすべてのハンドラーから規則を追い出します。
