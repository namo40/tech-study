---
title: "SLO"
summary: "SLO는 스스로 정하는 신뢰성 목표입니다. 지표와 기간, 그리고 임계값이 함께 어느 정도면 충분한지를 말해 줍니다. 에러 예산은 이 약속에서 남는 몫이고, 그래서 이 숫자를 고르는 일은 포부가 아니라 엔지니어링 결정입니다."
category: "관측 가능성과 운영"
scene: error-budget
sceneStep: 1
related:
  - label: Error Budget
    slug: error-budget
  - label: SLI
    slug: sli
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
  - title: "Architecture strategies for defining reliability targets"
    url: https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics
  - title: "Embracing Risk"
    url: https://sre.google/sre-book/embracing-risk/
  - title: "Overview of Azure Monitor alerts"
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview
---

서비스 수준 목표는 이미 재고 있는 측정값에 대해 정하는 목표치이고, 소리 내어 밝힌 기간 위에서 성립합니다. "결제 요청의 99.9%가 성공한다, 최근 30일 기준으로 잰다"는 완결된 문장입니다. 지표와 임계값과 기간이 다 있습니다. 셋 중 하나라도 빠지면 목표이기를 그만둡니다. 기간이 없는 목표는 어떻게 보느냐에 따라 같은 오후에 달성되기도 하고 미달되기도 하고, 지표를 밝히지 않은 목표는 그 리다이렉트를 성공으로 셀지를 두고 벌어질 논쟁을 예약해 둔 것입니다. 장면의 첫 단계가 보여 주는 것이 이 완결된 문장의 값어치입니다. 목표가 비율이고 기간이 길이이므로, 목표가 허용하는 실패는 양이 되고, 양은 쓸 수 있습니다.

이 숫자는 발견하는 것이 아니고, 이 숫자를 만들어 내는 측정도 없습니다. 서비스에 기대는 사람들이 얼마만큼의 불안정을 감당할 수 있는지에 대한 결정이고, 양쪽 방향 모두로 실제 비용이 듭니다. 9를 하나 더 붙일 때마다 그것을 지키는 데 드는 엔지니어링이 몇 배가 됩니다. 영역 간 이중화, 그다음 리전 간 이중화, 그다음 두 번째 제공자, 그다음 업무 시간에는 아무도 손대면 안 되는 시스템을 위한 온콜 팀이 붙습니다. 9를 하나 덜 붙일 때마다 고객이 알아차립니다. 목표를 정하는 쓸모 있는 방법은 바깥에서 안으로 들어오는 것입니다. 사용자가 실제로 참아 주는 수준, 아래에 깔린 의존 대상이 약속할 수 있는 수준, 그리고 최근 몇 달의 실제 측정값을 보고, 이미 가까이 가 있으면서 지키려면 노력해야 하는 목표를 고릅니다. 힘 안 들이고 달성하는 목표는 아무것도 알려 주지 않고, 한 번도 달성한 적 없는 목표는 사람들이 무시하는 법을 배웁니다.

SLO는 SLA가 아니고, 둘을 섞으면 비쌉니다. SLA는 돈이 걸린 계약판이고 회사 밖의 누군가와 협상한 것이며, 내부 목표보다 일부러 느슨하게, 흔히 9 하나만큼 느슨하게 잡습니다. 내부 목표를 놓치는 일이 환불이 아니라 신호가 되도록 하기 위해서입니다. 내부 SLO는 경보가 울리기를 바라는 자리이고, 그 자리는 바깥의 누군가가 알아차리기 한참 전입니다. SLA를 그대로 SLO로 내건 팀은 대응할 시간을 벌어 주기로 되어 있던 여유를 없애 버린 것이고, 문제를 알리는 첫 소식이 고객사 법무팀에서 옵니다.

목표가 어디에 놓이는지는 위반이 무슨 뜻인지도 정합니다. 월 99.9% 목표는 43분의 실패를 허용하는데, 나쁜 오후 하루가 한자리에서 다 쓸 수 있는 양입니다. 같은 목표라도 달력 달 대신 최근 30일 기준으로 잡으면 매달 1일의 새 출발 효과가 없어지고, 그 차이가 숫자 자체보다 행동을 더 많이 바꿉니다. 사용자가 끊이지 않고 겪는 것에는 최근 며칠을 계속 훑는 기간이 정직한 선택입니다. 오늘 남은 예산이 3주 전 장애를 반영하기 때문입니다. 달력 기간은 설명하기 쉽고 장난치기도 쉽지만, 실질적인 장점 하나는 리셋이 강제하도록 되어 있는 회고와 시점이 맞는다는 것입니다. 어느 쪽을 고르든 목표는 버전 관리되는 곳에, 그것이 무엇을 재는지에 대한 정의 옆에 둡니다. 대시보드 설정 안에 사는 목표는 리팩터링 한 번이면 조용히 바뀌어 있을 수 있기 때문입니다.
