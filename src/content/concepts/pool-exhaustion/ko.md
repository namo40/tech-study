---
title: "Pool Exhaustion"
summary: "Pool Exhaustion은 모든 연결이 대여 중이라 요청이 줄을 서는 상태입니다. 데이터베이스는 거의 놀고 있는데 애플리케이션이 느려지고 실패하기 시작합니다."
category: "Pool과 리소스 관리"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Maximum Pool Size
    slug: maximum-pool-size
  - label: Connection Timeout
    slug: connection-timeout
  - label: Bulkhead
    slug: bulkhead
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

증상은 느린 쿼리가 아니라 연결 Timeout입니다. 요청은 풀에서 연결을 얻지 못했다는 메시지와 함께 실패하고, 지연 시간은 완만한 곡선이 아니라 계단처럼 뜁니다. 그런데 데이터베이스 쪽 대시보드는 평온합니다. CPU는 낮고, 활성 세션은 적으며, 막혀 있는 것도 없습니다.

원인은 거의 언제나 애플리케이션 쪽에 있습니다. 비즈니스 로직 전체에 걸쳐 열어 둔 트랜잭션, 예외가 블록을 건너뛰는 바람에 반납되지 않은 연결, 인덱스가 바뀐 뒤 느려진 쿼리, 오토스케일로 늘어난 인스턴스 수만큼 프로세스별 풀이 곱해진 상황이 그렇습니다.

두 숫자를 지켜봅니다. 최대치 대비 사용 중인 연결의 비율, 그리고 연결을 기다린 시간입니다. 둘 다 오류가 나타나기 전에 먼저 포화되므로, 얻을 수 있는 가장 이른 경고입니다. 여기에 짧은 연결 Timeout을 함께 두어, 포화된 풀이 요청을 뒤에 쌓아 두는 대신 빠르게 실패하게 합니다.
