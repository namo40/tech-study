---
title: "Pagination"
summary: "페이지네이션은 큰 결과를 조각으로 나눠 건넵니다. offset은 맨 위에서부터 세기 때문에 행이 움직이면 어긋나고, cursor는 실제로 본 행을 기억해서 깊이와 상관없이 안정적이고 싸지만 앞으로만 갈 수 있습니다. 결국 목록이 무엇을 약속하느냐의 문제입니다."
category: ".NET 데이터 접근"
scene: pagination
steps:
  - title: "테이블 전체가 필요한 사람은 없고, 그것을 담을 휴대폰도 없습니다"
    text: "쿼리 하나가 5만 행을 돌려주면 페이로드가 부풀고 메모리가 붓는데, 사용자는 스무 줄을 읽습니다. 페이지네이션은 모든 목록이 맺는 거래입니다. 조각으로 건네고, 위치를 기억하고, 요청이 오면 다음 조각을 줍니다. 진짜 질문은 하나뿐입니다. 위치를 어떻게 기억하는가."
  - title: "offset은 맨 위에서부터 셉니다. 그런데 맨 위가 움직입니다"
    text: "\"3페이지\"는 \"40행을 건너뛰라\"는 뜻이라서 데이터베이스는 건너뛰는 것들을 전부 지나가며 걷고, 깊은 페이지일수록 느려집니다. 더 나쁜 것은 읽는 사이에 삽입된 행 하나가 그 뒤의 모든 위치를 밀어낸다는 점입니다. 4페이지가 3페이지에서 본 것을 반복하거나, 아무도 못 본 행을 건너뜁니다. 책갈피는 숫자였는데 책이 바뀌었습니다."
  - title: "cursor는 개수가 아니라 행을 기억합니다"
    text: "\"키 40 다음\"은 인덱스로 그 위치에 곧장 시크해서 다음 스무 행을 읽습니다. 2페이지든 2000페이지든 비용이 같습니다. 위쪽에 행이 삽입돼도 달라지는 것이 없습니다. 책갈피가 실제로 본 그 행이기 때문입니다. 대가는 이것입니다. 다음으로는 갈 수 있지만 57페이지로 건너뛸 수는 없습니다. cursor는 주소가 아니라 자리입니다."
  - title: "목록이 하는 약속을 보고 고릅니다"
    text: "끝없이 이어지는 피드는 건너뛰지 않으니 언제나 cursor입니다. 페이지 번호가 달린 관리 화면은 임의 접근을 약속하니 offset이고, 드리프트를 감수하고 깊이에 상한을 둡니다. API는 cursor를 불투명한 토큰으로 돌려주어 형식을 바꿀 자유를 남깁니다. 무엇을 고르든 정렬 키는 유일해야 합니다. 그러지 않으면 경계의 행들이 거짓말을 합니다."
related:
  - label: Offset Pagination
    slug: offset-pagination
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: Cursor Pagination
    slug: cursor-pagination
  - label: Database Index
    slug: database-index
  - label: Query Plan
    slug: query-plan
  - label: Prepared Statement
    slug: prepared-statement
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Materialized View
    slug: materialized-view
  - label: Batching
    slug: batching
  - label: Backpressure
    slug: backpressure
references:
  - title: Pagination (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/querying/pagination
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
  - title: Pagination in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/cosmos-db/query/pagination
---

## 언제 쓰나

- API나 화면이 돌려주는 모든 목록에 씁니다. 질문은 페이지를 나눌지가 아니라 어떻게 나눌지입니다. "전부 돌려준다"도 하나의 선택이고, 가장 먼저 그리고 가장 크게 무너지는 선택이기 때문입니다.
- 작고 천천히 변하는 집합에 페이지 번호를 붙일 때는 offset이 맞습니다. 관리 화면의 표, 설정 목록, 몇천 행짜리 보고서가 그렇습니다. 독자는 7페이지를 원하고, 테이블은 세는 비용이 아플 만큼 깊어지지 않습니다.
- 피드, 무한 스크롤, 동기화 엔드포인트, 내보내기, 살아 있는 테이블을 훑는 배치 작업처럼 깊거나 빠르게 변하는 곳에는 cursor를 씁니다. 아래에서 쓰기가 일어나는 동안에도 버티는 주소 체계는 이것뿐입니다.
- URL을 공개하기 전에 정합니다. 페이지 매개변수는 공개 계약의 일부라서, 나중에 `?page=3`을 `?after=...`로 바꾸면 그 값을 저장해 둔 모든 호출자가 깨집니다.

## 주의점

- `OFFSET`은 건너뛰는 행을 하나도 빠짐없이 걸어서 지나갑니다. 건너뛰기는 공짜도 아니고 게으르지도 않습니다. 주어진 순서에서 5001번째 행이 어느 것인지 알려면 5천 행을 만들어 내고 전부 버려야 합니다. 깊은 offset은 페이지의 옷을 입은 전체 스캔이므로 깊이에 상한을 두고, 그 상한은 느린 성공이 아니라 명시적인 오류로 처리하세요.
- 활발한 테이블에서 드리프트는 예외 상황이 아니라 기본 상태입니다. "이 앞에 행이 몇 개 있느냐"로 행을 가리키는 체계는 무언가 쓰이는 순간부터 불안정하고, 살아 있는 데이터를 훑는 내보내기 작업에서 가장 세게 물립니다.
- cursor의 정렬 키는 유일하고 변하지 않아야 합니다. 유일하지 않으면 같은 경계를 두 번 요청해도 다른 행이 나올 수 있으니, 기본 키로 동점을 깨고 두 값을 묶어 정렬합니다. 변한다면 값이 바뀐 행이 cursor 아래에서 빠져나가 다시 보이거나 사라집니다.
- cursor는 원래 키가 아니라 불투명한 토큰으로 돌려줍니다. 인코딩된 토큰이면 안에 든 것을 나중에 바꿀 자유가 남고, 호출자가 위치를 위조하거나 남의 식별자를 URL에서 읽어 가는 일도 막힙니다.
- "N / M 페이지"를 위한 `COUNT(*)`가 정작 그 페이지보다 비쌀 수 있습니다. 독자에게 총 개수가 정말 필요한지 먼저 따져 보세요. 어림수, "더 보기" 버튼, 그냥 "다음" 하나가 대개 더 싸면서도 정직합니다.
- `updated_at` 같은 변하는 칼럼으로 만든 cursor는 그 칼럼의 불안정함을 그대로 물려받습니다. 최소한 기본 키와 함께 묶고, 되도록 아무도 갱신하지 않는 칼럼을 고릅니다.

## .NET에서는

```csharp
// Offset: 얕을 때는 괜찮고 깊어지면 함정입니다. EF Core는 Skip/Take를
// OFFSET … FETCH NEXT로 옮기고, 건너뛴 값은 데이터베이스가 냅니다.
var page = await db.Orders
    .AsNoTracking()
    .OrderBy(o => o.Id)
    .Skip((pageNumber - 1) * PageSize)
    .Take(PageSize)
    .ToListAsync(ct);

// Keyset: 같은 인덱스를, 호출자가 실제로 마지막으로 본 행에서 들어갑니다.
// 깊이가 얼마든 비용은 페이지 하나입니다.
var next = await db.Orders
    .AsNoTracking()
    .Where(o => o.Id > afterId)
    .OrderBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);

// 유일하지 않은 정렬 칼럼에는 키를 함께 붙입니다. 튜플 비교로 쓰면
// OR가 줄줄이 이어지는 대신 시크 한 번으로 남습니다.
var byDate = await db.Orders
    .AsNoTracking()
    .Where(o => ValueTuple.Create(o.CreatedAt, o.Id)
        > ValueTuple.Create(afterCreatedAt, afterId))
    .OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
    .Take(PageSize)
    .ToListAsync(ct);
```

정렬과 인덱스는 발을 맞춰야 합니다. `(CreatedAt, Id)`로 정렬하는 쿼리에는 `(CreatedAt, Id)` 인덱스가 필요하고, 그러지 않으면 시크로 적은 것이 피하려던 정렬로 되돌아갑니다. 호출자에게는 키 자체가 아니라 토큰을 건네고 들어올 때 다시 읽습니다.

```csharp
static string Encode(DateTime at, int id) =>
    WebEncoders.Base64UrlEncode(
        JsonSerializer.SerializeToUtf8Bytes(new Cursor(at, id)));

// 페이지보다 한 행 더 달라고 합니다. 그 한 행이 오면 다음 페이지가 있다는
// 뜻이고, 두 번째 쿼리도 COUNT(*)도 없이 그것을 알아냅니다.
var rows = await query.Take(PageSize + 1).ToListAsync(ct);
var hasMore = rows.Count > PageSize;
var items = rows.Take(PageSize).ToList();
```

`optionsBuilder.LogTo(Console.WriteLine, LogLevel.Information)`으로 쿼리 로그를 켜고 데이터베이스가 실제로 무엇을 요청받았는지 읽어 보세요. 깊은 `Skip`은 실행 계획에 그것의 정체인 스캔으로 드러납니다. 그것은 바라는 것이 아니라 확인할 수 있는 사실입니다.
