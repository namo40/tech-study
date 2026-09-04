---
title: "Load Test"
summary: "Load Test는 현실적인 트래픽을 시스템에 밀어 넣고 무엇이 먼저 휘는지 보는 일입니다. 찾는 숫자는 최고 처리량이 아니라, 지연과 오류가 아직 목표를 만족하는 가장 높은 부하입니다."
category: "테스트와 검증"
scene: load-test
steps:
  - title: "램프"
    text: "먼저 워밍업하고, 부하를 단계별로 올리며 각 단계를 유지합니다. 가상 사용자 100명에서 서비스는 초당 475건을 처리하고 p95는 40ms, 오류는 없습니다. 처리량이 직선으로 오르고 지연이 평평한 동안은 아직 시스템이 병목이 아닙니다."
  - title: "무릎"
    text: "사용자 300명쯤을 지나면 부하를 더 줘도 처리량은 늘지 않고 대기만 늘어납니다. p95가 540ms까지 오르고 timeout이 시작됩니다. 의존성 미터가 무엇이 먼저 포화됐는지 알려 줍니다. CPU는 60%인데 커넥션 풀은 가득 차고 180건이 연결을 기다리고 있으니, 고치거나 크기를 잡아야 할 것은 풀입니다."
  - title: "지속 가능한 지점, 그다음 soak"
    text: "목표를 여전히 만족하는 가장 높은 부하로 물러납니다. 여기서는 p95 180ms에 초당 890건이고, 최고점인 1,060이 아니라 그 숫자가 용량입니다. 그다음 몇 시간을 유지합니다. 2시간 soak 동안 힙이 40%에서 70%까지 올라가는데, 짧은 테스트였다면 보이지 않았을 누수입니다."
  - title: "현실로 만들기"
    text: "뜨거운 id 하나면 모든 요청이 캐시 히트가 되고, 같은 서비스가 초당 1,121건에 p95 24ms를 보고합니다. id를 1만 개 쓰고 적중률이 60%가 되면 886건에 189ms입니다. 고정 도착률로도 재 보세요. 얌전히 기다리는 사용자는 느린 서버가 자기 테스트를 스스로 늦추도록 놔둡니다."
related:
  - label: Stress Test
    slug: stress-test
  - label: Spike Test
    slug: spike-test
  - label: Capacity Test
    slug: capacity-test
  - label: Soak Test
    slug: soak-test
  - label: Throughput
    slug: throughput
  - label: Tail Latency
    slug: tail-latency
  - label: SLO
    slug: slo
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Rate Limiter
    slug: rate-limiter
  - label: USE Method
    slug: use-method
references:
  - title: Load and stress testing ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/test/load-tests?view=aspnetcore-10.0
  - title: dotnet-counters
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: NBomber documentation
    url: https://nbomber.com/docs/getting-started/overview/
---

## 언제 쓰나

- 출시 전, 트래픽 이벤트 전, 용량을 결정하기 전에 씁니다. 데이터 계층이나 풀 크기, 런타임 설정을 바꾼 뒤에도 씁니다.
- 어떤 자원이 먼저 포화되는지 찾기 위해 씁니다. 그래야 확장과 튜닝이 늘리기 쉬운 쪽이 아니라 진짜 병목을 겨냥합니다.

## 주의점

- 최고점이 아니라 목표를 만족하는 지속 가능한 처리량을 보고합니다. 최고점은 이미 실패하고 있던 지점이고, 그 숫자를 말하는 순간 서비스가 버틸 수 없는 값을 약속하게 됩니다.
- 워밍업과 측정을 분리합니다. JIT도 캐시도 커넥션 풀도 차가운 상태에서 시작하므로, 첫 1분은 시스템이 아니라 기동 과정을 재는 것입니다.
- 데이터 카디널리티, 페이로드 크기, keep-alive, HTTP 버전을 운영과 비슷하게 맞춥니다. 뜨거운 키 하나면 모든 요청이 캐시 히트가 되고, 모든 숫자가 아무도 운영하지 않는 시스템에 대한 주장이 됩니다.
- 사용자를 마주하는 서비스라면 고정 도착률을 쓰는 open model을 택합니다. think time이 있는 closed model은 서버가 느려지면 부하를 덜 보내므로, 찾아내야 할 느려짐을 오히려 감춥니다.
- 테스트가 도는 동안 의존성을 함께 봅니다. 풀 대기, 스레드 풀 큐 길이, GC 정지, 큐 깊이, 하위 서비스의 rate limit이 그 대상입니다. 서비스는 멀쩡해 보이는데 무너진 쪽이 데이터베이스일 수 있습니다.
- soak 테스트는 누수와 풀 드리프트, 단편화가 드러날 만큼 길게 돌립니다. 한 시간이 깨끗했다고 여덟 시간째를 말해 주지는 않습니다.
- 측정하려는 네트워크 경로 바깥에서 부하를 발생시키고, 부하 발생기 자체가 병목이 아닌지 확인합니다.

## .NET에서는

```csharp
// An open-model scenario: a fixed arrival rate, realistic ids, production-like client.
var http = new HttpClient(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) })
{
    BaseAddress = new Uri("https://shop.internal"),
    DefaultRequestVersion = HttpVersion.Version20,
};
var ids = await File.ReadAllLinesAsync("order-ids.txt");   // 10k real ids, not one hot key

var scenario = Scenario.Create("get_order", async ctx =>
    {
        var id = ids[Random.Shared.Next(ids.Length)];
        using var response = await http.GetAsync($"/orders/{id}", ctx.ScenarioCancellationToken);
        return response.IsSuccessStatusCode ? Response.Ok() : Response.Fail();
    })
    .WithWarmUpDuration(TimeSpan.FromSeconds(30))
    .WithLoadSimulations(
        Simulation.RampingInject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromMinutes(2)),
        Simulation.Inject(rate: 900, interval: TimeSpan.FromSeconds(1), during: TimeSpan.FromHours(2)));   // soak

NBomberRunner.RegisterScenarios(scenario).Run();
```

```text
# While it runs, watch the server, not only the client:
dotnet-counters monitor --process-id <pid> \
  System.Runtime Microsoft.AspNetCore.Hosting Microsoft.Data.SqlClient.EventSource
```

`Simulation.Inject`이 open model입니다. 서비스가 어떻게 반응하든 정해진 속도로 계속 넣으므로, 느려짐이 조용히 줄어든 테스트가 아니라 늘어나는 큐와 오르는 지연으로 드러납니다. k6 같은 외부 도구도 같은 세 가지 원칙을 따릅니다. 그중 가장 자주 빠뜨리는 것이 마지막 원칙인데, 클라이언트 쪽 수치만으로는 서버의 어떤 자원이 포화됐는지 알 수 없으므로 테스트가 도는 내내 서비스와 그 의존성의 카운터를 함께 모아야 합니다.
