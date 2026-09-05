---
title: "Tail Latency"
summary: "Tail Latency とは、いちばん遅い数パーセントのリクエストが経験するレイテンシです。平均はこれを隠し、p99 はこれを測り、ファンアウトはこれを多くのユーザーが実際に感じるレイテンシに変えます。"
category: "要件と品質特性"
scene: tail-latency
steps:
  - title: "100 回に 1 回の遅いリクエスト"
    text: "平均は 62 ms、p50 は 44 ms と言います。p99 は 400 ms と言います。遅いリクエストはテールに住んでいるからです。"
  - title: "ファンアウト"
    text: "10 回呼び出すページは、いちばん遅い 1 回を待ちます。テールが 1% なら計算上は 10 ページに 1 ページですが、このサービスのテールでは、この 3 ページのうち 2 ページが当たりました。"
  - title: "Hedge"
    text: "p95 のぶん待ってから、別のレプリカに 2 通目を送り、先に返った答えを使います。hedge はトラフィックの数パーセントに抑えます (ここでは 3 ページ目が予算を超え、テールを丸ごと待ちます)。さもないと遅いサービスの負荷が 2 倍になります。"
  - title: "目標は p99 に置く"
    text: "fallback 付きのタイムアウトはテールに天井を作り、p99 の線はその天井が目標より下かを教えてくれます。ここではまだそうではなく、それが次に直すことです。"
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

- レイテンシの目標があるサービスなら、つねに使います。エンドポイントごとに p50、p95、p99 を測り、平均だけを見ることはしません。100 回に 1 回の遅いリクエストは p99 を動かしても、平均はほとんどそのままだからです。
- 複数のバックエンドに分かれて出ていくリクエストなら、つねに使います。ページは自分の呼び出しのうちいちばん遅い 1 回を待つので、ページの代価を決めるのはバックエンドのテールであり、中央値はほとんど効きません。

## 注意点

- hedging と再試行は負荷を増幅します。トラフィックの数パーセントという予算を決め、繰り返しても結果が同じ呼び出しにだけ 2 通目を送ります。
- fallback のないタイムアウトは、遅い応答をエラーに変えるだけです。タイムアウトを入れる前に、呼び出し側が代わりに何を受け取るかを決めます。
- できるところではファンアウトを減らします。テールがあるなら、小さな呼び出しを何度もするより、大きな呼び出しを少なくするほうが有利です。
- メトリクスは平均ではなくヒストグラムで残します。平均からパーセンタイルには戻せませんし、平均の平均はもはや平均ですらありません。

## .NET では

```csharp
// 遅い呼び出しを hedge します。80 ms (おおよそ p95) 待ってからもう 1 通送り、先に返った答えを使います。
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

// テールを測ります。ヒストグラムに残し、メトリクスのバックエンドで p50 / p95 / p99 として読みます。
var meter = new Meter("Shop.Checkout");
var checkoutDuration = meter.CreateHistogram<double>("checkout.duration", unit: "ms");
checkoutDuration.Record(stopwatch.Elapsed.TotalMilliseconds);
```

このパイプラインは同じ `BaseAddress` へ送り直します。同じアドレスではなく別のレプリカへ hedge するには、代わりに `AddStandardHedgingHandler` を使い、2 つ目のエンドポイントを選ぶルーティング戦略を渡します。

ASP.NET Core と `HttpClient` は `http.server.request.duration` と `http.client.request.duration` をすでにヒストグラムとして出しています。この 2 つを OpenTelemetry で集めれば、自分で計装コードを書かなくてもエンドポイントごとの p99 をそのまま見られます。
