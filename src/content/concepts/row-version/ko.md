---
title: "Row Version"
summary: "행 버전은 행이 바뀔 때마다 데이터베이스가 함께 바꾸는 값이어서, 같은 행을 두 번 읽은 결과를 행 자체를 비교하지 않고도 견줄 수 있게 해 줍니다. 쓰는 쪽이 자기가 읽은 것이 아직 디스크에 있는 그것인지 물을 수 있게 하고, 읽는 쪽이 현재를 기다리는 대신 앞뒤가 맞는 과거를 받게 해 주는 것이 이 값입니다."
category: "트랜잭션과 동시성"
scene: isolation-level
sceneStep: 3
related:
  - label: Isolation Level
    slug: isolation-level
  - label: Concurrency Token
    slug: concurrency-token
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Deadlock
    slug: deadlock
  - label: Lock
    slug: lock
  - label: Local Transaction
    slug: local-transaction
  - label: Change Tracking
    slug: change-tracking
references:
  - title: rowversion (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql
  - title: Snapshot isolation in SQL Server
    url: https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/sql/snapshot-isolation-in-sql-server
  - title: PostgreSQL transaction isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
---

장면의 세 번째 단계는 행 옆에 숫자 하나를 놓고, 그 단계의 나머지는 전부 거기서 따라 나옵니다. 버전은 타임스탬프도 아니고 내용의 해시도 아닙니다. 데이터베이스 자신이 쓰기가 있을 때마다 누구에게도 묻지 않고 단조롭게 앞으로 밀어 주는 값입니다. 행이 버전을 달고 나면 어색하던 두 질문이 산수가 됩니다. 내가 본 뒤로 이 행이 바뀌었는가, 그리고 두 버전 중 어느 쪽이 더 오래되었는가.

첫 번째 질문이 낙관적 동시성을 가능하게 합니다. 쓰는 쪽은 행을 버전과 함께 읽고, 자리를 떠나 업무 규칙이 요구하는 일을 하고, 돌아와서는 버전을 페이로드가 아니라 조건에 실어 씁니다. 디스크의 버전이 자기가 읽은 그 버전이면 그 사이에 아무 일도 없었던 것이고 쓰기는 반영됩니다. 그렇지 않으면 다른 쪽이 먼저 커밋한 것이고, 쓰기는 아무 행에도 맞지 않으며, 쓰는 쪽은 아직 손쓸 수 있는 시점에 그 사실을 알게 됩니다. 비용이 옮겨 간 것입니다. 고민하는 동안 잠금을 쥐고 모두를 기다리게 하는 대신, 다시 고민해야 할 위험을 감수합니다.

두 번째 질문이 스냅샷 격리를 가능하게 하는데, 이것은 같은 장치를 반대편에서 본 것입니다. 트랜잭션이 시작할 때 데이터베이스는 그 순간에 어떤 버전들이 커밋되어 있었는지를 기록해 둡니다. 그 뒤로 그 트랜잭션 안의 읽기는 시작 시점에 이미 커밋되어 있던 것 중 가장 최신 버전으로 답해집니다. 그래서 답이 트랜잭션 내내 흔들리지 않고, 읽는 쪽은 쓰는 쪽을 기다릴 일이 없습니다. 옛 버전들은 아직 읽고 있을 사람이 없어질 때까지 어딘가에 살아 있어야 하고, 그래서 스냅샷 격리는 공짜가 아닙니다. 잠금 대기를 저장 공간과 그것을 회수하는 뒷정리로 바꿔 치른 것입니다.

버전이 물리적으로 어디에 사는지는 제품마다 다르고, 그 차이가 밖으로 새어 나옵니다. SQL Server의 `rowversion`은 데이터베이스 전체의 카운터를 행 위의 8바이트 열에 찍어 두므로 눈에 보이고, 인덱싱할 수 있고, 테이블을 가로질러 비교할 수 있으며, 같은 값을 되쓰는 갱신을 포함해 어떤 갱신에서도 바뀝니다. PostgreSQL은 버전을 골라 담을 수 있는 열이 아니라 행 헤더에 두고, 행의 정체는 시스템 열 `xmin`으로 드러냅니다. 눈에 보이는 결과는 vacuum이 치울 때까지 죽은 버전이 쌓인다는 것입니다. 둘은 같은 발상이지만, 따로 요청하지 않고도 `WHERE` 절에 넣을 수 있는 열인 쪽은 하나뿐입니다.

실패하는 모양들은 알아 둘 값어치가 있습니다. 전부 조용하기 때문입니다. 갱신 자체의 조건으로 쓰지 않고 `!=`로 비교한 버전은 경합입니다. 검사와 쓰기 사이에 다른 트랜잭션이 끼어들 자리가 있기 때문입니다. 한 요청에서 읽어 브라우저가 되돌려 보내는 버전은 그 값이 왕복을 바이트 그대로 견딜 때에만 괜찮습니다. SQL Server의 8바이트 값이라면 숫자가 아니라 base64를 뜻하고, 브라우저 입장에서는 그 값을 불투명한 덩어리로 다뤄야 한다는 뜻입니다. 그리고 데이터베이스가 아니라 애플리케이션이 코드에서 직접 올리는 버전은 코드베이스에서 가장 부주의한 쓰기 경로만큼만 믿을 수 있습니다. 버전 올리기를 잊은 `UPDATE` 하나가 모두를 위한 보장을 조용히 없애 버리기 때문입니다.

마지막으로 붙잡아 둘 것은 버전이 하지 않는 일입니다. 버전은 행이 바뀌었다고 알려 주지, 그 변경이 중요한지는 알려 주지 않습니다. 같은 레코드의 서로 다른 필드를 고치는 두 사용자는 병합할 수도 있었을 편집인데도 버전에서 충돌하고, 이것이 오경보처럼 느껴져서 팀들이 더 좁은 토큰이나 필드 단위 병합을 집어 드는 흔한 이유입니다. 그리고 내가 봤을 때 없던 행에 대해서는 아무 말도 해 주지 않으므로, 버전은 내가 읽은 행을 지키지 내가 조회한 집합을 지키지 않습니다.
