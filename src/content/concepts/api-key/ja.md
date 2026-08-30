---
title: "API Key"
summary: "API key は機械が差し出す身元の証拠です。一度発行された長い秘密を呼び出しのたびに提示し、台帳と照合します。所持が証明のすべてなので、漏れた鍵はそのまま漏れた身元です。"
category: "認証と認可"
scene: authentication
sceneStep: 3
related:
  - label: Authentication
    slug: authentication
  - label: Mutual TLS
    slug: mutual-tls
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
  - title: "Subscriptions in Azure API Management"
    url: https://learn.microsoft.com/en-us/azure/api-management/api-management-subscriptions
  - title: "AzureKeyCredential Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.azurekeycredential
  - title: "Azure Key Vault Overview"
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/overview
---

シーンの 3 段階目で、機械が持っていないものに注目してください。`service` のカプセルにパスワードはありません。打つ指もなく、覚えておく人もいないからです。代わりに点の横を板が一枚並んで進みます。知っているものではなく、持っているものです。検証者はそれを読み、台帳で引き、返る答えの形は一段階前に人へ返したものと同じです。方式が変わっただけで、質問は変わっていません。

これが実質的に API key のすべてです。サーバーが解析すべき構造もなく、中で議論すべき claim も持たない、長くてランダムな不透明の文字列です。サーバーは自分が発行した鍵と、その鍵が誰のものかを表で持っていて、検証は照会です。導出されるものも、計算されるものもなく、自分で失効することもありません。鍵は身元に関する証拠ではなく、検査の目的においてはそのまま身元そのものです。最初に聞こえるよりずっと強い主張です。

その帰結が、シーンの 3 段階目が示すものです。漏れた鍵はただちに、しかも丸ごと身元の漏洩になります。背後を支える二つ目の要素もなく、端末との結び付きもなく、見慣れないサインインに気づく利用者もいません。その文字列を持つ者がそのサービスであり、どこからでもそうであり、誰かが失効させるまでそうです。だから鍵をめぐる作法はすべて、複製一つの値打ちを小さくする作法です。鍵ごとに、持ち主が仕事をできる最小の操作範囲に絞れば、複製が受け継ぐものが小さくなります。一つを共有せず呼び出し元ごとに鍵を渡せば、ほかの全員を止めずに複製を追跡して失効させられます。そして予定に従ってローテーションすれば、誰も気づかなかった複製にも寿命ができます。

ローテーションは飛ばされがちな部分で、飛ばされる理由は素直にやると停止が起きるからです。解決は、二つの鍵を同時に有効にしておくことです。新しい鍵を発行し、呼び出し元に配り、古い鍵への通信が止まるまで待ち、それから古い鍵を失効させます。使い勝手のよい鍵の保管庫はどれもこの重なりに対応していて、重なりができた時点でローテーションは出来事ではなく予定になります。

鍵があってはいけない場所は、あるべき場所と同じくらい大切です。URL には置きません。URL はアクセスログ、ブラウザの履歴、リファラーのヘッダー、エラー報告に残るからです。リポジトリにも、コンテナーイメージにも、クライアント側のバンドルにも置きません。ブラウザや携帯に配ったものは、保管したのではなく公開したのだからです。鍵はプラットフォームが用意する秘密の保管庫にあり、実行時に注入され、こちらのコードがどこにも書き出さないのが正しい姿です。その扱いにはログに残さないことも含まれます。スタックトレースに現れた鍵は、すでに外へ出た鍵です。

.NET ではクライアント側は一度だけ設定する `HttpClient` のヘッダーで、値はリポジトリの中のファイルではなく秘密の保管庫につながった構成から来ます。

```csharp
builder.Services.AddHttpClient("billing", client =>
{
    client.BaseAddress = new Uri("https://billing.internal/");
    // 鍵はクエリ文字列ではなくヘッダーに載せます。URL は記録され、ヘッダーは残りません。
    client.DefaultRequestHeaders.Add("X-Api-Key", builder.Configuration["Billing:ApiKey"]);
});
```

サーバー側は小さな認証ハンドラーで、大事な点は二つとも比較の中にあります。鍵そのものではなくハッシュで引けば、データベースの複製が全部の鍵の複製にはなりません。そして固定時間で比較します。早く抜ける比較は、どこまで一致したかを、時間を測る根気のある相手に漏らすからです。

```csharp
var provided = context.Request.Headers["X-Api-Key"].ToString();
var digest = SHA256.HashData(Encoding.UTF8.GetBytes(provided));

// 照会が一度、そのあと保存されたダイジェストとの固定時間の比較です。
var record = await registry.FindByPrefixAsync(provided[..8]);
if (record is null || !CryptographicOperations.FixedTimeEquals(digest, record.Digest))
{
    return AuthenticateResult.Fail("unknown api key");
}
```

正直に言えば、API key はシーンが見せる三つの方式のうち最も弱く、その理由をはっきりさせておく価値があります。パスワードの背後には二つ目の要素を求められる人がいて、証明書は回線を渡らない秘密鍵の所持を証明します。鍵は呼び出しのたびに送る秘密なので、リクエストを読める区間はすべて身元を読めます。ほかに手がないとき、証明書を発行できない外部の呼び出し元が相手のとき、あるいは今いるプラットフォームにもっとよい手段がないときには、API key が正しい答えです。プラットフォームにマネージド ID やワークロード ID、mutual TLS があるなら、そちらのほうがよいのは理由が一つです。守らなければならなかったはずの文字列を、そもそもなくしてくれるからです。
