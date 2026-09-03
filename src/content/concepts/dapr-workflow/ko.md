---
title: "Dapr Workflow"
summary: "Dapr Workflow는 Dapr 런타임의 내구 워크플로 빌딩 블록입니다. 오케스트레이션은 우리가 쓰는 언어의 SDK로 쓰고, 진행 상태는 사이드카가 구성된 상태 저장소에 남기며, 재생 기반 실행 모델은 Durable Functions와 Temporal이 쓰는 것과 같은 계열입니다."
category: "예약 작업과 워크플로"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: State Machine
    slug: state-machine
  - label: Human Approval
    slug: human-approval
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Sidecar
    slug: sidecar
  - label: Scheduled Job
    slug: scheduled-job
references:
  - title: "Dapr Workflow overview"
    url: https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/
---

## 언제 쓰나

- 서비스가 이미 Dapr로 돌고 있고 이제 오래 걸리는 과정이 필요할 때 씁니다. 워크플로는 상태 관리나 pub/sub 옆에 놓이는 빌딩 블록 하나로 도착하고, 같은 사이드카를 지나 닿고, 같은 컴포넌트 파일로 구성되고, 같은 접근 제어로 보호됩니다. 배포할 두 번째 런타임도, 관리할 두 번째 자격 증명 묶음도 생기지 않습니다.
- 우리 쿠버네티스 클러스터 위에서 내구 오케스트레이션을 돌릴 때 씁니다. 엔진은 호스팅 서비스가 아니라 우리 프로세스 옆의 사이드카에서 돕니다. 그래서 재시작을 넘기는 여러 단계짜리 과정을, 별도의 워크플로 서버를 들이지 않고도 자체 호스팅 플랫폼에서 쓸 수 있습니다.
- 문제의 모양이 액티비티와 타이머와 외부 이벤트와 자식 워크플로일 때 꺼냅니다. 이 네 가지 기본 요소가 대부분의 오케스트레이션을 덮습니다. 단계를 호출해 내구적인 결과를 받고, 스레드를 붙들지 않고 하루를 자고, 바깥에서 오는 승인을 기다리고, 큰 과정을 서로 호출하는 워크플로로 쪼갭니다.
- 특정 클라우드의 서버리스 오케스트레이터와 본격적인 워크플로 플랫폼 사이의 중간 지점으로 생각해 봅니다. Durable Functions보다 한 공급자에 덜 묶이고 Temporal 클러스터를 운영하는 것보다 손이 덜 갑니다. 기능의 깊이보다 이식성이 더 중요할 때 합리적인 선택이 되는 이유입니다.

## 주의점

- 워크플로 코드는 결정적이어야 하고, 이 규칙은 Dapr의 별난 점이 아니라 계열 공통의 규칙입니다. 엔진은 워크플로를 히스토리로부터 재생해 상태를 복원합니다. 그래서 `DateTime.UtcNow`와 `Guid.NewGuid()`와 `Random`과 직접 I/O는 재생할 때 다른 답을 내놓고 인스턴스를 어긋나게 만듭니다. 시각은 워크플로 컨텍스트로 읽고, 난수는 액티비티 안에서 만들고, 바깥에 영향을 주는 일은 전부 `CallActivityAsync` 뒤에 둡니다. Durable Functions와 Temporal도 각자의 API로 같은 제약을 말하므로, 한 번 익히면 셋에 다 통합니다.
- 상태 저장소가 곧 내구성이고, 그 저장소의 보장이 그대로 워크플로의 보장이 됩니다. 진행 상태는 우리가 구성한 컴포넌트에 삽니다. 그래서 트랜잭션을 지원하지 않거나 백업이 없거나 내구성이 없는 저장소를 고르면 워크플로도 똑같아집니다. 오래 사는 인스턴스를 안전하다고 여기기 전에, 고른 저장소가 트랜잭션과 액터 상태 요구 사항을 지원하는지 확인합니다.
- 사이드카는 이제 우리가 운영하는 런타임입니다. 워크플로 호스트마다 Dapr 사이드카가 닿을 수 있고 건강해야 하고, 그 밑의 액터 모델을 위해 placement 서비스도 있어야 하고, 런타임을 올리는 일은 라이브러리 버전을 올리는 일이 아니라 함께 맞춰야 하는 작업입니다. 사이드카가 없는 워크플로는 컴파일 시점에 요란하게 실패하지 않고 시작할 때 실패합니다.
- 여기 나온 세 엔진 중에서 가장 어리니 버전을 고정하고 그 버전의 릴리스 노트를 읽습니다. 이 빌딩 블록은 안정성 단계를 거쳐 왔고 릴리스 사이에서 API와 기본값이 바뀌었습니다. 오래된 예제가 믿을 만한 안내가 되지 못하는 이유입니다. 실제로 배포할 런타임 버전의 안정성 표기를 확인하세요.

## .NET에서는

- `Dapr.Workflow` 패키지에서 워크플로는 `RunAsync` 메서드를 가진 클래스이고 액티비티는 별도의 클래스입니다. 워크플로 본문은 서비스를 직접 호출하지 않습니다. 바깥에 영향을 주는 일은 전부 `CallActivityAsync`를 지나고, 히스토리에 기록되는 것도 재생이 건너뛸 수 있는 것도 그것입니다.

```csharp
public class OrderWorkflow : Workflow<OrderPayload, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, OrderPayload order)
    {
        // Activities are the only place I/O is allowed.
        var reserved = await context.CallActivityAsync<bool>(nameof(ReserveStock), order);
        if (!reserved) return "rejected";

        // A durable wait for something outside: no thread, survives a restart.
        try
        {
            await context.WaitForExternalEventAsync<Approval>("approval", TimeSpan.FromDays(2));
        }
        catch (TaskCanceledException)
        {
            await context.CallActivityAsync(nameof(ReleaseStock), order);
            return "expired";
        }

        // The clock comes from the context, never from DateTime.UtcNow.
        await context.CreateTimer(context.CurrentUtcDateTime.AddMinutes(5), CancellationToken.None);
        await context.CallActivityAsync(nameof(ChargeCard), order);
        return "completed";
    }
}
```

- 등록과 호스팅은 평범한 ASP.NET Core 배선입니다. `builder.Services.AddDaprWorkflow(o => { o.RegisterWorkflow<OrderWorkflow>(); o.RegisterActivity<ReserveStock>(); })`가 워크플로 타입을 호스트에 넣고, 그다음 프로세스는 사이드카를 옆에 둔 채로 돌아야 합니다. 개발에서는 `dapr run`이고 쿠버네티스에서는 파드에 붙이는 `dapr.io/enabled` 주석입니다.
- 인스턴스를 시작하고 조회하고 종료하는 일은 메시지가 아니라 클라이언트 호출입니다. `DaprWorkflowClient`가 우리가 고른 id로 새 인스턴스를 예약하고, 현재 상태를 읽고, 돌고 있는 인스턴스에 외부 이벤트를 넣고, 종료시킵니다. 운영 도구나 HTTP 엔드포인트가 상태 저장소에 손을 넣지 않고 인스턴스를 다루는 방식이 이것입니다.
- 액티비티는 두 번 이상 돌 수 있으므로 중복 제거의 의무는 그대로입니다. 재시도된 액티비티는 이미 일어난 부작용을 되풀이할 수 있고, 엔진이 보장하는 것은 워크플로의 진행이지 정확히 한 번의 효과가 아닙니다. 재생 기반 엔진이라면 어디서나 같은 값을 치릅니다.
