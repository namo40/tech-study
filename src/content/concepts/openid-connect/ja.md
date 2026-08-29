---
title: "OpenID Connect"
summary: "OAuth 2.0 の上に載せる薄い身元の層です。openid 範囲を要求すると access トークンの隣に id トークンが付いてきます。誰がサインインしたかについての署名付きの陳述で、宛先は API ではなくアプリです。"
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

場面の 4 段目は要求に単語を一つ、財布にカードを一枚足します。単語は `openid`、カードは `id` トークンで、両方が存在する理由は、「これでユーザーをログインさせよう」と言った人が尋ねていない問いに OAuth 2.0 が答えているからです。OAuth は「このアプリがこの操作をしてよいか」に答えます。その人が誰かについては何の意見も持たず、返す access トークンは持っているアプリにとってわざと不透明です。

OpenID Connect が標準にまとめるまで、その隙間は長いあいだ悪い形で埋められていました。アプリケーションは access トークンを受け取り、提供者がたまたま開けていたプロフィールのエンドポイントを呼び、成功した応答をログインの証拠として扱っていました。そのトークンが別の場所から来るまでは、うまく動きます。access トークンは API のために発行された持参人払いの資格情報で、トークンが通ったという事実から「このユーザーはサインイン済みだ」を導くアプリは、誰のトークンでも誰の身元として受け入れたことになります。この弱点には名前があり長い歴史があり、直し方は注意深さではなく構造です。身元はアプリ自身に宛てて発行されたトークンで届く必要があります。

id トークンがまさにそれです。発行者が署名した JWT で、`aud` はアプリの client ID、クレームはそのサインインを説明します。ユーザーの安定した識別子である `sub`、誰が主張しているかを示す `iss`、いつかを示す `iat` と `exp`、アプリが始めた要求に結び付ける `nonce`、そして要求した範囲が許したプロフィールのクレームです。アプリはサインインの時点で一度検証すれば、それで終わりです。更新も、長い寿命も、持ち続ける理由もありません。何かを開ける鍵ではなく、ある瞬間についての陳述だからです。

ここから出てくる規則が場面の掲げる規則で、これだけは例外なしに言えます。id トークンは API へ行きません。そして API は、access トークンの中身を自分のものとして検証せずにそこから身元を読みません。それぞれのトークンは特定の受け取り手のために署名されています。id トークンを自分の API へ送ることは、別の受け取り手のために作られた資格情報を差し出すことで、それを受け入れる API は audience を意味あるものにしている検査を自分で切ったことになります。API がユーザーは誰かを知る必要があるなら、その情報は認可サーバーが access トークンに入れたクレームとして届くべきで、API は自分の `aud` に対してそれを検証します。

覚えておく価値のある範囲は三つで、それぞれ仕事が違います。`openid` は OAuth の要求を OpenID Connect の要求に変える範囲で、そもそも id トークンを生み出す範囲です。`profile` と `email` は人についてのクレームを足します。`offline_access` は身元とは関係がなく、refresh トークンを求める範囲です。プロトコルのもう半分に属しながら、サインインの設定で他と並んで現れる理由がそれです。

.NET ではハンドラーが仕事をしますが、その仕事の形こそが要点です。`AddOpenIdConnect` は PKCE を使う authorization code の流れを走らせ、ディスカバリー文書の鍵で id トークンを検証し、発行者と audience と寿命と nonce を確かめ、その結果を `AddCookie` へ渡してセッションに変えます。id トークンは消費されて捨てられます。残るのは `ClaimsPrincipal` とクッキーです。これが正しい分担で、サインイン周りの不具合の多くはこの分担を取り違えて生まれます。id トークンはセッションを立て、access トークンは API を呼び、この二つは互いに置き換えられません。ページに付けた `[Authorize]` はクッキーについて尋ねており、API のエンドポイントの `[Authorize]` ポリシーは access トークンについて尋ねています。いま見ているのがどちらかを知っておく価値があります。

最後の区別が、後の混乱をずいぶん減らしてくれます。OpenID Connect はサインインが起きたことを伝えます。その後の管理はしません。セッションの寿命、無操作時間の上限、複数アプリケーションにまたがるサインアウト、重要な操作の前の再認証は、すべてアプリケーションの決めることで、クッキーで、そしてユーザーがまだそこにいることを提供者に確かめてもらう必要があるときは `prompt` と `max_age` の引数で決めます。id トークンの `exp` をセッションの失効として扱うのは、access トークンでログイン状態を組み立てるのと同じ種類の誤りです。トークンの寿命はトークンを説明するもので、関係を説明するものではありません。
