---
title: "Cancellation Token"
summary: "cancellation token은 그만 기다리겠다는 결정이 작업 자체까지 닿는 통로입니다. 타임아웃이 호출자에게 보내는 통보에 그치지 않고 의존 대상도 보는 끊음이 되게 해 줍니다."
category: "복원력과 장애 대응"
scene: request-timeout
sceneStep: 4
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Deadline
    slug: deadline
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Background Job
    slug: background-job
  - label: Hedging
    slug: hedging
  - label: Retry
    slug: retry
references:
  - title: Cancellation in managed threads
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
  - title: HttpContext.RequestAborted
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpcontext.requestaborted
  - title: gRPC deadlines and cancellation
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
---

아래쪽 누구도 듣지 못하는 타임아웃은 일을 줄여 주지 않고 옮길 뿐입니다. 호출자는 기다리기를 멈추고 스레드를 놓아 준 뒤 오류를 돌려주지만, 의존 대상은 아무도 읽지 않을 쿼리와 요청과 응답을 계속 붙들고 있습니다. 부하가 걸린 상황에서 이것은 양쪽 모두 최악입니다. 호출자는 빠르게 실패하고 있고 의존 대상은 버려질 결과를 만드느라 여전히 전력으로 돌고 있으니, 애초에 타임아웃을 일으킨 원인이 회복할 틈을 얻지 못합니다. cancellation token은 그 틈을 메우는 통로이고, 첫 단계에서 받아 놓고 흘려버리지 않고 모든 단계로 내려보낼 때만 제구실을 합니다.

ASP.NET Core에서 출발점이 되는 토큰은 `HttpContext.RequestAborted`입니다. 클라이언트가 연결을 끊을 때도, 요청 타임아웃 정책이 발동할 때도 이 토큰이 취소됩니다. 핸들러가 `await`하는 모든 것이 이 토큰을 받아야 합니다. `FindAsync([id], ct)`, `GetFromJsonAsync(url, ct)`, `ReadAsync(buffer, ct)` 모두 그렇습니다. 어떤 단계에 요청 전체보다 더 좁은 상한이 필요하다면 답은 별도의 소스가 아니라 연결된 소스입니다. `CreateLinkedTokenSource(ct)`에 `CancelAfter(remaining)`를 붙이면 멈춰야 할 두 가지 이유가 모두 살아 있기 때문입니다. gRPC에서는 클라이언트의 deadline이 서버 쪽에 취소로 도착하므로, 서버가 토큰을 존중하는 것이 곧 클라이언트의 deadline을 반대편에서 의미 있게 만드는 일입니다.

이것을 장식이 아니라 실제로 만드는 습관이 두 가지 있습니다. 첫째, `CancellationToken` 타입의 매개변수는 무시할 것이 아니라 넘겨줄 것으로 대합니다. 토큰을 받아 놓고 쓰지 않는 `async` 메서드는 아예 받지 않는 메서드보다 나쁩니다. 겉보기에는 제대로 된 것처럼 보이기 때문입니다. 둘째, 취소되면 안 되는 작업은 의식적으로 가려 둡니다. 이미 결제를 커밋한 요청은 자기가 한 일을 끝까지 기록해야 하므로, 토큰은 커밋 이전 호출에 붙이고 그것을 기록하는 호출에는 붙이지 않습니다. 요청보다 오래 살아야 하는 긴 작업은 요청의 토큰을 빌리는 대신 자기 토큰을 가진 백그라운드 작업으로 옮깁니다.
