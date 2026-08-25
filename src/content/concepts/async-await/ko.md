---
title: "Async/Await"
summary: "`await`는 메서드가 스레드를 돌려주는 지점입니다. 그 자리에서 I/O가 시작되고, 메서드는 아직 끝나지 않은 Task를 호출자에게 반환하며, 메서드의 나머지는 I/O가 끝날 때 그때 비어 있는 아무 스레드에서 실행되도록 큐에 들어갑니다."
category: "Pool과 자원 관리"
scene: async-await
steps:
  - title: "await가 하는 일"
    text: "메서드는 await를 만날 때까지 실행됩니다. 그 순간 I/O가 시작되고, 메서드는 끝나지 않은 Task를 호출자에게 돌려주고, 스레드는 자유로워집니다. I/O가 끝나면 메서드의 나머지가 큐에 들어가 빈 스레드 아무 데서나 실행됩니다. 같은 스레드일 필요는 없습니다."
  - title: "차례로, 아니면 동시에"
    text: "호출을 하나 기다리고 다음을 기다리면 시간이 더해집니다. 둘을 먼저 시작해 놓고 함께 기다리면 가장 긴 하나만큼 걸립니다. 같은 스레드, 같은 I/O인데 await의 순서만 달라졌습니다."
  - title: "두 가지 실수"
    text: ".Result로 막으면 스레드가 아무것도 안 하면서 바쁘고, 단일 스레드 컨텍스트에서는 continuation이 실행될 곳이 없어 데드락이 됩니다. async void 메서드는 기다릴 Task를 돌려주지 않아 예외가 갈 곳이 없습니다. 끝까지 async로 가고, Task를 반환하세요."
  - title: "취소와 오류는 같은 길을 탑니다"
    text: "토큰을 I/O까지 끝까지 넘기면 취소가 작업을 버려두는 대신 멈추게 합니다. 취소든 실패든 Task를 await하면 바로 그 await 지점에서 다시 던져져, 평범한 catch로 처리할 수 있습니다."
related:
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Task
    slug: task
  - label: Batching
    slug: batching
references:
  - title: "Asynchronous programming with async and await (C#)"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "ASP.NET Core best practices"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/best-practices?view=aspnetcore-10.0
---

## 언제 쓰나

- 모든 I/O에 씁니다. 데이터베이스 왕복, HTTP 호출, 파일 읽기, 브로커로 보내는 메시지가 모두 해당합니다. API가 async 메서드를 제공하면 그것을 쓰고, 중간의 어느 계층도 막히지 않도록 호출 사슬 전체를 async로 유지하세요.
- 호출 하나의 지연 시간보다 처리량이 중요한 곳에 씁니다. async는 요청 하나를 더 빠르게 만들지 않습니다. 기다리던 스레드를 다른 사람이 쓸 수 있게 만들 뿐이고, 부하가 걸린 서버를 계속 응답하게 하는 것이 바로 그것입니다.
- 서로 무관한 호출 여러 개를 동시에 띄울 수 있을 때 씁니다. 함께 시작해 함께 기다리는 것은 대부분의 서비스가 가진 가장 싼 지연 시간 개선책입니다.

CPU를 쓰는 작업은 다른 문제입니다. `await`는 계산을 빠르게 만들지 않고, `Task.Run`은 그 일을 다른 풀 스레드로 옮길 뿐이라 실행되는 동안 스레드 하나는 그대로 듭니다. async는 일하는 방법이 아니라 기다리는 방법입니다.

## 주의점

- 요청 경로에서 Task를 막고 기다리지 마세요. `.Result`, `.Wait()`, `GetAwaiter().GetResult()`는 아무것도 하지 않는 풀 스레드를 붙잡고 있고, 돌아갈 스레드가 하나뿐인 컨텍스트에서는 그대로 데드락이 됩니다.
- 이벤트 핸들러가 아니라면 `async void`를 쓰지 마세요. 기다릴 것을 돌려주지 않으므로 언제 끝났는지도, 무엇을 던졌는지도 아무도 알 수 없고, 처리되지 않은 예외는 프로세스를 내립니다. 대신 `Task`를 반환하세요.
- 서로 무관한 호출은 먼저 시작해 놓고 `Task.WhenAll`로 함께 기다리세요. 하나씩 차례로 기다리면 이유 없이 대기 시간이 더해집니다.
- `CancellationToken`은 모든 계층을 지나 I/O 자체까지 넘기세요. 스택 위쪽에서 멈추는 토큰은 아무것도 취소하지 못합니다. 계속 돌아가는 작업을 기다리기만 그만둘 뿐입니다. ASP.NET Core에서 넘길 토큰은 `HttpContext.RequestAborted`입니다.
- `ConfigureAwait(false)`는 호출자가 어떤 컨텍스트에 있는지 알 수 없는 라이브러리 코드에 씁니다. 동기화 컨텍스트가 없는 ASP.NET Core에서는 아무 차이도 만들지 않습니다.
- 던져 놓고 잊는 방식은 예외와 수명을 함께 잃습니다. 아무도 붙잡고 있지 않은 Task는 호스트가 종료될 때 도중에 버려질 수 있고, 실패해도 아무도 보지 못합니다. 백그라운드 서비스나 내구성 있는 큐를 쓰세요.
- 아무것도 await하지 않는 async 메서드도 상태 머신은 그대로 만들고, 컴파일 시점에 경고를 냅니다. 무언가를 await하든지 동기 메서드로 바꾸든지 하세요.

## .NET에서는

아래 두 모양의 차이는 await의 순서뿐인데, 두 호출을 모두 하는 요청마다 300 ms의 값어치가 있습니다.

```csharp
// Sequential: 600 ms.
var a = await catalog.GetAsync(id, ct);
var b = await pricing.GetAsync(id, ct);

// Concurrent: 300 ms. Start both, then await both.
var aTask = catalog.GetAsync(id, ct);
var bTask = pricing.GetAsync(id, ct);
await Task.WhenAll(aTask, bTask);
var (item, price) = (aTask.Result, bTask.Result);   // safe here: both are already complete
```

`WhenAll` 뒤에서 `.Result`를 읽는 것은 안전합니다. 두 Task가 이미 완료되어 아무것도 막히지 않기 때문입니다. 완료되지 않은 Task에서 읽는 것이 장면 3단계가 다루는 실수입니다.

```csharp
// Wrong: blocks a pool thread and can deadlock in a single-threaded context.
var blocked = catalog.GetAsync(id, ct).Result;

// Wrong: nothing to await, exceptions are lost.
async void Fire() => await catalog.GetAsync(id, ct);
```

취소는 아래로 흐르고 예외는 위로 흐르는데, 둘 다 await를 통과합니다. 그래서 토큰이 실제로 기다리는 호출까지 닿아야 하고, 호출자 쪽의 평범한 `catch` 하나면 돌아오는 것을 처리하기에 충분합니다.

```csharp
try
{
    var item = await catalog.GetAsync(id, http.RequestAborted);
}
catch (OperationCanceledException) { /* client went away */ }
catch (HttpRequestException ex)    { /* dependency failed */ }
```

`ValueTask`는 대개 동기적으로 완료되는 hot path에서, 측정한 뒤에만 꺼내 쓸 만합니다. 일반적으로 더 빠르라고 있는 것이 아니라 할당 하나를 피하려고 있는 것입니다. 또한 정확히 한 번만 await해야 하므로, 저장해 두는 값이 아니라 바로 소비하는 값으로 다루세요.
