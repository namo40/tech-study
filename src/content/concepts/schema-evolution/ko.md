---
title: "Schema Evolution"
summary: "스키마 진화는 스키마를 뛰는 것이 아니라 걷는 것으로 다루는 방식입니다. 모든 변경을 각각 배포할 수 있고 각각 되돌릴 수 있는 걸음으로 분해합니다. 그래서 살아 있는 데이터베이스의 모양은, 한 번에 맞아야 하는 순간 없이 계속 움직일 수 있습니다."
category: ".NET 데이터 접근"
scene: database-migration
sceneStep: 4
related:
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Feature Flag
    slug: feature-flag
  - label: Schema Registry
    slug: schema-registry
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

4단계에 이르면 옛 컬럼에는 읽는 쪽이 남아 있지 않으므로, 제거해도 누가 볼 수 있는 것은 아무것도 바뀌지 않습니다. 장면 전체가 쌓아 온 지점이 여기이고, 이것은 해피 엔딩이 아니라 성질로 말해 둘 만합니다. 마지막 걸음이 심심했던 이유는 제거가 영리해서가 아니라 그 앞의 세 걸음이 읽는 쪽을 옮겨 놓았기 때문입니다. 스키마는 도약으로 버전이 바뀌지 않습니다. 걷습니다. 그리고 한 발짝 한 발짝이 되돌릴 수 있을 만큼 작습니다.

네 걸음은 이름 바꾸기용 조리법이 아니라 일반적인 모양입니다. 타입 변경은 더 넓은 타입의 새 컬럼, 두 컬럼에 대한 이중 쓰기, 변환이 들어간 backfill, 읽기 이동, 옛 컬럼 제거입니다. 컬럼 하나를 둘로 쪼개는 일도 새 컬럼이 둘일 뿐 같은 걸음입니다. nullable 컬럼을 필수로 만드는 일은 기본값, null인 행을 위한 backfill, 기존 행을 검사하지 않은 채 붙였다가 나중에 검증해서 검사하는 동안 테이블이 잠기지 않게 하는 제약(PostgreSQL의 `NOT VALID`, SQL Server의 `WITH NOCHECK`), 그러고 나서야 값이 있다고 가정하는 코드입니다. 테이블을 서비스 사이로 옮기는 일도 가운데에 `UPDATE` 대신 메시지 큐가 놓일 뿐 같습니다. 어느 경우든 파괴적인 변경은 그것을 안전하게 만들어 준 것 다음, 맨 끝에 옵니다.

각 걸음을 배포 가능하게 만드는 것은 그 걸음이 도착하는 순간 양쪽으로 호환된다는 사실입니다. 각 걸음을 되돌릴 수 있게 만드는 것은 더 미묘하고 놓치기 쉽습니다. 이전 상태가 아직 존재해야 한다는 것입니다. expand가 되돌릴 수 있는 이유는 새 컬럼이 비어 있어서 제거에 값이 들지 않기 때문입니다. backfill이 되돌릴 수 있는 이유는 아직 아무도 읽지 않는 컬럼에만 쓰기 때문입니다. switch가 되돌릴 수 있는 이유는 이중 쓰기가 옛 컬럼을 계속 관리하고 있어서, 읽기를 도로 옛 컬럼으로 돌려도 화요일 자 스냅샷이 아니라 최신 데이터를 찾기 때문입니다. contract는 되돌릴 수 없는 걸음이고, 그래서 정확히 맨 끝에 놓이고 기다립니다.

그 기다림이 팀들이 건너뛰는 부분이고, 건너뛰는 것은 잘못된 절약입니다. 옛 컬럼이 쓰는 값은 약간의 저장 공간과 쓰기 경로의 한 줄입니다. 일주일 두면 그 일주일 동안 어떤 되돌리기든 사고가 아니라 배포가 됩니다. 이 지연 뒤에는 진짜 결정이 하나 있고, 그것은 증거에 대한 것입니다. 쿼리 로그로든, 아직 읽을 수 있는 코드 경로에 붙인 지표로든, 아니면 읽는 쪽 전체라고 확신하는 코드베이스를 다 뒤져 봐서든, 아무도 읽지 않는다는 것을 보일 수 있을 때 컬럼을 제거합니다. "쓰는 데 없을 거예요"는 매달 1일에 도는 리포트 작업이 최악의 순간에 그 컬럼을 발견하게 되는 경로입니다.

이 습관은 컬럼 너머로도 일반화되고, 같은 논리가 무엇이든 두 버전이 서로 맞아야 하는 곳마다 나타납니다. 다른 서비스가 소비하는 이벤트나 메시지도 같은 방식으로 진화합니다. 필드를 추가하고, 기존 필드의 용도를 절대 바꾸지 않고, 소비자가 모르는 필드를 견디게 만들고, 그 필드를 읽던 소비자가 사라진 뒤에야 필드를 퇴역시킵니다. 스키마 레지스트리는 그 규율을 기계가 강제하게 한 것이고, 읽는 쪽이 내 다른 인스턴스가 아니라 다른 팀이 되는 순간부터 가질 만합니다. HTTP API도 다시 같은 모양이고, 새 필수 요청 필드가 파괴적 변경인 이유는 `NOT NULL`이 그랬던 이유와 정확히 같습니다.

장면이 마지막으로 말하려는 것은 이 거래로 무엇을 얻느냐입니다. 마이그레이션이 안전해졌다는 이야기가 아닙니다. 이름 바꾸기는 실행 자체가 위험한 적이 없었습니다. 맞춰야만 했던 변경 하나가 맞출 필요 없는 변경 넷이 됐다는 이야기입니다. 맞춤이란 두 일이 충분히 가까이 일어나리라는 약속이고, 롤아웃은 아무도 그 약속을 할 수 없는 상황 그 자체입니다. 맞춰진 사건 하나를 독립된 사건 넷으로 바꾸는 것이 이 거래이고, 값은 컬럼 둘을 일주일쯤 지고 가는 것과 둘 다에 쓰는 코드 몇 줄입니다. 점검 창에 대면 싼 값입니다.
