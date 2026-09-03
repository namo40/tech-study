---
title: "ADO.NET Connection Pooling"
summary: ".NET에서 풀을 실제로 구현하는 층입니다. Open은 연결을 빌리고 Dispose는 돌려주며, 풀은 연결 문자열 하나하나마다 따로 만들어집니다. 그 위에 있는 Dapper와 EF Core는 이 기계를 언급하든 하지 않든 그대로 물려받습니다."
category: "Pool과 자원 관리"
scene: database-connection-pool
sceneStep: 2
related:
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Dapper
    slug: dapper
  - label: Minimum Pool Size
    slug: minimum-pool-size
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Maximum Pool Size
    slug: maximum-pool-size
references:
  - title: "SQL Server connection pooling (ADO.NET)"
    url: https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-pooling
---

장면의 두 번째 단계는 요청이 열려 있는 연결을 빌렸다가 돌려주는 모습을 보여 줍니다. .NET에서 이 그림은 코드가 하는 일에 대한 비유가 아니라 문자 그대로의 서술입니다. `SqlConnection`을 만드는 일은 네트워크를 전혀 건드리지 않습니다. `Open`은 공급자의 풀에 연결을 달라고 요청해서 노는 것이 있으면 살아 있는 연결을 받아 오고, 내줄 것이 없을 때만 handshake를 합니다. `using`이 대신 불러 주는 `Dispose`는 소켓을 닫지 않습니다. 세션을 초기화하고 연결을 여유 목록으로 되돌려 놓습니다. 빌리고 돌려주는 규율이 늦게 열고 곧바로 dispose하는 것 이상의 무엇이 아닌 이유가 여기 있습니다.

```csharp
// One string, one pool. Change a single character and there are two.
const string cs =
    "Server=db;Database=orders;Encrypt=True;Application Name=orders-api;" +
    "Min Pool Size=5;Max Pool Size=100;Connection Lifetime=600";

using var connection = new SqlConnection(cs);
await connection.OpenAsync(ct);   // rent, from the pool for this string
var orders = await connection.QueryAsync<Order>(sql, new { id }, ct);
                                  // Dispose returns it, it is not closed
```

사람들이 놀라는 대목은 풀을 무엇으로 구분하느냐입니다. 한 프로세스 안에서 서로 다른 연결 문자열마다 풀이 하나씩 생기고, 비교는 파싱한 뒤의 문자열로 이루어집니다. 그래서 `Application Name`만 다른 두 문자열, 같은 옵션을 공백만 없애 다시 적은 문자열, 자격 증명이 다른 문자열은 각각 독립된 풀이 되고, 저마다 자기 최솟값과 최댓값과 수명을 가집니다. 통합 인증에서는 신원도 이 열쇠의 일부입니다. 테넌트별 연결 문자열이 테넌트별 풀이 되고, 테넌트 100개가 데이터베이스에서 동시에 감당해야 할 최댓값 100개가 되는 이유입니다. 그러니 실행 중에 연결 문자열을 조립하는 일은 서식 문제가 아니라 풀링에 관한 결정으로 다루는 편이 좋습니다. 풀 자체는 프로세스 안의 공급자에 있고, 그래서 풀의 모든 한도는 프로세스 단위입니다. 서버 쪽 숫자와 견주려면 먼저 인스턴스 수를 곱해야 합니다.

빠져나가는 문이 둘 있는데, 드물게 그리고 의도해서만 씁니다. `SqlConnection.ClearPool`과 `ClearAllPools`는 풀에 든 연결을 무효로 표시해서 다음 `Open`이 새로 만들게 합니다. 장애 전환이나 자격 증명 교체 직후라면 원하는 동작일 때가 있고, 그 밖의 상황에서는 데워 둔 서비스를 차갑게 만드는 방법입니다. 일상적인 재균형은 connection lifetime의 몫입니다. 이 층 위에 있는 것들은 조용히 그대로 물려받습니다. Dapper는 같은 `IDbConnection`에 붙은 확장 메서드이고, EF Core는 자기 작업 앞뒤로 공급자 연결을 열고 닫습니다. 요청 하나만큼 사는 `DbContext`는 실제로 무언가를 실행하는 동안에만 풀의 연결을 쥡니다. `AddDbContextPool`은 이 위에 얹힌, 컨텍스트 객체를 담는 별개의 풀입니다. 연결 문자열에서 `Pooling=false`로 풀링을 끄면 장면의 두 번째 단계가 모든 층에서 한꺼번에 첫 번째 단계로 돌아갑니다.
