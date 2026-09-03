---
title: "Issuer"
summary: "issuer はトークンを発行した主体であり、その名前は iss クレームが持ちます。検証は文字列の比較ではなく信頼の連なりです。issuer の値がディスカバリー文書を指し、その文書が署名鍵の在りかを教え、署名はその鍵で確かめます。"
category: "認証と認可"
scene: workload-identity
sceneStep: 3
related:
  - label: Workload Identity
    slug: workload-identity
  - label: Audience
    slug: audience
  - label: JSON Web Token
    slug: json-web-token
  - label: Signature
    slug: signature
  - label: OpenID Connect
    slug: openid-connect
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "JSON Web Token (RFC 7519)"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: "OpenID Connect on the Microsoft identity platform"
    url: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
---

シーンの 3 番目の段階はトークンに 2 つの名前を尋ね、issuer はその 1 つ目です。これを発行したのは誰か、という問いです。JWT では `iss` クレームで、親しみやすい名前ではなく URL です。値がインターネット全体で一意でなければならないからであり、受け取る側がその値を使って何かをするからです。2 つ目の問い、つまり誰のためのトークンかは audience の担当で、2 つはそろって初めて役に立ちます。

受け取る側が `iss` で実際に何をするのかが、たいてい飛ばされる部分です。誰もが思い浮かべる文字列の比較は、検査そのものではなく連なりの最後の輪です。issuer の値がディスカバリー文書を指し示し、その文書は issuer の well-known の経路から取ってきます。文書は自分の `issuer` を宣言して `jwks_uri` を指し、その終端が公開鍵を出し、トークンの署名はヘッダーが指した鍵で確かめます。そこまで来て初めて比較に意味が生まれます。このトークンが、受け取る側が信じると決めた主体の公開した鍵で署名されている、という意味になるからです。

```text
GET https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration

  "issuer":   "https://login.microsoftonline.com/<tenant>/v2.0"
  "jwks_uri": "https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys"
```

連なりとして読むと、そうでなければ恣意的に見える運用上の細部が説明できます。鍵を設定に埋めず取りに行くのは issuer が鍵を入れ替えるからで、鍵を固定した受け手は、誰にも知らされない入れ替えの日に壊れる受け手です。文書は更新付きでキャッシュするので、知らない鍵 id のせいで署名の確認が失敗したときは、拒む前に取り直すべきです。issuer は `https` でなければならず、ディスカバリー文書自身の `issuer` の値がトークンの値と一致していなければなりません。攻撃者が渡したディスカバリーの URL に、信頼する issuer の定義を書き換えさせないための仕組みです。.NET では `Authority` を指定するとこの段取りが用意され、`ValidIssuer` は連なり全体ではなくその末端です。

典型的な失敗は多テナントで出ます。テナントで分かれる ID プロバイダーでは issuer にテナント id が入るので、共通の終端に合わせて作った API は顧客ごとに違う `iss` を見ることになり、全部を動かす一番早い道は検査をやめることです。そうすると実際には、世界のどのテナントで発行されたトークンでも受け入れることになります。攻撃者が 5 分前に作って完全に握っているテナントも含まれます。それらのトークンも同じプロバイダーが正しく署名しているからです。正しい形は許可一覧か、オンボードしたテナントの一覧とテナント id を突き合わせる issuer の検証器です。ワークロード ID フェデレーションは、同じ規則を設定として書き留めたものです。クラウドはクラスターのトークンサービスの正確な issuer を、受け入れる subject と一緒に保管します。ですからシーンの 3 番目の段階は、リクエストの時点で下す判断ではなく、誰かが意図して登録しておいた信頼関係を引き当てる作業です。
