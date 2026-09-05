---
title: "Polly"
summary: "Polly は .NET の回復性ライブラリで、v8 からの単位は ResiliencePipeline です。実行する呼び出しを複数の戦略が幾重にも包む形であり、追加した順序がそのまま包む順序になるため、Retry と Timeout はどちらが外側にあるかで意味が変わります。"
category: "回復性と障害対応"
scene: circuit-breaker
sceneStep: 1
related:
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Fallback
    slug: fallback
  - label: Bulkhead
    slug: bulkhead
references:
  - title: "Meet Polly: The .NET resilience library"
    url: https://www.pollydocs.org/
  - title: "Build resilient HTTP apps with .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

シーンの最初のステップは、Circuit Breaker が閉じた状態のまま標本区間の中で結果を数える様子を見せます。.NET アプリケーションがその機械を自分で書かずに手に入れる場所が Polly です。v8 からの単位は `ResiliencePipeline` です。`ExecuteAsync` に渡すコールバックを複数の戦略が包んだ鎖であり、`ResiliencePipelineBuilder` で一度だけ組み立てます。パイプラインは状態を持っており、そこが最初に取り違えられる点です。失敗の回数も、開いた回路の時計も、rate limiter の許可数も、すべてパイプラインのオブジェクトの中に住んでいるので、フィールドか依存性注入にシングルトンとして置きます。リクエストごとに組み立てたパイプラインは、リクエストごとに失敗を一度も見たことのない Circuit Breaker を渡すことになり、そのような Circuit Breaker は永遠に開きません。戦略は追加した順に外から内へ重なり、その順序が各戦略の意味を変えます。

```csharp
ResiliencePipeline pipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))  // 再試行を含む呼び出し全体
    .AddRetry(new RetryStrategyOptions { MaxRetryAttempts = 3 })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions { FailureRatio = 0.1 })
    .AddTimeout(TimeSpan.FromSeconds(10))  // 試行 1 回分
    .Build();
```

外側の Timeout は Retry まで含めた処理全体を囲むので、呼び出す側が持っている期限の置き場所ができます。内側の Timeout は 1 回の試行を囲み、これが固まってしまった依存先をただの停止ではなく数えられる失敗に変えます。Circuit Breaker は Retry の内側に位置して処理ではなく試行を数え、Retry の途中でも開くことができます。Retry Storm が、倒れかけた依存先を押さえ続ける当のものになるのを止めているのが、この配置です。

たいていの .NET アプリケーションはこの組み立てを自分ではしません。`Microsoft.Extensions.Http.Resilience` がすでに同梱しているからです。`IHttpClientBuilder` に `AddStandardResilienceHandler()` を呼ぶと、いまの配置がそのまま delegating handler として入ります。既定値は当てずっぽうにせず一度読んでおく価値があります。いちばん外側に rate limiter、全体で 30 秒の Timeout、Exponential Backoff と Jitter を使う再試行 3 回、30 秒の標本区間で最低 100 件を満たしてから失敗率 10% で開く Circuit Breaker、そして 1 試行あたり 10 秒の Timeout です。HTTP 500 以上と 408、429 をすでに失敗として扱う点も違います。自分で組んだパイプラインはそうではありません。一般のパイプラインでは、返ってきた結果は `ShouldHandle` がそう言ったときだけ失敗であり、既定では投げられた例外しか数えません。ハンドラー 1 つはそのクライアントのための Circuit Breaker 1 つを意味するので、複数のホストと話すクライアントなら、悪いホスト 1 つが全体を開けてしまう代わりに authority ごとにパイプラインを選ばせるほうが向いています。

Polly が代わりにできないのは判断です。ある処理が冪等 (idempotency、繰り返しても結果が変わらない性質) かどうかを Polly は知らず、そうでない呼び出しの前に Retry を置くのは、顧客に二重に請求する方法です。呼び出す側の期限も知らないので、外側の Timeout の値は考え出すものではなく受け取るべき数字です。そして Polly の戦略は、隣のページたちを実行できる形にしたものです。Retry、Circuit Breaker、Timeout、Fallback、Hedging、Rate Limiter がどれもビルダーのメソッドなので、それぞれが何を守るのかを決めないまま 4 つ並べてしまいがちです。パイプラインが出すテレメトリーを有効にしたまま、ひとつずつ足していきましょう。そうすれば Circuit Breaker が開く瞬間は、ユーザーから知らされるエラーではなく目に見える出来事になります。
