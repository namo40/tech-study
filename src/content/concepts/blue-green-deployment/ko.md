---
title: "Blue-Green Deployment"
summary: "블루 그린 배포는 똑같은 환경 두 벌을 두고 스위치 한 번으로 트래픽을 옮기는 방식입니다. 새 버전은 운영 옆자리에서 스스로를 증명하고, 전환도 복귀도 즉시입니다. 다만 데이터베이스를 같은 조심성으로 바꿀 때만 그렇습니다."
category: "컨테이너와 오케스트레이션"
scene: blue-green-deployment
steps:
  - title: "환경은 둘, 트래픽은 한쪽"
    text: "Blue가 100%를 받는 동안 v2는 옆자리 Green에 배포됩니다. Green은 예열되고, 헬스 체크를 통과하고, 스모크 테스트까지 받습니다. 실제 요청은 하나도 겪지 않은 채로입니다."
  - title: "갈 때 스위치 하나, 올 때 스위치 하나"
    text: "트래픽이 한 번에 Green으로 넘어갑니다. 오류가 드러나면 되돌아가는 것도 즉시입니다. Blue가 아직 따뜻하게 살아 있기 때문입니다. 블루 그린이 사 주는 것은 가장 값싼 롤백, 곧 아직 돌고 있는 옛 버전입니다."
  - title: "스위치 대신 다이얼"
    text: "카나리아는 먼저 10%만 보내고 오류율을 지켜봅니다. 나쁜 버전이면 피해를 10%로 막은 채 되돌립니다. 좋은 버전이면 50%, 100%로 넓힙니다. 속도를 정하는 것은 달력이 아니라 지표입니다."
  - title: "데이터베이스에는 Green이 없다"
    text: "두 버전이 스키마 하나를 함께 쓰므로 변경은 두 수로 나눕니다. 먼저 넓혀서 옛것과 새것이 나란히 돌게 하고, 옛것이 하나도 남지 않았을 때 줄입니다. 이 규율을 건너뛰면 2단계의 즉시 롤백도 사라집니다."
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Expand-Contract Migration
    slug: expand-contract-migration
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
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "Blue-green deployment of AKS clusters"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/aks/blue-green-deployment-for-aks
---

## 언제 쓰나

- 즉시 되돌릴 수 있어야 하고 그 절차가 몸에 익어 있어야 하는 릴리스에 씁니다. 옛 버전이 아직 돌고 있고 아직 따뜻하므로, 되돌리기는 재배포가 아니라 라우팅 변경이고 언제나 같은 몇 초가 걸립니다.
- 옛 버전과 새 버전이 절대 함께 응답하면 안 될 때 씁니다. 롤링 업데이트는 설계상 둘을 섞지만 블루 그린은 섞지 않습니다. 프로토콜을 바꿀 때, 두 가지로 읽을 수 없는 캐시 형식을 바꿀 때, 두 번 돌면 안 되는 백그라운드 작업이 있을 때가 그렇습니다.
- 플랫폼이 이미 그 기능을 갖고 있을 때 씁니다. App Service 슬롯, 인그레스 하나 뒤의 AKS 클러스터 두 벌, 풀 두 벌 앞의 가중치 프로필처럼 교체가 지원되는 동작 하나라면 이 패턴의 위험 대부분은 이미 처리되어 있습니다.
- 배포와 노출을 따로 결정하고 싶을 때 씁니다. Green에 배포하는 일과 Green으로 트래픽을 옮기는 일은 두 가지 행위이고, 그 사이에 하룻밤을 두어도 됩니다.

## 주의점

- 겹치는 구간 동안 환경 두 벌 값을 냅니다. 그리고 그 구간은 의식처럼 보이는 것보다 깁니다. 전환 전에 Green이 떠 있어야 하고 전환 후에도 Blue가 떠 있어야 합니다. 그러지 않으면 값을 치르고 산 롤백이 존재하지 않습니다.
- 진짜 어려운 부분은 공유하는 데이터베이스입니다. 환경은 둘인데 스키마는 하나입니다. 모든 변경을 확대 후 축소로 나누고 그 사이에 릴리스를 하나 두지 않으면 롤백은 말뿐입니다. Blue로 돌아간다는 것은 Green이 쓴 데이터를 읽지 못하는 코드로 돌아간다는 뜻이기 때문입니다.
- 오래 붙어 있는 연결은 라우팅을 따라 움직이지 않습니다. WebSocket, SignalR 회로, gRPC 스트림은 버려진 쪽에 그대로 남습니다. 타임아웃이 끊어 주기를 기다리지 말고 직접 비우면서 클라이언트에게 다시 붙으라고 알리세요.
- 차가운 Green은 성능 퇴행처럼 보입니다. 캐시가 비어 있고 JIT가 예열되지 않았고 연결 풀이 새것이라, 전환 직후 1분이 그날 가장 느린 1분이 됩니다. 여기에 오토스케일러가 반응하면 괜찮은 릴리스가 장애로 바뀝니다. 전환한 다음이 아니라 전환하기 전에 예열합니다.
- 스위치가 건드리는 것은 무엇이든 함께 옮겨야 합니다. 두 환경이 모두 돌릴 수 있는 큐 소비자, 스케줄 작업, 아웃바운드 웹훅은 노는 쪽에 멈추라고 알리지 않으면 두 벌로 돕니다. 두 번 도는 작업은 늦게 도는 작업보다 나쁩니다.
- 아무 일도 없는 날에 롤백을 예행합니다. 한 번도 써 본 적 없는 롤백 경로는 가설이고, 필요한 순간이 그것을 처음 시험하는 순간이 되면 안 됩니다.

## .NET에서는

Azure App Service에서는 이 패턴이 기본 기능입니다. 스테이징 슬롯에 배포하고 예열이 끝나기를 기다린 다음 교체합니다. 교체는 애플리케이션이 이미 떠 있는 상태에서 일어나는 라우팅 변경이고, 되돌리기는 같은 동작을 반대로 한 번 더 하는 것입니다.

```bash
az webapp deploy --resource-group shop --name shop-api --slot staging --src-path ./api.zip
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
# and the way back, which is the same command again
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
```

교체 직후 첫 요청이 느린 요청이 되지 않게 막아 주는 것이 예열입니다. `applicationInitialization`은 슬롯을 준비된 것으로 보기 전에 어떤 경로를 먼저 두드릴지 플랫폼에 알려 줍니다. 그리고 슬롯 고유 설정은 교체를 따라가면 안 되는 설정입니다.

```xml
<system.webServer>
  <applicationInitialization>
    <add initializationPage="/healthz/ready" />
    <add initializationPage="/api/catalogue?page=1" />
  </applicationInitialization>
</system.webServer>
```

규율이 필요한 자리는 데이터베이스이고, EF Core는 그 규율을 건너뛰어도 막아 주지 않습니다. 변경을 확대 마이그레이션과 축소 마이그레이션으로 나누고, 그 사이에 두 형태를 모두 쓰면서 새 형태를 읽는 릴리스를 하나 넣습니다. 확대 마이그레이션은 더하기만 합니다. 이름을 바꾸지도 않고 지우지도 않습니다.

```csharp
// Expand: the new column arrives nullable, and nothing old is touched.
migrationBuilder.AddColumn<string>(
    name: "Nickname", table: "Customers", type: "nvarchar(64)", nullable: true);

// Ships in the same release: write both, read whichever is populated.
customer.Nickname = value;
customer.Name = value;                       // still written for the version that may come back
var shown = customer.Nickname ?? customer.Name;
```

축소 마이그레이션은 Blue가 은퇴하고, 되돌아갈 수 있는 어떤 배포도 `Name`을 더는 읽지 않게 된 다음에야 나갑니다. 여기서 흔한 실수는 애플리케이션 시작 시점에 마이그레이션을 적용하는 것입니다. 두 환경이 서로 먼저 실행하려고 경쟁하기 때문입니다. 스크립트를 만들어 두거나 파이프라인에서 `database update`를 별도 단계로 실행합니다.

```csharp
// Contract: a separate migration, in a later release, after the rollback window closed.
migrationBuilder.DropColumn(name: "Name", table: "Customers");
```

플랫폼이 교체 대신 가중치를 준다면, 예를 들어 Azure Front Door나 Traffic Manager나 서비스 메시라면, 같은 환경 두 벌이 카나리아가 되고 스위치는 다이얼이 됩니다. 데이터 규칙은 하나도 바뀌지 않습니다. 바뀌는 것은 피해 반경의 크기뿐입니다.
