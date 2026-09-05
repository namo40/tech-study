---
title: "Fallback"
summary: "Fallback は、本来の答えを出せないときに代わりに出す答えです。キャッシュ済みの写し、既定値、より小さなページのように、わざと質を落とした答えを返し、失敗がユーザーまで届かずサービスの内側にとどまるようにします。"
category: "回復性と障害対応"
scene: fallback
steps:
  - title: "すべてが生きているときの完全な応答"
    text: "リクエスト 1 つが中核データと推薦サービスへ分かれて飛び、ページは完全な姿で戻ります。良い日には誰も継ぎ目のことを考えません。継ぎ目を描いておくのは、まさにそのときです。"
  - title: "依存先が死んでも答えは出ていく"
    text: "推薦の呼び出しが失敗します。サービスはページを失敗させる代わりに、昨日のキャッシュ済みリストを出し、fallback と印を付けます。ユーザーは変わらず答えを受け取ります。エラーは内側にとどまります。"
  - title: "沈む前に降ろす"
    text: "容量を超えるリクエストが来たら、速度を絞り、超過分は安い拒否で早めに降ろします。速い 503 はクライアント 1 つに再試行 1 回を払わせるだけですが、遅いタイムアウトは全員に代価を払わせます。縁が先に譲ったから、中核が速いまま残ります。"
  - title: "縮退は設計するモード"
    text: "付加機能を消し、中核を残したまま、サービスは依存先が戻るまで計画された小さな姿で走ります。それから機能を 1 つずつ戻します。部分的に生きる方法を知っているシステムが、完全に死ぬことはめったにありません。"
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Tail Latency
    slug: tail-latency
  - label: Load Shedding
    slug: load-shedding
  - label: Throttling
    slug: throttling
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
---

## いつ使うか

- 失敗したときにエラーより安い答えがある呼び出しです。キャッシュ済みの写しや少し古い写し、既定値、より小さなページ、「受け付けました、あとで仕上げます」という保留の応答がそれにあたります。500 の代わりに何を返したいか言えるなら、すでに fallback は手元にあり、残る問題はそれをどこに置くかだけです。
- 必須よりも付加機能から手をつけます。推薦、関連商品、パーソナライズ、アイコン画像、レビュー件数、配送予定日のように、それ目当てで何かを買うわけではない部分です。こうした呼び出しがページを倒せてはいけないのに、たいていは最も新しく、最も手が入っていないので、遅くなる可能性も一番高いところです。
- Circuit Breaker の代わりではなく、並べて使います。Circuit Breaker は失敗している相手を*いつ*呼ぶのをやめるかを決め、fallback はその間*何と答えるか*を決めます。fallback のない Circuit Breaker は相変わらずエラーを返すだけで、速くなるにすぎません。Circuit Breaker のない fallback は、失敗すると分かっている呼び出しに代価を払い続けます。
- 負荷が高いときは、誰が損をするかを選ぶ手段になります。速度を絞る throttling と超過分をすぐ断る shedding は、1 つの呼び出しではなくサービス全体に対する fallback です。「今は全員を受けられません」への答えは、全員に遅いタイムアウトを配ることではなく、一部に速くて正直な拒否を返すことです。
- 落とした答えをあらかじめ書き留められるときに使います。障害の前に推薦なしのページがどう見えるか言えないなら、障害の最中に誰かがその場で作ります。そうして出来上がるのはエラーページです。

## 注意点

- fallback は置き換える経路より安く、丈夫でなければ、一緒に倒れます。たった今タイムアウトしたそのデータベースへ戻るのは fallback ではなく、手順が増えただけの再試行です。ローカルキャッシュ、静的な既定値、すでにメモリーにある値を先に考えてください。fallback 自身にネットワーク呼び出しが要るなら、その呼び出しまで遅いときにどうなるかを問う必要があります。
- 落とした応答には印を残し、割合を測ります。fallback で作った応答は、ヘッダーでもペイロードのフラグでもトレースの属性でも、どこかにそうだと書くべきです。それがないと fallback は警報線を切った障害になります。推薦が 6 日前の値のままなのにダッシュボードは一面の緑で、最初に気づくのは顧客です。fallback の割合はエラー率と同じ画面に置くのが筋です。答えるのをやめた部分にとっては、それがエラー率そのものだからです。
- でっち上げてはいけない答えがあります。残高、決済の状態、権限、これから引き落とされる在庫のように、ユーザーがその値を見て行動する場合です。もっともらしい誤った数字はエラーより悪くなります。この種の呼び出しは正直に失敗し、そう伝えるべきです。判断の基準は単純で、読む人がその値で決定を下すかどうかです。下すのであれば、古い値を返す fallback は行儀のよい嘘です。
- shedding には優先順位の規則が要ります。なければ推薦と一緒に決済が捨てられます。トークンが尽きたときに届いたものを一律に断るのは、決済の確認とサムネイルの取得を同じ重さで扱うということです。上限をエンドポイントごと、あるいはコストごとに分け、安くて付加的なトラフィックが先に断られるようにします。
- 一度も走ったことのない fallback は仮説にすぎません。テストで強制的に通してください。依存先を応答のないアドレスに向け、リクエストを送り、ページを自分の目で読みます。壊れるのはたいてい fallback 自体ではなく、空のリストを扱えないシリアライザ、項目が最低 1 つはあると決めつけた画面、リクエストごとに出てログ基盤を埋めていく 1 行です。
- fallback が事実上の本経路になっていないかを見ておきます。キャッシュ済みの写しで何か月も足りているなら、その依存先について分かったことがあるということです。正直な対応はその呼び出しを消すことであり、ときどき障害を起こす飾りとして残すことではありません。

## .NET では

Polly v8 は fallback をパイプラインの戦略として置きます。代わりの答えが呼び出し側の `catch` ブロックではなく、タイムアウトや再試行と同じ場所で作られるということです。

```csharp
// 推薦の呼び出しです。短いタイムアウトと、失敗したときのキャッシュ済みの一覧。
var recommendations = new ResiliencePipelineBuilder<IReadOnlyList<Item>>()
    .AddFallback(new FallbackStrategyOptions<IReadOnlyList<Item>>
    {
        ShouldHandle = new PredicateBuilder<IReadOnlyList<Item>>()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
            .Handle<BrokenCircuitException>(),
        FallbackAction = async args =>
        {
            var cached = await store.LastKnownGoodAsync(args.Context.CancellationToken);
            return Outcome.FromResult<IReadOnlyList<Item>>(cached ?? Array.Empty<Item>());
        },
        // 応答が自分の正体を認めないかぎり、障害は見えないままです。
        OnFallback = args =>
        {
            degraded.Value = true;
            metrics.Add(1, new KeyValuePair<string, object?>("reason", "recommendations"));
            return default;
        },
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<IReadOnlyList<Item>>())
    .AddTimeout(TimeSpan.FromMilliseconds(300))
    .Build();
```

戦略は追加した順に外側から実行されるので、ここでは fallback が Circuit Breaker を包み、Circuit Breaker がタイムアウトを包みます。300 ms を超えた呼び出しは取り消され、Circuit Breaker がそれを数え、どちらの失敗が届いても fallback がリストに変えます。パイプラインに*ない*ものにも意味があります。中核データの呼び出しはここにありません。正直な代替物がなく、それを読めないリクエストは失敗すべきだからです。

throttling と shedding はポリシーではなくミドルウェアです。高くつく場所にリクエストが届く前に起きなければならないからです。

```csharp
builder.Services.AddRateLimiter(options =>
{
    // 並ばせるのではなく断ります。今すぐの 503 が、30 秒後のタイムアウトに勝ります。
    options.RejectionStatusCode = StatusCodes.Status503ServiceUnavailable;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "2";
        await context.HttpContext.Response.WriteAsync("busy", token);
    };

    options.AddTokenBucketLimiter("browse", limiter =>
    {
        limiter.TokenLimit = 40;
        limiter.TokensPerPeriod = 20;
        limiter.ReplenishmentPeriod = TimeSpan.FromSeconds(1);
        limiter.QueueLimit = 0;
    });
});

app.MapGet("/products/{id}", GetProduct).RequireRateLimiting("browse");
app.MapPost("/checkout", Checkout); // 決して捨てない
```

`QueueLimit = 0` の 1 行が論旨のすべてです。容量を超えたリクエストは、来ないかもしれないトークンを待つ代わりに即座に断られます。上限がかかっているのが閲覧のエンドポイントだけだという点も見ておく価値があります。決済はわざと触っていません。優先順位の規則のない shedding は、サーバー代を払ってくれるトラフィックを断ってしまうからです。

計画された小さな姿は機能フラグであり、必要になる前に作っておく価値があります。推薦、関連商品、パーソナライズされたバナーを一度に消す `core only` のスイッチがあれば、深夜 3 時の運用者に何かを再起動する以外の手が生まれ、タイムアウトしていたはずのページがひとまず開くページに変わります。`Microsoft.FeatureManagement` で十分です。大事なのはライブラリではなく、そのフラグが存在し、文書に書かれ、訓練で一度は入れてみたという事実です。そうしておけば、障害の最中に画面がまだ推薦サービスを直接呼んでいると気づく、ということが起きません。
