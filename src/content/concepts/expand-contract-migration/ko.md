---
title: "Expand-Contract Migration"
summary: "확장 축소 마이그레이션은 스키마 변경을 릴리스 두 번으로 나누고 그 사이에 두 형태가 함께 사는 기간을 둡니다. 확장은 옛 형태가 그대로 동작하는 채로 새 형태를 더하고, 축소는 옛 형태를 읽는 것이 하나도 남지 않았을 때에만 그것을 걷어냅니다."
category: "컨테이너와 오케스트레이션"
scene: blue-green-deployment
sceneStep: 4
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

장면의 마지막 단계는 앞의 세 단계가 어떻게 가능했는지를 설명하는 자리입니다. Blue와 Green은 모든 것이 두 벌이지만, 그 아래 데이터베이스는 하나뿐이고 그것만은 복제되지 않습니다. 그 스키마에 참인 것은 두 버전 모두에게 동시에 참입니다. 그러니 새 버전만 이해하는 변경은 사실 스키마 변경이 아니라, 돌아갈 수 있는 능력을 그만 갖겠다는 결정입니다.

그래서 변경은 가운데에 간격을 두고 두 수로 나눕니다. 확장은 더하기입니다. 새 컬럼은 nullable로 들어오고, 새 테이블은 비어 있고, 새 열거 값은 아직 쓰이지 않으며, 옛 버전이 읽는 것은 전부 있던 자리에 그대로 있습니다. 확장 릴리스는 무엇도 깨뜨리지 않고, 그래서 그것을 필요로 하는 코드보다도 먼저, 어떤 전환보다도 먼저 혼자 나갈 수 있습니다. 그다음 장면이 `v1`과 `v2` 태그로 표시하는 구간에서는 두 형태가 함께 있고 두 버전이 같은 행을 두고 모두 옳습니다.

축소가 나머지 한 수이고, 그 전제 조건이 이 이야기의 전부입니다. 축소는 아직 돌고 있을 수 있는 어떤 것도 옛 형태를 읽지 않을 때에만 나갑니다. 새 버전이 배포된 시점이 아닙니다. 트래픽이 옮겨 간 시점도 아닙니다. 옛 컬럼을 필요로 하는 무엇으로도 되돌아가지 않겠다고 결정한 시점입니다. 장면에서 contract 칩은 Blue가 `idle`이 된 다음에 나타나는데, 이 순서는 장식이 아닙니다. 축소하는 순간 2단계의 롤백은 존재하지 않게 됩니다. 되돌아갈 그 버전이 자기 데이터를 더는 읽지 못하기 때문입니다.

둘 사이에 사람들이 자주 건너뛰는 부분이 있습니다. 두 형태를 모두 쓰는 릴리스입니다. 그것이 배포되어 있는 동안 애플리케이션은 쓸 때마다 옛 컬럼과 새 컬럼을 함께 채우고, 변경 이전의 행을 뒤늦게 채우고, 이제 신뢰하는 쪽을 읽습니다. 이 릴리스가 확장을 진짜로 만듭니다. 이것이 없으면 새 컬럼은 존재하되 옛 버전이 쓴 모든 행에서 비어 있고, 그러면 호환된다는 스키마는 컬럼의 모양에서만 호환될 뿐 내용에서는 호환되지 않습니다.

이 이야기가 가장 자주 어긋나는 자리는 이름 바꾸기입니다. 이름 바꾸기는 변경 하나처럼 보이지만 실은 다섯입니다. 새 컬럼을 추가하고, 둘 다 쓰고, 뒤늦게 채우고, 새 컬럼을 읽고, 옛 컬럼을 지웁니다. 그리고 그 하나하나가 스스로 안전하게 중단될 수 있어야 합니다. 배포는 중간에 멈출 수 있기 때문입니다. 타입을 좁히는 일, 기존 행이 위반할 수 있는 제약을 더하는 일, nullable 컬럼을 필수로 바꾸는 일도 마찬가지입니다. 어떤 단계가 마지막으로 완료된 단계로 남아도 괜찮지 않다면, 그것은 단계가 아닙니다.

실무에서 피해를 가장 많이 내는 운영상의 세부가 둘 있습니다. 첫째는 애플리케이션 시작 시점에 마이그레이션을 적용하는 것입니다. 환경 두 벌이 동시에 떠 있으면 둘 다 시도하고, 진 쪽은 이미 절반쯤 바뀐 스키마 위에서 막히거나 실패합니다. 스크립트를 만들어 두거나, 그것에 의존하는 코드보다 먼저 파이프라인의 독립된 단계로 마이그레이션을 실행합니다. 둘째는 큰 테이블의 확장이 공짜가 아니라는 점입니다. 인덱스가 붙은 컬럼을 추가하거나 수백만 행을 뒤늦게 채우는 일은 잠금과 시간을 씁니다. 그러니 채우기는 마이그레이션 안의 한 줄이 아니라 나누어 도는 백그라운드 작업으로 다루고, 확장 릴리스는 필요한 만큼 오래 운영에 머무르게 둡니다.

그러면 이 사이트의 모든 배포 전략에서 살아남는 규칙 하나가 남습니다. 옛 코드는 새 스키마 위에서 돌 수 있어야 하고, 새 코드는 옛 데이터 위에서 돌 수 있어야 합니다. 둘이 함께 돌 가능성이 있는 동안 내내 그렇습니다. 블루-그린이 이 규칙을 필요로 하는 이유는 롤백이 그 상품이기 때문이고, 롤링 업데이트가 필요로 하는 이유는 두 버전이 실제로 겹치기 때문이며, 카나리가 가장 크게 필요로 하는 이유는 거기서 겹침이 지나가는 사고가 아니라 설계 그 자체이기 때문입니다.
