---
title: "Lock"
summary: "잠금은 데이터베이스가 동시에 실행되는 문장들에 차례를 매기는 방법입니다. 공유 잠금은 읽는 쪽들을 함께 들여보내고, 배타 잠금은 나머지를 모두 막으며, 충돌하는 잠금을 원하는 쪽은 쥐고 있는 트랜잭션이 끝날 때까지 기다립니다."
category: "트랜잭션과 동시성"
scene: deadlock
sceneStep: 1
related:
  - label: Deadlock
    slug: deadlock
  - label: Isolation Level
    slug: isolation-level
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Database Connection Pool
    slug: database-connection-pool
references:
  - title: Transaction locking and row versioning guide (SQL Server)
    url: https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
---

애플리케이션이 마주치는 잠금은 두 가지 모드로 거의 다 설명됩니다. SQL Server의 기본값인 잠금 기반 read committed에서는 공유 잠금이 읽기가 잡는 잠금이고, 같은 행에 여러 읽기가 동시에 잡을 수 있습니다. 배타 잠금은 쓰기가 잡는 잠금이고 무엇과도 함께 잡히지 않습니다. 배타 잠금이 걸려 있는 동안 다른 트랜잭션은 그 행을 공유 잠금으로 읽을 수도, 쓸 수도 없습니다. "두 번째 쓰기가 기다린다"는 말의 실체가 이것입니다. 데이터베이스가 읽기를 행 버전으로 답하는 곳에서는(PostgreSQL은 항상, SQL Server는 `READ_COMMITTED_SNAPSHOT`을 켠 뒤) 읽기가 공유 잠금을 잡지 않아 쓰기에 막히는 일이 없고, 이 그림에서는 쓰기 쪽만 남습니다.

사람들이 놀라는 부분은 잠금을 얼마나 오래 쥐고 있느냐입니다. 배타 잠금은 문장이 끝날 때가 아니라 트랜잭션이 끝날 때 풀립니다. 트랜잭션이 쓴 것은 전부 commit이나 rollback까지 잠긴 채로 남습니다. 외부 호출을 끼고 열어 둔 트랜잭션이 그 호출이 걸리는 시간만큼 정확히 다른 쓰기를 막는 이유입니다.

잠금에는 크기도 있습니다. 데이터베이스는 행 하나를 잠글 수도, 페이지를 잠글 수도, 테이블 전체를 잠글 수도 있고, 예를 들어 SQL Server는 한 문장이 그런 잠금을 충분히 많이 잡으면 작은 잠금 여러 개를 큰 잠금 하나로 승격시킵니다. 받쳐 주는 인덱스가 없는 갱신은 테이블을 훑으면서 지나가는 자리마다 잠금을 잡고, 실제로 바꾼 행보다 훨씬 많은 범위를 쥐게 됩니다. 그래서 빠진 인덱스가 느린 쿼리가 아니라 막힘 문제로 드러납니다.

잠금을 기다리는 것 자체는 정상이고 대개 잠깐입니다. 정상이 아닌 것은 두 트랜잭션이 서로를 기다리는 상황입니다. 그 기다림에는 끝이 없습니다. 그것이 데드락이고, 데이터베이스가 하나를 죽여야만 풀립니다. 잠금 대기 시간을 그 자체로 지켜볼 지표로 삼고, 각 트랜잭션 뒤에 선 대기열도 짧게 유지되도록 트랜잭션을 짧게 씁니다.
