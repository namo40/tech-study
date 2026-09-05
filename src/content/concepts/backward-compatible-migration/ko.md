---
title: "Backward-Compatible Migration"
summary: "앞뒤로 호환되는 마이그레이션은 지금 돌고 있는 버전과 다음 버전이 함께 살 수 있는 스키마 변경입니다. 추가는 호환되고 제거와 이름 바꾸기는 그렇지 않습니다. 이 규칙 덕분에 버전 공존 창은 그저 짧은 창이 아니라 견딜 수 있는 창이 됩니다."
category: ".NET 데이터 접근"
scene: database-migration
sceneStep: 2
related:
  - label: Database Migration
    slug: database-migration
  - label: Schema Evolution
    slug: schema-evolution
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

장면의 2단계는 규칙 하나를 켜고, 눈에 보이는 모든 것이 거기서 따라 나옵니다. 변경이 끝난 뒤에도 애플리케이션의 두 버전이 그 스키마와 함께 살 수 있을 때에만 그 변경을 내보낼 수 있다는 규칙입니다. 이것은 "마이그레이션이 성공했다"보다 훨씬 강한 말입니다. 1단계의 마이그레이션도 1밀리초쯤 걸려 성공했습니다. 그것이 못 한 일은 아직 돌고 있던 코드가 알아보는 스키마를 남기는 것이었습니다.

컬럼 추가가 호환되는 변경의 표준인 이유는 옛 코드가 그 컬럼으로 무엇을 하는가에 있습니다. 아무것도 하지 않습니다. `SELECT name, email FROM customers`는 그 둘 옆에 세 번째 컬럼이 생겼다고 해서 틀린 쿼리가 되지 않고, 컬럼을 나열하는 `INSERT`도, 새 컬럼이 값 없음을 받아 주기만 한다면 마찬가지입니다. 마지막 조건이 호환성을 잃는 지점입니다. `ADD COLUMN full_name text NOT NULL`은 추가가 아닙니다. 아직 배포되지도 않은 컬럼을 모든 쓰는 쪽이 이미 알고 있어야 한다는 요구이고, 아직 돌고 있는 버전은 모릅니다. nullable, 또는 기본값이 붙은 nullable이 추가를 보이지 않게 만들어 줍니다.

제거와 이름 바꾸기는 반대편이고, 이름 바꾸기는 함정이라고 따로 불러 둘 만합니다. SQL이 그것을 기꺼이 한 문장으로 보여 주기 때문입니다. `ALTER TABLE customers RENAME COLUMN name TO full_name`은 제거와 추가가 수정인 척하는 것입니다. 이 문장이 느리거나 실행이 위험해서가 아닙니다. 이 문장은 순간이고, 짝이 되는 배포는 순간이 아니라서입니다. 첫 인스턴스가 다시 뜨는 시각과 마지막 인스턴스가 다시 뜨는 시각 사이 어딘가에서 `name`이라고 말하는 코드가 그런 컬럼이 없는 테이블을 만납니다. 남은 질문은 몇 건의 요청이 그 틈에 빠지느냐뿐입니다.

그래서 시험 문제는 "이 마이그레이션이 깨끗하게 적용되는가"가 아니라, 배포가 실제로 밟는 순서(스키마 먼저, 코드 나중)대로 세 상태를 걸어 보는 것입니다. 마이그레이션을 적용하고 아무것도 배포하지 않아도 v1이 여전히 돕니다. 옮겨진 스키마 위에 v2를 배포하면 v2가 돕니다. v2를 되돌려도 v1이 여전히 돕니다. 셋 다 통과하는 변경은 절반씩 따로 배포할 수 있고, 그래야 스키마 걸음과 코드 걸음이 하나의 맞춰진 사건이 아니라 독립된 배포 둘이 됩니다. 장애는 맞춰진 사건에서 삽니다. 맞춤은 타이밍에 대한 약속이고, 롤아웃은 타이밍을 약속하지 않기 때문입니다.

실전에서 이 규칙의 모양은 짧은 목록입니다. 컬럼은 nullable로 추가합니다. 테이블은 무엇이든 거기에 쓰기 시작하기 전에 추가합니다. 인덱스는 데이터베이스가 지원한다면 concurrently로 만들어 생성이 테이블을 트래픽에 대고 잠그지 않게 합니다. 타입은 좁히지 말고 넓힙니다. 모든 옛 값이 계속 합법인 값으로 남아야 하기 때문입니다. enum 멤버는 끝에 붙이고, 읽는 쪽은 모르는 멤버 하나쯤은 견디게 만듭니다. 컬럼을 도입하는 그 걸음에서 그 컬럼을 더 엄격하게 만들지는 않습니다. 그리고 원하는 변경이 정말로 파괴적이라면, 안전하게 만들 방법을 찾지 말고 분해합니다. 이 장면의 나머지가 바로 그 이야기입니다.

이 성질은 앞쪽으로도 돌아갑니다. 그것을 잊었을 때 치르는 값은 실패하는 롤백입니다. v2 배포는 되돌릴 수 있는 결정입니다. 옛 바이너리는 아직 레지스트리에 있기 때문입니다. 마이그레이션 적용은 되돌리기가 훨씬 어렵습니다. 그래서 v1은 되돌아가고 싶어질 수 있는 기간 내내 새 스키마 위에서 계속 동작해야 합니다. 같은 규칙을 반대편에서 읽은 것이고, 아무도 읽지 않게 된 뒤에도 옛 컬럼을 며칠 더 두는 이유입니다. 필요할 거라고 예상해서가 아니라, 그것을 두는 일이 이전 버전을 여전히 배포 가능한 산출물로 남겨 주기 때문입니다.

리뷰에서 지켜볼 신호가 하나 있습니다. 하나의 풀 리퀘스트에 마이그레이션과 그 마이그레이션에 의존하는 코드 변경이 함께 들어 있다면, 둘은 하나의 사건으로 나가고 있고 누군가 둘이 같이 도착하리라고 조용히 가정한 것입니다. 그렇게 되지 않습니다. 마이그레이션은 롤아웃 전에 한 번 돌고, 코드는 그다음 몇 분에 걸쳐 인스턴스 하나씩 도착합니다. 둘을 풀 리퀘스트 둘로 나누는 것은 형식주의가 아닙니다. 리뷰어가 정작 중요한 질문, 각각이 혼자서 안전한가에 답할 수 있는 유일한 방법입니다.
