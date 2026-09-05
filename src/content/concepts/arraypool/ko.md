---
title: "ArrayPool"
summary: "ArrayPool<T>는 새 배열을 할당하는 대신 이미 있는 배열을 빌려줍니다. 요청마다 버퍼가 필요한 핫 패스가 gen0과 large object heap을 채우지 않게 됩니다. 빌리고, 쓰고, 반드시 돌려줘야 하는데 어긋나는 곳은 늘 마지막입니다."
category: "성능과 최적화"
scene: garbage-collection
sceneStep: 3
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: "Span<T>"
    slug: span-t
  - label: Object Pool
    slug: object-pool
  - label: Memory Pressure
    slug: memory-pressure
  - label: Tail Latency
    slug: tail-latency
references:
  - title: "ArrayPool<T> class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
  - title: Memory and spans
    url: https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/
---

요청마다 버퍼 하나는 서비스가 하는 가장 평범한 할당이면서 가장 비싼 축에 듭니다. 초당 천 건이면 64KB 읽기 버퍼는 초당 64MB의 쓰레기입니다. gen0을 몇 번이고 채우고도 남고, 버퍼가 85,000바이트 이상이면 large object heap을 갈아 치우며 전체 수집까지 부릅니다. `ArrayPool<T>`은 할당을 더 싸게 만드는 것이 아니라 없앱니다. 배열은 한 번 만들어져 나갔다가 돌아오고, 다시 나갑니다.

`Rent`에서 처음에 놀라는 지점이 둘 있는데, 둘 다 이 풀이 정확한 배열을 쌓아 둔 창고가 아니라 크기 구간의 모음이라는 데서 나옵니다. 돌려받는 배열은 요청한 길이 이상이고 대개는 더 깁니다. 그래서 `buffer.Length`는 실제 길이가 아니고, 실제로 채운 개수를 따로 들고 다녀야 합니다. 그리고 내용물은 앞서 빌린 쪽이 남긴 그대로입니다. 빌릴 때마다 지우면 풀이 없애려던 비용을 도로 얹는 셈이기 때문입니다. `Rent(64 * 1024)`로 빌리고 `n`바이트를 읽었다면, 배열 전체가 아니라 앞의 `n`바이트만 다룹니다.

반납은 선택 사항이 아니고, 설계로 막아야 할 실패 방식입니다. 돌려주지 않은 버퍼는 보통 말하는 누수는 아닙니다. 수집기가 결국 회수합니다. 하지만 풀은 그 배열을 잃고 대신할 배열을 할당하므로, 풀은 조용히 도움을 멈추고 풀링의 비용만 남은 채 이득은 사라집니다. 그래서 빌리기와 돌려주기는 같은 메서드 안에 있어야 하고 반납은 `finally`에 둡니다. 버퍼가 밖으로 새어 나가서도 안 됩니다. 빌린 배열을 어딘가에 저장하는 쪽에 넘기지 말고, 빌린 메서드에서 그 배열 위의 `Span`을 돌려주지도 않습니다.

```csharp
byte[] buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);   // 최소 64 KB, 더 클 수도 있습니다
try
{
    int read = await stream.ReadAsync(buffer.AsMemory(0, 64 * 1024), ct);
    Process(buffer.AsSpan(0, read));       // 채워진 부분만
}
finally
{
    // clearArray: true는 다음에 빌리는 쪽이 봐서는 안 될 내용이 담겼을 때
    ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
}
```

거의 모든 경우에는 `ArrayPool<T>.Shared`로 충분합니다. 스레드 안전하고, 공유 구간들 앞에 스레드별 작은 캐시를 두며, 얼마나 붙들고 있을지에 상한이 있어서 한가한 서비스가 배열을 영영 쥐고 있지 않습니다. `ArrayPool<T>.Create`로 자기 풀을 만드는 것은 최대 길이나 구간당 배열 개수를 다르게 잡아야 할 때, 그리고 공유 풀이 문제라는 측정치가 있을 때뿐입니다.

정직하게 쓰려면 작은 규칙 둘이 더 있습니다. 다음에 빌리는 쪽이 봐서는 안 될 내용이 담겼던 배열은 `clearArray: true`로 돌려줍니다. 풀은 그 바이트를 그대로 다른 누군가에게 건넵니다. 그리고 콜드 패스의 작고 짧게 사는 버퍼에는 풀을 꺼내지 않습니다. gen0 수집은 이미 거의 공짜이고, 빌리고 돌려주는 절차는 런타임에서 아끼는 것보다 코드에서 치르는 값이 큽니다. 풀이 자기 복잡함의 값을 하는 곳은 핫 패스, 그리고 크기가 문제가 될 만한 버퍼입니다.
