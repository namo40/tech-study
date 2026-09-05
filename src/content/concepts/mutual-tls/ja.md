---
title: "Mutual TLS"
summary: "Mutual TLS は証明を双方向にします。両端が互いに信頼する機関の署名した証明書を提示するので、接続そのものが ID を運び、秘密は回線を渡りません。"
category: "認証と認可"
scene: authentication
sceneStep: 4
related:
  - label: Authentication
    slug: authentication
  - label: API Key
    slug: api-key
  - label: Key Rotation
    slug: key-rotation
  - label: Workload Identity
    slug: workload-identity
  - label: Signature
    slug: signature
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
  - label: JSON Web Token
    slug: json-web-token
  - label: Claims
    slug: claims
  - label: Authorization
    slug: authorization
  - label: OAuth 2.0
    slug: oauth-2-0
  - label: OpenID Connect
    slug: openid-connect
  - label: Cookie Authentication
    slug: cookie-authentication
references:
  - title: "Configure certificate authentication in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authentication/certauth
  - title: "Set Up TLS Mutual Authentication in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/app-service-web-configure-tls-mutual-auth
  - title: "The Transport Layer Security (TLS) Protocol Version 1.3 (RFC 8446)"
    url: https://www.rfc-editor.org/rfc/rfc8446
---

シーンの 4 番目のステップで、絵のどちら側が変わるかに注目してください。3 つのステップのあいだ、証明していたのは呼ぶ側だけで、検証者はしていませんでした。扉が何を求めても、誰も扉に問い返さなかったのです。4 番目のステップでは検証者の中に証明書が現れ、2 つのカプセルにも現れます。どの呼び出しも出発する前にです。この順番が肝心です。ハンドシェイクはリクエストの一部ではなく、リクエストを載せる通路ができる前に終わっていなければならないものです。

普通の TLS もすでに片方向は証明しています。ブラウザーは、サーバーの出した証明書が信頼する機関の署名を受けているか、そこに書かれた名前が接続したホストと一致するかを確かめます。だから、応答してきた誰かではなく、その銀行と話していると分かるのです。Mutual TLS はその検査を反対向きにも回します。サーバーがクライアントに証明書を求め、同じやり方で連鎖と取り消しの状態を確かめ、答えが気に入らなければハンドシェイクを断ります。証明が 2 つ、仕掛けは同じで、どちらも秘密を送りません。

最後の点が、パスワードや API キーと種類を分けるところです。証明書は公開の文書です。所持を証明するのは証明書ではなく秘密鍵であり、その鍵は自分のいる機械を離れません。ハンドシェイクのあいだ、その鍵が両者のたった今合意した何かに署名し、相手はその署名を検証します。盗み聞きした側が記録したものは何も再生できません。署名された対象が、そのハンドシェイクに固有の値だったからです。したがってどちら側になりすますにも、ホストから秘密鍵を盗む必要があり、これは回線からヘッダーを読むのとはまるで等級の違う攻撃です。

こうして得られる ID は証明書のサブジェクトであり、そのサブジェクトが何を意味するかは早めに決めておく価値があります。サービスメッシュでは普通ワークロード ID で、自動的に発行され、年ではなく時間の単位で有効で、プラットフォームが誰の手も借りずにローテーションします。パートナーとの連携では、1 つの組織が持つ長期の証明書であることのほうが多いです。どちらも動きますが運用の費用はまったく違い、その違いのおかげでメッシュ側がよくある形になりました。自分でローテーションする短命の証明書は、期限切れを障害から何でもない出来事に変えます。

実務で mutual TLS が最もよくつまずくのがこの期限切れで、しかも両端でつまずきます。静かに期限の切れたクライアント証明書は、認証の失敗にはまるで見えないエラーとともに呼び出し元を 1 つ止めます。期限の切れた認証局は全員を一度に止めます。あとから見ればどちらも分かりやすいのに、その日が来るまでどちらも見えません。参加するすべての証明書の残り寿命を監視し、期限のずっと手前で知らせ、カレンダーの通知より自動で更新する issuer を選びます。

ASP.NET Core ではサーバー側は Kestrel の設定 1 つとスキーム 1 つです。クライアント証明書を要求するのは転送層の判断なので、パイプラインではなく接続を受け付ける場所で設定します。

```csharp
builder.WebHost.ConfigureKestrel(options =>
{
    options.ConfigureHttpsDefaults(https =>
    {
        // ハンドシェイクの途中で証明書を求めます。出せない接続は
        // そもそもリクエストになりません。
        https.ClientCertificateMode = ClientCertificateMode.RequireCertificate;
    });
});

builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
    .AddCertificate(options =>
    {
        options.AllowedCertificateTypes = CertificateTypes.Chained;
        options.RevocationMode = X509RevocationMode.Online;
    });
```

クライアント側は `HttpClient` が使うハンドラーに証明書を付ける作業で、だから型付きクライアントが自然な置き場所になります。ハンドラーはファクトリが作ってプールし、呼び出しごとには作られず、そこに入った鍵はほかのどこにも現れません。

```csharp
builder.Services.AddHttpClient("ledger")
    .ConfigurePrimaryHttpMessageHandler(() =>
    {
        var handler = new SocketsHttpHandler();
        handler.SslOptions.ClientCertificates = new X509Certificate2Collection(
            X509CertificateLoader.LoadPkcs12FromFile("ledger-client.pfx", password: null));
        return handler;
    });
```

これを正直に保つ習慣が 2 つあります。有効な証明書もしょせん ID にすぎないので、認可の問いは開いたままです。認証局がこれまでに署名したものを全部受け入れるのではなく、サブジェクトや拇印を、実際に応じるつもりだった呼び出し元の一覧と照合してください。そして接続がこちらのコードより手前で終わる場合、つまりロードバランサーやイングレス、API ゲートウェイが前にいる場合は、証明はそこで消費され、アプリケーションには何が起きたかを書いたヘッダー付きの普通のリクエストが届きます。ASP.NET Core にはこの場合の形が用意されています。`AddCertificateForwarding` と `UseCertificateForwarding` がヘッダーから証明書を組み立て直して証明書スキームに渡すので、下流はハンドシェイクがどこで起きたかを知らずに済みます。そのヘッダーが信用できるのは、ほかの何もアプリケーションに届いてその値を設定できないときだけで、それはコードの性質ではなくネットワークの性質です。当てにせず確かめておくほうがよいでしょう。
