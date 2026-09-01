---
title: "Rollback"
summary: "롤백은 필요해지기 전에 준비해 두는 돌아갈 길입니다. 이전 리비전을 데워 두고, 되돌아가는 일을 재빌드가 아니라 포인터 이동으로 만들고, 무엇이 돌아갈 수 없는지를 미리 알아 두는 것입니다. 데이터와 스키마와 부작용은 앞으로만 가기 때문입니다."
category: "컨테이너와 오케스트레이션"
scene: rollback
steps:
  - title: "돌아갈 길은 필요해지기 전에 만들어 둡니다"
    text: "고스트는 새 판을 배포하면서 옛 판을 버립니다. 그래서 새 판이 나빠지자 남은 길은 불길 속에서 고쳐 다시 빌드하는 것뿐이고, 몇 초면 될 일이 몇 분의 오류가 됩니다. 이전 리비전을 데워 두는 값은 거의 없습니다. 두지 않는 값은, 최악의 배포를 빌드 속도로 계산하게 만듭니다."
  - title: "롤백은 배포가 아니라 포인터 이동입니다"
    text: "나쁜 릴리스는 제자리에 두고, active 포인터가 떠난 적 없는 이전 리비전으로 돌아가며, 트래픽은 몇 초 안에 따라갑니다. 빌드도, 이미지 풀도, 장애 한복판의 CI 대기도 없습니다. 플랫폼이 리비전 히스토리를 보관하는 이유가 이것입니다. 가장 빠른 수정은 지난주에 이미 돌고 있던 그것입니다."
  - title: "코드는 돌아가도 데이터는 앞에 남습니다"
    text: "나쁜 릴리스는 도는 동안 자기 새 형식으로 레코드를 썼고, 그것들은 포인터와 함께 돌아가 주지 않습니다. 옛 코드가 이제 미래에서 온 데이터를 마주합니다. 스키마 변경을 호환 우선으로 내보내는 이유가 이것입니다. 이웃한 리비전끼리 서로의 기록을 읽지 못하면, 돌아가는 길은 정확히 필요한 순간에 닫혀 있습니다."
  - title: "세상이 이미 바뀌었으면 앞으로 고칩니다"
    text: "어떤 손상은 프로세스 안에 있지 않습니다. 메일은 나갔고, 청구는 잡혔고, 웹훅은 발사되었습니다. 코드를 되돌려도 보낸 것을 안 보낸 것으로 만들 수는 없습니다. 수정은 앞으로 나아가는 고친 릴리스와, 빠져나간 것을 보상하는 조치입니다. 코드가 틀렸으면 뒤로, 세상이 바뀌었으면 앞으로. 지금이 어느 쪽인지 아는 것이 진짜 기술입니다."
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Rolling Update
    slug: rolling-update
  - label: Feature Flag
    slug: feature-flag
  - label: Database Migration
    slug: database-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Roll-Forward
    slug: roll-forward
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Safe deployment practices
    url: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
  - title: Applying Migrations - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
---

## 언제 쓰나

- 모든 배포는 돌아갈 길을 하나씩 지녀야 하고, 그 길은 장애가 난 뒤가 아니라 배포 전에 마련해 둡니다. 이전 리비전이 아직 그 자리에 있고 아직 실행 가능하다는 뜻입니다. 플랫폼에 리비전 히스토리를 남기고(쿠버네티스 Deployment의 `revisionHistoryLimit`, 슬롯 교체에서 남겨 두는 이전 슬롯), 이미지 태그를 재사용하지 않아 `v1.4.2`가 지난주와 같은 것을 가리키게 하고, 설정도 코드와 함께 버전을 매겨 옛 바이너리가 자기가 시험받은 설정을 다시 만나게 합니다.
- 새 릴리스가 눈에 띄게 나쁜데 아직 이유를 모를 때 바로 꺼내 씁니다. 롤백은 진단이 아니라 분류 조치입니다. 로그를 읽는 동안 오류 예산을 되사 오는 일입니다. 나쁜 리비전은 그 뒤에도 선반에 남아 있고, 진단은 거기에서 합니다.
- 플랫폼이 대신 해 줄 수 있는 자리에서는 플랫폼에 연결합니다. 헬스 게이트가 걸린 롤아웃은 실패한 릴리스가 전체 함대에 닿기 전에 멈추고, 일부 플랫폼에서는 사람 없이도 되돌립니다. 그것이 이 페이지의 가장 값싼 형태입니다. 지켜보고 있던 무언가가 몇 초 안에 자동으로 돌아갈 길을 택하는 것입니다.
- 점진 배포와 양자택일로 두지 말고 함께 씁니다. 카나리는 나쁜 릴리스를 보는 사람 수를 제한하고, 롤백은 보는 시간을 제한합니다. 둘이 함께 있어야 피해 범위가 양쪽 축에서 묶이고, 어느 하나가 다른 하나를 대신하지는 못합니다.
- 백업을 점검하듯 가끔 실제로 해 봅니다. 시험해 보지 않은 돌아갈 길은 계획이 아니라 희망이고, 훈련 중에 발견한 실패는 공짜입니다. 결정한 순간부터 옛 리비전이 트래픽을 받기까지의 시간을 재고, 그 수치를 별도의 서비스 수준 목표로 다룹니다.

## 주의점

- 데이터는 돌아가지 않습니다. 20분 동안 돌던 릴리스는 자기가 원하는 형식으로 레코드를 썼고, 포인터가 뒤로 움직여도 그 레코드가 다시 쓰이지는 않습니다. 스키마 변경을 확장부터 내보내는 이유가 이것입니다. 새 열을 더하고, 옛 열을 남기고, 둘 다 다루는 코드를 배포하고, 옛 형식이 필요한 리비전이 완전히 사라진 뒤에야 축소합니다. 이웃한 리비전끼리 서로의 기록을 읽을 수 있어야 하고, 그렇지 않으면 돌아가는 길은 정확히 필요한 순간에 닫혀 있습니다.
- 배포를 되돌리는 일과 데이터베이스 마이그레이션을 되돌리는 일은 서로 다른 동작이고, 둘을 한 동작으로 묶는 것이 나쁜 오후를 나쁜 한 주로 만드는 방법입니다. 코드를 먼저, 따로 되돌리고, 스키마는 데이터를 눈앞에 두고 따로 판단합니다. 명령 하나로 둘 다 해 주겠다는 도구는, 압박받는 사람을 대신해 되돌릴 수 없는 결정을 내려 주겠다는 말입니다.
- 어떤 마이그레이션에는 정직한 역방향이 없습니다. 열을 지우고, 타입을 좁히고, 두 행을 합치는 변경의 down 스크립트는 형태만 다시 만들 뿐 값은 되살리지 못합니다. 검토 자리에서 그 사실을 소리 내어 말하고, 답이 "백업에서 복원해야 한다"라면 그것이 그 마이그레이션의 진짜 복구 계획입니다. 그 계획은 마이그레이션이 나가기 전에 적어 두어야지, 나중에 발견할 것이 아닙니다.
- 부작용도 돌아가지 않습니다. 나간 메일은 나간 채로 있고, 잡힌 청구는 누군가의 명세서에 올라 있고, 다운스트림이 이미 처리한 웹훅은 우리가 통제하지 않는 세상을 바꿔 놓았습니다. 여기에 답하는 것은 보상입니다. 없던 일로 되돌리는 취소가 아니라, 앞선 행위를 상쇄하는 새 행위입니다. 환불은 두 번째 거래이고, 고객은 두 건을 모두 보았습니다.
- 변경이 기능 플래그 뒤에 있다면 플래그를 끄는 쪽이 더 싼 롤백입니다. 더 빠르고, 범위가 더 좁고, 아무것도 배포하지 않으므로 같은 릴리스에 실린 다른 수정은 그대로 남습니다. 배포 단위 롤백은 스위치 뒤에 없는 코드에 결함이 있을 때, 또는 스위치 자체가 망가졌을 때 씁니다.
- 나쁜 리비전은 지우지 마세요. 그것이 증거이고, 급하게 만든 핫픽스로 덮어쓰면 실제로 무슨 일이 있었는지에 대한 유일한 사본이 사라집니다. 포인터만 뒤로 돌리고, 이미지와 로그는 그대로 두고, 더 이상 불타지 않는 시스템에서 진단합니다.
- 되돌리는 일에도 위험은 있습니다. 옛 리비전은 오늘의 데이터도, 오늘의 트래픽 모양도, 지금 상태의 스키마도 본 적이 없고, 새 릴리스가 우연히 가려 주던 자기 버그를 지니고 있을 수도 있습니다. 대개는 더 안전한 선택이지만, 그래도 운영 시스템을 바꾸는 일입니다.

## .NET에서는

쿠버네티스에서 돌아갈 길은 명령 하나이고, 그것이 되는 이유는 플랫폼이 옛 ReplicaSet을 남겨 두었기 때문입니다.

```bash
# 선반에 무엇이 있는지 봅니다. 이 목록이 비지 않을 만큼 히스토리를 남깁니다.
kubectl rollout history deployment/checkout

# 포인터 이동입니다. 빌드도 없고, 노드에 이미 있는 이미지는 다시 받지도 않습니다.
kubectl rollout undo deployment/checkout

# 마지막 판이 원하는 판이 아닐 때는 좋다고 아는 리비전으로 바로 갑니다.
kubectl rollout undo deployment/checkout --to-revision=7
```

Azure App Service에서는 같은 동작이 슬롯을 되돌려 교체하는 일이고, 두 플랫폼 모두 빠른 이유는 아무것도 다시 빌드하지 않기 때문입니다. `revisionHistoryLimit`은 뜻을 두고 정합니다. 너무 낮으면 필요할 때 선반이 비어 있고, 너무 높으면 아무도 다시 가리키지 않을 ReplicaSet을 계속 들고 있게 됩니다.

데이터베이스 쪽은 마이그레이션이 나가기 전에 down 스크립트를 만들어 읽어 둡니다.

```bash
# 롤백이 실제로 실행할 SQL입니다. 아무도 압박받지 않을 때 검토합니다.
dotnet ef migrations script AddDiscountColumn PreviousMigration --output down.sql
```

```csharp
// 파괴적인 Down은 Up이 지운 것을 되살리지 못합니다. 그런 척하지 말고 그렇다고
// 말해 두어야, 복구 계획이 복원이라는 사실을 모두가 압니다.
protected override void Down(MigrationBuilder migrationBuilder)
{
    throw new NotSupportedException(
        "DropColumn(LegacyTotal)은 값을 잃습니다. 이 마이그레이션의 복구는 " +
        "down 스크립트가 아니라 특정 시점 복원입니다.");
}
```

`dotnet ef database update <PreviousMigration>`이 그 스크립트를 실행하고, 이것은 `kubectl rollout undo`와는 별개의 결정입니다. 코드를 먼저 처리합니다. 그다음에 나쁜 리비전이 무엇을 썼는지 보고, 그것을 눈앞에 둔 채로 스키마를 판단합니다.

나머지는 그 길이 존재하도록 미리 갖추는 일입니다. 진짜 readiness probe에 롤아웃을 걸어 망가진 릴리스가 함대 전체를 차지하지 못하게 하고, 동작이 바뀌는 변경 앞에는 기능 플래그를 두어 가장 빠른 길이 스위치를 끄는 일이 되게 하고, 결정을 내리게 만들 지표에 알림을 걸어 그 결정이 10분 뒤가 아니라 오류율과 같은 순간에 도착하게 합니다.
