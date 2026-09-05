---
title: "Bearer Token"
summary: "Bearer token は、所持がそのまま権限であるという意味です。API はトークンを差し出した相手に応えるだけで、ほかには何も問いません。トークンの扱い方はすべてこの一文から出てきます。慎重に運び、寿命は短く範囲は狭く保ち、いつか漏れる日をあらかじめ見込んでおくことです。"
category: "認証と認可"
scene: bearer-token
steps:
  - title: "所持がそのまま権限"
    text: "リクエストはヘッダーにトークンを載せて送り、API は相手が誰かを問わずに応えます。トークンがなければ応答もありません。ほかには何も参照されません。この一文がモデルのすべてです。"
  - title: "読めるのであって、秘密ではない"
    text: "JWT は base64 の 3 つの断片です。ヘッダー、ペイロード（つまりクレーム）、署名。手にした人は誰でも読めます。誰のためのものか、何を許すか、いつ死ぬか。エンコードは暗号化ではなく、署名は改変されていないことだけを証明します。"
  - title: "検証のゲート、そして漏洩"
    text: "API は署名と有効期限と audience を確認します。安く、ローカルで、issuer を呼びません。やがてトークンが漏れ、攻撃者も同じゲートを通ります。所持がそのまま権限だからです。被害の上限を決めるのは有効期限で、それは攻撃者にも、再発行するまでのクライアントにも同じです。"
  - title: "署名は消せないので、取り消してローテーションする"
    text: "署名されたトークンは満了まで有効です。早く断ち切るには API がトークンの id を拒否リストと突き合わせる必要があり、それは意図して支払う照会コストです。正直なクライアントはただ新しいトークンへローテーションし、何も気づきません。"
related:
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authorization Code
    slug: authorization-code
  - label: ID Token
    slug: id-token
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Token Revocation
    slug: token-revocation
  - label: Token Rotation
    slug: token-rotation
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "The OAuth 2.0 Authorization Framework: Bearer Token Usage (RFC 6750)"
    url: https://www.rfc-editor.org/rfc/rfc6750
  - title: JSON Web Token (RFC 7519)
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: Access tokens in the Microsoft identity platform
    url: https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
  - title: Configure JWT bearer authentication in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication
---

## いつ使うか

- ログイン後の API 呼び出しは、名前を付けたかどうかにかかわらず、すでにトークンを運んでいます。セッションを共有しないクライアントと API の間で権限が移動する方法が bearer です。呼ぶ側が文字列を 1 つ添えれば API がそれを読み、どちらの側も相手を覚えておく必要がありません。
- API が状態を持たず、呼び出し元が多いときに選びます。署名されたトークンは公開鍵でローカルに検証できるので、呼び出しごとに issuer へ往復することも、共有セッションストアを引くこともありません。この方式が広まった理由がそこにあります。
- ブラウザーを端から端まで自分で扱える場合には向きません。`HttpOnly` を付けた same-site の Cookie も bearer の資格情報ですが、ブラウザーが代わりに添えてくれてスクリプトからは読めません。トークンが盗まれる最大の経路がそれで消えます。
- 401 の割合とトークンの寿命を同じグラフで見てください。401 が一定の周期で階段状に上がるならクライアントの更新より寿命が短いということで、デプロイの直後に上がるなら、たいていは audience か issuer が合わなくなっています。
- トークンを書き残してよい場所を先に決めてください。答えはほとんどの場合「メモリーと `Authorization` ヘッダーの中だけ、ほかのどこにも置かない」です。最初のログ行が出る前に決めるほうが、最初の事故のあとで決めるよりはるかに安く済みます。

## 注意点

- Bearer は言葉のとおりです。トークンを持っている人が勝ちます。API は複製と原本を見分けられないので、設計上の問いはすべて、複製が存在しうる場所を減らし、役に立つ時間を短くするという問題に還元されます。
- URL には決して入れないでください。クエリ文字列はアクセスログ、ブラウザーの履歴、プロキシのログ、そして次のリクエストの `Referer` ヘッダーに残ります。どれも誰も見ていない場所にトークンが住み着いたということです。自分のログも同じで、誰もヘッダーを記録しないと信じるかわりに、ヘッダーを伏せて残してください。
- 短い寿命と refresh のローテーションを組み合わせるほうが、長寿命のトークンより常に優れています。アクセストークンを分単位にし、リフレッシュトークンを使うたびに差し替えれば、被害の窓が小さくなると同時に罠が 1 つできます。同じリフレッシュトークンが二度提示されたという事実そのものが、複製の存在を示す証拠だからです。
- 検証はローカルで、しかも漏らさず行ってください。署名は信頼する issuer が作ったという意味、有効期限はそれがまだ真であるという意味、audience はこの API のためのものだったという意味です。audience の確認を飛ばすと、同じ issuer が出したトークンなら何でもこの API を開けてしまいます。ユーザーが他人のアプリに渡したトークンも含めてです。
- JWT は持っている人が読めるので、クレームに秘密を置く場所はありません。Base64 はエンコードであって暗号ではありません。サポートの問い合わせに貼りたくない内容なら、どこへ流れるか制御できないトークンにも入れないでください。
- 取り消しは例外の経路として残しておいてください。すべての呼び出しを拒否リストと照合すると、状態を持たない API がふたたび状態を持ちます。そのため通常は、平常時を短い寿命で処理し、本当に断ち切る必要があったトークンについてだけ拒否リストを引く形になります。

## .NET では

`AddAuthentication().AddJwtBearer()` が検証の連鎖ごとパイプラインに組み込みます。3 つのゲートは `TokenValidationParameters` で決めます。`ValidIssuer`、`ValidAudience`、そして `ValidateLifetime` で、`ClockSkew` の既定値 5 分は縮めておくほうがよいです。署名鍵はたいてい issuer の discovery 文書から来るので、`Authority` を指定すれば鍵の更新は任せられます。エンドポイントの中でトークンはすでに `ClaimsPrincipal` なので、`User.FindFirst("scope")` で許可された範囲を読み、権限の規則は文字列比較ではなく authorization ポリシーで表します。ここで 1 つ引っかかる点があります。多くの issuer は許可されたすべてのスコープを、その 1 つのクレームに空白区切りの文字列として詰め込みます。Entra ではそのクレームを `scp` と呼びます。ですからクレーム全体を照合するのではなく、値を分割してから比較してください。完全一致では、複数のスコープを許可されたトークンが拒まれます。呼ぶ側では `HttpClient` に `request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token)` を設定しますが、`DelegatingHandler` にトークンを供給させて、取得とキャッシュと更新が呼び出し箇所ごとに散らばらず 1 か所に集まるようにしてください。
