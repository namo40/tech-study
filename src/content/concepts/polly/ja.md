---
title: "Polly"
summary: "Polly は .NET の回復性ライブラリで、v8 からの単位は ResiliencePipeline です。実行する呼び出しを複数の戦略が幾重にも包む形であり、追加した順序がそのまま包む順序になるため、再試行とタイムアウトはどちらが外側にあるかで意味が変わります。"
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

シーンの最初の段階は、Circuit Breaker が閉じた状態のまま標本区間の中で結果を数える様子を見せます。.NET アプリケーションがその機械を自分で書かずに手に入れる場所が Polly です。v8 からの単位は `ResiliencePipeline` です。`ExecuteAsync` に渡すコールバックを複数の戦略が包んだ鎖であり、`ResiliencePipelineBuilder` で一度だけ組み立てます。パイプラインは状態を持っており、そこが最初に取り違えられる点です。失敗の回数も、開いた回路の時計も、レート制限の許可数も、すべてパイプラインのオブジェクトの中に住んでいるので、フィールドか依存性注入にシングルトンとして置きます。リクエストごとに組み立てたパイプラインは、リクエストごとに失敗を一度も見たことのない遮断器を渡すことになり、そのような遮断器は永遠に開きません。戦略は追加した順に外から内へ重なり、その順序が各戦略の意味を変えます。

```csharp
ResiliencePipeline pipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))  // whole call, retries included
    .AddRetry(new RetryStrategyOptions { MaxRetryAttempts = 3 })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions { FailureRatio = 0.1 })
    .AddTimeout(TimeSpan.FromSeconds(10))  // one attempt
    .Build();
```

外側のタイムアウトは再試行まで含めた処理全体を囲むので、呼び出す側が持っている期限の置き場所ができます。内側のタイムアウトは 1 回の試行を囲み、これが固まってしまった依存先をただの停止ではなく数えられる失敗に変えます。遮断器は再試行の内側に位置して処理ではなく試行を数え、再試行の途中でも開くことができます。再試行の暴走が、倒れかけた依存先を押さえ続ける当のものになるのを止めているのが、この配置です。

たいていの .NET アプリケーションはこの組み立てを自分ではしません。`Microsoft.Extensions.Http.Resilience` がすでに同梱しているからです。`IHttpClientBuilder` に `AddStandardResilienceHandler()` を呼ぶと、いまの配置がそのまま delegating handler として入ります。既定値は当てずっぽうにせず一度読んでおく価値があります。いちばん外側にレート制限、全体で 30 秒のタイムアウト、指数バックオフとジッターを使う再試行 3 回、30 秒の標本区間で最低 100 件を満たしてから失敗率 10% で開く遮断器、そして 1 試行あたり 10 秒のタイムアウトです。HTTP 500 以上と 408、429 をすでに失敗として扱う点も違います。自分で組んだパイプラインはそうではありません。一般のパイプラインでは、返ってきた結果は `ShouldHandle` がそう言ったときだけ失敗であり、既定では投げられた例外しか数えません。ハンドラーひとつはそのクライアントのための遮断器ひとつを意味するので、複数のホストと話すクライアントなら、悪いホスト 1 つが全体を開けてしまう代わりに authority ごとにパイプラインを選ばせるほうが向いています。

Polly が代わりにできないのは判断です。ある処理を繰り返しても結果が変わらないかどうかを Polly は知らず、そうでない呼び出しの前に再試行を置くのは、顧客に二重に請求する方法です。呼び出す側の期限も知らないので、外側のタイムアウトの値は考え出すものではなく受け取るべき数字です。そして Polly の戦略は、隣のページたちを実行できる形にしたものです。再試行、遮断器、タイムアウト、fallback、hedging、レート制限がどれもビルダーのメソッドなので、それぞれが何を守るのかを決めないまま 4 つ並べてしまいがちです。パイプラインが出すテレメトリーを有効にしたまま、ひとつずつ足していきましょう。そうすれば遮断器が開く瞬間は、利用者から知らされるエラーではなく目に見える出来事になります。
