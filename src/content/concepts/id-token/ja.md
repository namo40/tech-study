---
title: "ID Token"
summary: "ID トークンは、特定のユーザーが特定の時刻に特定のリクエストへ答えてサインインしたという、認可サーバーの署名付きの言明です。それを求めたクライアントのための認証の証拠であり、API を呼ぶための資格情報ではありません。"
category: "認証と認可"
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Authentication
    slug: authentication
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: OpenID Connect Core 1.0
    url: https://openid.net/specs/openid-connect-core-1_0.html
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
---

1 番目のステップの `/token` 交換が返すのはアクセストークンだけではありません。アプリが `openid` スコープを求めていれば ID トークンも受け取りますが、2 つは取り替えのきくものではありません。アクセストークンは「この呼び出しに何が許されるか」に答え、アプリはその中身を理解する必要がありません。ID トークンは「いま誰がサインインしたのか、それは本当か」に答え、アプリ自身が読んで検証するためにあります。

OpenID Connect が OAuth 2.0 に足したのがこれです。OAuth 自体は委譲のプロトコルで、アプリが API を呼ぶ許可を得られるようにするだけで、その背後にいる人について信頼できることは何も述べません。トークン応答が成功したことからログインを推し量るのはよく知られた誤りです。アクセストークンは、いまのこのユーザーとは無関係な経路でも得られるからです。ID トークンは、サインインそのものを述べるクレームでその隙間を埋めます。ユーザーの安定した識別子である `sub`、保証する側の `iss`、この言明の宛先クライアントである `aud`、時刻を示す `iat` と `exp`、ユーザーが実際に認証した時点の `auth_time`、そしてどのリクエストへの答えかを結ぶ `nonce` です。

検証こそが存在理由なので、すべて行ってください。issuer が公開する鍵で署名を確かめ、`iss` を確かめ、`aud` が自分のクライアント id かを確かめ、有効期限が切れていないかを確かめ、`nonce` が今回のログインで自分が作った値と一致するかを確かめます。`nonce` の検査が、別のセッションのために発行された ID トークンを自分のセッションへ再生させない仕組みです。ASP.NET Core では OpenID Connect ハンドラーがこれらをすべて代わりに行います。フローを自作せずハンドラーを使うべき最大の理由です。

検証が済めば ID トークンの仕事は終わりです。通常はクレームをローカルのセッションへ移し、トークン自体はそれ以上使いません。Cookie でサインイン状態を作り、`sub` をアカウントのキーにし、必要なら表示名やメールアドレスを保存します。ID トークンを API へ送らないでください。API で受け取らないでください。audience はサービスではなくクライアントなので、それを受け取る API は他人宛ての言明を受け取っていることになり、この仕組み全体の安全はその区別の上に立っています。

備えておくべきは、ID トークンに入っていないものです。ID トークンはログインのスナップショットであり、ユーザープロファイルでも認可の判断でもありません。セッション中に変わるロール、リソースによって変わる権限、別の場所で編集されるプロファイル項目は、いずれも外に置きます。userinfo エンドポイント、自前のデータベース、あるいはセッション作成時に走り、自分で決めた周期で更新されるクレーム変換がその置き場です。
