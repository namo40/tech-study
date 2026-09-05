---
title: "Backpressure"
summary: "백프레셔는 생산자의 속도를 소비자의 속도에 묶습니다. 둘 사이의 유한한 버퍼가 차오르면 되밀어 내어 유입을 늦춥니다. 큐는 시간을 벌 뿐이고, 더 큰 큐는 더 긴 거짓말이기 때문입니다."
category: "복원력과 장애 대응"
scene: backpressure
steps:
  - title: "균형일 때 큐는 거의 비어 있습니다"
    text: "생산자는 소비자가 비워 내는 속도로 보내고, 버퍼에는 잠깐의 일감이 머물 뿐 밀린 일이 쌓이지 않습니다. 0 근처의 깊이가 건강한 모습입니다."
  - title: "큐는 폭주를 흡수합니다. 잠시 동안만은"
    text: "유입이 3배가 되어도 소비자는 제 속도를 지키고, 하류는 폭주를 느끼지 못합니다. 그러나 큐는 시간을 벌 뿐입니다. 유입이 배출을 넘는 동안 깊이는 자라기만 하고, 모든 항목의 대기도 함께 자랍니다."
  - title: "가득 찬 버퍼는 되밀어 냅니다"
    text: "유한한 큐는 시치미를 떼지 않습니다. 가득 차면 생산자가 기다립니다. 그 기다림이 상류로 번져 admits 한도가 내려가고 떠 있는 항목이 줄어, 유입은 해낼 수 있는 만큼에 맞춰집니다. 백프레셔는 시스템이 스스로에게 진실을 말하는 방식입니다."
  - title: "아니면 배수구를 넓힙니다"
    text: "소비자가 묶어서 처리합니다. 작은 항목 여럿이 한 번에 오갑니다. 배출이 두 배가 되고, 같은 속도의 폭주가 다시 와도 깊이는 거의 움직이지 않습니다. 고칠 것은 버퍼가 아니라 속도입니다. 더 큰 큐는 더 긴 거짓말일 뿐입니다."
related:
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Spike Test
    slug: spike-test
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

## 언제 쓰나

- 생산자와 소비자가 만나는 모든 이음매입니다. 프로세스 안이든 서비스 사이든 마찬가지입니다. 수집 파이프라인, 로그 전송기, 메시지 펌프, 채널 기반 워커, 브로커에서 읽어 오는 `IHostedService`처럼 한쪽이 더 느린 쪽에 일감을 건네는 곳이라면 이음매가 있고, 남은 질문은 거기에 한계가 있느냐뿐입니다.
- "큐를 하나 붙였다"가 해결책이었던 모든 자리입니다. 큐는 충격 흡수 장치이지 용량 계획이 아닙니다. 가득 찼을 때 어떻게 되는지 아무도 말하지 못한다면, 답은 다른 무언가가 무너질 때까지 자란다는 것이고, 큐는 빠르고 분명한 고장을 느리고 알쏭달쏭한 고장으로 바꿔 놓은 셈입니다.
- 받아 주는 것보다 지연이 더 중요할 때입니다. 유한한 버퍼는 대기 시간도 유한하게 만듭니다. 깊이 곱하기 처리 시간이 최악의 경우이고, 그 숫자를 대시보드에 적을 수 있습니다. 무한한 버퍼는 적을 숫자를 주지 않습니다.
- 진짜 출처가 있는 엣지입니다. 백프레셔는 일감을 만들어 내는 쪽까지 닿아야 효과가 있습니다. 프로세스 안에서는 막히는 쓰기이고, 네트워크 너머로는 429, 503, `Retry-After`, 또는 흐름 제어가 규약에 들어 있는 프로토콜입니다.
- 대안이 버리는 것일 때입니다. 기다리는 쪽이 틀리고 버리는 쪽이 맞을 때도 있습니다. 지표 파이프라인은 자기가 재는 애플리케이션을 멈춰 세우느니 표본을 버려야 합니다. 둘 다 고르는 정책이고, 잘못은 어느 쪽도 정하지 않는 것입니다. 무한 큐가 바로 그 상태입니다.

## 주의점

- 무한한 큐는 큐가 아니라 일정이 정해진 메모리 누수입니다. 과부하가 이어지는 동안 그것은 어느 깊이에서 안정되지 않고 계속 자랍니다. 고장은 나중에 찾아옵니다. 메모리 부족으로 프로세스가 죽거나, 지연이 시스템의 모든 타임아웃을 넘어선 뒤이고, 그때쯤이면 큐에 담긴 일감은 어차피 낡아 있습니다.
- 가득 찼을 때의 정책은 일부러 고릅니다. 기다리기, 가장 오래된 것 버리기, 가장 새로운 것 버리기, 쓰는 쪽 거절하기. 각각은 다른 사업 결정이고 저마다 맞는 자리가 있습니다. 기다리기는 정확성을 지키고 고통을 상류로 나눕니다. 가장 오래된 것 버리기는 최신 값만 의미가 있는 실시간 피드에 맞습니다. 거절하기는 클라이언트에게 알려 주고 스스로 판단하게 할 수 있는 HTTP 엣지에 맞습니다. 고르지 않은 기본값이 바로 장애 중에 해명하게 될 그 값입니다.
- 밀어내기는 끝까지 번져야 합니다. 내 컴포넌트 둘 사이의 유한한 채널은 쉽습니다. 어려운 곳은 마지막 구간, 압력이 프로세스 밖으로 나가야 하는 지점입니다. 채널을 채우는 스레드가 요청 핸들러라면 그 스레드를 막는 것이 곧 압력이 클라이언트에 닿는 방법이지만, 그 스레드가 속한 풀도 유한할 때만 그렇습니다. 브로커를 읽는 배경 작업이라면 확인 응답을 멈추거나 미리 가져오기를 멈춰야 합니다. 그러지 않으면 브로커는 계속 내 메모리로 밀어 넣습니다.
- 처리량이 아니라 깊이와 나이를 봅니다. 처리량은 큐가 비었을 때와 가득 찼을 때가 똑같이 보입니다. 가장 늦게 움직이고 가장 쓸모가 적은 신호입니다. 깊이는 버퍼가 차오르는 중이라고 알려 주고, 가장 오래된 항목의 나이는 요청이 실제로 겪는 것을 알려 줍니다. 둘 다 무엇이 무너지기 전에 움직입니다.
- 묶음 처리는 지연을 주고 처리량을 얻는 거래이니 대기 상한을 둡니다. 10밀리초 만에 차는 묶음은 공짜입니다. 마지막 한 건을 2초 기다린 묶음은 그 안의 모든 항목을 2초씩 나쁘게 만든 것입니다. 최대 묶음 크기와 최대 지연을 함께 정하고, 먼저 오는 쪽을 택합니다.
- 버퍼 크기를 감으로 정하지 않습니다. 용량은 약속하려는 바에서 나와야 합니다. 견딜 수 있는 최악의 대기가 2초이고 소비자가 초당 50건을 처리한다면 버퍼는 100건을 담고, 101번째는 문 앞에서 기다립니다. "가득 찬 걸 볼 일이 없을 만큼 넉넉한" 버퍼는 문제를 감추라고 시킨 버퍼입니다.

## .NET에서는

`System.Threading.Channels`는 이 그림 전체를 프로세스 안으로 옮긴 것입니다. `CreateBounded`가 여덟 칸을 주고, `FullMode`가 장면에서 `wait` 칩으로 바뀌는 그 정책입니다.

```csharp
// 이음매: 여덟 칸, 그리고 한 칸을 기다리게 되는 생산자.
var channel = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(capacity: 8)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = true,
});

// 생산자. WriteAsync는 쓸 칸이 생기기 전에는 끝나지 않으므로, 이 반복문의
// 속도는 오직 소비자의 속도입니다. 그 await 하나가 패턴의 전부입니다.
await foreach (var item in source.ReadAllAsync(token))
{
    await channel.Writer.WriteAsync(item, token);
}
channel.Writer.Complete();

// 소비자.
await foreach (var item in channel.Reader.ReadAllAsync(token))
{
    await handler.HandleAsync(item, token);
}
```

`Channel.CreateUnbounded`는 한계만 지운 같은 코드이고, 운영에서 무너지는 쪽입니다. `WriteAsync`가 늘 곧바로 끝나니 생산자는 아무것도 배우지 못하고, 큐는 과부하를 알리는 자리가 아니라 과부하를 보관하는 자리가 됩니다. 유한한 쪽이 막힌다는 이유로 무한한 쪽에 손이 간다면, 그 막힘이야말로 물어보던 정보입니다.

나머지 세 `FullMode` 값은 막지 않습니다. `DropOldest`와 `DropNewest`는 쓰는 쪽을 계속 움직이게 하고 대신 일감을 버립니다. 최신 값이 이전 값을 대신하는 피드에는 맞는 선택이고, 처리하겠다고 약속한 것에는 틀린 선택입니다. `DropWrite`는 쓰려던 항목을 버리고도 쓰는 쪽에는 성공이라고 알립니다. `TryWrite`는 `true`를 돌려주고 `WriteAsync`는 완료되며, 유일한 신호는 `Channel.CreateBounded`의 `itemDropped` 콜백뿐입니다. 503이 요청을 거절하듯 쓰기를 거절하는 장치는 채널에 없으므로, 생산자에게 알려야 한다면 `Wait` 모드에 머물러 `TryWrite`가 false를 돌려주게 하거나 `WriteAsync`에 타임아웃을 겁니다.

장면에 있는 동시 실행 한도는 세마포어입니다. 출처에서 한 번에 떠 있을 수 있는 일감의 수를 묶고, 그것이 밀어내기가 버퍼를 가진 첫 지점에서 멈추지 않게 해 줍니다.

```csharp
// 출처가 무엇을 내놓든 한 번에 여덟 개까지만 떠 있습니다. 퍼밋은 항목을 큐에
// 넣기 전에 가져가고 소비자가 다 쓴 뒤에야 돌려줍니다. WriteAsync 뒤에
// 돌려주면 쓰는 쪽만 묶게 되는데, 그것은 유한한 채널이 이미 하는 일입니다.
var admits = new SemaphoreSlim(initialCount: 8, maxCount: 8);

// 생산자.
await admits.WaitAsync(token);
await channel.Writer.WriteAsync(item, token);

// 소비자.
try
{
    await handler.HandleAsync(item, token);
}
finally
{
    admits.Release();
}
```

HTTP 엣지에서는 같은 한도가 `AddConcurrencyLimiter`이고, 거기서는 대기열이 드러나 있습니다. `QueueLimit`은 퍼밋을 기다릴 수 있는 호출자 수이고, 그것을 넘어서는 것은 메모리에 세워 두는 대신 상태 코드로 거절합니다. 그것이 백프레셔와 부하 셰딩(load shedding)의 차이이며, 둘은 한 시스템에 함께 있어야 합니다. 세마포어는 기다리게 할 수 있는 호출자를 늦추고, 리미터는 그럴 수 없는 호출자를 거절합니다.

묶음 처리는 4단계이고, 잊히는 부분은 지연 상한입니다.

```csharp
// 최대 `max`개까지 담되, 나머지를 기다리는 시간은 `window`를 넘기지 않습니다.
static async IAsyncEnumerable<T[]> Batches<T>(
    ChannelReader<T> reader,
    int max,
    TimeSpan window,
    [EnumeratorCancellation] CancellationToken token)
{
    var batch = new List<T>(max);
    while (await reader.WaitToReadAsync(token))
    {
        using var cap = CancellationTokenSource.CreateLinkedTokenSource(token);
        cap.CancelAfter(window);
        try
        {
            while (batch.Count < max && await reader.WaitToReadAsync(cap.Token))
            {
                while (batch.Count < max && reader.TryRead(out var item)) batch.Add(item);
            }
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            // 창이 닫혔습니다. 묶음이 다 찰 때까지 기다리지 않고 가진 것을 보냅니다.
        }

        if (batch.Count == 0) continue;
        yield return batch.ToArray();
        batch.Clear();
    }
}
```

여러 항목을 한 번에 오가게 하면 대개 크게 이깁니다. `SqlBulkCopy` 한 번, `SendMessagesAsync` 한 번, 대량 색인 요청 한 번이면 호출마다 드는 비용을 `max`번이 아니라 한 번만 치르기 때문입니다. 장면은 방법이 아니라 결과를 보여 줍니다. 배출 속도가 두 배가 되고, 같은 폭주가 다시 와도, 깊이는 거의 움직이지 않습니다. 그것이 정직한 해결입니다. 용량을 8에서 8000으로 올렸다면 배지에 불이 들어오는 일은 없어졌겠지만 소비자가 빨라지지는 않았을 것입니다. 그것은 해결이 아니라 더 긴 거짓말입니다.
