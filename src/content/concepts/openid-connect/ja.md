---
title: "OpenID Connect"
summary: "OAuth 2.0 の上に載せる薄い ID の層です。openid スコープを要求するとアクセストークンの隣に ID トークンが付いてきます。誰がサインインしたかについての署名付きの言明で、宛先は API ではなくアプリです。"
category: "認証と認可"
scene: oauth-2-0
sceneStep: 4
related:
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: ID Token
    slug: id-token
  - label: Claims
    slug: claims
  - label: JSON Web Token
    slug: json-web-token
  - label: Access Token
    slug: access-token
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Bearer Token
    slug: bearer-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
  - title: "Microsoft identity platform and OAuth 2.0 authorization code flow"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
  - title: "OpenID Connect Core 1.0"
    url: https://openid.net/specs/openid-connect-core-1_0.html
---

シーンの 4 番目のステップはリクエストに単語を 1 つ、財布にカードを 1 枚足します。単語は `openid`、カードは ID トークンで、両方が存在する理由は、「これでユーザーをログインさせよう」と言った人が尋ねていない問いに OAuth 2.0 が答えているからです。OAuth は「このアプリがこの操作をしてよいか」に答えます。その人が誰かについては何の意見も持たず、返すアクセストークンは持っているアプリにとってわざと不透明です。

OpenID Connect が標準にまとめるまで、その隙間は長いあいだ悪い形で埋められていました。アプリケーションはアクセストークンを受け取り、提供者がたまたま開けていたプロフィールのエンドポイントを呼び、成功した応答をログインの証拠として扱っていました。そのトークンが別の場所から来るまでは、うまく動きます。アクセストークンは API のために発行された持参人払いの資格情報で、トークンが通ったという事実から「このユーザーはサインイン済みだ」を導くアプリは、誰のトークンでも誰の ID として受け入れたことになります。この弱点には名前があり長い歴史があり、直し方は注意深さではなく構造です。ID はアプリ自身に宛てて発行されたトークンで届く必要があります。

ID トークンがまさにそれです。issuer が署名した JWT で、`aud` はアプリの client ID、クレームはそのサインインを説明します。ユーザーの安定した識別子である `sub`、誰が主張しているかを示す `iss`、いつかを示す `iat` と `exp`、アプリが始めたリクエストに結び付ける `nonce`、そして要求したスコープが許したプロフィールのクレームです。アプリはサインインの時点で一度検証すれば、それで終わりです。更新も、長い寿命も、持ち続ける理由もありません。何かを開ける鍵ではなく、ある瞬間についての言明だからです。

ここから出てくる規則がシーンの掲げる規則で、これだけは例外なしに言えます。ID トークンは API へ行きません。そして API は、アクセストークンの中身を自分のものとして検証せずにそこから ID を読みません。それぞれのトークンは特定の受け取り手のために署名されています。ID トークンを自分の API へ送ることは、別の受け取り手のために作られた資格情報を差し出すことで、それを受け入れる API は audience を意味あるものにしている検査を自分で切ったことになります。API がユーザーは誰かを知る必要があるなら、その情報は認可サーバーがアクセストークンに入れたクレームとして届くべきで、API は自分の `aud` に対してそれを検証します。

覚えておく価値のあるスコープは 3 つで、それぞれ仕事が違います。`openid` は OAuth のリクエストを OpenID Connect のリクエストに変えるスコープで、そもそも ID トークンを生み出すスコープです。`profile` と `email` は人についてのクレームを足します。`offline_access` は ID とは関係がなく、リフレッシュトークンを求めるスコープです。プロトコルのもう半分に属しながら、サインインの設定で他と並んで現れる理由がそれです。

.NET ではハンドラーが仕事をしますが、その仕事の形こそが要点です。`ResponseType = OpenIdConnectResponseType.Code` を設定すると（ハンドラー自身の既定は `id_token` なので、code フローは求めるものです）、`AddOpenIdConnect` は PKCE を使う authorization code の流れを走らせ、ディスカバリー文書の鍵で ID トークンを検証し、issuer と audience と寿命と nonce を確かめ、その結果を `AddCookie` へ渡してセッションに変えます。ID トークンは消費されて捨てられます。残るのは `ClaimsPrincipal` と Cookie です。これが正しい分担で、サインイン周りの不具合の多くはこの分担を取り違えて生まれます。ID トークンはセッションを立て、アクセストークンは API を呼び、この 2 つは互いに置き換えられません。ページに付けた `[Authorize]` は Cookie について尋ねており、API のエンドポイントの `[Authorize]` ポリシーはアクセストークンについて尋ねています。いま見ているのがどちらかを知っておく価値があります。

最後の区別が、後の混乱をずいぶん減らしてくれます。OpenID Connect はサインインが起きたことを伝えます。その後の管理はしません。セッションの寿命、無操作時間の上限、複数アプリケーションにまたがるサインアウト、重要な操作の前の再認証は、すべてアプリケーションの決めることで、Cookie で、そしてユーザーがまだそこにいることを提供者に確かめてもらう必要があるときは `prompt` と `max_age` のパラメーターで決めます。ID トークンの `exp` をセッションの有効期限として扱うのは、アクセストークンでログイン状態を組み立てるのと同じ種類の誤りです。トークンの寿命はトークンを説明するもので、関係を説明するものではありません。
