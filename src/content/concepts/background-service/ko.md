---
title: "Background Service"
summary: "백그라운드 서비스는 호스트 안에서 도는 루프입니다. 앱이 시작할 때 함께 시작해 자기 속도로 큐를 비우고, 종료가 오면 손에 든 작업을 마친 뒤에 나갑니다. 그래서 어떤 요청도 느린 일을 기다리지 않고, 받아 둔 일도 잃지 않습니다."
category: "예약 작업과 워크플로"
scene: background-service
steps:
  - title: "어떤 요청도 느린 일을 기다려서는 안 됩니다"
    text: "고스트는 요청 안에서 만들어지는 리포트를 보여 줍니다. 응답 시간이 부풀고, 클라이언트는 타임아웃되고, 재시도가 같은 무거운 일을 또 시작합니다. 해법은 넘기기입니다. 일을 큐에 넣고 지금 답하고, 시간을 가진 무언가가 그 일을 하게 둡니다."
  - title: "호스티드 서비스는 일부러 호스트와 함께 살고 함께 죽습니다"
    text: "앱이 뜨면 시작해서 루프로 큐를 비웁니다. 종료가 오면 살해당하는 것이 아니라 통보받습니다. 손에 든 작업을 마치고, 새 작업을 그만 집고, 깨끗하게 나갑니다. 우아한 종료는 예의가 아닙니다. \"멈췄다\"와 \"일을 잃었다\"의 차이입니다."
  - title: "일이 커지면 자기 프로세스를 줍니다"
    text: "워커 서비스는 웹 앱 밖으로 옮긴 같은 루프입니다. 자기 일정으로 배포되고, 웹 트래픽이 아니라 큐 깊이로 확장됩니다. 앱이 재시작해도 워커는 계속 돌고, 워커가 재시작해도 큐가 일을 붙들고 있습니다. 분리된 수명이 곧 기능입니다."
  - title: "운영의 두 가지 죄는 두 번 도는 것과 하나를 잃는 것입니다"
    text: "워커를 늘리면 두 인스턴스가 같은 작업을 집습니다. 리스가 한쪽만 된다고 말해 주지 않는다면요. 작업 중에 죽어도 큐는 재시도를 위해 그 작업을 붙들고 있어야 합니다. 상태는 큐에 두고 워커는 무상태로 두면, 두 죄는 사건이 아니라 설정이 됩니다."
related:
  - label: IHostedService
    slug: ihostedservice
  - label: Worker Service
    slug: worker-service
  - label: Background Job
    slug: background-job
  - label: Scheduled Job
    slug: scheduled-job
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Cancellation Token
    slug: cancellation-token
  - label: Retry
    slug: retry
  - label: Poison Message
    slug: poison-message
  - label: At-Least-Once
    slug: at-least-once
  - label: State Machine
    slug: state-machine
references:
  - title: Background tasks with hosted services in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
  - title: Worker services in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: Create a Queue Service
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/queue-service
---

## 언제 쓰나

- 요청이 느린 무언가를 기다리게 될 때 씁니다. 가입 메일 보내기, 내보내기 파일 만들기, 업로드된 이미지 줄이기, 밤마다 도는 동기화. 어느 것도 호출자가 요청한 내용이 아닌데, 인라인으로 처리하면 전부 호출자의 시계 위에 올라갑니다. 큐 뒤로 옮기면 엔드포인트가 할 일은 "일을 받고 받았다고 말하기"로 줄어들고, 그 정도는 밀리초 단위로 끝납니다.
- 큐나 스트림을 소비할 무언가가 필요할 때 씁니다. 백그라운드 서비스는 컨슈머의 자연스러운 모양입니다. 호스트와 함께 시작하고, 멈추라는 말을 들을 때까지 루프를 돌고, 도착하는 것을 처리합니다. Service Bus, RabbitMQ, Kafka, 아웃박스 테이블, 프로세스 안의 `Channel<T>`까지 출처는 바뀌어도 루프는 그대로입니다.
- 요청이 아니라 일정한 박자로 일이 일어나야 할 때 씁니다. 만료된 행 정리, 파트너 API 폴링, 캐시 재계산 같은 일입니다. 루프 안에 `PeriodicTimer`를 두면 박자가 서비스의 일부가 되고, 따로 운영해야 하는 외부 스케줄러가 필요 없습니다. 놓친 실행 창, 밀린 작업 따라잡기, 겹침까지 견뎌야 하는 순간부터는 예약 작업이고, 일정을 소유하는 쪽으로 넘겨야 합니다.
- 웹 계층과 따로 확장해야 할 때 씁니다. 트래픽과 큐 깊이는 서로 다른 숫자이고, 두 번째 숫자로 확장하는 워커는 일을 만들어 내는 앱을 건드리지 않고도 알맞은 크기를 찾을 수 있습니다.
- 그냥 느리게 느껴지는 요청 처리에는 **쓰지 않습니다**. 30밀리초면 될 조회가 900밀리초 걸린다면 그것은 조회 문제입니다. 큐 뒤에 숨기면 고칠 수 있던 지연 버그가 상태 조회 엔드포인트와 재시도 정책, 그리고 "결과가 어디로 갔느냐"는 문의를 동반한 비동기 흐름으로 바뀝니다. 먼저 그 경로를 고치고 나서 판단하세요.
- 호출자가 결과를 받아야 다음으로 갈 수 있는 일에는 **쓰지 않습니다**. 다음 화면을 그리는 데 그 답이 필요하다면 그 일은 요청의 일부입니다. 옮길 수 있는 것은 그 답이 의존하지 않는 나머지입니다.

## 주의점

- 정지 토큰을 모든 곳에서 존중하지 않으면 종료가 강제 종료가 됩니다. 토큰은 `ExecuteAsync`로 들어오고, 그 안의 모든 await에 닿아야 합니다. 수신 호출, HTTP 호출, 데이터베이스 호출, 지연까지 전부입니다. 토큰을 무시하는 루프는 호스트가 종료 제한 시간을 세는 동안에도 계속 일하고, 그 뒤에 작업 도중에 프로세스가 뜯겨 나갑니다. 우아한 종료라는 계약은 결국 그 매개변수 하나를 진지하게 받아들이는 일입니다.
- `ExecuteAsync`에서 잡히지 않은 예외는 루프를 멈추고, 얼마나 시끄럽게 멈추는지는 호스트가 정합니다. .NET 6부터 기본값은 `BackgroundServiceExceptionBehavior.StopHost`라서 빠져나온 예외가 애플리케이션을 내립니다. `Ignore`로 되돌리면 예전 동작을 얻는데 그쪽이 더 나쁩니다. 등록은 되어 있지만 더 이상 돌지 않는 서비스가 생기고, 헬스 체크는 전부 초록색으로 남습니다. 루프 안에서 잡고, 어떤 작업인지 알아볼 수 있을 만큼 맥락을 남겨 기록하고, 예외마다 계속할지 다시 큐에 넣을지 멈출지 정합니다.
- 스코프 의존성은 반복마다 새 스코프가 필요합니다. 호스티드 서비스는 싱글턴이라 생성자에 `DbContext`를 주입하면 시작할 때 실패하거나, 프로세스 수명 내내 컨텍스트 하나를 쓰면서 추적 엔터티가 쌓이다가 어딘가에서 무너집니다. `IServiceScopeFactory`를 주입하고, 루프 안에서 스코프를 만들고, 거기서 해석하고, 작업이 끝나면 정리합니다.
- 메모리 안의 큐는 프로세스와 함께 사라집니다. `Channel<T>`은 한 애플리케이션 안의 손넘김으로는 훌륭하지만 지속성 이야기로는 빈약합니다. 파드가 축출될 때 안에 있던 것은 사라지고, 아무도 그 사실을 듣지 못합니다. 항목 하나를 잃는 것이 사고라면 큐는 프로세스 밖에 있어야 합니다. 브로커이거나, 폴링하는 테이블입니다.
- 확장하면 단일 실행 보호가 필요합니다. 같은 워커의 복제본 두 개는 무언가가 막지 않는 한 같은 항목을 함께 집습니다. 메시지마다 잠금이나 리스를 주는 브로커, 작업을 감싸는 분산 잠금, 아니면 둘이 같은 일을 쳐다보지 않도록 나누는 파티션 배정이 그 무언가입니다. 진짜 큐 위의 경쟁 소비자는 이것을 공짜로 주지만, 공유 테이블 위의 타이머는 주지 않습니다.
- `StartAsync` 안에서 일을 하지 않습니다. 호스트가 그것을 기다리기 때문에 시작이 길어지면 애플리케이션 전체가 뜨지 못하고, 컨테이너에서는 바쁜 서비스가 아니라 실패한 준비 상태 프로브처럼 보입니다. 루프를 시작하고 반환합니다. `BackgroundService`는 첫 await에서 `ExecuteAsync`를 돌려주면서 이미 그렇게 하고 있습니다.
- 모든 작업이 적어도 한 번은 실행되고 가끔은 두 번 실행된다고 생각해 둡니다. "일은 끝났다"와 "메시지는 확인됐다" 사이에서 죽으면 메시지가 다시 재생되는데, 이것은 올바른 동작이지 큐에서 고칠 버그가 아닙니다. 같은 작업이 반복돼도 결과가 한 번 실행한 것과 같도록 만들거나, 이미 처리한 것을 기록해 두고 건너뜁니다.

## .NET에서는

`BackgroundService`가 기반 클래스이고, 작성할 메서드는 정확히 하나입니다. 토큰이 계약입니다. 호스트가 종료를 시작할 때 취소되고, 루프 안의 모든 await가 그것을 받게 되어 있습니다.

```csharp
public sealed class ReportWorker(
    IReportQueue queue,
    IServiceScopeFactory scopes,
    ILogger<ReportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var job = await queue.DequeueAsync(stoppingToken);

            // 작업마다 스코프 하나. DbContext가 그 일과 함께 살고 함께 죽는다.
            await using var scope = scopes.CreateAsyncScope();
            var reports = scope.ServiceProvider.GetRequiredService<ReportService>();

            try
            {
                await reports.BuildAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;      // 실패가 아니라 종료다
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Report {JobId} failed", job.Id);
            }
        }
    }
}
```

등록은 한 줄이고, 이 한 줄이 서비스의 수명을 호스트의 수명에 묶습니다.

```csharp
builder.Services.AddHostedService<ReportWorker>();
```

한 애플리케이션 안에서의 손넘김은 `Channel<T>`입니다. 배압이 들어 있는 큐라서, 경계가 있는 채널은 밀린 작업이 한없이 늘어나게 두는 대신 생산자를 기다리게 만듭니다. 소비하는 쪽이 느린 상황에서는 보통 그쪽이 원하는 동작입니다.

```csharp
public sealed class ReportQueue : IReportQueue
{
    private readonly Channel<ReportJob> _channel =
        Channel.CreateBounded<ReportJob>(new BoundedChannelOptions(200)
        {
            FullMode = BoundedChannelFullMode.Wait,
        });

    public ValueTask EnqueueAsync(ReportJob job, CancellationToken ct) =>
        _channel.Writer.WriteAsync(job, ct);

    public ValueTask<ReportJob> DequeueAsync(CancellationToken ct) =>
        _channel.Reader.ReadAsync(ct);
}
```

그러면 엔드포인트는 일을 받고 답이 어디에 나타날지만 말합니다. 장면의 1단계를 그대로 적은 것입니다. 응답이 더 이상 리포트를 담지 않으니, 응답이 리포트만큼의 값을 치르지도 않습니다.

```csharp
app.MapPost("/reports", async (ReportRequest request, IReportQueue queue, CancellationToken ct) =>
{
    var job = ReportJob.From(request);
    await queue.EnqueueAsync(job, ct);
    return Results.Accepted($"/reports/{job.Id}");   // 리포트가 아니라 202
});
```

큐에서 오는 일이 아니라 박자에 맞춰 도는 일이라면 `PeriodicTimer`가 같은 루프 안에 들어갑니다. 자기 자신과 틱이 겹치지 않고 정지 토큰을 받는데, 예전 `Timer` 콜백이 여기서 어색했던 이유가 바로 이 두 성질이었습니다.

```csharp
using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

while (await timer.WaitForNextTickAsync(stoppingToken))
{
    await CleanUpExpiredAsync(stoppingToken);
}
```

루프가 자기 프로세스를 가질 만해지면 워커 서비스 템플릿이 답입니다. 같은 클래스에 다른 호스트를 두른 것이고, 서비스가 종료에 대해 할 말이 있을 때는 `IHostApplicationLifetime`으로 맞춥니다.

```csharp
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<ReportWorker>();

// 호스트가 ExecuteAsync의 반환을 얼마나 기다려 주는지.
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(30);
    options.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.StopHost;
});

await builder.Build().RunAsync();
```

마지막 조각이 4단계가 말하는 그것입니다. 그 워커의 복제본 두 개가 같은 큐를 읽으니, 큐가 항목마다 한쪽에게만 건네고 끝났다는 말을 들을 때까지 붙들고 있어야 합니다. 진짜 브로커에서는 메시지 잠금이고, 테이블 위에서는 직접 잡고 갱신하는 리스입니다.

```csharp
await foreach (var message in receiver.ReceiveMessagesAsync(stoppingToken))
{
    try
    {
        await Handle(message, stoppingToken);
        await receiver.CompleteMessageAsync(message, stoppingToken);   // 이제서야 사라진다
    }
    catch (Exception)
    {
        await receiver.AbandonMessageAsync(message, cancellationToken: stoppingToken);
    }
}
```

그렇게 하는 데 워커 자체가 특별할 필요는 없고, 특별해서도 안 됩니다. 상태는 큐가 들고, 누가 손댈 수 있는지는 리스가 정하고, 워커는 몇 개나 떠 있는지 아무도 몰라도 죽였다가 다시 띄울 수 있는 프로세스입니다.
