---
title: "Background Job"
summary: "Background Job은 그것을 시작시킨 요청 바깥에서 도는 작업입니다. 그래서 작업이 끝나기 전에 응답이 먼저 돌아가고, 호출한 쪽은 접수증을 받은 뒤 결과를 따로 확인합니다."
category: "애플리케이션 아키텍처"
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Background Service
    slug: background-service
  - label: Worker Service
    slug: worker-service
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0
  - title: Generic Host lifetime and shutdown
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

Background Job은 앞부분만 처리한 요청의 나머지 절반입니다. 엔드포인트는 무엇을 요청받았는지 기록하고 식별자를 돌려준 뒤 끝납니다. 작업 자체는 그다음에 시작되는데, 엔드포인트가 큐에 남긴 메시지가 방아쇠가 되기도 하고 스케줄이 방아쇠가 되기도 합니다. 그동안 사용자는 연결을 붙잡고 기다리지 않습니다. 30초가 걸리는 일을 기능으로 내놓을 수 있는 이유가 여기에 있습니다.

.NET에서는 이 작업이 `BackgroundService` 안에서 돕니다. 오래 사는 `IHostedService`를 위한 기반 클래스입니다. 웹 애플리케이션에 그대로 등록하는 것이 가장 작은 한 걸음이고, 가볍고 잃어도 되는 작업이라면 그 선택이 맞습니다. 다만 그렇게 하면 작업은 사이트와 모든 것을 공유합니다. 프로세스, 메모리, 배포, 스케일링 규칙까지 전부 같아집니다. Worker Service 프로젝트는 같은 클래스를 자기 호스트 안에 두고, 따로 배포하며, 요청 수가 아니라 큐 길이를 보고 늘립니다. 그렇게 갈라놓는 것이 이 패턴의 요점이고, 작업이 요청과 CPU를 두고 다툴 만큼 무거워지는 순간 옮길 값어치가 있습니다.

작업은 요청보다 오래 살기 때문에, 요청이 가지고 있던 것을 빌려 쓸 수 없습니다. 스코프 서비스를 생성자에서 붙잡아 두지 말고 작업마다 새 DI 스코프를 만들어 쓰고, `HttpContext`는 절대 들고 있지 않습니다. 호스트가 넘겨주는 `CancellationToken`을 지켜서 종료 시 다시 이어받을 수 있는 지점에서 멈추게 하되, 그래도 작업 도중에 멈출 수 있다고 보고 설계합니다. 메시지는 다시 돌아오므로 핸들러는 여러 번 실행돼도 안전해야 합니다. 즉 반복해도 결과가 같은 호출(idempotent)이어야 합니다. 그리고 클라이언트에게 결말을 알려 줄 길은 여전히 필요합니다. 상태 엔드포인트, 웹훅, 알림 중 하나면 되는데, `202 Accepted`가 말한 것은 처음부터 작업을 접수했다는 것뿐이기 때문입니다.
