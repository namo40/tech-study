---
title: "Bulkhead"
summary: "Bulkhead は依存先ごとにスロットのプールを分けて与えます。遅くなったり失敗したりする依存先は自分の区画しか使い切れず、サービスの残りは動き続けます。"
category: "回復性と障害対応"
scene: bulkhead
steps:
  - title: "共有プール 1 つ"
    text: "A 宛てでも B 宛てでも、すべての呼び出しが同じプールからスロットを取ります。両方の依存先が健全なあいだは問題ありません。"
  - title: "Bulkhead がないと"
    text: "B が遅くなり、B の呼び出しがすべてのスロットを占有します。健全な A への呼び出しも失敗します。A が不調だからではなく、置き場所がないからです。"
  - title: "Bulkhead"
    text: "隔壁がプールを分けます。B は相変わらず自分の 3 スロットを埋め、それ以上は素早く失敗しますが、B の障害は B 側にとどまります。A は流れ続けます。"
  - title: "タイムアウトがスロットを戻します"
    text: "止まった呼び出しがスロットを永久に握っていてはいけません。区画ごとに Timeout を組み合わせ、その依存先の予算に合わせて大きさを決めれば、B はほかの誰にも気づかれずに回復します。"
related:
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Fault Isolation
    slug: fault-isolation
  - label: Timeout
    slug: timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
  - label: Thread Pool Starvation
    slug: thread-pool-starvation
  - label: Pool Exhaustion
    slug: pool-exhaustion
  - label: Noisy Neighbor
    slug: noisy-neighbor
references:
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
---

## いつ使うか

- 1 つのサービスが複数の依存先を呼び出していて、そのうちの遅い 1 つがほかまで巻き込んではいけない場合
- 呼び出し元やテナントによって重要度が違い、一定の容量をあらかじめ確保しておきたい場合
- 依存先が素早く失敗するのではなく、遅くなる形で悪化するとわかっている場合

## 注意点

- Timeout のない Bulkhead は問題を先送りするだけです。止まった呼び出しは Timeout が解放するまでスロットを握り続けます。
- 区画を小さくしすぎると、平常時に容量を無駄にします。実際に測った同時実行数から始め、余裕を足します。
- スロットは HTTP 呼び出しだけではありません。スレッドプール、データベース接続プール、キューにも同じ分離が必要です。
- 区画が埋まったら素早く失敗させ、その拒否をメトリクスに出します。埋まった区画は開いた Circuit Breaker と同じく、早い段階の警告です。

## .NET では

依存先ごとに `HttpClient` とパイプラインを分けて用意します。

```csharp
builder.Services
    .AddHttpClient("search", client =>
        client.BaseAddress = new Uri("https://search.internal"))
    .AddResilienceHandler("search-bulkhead", pipeline =>
    {
        // Search gets its own compartment: 20 calls in flight,
        // 10 waiting, everything beyond that fails fast.
        pipeline.AddConcurrencyLimiter(permitLimit: 20, queueLimit: 10);
        pipeline.AddTimeout(TimeSpan.FromSeconds(2));
    });

builder.Services
    .AddHttpClient("payments", client =>
        client.BaseAddress = new Uri("https://payments.internal"))
    .AddResilienceHandler("payments-bulkhead", pipeline =>
    {
        pipeline.AddConcurrencyLimiter(permitLimit: 50, queueLimit: 0);
        pipeline.AddTimeout(TimeSpan.FromSeconds(1));
    });
```

`SemaphoreSlim` を使えば、外向きの呼び出しだけでなく任意のコード区間にも同じ区画を設けられます。より強い分離はプロセス、コンテナ、データベースプールを分けることで得られ、1 つのプロセス内の制限だけではそこまで届きません。
