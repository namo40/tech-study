---
title: "Thread Pool"
summary: "Thread Pool はキューにたまった作業を実行する、小さく共有されたワーカースレッドの集まりです。スレッドを早く返すあいだだけ健全でいられます。I/O でスレッドを握ったままブロックすれば、その待ちが終わるまで無いのと同じであり、代わりに await すれば、そのあいだそのスレッドはほかの作業をさばきます。"
category: "プールとリソース管理"
scene: thread-pool
steps:
  - title: "短い作業"
    text: "リクエストが届くと、空いているスレッドが少しのあいだ実行し、すぐにプールへ戻ります。スレッドは 4 本で十分です。"
  - title: "ブロック"
    text: "各リクエストは I/O を待つあいだスレッドを握ったまま止まります。やがてすべてのスレッドが待つだけになり、キューは伸び、3 件のリクエストが遅れて戻り、プールは新しいスレッドを 1 秒に 2 本ほどしか足しません。これがスレッドプールの枯渇です。"
  - title: "await"
    text: "同じリクエストが今度は I/O を await します。待つあいだはスレッドを手放し、終わったら空いているどのスレッドにでも戻ります。4 本のスレッドで流れ全体をさばきます。"
  - title: "CPU 作業"
    text: "長い計算には本当にスレッドが要ります。ここでは 2 つの計算がスレッドを 2 本使い、残りの 2 本はリクエストをさばき続けます。同時に走る数を縛れば、プールは役に立ち続けます。"
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

- 選ぶ余地はありません。すべての ASP.NET Core リクエスト、すべての `Task` の継続、すべてのタイマーコールバックが、すでにプールの上で動いています。残る問いは、プールを枯渇させない方法だけです。

## 注意点

- プールのスレッドを I/O でブロックしません。リクエスト経路で `.Result`、`.Wait()`、`GetAwaiter().GetResult()`、同期のデータベース呼び出しや HTTP 呼び出しを使いません。
- `ThreadPool.SetMinThreads` を上げると枯渇 (starvation) はしばらく隠れ、別の場所で再び現れます。代わりにブロックしている呼び出しを見つけます。
- 同期 I/O を `Task.Run` で包んでも、プールのスレッドはやはりブロックされます。どのスレッドがブロックされるかが変わるだけです。
- CPU を多く使う並列処理は `MaxDegreeOfParallelism` で制限し、リクエスト処理からスレッドを奪い尽くさないようにします。
- プールそのものを見ます。CPU が空いているのにキューだけ伸び続けるなら、それは負荷ではなく枯渇です。

## .NET では

```csharp
// 誤り。待っているあいだずっとプールのスレッドを塞ぎます。負荷の下ではプールが枯渇します。
public IActionResult GetSync(int id)
{
    var order = _client.GetFromJsonAsync<Order>($"/orders/{id}").Result;
    return Ok(order);
}

// 正しいほう。呼び出しが飛んでいるあいだ、スレッドはプールに返されます。
public async Task<IActionResult> GetAsync(int id, CancellationToken ct)
{
    var order = await _client.GetFromJsonAsync<Order>($"/orders/{id}", ct);
    return Ok(order);
}

// CPU バウンドの仕事。本物のスレッドを使いますが、その本数には上限を置きます。
await Parallel.ForEachAsync(
    images,
    new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount / 2, CancellationToken = ct },
    async (image, token) => await ResizeAsync(image, token));
```

`dotnet-counters monitor --counters System.Runtime` でプールをその場で見られます。.NET 9 以降では `dotnet.thread_pool.thread.count` と `dotnet.thread_pool.queue.length` として、それより古いランタイムでは旧表示名の `ThreadPool Thread Count` と `ThreadPool Queue Length` として出ます。プールがコア数の数倍まで速く立ち上がったあと、キューが伸び続けるあいだにスレッド数が 1 秒に 1、2 本ずつ増え続けるなら、それが枯渇の兆候です。.NET 6 以降、プールは `Task.Wait` 型のブロックにより速く反応するので、その上り坂は短くなりましたが、なくなってはいません。
