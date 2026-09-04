---
title: "Proof Key for Code Exchange"
summary: "PKCE は authorization code を、それを求めたクライアントに結び付けます。クライアントはログインごとにランダムな verifier を作り、code を求めるときはそのハッシュを、code を使うときは verifier そのものを送ります。だから盗まれた code は、元の値を持たない者には役に立ちません。"
category: "認証と認可"
scene: authorization-code
sceneStep: 3
related:
  - label: Authorization Code
    slug: authorization-code
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Access Token
    slug: access-token
  - label: Refresh Token
    slug: refresh-token
  - label: Authentication
    slug: authentication
  - label: Authorization
    slug: authorization
references:
  - title: "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
    url: https://www.rfc-editor.org/rfc/rfc7636
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "OAuth 2.0 for Browser-Based Applications (RFC 10017)"
    url: https://www.rfc-editor.org/rfc/rfc10017
---

場面の第 3 段階は、アプリについて 1 つだけ条件を変えます。client secret がないということです。シングルページアプリはソースを訪問者全員に配り、モバイルアプリは誰でも展開できるバイナリを配ります。そこに埋め込んだ secret は、誰かが覗くまでの間だけ secret です。こうして第 2 段階が頼っていた検査が消えます。code は相変わらず front channel を通り、攻撃者は相変わらず URL から複製でき、`/token` では 2 人の呼び出し元を見分けられなくなります。

PKCE は secret を戻します。ただしログインごとに新しく作り、どこにも保存しない形でです。ブラウザーを送り出す前に、クライアントはエントロピーの高いランダム文字列 `code_verifier` を作ってメモリーに置きます。それを SHA-256 でハッシュした値を `code_challenge` として、`code_challenge_method=S256` とともに認可要求に載せます。サーバーはこれから発行する code の隣にその challenge を保存します。code が交換のために戻ってくると、クライアントは verifier を平文で送り、サーバーは改めてハッシュして比べます。値が同じなら同じクライアント、値が違うか verifier がなければトークンはありません。

この方式が効くのは、front channel を通るのがハッシュだけだからです。URL や履歴の項目、referrer ヘッダーを読む攻撃者は challenge と code を見ますが、そのどちらからも verifier には戻せません。暗号学的ハッシュがしないことが、まさにそれです。こうして盗まれた code は、盗んだ側が見たこともない値に結び付いています。同じ複製 code が前の段階とは違う理由で `/token` に拒まれる場面が、その姿です。

secret を持つ confidential client も含め、どこでも使ってください。現在のセキュリティ指針は PKCE を authorization code フローの選択肢ではなくその一部として扱います。code injection も同時に防ぐからです。code injection は、攻撃者が被害者のブラウザーに攻撃者の code を交換させ、2 つのアカウントをひそかに結び付ける攻撃です。方式は必ず `S256` を使ってください。`plain` はハッシュを計算できないクライアントのために残っているだけで、challenge と verifier が同じ文字列では何も守りません。

.NET では作るものがありません。`AddOpenIdConnect` は `UsePkce = true` を既定とし、verifier を作って往復の間 correlation Cookie に預け、交換のときに送り返します。モバイルやデスクトップのクライアントも、公式に推奨されるライブラリを使えば同じです。SPA では、フローを実行するバックエンドを置いてトークンがブラウザーに届かないようにし、その間を通る code は PKCE に守らせてください。
