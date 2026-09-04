---
title: "SemaphoreSlim"
summary: "SemaphoreSlim은 비동기 세계의 동시성 문입니다. WaitAsync는 스레드를 쥐지 않고 기다리기 때문에, 한꺼번에 시작하는 작업 수를 묶어 파도를 줄로 바꾸면서도 방금 아낀 스레드를 도로 내주지 않습니다."
category: "Pool과 자원 관리"
scene: io-completion-port
sceneStep: 4
related:
  - label: I/O Completion Port
    slug: io-completion-port
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Asynchronous I/O
    slug: asynchronous-io
  - label: Async/Await
    slug: async-await
  - label: Worker Thread
    slug: worker-thread
  - label: HttpClient Connection Pool
    slug: httpclient-connection-pool
  - label: Head-of-Line Blocking
    slug: head-of-line-blocking
references:
  - title: SemaphoreSlim Class
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.semaphoreslim
  - title: Asynchronous programming scenarios
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/async-scenarios
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

세마포어는 출입증의 개수입니다. `new SemaphoreSlim(20)`은 스무 명까지 동시에 안에 있어도 된다는 뜻이고, 스물한 번째는 누군가 나갈 때까지 문 앞에서 기다립니다. 고전적인 `Semaphore`도 같은 생각을 담고 있고, 재미있는 부분은 고전 쪽에 없는 메서드 하나입니다. 바로 `WaitAsync`입니다. 문 앞에서 기다리는 것도 기다림이고, 줄을 서는 동안 그 문이 풀 스레드를 쥐고 있다면 문은 자기가 막으려던 바로 그 문제가 되어 버립니다. `WaitAsync`는 대신 태스크를 돌려주기 때문에, 문 앞에 선 호출자가 쓰는 것은 이어지는 코드 한 조각이지 스레드가 아닙니다. 비동기 작업 앞에 세울 문이 이것이고 `lock`이나 `Semaphore`가 아닌 이유가 여기에 있습니다.

애초에 문이 필요한 까닭은 완료 포트가 건네는 대로 다 받아 주기 때문입니다. 항목 만 개를 시작 만 번으로 바꾸는 것은 문법상 아무 문제가 없는 프로그램입니다. 시작은 거의 공짜이고 기다림은 정말로 공짜이며 런타임 안의 어떤 것도 밀어내지 않습니다. 밀어내는 쪽은 아래에 있는 전부입니다. 소켓이 정해진 수만큼만 있는 연결 풀, 일꾼이 정해진 수만큼만 있는 데이터베이스, 이제 곧 알게 될 요청 한도를 가진 원격 서비스, 그리고 완료 만 건이 파도로 내려앉게 된 패킷 큐가 그렇습니다. 시작 수를 묶으면 그 파도가 고른 줄이 됩니다. 여기서 고르는 숫자는 내 프로세스가 아니라 내 뒤에 있는 가장 느린 것에 대한 진술입니다.

씬의 4단계가 그리는 모양대로 쓰세요. 출입증을 받고, 일을 하고, `finally`에서 돌려줍니다. 이 `finally`는 장식이 아닙니다. 예외로 새어 나간 출입증은 프로세스가 살아 있는 내내 사라진 출입증이고, 스물에서 열아홉으로 열여덟으로 조용히 줄어드는 문은 나이를 먹을수록 느려지는 서비스와 똑같아 보입니다. 성공한 대기 한 번에 정확히 한 번만 돌려주고, 미리 짐작해서 돌려주지 마세요. 받은 경로가 아닌 다른 경로에서 돌려주는 것도 안 됩니다. 대기를 취소할 수 있다면 토큰을 `WaitAsync`에 넘겨서, 취소된 호출자가 쓰지도 않을 출입증을 가져가지 않게 합니다. 취소된 대기는 값을 돌려주는 대신 예외를 던지므로, 반환은 획득 옆이 아니라 획득 아래에 놓여야 합니다.

두 가지 습관이 이 문을 정직하게 지켜 줍니다. 프레임워크가 이미 가진 한도가 있다면 그쪽을 먼저 쓰세요. `MaxDegreeOfParallelism`을 준 `Parallel.ForEachAsync`, 용량을 정한 채널, `HttpClient` 자신의 연결 한도가 그렇습니다. 라이브러리가 강제하는 한도는 새어 나갈 수 없습니다. 그리고 문은 자기가 지키는 자원 가까이에 두고, 애플리케이션 전체에 하나가 아니라 의존 대상마다 하나씩 둡니다. 전역에 하나만 두면 느린 보고서 하나가 로그인 화면까지 조이게 되는데, 그것이 바로 Bulkhead 패턴이 막으려는 고장 방식입니다. `SemaphoreSlim(1)`은 따로 이름을 붙여 둘 값어치가 있습니다. 이것은 비동기 상호 배제이고, 진짜 `lock`은 `await`를 가로질러 잡고 있을 수 없기 때문에 한 번에 한 명만 쓰게 해야 하는 경우에 쓸모가 있습니다. 재진입을 허용하지 않으므로 같은 흐름이 두 번 잡으면 자기 자신을 영원히 기다립니다.
