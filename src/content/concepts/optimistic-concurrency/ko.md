---
title: "Optimistic Concurrency"
summary: "낙관적 동시성은 락을 쥐지 않습니다. 행을 버전과 함께 읽고, 일을 한 뒤, 버전이 그대로일 때만 씁니다. 충돌은 저장 시점에 드러나고, 작업 단위 전체를 다시 실행합니다."
category: "트랜잭션과 동시성"
scene: deadlock
sceneStep: 4
related:
  - label: Deadlock
    slug: deadlock
  - label: Lost Update
    slug: lost-update
  - label: Pessimistic Concurrency
    slug: pessimistic-concurrency
  - label: Row Version
    slug: row-version
  - label: Concurrency Token
    slug: concurrency-token
  - label: Retry
    slug: retry
references:
  - title: Handling concurrency conflicts (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/concurrency
  - title: rowversion (Transact-SQL)
    url: https://learn.microsoft.com/en-us/sql/t-sql/data-types/rowversion-transact-sql
---

방법은 컬럼 하나와 조건절 하나가 전부입니다. 행이 버전을 하나 달고 있고 데이터베이스가 쓸 때마다 그 값을 바꿉니다. 애플리케이션은 데이터와 함께 그 버전을 읽어 두었다가, 갱신할 때 `WHERE Id = @id AND RowVersion = @versionIRead`라고 씁니다. 그사이 다른 쪽이 그 행을 썼다면 버전이 달라져 있어서 `WHERE`에 걸리는 행이 없고, 영향받은 행 수가 0이 됩니다. 그 0이 충돌 신호이고, 충돌이 없을 때는 아무 비용도 들지 않습니다.

이 방식이 값어치를 하는 곳은 읽기와 쓰기 사이의 시간입니다. 사용자가 편집 화면을 열고 2분을 고민한 뒤 저장을 누른다고 해 봅시다. 비관적 락이라면 행 하나에 배타 락을 2분 동안 걸어 두는 것이고, 많은 구성에서는 빌린 연결도 2분 동안 붙들고 있는 것입니다. 버전 검사라면 쥐고 있는 것이 없습니다. 읽는 요청과 쓰는 요청은 서로 분리되어 짧게 끝나고, 세상이 바뀌었는지는 두 번째 요청이 저장 시점에 알게 됩니다.

충돌 처리는 잡아서 넘기는 코드가 아니라 설계해야 할 부분입니다. 현재 행을 다시 읽고, 이 필드에서 "다시 적용"이 무엇을 뜻하는지 정한 뒤, 한 번 더 시도합니다. 잔액이라면 다시 적용은 방금 읽어 온 값에서 새로 계산하는 것이지, 낡은 값으로 계산해 둔 합계를 그대로 쓰는 것이 아닙니다. 사용자가 편집한 문서라면 무엇이 바뀌었는지 보여 주고 물어보는 것이 다시 적용일 수도 있습니다. 재시도는 작업 단위 전체를 다시 실행해야 합니다. 실패한 저장은 아무것도 남기지 않았기 때문입니다.

EF Core에서 버전은 concurrency token이고, `byte[]`에 `[Timestamp]`를 붙이면 데이터베이스가 직접 관리하는 SQL Server `rowversion`에 매핑됩니다. 저장이 실패하면 `DbUpdateConcurrencyException`이 나고, 여기에 진 항목들이 담겨 옵니다.

```csharp
public sealed class Account
{
    public int Id { get; set; }
    public decimal Balance { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}

for (var attempt = 0; attempt < 3; attempt++)
{
    var account = await db.Accounts.FindAsync([id], ct);
    account!.Balance += delta;
    try
    {
        await db.SaveChangesAsync(ct);
        break;
    }
    catch (DbUpdateConcurrencyException ex)
    {
        // Reload the current row, then let the loop reapply `delta` to it.
        await ex.Entries.Single().ReloadAsync(ct);
        db.ChangeTracker.Clear();
    }
}
```

만능은 아닙니다. 낙관적 동시성은 행 하나를 경쟁하는 쓰기로부터 지켜 줄 뿐, 두 행을 서로 맞춰 주지는 않고, 충돌이 갱신이 아니라 삽입일 때는 도움이 되지 않습니다. 충돌이 이따금이 아니라 늘 일어난다면 재시도 자체가 비용이 되므로, 짧은 비관적 락이 더 쌉니다.
