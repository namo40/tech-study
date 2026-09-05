---
title: "Maximum Pool Size"
summary: "Maximum Pool Size는 한 프로세스가 하나의 연결 문자열로 열 수 있는 연결 수를 제한합니다. 데이터베이스의 전체 예산을 인스턴스마다 나눠 주는 방법입니다."
category: "Pool과 리소스 관리"
scene: database-connection-pool
sceneStep: 3
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Pool Exhaustion
    slug: pool-exhaustion
references:
  - title: SQL Server connection pooling (ADO.NET)
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

이 제한은 애플리케이션 단위가 아니라 프로세스 단위이자 연결 문자열 단위입니다. SQL Server 공급자의 기본값은 100인데, 프로세스 하나에는 넉넉하고 스무 개에는 무모한 값입니다.

데이터베이스가 감당할 수 있는 수에서 시작해 마이그레이션, 관리 도구, 배치 작업이 쓸 몫을 빼고, 지금 돌리는 인스턴스 수가 아니라 최대일 때 돌릴 인스턴스 수로 나눕니다. 오토스케일로 대수가 세 배가 될 수 있다면, 프로세스별 제한은 세 배가 된 상태를 가정해야 합니다.

제한을 넘겼다고 곧바로 거부되지는 않습니다. 요청은 `Connect Timeout`이 다할 때까지 풀 안에서 줄을 서고, 그다음에야 실패합니다. 그래서 너무 작게 잡은 풀은 느린 애플리케이션처럼 보이고, 너무 크게 잡은 풀은 데이터베이스가 새 로그인을 거부하는 순간까지 멀쩡해 보입니다.
