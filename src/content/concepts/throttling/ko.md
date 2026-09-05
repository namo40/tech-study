---
title: "Throttling"
summary: "서비스를 지키려고 속도를 줄이고 기능을 줄이는 방법입니다. 한도는 이미 무너진 뒤에 나타나는 숫자가 아니라, 시스템이 실제로 해낼 수 있는 양에서 고른 설계값입니다."
category: "복원력과 장애 대응"
scene: fallback
sceneStep: 3
related:
  - label: Fallback
    slug: fallback
  - label: Load Shedding
    slug: load-shedding
  - label: Rate Limiter
    slug: rate-limiter
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
---

3단계에서 `throttle` 칩은 `shed`보다 반 초 먼저 켜지고, 그 순서가 핵심입니다. 스로틀링은 서비스가 초당 얼마만큼의 일감을 받을지 정하는 결정이고, 부하 셰딩(load shedding)은 그 양을 넘은 것에 일어나는 일입니다. 하나는 정책이고 다른 하나는 그 정책의 결과입니다. 앞의 것 없이 뒤의 것만 가진 서비스는 아무도 고르지 않은 숫자에 따라 요청을 거절하고 있는 셈입니다.

그 숫자가 설계의 전부입니다. 스로틀 한도는 트래픽이 얼마나 올지 짐작한 값이 아니라, 지연 목표를 지키면서 시스템이 해낼 수 있는 양을 말하는 값이고, 정직하게 얻는 방법은 재 보는 것뿐입니다. 응답 시간 곡선이 꺾일 때까지 부하 테스트를 돌리고, 처리량이 가장 높은 지점이 아니라 곡선이 꺾이는 지점의 속도를 적어 두고, 한도를 그보다 조금 아래로 잡습니다. 이 구분이 중요한 이유는, 꺾인 지점을 지난 서비스도 한동안은 처리량이 계속 오르는 것처럼 보이기 때문입니다. 그래서 처리량 그래프에서 고른 용량은 대개 아무것도 빠르지 않은 지점의 용량이 됩니다.

스로틀링에는 덜 드러나는 두 번째 형태가 있고, 장면은 둘 다 보여 줍니다. 초당 비용을 줄이는 한 가지 방법은 속도를 줄이는 것이고, 다른 하나는 요청 하나가 하는 일을 줄이는 것입니다. 부하가 걸린 상태에서 추천 서비스가 죽었다는 것이 이미 알려져 있으면, 서비스는 결과를 뻔히 아는 호출에 연결과 스레드와 타임아웃을 쓰는 대신 그 호출 자체를 하지 않습니다. 부가 정보를 끄고, 이미지 해상도를 낮추고, 결과를 백 개 대신 스무 개만 돌려주고, 값비싼 개인화 쿼리를 건너뛰는 것 모두가 스로틀링입니다. 일감의 개수가 아니라 일감 하나의 비용을 바꾸기 때문입니다. 대개 장비를 늘리는 것보다 싸고, 몇 분이 아니라 몇 초 만에 쓸 수 있습니다.

한도가 어디에 있느냐가 무엇을 지킬 수 있는지를 정합니다. 클라이언트 쪽 한도는 의존 대상은 지켜 주지만 나를 지켜 주지는 않습니다. 그것을 무시하는 클라이언트는 어차피 도착하기 때문입니다. 게이트웨이의 한도는 전체를 지켜 주고 배포 없이 바꿀 수 있지만, 개별 인스턴스가 얼마나 바쁜지는 모릅니다. 프로세스 안의 한도는 그것을 정확히 알고, 누군가 서비스를 직접 호출할 때도 살아남는 유일한 한도입니다. 자기 성공을 견뎌 내는 시스템은 대개 셋을 다 가지고 있고, 바깥쪽이 먼저 걸리고 안쪽이 최후의 방벽이 되도록 크기를 잡아 둡니다.

스로틀링의 나머지 절반은 클라이언트에게 알리는 일입니다. 말없이 거절하는 한도는 장애와 구분되지 않습니다. 호출자가 대응할 수 있는 상태 코드를 돌려줍니다. "당신 몫을 넘었습니다"는 `429`, "서비스 전체가 용량을 넘었습니다"는 `503`이고, 둘 다에 `Retry-After`를 붙입니다. 한도는 문서에 적어 두고, 호출자가 내부라면 남은 허용량을 헤더로 내보내고, 시끄러운 쪽에는 거절을 시작하기 전에 미리 알립니다. 한도를 두고 벌어지는 불쾌한 대화는 거의 언제나 알려 준 적 없이 발견된 한도에 관한 대화입니다.

마지막으로, 스로틀링은 Bulkhead가 아니고 둘을 섞으면 구멍이 남습니다. 스로틀링은 도착하는 속도의 상한이고, Bulkhead는 호출자 하나나 의존 대상 하나가 공유 리소스를 동시에 얼마나 쥘 수 있는지의 상한입니다. 초당 요청 한도 안에 여유 있게 있으면서도 스레드 풀 전체가 느린 하류 호출 하나에 묶여 있을 수 있습니다. 둘은 서로를 보완하고, 이 장면 옆에 둘 다 놓여 있는 이유는 과부하가 한 가지 모습으로만 오는 일이 드물기 때문입니다.
