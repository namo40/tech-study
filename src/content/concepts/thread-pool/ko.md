---
title: "Thread Pool"
summary: "Thread Pool은 큐에 쌓인 작업을 실행하는, 작고 공유되는 워커 스레드 묶음입니다. 스레드를 빨리 돌려줄 때만 건강하게 유지됩니다. I/O에서 스레드를 붙잡은 채 막히면 그 대기가 끝날 때까지 없는 것이나 마찬가지이고, 대신 await하면 그동안 그 스레드가 다른 작업을 처리합니다."
category: "Pool과 리소스 관리"
scene: thread-pool
steps:
  - title: "짧은 작업"
    text: "요청이 들어오면 빈 스레드가 잠깐 실행하고 곧바로 풀로 돌아옵니다. 스레드 넷이면 충분합니다."
  - title: "막힘"
    text: "요청마다 I/O를 기다리는 동안 스레드를 쥐고 멈춥니다. 곧 모든 스레드가 기다리기만 하고, 큐는 쌓이고, 요청 셋이 늦게 돌아오며, 풀은 새 스레드를 초당 두어 개만 보탭니다. 이것이 Thread Pool starvation입니다."
  - title: "await"
    text: "같은 요청이 이번에는 I/O를 await합니다. 기다리는 동안 스레드를 내놓고, 끝나면 아무 빈 스레드로 돌아옵니다. 스레드 넷이 흐름 전체를 감당합니다."
  - title: "CPU 작업"
    text: "긴 계산은 정말로 스레드가 필요합니다. 여기서는 그중 둘이 스레드 둘을 차지하고 나머지 둘은 계속 요청을 처리합니다. 동시에 도는 개수를 제한하면 풀은 계속 쓸모를 유지합니다."
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

## 언제 쓰나

- 고를 수 있는 것이 아닙니다. 모든 ASP.NET Core 요청, 모든 `Task` continuation, 모든 타이머 콜백이 이미 풀 위에서 돕니다. 남는 질문은 풀을 굶기지 않는 방법뿐입니다.

## 주의점

- 풀 스레드를 I/O에서 막지 않습니다. 요청 경로에서 `.Result`, `.Wait()`, `GetAwaiter().GetResult()`, 동기 데이터베이스 호출, 동기 HTTP 호출을 쓰지 않습니다.
- `ThreadPool.SetMinThreads`를 올리면 starvation이 한동안 가려졌다가 다른 곳에서 다시 나타납니다. 대신 막고 있는 호출을 찾습니다.
- 동기 I/O를 `Task.Run`으로 감싸도 풀 스레드는 그대로 막힙니다. 어느 스레드가 막히는지만 바뀝니다.
- CPU를 많이 쓰는 병렬 처리는 `MaxDegreeOfParallelism`으로 제한해, 요청 처리에서 스레드를 전부 가져가지 못하게 합니다.
- 풀 자체를 지켜봅니다. CPU는 놀고 있는데 큐만 계속 자란다면 그것은 부하가 아니라 starvation입니다.

## .NET에서는

```csharp
// 잘못된 예: 기다리는 내내 풀 스레드를 막습니다. 부하가 걸리면 이것이 풀에 starvation을 일으킵니다.
public IActionResult GetSync(int id)
{
    var order = _client.GetFromJsonAsync<Order>($"/orders/{id}").Result;
    return Ok(order);
}

// 옳은 예: 호출이 떠 있는 동안 스레드는 반납됩니다.
public async Task<IActionResult> GetAsync(int id, CancellationToken ct)
{
    var order = await _client.GetFromJsonAsync<Order>($"/orders/{id}", ct);
    return Ok(order);
}

// CPU를 쓰는 작업: 진짜 스레드를 쓰되 개수를 묶습니다.
await Parallel.ForEachAsync(
    images,
    new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount / 2, CancellationToken = ct },
    async (image, token) => await ResizeAsync(image, token));
```

`dotnet-counters monitor --counters System.Runtime`으로 풀을 실시간으로 볼 수 있습니다. .NET 9 이상에서는 `dotnet.thread_pool.thread.count`와 `dotnet.thread_pool.queue.length`로, 그 이전 런타임에서는 옛 표시 이름인 `ThreadPool Thread Count`와 `ThreadPool Queue Length`로 나타납니다. 풀이 코어 수의 몇 배까지 빠르게 늘어나는 초기 구간을 지난 뒤에도 스레드 수가 초당 한두 개씩 계속 오르고 그동안 큐가 계속 자란다면 그것이 starvation의 신호입니다. .NET 6부터는 풀이 `Task.Wait` 식의 막힘에 더 빨리 반응하므로 그 상승이 짧아졌지만 사라지지는 않았습니다.
