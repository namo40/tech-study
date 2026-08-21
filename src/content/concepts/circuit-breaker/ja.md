---
title: Circuit Breaker
summary: "Circuit Breaker は失敗が続く依存先への呼び出しを遮断します。呼び出す側はすぐに失敗し、依存先は回復する時間を得ます。"
category: 回復性と障害対応
scene: circuit-breaker
steps:
  - title: "Closed (閉じた状態)"
    text: "リクエストはそのまま Service に届きます。Circuit Breaker はすべての呼び出しを通しながら結果を記録します。Service が失敗し始めると、標本区間 (sampling window、失敗率を測る期間) の中で失敗回数を数えます。"
  - title: "Open (開いた状態)"
    text: "失敗率がしきい値を超えると、Circuit Breaker が開きます。呼び出しは Circuit Breaker で即座に失敗し、Service には届きません。呼び出す側は Timeout を待たずにすぐエラーを受け取り、Service は回復する時間を得ます。"
  - title: "Half-Open (半分開いた状態)"
    text: "遮断時間 (break duration) が過ぎると、試験的な呼び出しを 1 件だけ通します。ほかの呼び出しは引き続き拒否されます。この試験的な呼び出しは、依存先が回復したかどうかだけを確かめます。"
  - title: "再び Closed"
    text: "試験的な呼び出しが成功したので、トラフィックは通常どおり流れます。失敗していれば、Circuit Breaker は遮断時間のあいだ再び Open 状態になります。"
related:
  - label: Retry
    slug: retry
  - label: Timeout
    slug: timeout
  - label: Bulkhead
    slug: bulkhead
  - label: Fallback
    slug: fallback
  - label: Closed State
    slug: closed-state
  - label: Open State
    slug: open-state
  - label: Half-Open State
    slug: half-open-state
  - label: Polly
    slug: polly
  - label: Microsoft.Extensions.Resilience
references:
  - title: Circuit Breaker pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## いつ使うか

- 依存先の障害が一瞬ではなく、ある程度の時間続く場合
- 依存先が停止しているあいだも、呼び出す側は応答を保つ必要がある場合
- 何を失敗とみなすかを定義できる場合。例外、Timeout、特定のステータスコードが基準になります。

## 注意点

- 遮断の範囲を適切に決めます。通常は依存先のエンドポイントごとに Circuit Breaker を 1 つ置くのが適切です。関係のないエンドポイントが 1 つの Circuit Breaker を共有すると、片方が失敗したときに正常なトラフィックまで止まります。
- Timeout と組み合わせます。Timeout がないと、遅い呼び出しはいつまでも失敗として記録されません。
- Retry との順序を決めます。Retry はその失敗が一時的かどうかを確かめる仕組みで、Circuit Breaker は回復が見込めないあいだその確認自体を止めます。
- 状態の変化をメトリクスとログに残します。Open 状態は単なるコードの分岐ではなく、運用上のシグナルです。

## .NET では

`Microsoft.Extensions.Http.Resilience` を使います。以前の `Microsoft.Extensions.Http.Polly` パッケージは非推奨 (deprecated) になっているため、新しいコードでは使いません。

```csharp
builder.Services
    .AddHttpClient("inventory", client =>
        client.BaseAddress = new Uri("https://inventory.internal"))
    .AddResilienceHandler("inventory-pipeline", pipeline =>
    {
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
        pipeline.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            MinimumThroughput = 20,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration = TimeSpan.FromSeconds(15),
        });
    });
```

`AddStandardResilienceHandler()` は rate limiter、リクエスト全体の Timeout、Retry、Circuit Breaker、試行ごとの Timeout を既定値でまとめて提供します。そのため、既定値が合わない場合にだけパイプラインを自分で構成すれば十分です。
