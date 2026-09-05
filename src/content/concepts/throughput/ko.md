---
title: "Throughput"
summary: "Throughput은 초당 얼마나 많은 일이 끝나는지를 말하며, 지연과는 다른 축입니다. 사용률은 리소스가 얼마나 바쁜지를 말하고, 포화는 유입이 용량을 넘을 때 생기는 대기줄이며, 천장 부근에서는 처리량이 한 단위 더 오르기 훨씬 전에 지연이 폭발합니다."
category: "요구사항과 품질 속성"
scene: throughput
steps:
  - title: "처리량과 지연은 서로 다른 축입니다"
    text: "일 하나를 금방 끝내는 슬롯 하나는 초당 열 건을 처리합니다. 각각 네 배 오래 걸리는 슬롯 넷도 초당 열 건입니다. 빠른 응답이 물량을 보장하지 않고, 물량이 속도를 요구하지도 않습니다. 시스템에는 두 숫자가 다 있습니다."
  - title: "사용률은 얼마나 바쁜가이고, 처리량은 얼마나 끝내는가입니다"
    text: "유입을 올리면 둘이 함께 오릅니다. 40% 바쁨에서는 오는 대로 즉시 나가고, 80%에서도 아직 괜찮지만 폭증을 받아 줄 여유가 줄어듭니다. 사용률이 가장 싼 조기 신호인 이유는, 아프기 전에 천장이 얼마나 남았는지를 알려 주기 때문입니다."
  - title: "포화는 대기줄이고, 지연은 대기줄에서 삽니다"
    text: "유입이 용량을 넘으면 줄이 자랍니다. 처리량은 천장에서 평평해지는데 대기 시간은 폭발합니다. 새 요청마다 이미 기다리는 모두의 뒤에 서기 때문입니다. 서버는 100% 바쁘지만 더 끝내는 것은 없습니다. 가득 참은 빠름이 아닙니다. 가득 참은 느림이 시작되는 곳입니다."
  - title: "천장은 병목의 것이고, 여유는 설계의 선택입니다"
    text: "용량을 늘리면 천장이 올라가고, 슬롯 넷을 포화시키던 압력은 슬롯 여섯의 80%에 머뭅니다. 80% 부근에서 도는 것은 줄을 짧게 유지하는 폭증 여유를 사는 일입니다. 처리량은 병목에서 사고, 평화는 여유로 삽니다."
related:
  - label: Utilization
    slug: utilization
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

## 언제 쓰나

- 무언가의 크기를 정할 때. 풀, 레플리카, 파티션, 커넥션 한도, 워커 수는 모두 "초당 얼마나 많은 일이 필요하고, 여기서 거기까지 가장 좁은 단이 무엇인가"라는 하나의 질문입니다. 처리량 숫자 없이 고른 크기는 시연할 때의 느낌으로 고른 크기입니다.
- 부하 테스트 결과를 읽을 때. 지연 곡선의 무릎이 곧 포화이고, 그래프에서 볼 만한 지점은 그것 하나입니다. 무릎 아래에서는 부하를 올리면 처리량이 따라 오르고 지연은 거의 움직이지 않습니다. 무릎 위에서는 처리량이 멈추고 지연은 줄이 가는 곳으로 갑니다. 무릎이 어디인지 알면 천장과 안전 운전 구간을 함께 알게 됩니다.
- SLO를 설계할 때. 지연 목표는 조용히 사용률에 상한을 겁니다. 리소스가 가득 차 갈수록 대기 시간이 가파르게 오르기 때문입니다. "p99 200ms 이하"와 "장비를 95%로 돌리자"는 요구사항 두 개가 아니라, 요구사항 하나와 그것을 뒤집는 말 하나입니다.
- 큐 뒤에 워커가 있는 구조. 유입과 처리가 둘 다 속도일 때 적체의 운명은 그 차이가 정합니다. 유입이 처리를 충분히 오래 넘어서면 큐를 어떻게 조율해도 소용이 없고, 남는 질문은 용량을 더 넣을 것인가 아니면 일을 덜 받을 것인가뿐입니다.
- 누군가 "시스템이 느리다"고 말할 때. 무엇이 느립니까. 포화된 리소스는 스레드를 더 넣으면 더 느려지는 방식으로 느리고, 진짜로 느린 의존 대상은 스레드를 더 넣어도 그대로인 방식으로 느립니다. 처리량과 사용률을 같이 보면 지금 어느 쪽 이야기를 하고 있는지 알 수 있습니다.

## 주의점

- 처리량과 지연은 다른 질문에 답하니 둘 다 보고하고, 하나의 점수로 평균 내지 않습니다. 둘을 섞은 숫자는 손댈 수 있는 이유로 오르내리지 않습니다. 장면의 1단계가 그 문제를 그대로 축소해 보여 줍니다. 처리량이 같고 지연은 네 배 차이 나는 두 시스템이 있는데, 그 둘을 구별해 주는 단일 수치는 없습니다.
- 100%에 가까운 사용률은 효율이 아니라 곧 생길 대기줄입니다. 대기 시간은 남은 여유의 역수에 대체로 비례하니, 리소스의 마지막 몇 퍼센트가 앞의 80%보다 훨씬 비싼 지연을 물립니다. 여유를 의도적으로 잡아 두고(피크에서 70~80%가 흔한 기준입니다), "95%까지 올렸다"는 말은 절약이 아니라 취약함의 보고로 읽습니다.
- 천장은 병목이 정하니, 다른 곳을 최적화하면 청구서만 바뀝니다. 포화된 데이터베이스 앞의 웹 계층을 두 배로 늘리면 더 긴 줄을 얻는 것이지 더 많이 끝내는 것이 아닙니다. 다른 단은 놀고 있는데 혼자 100%인 단을 찾아 거기에 쓰면 됩니다.
- 큐는 모든 계층에 숨어 있고 각각이 대기를 보탭니다. 스레드 풀에 하나, 커넥션 풀에 하나, 네트워크 카드에 하나, 디스크에 하나, 브로커에 하나 있습니다. 계측한 모든 구간에서 빨라 보이는 요청도 느릴 수 있습니다. 아무도 그리지 않은 큐에서 시간을 썼기 때문입니다.
- 리틀의 법칙이 검산입니다. 큐 길이는 유입 속도 곱하기 대기 시간이니, 보고 있는 세 숫자 중 두 개가 나머지 하나를 설명하지 못하면 하나가 잘못 측정되었거나 시스템이 가정한 정상 상태가 아닙니다. 곱셈 한 번이면 되고, 걸러지는 헛소리가 꽤 많습니다.
- goodput은 처리량이 아닙니다. 재시도, 이미 포기한 타임아웃, 아무도 읽지 않은 응답이 처리량만 부풀리고 실제로 쓸모 있었던 양은 움직이지 않습니다. 과부하일수록 둘의 간격이 가장 빠르게 벌어지는데, 하필 대시보드를 가장 믿고 싶은 순간이 그때입니다. 그러니 한 일이 아니라 쓸모 있었던 일을 세면 됩니다.
- 구간 없는 속도는 측정이 아닙니다. 1분 동안 "초당 2천"은 평평한 2천일 수도 있고, 30초 동안 4천에 30초 동안 0일 수도 있습니다. 2천에 맞춰 만든 시스템에 들어가는 것은 둘 중 하나뿐입니다.

## .NET에서는

말다툼하기 전에 재면 됩니다. `dotnet-counters`는 이 장면이 그리는 세 숫자를 코드 변경이나 재시작 없이 보여 줍니다. 일이 들어오는 속도, 풀이 얼마나 쓰이고 있는지, 큐가 얼마나 긴지입니다.

```bash
# 유입 속도, 스레드 풀 큐 깊이, 커넥션 풀 압력을 실시간으로.
dotnet-counters monitor --process-id 1234 \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.Data.SqlClient.EventSource
```

`Microsoft.AspNetCore.Hosting`은 `requests-per-second`와 `current-requests`를 보고하는데, 각각 `in`과 진행 중인 요청 수입니다. `out`은 완료 건수에서 직접 계산해야 하고, 둘의 차이가 큐입니다. `System.Runtime`은 `threadpool-queue-length`를 보고합니다. 이 값이 계속 0보다 크면 일이 스레드를 기다리고 있다는 뜻이고, 그 기다림은 어떤 span에서도 찾을 수 없는 지연입니다. 여기까지는 EventCounter 이름입니다. 같은 도구가 더 새로운 `Meter` 계측기도 읽는데, 이쪽이 두 축에 더 잘 대응합니다. `http.server.active_requests`가 진행 중인 요청 수이고, `http.server.request.duration` 히스토그램의 개수는 완료 시점에 기록되므로 `in`이 아니라 `out`을 주며, .NET 9부터는 `System.Runtime`의 `dotnet.thread_pool.queue.length`가 큐 깊이입니다.

내가 만든 단들에는 속도와 소요 시간을 `Meter`로 내보내면, 같은 두 축이 엣지에만 있지 않고 구성 요소마다 생깁니다.

```csharp
// 단마다 meter 하나. 그러면 병목을 짐작하는 대신 병목이 스스로 이름을 댄다.
private static readonly Meter Meter = new("Orders.Pipeline");
private static readonly Counter<long> Finished = Meter.CreateCounter<long>("orders.finished");
private static readonly Histogram<double> Wait =
    Meter.CreateHistogram<double>("orders.queue_wait", unit: "ms");
private static readonly UpDownCounter<int> InFlight =
    Meter.CreateUpDownCounter<int>("orders.in_flight");

public async Task<Receipt> HandleAsync(Order order, CancellationToken token)
{
    var queued = Stopwatch.GetTimestamp();
    await _gate.WaitAsync(token);          // 한도가 걸린 단: 여기가 큐다
    Wait.Record(Stopwatch.GetElapsedTime(queued).TotalMilliseconds);
    InFlight.Add(1);
    try
    {
        var receipt = await _work.RunAsync(order, token);
        Finished.Add(1);                   // goodput: 실제로 끝난 것만 센다
        return receipt;
    }
    finally
    {
        InFlight.Add(-1);
        _gate.Release();
    }
}
```

숫자를 값지게 만드는 습관이 셋 있습니다. 무릎 너머까지 일부러 부하를 걸어 봅니다. 편안한 구간에서 멈추는 테스트는 천장이 어디인지도, 그 너머가 어떤 모습인지도 알려 주지 않습니다. 대기 시간은 작업 시간과 따로 기록합니다. 호출자가 겪는 지연은 둘의 합뿐인데, 둘을 고치는 방법은 완전히 다릅니다. 그리고 숫자가 지목한 단을 고치면 됩니다. 옆이 놀고 있는데 혼자 100%인 단이 천장이고, 나머지에 쏟은 시간은 아무것도 가져다주지 않습니다.
