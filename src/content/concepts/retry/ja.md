---
title: "Retry"
summary: "Retry は失敗した呼び出しを少し待ってから送り直します。その失敗が一時的だったことに賭ける方法で、待ち時間が長くなり、ランダムなずれがあり、上限が決まっているときにだけ役に立ちます。"
category: "回復性と障害対応"
scene: retry
steps:
  - title: "Retry"
    text: "呼び出しが一度失敗します。Retry は少し待ってから送り直し、今度は成功します。失敗が一時的だったことに賭ける仕組みです。"
  - title: "指数バックオフとジッター"
    text: "待ち時間は毎回長くなり、ランダムなずれを加えることで再試行が同じ瞬間に重ならないようにします。時間を倍ずつ延ばして依存先に回復する余地を与えます。"
  - title: "Retry Storm"
    text: "同じタイミングで再試行する 3 つの呼び出しは、回復中の Service に波のように押し寄せ、再び倒してしまいます。Jitter がその波を散らします。"
  - title: "上限あり"
    text: "3 回試したら予算は使い切りです。呼び出しは永遠に試し続ける代わりに、素早く失敗します。"
related:
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Jitter
    slug: jitter
  - label: Retry Storm
    slug: retry-storm
  - label: Retry Budget
    slug: retry-budget
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Timeout
    slug: timeout
  - label: Idempotency
    slug: idempotency
  - label: Hedging
    slug: hedging
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: Transient fault handling
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
---

## いつ使うか

- 障害が一時的な場合。接続のリセット、DNS の不調、408、429、503、ロック待ちの超過が当てはまります。
- 呼び出しが冪等である場合、または繰り返しても二重に適用されないよう idempotency key を添える場合
- Deadline と Retry Budget にまだ余裕が残っている場合

## 注意点

- POST をはじめ、冪等でない呼び出しをやみくもに再試行しません。
- 再試行は 1 つの層だけが担当するようにします。クライアント、ゲートウェイ、サービスがそれぞれ 3 回ずつ試行すると、1 件の失敗が 27 件の呼び出しになります。
- `Retry-After` に従います。サーバーがいつ戻ってくればよいかを伝えている値です。
- 試行回数と最終結果をメトリクスとして残します。再試行の割合が上がることは早い段階の警告です。

## .NET では

`Microsoft.Extensions.Http.Resilience` を使います。

```csharp
builder.Services
    .AddHttpClient("catalog", client =>
        client.BaseAddress = new Uri("https://catalog.internal"))
    .AddResilienceHandler("catalog-pipeline", pipeline =>
    {
        var retry = new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.FromMilliseconds(500),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
            ShouldRetryAfterHeader = true,
        };
        retry.DisableForUnsafeHttpMethods();   // POST, PATCH, PUT, DELETE, CONNECT
        pipeline.AddRetry(retry);
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });
```

何もしなければこのオプションはすべての HTTP メソッドを再試行するので、`DisableForUnsafeHttpMethods()` の行があってはじめてコードが上の注意点と一致します。`DisableFor(HttpMethod.Post, …)` なら、メソッドを 1 つずつ名指しで除外できます。

既定の `ShouldHandle` は 5xx の応答、408、429、`HttpRequestException`、試行ごとの Timeout を一時的な障害とみなします。`AddStandardResilienceHandler()` は同じ Retry 戦略を rate limiter、Timeout、Circuit Breaker とまとめて提供するので、既定値が合わない場合にだけパイプラインを自分で構成すれば十分です。
