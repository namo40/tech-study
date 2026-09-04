---
title: "Roll-Forward"
summary: "앞으로 고치기는 옛 릴리스가 아니라 새 릴리스로 고치는 것입니다. 손상이 이미 프로세스 밖으로 나갔을 때, 이전 리비전이 나쁜 판이 쓴 것을 읽지 못할 때, 스키마가 이미 앞으로 나아가 돌아갈 길이 더는 돌아갈 길이 아닐 때의 답입니다."
category: "컨테이너와 오케스트레이션"
scene: rollback
sceneStep: 4
related:
  - label: Rollback
    slug: rollback
  - label: Compensating Transaction
    slug: compensating-transaction
  - label: Feature Flag
    slug: feature-flag
  - label: Database Migration
    slug: database-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Canary Release
    slug: canary-release
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Idempotency Key
    slug: idempotency-key
references:
  - title: Safe deployment practices
    url: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
  - title: Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Applying Migrations - EF Core
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
---

앞으로 고치기는 같은 기술의 나머지 절반입니다. 롤백은 아직 서 있는 리비전으로 포인터를 되돌리는 일이고, 앞으로 고치기는 고친 릴리스를 만들어 그쪽을 가리키는 일입니다. 앞의 것이 더 빠르고 먼저 나와야 할 반사 행동이므로, 앞으로 고치기가 용감한 선택이거나 더 프로다운 선택인 것은 아닙니다. 뒤로 가도 실제로는 도움이 되지 않을 때 남는 선택이고, 기술의 전부는 장애가 도는 동안 그 두 상황을 가려내는 데 있습니다.

앞으로 밀어내는 이유는 세 가지입니다. 첫째, 이미 프로세스 밖으로 나간 손상입니다. 확인 메일은 나갔고, 카드는 결제되었고, 웹훅은 발사되어 파트너 시스템이 그것을 처리했습니다. 어느 것에도 배포는 닿지 않습니다. 여기에 답하는 것은 보상입니다. 없던 일로 되돌리는 취소가 아니라 앞선 행위를 상쇄하는 새 행위이고, 보상은 릴리스에 실려 나가므로 릴리스는 앞으로 움직여야 합니다. 둘째, 옛 코드가 읽지 못하는 데이터입니다. 나쁜 리비전이 자기가 만든 형식으로 레코드를 썼는데 스키마를 이전 리비전이 읽을 만큼 넓게 유지하지 않았다면, 포인터를 뒤로 옮기는 순간 첫 장애 위에 두 번째 장애가 얹힙니다. 셋째, 이미 실행되었고 정직하게는 되돌릴 수 없는 마이그레이션입니다. 이때 돌아갈 길은 복원이 되고, 작은 전진 수정이 더 싼 결정이 됩니다.

앞으로 고치기가 두 번째 장애가 되지 않게 하는 것은 규율입니다. 변경 범위를 결함에 맞춰 묶으세요. 장애 중의 수정 릴리스는 다음 주에 들어갈 리팩터링을 함께 태울 자리가 아니고, 두 사람이 검토한 한 줄짜리 수정이 아무도 읽지 않은 깔끔한 재작성보다 낫습니다. 나쁜 릴리스가 지나온 것과 같은 관문을 우회하지 말고 그대로 통과시킵니다. 수정을 믿을 근거가 바로 그 파이프라인이기 때문입니다. 보상 동작은 두 번 실행해도 안전하게 만듭니다. 실제로 두 번 실행하게 되기 때문입니다. 환불에는 같은 요청을 두 번 보내도 결과가 달라지지 않게 하는 키를 붙이고, 이미 바로잡은 레코드에는 표시를 남기고, 나쁜 구간에서 건드려진 대상이 정확히 무엇인지 목록으로 만듭니다. 그리고 그 구간 자체를 적어 둡니다. 배포부터 포인터 이동까지가 구간이고, 보상이 덮어야 할 모든 것은 그 안에서 만들어졌습니다.

그러면 판단은 짧습니다. 코드가 틀렸고 이전 리비전이 오늘의 데이터를 여전히 다룰 수 있다면 뒤로 갑니다. 할 수 있는 가장 빠른 일이고, 운영에 있었다는 사실 자체가 이미 시험입니다. 프로세스 밖의 세상이 바뀌었거나 데이터가 옛 코드의 이해를 넘어 앞서 나갔다면 앞으로 가고, 보상을 함께 들고 갑니다. 확신이 서지 않고 돌아갈 길이 열려 있다면, 일단 뒤로 갑니다. 출혈을 멈추게 하고, 한 시간 뒤에 더 이상 무너지지 않는 시스템에서 다시 쓸 수 있는 것 말고는 아무것도 잃지 않습니다.
