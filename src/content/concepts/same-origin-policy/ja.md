---
title: "Same-Origin Policy"
summary: "Same-origin policy は、ブラウザーがサイトとサイトの間に引く既定の境界です。ページは自分のオリジンが返したものを読めますが、別のオリジンが返したものは読めません。この規則が制限するのは読むことであって送ることではなく、だからこそどんなページのフォームでも自分たちのサイトへ送信できます。"
category: "アプリケーションセキュリティ"
scene: cookie-authentication
sceneStep: 2
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
references:
  - title: "Same-origin policy"
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Window: postMessage() method"
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
---

シーンの 2 番目のステップは、社内の誰も書いていないページが自分たちのサーバーへフォームを送信し、ブラウザーがそこにセッション Cookie を付けるところです。最初に浮かぶのは、そもそもブラウザーが止めるべきではないか、という反応でしょう。ブラウザーはサイトを隔てる役目を負っているからです。実際に隔ててはいます。その分離が same-origin policy であり、それが何を隔てているのかを正確に知ると、シーンの残りが腑に落ちます。

オリジンとは、スキーム、ホスト、ポートの 3 つがすべて厳密に一致する組み合わせです。`https://shop.example` と `https://api.shop.example` は別のオリジンで、`https://shop.example` と `http://shop.example` も別、同じホストの 443 番と 8443 番も別です。「ほぼ同じ」という概念はありません。サブドメインは他人のドメインと同じくらい外部です。これは意図した設計です。そうしなければ境界のあいまいな規則になり、境界のあいまいなセキュリティ規則は議論の末に役に立たなくなるからです。

このポリシーが実際に禁じているのは、あるオリジンが別のオリジンのデータを読むことです。`evil.example` のスクリプトは、自分たちの API への fetch のレスポンス本文を読めません。自分たちのページを収めたフレームに手を伸ばして DOM を読むこともできません。自分たちのホストの `document.cookie` も読めません。自分たちのオリジンから取った画像をキャンバスに描いて、そのピクセルを読み返すこともできません。この一覧はすべて読み取りで、パターンは一貫しています。ブラウザーはリクエストは喜んで送り、その答えを求めたページへ渡すことだけを拒みます。

逆にこのポリシーが禁じていないのは、送ることです。埋め込みは設計として許されています。Web は他人の画像、スクリプト、スタイルシート、フォント、動画を引き込むページでできており、その一つ一つが、ブラウザーが送って処理しながら埋め込んだページにはバイト列を見せないクロスオリジンのリクエストです。フォームも同じです。HTML は最初から、どのページからでもどの URL へでもフォームを送信できるようにしてあり、ブラウザーはその宛先に保存された Cookie を載せて送ります。トップレベルの遷移も同じです。どれも開けっ放しにされた穴ではなく、プラットフォームが立っている振る舞いそのもので、セキュリティモデルより何年も前からあります。

この 2 つの半分がはっきりすると、シーンはもう驚きではなくなります。偽造された送信が出ていくのは、送ることが最初から制限されていないからです。Cookie が一緒に載るのは、Cookie が宛先を基準に付くのであって、誰が頼んだかを基準に付くのではないからです。そして攻撃者はレスポンスから何も学べません。読むことは制限されているからです。cross-site request forgery がデータを盗む攻撃ではなく結果を起こす攻撃である理由がここにあります。攻撃者はサーバーに何かをさせられても、サーバーが何と答えたかは見られません。

もう 2 つ、持ち帰る価値のある帰結があります。第一に、CORS はこのポリシーに空いた穴ではなく制御された例外であり、緩めるのは読む側の半分だけです。サーバーはどのオリジンが自分のレスポンスを読んでよいかを言えますが、その発言は誰が送ってよいかについては何も変えません。偽造の問題を直そうとして緩い CORS ポリシーを足したチームは、規則の違うほうの半分に触れており、たいていは事態を悪くしています。資格情報を有効にしたまま `Access-Control-Allow-Origin` を開けば、攻撃者に読む側の半分まで渡すことになるからです。

第二に、このポリシーはブラウザーの規則であり、ブラウザーだけの規則です。`curl`、モバイルアプリ、バックエンドのサービス、スクレイパーにはオリジンもポリシーもありません。ネットワークで届くものはすべて読めます。ですからブラウザーが読むのを拒んでくれるという理由だけで安全な非公開 API は非公開ではなく、エンドポイントの本当の防御はサーバー側の認証と認可でなければなりません。Same-origin policy はユーザーが開いているページどうしの境界であって、自分たちのサーバーを囲む境界ではありません。
