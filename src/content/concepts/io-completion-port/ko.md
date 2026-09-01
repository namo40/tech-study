---
title: "I/O Completion Port"
summary: "완료 포트를 쓰면 기다림에 스레드가 들지 않습니다. OS가 IO를 진행하고, 끝나면 완료 패킷을 포트에 내려놓고, 그때 풀 스레드 하나가 뒷부분을 집어 듭니다. 그래서 적은 수의 스레드로 수천 건의 진행 중인 작업을 감당합니다. 포트가 풀어 준 것을 코드가 다시 붙잡지만 않는다면 그렇습니다."
category: "Pool과 자원 관리"
scene: io-completion-port
steps:
  - title: "기다림이 스레드를 먹습니다"
    text: "고스트는 블로킹 IO를 보여 줍니다. 요청 하나가 디스크의 답이 올 때까지 스레드 하나를 세워 두고, 넷이면 네 개가 전부 서고, 풀은 아무것도 하지 않는 일꾼으로 가득합니다. 노는 근육 뒤로 큐가 자랍니다. 스레드는 코드를 돌리라고 있는 것입니다. 그저 기다리는 순간, 주전자를 지켜보라고 일꾼에게 삯을 주는 셈입니다."
  - title: "완료는 포트에 도착하고, 스레드는 그때에야 옵니다"
    text: "IO를 시작하고, 등록하고, 스레드는 곧바로 돌려보냅니다. OS는 스레드 없이 작업을 진행하고, 끝나면 완료 패킷이 포트에 내려앉고, 그때 놀고 있던 풀 스레드가 뒷부분을 집어 듭니다. 시작과 끝 사이에는 정말로 돌릴 것이 없습니다. 그래서 아무것도 돌지 않습니다."
  - title: "진행 중인 IO 수와 스레드 수는 다른 숫자입니다"
    text: "작업 여섯이 한꺼번에 돌고 스레드 둘이 전부를 감당합니다. 시작은 거의 공짜이고, 기다림은 완전히 공짜이고, 끝난 일은 스레드가 준비될 때까지 패킷으로 줄을 섭니다. 프로세스 하나가 스레드 천 개 없이 열린 소켓 수천을 쥐는 방법이 이것입니다. 포트는 두 숫자를 서로 독립으로 만들어 주는 만남의 자리입니다."
  - title: "포트가 준 것을 코드가 도로 가져갈 수 있습니다"
    text: "태스크를 기다리느라 풀 스레드를 세워 두면 고스트를 한 층 위에 다시 지은 것이고, 모든 작업을 한꺼번에 시작하면 패킷이 파도로 쌓입니다. 포트가 푸는 것은 기다림이지 규율이 아닙니다. 이어지는 코드는 막히지 않게 두고, 시작 수는 묶으세요. 앞에 세운 작은 문이 자유로워진 스레드를 계속 자유롭게 둡니다."
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Worker Thread
    slug: worker-thread
  - label: SemaphoreSlim
    slug: semaphoreslim
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
  - title: Async in depth
    url: https://learn.microsoft.com/en-us/dotnet/standard/async-in-depth
  - title: I/O Completion Ports
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
---

## 언제 쓰나

- 이것은 골라 쓰는 도구가 아니라 이미 딛고 서 있는 바닥입니다. 윈도우에서 .NET의 진짜 비동기 IO에 붙는 모든 `await`는 완료 포트 위를 지나갑니다. 소켓, 비동기로 연 파일, 명명 파이프가 그렇습니다. 리눅스와 macOS에는 같은 물건이 아니라 형제뻘이 있습니다(런타임이 관리하는 이벤트 루프 아래의 epoll과 kqueue). 세 곳 모두에서 이야기의 모양은 같습니다. 기다림은 커널의 몫이지 스레드의 몫이 아닙니다.
- 비동기 서버가 왜 잘 늘어나는지 설명해야 할 때 읽으면 좋습니다. 스레드 수는 코어를 따라가고 진행 중인 IO 수는 수요를 따라갑니다. 풀 바깥의 무언가가 기다림을 대신 쥐고 있기 때문에 이 둘이 서로 다른 숫자가 됩니다. 이 점이 이해되면 용량 이야기는 대체로 짧아집니다.
- IO 때문에 느린 상황에서 "스레드를 늘리자"는 처방을 받아들이기 전에 읽으면 좋습니다. 스레드가 일하지 않고 기다리고 있다면 풀을 키워 봐야 기다림만 늘어납니다. 해법은 스레드 위에서 기다리는 일 자체를 그만두는 것입니다.
- 처리량이 평평해진 상태에서 스택 추적에 풀 스레드가 `WaitOne`이나 `Monitor.Wait`, 태스크의 `.Result`에 앉아 있다면 이 문서가 필요합니다. 그 그림의 원인은 하나이고, 4단계가 그것을 그립니다.
- API가 아니라 머릿속 모형으로 쓰세요. `CreateIoCompletionPort`를 직접 부를 일은 거의 없습니다. `await`를 쓰면 런타임이 연결을 대신 해 줍니다. 이 모형이 주는 것은 내 코드가 무엇을 쓰고 있는지 아는 감각이고, 그 감각이 기다리는 동안 정말로 값이 들지 않는 비동기 메서드와 그렇게 보이기만 하는 메서드를 갈라 줍니다.

## 주의점

- 비동기 위에 동기로 기다리면 포트가 풀어 준 바로 그 스레드가 다시 붙잡힙니다. 아직 끝나지 않은 태스크에 `.Result`, `.Wait()`, `GetAwaiter().GetResult()`를 쓰면 작업이 끝날 때까지 풀 스레드 하나가 묶입니다. 고스트를 한 층 위에 다시 지은 것입니다. 부하가 걸릴수록 나빠집니다. 나를 풀어 줄 이어지는 코드에도 풀 스레드가 필요한데, 막혀 있는 호출자마다 그 스레드를 하나씩 빼앗아 갔기 때문입니다.
- 가짜 비동기는 막힘을 옮길 뿐 없애지 못합니다. 막히는 호출을 `Task.Run(() => stream.Read(...))`으로 감싸도 기다리는 내내 스레드 하나가 묶이는 것은 그대로이고, 바뀐 것은 어느 스레드냐뿐입니다. 진짜 비동기 형태가 없는 API라면, 그것을 감싸는 일은 변환이 아니라 값을 치르는 스케줄링 결정입니다.
- 한도 없는 펼침은 아래쪽 전부를 물에 잠기게 합니다. 항목 만 개에 `items.Select(x => DoAsync(x))`를 걸고 `WhenAll`로 묶으면 시작이 만 번 등록되고, 원격 서비스와 패킷 큐가 동시에 그것을 느낍니다. 포트는 얼마든지 받아 주지만 소켓 풀과 데이터베이스와 꼬리 지연 시간은 그렇지 않습니다. 시작 수를 묶으세요.
- 이어지는 코드 안에서 막히면 뒤에 선 패킷이 전부 늦어집니다. `await` 없는 구간을 가로지르는 락, 긴 계산, 동기 로그 쓰기, 무엇이든 마찬가지입니다. 그것은 다른 완료들이 줄을 서 있는 풀 스레드 위에서 돌고 있습니다. 이어지는 코드는 짧고 막히지 않아야 하고, 무거운 CPU 작업은 완료 처리를 굶기지 못하는 곳으로 옮겨야 합니다.
- 이어지는 코드는 작업을 시작한 그 스레드에서 돌지 않습니다. 그때 비어 있는 풀 스레드에서 돕니다. 동기화 컨텍스트가 특정한 곳으로 되돌려 놓는 경우만 예외입니다. `await`를 사이에 두고 스레드가 같다고 가정하는 코드, 예를 들어 스레드 로컬 상태나 앞에서 잡고 뒤에서 푸는 락은 잘 도는 것처럼 보일 때에도 틀린 코드입니다.
- 스레드 주입이 늦는 것은 증상이지 병이 아닙니다. 풀이 굶으면 스레드를 천천히, 신중하게 보태기 때문에 큐가 자라는 동안 처리량이 몇 초에 걸쳐 기어서 돌아옵니다. `ThreadPool.SetMinThreads`를 올리면 증상은 잠시 가려지지만 원인이 된 막히는 호출은 그대로 남아 있습니다. 그쪽 이야기는 Thread Pool Starvation 문서가 맡습니다.

## .NET에서는

끝에서 끝까지 비동기 API를 쓰면 이 기계 장치는 눈에 보이지 않습니다. 일부러 챙겨서 쓸 값어치가 있는 것은 펼침 앞에 세우는 문, 그리고 풀 스레드를 절대 막지 않겠다는 결정입니다.

```csharp
// 진짜 비동기 IO. await 지점에서 스레드를 돌려주고, 이어지는 코드는
// 패킷이 내려앉는 시점에 비어 있는 풀 스레드에서 다시 시작합니다.
await using var stream = new FileStream(
    path, FileMode.Open, FileAccess.Read, FileShare.Read,
    bufferSize: 4096, useAsync: true);          // useAsync: true 가 포트를 씁니다
var buffer = new byte[4096];
int read = await stream.ReadAsync(buffer);

// 시작을 묶는 문. 항목 만 개가 시작 만 번이 되지 않게 합니다.
var gate = new SemaphoreSlim(20);
await Task.WhenAll(items.Select(async item =>
{
    await gate.WaitAsync();                     // 스레드를 쥐지 않고 기다립니다
    try { await ProcessAsync(item); }
    finally { gate.Release(); }
}));

// 같은 한도를 손으로 짜는 대신 프레임워크에 맡긴 형태입니다.
await Parallel.ForEachAsync(
    items,
    new ParallelOptions { MaxDegreeOfParallelism = 20 },
    async (item, token) => await ProcessAsync(item, token));
```

차이를 눈에 보이게 만드는 것이 두 가지 있습니다. `useAsync: true` 없이 연 `FileStream`은 포트를 쓰지 않습니다. 그래서 그 위의 `ReadAsync`는 비동기 서명을 입은 채 풀 스레드에서 도는 블로킹 읽기입니다. 반면 소켓과 `HttpClient`는 제대로 비동기이고, 실제 규모에서 둘이 그토록 다르게 움직이는 이유가 여기에 있습니다. 그리고 `SemaphoreSlim.WaitAsync`가 비동기 형태인 데에는 이유가 있습니다. 문 앞에서 기다리는 동안에도 스레드가 들지 않아야 하고, 그렇지 않으면 그 문이 바로 굶주림의 원인이 됩니다.

감으로 보지 말고 숫자로 보세요. `ThreadPool.ThreadCount`가 오르는 동안 `ThreadPool.PendingWorkItemCount`가 높게 머문다면 굶주림이 진행 중이고, `System.Runtime` 이벤트 카운터가 디버거 없이도 둘 다 보여 줍니다. 기억할 만한 어림 규칙은 이것입니다. 풀 스레드가 기다리고 있다면 잘못된 것은 풀 크기가 아니라 코드입니다.
