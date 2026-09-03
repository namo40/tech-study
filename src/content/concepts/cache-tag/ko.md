---
title: "Cache Tag"
summary: "캐시 태그는 캐시 항목에 붙여 두는 그룹 라벨입니다. 무효화가 키 대신 주제를 부를 수 있게 되어, 상품 42에 관한 전부를 호출 한 번으로 떨어뜨립니다. 키를 나열할 수 없었던 항목까지 함께 떨어집니다."
category: "캐시"
related:
  - label: Cache Invalidation
    slug: cache-invalidation
  - label: Cache Version
    slug: cache-version
  - label: Cache Key
    slug: cache-key
  - label: HybridCache
    slug: hybridcache
  - label: Output Cache
    slug: output-cache
  - label: Cache-Aside
    slug: cache-aside
  - label: Eviction
    slug: eviction
references:
  - title: HybridCache in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid?view=aspnetcore-10.0
  - title: Output caching middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/caching/output?view=aspnetcore-10.0
---

## 언제 쓰나

- 엔터티 하나가 여러 항목에 흩어져 있을 때 씁니다. 상품 하나가 상세 페이로드로도, 목록 페이지 세 곳의 행으로도, 가격 조각으로도, 검색 결과로도 캐시되어 있고, 그 상품을 고치면 다섯 개가 전부 물러나야 합니다. 키로 지워 없애려면 쓰기 시점에 다섯 개의 키를 전부 알아야 하는데 쓰기 경로는 그것을 거의 알지 못합니다. 다섯 개 모두에 `product:42`를 붙여 두면, 그 지식이 항목의 모양이 아직 눈앞에 있는 채움 시점의 라벨로 바뀝니다.
- 페이지와 프래그먼트 캐시에는 거친 무효화가 필요하고, 거기서는 거친 것이 맞는 단위입니다. 캐시된 응답의 키는 경로와 쿼리 문자열과 변화 요인 헤더의 조합이라 키 공간이 조합적으로 불어나고, 아무도 그것을 나열하지 못합니다. 카탈로그 영역의 응답에 `catalog` 태그를 달아 두면 발행 동작이 그 영역에서 만들어 낸 모든 변형에 닿는 손잡이를 하나 얻습니다.
- 항목이 파생물이라 키를 되짚어 낼 수 없을 때 씁니다. 목록과 개수와 상위 N 순위와 집계는 호출자가 준 매개변수로 만들어진 쿼리의 결과입니다. 입력 하나를 바꾸는 쓰기는 어떤 집계가 그 입력을 빨아들였는지 재구성할 방법이 없습니다. 집계를 캐시할 때 붙여 둔 태그가 그 관계를 남긴 유일한 기록입니다.
- 새 키 공간을 만들지 않고 cache-version의 효과만 얻고 싶을 때 고릅니다. 버전 방식은 세대 번호를 키에 넣고 옛 항목이 만료로 사라지기를 기다려 같은 문제를 풉니다. 값이 싸지만 쓰레기가 한동안 남습니다. 태그는 고아로 두는 대신 지워 없애므로, 낡은 항목이 실제 메모리를 차지하거나 읽는 쪽이 옛 값에 아예 닿으면 안 되는 자리에서는 태그를 고릅니다.

## 주의점

- 태그는 구독이 아닙니다. 한 무리의 항목을 한 번에 떨어뜨리는 수단일 뿐이고, 모든 노드가 같은 순간에 받은 이벤트처럼 행동하리라고 기대하면 오해입니다. 제거는 캐시 구현이 자기 방식대로 조율하고 2차 저장소는 자기 일정대로 퍼뜨리므로, 태그가 그 창을 닫아 주었다고 가정하지 말고 두 인스턴스가 아직 어긋나 있을 수 있는 구간을 적어 두는 편이 낫습니다.
- 태그가 넓을수록 웅덩이가 큽니다. 카탈로그 항목 전부에 붙인 `catalog` 같은 태그는 무효화를 손쉽게 옳도록 만들어 주는 대신, 가격 한 줄 수정을 영역 전체의 찬 캐시로 바꿉니다. 그리고 그 결과는 하필 누군가 지켜보고 있는 순간에 데이터베이스로 몰려드는 쇄도로 도착합니다. 쓰기 한 번이 정당하게 부술 수 있는 범위에 맞춰 태그 크기를 정하고, 넓은 태그 옆에 좁은 `product:42`를 함께 두어 흔한 경우가 작은 망치를 쓰게 하세요.
- 분산 캐시에서 태그는 유지 비용을 물립니다. 저장소는 태그에서 항목으로 가는 역방향 대응을 들고 있거나 매번 훑어야 하는데, 이는 채움마다 늘어나는 쓰기이고 축출마다 늘어나는 일입니다. 공유 저장소에서는 그 색인도 공유되므로 수다스러운 태그 설계는 그 인스턴스를 쓰는 모두에게 지연으로 나타납니다. 항목당 태그 몇 개까지는 감당할 만하고, 태그 달기가 자유 서술이 되는 순간부터 감당할 수 없어집니다.
- 절제 없는 태그 달기는 무효화를 다시 예측 불가로 만듭니다. 출발점이었던 그 문제로 돌아가는 셈입니다. 팀마다 제 라벨을 지어내면 항목 하나가 여섯 개를 달고 다니게 되고, 특정 제거가 어디까지 닿는지 아무도 말하지 못하며, 선의로 한 청소가 무관한 기능을 비웁니다. 태그 어휘는 캐시 키 옆에 정의한 닫힌 목록으로 두고, 자유 문자열이 아니라 식별자에서 태그를 만들며, 태그를 하나 늘리는 일은 세부 사항이 아니라 설계 변경으로 다룹니다.

## .NET에서는

- `HybridCache`는 항목에 태그를 받고 태그로 지웁니다. 태그 달기는 항목이 만들어지는 자리에서, 무효화는 쓰기가 일어나는 자리에서 일어납니다.

```csharp
// Tags are declared with the entry, at the moment its shape is known.
var product = await cache.GetOrCreateAsync(
    $"product:{id}",
    id,
    async (key, ct) => await repository.GetProductAsync(key, ct),
    tags: [$"product:{id}", $"catalog:{categoryId}", "catalog"],
    cancellationToken: ct);

// The write path names the subject, not the keys.
await cache.RemoveByTagAsync($"product:{id}", ct);

// The broad tag exists for republishing the whole section. Use it deliberately.
await cache.RemoveByTagAsync("catalog", ct);
```

- 출력 캐시에도 응답을 위한 같은 장치가 있습니다. 엔드포인트에 붙인 `[OutputCache(Tags = ["catalog"])]`가 거기서 만들어진 캐시 변형 전부에 라벨을 달고, 관리 동작이나 메시지 핸들러에서 부르는 `IOutputCacheStore.EvictByTagAsync("catalog", ct)`가 그 전부를 물립니다. 축출하는 코드는 경로도 쿼리 문자열도 알 필요가 없습니다.
- 태그는 키를 만드는 그 자리에서 함께 만듭니다. 도우미가 `product:{id}`를 키로 만든다면 태그도 같은 도우미가 만들게 하세요. 그래야 규칙 이름이 바뀌었을 때 두 철자가 어긋난 채 모든 제거가 조용히 아무 일도 하지 않는 호출이 되어 버리는 일을 막습니다.
- 태그 제거는 요청보다 메시지 핸들러에 두기 좋습니다. 트랜잭션이 커밋된 뒤 도메인 이벤트의 소비자에서 실행하면 되돌려진 쓰기가 캐시를 헛되이 비우는 일이 없고, 모든 인스턴스가 같은 방아쇠를 공유합니다.
