---
title: "Thread Pool"
summary: "Thread Pool はキューにたまった作業を実行する、小さく共有されたワーカースレッドの集まりです。スレッドを早く返すあいだだけ健全でいられます。I/O でスレッドを握ったままブロックすれば、その待ちが終わるまで無いのと同じであり、代わりに await すれば、そのあいだそのスレッドはほかの作業をさばきます。"
category: "プールとリソース管理"
scene: thread-pool
steps:
  - title: "短い作業"
    text: "リクエストが届くと、空いているスレッドが少しのあいだ実行し、すぐにプールへ戻ります。スレッドは 4 本で十分です。"
  - title: "ブロック"
    text: "各リクエストは I/O を待つあいだスレッドを握ったまま止まります。やがてすべてのスレッドが待つだけになり、キューは伸び、プールはスレッドを一度に 1 本ずつしか足しません。これが Thread Pool starvation です。"
  - title: "await"
    text: "同じリクエストが今度は I/O を await します。待つあいだはスレッドを手放し、終わったら空いているどのスレッドにでも戻ります。4 本のスレッドで流れ全体をさばきます。"
  - title: "CPU 作業"
    text: "長い計算には本当にスレッドが要ります。同時に走る数を抑えて、残りのプールがリクエストをさばき続けられるようにし、ブロックする I/O を Task.Run で包んで非同期に見せかけることはしません。"
related:
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Worker Thread
    slug: worker-thread
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Async/Await
    slug: async-await
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: SemaphoreSlim
    slug: semaphoreslim
  - label: Bulkhead
    slug: bulkhead
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
  - title: ASP.NET Core best practices
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
---

## いつ使うか

- 選ぶ余地はありません。すべての ASP.NET Core リクエスト、すべての `Task` の継続、すべてのタイマーコールバックが、すでにプールの上で動いています。残る問いは、プールを飢えさせない方法だけです。

## 注意点

- プールのスレッドを I/O でブロックしません。リクエスト経路で `.Result`、`.Wait()`、`GetAwaiter().GetResult()`、同期のデータベース呼び出しや HTTP 呼び出しを使いません。
- `ThreadPool.SetMinThreads` を上げると starvation はしばらく隠れ、別の場所で再び現れます。代わりにブロックしている呼び出しを見つけます。
- 同期 I/O を `Task.Run` で包んでも、プールのスレッドはやはりブロックされます。どのスレッドがブロックされるかが変わるだけです。
- CPU を多く使う並列処理は `MaxDegreeOfParallelism` で制限し、リクエスト処理からスレッドを奪い尽くさないようにします。
- プールそのものを見ます。CPU が空いているのにキューだけ伸び続けるなら、それは負荷ではなく starvation です。

## .NET では

```csharp
// Wrong: blocks a pool thread for the whole wait. Under load this starves the pool.
public IActionResult GetSync(int id)
{
    var order = _client.GetFromJsonAsync<Order>($"/orders/{id}").Result;
    return Ok(order);
}

// Right: the thread is returned while the call is in flight.
public async Task<IActionResult> GetAsync(int id, CancellationToken ct)
{
    var order = await _client.GetFromJsonAsync<Order>($"/orders/{id}", ct);
    return Ok(order);
}

// CPU-bound work: real threads, but a bounded number of them.
await Parallel.ForEachAsync(
    images,
    new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount / 2, CancellationToken = ct },
    async (image, token) => await ResizeAsync(image, token));
```

`dotnet-counters monitor --counters System.Runtime` で `ThreadPool Thread Count` と `ThreadPool Queue Length` をその場で見られます。キューが伸び続けるあいだにスレッド数が 1 秒に 1 本ほどのペースで増えていれば、それが starvation の兆候です。
