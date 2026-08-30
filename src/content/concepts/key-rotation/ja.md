---
title: "Key Rotation"
summary: "キーローテーションは重なりを設けて、予定に沿って資格情報を入れ替えます。呼び出し側が乗り換える間は二つの鍵が同時に有効で、署名は一つの鍵で行い検証はリングで行い、漏れた鍵は永久のアイデンティティではなく閉じていく窓になります。"
category: "認証と認可"
scene: key-rotation
steps:
  - title: "変わらない鍵は、リセットできないパスワードです"
    text: "鍵一つが永遠に有効なら、設定ファイルに、ログ一行に、退職者のノートパソコンに作られたすべての写しが、生き続けるアイデンティティです。ゴーストは期限切れにならない漏洩を見せます。ローテーションは信頼に寿命を付けます。鍵は家宝ではなく版です。"
  - title: "二つの鍵が同時に有効であることが、ローテーションを退屈にします"
    text: "key A がまだ通る間に key B が発行されます。サービスは両方を受け入れ、呼び出し側はデプロイ一回ごとに乗り換え、移行中だという理由で断られる側はいません。A に来るトラフィックが静かになってから A を失効させます。重なりのないローテーションは、予定表付きの障害です。"
  - title: "署名は一つの鍵で、検証はリング全体でします"
    text: "新しいトークンは最新の鍵で署名しますが、昨日のトークンはまだ飛んでいる最中です。だから検証者は最近の鍵のリングを持ち、kid ヘッダーがどの鍵で確かめるかを教えます。古い署名は必要な間だけ正確に検証可能なまま残り、どのローテーションも寿命の途中のトークンを無効にしません。"
  - title: "漏洩は緊急ローテーションです。同じ道を、より速く走るだけです"
    text: "key B が漏れます。ローテーションが日常なら、失効と交換は午前 3 時の即興ではなく、練習された動作です。窓は数分で閉じます。それを可能にするのは鍵そのものを巡る規律です。シークレットストアに保管し、参照で配布し、すべてのアクセスを監査します。"
related:
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
  - label: Mutual TLS
    slug: mutual-tls
  - label: Workload Identity
    slug: workload-identity
  - label: Authentication
    slug: authentication
references:
  - title: Configure cryptographic key auto-rotation in Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/keys/how-to-configure-key-rotation
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Rotation tutorial for resources with two sets of credentials
    url: https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation-dual
---

## いつ使うか

- 長く生きる資格情報はすべて対象です。API キー、署名鍵、接続文字列、クライアントシークレット、証明書。ある文字列がアクセス権を与えるのに、システムのどこもそれを入れ替えないのなら、それは認証ではなく、いくつもの場所に保存された永久のアイデンティティです。
- 漏れた後ではなく、漏れる前に行います。カレンダーを見てローテーションする理由は、緊急時の経路をすでに歩いた道にしておくためです。四半期ごとに回しているチームは漏れた鍵を半日で失効させられますが、圧力の中で初めて回すチームは手順とデプロイを同時に発明することになります。
- シークレットを見た人がそれを必要としなくなったときは、そのたびに行います。退職、契約の終了、ノートパソコンの紛失、リポジトリの公開がその瞬間です。一度見た文字列は取り消せませんから、持ち出されたものを実際に無効にする行動はローテーションだけです。
- 規制が求めるときにも使います。PCI DSS、SOC 2、そして多くの顧客セキュリティレビューがどのみち求めます。ですから選択肢は、ローテーションを前提に設計するか、年に一度苦しんで通り抜けるかの二つです。
- 二つ以上の呼び出し側が共有する資格情報。鍵の住む場所が増えるほど重なりの区間が効いてきますし、この問題の工学的な核心は事実上その重なりの区間がすべてです。

## 注意点

- 重なりのないローテーションは、自分で予定を入れた障害です。順序は発行、配布、移行、古い鍵のトラフィックが静かになったことの確認、そして失効です。発行からいきなり失効へ飛ぶと、日常的な変更が、すべての場所に同じ瞬間に届かなければならないデプロイに変わります。分散システムが最も苦手なのがそれです。
- 「古い鍵が静かになった」は推測ではなく計測であるべきです。リクエストごとにどの鍵が処理したかをログに残し、いちばん遅い呼び出し側のキャッシュ周期より長く古い鍵の回数がゼロだったときに失効させます。その数字がないなら、失効は賭けです。
- 検証と署名は別々の時計で回ります。署名はすぐ最新の鍵に切り替え、古い鍵が署名したトークンが期限切れになるまでは、最近の鍵のリングで検証を続けます。kid ヘッダーと JWKS ドキュメントがあるのはまさにそのためで、検証者が複数の鍵を同時に持てるようにする仕組みです。そのドキュメントのキャッシュ周期は、失効が実際に効くまでの時間にそのまま加算されます。
- 鍵から派生したものを一緒に回さないと、ゴーストが残ります。古い鍵で発行されたセッション、キャッシュされたトークン、キューへ押し込んだ下流の写し。どれも自分の寿命を持つ独立した資格情報なので、最後の一つが消えて初めて漏洩が閉じます。
- 参照で配布しなければ、ローテーションは毎回再デプロイになります。呼び出し側が起動時と更新周期ごとにストアからシークレットを読むなら、ローテーションはデータの変更です。ビルド時に環境変数へ焼き込むなら、ローテーションはリリースになり、リリースこそ午前 3 時にいちばんやりたくない作業です。
- 鍵の使用だけでなく、読み取りを監査します。鍵が漏れたときに被害範囲を教えてくれるのはアクセスログです。誰が、いつ、どこから取得したかがそこに残ります。それがなければ「何が取られたのか」への正直な答えは「最初からすべて」になります。
- 失効の経路も、発行の経路と同じ頻度で試します。新しい鍵を発行する側の半分はいつもうまくいきます。誰かが見ているからです。失効させる側の半分は、誰も覚えていなかったサービスを掘り当てます。そのサービスは火曜日の昼に見つけるほうがましです。

## .NET では

Azure Key Vault が予定そのものを引き受けられます。そうするとローテーションは運用手順書の一項目ではなく、ボールトが強制するポリシーになります。

```csharp
var keys = new KeyClient(new Uri(vaultUri), new DefaultAzureCredential());

await keys.UpdateKeyRotationPolicyAsync("signing-key", new KeyRotationPolicy
{
    ExpiresIn = "P90D",
    LifetimeActions =
    {
        // Cut the next edition a month before this one expires. That month
        // is the overlap, and the overlap is what makes it uneventful.
        new KeyRotationLifetimeAction(KeyRotationPolicyAction.Rotate)
        {
            TimeBeforeExpiry = "P30D",
        },
    },
});
```

呼び出し側はシークレットの写しではなく参照を持つべきです。リクエストごとにボールトを呼ばないよう取得をキャッシュしますが、キャッシュの寿命は意識して決めます。その長さが、失効がこのプロセスに届くまでの時間そのものだからです。

```csharp
// The cache lifetime is a security parameter, not a performance one.
var connection = await cache.GetOrCreateAsync("orders-db", async entry =>
{
    entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
    var secret = await secrets.GetSecretAsync("orders-db");
    return secret.Value.Value;
});
```

ASP.NET Core の Data Protection はすでにこの形で動いていて、手本として読む価値があります。キーリングを保持し、既定では 90 日でアクティブな鍵を引退させ、新しいペイロードは最新の鍵で保護し、古い鍵で作られたペイロードはその鍵がリングから外れるまで解き続けます。

```csharp
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri(blobUri), new DefaultAzureCredential())
    .ProtectKeysWithAzureKeyVault(new Uri(wrappingKeyUri), new DefaultAzureCredential())
    .SetDefaultKeyLifetime(TimeSpan.FromDays(90));
```

トークンなら JWKS ドキュメントに仕事を任せます。ハンドラーが発行者の公開鍵を取得し、kid で照合し、自分の周期で更新するので、発行者側のローテーションのためにこちら側でデプロイするものはありません。

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = "https://login.example.com";
        // How long a rotated-out key can still be accepted, and how quickly a
        // new one becomes usable. Both are this number.
        options.AutomaticRefreshInterval = TimeSpan.FromHours(12);
        options.RefreshInterval = TimeSpan.FromMinutes(5);
    });
```

いちばん安く回せる鍵は、そもそも持たない鍵です。Managed Identity、ワークロード ID フェデレーション、`DefaultAzureCredential` は、保存されたシークレットを、プラットフォームが発行して回してくれるトークンに置き換えます。設定ファイルに一度も現れない資格情報は、設定ファイルから漏れることもできません。
