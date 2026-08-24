---
title: "Refresh Token"
summary: "Refresh token は、access token が失効したときに、ユーザーをもう一度ログインさせずに新しいトークンを受け取るためアプリが差し出すトークンです。back channel から出ず、使うたびに回転し、古いものが再び届いたら盗難として扱われます。"
category: "認証と認可"
scene: authorization-code
sceneStep: 4
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Token Rotation
    slug: token-rotation
  - label: Access Token
    slug: access-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: Proof Key for Code Exchange
    slug: proof-key-for-code-exchange
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: OAuth 2.0 for Browser-Based Apps
    url: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
---

短い access token は、場面の第 4 段階がたどる問題を生みます。ユーザーがまだ作業している最中にトークンが死ぬのです。API は 401 を返し、誰かが誰の邪魔もせずに新しいトークンを作らなければなりません。ブラウザーを authorization server へ送り直しても動きますが、それが数分おきに起こり、そのたびユーザーをリダイレクトに引き回すことになります。refresh token は、アプリがその仕事を 1 人で、back channel で、ユーザーの操作もブラウザーもなしに片付けるためにあります。

だから refresh token は、アプリが持つもののうち最も価値が高いものです。access token は数分ぶんの限られた権限ですが、refresh token はその許可が生きているかぎり access token を作り続けられる能力です。どの場面でも扱いを変えてください。URL に入れず、ブラウザーへ渡さず、API へ送らず、アプリが secret を置く場所に保存します。サーバー側のセッション、トークンストア、モバイルならプラットフォームのキーチェーンです。

漏れても持ちこたえられるようにするのが回転です。交換のたびに新しい refresh token が返り、いま使ったものは無効になるので、盗まれた複製は正規のアプリが次に更新するまでしか役に立ちません。さらに良いのは、回転が盗難をサーバーの検知できる出来事に変えることです。2 者が同じ refresh token を持っていれば、いつか一方が回転で押し出された古いトークンを差し出します。それは正常な出来事ではありません。仕様どおりのクライアントは使用済みのものを再び差し出さないからです。サーバーの答えは、その系列全体、つまり元の許可から派生したすべてのトークンを失効させることです。両方のセッションが終わり、本物のログインをやり直すことになります。場面の最後がそれで、アプリ自身の refresh token まで複製と一緒に暗くなる理由です。

代償は、応答が失われた状況が攻撃とまったく同じに見えることです。新しいペアを載せた応答がネットワークで消えると、クライアントは古いトークンを持ったままそれで再試行し、系列を失効させてしまいます。手を打ってください。更新の呼び出しは繰り返すと結果が変わる呼び出しとして扱い、やみくもに再試行しないこと。直前のトークンを受け入れて同じ新しいペアを返す短い猶予を設けること。そして一度に 1 つのスレッドだけが更新するようにし、同時呼び出しが互いを失効へ追い込まないようにすることです。

必要なときだけ求めてください。OpenID Connect では `offline_access` scope を要求するという意味で、どのクライアントに与えるかは慎重に決める値打ちがあります。セッションを持つサーバーレンダリングのアプリはたいてい与えてよく、ブラウザーで動くアプリはたいてい与えるべきでなく、SPA で避けられないなら、トークンはページではなくバックエンドの後ろに置きます。そしてトークンを持つ側は、それを失効させられる側でもあるべきです。サインアウトとは Cookie を消すことではなく、revocation エンドポイントを呼ぶことです。
