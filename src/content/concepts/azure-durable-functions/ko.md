---
title: "Azure Durable Functions"
summary: "Azure Durable Functions는 워크플로를 평범한 C#으로 쓰게 해 주는 서버리스 방식입니다. 오케스트레이터의 await 지점이 체크포인트이고, 런타임은 그 사이에 함수를 내려놨다가 이벤트 소싱된 기록으로부터 다시 실행합니다. 그래서 프로세스가 죽어도, 인스턴스가 줄어도, 며칠짜리 기다림이 끼어도 살아남습니다."
category: "예약 작업과 워크플로"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: Human Approval
    slug: human-approval
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-code-constraints
---

## 언제 쓰나

- 함수 여러 개를 조율해야 하고 그 조율 자체가 믿을 만해야 할 때 꺼냅니다. 차례로 잇는 형태와, 액티비티 100개로 펼쳤다가 결과를 다시 모으는 형태가 이것이 존재하는 두 가지 이유입니다. 둘 다 단계마다 큐를 두고 완료 개수를 세는 테이블을 붙이는 대신 `await` 몇 줄로 끝납니다.
- 과정 안에 기다림이 들어 있을 때 씁니다. `context.CreateTimer`는 배포를 넘겨서도 살아남고, `WaitForExternalEvent`는 월요일에야 돌아올 승인을 위해 인스턴스를 열어 둡니다. 둘 다 스레드도 잠금도 떠 있는 인스턴스도 붙들지 않습니다. human approval 페이지가 그 모양을 설명하고, 이쪽은 아무것도 직접 운영하지 않고 그 모양을 구현해 주는 런타임 하나입니다.
- 내구성 있는 오케스트레이션은 원하지만 서버는 두고 싶지 않을 때 씁니다. 기록은 Azure Storage나 Netherite 백엔드에 살고, 스케일 컨트롤러가 큐 깊이를 보고 인스턴스를 늘리고 줄이며, 소비 요금제는 인스턴스가 기다리며 보낸 며칠이 아니라 액티비티 실행에 요금을 매깁니다. 일주일을 놀고 있는 워크플로는 노는 동안 거의 공짜입니다.
- 그림이 사실은 프로그램일 때 상태 기계를 코드로 씁니다. 오케스트레이터 안의 분기와 반복과 오류 처리는 `if`와 `while`과 `try`입니다. 같은 전이를 테이블에 흩어 놓는 것보다 읽기도 테스트하기도 쉽고, 손으로 만든 상태 기계였다면 따로 설계해야 했을 감사 기록을 히스토리가 그냥 줍니다.

## 주의점

- 오케스트레이터는 결정적이어야 합니다. 재개할 때마다 처음부터 다시 실행되기 때문입니다. `DateTime.UtcNow`, `Guid.NewGuid()`, `Random`, 직접 부르는 HTTP나 데이터베이스 호출, 순서가 보장되지 않는 LINQ 정렬은 모두 재생할 때 처음과 다른 답을 내놓고, 런타임은 자기 자리를 잃습니다. `context.CurrentUtcDateTime`과 `context.NewGuid()`와 `CallActivityAsync`를 쓰고, 첫 오케스트레이터를 쓰기 전에 코드 제약 문서를 읽어 보세요.
- 부작용은 전부 액티비티에 있어야 하고, 예외를 둘 만한 경우는 없습니다. 액티비티는 기록된 결과마다 한 번만 돌고 그 출력이 히스토리에 남으므로, 재생은 다시 부르는 대신 기록된 값을 돌려줍니다. 오케스트레이터에서 직접 한 일은 재생할 때마다 다시 일어납니다. 재시도를 하나도 설정하지 않았는데 같은 메일이 다섯 번 나가는 경로가 이것입니다.
- 인스턴스가 진행 중인 상태에서 오케스트레이터를 바꾸면 그 인스턴스의 재생이 깨집니다. 버전 1로 시작한 인스턴스는 버전 1의 기록에 대고 재생됩니다. 가운데에 액티비티 호출을 하나 끼워 넣고 배포하면 재생이 만나는 기록은 더 이상 코드와 맞지 않습니다. 지원되는 답은 새 버전을 별도 함수 앱이나 다른 오케스트레이터 이름으로 배포해 옛 인스턴스를 있던 자리에서 끝내게 두거나, 진행 중인 인스턴스가 다 빠진 뒤에 배포하는 것입니다. 첫 릴리스 전에 하나를 골라 두세요.
- 히스토리가 길어지면 재생마다 돈과 시간이 듭니다. 대개 범인은 반복문입니다. 끝없이 폴링하는 영구 오케스트레이션은 이벤트를 쌓다가 결국 재생 자체가 느린 부분이 됩니다. 해법은 `ContinueAsNew`입니다. 상태만 새로 넘기고 히스토리는 비운 채 인스턴스를 다시 시작하는데, 나중에 붙이는 최적화가 아니라 감시나 반복 성격의 워크플로에서는 처음부터 표준 형태입니다.

## .NET에서는

- isolated worker 모델에서 오케스트레이터는 다른 것과 다를 바 없는 함수이고, 그것을 재생 가능하게 지켜 주는 API 표면은 `TaskOrchestrationContext` 하나입니다.

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var signup = context.GetInput<Signup>()!;

    // Each call is a checkpoint: the result is written to the history, so a
    // replay returns the recorded value instead of running the activity again.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), signup);

    // A retry policy belongs to one activity, not to the orchestration.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // Neither of these holds a thread. Note the deterministic clock: the
    // deadline is derived from context, never from DateTime.UtcNow.
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

- I/O가 허용되는 곳은 액티비티이고, 액티비티에는 메시지 처리에서와 같은 의무가 따라옵니다. 런타임이 같은 액티비티를 두 번 돌릴 수 있으므로, 바깥에 영향을 주는 단계에는 상대편이 중복을 걸러 낼 수 있는 키가 필요합니다.
- 외부 이벤트는 클라이언트로 올리고, 인스턴스 id는 생성하지 말고 정해서 씁니다. 워크플로가 다루는 대상에서 끌어낸 id로 `ScheduleNewOrchestrationInstanceAsync`를 부르면 같은 주문에 대한 두 번째 인스턴스를 런타임이 거절해 주는데, 이보다 싼 중복 제거는 없습니다. 승인 웹훅이 부르는 쪽은 이벤트 이름을 담은 `RaiseEventAsync`입니다.
- 저장소 공급자는 의식적으로 고릅니다. 기본값인 Azure Storage 백엔드는 시작 비용이 가장 싸고 팬아웃이 심할 때 가장 느립니다. Netherite와 Microsoft SQL 공급자는 처리량을 얻는 대신 비용과 운영 부담을 치릅니다. 그리고 이들 사이를 옮기는 일은 코드 변경이 아니라 재배포입니다.
