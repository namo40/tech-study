---
title: "Access Token"
summary: "アクセストークンは、アプリがユーザーの代わりに動くために API へ差し出す資格情報です。寿命が短く、宛先の audience が 1 つに定まり、許可されたスコープだけを載せているので、漏れても長くは役に立たず、ほかの場所ではまったく役に立ちません。"
category: "認証と認可"
scene: authorization-code
sceneStep: 1
related:
  - label: Authorization Code
    slug: authorization-code
  - label: Bearer Token
    slug: bearer-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Refresh Token
    slug: refresh-token
  - label: ID Token
    slug: id-token
  - label: Token Revocation
    slug: token-revocation
  - label: OAuth 2.0
    slug: oauth-2-0
references:
  - title: "The OAuth 2.0 Authorization Framework (RFC 6749)"
    url: https://www.rfc-editor.org/rfc/rfc6749
  - title: "OAuth 2.0 Security Best Current Practice (RFC 9700)"
    url: https://www.rfc-editor.org/info/rfc9700/
  - title: "JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens (RFC 9068)"
    url: https://www.rfc-editor.org/rfc/rfc9068
  - title: JSON Web Token Best Current Practices (RFC 8725)
    url: https://www.rfc-editor.org/rfc/rfc8725
---

シーンの 1 番目のステップが目指している先がアクセストークンです。その手前の手順はすべて、これを安全に得るためにあります。ブラウザーが認可サーバーへ行き、ユーザーのパスワードはそこにだけ入力され、code が戻り、その code がこれと交換されます。それ以降、アプリはユーザーの ID を気にしません。API を呼ぶたびにアクセストークンを付け、そのトークンに何が許されるかは API が判断します。

判断の材料はトークンに載る 3 つです。audience はこのトークンがどの API のために発行されたかを述べます。だから注文 API 用のトークンは、同じ issuer を信頼していても決済 API では拒まれます。スコープはその API のどこまで触れてよいかを述べ、アプリにできること全部ではなく、ユーザーが同意した範囲です。有効期限はその内容がいつまで真かを述べ、意図的に短く取ります。何日ではなく数分です。API にとってそれ以外は重要ではありません。だからアプリは、読める JWT を受け取ったとしてもアクセストークンを中身を見ない値として扱うべきです。

短い寿命が主な防御です。アクセストークンは bearer の資格情報で、持っている側なら誰でも使え、API には複製と原本の区別がつかないからです。設計が選んだ取引がこれです。盗難を不可能にしようとする代わりに、盗まれたトークンが自分で期限切れになるようにし、攻撃者が新しいトークンを作り出せるリフレッシュトークンは、ブラウザーが見られるあらゆる経路から遠ざけます。

多くのアクセストークンは署名付きの JWT です。おかげで API は認可サーバーを呼ばずに検証できます。公開された鍵で署名を確かめ、issuer と audience と有効期限を確かめ、クレームを読むだけです。速く、よくスケールしますが、備えておくべき結果が 1 つ付いてきます。JWT は期限が切れるまで有効なので、セッションを取り消しても、すでに渡ったトークンは止まりません。トークンの寿命ぶんの時間の窓を受け入れるか、その窓が長すぎる呼び出しでは認可サーバーに introspection を求めてください。

残りを安全に保つ習慣は 2 つです。トークンはクエリ文字列ではなく `Authorization` ヘッダーで送ります。そうすればログやブラウザーの履歴、referrer に残りません。そしてブラウザーのストレージから遠ざけます。サーバーレンダリングのアプリならトークンの居場所はサーバーのセッションであり、シングルページアプリなら、代わりに保持してくれるバックエンドの後ろです。
