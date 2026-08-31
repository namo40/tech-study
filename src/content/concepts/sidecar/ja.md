---
title: "Sidecar"
summary: "サイドカーはアプリケーションの隣に一緒に乗ります。同じポッド、同じ寿命、それでいて別のコンテナーです。すべてのサービスに必要なもの（TLS、ログ、リトライ）を代わりに引き受け、アプリがどの言語で書かれていても、そのどれもコードに残さないようにします。"
category: "アプリケーションアーキテクチャ"
scene: sidecar
steps:
  - title: "すべてのサービスに必要なものを、すべてのサービスが書き直しています"
    text: "ゴーストはアプリの中で育つ TLS、ロギング、リトライを見せます。隣のアプリにも同じ塊が別の言語で、パッチのたびにずれながらまた育ちます。どれもアプリの仕事ではなく、プラットフォームの仕事です。解決はポッドの二つ目の席です。"
  - title: "同じポッド、違うコンテナー、ひとつの寿命です"
    text: "サイドカーはポッドのネットワークと運命を分かち合えるほど近くに座ります。アプリと一緒に始まり、一緒に死に、一緒に増えます。それでいて別のコンテナーです。自分のイメージ、自分のリリース周期、自分の言語を持ちます。近さが透明さを作り、分離が再利用を作ります。"
  - title: "アプリは localhost の平文しか知りません"
    text: "サイドカーが TLS を終端し、ポッドのループバック越しにリクエストを渡し、ログを後ろから運び出します。証明書がローテーションし、ログ形式が変わっても、アプリのコードはそのどれも聞きません。明日、別の言語のサービスに同じサイドカーを付けてみてください。それがこのパターンの提案の全部です。"
  - title: "出て行く道には大使が立ちます"
    text: "アプリはローカルだと思っている場所を呼び、外向きのサイドカーである ambassador がその呼び出しを本物のバックエンドへ運び、一時障害をリトライして、きれいな答えをひとつ返します。タイムアウト、ルーティング、フェイルオーバーは外交官が代わりに交渉し、アプリには見えません。入るときも出るときも、ポッドの二つ目の席が代弁します。"
related:
  - label: Ambassador
    slug: ambassador
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: Retry
    slug: retry
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Adapter
    slug: adapter
  - label: Facade
    slug: facade
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
references:
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

## いつ使うか

- 艦隊のすべてのサービスに同じものが必要で、そのどれもがそれに関心を持っていないときに使います。TLS 終端と mTLS、ログとメトリクスの搬送、設定の再読み込み、証明書のローテーション、外向き呼び出しのリトライとタイムアウトがそれです。どれもプラットフォームの振る舞いですが、置く場所がないためアプリケーションのリポジトリへ流れ込み続けます。サイドカーがその置き場所です。何がここに属するかを見分ける基準は簡単で、ビジネスルールを一つも挙げずにその変更を説明できるなら、それはサイドカーの取り分です。
- 艦隊が一つの言語だけで書かれていないときに使います。ライブラリはランタイムが一つのときは最も安い答えで、五つのときは最も高い答えになります。実装が五つあれば必ずずれるからです。Go 側に新しいヘッダーが入り、Node 側は三スプリント遅れて追いつき、Python 側はそもそもそのヘッダーがなかったと後から分かります。すべてのポッドに付くコンテナーイメージ一つは実装一つであり、一度配れば済みます。
- 変えられないものにプラットフォームの振る舞いを後から載せたいときに使います。ベンダーから受け取ったイメージ、担当チームが解散したサービス、ビルドがもう通らないバイナリ。どれも作り直せませんが、どれも隣にコンテナーを一つ立てることはできます。アプリはすでに開いているポートで平文 HTTP を聞き続け、それでもポッドの外の世界は mTLS を受け取ります。
- サービスメッシュをすでに使っている、あるいはこれから使うときに使います。メッシュはこのパターンを艦隊規模にしたものです。すべてのポッドにプロキシサイドカーが注入され、コントロールプレーンがその全部をまとめて設定します。サイドカー一つを理解することは、メッシュがポッド千個に何をしているかを理解することです。メッシュの請求書はこれらのホップの合計なので、導入の前に理解しておく価値があります。
- サービスが一つ、言語が一つ、チームが一つなら**使いません**。デプロイ対象が一つで、それがチームの書く言語なら、ライブラリのほうが少ない仕掛けで同じ結果を出します。大きさを決めるコンテナーも、測るべきホップも、配るイメージも増えません。このパターンは同じ問題を二度以上解かなければならないときに元が取れます。サービスが一つの艦隊は、その問題を一度しか解きません。

## 注意点

- ホップの一つひとつが遅延であり、新しい壊れ方です。以前はアプリに直接届いていたリクエストが、いまはサイドカーに届き、ループバックを渡り、それからアプリに着きます。応答も同じ道を戻ります。ポッド自身のネットワークの上では安い代金ですが、ただではありません。しかもアプリは健康なのにサイドカーだけが飢えたり、デッドロックしたり、メモリが足りなくなったりします。増えたホップを雑音とみなさず、実際に測ってください。そして、どちらのコンテナーが病んでいるかをヘルスチェックが教えられるようにしておく必要があります。
- サイドカーのリソースはポッドのリソースから出ます。スケジューラーがポッドを配置するとき、サイドカーの CPU とメモリの要求量はアプリの要求量に足されます。そのため艦隊全体に付くサイドカーが大きな要求量を持っていると、ノード一台に入るポッドの数が静かに変わります。二つのコンテナーの大きさをどちらも意図して決めてください。ログの搬送が集中したときに、みんなが本当に待っているほうを飢えさせるかどうかは、サイドカーの上限が決めます。
- このパターンが実際に噛みつくのは寿命の順序です。アプリが最初のリクエストを受け取る前にサイドカーが準備できていなければなりません。そうでなければ、まだ聞いていないプロキシの前で初期のトラフィックが失敗します。そしてアプリが止まったあとにサイドカーが排出を終える必要があります。そうでなければ、最後に飛んでいたリクエストが自分を運んでいたものを失います。Kubernetes のネイティブサイドカーコンテナー、つまり `restartPolicy: Always` を付けた init コンテナーは、まさにこのためにあります。メインのコンテナーより先に始まり、あとで終了します。`preStop` フックに sleep を入れる前に、こちらを先に使ってください。
- これはプラットフォームの構成要素なので、そのようにバージョンを管理してください。サイドカーはいまや艦隊のすべてのリクエスト経路の上にいます。悪いイメージ一つが、サービス一つの悪い午後ではなく艦隊全体の障害になります。`latest` を追いかけずにワークロードごとにバージョンを固定し、ロードバランサーの設定を配るように配り、アプリケーションのデプロイを一つも触らずに戻せる状態を保ってください。
- ビジネスロジックが入り込むのを許さないでください。サイドカーが注文とは何かを知った瞬間、それは二つ目のアプリケーションになります。二つ目のアプリケーションが備えるべきテストを一つも持たないままです。そしてその配布は毎回ドメインの配布になります。線はどのサービスでも欲しがりうる振る舞いまでです。また、一つずつ担当するサイドカー五つより、五つの仕事をするサイドカー一つのほうが優れています。サイドカーが一つ増えることは、プロセスが一つ増え、ポッドへの要求量が一人分増え、アプリが応じ始める前に準備できていなければならないものが一つ増えることです。

## .NET では

目に見える結果は引き算です。アプリがプラットフォームの仕事をやめるので、面白い差分は `Program.cs` から何が消えるかです。

```csharp
// 前: アプリが TLS とログ搬送、そしてすべての外向き呼び出しのリトライ方針を持つ。
// 三つともプラットフォームの仕事なのに、アプリのリポジトリの中にある。
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(443, l => l.UseHttps(LoadCertificate())));
builder.Logging.AddOpenTelemetry(o => o.AddOtlpExporter(e => e.Endpoint = CollectorUri));
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("https://pricing.internal"))
    .AddPolicyHandler(HttpPolicyExtensions.HandleTransientHttpError()
        .WaitAndRetryAsync(3, attempt => TimeSpan.FromMilliseconds(200 * attempt)));
```

```csharp
// 後: ループバック上の平文 HTTP、stdout へ出るログ、そしてこのポッド自身の
// ポートである基準アドレス。証明書のコードも、エクスポーターも、方針もない。
builder.WebHost.ConfigureKestrel(o => o.ListenLocalhost(8080));
builder.Logging.AddSimpleConsole(o => o.SingleLine = true);
builder.Services.AddHttpClient<PricingClient>(c => c.BaseAddress = new Uri("http://localhost:3500"));
```

Kestrel が `ListenLocalhost` で聞いていることは、はっきり書いておく価値があります。アプリはもうポッドの外からはまったく届かず、アプリを呼べるのはポッドのネットワーク名前空間を共有するプロセスだけです。それがサイドカーです。平文がループバックを出ないのであれば、TLS を別の場所で終端することは格下げではありません。

二つ目の席と共有される寿命は、マニフェストで宣言されます。ネイティブサイドカーは終わらない init コンテナーであり、そのおかげで先に始まりあとで止まる順序が手に入ります。

```yaml
spec:
  initContainers:
    - name: sidecar
      image: registry.internal/platform/edge:2.14.0
      restartPolicy: Always          # init の一段階ではなくサイドカーにしている部分
      ports: [{ containerPort: 443 }]
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits:   { cpu: 500m, memory: 128Mi }
  containers:
    - name: app
      image: registry.internal/shop/api:9.3.1
      env:
        - name: PRICING_BASE_URL
          value: http://localhost:3500      # 本物のホストではなく ambassador
```

そうなるとヘルスチェックは、どちらのコンテナーに尋ねているのかについて正直でなければなりません。アプリの準備状態プローブは、前に何が立っていてもアプリについて答えるべきで、サイドカーは自分のものを別に公開します。

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ShopDbContext>("db")
    .AddCheck("self", () => HealthCheckResult.Healthy());

app.MapHealthChecks("/healthz/ready", new HealthCheckOptions { Predicate = _ => true });
app.MapHealthChecks("/healthz/live", new HealthCheckOptions { Predicate = c => c.Name == "self" });
```

Dapr は .NET 向けの出来合いの形です。部品がすでに作られた状態で同じ絵を渡してくれるので、名前を挙げておく価値があります。ポッドごとに一つ付くサイドカーがサービス呼び出し、発行購読、状態、シークレットを担い、SDK の呼び出しは出て行くときに `http://localhost:3500` へ解決されます。

```csharp
builder.Services.AddDaprClient();

// アプリはホストではなくサービス名を呼ぶ。ディスカバリーと mTLS、リトライと
// タイムアウトはサイドカーの問題で、上のコードはその違いに気づけない。
app.MapPost("/orders", async (Order order, DaprClient dapr, CancellationToken ct) =>
{
    var quote = await dapr.InvokeMethodAsync<Basket, Quote>(
        HttpMethod.Post, "pricing", "quote", order.Basket, ct);
    return Results.Ok(quote);
});
```

別のクラスターへ移すこと、認証局をローテーションすること、ログ形式を変えることが、サイドカーのイメージだけを変えれば済む変更なら、境界は正しい場所にあります。そのどれかがまだアプリケーションのソリューションを開くことを求めるなら、何かが線を越えて中に戻ってきています。
