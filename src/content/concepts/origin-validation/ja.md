---
title: "Origin Validation"
summary: "Origin validation は、ブラウザーが付けた Origin ヘッダーをサーバーが自分で読み、そのリクエストがどのサイトから始まったかを確かめて、想定外のホストを拒む検査です。SameSite と antiforgery トークンの後ろに立つ 3 番目の線であり、前の 2 つとは違う壊れ方をします。"
category: "アプリケーションセキュリティ"
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Origin"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
  - title: "Referer"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

シーンの 4 番目のステップは `SameSite` と `token` のあとに 3 つ目のゲートを点け、隣の要約が 3 つとも持ちこたえていると告げます。前の 2 つですでに偽造リクエストを止めているのに、3 つ目に手間をかける意味は何か、という疑問が浮かびます。答えは、3 つが違う壊れ方をするからです。多層防御は、層どうしが同じ失敗を共有していないときにだけ本物になります。

`SameSite` はブラウザーに住みます。ですからブラウザーが古いとき、Cookie が属性なしで書かれたとき、あるいはその規則がまだ許すリクエストのときに破れます。`Lax` のもとでのトップレベル GET 遷移が、シーンの見せている場合です。antiforgery トークンはアプリケーションに住みます。ですから新しいエンドポイントが属性を忘れたとき、フレームワークの知らない何かがフォームを描いたとき、あるいはトークンがページごとキャッシュされて別の人に配られたときに破れます。オリジン検査はサーバーに住み、ページが設定できないヘッダーを読むので、そのすべてを生き延びます。こちらが破れるのは、`Origin` ヘッダーをまったく送らない呼び出し元に対してです。

仕組みは短いものです。ブラウザーはすべてのクロスオリジンのリクエストと、安全でないメソッドを使うすべてのリクエストに `Origin` を付けます。同一オリジンの POST にも付きます。値はスキーム、ホスト、ポートだけでパスは含みません。ユーザーがどのページにいたかが漏れないよう、あえてそうなっています。値が文字どおりの `null` になることもあり、クロスオリジンのリダイレクトやサンドボックス化した iframe がそれを生みます。これは欠けているのではなく、外部のオリジンとして扱います。`Origin` は禁止ヘッダーの一覧にあり、スクリプトから設定も変更もできません。ページは本文に何を入れてもよいけれど、このヘッダーだけはブラウザーが書きます。検査が立っているのは、まさにこの性質です。

そこで規則はこうなります。状態を変えるリクエストごとに `Origin` を読み、自分が提供しているオリジンの集合と突き合わせ、それ以外を拒みます。部分文字列ではなくオリジン全体を比べます。素朴な `StartsWith` では `https://your-site.example.evil.example` が自分のホストで始まってしまい、`https://evil-your-site.example` は自分のホストを含んでしまいます。ヘッダーを URI として解析し、スキーム、ホスト、ポートが許可リストと厳密に一致するかを比べます。

すき間は `Origin` がまったくないリクエストです。古いブラウザーは同一オリジンのリクエストでこのヘッダーを省き、`curl` やサービス間のクライアントのようにブラウザーでない呼び出し元はそもそも送りません。`Referer` が従来からの代役で、オリジンの部分だけを比べるという意味では同じように働きますが、ユーザーやプロキシが取り除くこともあります。ヘッダーがないときの正直な扱いは 3 つあり、どれが正しいかはエンドポイント次第です。そのまま拒む方法は最も安全で、ブラウザーを持たない呼び出し元を切ります。`Referer` に退き、両方ないときだけ拒む方法があります。あるいは、ないことを受け入れたうえで、ブラウザーが自動では付けない資格情報、たとえば bearer トークンを要求する方法があり、これはそもそも偽造が脅威でない場合にあたります。決して正しくないのは、Cookie で認証できるエンドポイントで `Origin` がないことを通過として扱うことです。それでは、攻撃者にとっては発動させさえしなければ済む検査になってしまいます。

`Sec-Fetch-Site` は、同じ発想のより新しく直接的な形です。ブラウザーは HTTPS のオリジンへのすべてのリクエストに `same-origin`、`same-site`、`cross-site`、`none` のいずれかを載せて送るので、サーバーは関係を導き出さずにそのまま読めますし、これもスクリプトからは設定できません。いまは十分に対応が進んでいるので先に見る価値があり、送らないクライアントのために `Origin` を後ろに置きます。

ASP.NET Core では、この検査をハンドラーのあちこちに散らすのではなく、エンドポイントの手前のミドルウェアに置きます。そうすれば新しいエンドポイントが、誰かの記憶ではなく既にあるコードで覆われます。安全なメソッドを通し、`Origin` を設定されたホストと突き合わせ、そうでなければ `400` を返す短いフィルターは、`UseAuthentication` と `UseAntiforgery` のあいだに自然に収まります。この目的で CORS ミドルウェアに手を伸ばさないでください。CORS は誰がレスポンスを読んでよいかを決め、ブラウザーが事後に強制するものなので、緩い CORS ポリシーは偽造リクエストを平気で通しますし、厳しいポリシーでも、フォーム送信のような単純リクエストが送られること自体は止められません。止まるのはプリフライトされるリクエストだけです。オリジン検査はサーバー側の拒否であり、そう書かれなければなりません。
