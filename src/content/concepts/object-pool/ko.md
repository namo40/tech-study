---
title: "Object Pool"
summary: "비싼 객체를 모아 두고 새로 만드는 대신 빌려줍니다. 할당을 싸게 만드는 것이 아니라 할당 자체를 없애는 수이고, 수집기가 할 일을 바꾸는 유일한 방법입니다."
category: "컨테이너와 오케스트레이션"
scene: memory-pressure
sceneStep: 4
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: ArrayPool
    slug: arraypool
  - label: Allocation Rate
    slug: allocation-rate
  - label: "Span<T>"
    slug: span-t
  - label: Large Object Heap
    slug: large-object-heap
  - label: Garbage Collection
    slug: garbage-collection
  - label: Memory Limit
    slug: memory-limit
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "ArrayPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
  - title: "Object reuse with ObjectPool in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/objectpool
  - title: "MemoryPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.memorypool-1
---

풀은 이미 만들어 둔 객체 묶음에 대여와 반납을 붙인 것입니다. 하나 달라고 하면 들고 있던 것을 주거나, 남는 것이 없으면 새로 만들어 줍니다. 돌려주면 다음 호출자를 위해 보관합니다. 여기에 영리한 구석은 없고, 이것이 무엇을 사 주는지는 정확히 말할 가치가 있습니다. 더 빠른 할당자가 아니라, 아예 일어나지 않는 할당입니다. 장면의 4단계에서 할당 속도가 60 MB/s에서 15 MB/s로 떨어지는 이유가 정확히 이것이고, 무대의 다른 숫자는 아무도 건드리지 않았는데 따라 내려옵니다.

그 연쇄를 한 번 따라가 볼 만합니다. 애초에 이것을 하는 이유가 거기 있기 때문입니다. 할당되는 바이트가 줄면 수집기의 예산이 천천히 차고, 그러면 수집기가 덜 자주 돕니다. 덜 자주 돌면 한 주기가 길어지고, 길어지면 발견되는 것 중 도달 불가능해질 시간을 번 비율이 늘고, 그러면 어차피 죽었을 것을 승격시키는 대신 한 번에 더 많이 회수합니다. 그래서 힙은 천장보다 한참 아래에 자리를 잡고, 정지는 짧아지고, 게이지는 limit에 붙어 사는 일을 그만둡니다. 변경 하나에 상태 전체가 움직입니다.

가장 크게 차이가 나는 경우는 큰 버퍼입니다. `ArrayPool<T>.Shared`가 대부분의 서비스에 필요한 풀이자, 많은 서비스가 평생 쓰는 유일한 풀인 이유입니다. 85,000바이트 이상은 대형 객체 힙으로 가고, gen2가 수집될 때만 함께 수집되며, 명시적으로 요청하지 않으면 압축되지 않습니다. 그래서 요청마다 큰 배열을 할당하는 작업 부하는 LOH를 다시 쓸 수 없는 구멍으로 조각냅니다. 빌려 쓰면 같은 배열 몇 개를 계속 쓰게 되고 LOH는 처음 크기 그대로 남습니다. `MemoryPool<T>`은 같은 발상을 `IMemoryOwner<T>` 뒤에 둔 것으로, 날 배열 대신 해제 가능한 핸들을 원하는 코드를 위한 것입니다.

풀이 어긋나는 자리는 대여와 반납의 계약이고, 어긋나는 방식은 알아볼 수 있는 세 가지입니다. 반납을 잊는 것은 가벼운 쪽입니다. 풀이 다음번에 새 버퍼를 할당할 뿐이므로 누수는 없지만, 풀을 둔 이유가 사라지고 지표는 조용히 원래 자리로 돌아갑니다. 두 번 반납하거나 반납한 뒤에도 참조를 들고 있는 것은 심각한 쪽입니다. 코드 두 곳이 같은 배열을 자기 것이라고 믿게 되고, 거기서 나오는 버그는 메모리 문제가 아니라 데이터 손상처럼 보입니다. 그리고 빌린 버퍼는 비어 있지 않습니다. 직전 사용자가 남긴 것이 그대로 들어 있으므로, 쓰기 전에 거기서 복사해 가는 코드는 남의 데이터를 읽습니다. 모든 대여를 `try`/`finally`로 감싸고, 내용이 민감했다면 반납할 때 `clearArray: true`를 주고, `finally` 이후로는 참조를 들고 있지 않는 것, 이 셋이 규율의 전부입니다.

객체의 성격이 맞지 않을 때 풀은 상황을 더 나쁘게 만들기도 합니다. 만들기 싼 것은 얻는 것이 없으면서 풀 자체의 동기화 비용만 냅니다. 커넥션이나 트랜잭션이나 요청별 상태를 들고 있는 것은 버그를 얻습니다. 상태를 가진 객체를 풀링하면 다음 호출자가 직전 호출자가 남긴 것을 그대로 물려받기 때문입니다. EF Core의 `DbContext` 풀링이 그냥 `DbContext`를 담은 객체 풀이 아니라 초기화 단계를 포함한 별도의 장치인 이유가 이것입니다. 그리고 큰 버퍼의 풀은 프로세스 메모리의 바닥을 올려 둡니다. 그 바이트는 설계상 계속 상주하며, 그것이 치르는 대가이고, 같은 버퍼가 실제로 재사용될 때만 옳은 거래입니다.

마지막으로, 풀링은 쓰레기를 만들지 않는 여러 방법 중 하나이고 가장 먼저 잡을 도구인 경우는 많지 않습니다. 응답을 버퍼에 담는 대신 흘려보내면 재사용이 아니라 할당 자체가 사라집니다. `Span<T>`과 `Memory<T>`는 파서가 받은 것을 잘라 쓰게 해 주므로 조각을 복사해 낼 필요가 없습니다. `IAsyncEnumerable<T>`은 큰 결과 집합이 리스트로 존재하는 일을 아예 막습니다. 풀링은 버퍼가 정말로 존재해야 하고 정말로 커야 할 때의 답입니다. 존재하지 않아도 된다면 빌리는 것보다 할당하지 않는 편이 낫고, 장면의 4단계는 어느 쪽이든 똑같이 보였을 것입니다.
