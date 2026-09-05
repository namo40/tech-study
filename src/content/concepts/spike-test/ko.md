---
title: "Spike Test"
summary: "Spike Test는 부하를 완만히 올리는 대신 한 번에 계단처럼 올립니다. 마케팅 메일도, 캐시 비우기도, 페일오버도 모두 그런 식으로 오기 때문입니다."
category: "테스트와 검증"
scene: load-test
sceneStep: 2
related:
  - label: Load Test
    slug: load-test
  - label: Stress Test
    slug: stress-test
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Cache Stampede
    slug: cache-stampede
  - label: Rate Limiter
    slug: rate-limiter
  - label: Backpressure
    slug: backpressure
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: Horizontal Pod Autoscaler
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
---

램프는 얌전하지만 실제 트래픽은 그렇지 않습니다. Spike Test는 평상시 부하에서 몇 배로 곧장 뛰어올라 그대로 유지합니다. 캠페인 메일이 나갈 때, 캐시를 비웠을 때, 서버 절반이 나머지 절반으로 넘어올 때 벌어지는 일이 그렇습니다. 가질 만한 숫자는 새 수준에서의 정상 상태가 아닙니다. 그건 이미 Load Test가 쟀습니다. 중요한 것은 그 사이 몇 분이 얼마를 치르는가입니다.

급증을 흡수하는 장치에는 모두 지연이 있습니다. 오토스케일러는 창 단위로 지표를 읽고 새 인스턴스가 readiness 검사를 통과할 때까지 기다립니다. 풀이 여는 연결 하나하나가 handshake 비용을 치르고, 차가운 풀은 데워지기 전까지 급증 요청 대부분에서 그 값을 치러야 합니다. 방금 비운 캐시는 지금 시스템을 덮치고 있는 바로 그 트래픽으로 다시 채워야 하며, 요청을 합치지 않으면 미스 하나하나가 각각의 쿼리가 됩니다. 그 지연이 끝난 뒤가 아니라 지연이 이어지는 동안의 지연 시간과 오류를 재야 합니다.

고칠 대상은 대개 한계치가 아니라 그 지연입니다. 첫 몇 초에 확장이 필요 없을 만큼 여유를 두고, 필요해지기 전에 인스턴스를 미리 데우고, 큐 길이를 제한해 급증을 천천히 흡수하는 대신 빠르게 거절하고, 아예 확장할 수 없는 의존성 앞에는 rate limiter를 세워 둡니다.
