---
title: "DataLoader"
summary: "DataLoader는 한 요청 안에 흩어져 일어나는 개별 조회를 모아 한 번에 가져오고, 그 답을 요청이 끝날 때까지 기억합니다. GraphQL 리졸버 그래프가 구조적으로 만들어 내는 N+1의 표준 처방입니다."
category: "API와 실시간 통신"
related:
  - label: N+1 Query
    slug: n-plus-1-query
  - label: Batching
    slug: batching
  - label: Entity Framework Core
    slug: entity-framework-core
  - label: Cache-Aside
    slug: cache-aside
  - label: REST
    slug: rest
  - label: gRPC
    slug: grpc
references:
  - title: DataLoader
    url: https://chillicream.com/docs/hotchocolate/fetching-data/batching/dataloader
  - title: graphql/dataloader
    url: https://github.com/graphql/dataloader
---

## 언제 쓰나

- 실행 모델이 조회를 필드 단위로 흩뿌릴 때 씁니다. GraphQL이 하는 일이 정확히 그것입니다. 리졸버는 노드 하나만 맡고 형제 노드는 알지 못하므로, 주문 상품 줄 50개를 돌려주는 쿼리는 상품 리졸버를 50번 실행하고 그 실행 하나하나는 올바르고 고립된 한 행짜리 조회입니다. 그 코드에는 잘못된 것이 없고, 합계는 여전히 왕복 50번입니다. DataLoader는 리졸버마다 하나씩 묻는 방식을 그대로 두면서 전송 계층에는 50개짜리 요청 하나만 보이게 하는 조각입니다.
- 읽기 계층이 목록 위로 퍼지고 항목마다 같은 종류의 부모나 자식이 필요할 때 씁니다. 이 모양은 GraphQL만의 것이 아닙니다. 여러 서비스에서 화면 하나를 조립하는 엔드포인트, 조회 표로 행을 꾸미는 파생 뷰, 컬렉션 위를 돌면서 안에서 저장소를 부르는 코드라면 무엇이든 같은 모양이고 처방도 같습니다.
- 한 요청 안에서 같은 키를 여러 번 물을 때 씁니다. 같은 상품을 가리키는 주문 줄 열 개는 똑같은 조회 열 번을 만들어 내는데, 로더의 요청 수명 기억은 그것을 가져오기 한 번과 메모리 읽기 아홉 번으로 바꿉니다. 누군가 중복을 알아차리거나 요청 첫머리에서 사전을 손으로 만들 필요가 없습니다.

## 주의점

- 이 캐시는 요청 범위이고 공유 캐시가 아닙니다. 한 번의 실행이 같은 것을 두 번 묻지 않게 하려고 존재하며 응답이 쓰이는 순간 사라지는데, 안전한 이유가 바로 그것입니다. 읽어 온 트랜잭션보다 오래 사는 것이 없으니 무효화 문제 자체가 없습니다. 요청과 요청 사이의 데이터베이스 부하를 덜자고 여기에 손을 뻗지 않습니다. 그것은 만료와 무효화 질문이 함께 딸려 오는 cache-aside의 일이고, 캐싱을 더 얻겠다고 로더를 싱글턴으로 등록하는 순간 안전하던 도우미가 낡은 값을 테넌트 너머로 흘리는 물건이 됩니다.
- 배치는 실행 틱에서 모이고, 그것은 시간이 아니라 실제 경계입니다. 엔진이 현재 수준을 풀어내는 동안 모인 키들이 함께 보내집니다. 그 발송 뒤에 나온 조회나 다른 무언가를 기다리는 `await` 뒤에 숨어 있던 조회는 다음 묶음이나 자기 혼자만의 묶음으로 떨어집니다. 소스에서 나란히 보이는 호출 두 개가 때때로 쿼리 두 개를 만드는 이유가 이것이고, 수집 창이 어디에서 닫히는지 아는 것이 디버깅과 짐작을 가릅니다.
- 키 목록이 커지면 그것을 옮겨 담는 무엇이든 그 한도에 부딪힙니다. `IN` 절에는 매개변수 상한이 있고, 계획 캐시는 서로 다른 목록 길이마다 항목 하나씩으로 채워지며, 키 만 개짜리 묶음은 아무도 구체화하고 싶지 않았던 결과 집합을 돌려줍니다. 묶음 크기에 상한을 두고 로더가 요청을 여러 번 내게 합니다. batching 쪽이 설명하는 그 규율 그대로입니다. 그리고 지나치게 큰 묶음 하나가 실패하면 그것을 기다리던 호출자 전부가 함께 실패한다는 점도 기억해 둘 만합니다.
- 읽기 쪽 도구일 뿐입니다. 쓰기에는 순서와 트랜잭션, 그리고 같은 요청을 두 번 보냈을 때 결과가 달라지는 문제가 따라붙는데, 조회를 합쳐 주는 장치는 그중 무엇도 다루지 않습니다. 게다가 결과를 요청 동안 기억해 두는 일은 그 결과를 바꾸는 변경 앞에서 적극적으로 틀립니다. 같은 요청 안에서 변경이 일어난다면, 영향을 받은 엔티티의 로더가 쓰기 이전 값을 아직 들고 있지는 않은지 확인합니다.

## .NET에서는

- Hot Chocolate은 배치 메서드에서 로더를 생성해 줍니다. 우리는 모인 키를 받고 사전을 돌려주며, 리졸버는 여전히 정확히 하나만 묻습니다.

```csharp
internal static class ProductDataLoaders
{
    // 틱마다 호출 한 번, 그 틱에서 리졸버들이 물어본 키를 모두 담아서.
    [DataLoader]
    internal static async Task<Dictionary<int, Product>> GetProductByIdAsync(
        IReadOnlyList<int> ids,
        ShopDbContext db,
        CancellationToken ct) =>
        await db.Products
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);
}

// 리졸버는 줄 하나와 상품 하나만 압니다. 묶는 일은 리졸버가 걱정할 문제가 아닙니다.
public async Task<Product?> GetProductAsync(
    [Parent] OrderLine line,
    IProductByIdDataLoader productById,
    CancellationToken ct) =>
    await productById.LoadAsync(line.ProductId, ct);
```

- `Where(p => ids.Contains(p.Id))`가 키 목록을 `IN` 쿼리 하나로 바꾸는 EF Core 쪽 모양이고, 요청과 같은 타입을 키로 삼는 사전을 돌려주는 것이 로더가 기다리는 호출자마다 제 행을 건네줄 수 있게 하는 부분입니다. 행이 없는 키는 그냥 항목이 없을 뿐이고, 로더는 그것을 오류가 아니라 `null`로 보고합니다.
- 일대다 쪽 쌍둥이는 그룹 로더입니다. 키 하나가 행 하나가 아니라 목록에 대응하는 자리에서는 배치 메서드가 사전 대신 조회 그룹을 돌려주고, 호출하는 쪽을 하나도 바꾸지 않은 채 이 주문들 각각의 줄이라는 질문을 덮어 줍니다.
- 로더는 요청마다 등록합니다. Hot Chocolate 통합이 대신해 주는 일이기도 합니다. 배치 메서드는 자기만의 서비스 스코프도 받으므로, 위의 `ShopDbContext`는 리졸버들이 쓰는 인스턴스가 아닙니다. 스코프 수명이고 일부러 스레드 안전하지 않게 만들어진 `DbContext`를 여기에 주입해도 안전한 이유가 그것이고, 바깥에서 컨텍스트를 넘겨 주면 잃는 것도 그것입니다. REST나 gRPC 조립 계층을 위해 같은 패턴을 손으로 쓴다면 수명도 같게 유지합니다. 사전 하나와 배치 채널 하나를 든 범위 지정 서비스가 요청과 함께 해제되는 것, 그것이 패턴의 전부입니다.
