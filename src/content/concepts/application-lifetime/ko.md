---
title: "Application Lifetime"
summary: "애플리케이션의 수명은 곧 컨테이너의 수명입니다. 시작할 때 한 번 지어지고, 작업 단위마다 스코프를 열고 닫으며, 종료할 때 아직 쥐고 있던 것을 만든 순서의 역순으로 놓습니다. 그래서 어디에서 만들어졌는지가 언제 죽는지를 정합니다."
category: ".NET 런타임과 호스팅"
scene: dependency-injection
sceneStep: 4
related:
  - label: Dependency Injection
    slug: dependency-injection
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Background Service
    slug: background-service
  - label: IHostedService
    slug: ihostedservice
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: DbContext
    slug: dbcontext
references:
  - title: .NET Generic Host
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/generic-host
  - title: Dependency injection in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview
  - title: Dependency injection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection
---

컨테이너는 어쩌다 한동안 살아 있는 조회 표가 아닙니다. 시작과 중간과 끝을 가진 객체이고, 수명 관련 버그는 거의 전부 어떤 코드가 그 셋 중 어디에 있는지에 대한 이견입니다. 그 모양을 소유하는 것은 호스트입니다. 호스트가 컨테이너를 한 번 짓고, 그 안에서 애플리케이션을 돌리고, 나가는 길에 해제합니다. 그리고 코드가 해석해 쓰는 것은 전부 컨테이너 자신의 것이거나 컨테이너가 연 스코프에서 빌린 것입니다.

시작은 `Build`입니다. 그 호출 전까지 서비스 컬렉션은 바꿀 수 있는 설명의 목록이고, 그 뒤로 등록은 닫히며 무언가를 만드는 주체는 프로바이더뿐입니다. 그 순간은 시스템 전체에서 틀리기에 가장 값싼 자리이므로 엄격하게 만들어 둘 값어치가 있습니다. `ValidateOnBuild`는 모든 등록을 훑으며 만들게 될 그래프를 실제로 구성해 보므로, 빠진 의존이 한 시간 뒤 실패하는 요청이 아니라 시작 예외가 됩니다. `ValidateScopes`는 이 장면이 다루는 규칙을 더합니다. singleton은 scoped 서비스를 쥐고 있으면 안 된다는 규칙입니다. 둘 다 Development 환경에서만 기본으로 켜지므로, 지속적 통합이 환경을 Production으로 둔 채 돌고 있다면 지켜 준다고 믿었던 검사는 실제로는 돌지 않습니다.

중간은 스코프의 리듬입니다. 웹 애플리케이션에서는 프레임워크가 요청마다 하나를 열고 응답이 끝나면 해제하며, `AddScoped` 등록 하나는 그 리듬 한 박자마다 인스턴스 하나를 뜻합니다. 요청 밖에서는 리듬을 직접 정해야 하고, 단위는 그 애플리케이션에서 작업 하나가 무엇을 뜻하는지에 달려 있습니다. 큐에서 꺼낸 메시지 하나, 폴링 루프의 한 번, 야간 가져오기의 한 행 같은 것입니다. 이것을 건너뛰는 백그라운드 코드가 캡티브 의존이 들어오는 흔한 통로입니다. 호스티드 서비스는 singleton이고, 그것이 쥔 것은 프로세스가 사는 내내 쥐고 있게 되기 때문입니다. 단위마다 `IServiceScopeFactory`로 스코프를 열고, 그 안에서 해석하고, 끝에서 놓아 줍니다.

끝은 순서가 있는 절차이고, 그 순서는 임의가 아닙니다. 중지 신호가 오면 호스트는 먼저 `ApplicationStopping`을 올립니다. 새 일을 그만 받되 하던 일은 끝내게 두는 순간입니다. 그다음 호스티드 서비스들을 시작한 순서의 역순으로 멈추므로, 다른 것에 기대어 올라온 서비스는 언제나 그 기댄 대상보다 먼저 내려갑니다. 이어서 `ApplicationStopped`가 발생하고, 마지막으로 프로바이더 자신이 해제되면서 자기가 만든 해제 대상들을 만든 순서의 역순으로 놓습니다. 컨테이너는 가장 먼저 지어졌고 가장 나중에 놓입니다. 애플리케이션의 수명이 곧 컨테이너의 수명이라는 말의 뜻이 그것입니다.

끝을 장식이 아니라 정직하게 만드는 세부가 둘 있습니다. 첫째, 종료에는 한계가 있습니다. `HostOptions.ShutdownTimeout`이 호스트가 기다릴 시간을 제한하고, 그 창이 닫힐 때까지 돌고 있던 일은 도중에 버려집니다. 소비자가 한 묶음을 끝내는 데 이십 초가 필요하다면 타임아웃이 그렇게 말해야 하고, 중지 신호를 보내는 쪽도 그래야 합니다. 자기 일정대로 프로세스를 죽이는 오케스트레이터는 여러분의 설정을 읽지 않습니다. 둘째, 해제는 컨테이너가 소유한 것에만 닿습니다. 직접 만들어 이미 지어진 인스턴스로 등록에 건넨 것은 직접 해제해야 하고, 닫지 않은 스코프에서 해석한 것은 프로세스가 끝날 때까지 기다립니다.

수명 이벤트는 프로세스마다 정확히 한 번씩 일어나야 하는 일들의 자연스러운 자리이기도 합니다. 캐시 예열, 서비스 검색 등록, 시작 기록 남기기 같은 것은 `ApplicationStarted`에 둡니다. 서버가 아직 듣기도 전에 불릴 수 있는 생성자가 아닙니다. 배수, 등록 해제, 비우기는 `ApplicationStopping`에 두되, 그 일이 아직 살아 있는 컨테이너 안에서 돌 수 있을 만큼 이른 자리에 둡니다. 둘 중 하나를 반대편에 두면 같은 종류의 버그를 반대 방향에서 얻습니다. 아직 준비되지 않은 의존이거나, 이미 사라진 의존입니다.

지금 어느 단계에 있는지 아는 것이 기술의 대부분입니다. 요청 중에는 맞게 동작하고 시작 중에는 틀리게 동작하는 클래스는 대개 고장 난 것이 아닙니다. 스코프가 아니라 루트 프로바이더에서 해석되었을 뿐이고, 컨테이너는 시킨 대로 정확히 했습니다. 이 인스턴스를 무엇이 만들었고 무엇이 해제할지를 물으면, 얼마나 사는지에 대한 모든 질문의 답이 바로 나옵니다.
