---
title: "IHostedService"
summary: "IHostedService는 오래 도는 일을 호스트의 수명에 묶는 계약입니다. 호스트가 뜰 때 StartAsync를, 내려갈 때 StopAsync를 부르고, 우아한 종료라는 말의 전부는 서비스가 건네받은 토큰을 어떻게 다루느냐입니다."
category: "예약 작업과 워크플로"
scene: background-service
sceneStep: 2
related:
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Cancellation Token
    slug: cancellation-token
  - label: Work Queue
    slug: work-queue
  - label: Background Job
    slug: background-job
  - label: Readiness Probe
    slug: readiness-probe
  - label: Rolling Update
    slug: rolling-update
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
---

장면의 2단계는 네 개의 단어가 달린 램프이고, 재미있는 것은 세 번째입니다. `start`는 호스트가 서비스를 띄우는 순간이고, `running`은 루프가 큐에서 작업을 집는 상태이고, `stopped`는 프로세스가 사라진 상태입니다. `stopping`은 그 사이의 상태인데, 종료가 사건이 아니라 요청이기 때문에 존재합니다. 서비스는 통보를 받았고, 새 작업은 더 이상 집지 않고, 손에는 아직 작업 하나가 남아 있습니다. 그 작업이 완료 띠에 내려앉기 전까지 램프는 `stopped`에 닿지 않는데, 그것이 종료와 강제 종료의 차이 전부입니다.

`IHostedService`는 메서드 두 개짜리 인터페이스입니다. 애플리케이션이 뜰 때 호스트가 등록된 모든 서비스의 `StartAsync`를 등록 순서대로 부르고, 하나를 기다린 뒤에 다음으로 넘어갑니다. 종료할 때는 이미 시간을 세고 있는 토큰과 함께 역순으로 `StopAsync`를 부릅니다. 긴 작업이 `StartAsync`에 들어가면 안 되는 이유가 그 순서입니다. 호스트가 거기서 막혀 있고, 시작에 40초 걸리는 애플리케이션은 컨테이너 플랫폼 눈에는 시작에 실패한 애플리케이션처럼 보입니다. 루프를 시작하고 반환한 다음, 호스트가 다 뜨고 나서 일하게 둡니다.

`BackgroundService`는 거의 모든 경우에 인터페이스를 직접 구현하는 대신 쓰면 되는 기반 클래스입니다. `StartAsync`를 여러분의 `ExecuteAsync` 호출로 구현하고 첫 미완료 await 이후로는 기다리지 않는데, 직접 써야 했을 "루프를 시작하고 반환한다"가 정확히 그 동작입니다. `StopAsync`는 건네줬던 토큰을 취소하고 여러분의 작업이 끝나기를 기다리는 것으로 구현하며, 그 기다림은 기본값이 30초인 `HostOptions.ShutdownTimeout`으로 제한됩니다. 그래서 토큰은 참고 사항이 아닙니다. 호스트가 부탁하는 수단이 토큰이고, 여러분의 `Task`가 완료되는 것이 그 대답입니다.

그러니 매개변수 하나가 계약 전체를 짊어집니다. `stoppingToken`은 루프 안의 모든 await에 닿아야 합니다. 수신, HTTP 호출, 데이터베이스 호출, 지연까지 전부입니다. 반복 시작 지점에서 `IsCancellationRequested`만 확인하는 루프는 종료가 왔을 때 여전히 30초짜리 폴링 안에 앉아 있게 됩니다. 작업 도중에 취소가 도착하면, 보통 정직한 선택은 `OperationCanceledException`을 삼키지 않고 위로 올려보내는 것입니다. 작업은 끝나지 않았고, 메시지는 확인되지 않았고, 큐가 다른 쪽에 그 작업을 건넬 것이기 때문입니다. 그것을 삼키고 성공했다고 보고하는 것이 바로 일이 사라지는 방식입니다.

계약의 나머지 절반은 서비스가 넘어졌을 때 호스트가 무엇을 하느냐입니다. `ExecuteAsync`가 예외를 던지면 작업이 실패 상태가 되고, .NET 6부터 기본값인 `BackgroundServiceExceptionBehavior.StopHost`가 애플리케이션을 함께 내립니다. 시끄럽지만 대체로 옳습니다. 일하지 않는 워커가 헬스 체크를 통과해서는 안 되기 때문입니다. 다른 선택지인 `Ignore`는 예전 동작이고 더 위험합니다. 등록은 되어 있는데 조용히 더는 돌지 않는 서비스가 남고, 첫 예외 이후로는 로그에 아무것도 없으며, 모든 프로브는 여전히 초록색입니다. 실패가 무슨 뜻인지 판단할 수 있는 자리에서는 루프 안에서 잡고, 다룰 수 없는 예외는 빠져나가게 둡니다.

서비스가 싱글턴이라는 사실에서 두 가지가 더 따라옵니다. 스코프 의존성은 생성자에 주입할 수 없습니다. 생성 시점에는 스코프가 없고, 어쩌다 하나를 받아도 그 컨텍스트가 프로세스만큼 오래 살기 때문입니다. 대신 `IServiceScopeFactory`로 반복마다 스코프를 만듭니다. 그리고 `IHostApplicationLifetime`은 종료에 반응만 하는 대신 종료에 대해 말할 수 있는 통로입니다. `ApplicationStopping`은 토큰이 취소되기 전에 발생하고, `StopApplication()`은 더 계속할 수 없다고 판단한 워커가 예외를 던지고 운을 바라는 대신 호스트에게 깨끗하게 내려가 달라고 요청하는 방법입니다.
