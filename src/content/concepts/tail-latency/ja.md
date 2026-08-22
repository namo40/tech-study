---
title: "Tail Latency"
summary: "Tail Latency とは、いちばん遅い数パーセントのリクエストが経験する遅延です。平均はこれを隠し、p99 はこれを測り、ファンアウトはこれを多くのユーザーが実際に感じる遅延に変えます。"
category: "要件と品質特性"
scene: tail-latency
steps:
  - title: "100 回に 1 回の遅いリクエスト"
    text: "平均は 62 ms、p50 は 44 ms と言います。p99 は 400 ms と言います。遅いリクエストは尾に住んでいるからです。"
  - title: "ファンアウト"
    text: "10 回呼び出すページは、いちばん遅い 1 回を待ちます。尾が 1% なら、10 ページに 1 ページがそれに当たり、100 回呼び出すならほぼすべてのページが当たります。"
  - title: "Hedge"
    text: "p95 のぶん待ってから、別のレプリカに同じリクエストをもう一度送り、先に返ってきた答えを使います。hedge はトラフィックの数パーセントに抑えます。さもないと、すでに遅いサービスの負荷を 2 倍にしてしまいます。"
  - title: "目標は p99 に置く"
    text: "fallback 付きの timeout は尾に天井を作り、ヒストグラムはその天井が目標より下かを教えてくれます。ここではまだそうではなく、それが次に直すことです。"
related:
  - label: Latency
    slug: latency
  - label: p50
    slug: p50
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Hedging
    slug: hedging
  - label: Timeout
    slug: timeout
  - label: Fallback
    slug: fallback
  - label: SLO
    slug: slo
  - label: Histogram
    slug: histogram
  - label: Aggregator
    slug: aggregator
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Creating metrics in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics-instrumentation
  - title: The Tail at Scale
    url: https://research.google/pubs/the-tail-at-scale/
---

## いつ使うか

- 遅延の目標があるサービスなら、つねに使います。エンドポイントごとに p50、p95、p99 を測り、平均だけを見ることはしません。100 回に 1 回の遅いリクエストは p99 を動かしても、平均はほとんどそのままだからです。
- 複数のバックエンドに分かれて出ていくリクエストなら、つねに使います。ページは自分の呼び出しのうちいちばん遅い 1 回を待つので、ページの代価を決めるのはバックエンドの尾であり、中央値はほとんど効きません。

## 注意点

- hedge と再試行は負荷を増幅します。トラフィックの数パーセントという予算を決め、繰り返しても結果が同じ呼び出しにだけ 2 通目を送ります。
- fallback のない timeout は、遅い応答をエラーに変えるだけです。timeout を入れる前に、呼び出し側が代わりに何を受け取るかを決めます。
- できるところではファンアウトを減らします。尾があるなら、小さな呼び出しを何度もするより、大きな呼び出しを少なくするほうが有利です。
- メトリクスは平均ではなくヒストグラムで残します。平均からパーセンタイルには戻せませんし、平均の平均はもはや平均ですらありません。

## .NET では

```csharp
// Hedge slow calls: after 80 ms (about p95), send one more and take the first answer.
builder.Services
    .AddHttpClient("catalog", client => client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-tail", pipeline =>
    {
        pipeline.AddHedging(new HttpHedgingStrategyOptions
        {
            MaxHedgedAttempts = 1,
            Delay = TimeSpan.FromMilliseconds(80),
        });
        pipeline.AddTimeout(TimeSpan.FromMilliseconds(250));
    });

// Measure the tail: a histogram, read as p50 / p95 / p99 in your metrics backend.
var meter = new Meter("Shop.Checkout");
var checkoutDuration = meter.CreateHistogram<double>("checkout.duration", unit: "ms");
checkoutDuration.Record(stopwatch.Elapsed.TotalMilliseconds);
```

ASP.NET Core と `HttpClient` は `http.server.request.duration` と `http.client.request.duration` をすでにヒストグラムとして出しています。この 2 つを OpenTelemetry で集めれば、自分で計測コードを書かなくてもエンドポイントごとの p99 をそのまま見られます。
