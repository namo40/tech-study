---
title: "Stress Test"
summary: "Stress Test는 처리량이 더 늘지 않는 지점을 넘어서까지 부하를 계속 올리며, 시스템이 언제가 아니라 어떻게 무너지는지를 확인하는 테스트입니다."
category: "테스트와 검증"
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Load Shedding
    slug: load-shedding
  - label: Bulkhead
    slug: bulkhead
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Rate Limiter
    slug: rate-limiter
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

Stress Test는 Load Test가 끝나는 지점에서 시작합니다. 무릎을 지나면 부하를 더 줘도 처리량은 늘지 않으므로, 더해진 부하는 전부 대기로 바뀝니다. 지연이 오르고, 클라이언트 timeout이 요청을 끊기 시작하며, 가장 먼저 포화된 리소스가 실패의 모양을 결정합니다. 목적은 더 큰 숫자를 찾는 것이 아니라, 실제 트래픽 이벤트가 보여 주기 전에 실패를 먼저 보는 것입니다.

봐야 할 것은 실패하는 방식입니다. 부하를 덜어내는 서비스는 살아남아 더 적은 비율의 요청을 제대로 처리합니다. 모든 요청을 큐에 쌓는 서비스는 결국 하나도 처리하지 못하는데, 맨 앞에 도달할 무렵이면 이미 전부 timeout이 났기 때문입니다. 길이를 제한한 큐, 동시성 제한, 짧은 연결 timeout이 붕괴를 성능 저하로 바꿔 줍니다. 우리 쪽 장치가 실제로 작동하는지 확인하는 방법이 Stress Test입니다.

그다음 부하를 걷어내고 회복을 지켜봅니다. p95가 정상으로 돌아오기까지 걸린 시간, 커넥션 풀과 스레드 풀이 스스로 비워지는지, 재시작이 필요한 것이 있었는지를 기록합니다. 장애가 실제로 평가받는 구간이 바로 그 시간이고, 새벽 3시에 배우는 것보다 일부러 재 보는 편이 훨씬 쌉니다.
