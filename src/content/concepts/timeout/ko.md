---
title: "Timeout"
summary: "timeout은 호출자가 응답 기다리기를 그만두고 그 호출을 실패로 판정하는 시점입니다. 느린 의존 서비스와 영영 회복하지 못하는 호출자 사이를 막아 주는 것은 이것 하나뿐입니다."
category: "복원력과 장애 대응"
scene: request-timeout
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Deadline
    slug: deadline
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: p99
    slug: p99
  - label: Thread Pool Starvation
    slug: threadpool-starvation
references:
  - title: Build resilient HTTP apps with .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: Timeout resilience strategy
    url: https://www.pollydocs.org/strategies/timeout.html
---

timeout은 오류 처리기가 아닙니다. 응답이 아직 받을 가치가 있는 시간이 얼마까지인지를 미리 정해 둔 결정입니다. 이 구분이 중요한 이유는, timeout이 막는 장애가 느린 호출 그 자체가 아니라 그 뒤에 줄지어 선 모든 것이기 때문입니다. 의존 서비스를 기다리는 호출자는 스레드 하나를 잡고 있고 보통은 풀에서 빌린 연결을, 자주 소켓과 메모리 한 덩이까지 함께 잡고 있습니다. 그리고 의존 서비스가 2밀리초 만에 답하든 끝내 답하지 않든 그것들을 계속 붙잡고 있습니다. 상한이 없으면 멈춘 의존 서비스 하나가 스레드 풀 고갈과 연결 풀 고갈로 번지고, 그 자체는 아무 문제도 없던 서비스의 장애가 됩니다.

숫자를 고르는 일은 다들 미루는 부분이고, 크고 안전한 값을 고르고 싶어집니다. 크다고 안전하지는 않습니다. 평소 20밀리초에 답하는 의존 서비스에 10초 timeout을 두면 사실상 timeout이 없는 것과 같습니다. 그 값이 발동할 즈음이면 뒤에 있던 모든 것이 이미 밀려 있습니다. 쓸 만한 출발점은 정상 상태 의존 서비스의 p99에, 평범한 변동으로는 걸리지 않을 만큼의 여유를 더한 값입니다. 그다음에는 호출자가 실제로 감당할 수 있는 시간을 봅니다. 호출자의 사용자가 1초 넘게 기다려 주지 않는다면, 의존 서비스가 아무리 바라더라도 하위 호출에 2초를 줄 수는 없습니다.

가장 오래 살아남는 오해는 timeout을 완성된 답으로 여기는 것입니다. 절반짜리 답입니다. timeout은 호출자에게 그만 기다리라고 말할 뿐, 의존 서비스에게 그만 일하라고 말하지 않고 다음에 무엇을 할지도 말해 주지 않습니다. 나머지 절반은 실제로 작업까지 도달하는 취소, 그리고 그 실패를 어떻게 할지에 대한 결정입니다. 예산 안에서 재시도할지, 더 싼 대안으로 물러설지, 요청을 그대로 실패시킬지를 정해야 합니다. 그 결정이 없는 timeout은 느린 요청을 빠른 오류로 바꿔 놓기만 하며, 호출자가 들어오는 속도 그대로 그 일을 반복합니다.
