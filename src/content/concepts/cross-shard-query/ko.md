---
title: "Cross-Shard Query"
summary: "파티션 키를 싣지 않은 쿼리는 모든 샤드에 물어야 합니다. 질문을 흩뿌리고, 가장 느린 답을 기다리고, 모아서 합칩니다. 그래서 가능할 때는 키로 라우팅하고, 어쩔 수 없을 때는 부채질에 예산을 매기고, 가장 자주 하는 질문은 한 샤드 질문이 되도록 데이터의 모양을 바꿉니다."
category: "데이터 분산과 일관성"
scene: cross-shard-query
steps:
  - title: "키가 없는 질문은 모두에게 물어야 합니다"
    text: "고스트는 모든 쿼리가 모든 샤드로 부챗살처럼 퍼지는 것을 보여 줍니다. 기계 셋이 일하고, 답 하나가 돌아오고, 계량기는 질문마다 세 배로 돕니다. 잘못 설정된 것은 없습니다. 이것은 그저 나뉜 데이터의 요금표입니다. 질문에 파티션 키가 실렸는가가 요금표의 어느 줄을 낼지 정합니다."
  - title: "키가 실린 질문은 한 샤드의 일입니다"
    text: "라우터가 키를 읽고, 그것을 소유한 샤드 하나를 가리키고, 샤드가 셋이든 삼백이든 답의 비용은 같습니다. 샤딩의 흥정 전체가 이것입니다. 뜨거운 질문들이 키를 싣도록 설계하면, 함대는 커져도 답 하나하나는 일대일 대화로 남습니다."
  - title: "정당한 흩어 모으기의 값은 가장 느린 샤드가 정합니다"
    text: "어떤 질문은 정말로 모두의 것입니다. 합계, 검색 같은 것들이요. 라우터가 흩뿌리면 둘은 빨리 답하고, gather 바는 셋째를 기다립니다. 부채질은 쿼리 하나를 자기 꼬리 지연과의 경주로 바꿉니다. 그리고 샤드 하나가 아예 답하지 않으면 미리 골라 둔 쪽을 갑니다. 표시된 불완전 결과를 돌려주거나, 통째로 실패하거나. 침묵만은 설계 없이 둘 수 있는 선택지가 아닙니다."
  - title: "가장 자주 묻는 질문은 한 샤드 질문으로 바꿔 둡니다"
    text: "대시보드가 초마다 원하는 요약은 미리 계산해 view에 두고, 쓰기마다 조금씩 갱신하고, 키로 되읽습니다. 흩어 모으기는 읽기마다 크게가 아니라 쓰기마다 작게 일어납니다. 질문을 바꾼 것이 아닙니다. 질문이 한 샤드에 내려앉도록 데이터의 모양을 바꾼 것입니다. 사본과 약간의 낡음을 지역성과 맞바꾸는 그 거래가 부채질에서 빠져나오는 정직한 길입니다."
related:
  - label: Sharding
    slug: sharding
  - label: Partitioning
    slug: partitioning
  - label: Rebalancing
    slug: rebalancing
  - label: Denormalization
    slug: denormalization
  - label: Tail Latency
    slug: tail-latency
  - label: Materialized View
    slug: materialized-view
  - label: Two-Phase Commit
    slug: two-phase-commit
  - label: Keyset Pagination
    slug: keyset-pagination
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: CAP Theorem
    slug: cap-theorem
references:
  - title: Sharding pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding
  - title: Query an Azure Cosmos DB container
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-query-container
  - title: Materialized View pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view
---

## 언제 쓰나

- **질문에 키가 있으면 언제나 키로 라우팅하고, 뜨거운 경로는 키를 싣도록 설계합니다.** cross-shard query는 켜고 끄는 기능이 아닙니다. 라우터에게 어디를 보면 되는지 알려 줄 그 한 조각이 빠진 채 질문이 도착했을 때 벌어지는 일입니다. 나뉜 저장소에서 쿼리가 느릴 때 가장 먼저 볼 것은 인덱스가 아니라, 조건절에 키가 들어 있기는 했는지입니다.
- **정당한 부채질에는 비싼 엔드포인트로서 예산을 매깁니다.** 검색, 합계, 관리자용 전수 조회, 리포트는 정말로 모든 샤드의 것이고, 아닌 척해 봐야 비용이 덜 보이는 곳으로 옮겨 갈 뿐입니다. 이런 질문에는 전용 경로를 줍니다. 타임아웃을 건 병렬 호출, 리포트 하나가 커넥션 풀을 다 차지하지 못하도록 제한한 동시 실행 수, 그리고 첫 샤드가 조용해지기 전에 정해 둔 불완전 결과 정책입니다.
- **나머지는 데이터의 모양을 바꿉니다.** 키 없는 같은 질문이 초당 수천 번 들어온다면 답은 더 빠른 부채질이 아니라 다른 모양입니다. 쓰기마다 갱신하는 미리 계산된 요약이나, 반대쪽 키로 잡아 둔 조회 테이블의 사본 하나가 그 질문을 키 조회로 바꿉니다. 흩어 모으기는 여전히 일어나지만, 읽기마다 크게가 아니라 쓰기마다 작게 일어납니다.
- **질문이 정말로 드물다면 부채질을 받아들입니다.** 밤마다 모든 샤드를 훑는 정합성 대조는 괜찮습니다. 아픈 것은 요청 경로 위에서, 요청 빈도로 일어나는 부채질입니다. 사용자 한 명의 페이지 조회가 샤드 하나치의 일로 불어나기 때문입니다.
- 파티션 키 선택을 미루는 수단으로는 **쓰지 마세요.** 트래픽 대부분이 부채질을 필요로 한다면 그 워크로드에 키가 맞지 않는 것이고, 모두에게 모든 것을 묻는 설계는 병렬성으로 고쳐지지 않습니다.

## 주의점

- 부채질은 꼬리 지연을 곱합니다. 흩어 모으기는 가장 느린 참가자가 끝나야 끝나므로, 답은 샤드 지연 분포의 가운데가 아니라 꼬리에서 뽑힙니다. 99번째 백분위가 200 ms인 샤드가 열이면 임의의 쿼리가 200 ms를 낼 확률이 대략 10%가 되고, 샤드를 더할수록 그것은 더 확실해집니다. 샤드를 더하는 일은 키 있는 읽기를 싸게 만들고 키 없는 읽기를 더 나쁘게 만듭니다.
- 부채질은 실패 면적도 곱합니다. 부채 안의 샤드 하나하나가 죽거나 느려지거나 재분배 중일 수 있는 대상이고, 전부가 답할 확률은 부채가 넓어질수록 떨어집니다. 샤드 하나가 빠졌을 때 그것이 표시된 불완전 결과인지 통째 실패인지 엔드포인트마다 정하고, 표시된 쪽은 응답에서 눈에 보이게 합니다. 조용히 한 샤드가 빠진 답은 오류보다 나쁩니다. 아무도 들여다보지 않기 때문입니다.
- 합치는 단계가 결과 집합 전체를 라우터로 끌어올 수 있습니다. 상한이 붙은 `ORDER BY`, `DISTINCT`, 상위 N은 라우터가 모든 샤드의 행을 메모리에 들고 계산한다는 것을 알아채기 전까지는 싸 보입니다. 상한과 정렬을 각 샤드로 내려보내고, 샤드마다 `limit`개의 행만 요청해서 스트림을 합칩니다. 그러면 끝이 없던 모으기가 경계 있는 모으기가 됩니다.
- 샤드를 가로지르는 페이지 넘김에는 전역 `OFFSET`이 아니라 샤드별 커서가 필요합니다. 합쳐진 결과에 오프셋을 매기면 페이지마다 그 앞의 모든 것을 모든 샤드에서 다시 읽고 다시 합치게 됩니다. 커서를 샤드마다 하나씩 두고, 소비한 쪽만 전진시키고, 그 전부를 담은 불투명한 토큰을 호출자에게 넘깁니다.
- 샤드를 가로지르는 트랜잭션은 다른 패턴입니다. 부채질은 읽기 전용으로 둡니다. 흩어 모으기가 쓰기까지 하는 순간 two-phase commit이나 saga의 영역으로 들어갑니다. 락이 기계를 건너 유지되고, 조정자가 prepare와 commit 사이에서 죽을 수 있습니다.
- 흩뿌린 횟수를 셉니다. 키 없는 쿼리와 키 있는 쿼리의 비율은 파티션 키의 건강 지표이고, 그 비율은 흘러갑니다. 누가 필터를 하나 더하고, 누가 화면을 하나 더하고, 일 년 뒤에는 트래픽의 절반이 부채질입니다. 계측하고, 경보를 걸고, 올라가는 흩뿌림 비율은 제품이 하는 질문과 데이터를 자른 키가 서로 멀어졌다는 신호로 다룹니다.

## .NET에서는

기계 장치는 평범한 `Task.WhenAll`이고, 규율은 취소 토큰과 결과의 모양에 있습니다.

```csharp
// 샤드마다 하나씩이 아니라 모으기 전체에 하나의 타임아웃을 겁니다. 호출자가
// 기다리는 것은 가장 느린 답이므로, 그것이 의미 있는 마감입니다.
public async Task<Totals> TotalAsync(IReadOnlyList<Shard> shards, CancellationToken ct)
{
    using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
    budget.CancelAfter(TimeSpan.FromMilliseconds(250));

    var calls = shards.Select(async shard =>
    {
        try
        {
            return (shard.Id, Value: await shard.SumAsync(budget.Token), Ok: true);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // 이 샤드는 예산을 놓쳤습니다. 아직 오류는 아니고,
            // 호출자에게 알려 주어야 할 구멍입니다.
            return (shard.Id, Value: 0m, Ok: false);
        }
    });

    var results = await Task.WhenAll(calls);
    var missing = results.Where(r => !r.Ok).Select(r => r.Id).ToArray();
    return new Totals(results.Sum(r => r.Value), missing);
}
```

반환 타입이 요점입니다. `Totals`는 어느 샤드가 빠졌는지를 들고 다니므로, 호출자도 응답 본문도 모자란 합계를 사실인 양 내놓는 대신 불완전하다고 말할 수 있습니다. 여기서 맨 `decimal`을 반환하는 메서드는 답을 정직하게 만들어 준 유일한 정보를 버린 것입니다.

부채가 넓어지면 동시 실행 수를 묶습니다. `MaxDegreeOfParallelism`을 준 `Parallel.ForEachAsync`는 샤드 예순넷을 훑는 일이 커넥션 예순넷을 한꺼번에 여는 것을 막고, `System.Threading.Channels`는 각 샤드가 자기 행을 하나의 합치기로 흘려보내게 해서 라우터가 모든 결과 집합을 실체화하지 않도록 합니다.

```csharp
// 샤드마다 이미 정렬된 `take`개의 행만 요청합니다. 그러면 합치기는 전부가
// 아니라 최대 `take * shards`개의 행만 메모리에 두면 됩니다.
await Parallel.ForEachAsync(shards, new ParallelOptions
{
    MaxDegreeOfParallelism = 8,
    CancellationToken = ct,
}, async (shard, token) =>
{
    await foreach (var row in shard.TopAsync(take, token))
        await writer.WriteAsync(row, token);
});
```

Cosmos DB에서는 같은 구분이 플래그 하나입니다. 조건절에 파티션 키가 들어 있는 쿼리는 물리 파티션 하나가 답하고, 없는 쿼리는 파티션을 가로지르는 쿼리가 되며, SDK는 허용해 주어야만 그것을 실행합니다.

```csharp
// 키 있는 쿼리: 파티션 하나, 요금 한 번.
var keyed = container.GetItemQueryIterator<Order>(
    new QueryDefinition("SELECT * FROM c WHERE c.customerId = @id").WithParameter("@id", id),
    requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(id) });
```

`PartitionKey`를 비워 두면 모든 물리 파티션으로 퍼지는 부채질이 되고, 요청 요금은 돌아온 행 수가 아니라 파티션 수를 따라 커집니다. `QueryRequestOptions.MaxConcurrency`와 `MaxItemCount`가 그것을 묶어 주지만, 파티션을 가로지르는 쿼리를 조용히, 어디서나 켜 두는 것이 냄새입니다. 비싼 쿼리를 코드 리뷰에서 싼 쿼리처럼 보이게 만들기 때문입니다.

네 번째 단계의 기계 장치는 change feed나 outbox가 요약 문서를 몰아가는 것이고, 그 문서는 질문이 던져지는 방식대로 키가 잡혀 있습니다.

```csharp
// 주문에 대한 모든 쓰기가 고객의 누적 요약을 갱신합니다. 예전에 흩뿌리던
// 읽기가 이제 문서 하나의 지점 조회가 됩니다.
processor = container
    .GetChangeFeedProcessorBuilder<Order>("summaries", async (changes, token) =>
    {
        foreach (var order in changes)
            await summaries.PatchItemAsync<Summary>(
                id: order.CustomerId,
                partitionKey: new PartitionKey(order.CustomerId),
                patchOperations: new[] { PatchOperation.Increment("/total", order.Amount) },
                cancellationToken: token);
    })
    .WithInstanceName(instance)
    .WithLeaseContainer(leases)
    .Build();
```

요약은 사본이므로 쓰기와 갱신 사이에는 낡아 있고, 갱신을 한 번이라도 놓치면 틀립니다. 둘 다 감당할 수 있습니다. change feed는 최소 한 번 전달을 보장하고, 증분이 두 번 적용되는 것은 요약에 버전이나 처리 표시를 달아 고치는 버그입니다. 그 대가로 얻는 것은, 원래대로라면 가진 모든 기계에 물어봐야 했을 저장소에서 제품이 가장 자주 하는 질문에 키 조회 한 번으로 답하는 능력입니다.
