---
title: "Worker Service"
summary: "워커 서비스는 같은 백그라운드 루프를 자기 프로세스로 옮긴 것입니다. 자기 일정으로 배포되고, 웹 트래픽이 아니라 큐 깊이로 확장되며, 원래 살던 앱이 재시작하는 동안에도 계속 돕니다."
category: "예약 작업과 워크플로"
scene: background-service
sceneStep: 3
related:
  - label: Background Service
    slug: background-service
  - label: IHostedService
    slug: ihostedservice
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Poison Message
    slug: poison-message
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

장면의 3단계는 루프 자체는 거의 바꾸지 않고, 루프가 무엇에 붙어 있는지를 전부 바꿉니다. `service` 캡슐이 자기만의 프로세스 경계를 두르고, 그 순간부터 이 단계의 두 재시작이 다르게 읽힙니다. 앱이 어두워져도 루프는 계속 작업을 집고, 이번에는 루프가 사라지자 큐가 그저 깊어지다가 루프가 돌아옵니다. 둘 다 누가 추가한 기능이 아닙니다. 수명이 하나가 아니라 둘이라는 사실이 그렇게 보이는 것입니다.

코드에서 이 이동은 작습니다. `dotnet new worker`는 `WebApplication` 대신 `Host`를 주고, 같은 `BackgroundService` 하위 클래스를 주고, HTTP 파이프라인은 아예 주지 않습니다. 호스팅 모델이 웹 앱에 주던 것들, 즉 구성, 로깅, 의존성 주입, 옵션, 프로세스 자체의 상태는 그대로 있습니다. 원래 밑에 있던 것이 제네릭 호스트였고 웹 쪽이 그 위에 얹힌 부분이었기 때문입니다. 루프가 이미 API 안에 호스티드 서비스로 살고 있었다면, 옮기는 일은 보통 클래스 하나와 등록 한 줄을 새 프로젝트로 복사하고 예전 쪽에서 지우는 정도입니다.

얻는 것은 원래 하나로 붙어 있던 세 가지의 분리입니다. 배포. 워커는 워커가 바뀔 때 나가고, 리포트 생성기를 고쳤다고 해서 고객에게 응답하는 계층을 순차 재시작할 이유가 없어집니다. 확장. 웹 복제본은 초당 요청 수를 따라가고 워커 복제본은 큐 깊이를 따라가는데, 둘은 서로 관계없는 숫자입니다. 한쪽을 다른 쪽 신호로 돌리면 트래픽이 몰릴 때 놀고 있는 워커가 생기거나, 아무도 용량을 늘려 주지 않는 밀린 작업이 쌓입니다. 실패. 메모리를 많이 먹어 프로세스를 재활용시키는 작업이 이제는 아무도 기다리지 않는 프로세스를 재활용시키고, API의 요청 파이프라인을 같이 끌고 내려가지 않습니다.

대가는 워커가 이제 분산 구성 요소가 되었다는 점이고, 거기서 두 가지가 따라옵니다. 큐가 진짜여야 합니다. 메모리 안의 `Channel<T>`이 아니라 브로커나 테이블이어야 하는데, 생산자와 소비자가 더 이상 같은 프로세스에 있지 않아서 메모리 채널을 둘 공유 공간 자체가 없기 때문입니다. 그리고 복제본이 하나를 넘어서면, 무언가 막지 않는 한 둘이 같은 항목에 손을 뻗습니다. 브로커가 주는 메시지 단위 잠금, 직접 잡고 갱신하는 리스, 아니면 복제본마다 키 공간의 한 조각을 소유하는 파티션 방식이 그 무언가입니다. 이것이 장면의 4단계이고, 워커를 늘리는 일이 복제본 수를 적는 일과 다른 이유입니다.

운영 쪽에서 일부러 정해 둘 값이 둘 있습니다. 종료. 컨테이너 플랫폼은 SIGTERM을 보내고 기다리므로, `HostOptions.ShutdownTimeout`은 플랫폼의 유예 시간보다 짧아야 합니다. 그렇지 않으면 프로세스는 아직 작업을 마치는 중이라고 믿는 동안 죽습니다. 상태 확인. HTTP 엔드포인트가 없는 워커에는 프로브가 부를 대상이 없으니, 최소한의 상태 엔드포인트를 두거나 플랫폼이 읽을 수 있는 파일이나 지표를 건드려 살아 있음을 알립니다. 루프가 조용히 멈춘 워커는 할 일이 없는 워커와 똑같이 보이는데, 그 둘을 구분할 수 있는 편이 좋습니다.

워커가 알맞은 모양이 아니게 되는 지점은, 일을 소비하는 것을 넘어 조율해야 할 때입니다. 갈라졌다가 다시 모이는 흐름, 중간에 죽어도 이어서 진행해야 하는 단계, 가운데 끼는 사람의 승인, 뒤 단계가 실패했을 때의 보상 처리. 이런 것들은 실행마다 지속되는 상태와 그것을 소유하는 무언가를 원합니다. 워커 서비스는 루프와 큐이고 그것만으로도 많은 일을 하지만, 워크플로 엔진은 아닙니다. `ExecuteAsync` 안에 그것을 짓기 시작하면, 백 줄짜리 소비자가 주인 없는 오케스트레이터로 자랍니다.
