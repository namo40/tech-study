---
title: "API Key"
summary: "API キーは機械が差し出す ID の証拠です。一度発行された長い秘密を呼び出しのたびに提示し、台帳と照合します。所持が証明のすべてなので、漏れた鍵はそのまま漏れた ID です。"
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

シーンの 3 番目のステップで、機械が持っていないものに注目してください。`service` のカプセルにパスワードはありません。打つ指もなく、覚えておく人もいないからです。代わりに点の横を板が 1 枚並んで進みます。知っているものではなく、持っているものです。検証者はそれを読み、台帳で引き、返る答えの形は 1 つ前のステップで人へ返したものと同じです。方式が変わっただけで、質問は変わっていません。

これが実質的に API キーのすべてです。サーバーが解析すべき構造もなく、中で議論すべきクレームも持たない、長くてランダムな不透明の文字列です。サーバーは自分が発行した鍵と、その鍵が誰のものかを表で持っていて、検証は照会です。導出されるものも、計算されるものもなく、自分で期限切れになることもありません。鍵は ID に関する証拠ではなく、検査の目的においてはそのまま ID そのものです。最初に聞こえるよりずっと強い主張です。

その帰結が、シーンの 3 番目のステップが示すものです。漏れた鍵はただちに、しかも丸ごと ID の漏洩になります。背後を支える 2 つ目の要素もなく、端末との結び付きもなく、見慣れないサインインに気づくユーザーもいません。その文字列を持つ者がそのサービスであり、どこからでもそうであり、誰かが取り消すまでそうです。だから鍵をめぐる作法はすべて、複製 1 つの値打ちを小さくする作法です。鍵ごとに、持ち主が仕事をできる最小の操作範囲に絞れば、複製が受け継ぐものが小さくなります。1 つを共有せず呼び出し元ごとに鍵を渡せば、ほかの全員を止めずに複製を追跡して取り消せます。そして予定に従ってローテーションすれば、誰も気づかなかった複製にも寿命ができます。

ローテーションは飛ばされがちな部分で、飛ばされる理由は素直にやると停止が起きるからです。解決は、2 つの鍵を同時に有効にしておくことです。新しい鍵を発行し、呼び出し元に配り、古い鍵への通信が止まるまで待ち、それから古い鍵を取り消します。使い勝手のよい鍵ストアはどれもこの重なりに対応していて、重なりができた時点でローテーションは出来事ではなく予定になります。

鍵があってはいけない場所は、あるべき場所と同じくらい大切です。URL には置きません。URL はアクセスログ、ブラウザーの履歴、リファラーのヘッダー、エラー報告に残るからです。リポジトリにも、コンテナーイメージにも、クライアント側のバンドルにも置きません。ブラウザーや携帯に配ったものは、保管したのではなく公開したのだからです。鍵はプラットフォームが用意するシークレットストアにあり、実行時に注入され、こちらのコードがどこにも書き出さないのが正しい姿です。その扱いにはログに残さないことも含まれます。スタックトレースに現れた鍵は、すでに外へ出た鍵です。

.NET ではクライアント側は一度だけ設定する `HttpClient` のヘッダーで、値はリポジトリの中のファイルではなくシークレットストアにつながった構成から来ます。

```csharp
builder.Services.AddHttpClient("billing", client =>
{
    client.BaseAddress = new Uri("https://billing.internal/");
    // 鍵はクエリ文字列ではなくヘッダーに載せます。URL は既定で記録されますが、
    // ヘッダーは誰かがリクエストのログを有効にしたときだけ記録されます。
    client.DefaultRequestHeaders.Add("X-Api-Key", builder.Configuration["Billing:ApiKey"]);
});
```

サーバー側は小さな認証ハンドラーで、大事な点は 2 つとも比較の中にあります。鍵そのものではなくハッシュで引けば、データベースの複製が全部の鍵の複製にはなりません。そして固定時間で比較します。早く抜ける比較は、どこまで一致したかを、時間を測る根気のある相手に漏らすからです。

```csharp
var provided = context.Request.Headers["X-Api-Key"].ToString();

// ヘッダーがないか、接頭辞を持てないほど短い場合は引くものがなく、
// 添字で切り出すと拒否ではなく例外になります。
if (provided.Length < 8) return AuthenticateResult.NoResult();

var digest = SHA256.HashData(Encoding.UTF8.GetBytes(provided));

// 照会が 1 回、そのあと保存されたダイジェストとの固定時間の比較です。
var record = await registry.FindByPrefixAsync(provided[..8]);
if (record is null || !CryptographicOperations.FixedTimeEquals(digest, record.Digest))
{
    return AuthenticateResult.Fail("unknown api key");
}
```

正直に言えば、API キーはシーンが見せる 3 つの方式のうち最も弱く、その理由をはっきりさせておく価値があります。パスワードの背後には 2 つ目の要素を求められる人がいて、証明書は回線を渡らない秘密鍵の所持を証明します。鍵は呼び出しのたびに送る秘密なので、リクエストを読める区間はすべて ID を読めます。ほかに手がないとき、証明書を発行できない外部の呼び出し元が相手のとき、あるいは今いるプラットフォームにもっとよい手段がないときには、API キーが正しい答えです。プラットフォームにマネージド ID やワークロード ID、mutual TLS があるなら、そちらのほうがよいのは理由が 1 つです。守らなければならなかったはずの文字列を、そもそもなくしてくれるからです。
