---
title: "Asynchronous I/O"
summary: "비동기 I/O는 운영체제가 지금 접수하고 나중에 결과를 알려 주는 읽기와 쓰기입니다. 요청은 장치나 네트워크 스택으로 넘어가고, 호출한 스레드는 풀려나며, 완료는 이벤트로 도착합니다. 그래서 아무도 앉아서 기다릴 필요가 없습니다."
category: "Pool과 리소스 관리"
scene: async-await
sceneStep: 1
related:
  - label: Async/Await
    slug: async-await
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Cancellation Token
    slug: cancellation-token
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "Asynchronous file I/O"
    url: https://learn.microsoft.com/en-us/dotnet/standard/io/asynchronous-file-i-o
  - title: "I/O completion ports"
    url: https://learn.microsoft.com/en-us/windows/win32/fileio/i-o-completion-ports
  - title: "The managed thread pool"
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

장면의 1단계는 언어 쪽에서 본 이 이야기 전부를 보여 줍니다. I/O 막대가 차오르는 동안 스레드 레인은 꺼져 있습니다. 이 페이지는 애초에 레인이 꺼질 수 있는 이유를 다루는데, 그것은 C#이 아니라 운영체제의 성질입니다.

동기 읽기는 커널에 데이터를 요청하고 데이터가 생길 때까지 돌아오지 않습니다. 호출한 스레드는 기다리는 내내 커널에 붙잡혀 있고, 디스크나 네트워크가 걸리는 시간만큼 스택 1 MB와 자기가 나온 풀의 자리 하나를 계속 씁니다. 비동기 읽기는 같은 질문을 다르게 합니다. 커널에 버퍼 하나와 나중에 알려 줄 방법을 건네고 곧바로 돌아옵니다. 사용자 공간에서는 아무도 기다리지 않습니다. 장치 컨트롤러나 네트워크 스택이 일을 하고, 바이트가 준비되면 커널이 완료를 큐에 넣습니다.

이름을 알아 둘 만한 부분이 바로 그 큐입니다. Windows에서는 I/O 완료 포트라고 부르고, .NET 스레드 풀은 그것을 비우는 데 전념하는 작은 스레드 집합을 둡니다. Linux에서는 런타임이 소켓을 위해 `epoll`을 비웁니다. 어느 쪽이든 모양은 같습니다. 아주 많은 수의 진행 중인 작업을 작은 스레드 풀 하나가 감당하는데, 진행 중이기만 한 작업에는 스레드가 필요하지 않기 때문입니다. 클라이언트가 말을 걸기를 기다리는 소켓 1만 개는 커널 구조체 1만 개를 쓸 뿐 스레드는 하나도 쓰지 않습니다. 동기 읽기에서 막힌 스레드 1만 개는 스택 1만 개와, 그 사이를 오가는 데 시간을 쓰는 스케줄러를 부릅니다.

`await`가 딛고 선 것이 이것입니다. .NET 메서드가 `FileStream.ReadAsync`나 `HttpClient.SendAsync`를 await하면, 런타임은 밑에 깔린 작업을 비동기로 발행하고, 메서드의 나머지를 완료가 도착했을 때 실행할 것으로 등록한 뒤, 스레드를 풀에 돌려줍니다. 완료는 풀 스레드 위로 돌아오고, 그 스레드가 메서드를 멈춘 자리에서 이어받습니다. 기다린 것은 없고, 예약된 것이 있을 뿐입니다.

여기서 따라 나오는 결론은 async가 끝까지 진짜여야만 진짜라는 것입니다. 이름에 `Async`가 붙은 메서드를 제공하면서 속으로는 `Task.Run` 안에서 막히는 호출을 하는 API는 대기를 없앤 것이 아니라 다른 스레드로 옮긴 것이고, 어느 쪽이든 대가는 풀이 치릅니다. .NET에서는 그 차이가 대개 눈에 보입니다. Windows에서는 정말로 비동기인 파일 핸들을 알맞은 옵션으로 열어야 하고, overlapped(중첩) 작업을 지원하지 않는 드라이버나 공급자는 메서드 이름이 무엇이든 막히는 호출로 되돌아갑니다. Linux에는 요청할 비동기 파일 I/O 자체가 없어서, 어떤 옵션을 넘기든 파일 읽기는 풀에 예약된 동기 호출이 됩니다. 소켓은 두 플랫폼 모두에서 진짜 비동기입니다.

취소와 타임아웃이 의미를 갖게 하는 것도 같은 구조입니다. 작업이 막혀 있는 스레드가 아니라 커널이 들고 있는 무언가이기 때문에 취소할 수 있습니다. 요청을 거두어들이면 완료가 취소 상태로 도착하고 리소스가 돌아옵니다. 막힌 스레드에는 이에 해당하는 것이 없고, 자체 타임아웃이 없는 동기 호출을 한계 안에 가두기가 그토록 어려운 이유가 그것입니다.
