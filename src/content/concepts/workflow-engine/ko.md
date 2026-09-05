---
title: "Workflow Engine"
summary: "워크플로 엔진은 여러 단계로 이루어진 처리를 실행하면서 그 진행을 실행 프로세스 바깥에 둡니다. 단계는 끝나는 대로 기록되므로 작업은 크래시를 넘기고, 실패한 단계를 다시 시도하고, 타이머든 사람이든 무엇인가를 기다리는 동안 메모리에 아무것도 쥐지 않습니다."
category: "예약 작업과 워크플로"
scene: workflow-engine
steps:
  - title: "예약이 깨우고, 기록이 지킵니다"
    text: "02:00에 엔진이 인스턴스를 시작하고, 1단계를 실행해 그 줄을 적고, 2단계로 넘어갑니다. 중요한 것은 히스토리에 적힌 그 한 줄입니다. 엔진의 기억은 프로세스가 아니라 기록입니다."
  - title: "단계 도중에 죽어도 이어 갑니다"
    text: "엔진이 죽고, 재시작하고, 히스토리를 재생합니다. 끝난 단계는 건너뛰고, 끊긴 단계는 처음부터 다시 돌립니다. 1단계는 두 번 돌지 않았습니다. 진행이 죽은 프로세스가 아니라 기록에 살았기 때문입니다."
  - title: "실패하는 것은 단계이지 워크플로가 아닙니다"
    text: "3단계가 실패하면 엔진은 잠시 물러났다가 그 단계 하나만 다시 돌립니다. 두 번째 시도가 성공합니다. 재시도가 안전한 것은 각 단계가 두 번 돌아도 해가 없을 때뿐이고, 그것이 모든 단계가 서명하는 계약입니다."
  - title: "기다림도 하나의 단계입니다"
    text: "마지막 단계는 승인을 기다립니다. 몇 시간이 걸리면 몇 시간을 기다립니다. 스레드도 메모리도 잠금도 쥐지 않은 채로입니다. 답이 도착하면 엔진이 깨어나 마무리하고 마지막 줄을 적습니다. 워크플로는 자기를 실행한 모든 프로세스보다 오래 살았습니다."
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Background Job
    slug: background-job
  - label: Saga
    slug: saga
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable Functions orchestrations"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

## 언제 쓰나

- 처리가 그것을 시작한 요청보다 오래 사는 경우입니다. 환경을 준비하는 일, 주문을 이행하는 일, 계약서를 세 번의 승인에 통과시키는 일, 야간 정산을 돌리는 일. 어느 것도 HTTP 핸들러 안에 들어가지 않고, 핸들러가 반환한다고 끝나지도 않습니다. 작업의 단위가 시간이나 날 단위이고 그동안 벌어지는 모든 일을 견뎌야 한다면 워크플로 엔진을 꺼낼 때입니다.
- 작업 설명이 "그다음, 그다음, 그다음"인 경우입니다. 앞 단계에 의존하는 단계들이 한 줄로 이어지고 그 사이사이에 기다림과 재시도가 흩어져 있는 모양이 바로 엔진의 모양입니다. 처리를 번호 매긴 목록으로 적을 수 있고 그 목록에 기다림이 들어 있다면, 엔진은 두 번째 장애가 오기 전에 제값을 합니다.
- 단계 중 일부가 기다림인 경우입니다. 배포를 견뎌야 하는 타이머, 월요일에나 돌아올지 모르는 승인, 언제 올지 모르는 결제사 웹훅 같은 것들입니다. `Task.Delay`와 메모리 안의 `TaskCompletionSource`는 둘 다 프로세스와 함께 죽지만 내구성 있는 타이머와 내구성 있는 외부 이벤트는 죽지 않습니다. 이 차이는 데모에서는 보이지 않고 운영에서만 보입니다.
- 이미 직접 만든 버전을 쓰고 있는 경우입니다. `status` 컬럼과 `next_attempt_at` 컬럼, 그리고 테이블을 훑는 cron 작업은 히스토리도 재생도 버전 관리 계획도 가시성도 없는 워크플로 엔진입니다. 만들어 본 것 자체는 합리적이지만 계속 늘려 쓰기에는 나쁩니다. 누군가 "주문 4417은 어느 단계에서 멈췄고 몇 번이나 시도했나"라고 묻는 날, 필요한 것은 엔진이었습니다.
- 무슨 일이 있었는지 누군가 답할 수 있어야 하는 경우입니다. 엔진이 적는 기록은 그 자체로 운영 자산입니다. 어느 단계가 실패했는지, 몇 번 재시도했는지, 승인이 얼마나 오래 답 없이 놓여 있었는지, 멈춘 인스턴스 무리가 어디서 모두 멈췄는지를 말해 줍니다. 이것은 "지금 상태가 무엇인가"와 다른 질문이고, 둘 중 재시작을 견디는 것은 하나뿐입니다.

## 주의점

- 모든 단계는 두 번 돌아도 안전해야 하고, 엔진은 서로 다른 두 자리에서 그것을 전제합니다. 작업을 끝내고 기록하기 전에 죽으면 재개할 때 그 단계를 다시 돌리고, 실패한 뒤의 재시도도 그 단계를 다시 돌립니다. 바깥에 영향을 주는 단계에는 상대편이 중복을 걸러 낼 수 있는 키가 있거나, 다시 확인하고 다시 해도 값싼 형태여야 합니다. 둘 다 없이 카드를 긁는 단계는 두 번 긁고, 엔진 설정을 아무리 바꿔도 그것은 고쳐지지 않습니다.
- 오케스트레이션 코드는 결정적이어야 합니다. 대부분의 엔진은 오케스트레이터를 히스토리에 대고 다시 실행해서 인스턴스의 위치를 복원합니다. 그래서 오케스트레이터 안의 `DateTime.UtcNow`, `Guid.NewGuid()`, `Random`, 직접 I/O는 지름길이 아니라 버그입니다. 재생할 때 처음과 다른 답을 내놓고, 엔진은 자기 자리를 잃습니다. 프레임워크가 이 모두에 대해 결정적인 대체물을 줍니다. 나머지는 전부 단계 쪽에 있어야 합니다.
- 인스턴스가 진행 중인 상태에서 정의의 버전을 올리는 일은 운영에서 가장 어려운 문제이고, 어느 엔진도 대신 결정해 주지 않습니다. 엔진은 분기할 버전 표시를 줄 뿐이고, 옛 경로를 언제 걷어 낼지는 여전히 우리가 골라야 합니다. 버전 1로 시작한 인스턴스는 버전 1의 히스토리에 대고 재생됩니다. 정의 가운데에 단계를 하나 끼워 넣고 배포하면 재생이 만나는 히스토리는 더 이상 코드와 맞지 않습니다. 흔한 답은 정의에 명시적으로 버전을 붙이고 옛 인스턴스는 옛 정의로 끝내게 두거나, 진행 중인 인스턴스가 다 빠질 때까지 배포를 미루는 것입니다. 첫 장애가 났을 때가 아니라 첫 릴리스 전에 하나를 골라 둡니다.
- 타이머와 외부 이벤트는 내구성이 있어야 합니다. `Task.Delay(TimeSpan.FromDays(2))`는 이틀 기다림이 아니라 배포 한 번이면 취소되는 이틀 기다림이고, 메모리 안의 완료 소스는 그보다 나쁩니다. 그 기다림이 중요하다면 히스토리가 사는 저장소와 같은 곳에 살아야 합니다.
- 저장소는 공짜가 아닙니다. 단계마다 행이 쌓이고, 반복문이 들어간 오케스트레이션은 아주 많이 쌓습니다. 끝난 인스턴스를 남겨 두는 비용이 얼마인지, 얼마나 오래 남길지, 정리는 어떻게 할지를 일찍 정해 둡니다. 아무도 정리하지 않는 히스토리 테이블은 데이터베이스에서 가장 큰 테이블이 되고, 그것도 조용히 그렇게 됩니다.
- 업무 규칙은 오케스트레이터 밖에 둡니다. 오케스트레이터가 할 일은 다음에 무엇이 도는지 말하는 것뿐이고, 인스턴스가 사는 동안 여러 번 다시 실행됩니다. 검증과 계산과 정책은 단계 쪽에 있어야 합니다. 거기서는 한 번만 돌고, 정직하게 실패하고, 런타임 없이도 테스트할 수 있습니다.

## .NET에서는

Azure Durable Functions가 이 모양 전체에 이르는 가장 짧은 길입니다. 오케스트레이터는 평범한 C#이고, 그것을 살아남게 만드는 쪽이 런타임입니다. `await` 지점이 체크포인트입니다. 함수는 그 사이에서 내려가 있다가 다음 결과가 도착하면 히스토리로부터 다시 실행됩니다. 코드가 대본처럼 읽히면서 상태 머신처럼 동작하는 이유가 이것입니다.

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var input = context.GetInput<Signup>()!;

    // 호출 하나하나가 단계입니다. 결과가 히스토리에 기록되므로, 죽은 뒤의
    // 재생은 다시 호출하는 대신 기록된 값을 돌려줍니다.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), input);
    await context.CallActivityAsync(nameof(SeedWorkspace), account);

    // 재시도 정책은 워크플로가 아니라 단계 하나에 붙습니다. 이 호출만
    // 반복되고, 성공하거나 정책이 포기할 때까지만 반복됩니다.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // 대기입니다. 둘 중 어느 것도 스레드를 붙잡지 않습니다. 인스턴스는 내려가고
    // 이벤트나 타이머가 도착하면 런타임이 다시 불러옵니다.
    using var cts = new CancellationTokenSource();
    var approval = context.WaitForExternalEvent<bool>("Approved");
    var deadline = context.CreateTimer(context.CurrentUtcDateTime.AddDays(3), cts.Token);

    if (approval != await Task.WhenAny(approval, deadline))
    {
        await context.CallActivityAsync(nameof(Escalate), account);
        return "escalated";
    }

    cts.Cancel();
    await context.CallActivityAsync(nameof(Activate), account);
    return "active";
}
```

이것을 굴러가게 하는 규칙은 두 가지이고, 둘 다 재생에 관한 것입니다. `DateTime.UtcNow` 대신 `context.CurrentUtcDateTime`을 쓰고 `Guid.NewGuid()` 대신 `context.NewGuid()`를 씁니다. 재생은 처음에 도달했던 값에 그대로 다시 도달해야 하기 때문입니다. 그리고 나머지 전부가 사는 곳은 액티비티입니다. 액티비티는 기록된 결과 하나당 한 번 호출되고, I/O를 해도 되며, 바깥에 영향을 주는 일이 허용된 유일한 자리입니다.

```csharp
[Function(nameof(ProvisionLicence))]
public static async Task ProvisionLicence([ActivityTrigger] Account account)
{
    // 이 단계는 두 번 돌려도 한 번 돌린 것과 같도록 쓰였습니다.
    // 키가 계정에서 나오므로 두 번째 호출은 두 번째 라이선스가 아니라
    // 공급자가 흡수하는 충돌이 됩니다.
    await licences.CreateAsync(new LicenceRequest
    {
        AccountId = account.Id,
        IdempotencyKey = $"licence:{account.Id}",
    });
}
```

인스턴스를 시작하는 것은 클라이언트 호출이고, 인스턴스 아이디는 생성하기보다 골라 주는 편이 좋습니다. 그 인스턴스가 다루는 대상에서 이름을 뽑아 주면, 첫 인스턴스가 아직 돌고 있는 동안에는 엔진이 같은 주문에 대해 두 번째 인스턴스를 시작하기를 거부합니다. 이보다 값싼 중복 제거는 없습니다. 다만 인스턴스가 끝나면 그 아이디는 다시 자유로워지므로, 주문당 최대 한 번을 지키려면 호출 앞에 상태 확인이 필요합니다.

```csharp
await client.ScheduleNewOrchestrationInstanceAsync(
    nameof(Onboard), signup, new StartOrchestrationOptions($"onboard-{signup.Id}"));
```

프레임워크가 문제에 비해 과할 때는 같은 모양이 `BackgroundService` 하나와 테이블 두 개에 들어갑니다. 인스턴스당 한 행에 어떤 정의를 도는지와 어디까지 왔는지를 담고, 끝난 단계당 한 행을 담고, 코드가 아니라 기록이 판단하도록 유일 키를 겁니다.

```csharp
public class WorkflowInstance
{
    public Guid Id { get; set; }
    public string Definition { get; set; } = "";
    public int Position { get; set; }              // 마지막으로 기록된 단계
    public DateTimeOffset? WakeAt { get; set; }    // 대기의 만기 시각
    public string Status { get; set; } = "running";
}

public class StepRecord
{
    public Guid InstanceId { get; set; }
    public int Step { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    // 끝난 단계 하나에 행 하나이고, 두 번 쓸 방법은 없습니다. Position은
    // 이 테이블의 캐시이지 두 번째 진실의 근원이 아닙니다.
    model.Entity<StepRecord>().HasKey(s => new { s.InstanceId, s.Step });
}
```

워커는 반복 사이에 기억이 없는 반복문입니다. 그것이 핵심입니다. 다음에 무엇을 할지 정하는 데 필요한 것이 전부 쿼리 한 번입니다.

```csharp
protected override async Task ExecuteAsync(CancellationToken stopping)
{
    while (!stopping.IsCancellationRequested)
    {
        var due = await db.Instances
            .Where(i => i.Status == "running")
            .Where(i => i.WakeAt == null || i.WakeAt <= DateTimeOffset.UtcNow)
            .OrderBy(i => i.Id)
            .Take(20)
            .ToListAsync(stopping);

        foreach (var instance in due) await AdvanceAsync(instance, stopping);
        await Task.Delay(TimeSpan.FromSeconds(5), stopping);
    }
}

async Task AdvanceAsync(WorkflowInstance instance, CancellationToken token)
{
    var steps = definitions[instance.Definition];
    // 어디서 이어 갈지는 기록에 관한 사실이지, 마침 돌고 있는 코드에 관한
    // 사실이 아닙니다. 여기서 죽은 프로세스는 아무것도 잃지 않습니다.
    var next = await db.Steps.CountAsync(s => s.InstanceId == instance.Id, token);
    if (next >= steps.Count) { instance.Status = "done"; await db.SaveChangesAsync(token); return; }

    try
    {
        // 단계는 끝났으면 null을, 아니면 자기가 멈춰 서 있을 기한을 돌려줍니다.
        // 멈춰 서는 것은 아무것도 기록하지 않습니다. 여전히 현재 단계입니다.
        var parkedUntil = await steps[next].RunAsync(instance, token);
        if (parkedUntil is { } until)
        {
            instance.WakeAt = until;
        }
        else
        {
            db.Steps.Add(new StepRecord { InstanceId = instance.Id, Step = next, At = DateTimeOffset.UtcNow });
            instance.Position = next + 1;
            instance.WakeAt = null;
        }
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        // 워크플로가 아니라 단계가 실패했습니다. 물러났다가 이것만 다시 돌립니다.
        var attempts = await Bump(instance.Id, next, token);
        instance.WakeAt = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(Math.Pow(2, attempts));
        if (attempts >= 5) instance.Status = "failed";
    }

    await db.SaveChangesAsync(token);
}
```

`WakeAt`은 두 가지 일을 하고 있고, 둘 다 이 구조가 재시작을 견디는 이유입니다. 하나는 실패한 단계의 백오프이고, 다른 하나는 기다림인 단계의 내구성 있는 타이머입니다. 사람을 기다리는 단계는 끝내는 대신 에스컬레이션 기한을 돌려주므로 아무것도 기록되지 않고 `WakeAt`이 그 타이머가 됩니다. 답을 실어 오는 웹훅이 단계 기록을 쓰고 `WakeAt`을 비우면, 다음 순회가 기록이 말하는 바로 그 자리에서 인스턴스를 집어 듭니다. 이 순회는 레플리카 하나로 돌리거나, 인스턴스를 집을 때 리스를 잡습니다. 복합 키가 막는 것은 단계가 두 번 *기록되는* 일이지, 워커 둘이 동시에 *실행하는* 일이 아닙니다.

앞쪽 절반만 필요하다면, 그러니까 02:00에 무언가를 확실히 돌리고 실행 이력과 재시도 정책을 갖는 것까지만 필요하다면, Hangfire와 Quartz.NET이 워크플로를 모델링하라고 요구하지 않고 그 일을 해 줍니다. 인스턴스가 하나라면 `PeriodicTimer`를 쓰는 `IHostedService`로 충분합니다. 인스턴스가 둘이 되는 순간 잠금을 잡는 스케줄러나 타이머 앞의 리더 선출 중 하나가 필요합니다. 그러지 않으면 작업은 매일 밤 두 번 돌고, 문제가 될 때까지 아무도 알아채지 못합니다.
