---
title: "SLI"
summary: "SLI는 측정 그 자체입니다. 유효한 이벤트 대비 좋은 이벤트의 비율로, 서비스를 쓰는 느낌을 대신 나타냅니다. 그 아래의 모든 것이 이 지표의 사각지대를 그대로 물려받으므로, 어디서 재느냐가 예산이 진실을 말하는지를 정합니다."
category: "관측 가능성과 운영"
scene: error-budget
sceneStep: 2
related:
  - label: Error Budget
    slug: error-budget
  - label: SLO
    slug: slo
  - label: p95
    slug: p95
  - label: Tail Latency
    slug: tail-latency
  - label: Health Check
    slug: health-check
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Distributed Tracing
    slug: distributed-tracing
  - label: Sampling
    slug: sampling
  - label: Rollback
    slug: rollback
  - label: Canary Release
    slug: canary-release
references:
  - title: "Embracing Risk"
    url: https://sre.google/sre-book/embracing-risk/
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: "Overview of Azure Monitor alerts"
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview
---

서비스 수준 지표는 조심스럽게 쓴 두 조각으로 이루어진 비율입니다. 분자는 좋은 이벤트, 분모는 유효한 이벤트입니다. 두 조각 모두 결정입니다. "좋음"은 2xx나 3xx 응답을 뜻할 수도 있고, 300밀리초 안에 도착한 2xx를 뜻할 수도 있습니다. 9초 뒤에 성공한 결제는 기다리던 사람 입장에서는 성공한 것이 아니기 때문입니다. 더 어려운 쪽은 "유효"입니다. 잘못된 요청 때문에 나온 400은 서비스의 실패가 아니므로 분모에서 빼야 하지만, 용량이 없어서 우리가 돌려준 429는 분명히 서비스의 실패입니다. 두 정의를 한 문장으로 적어 두세요. 두 팀의 가용성 숫자가 갈리는 이유는 거의 시스템이 아니라 거의 언제나 이 문장이기 때문입니다.

어떻게 계산하느냐보다 어디서 재느냐가 더 중요합니다. 우리 애플리케이션 로그로 만든 성공률은 우리 코드가 돌기 전에 일어난 모든 실패를 보지 못하는데, 흥미로운 실패는 대부분 거기에 있습니다. DNS를 끝내 풀지 못한 요청, 로드 밸런서가 거절한 연결, 우리에게 닿지도 않고 504를 돌려준 게이트웨이 타임아웃, 프로세스가 듣고 있지 않던 배포 순간 같은 것들입니다. 서버 쪽 메트릭이 보고하는 것은 멀쩡한 인스턴스에 도착한 요청이고, 이것은 구조적으로 생존 편향이 걸린 표본입니다. 인그레스에서, CDN에서, 또는 네트워크 밖의 합성 클라이언트에서 재는 것은 비용이 더 들고 진실을 말합니다. 장면의 두 번째 단계가 그 정직한 진실의 모습입니다. 측정된 성공률은 무언가를 사고로 선언하기 전에 이미 내려가고, 예산은 누군가 채널을 연 순간이 아니라 사용자가 알아차리기 시작한 순간부터 줄어듭니다.

지표가 빗나가는 또 하나의 자리는 평균입니다. 평균 지연 시간은 목표가 다루려는 바로 그 요청들을 가립니다. 느린 꼬리는 개수로는 적고 영향으로는 거대하기 때문입니다. 그래서 지연 시간으로 쓰는 SLI는 백분위 임계값과 개수를 씁니다. "평균 지연 시간 300밀리초 이하"가 아니라 "300밀리초 안에 처리된 요청의 비율"입니다. 이 표현은 지연 시간 목표를 다시 비율로 바꿔 주고, 그래야 가용성 지표와 합쳐져 하나의 예산으로 쓰일 수 있습니다. 빠른 헬스 체크 묶음이 들어왔을 때 숫자가 좋아지는 일도 막아 줍니다. 평균이라면 기꺼이 좋아졌을 것입니다.

지표의 개수는 적게 유지하고, 하나하나를 사람이 하는 일에 붙여 둡니다. 엔드포인트마다 지표를 하나씩 둔 서비스에는 아무도 읽지 않는 숫자의 벽과 모든 것을 가리는 합계가 남습니다. 사용자 여정마다 하나씩 셋을 둔 서비스에는 대화가 남습니다. 좋은 지표인지 가리는 시험은 두 가지입니다. 그 지표가 떨어졌을 때 하던 일을 멈추게 되는가, 그리고 사용자도 무언가 잘못됐다고 동의할 것인가. 둘 다 통과하지 못하는 것은 대시보드에 둘 만한 메트릭이지 예산을 붙일 만한 지표가 아닙니다. 이 두 부류를 섞으면 아무도 불만과 연결 지을 수 없는 그래프 하나 때문에 배포를 동결하는 팀이 됩니다.
