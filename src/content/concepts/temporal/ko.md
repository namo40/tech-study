---
title: "Temporal"
summary: "Temporal은 우리가 직접 운영하는 내구 실행 플랫폼입니다. 워크플로 코드를 도는 쪽은 우리 워커이고 이벤트 히스토리를 쥐는 쪽은 Temporal 서버라서, 프로세스가 죽든 배포가 나가든 일주일을 기다리든 그것은 잃어버린 작업이 아니라 히스토리 두 항목 사이의 빈 구간일 뿐입니다."
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
  - label: Retryable Step
    slug: retryable-step
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: Temporal Documentation
    url: https://docs.temporal.io/
  - title: Temporal .NET SDK
    url: https://docs.temporal.io/develop/dotnet
---

## 언제 쓰나

- 업무 과정이 며칠이나 몇 주에 걸쳐 돌고 그것을 읽히는 프로그램 하나로 써야 할 때 씁니다. 구독의 일생, 보험금 청구 처리, 시스템 네 곳과 승인 두 번을 거치는 온보딩 같은 것들입니다. 워크플로로 쓰면 이것은 반복과 분기가 들어간 메서드 하나이고, 그 몇 주 동안 일어나는 모든 재시작을 플랫폼이 넘겨 줍니다. 상태가 status 컬럼과 cron 작업에 흩어질 일이 없습니다.
- 바깥에서 실행 중인 인스턴스와 이야기해야 할 때 씁니다. 시그널은 실행 도중인 워크플로에 이벤트를 넣어 주고, 쿼리는 아무것도 바꾸지 않고 현재 상태를 읽어 오고, 업데이트는 한 호출에서 둘 다 합니다. 취소나 정정이나 승인이 이미 진행 중인 작업에 닿는 방식이 이것이고, 손으로 만든 워크플로 테이블이 대개 끝내 갖추지 못하는 부분입니다.
- 재시도와 타임아웃을 코드가 아니라 선언으로 두고 싶을 때 꺼냅니다. 액티비티마다 재시도 정책과 타임아웃 묶음이 붙습니다. 그래서 백오프와 시도 횟수 한도, 그리고 "이번 시도가 너무 오래 걸렸다"와 "액티비티 전체가 너무 오래 걸렸다"의 차이가, 누군가 한 번 써 놓고 아무도 손대지 않는 `while` 반복문이 아니라 호출부의 설정이 됩니다.
- 내구 실행은 원하지만 설계를 특정 클라우드에 묶고 싶지 않을 때 고릅니다. 서버는 오픈 소스이고 우리 인프라에서 우리 데이터베이스를 두고 돌며, SDK는 우리 서비스 안의 평범한 라이브러리이고, Temporal Cloud는 옮겨 타야 하는 다른 제품이 아니라 같은 API의 관리형 선택지입니다.

## 주의점

- 워크플로 코드는 결정적이어야 하고, 규칙은 재생 기반 엔진이라면 어디서나 같습니다. 벽시계 시각 읽기, `Guid.NewGuid()`, `Random`, 직접 I/O, 그리고 돌고 있는 기계에 의존하는 것들은 재생할 때 다른 답을 내놓고 워크플로를 자기 히스토리와 어긋나게 만듭니다. `Workflow.UtcNow`와 `Workflow.NewGuid()`와 `Workflow.DelayAsync`와 액티비티를 쓰고, 나머지는 SDK의 분석기와 재생 테스트가 잡아 줍니다.
- 인스턴스가 도는 중에 워크플로 로직을 바꾸는 일은 나중에 발견할 문제가 아니라 미리 계획해 둘 운영 문제입니다. 옛 인스턴스는 새 코드가 더 이상 만들어 내지 않는 히스토리에 대고 재생되고, 결과는 틀린 답이 아니라 비결정성 오류입니다. Temporal의 답은 patching입니다. `Workflow.Patched`로 바뀐 분기를 표시해 옛 히스토리는 옛 길을, 새 히스토리는 새 길을 밟게 하고, 나중에 `DeprecatePatch`를 거쳐 옛것이 남지 않으면 그때 걷어냅니다. 이 세 단계가 버저닝 이야기의 전부이니 첫 변경 전에 익혀 두세요.
- 분산 시스템을 운영하는 것이고, 자체 호스팅은 그것을 떠맡는다는 뜻입니다. 서버에는 데이터베이스(Cassandra, MySQL, PostgreSQL)와 visibility 저장소가 필요하고, 거기에 늘 따라오는 모니터링과 업그레이드와 용량 산정이 붙습니다. 보존 설정이 히스토리가 얼마나 오래 남고 저장소가 얼마나 커지는지를 정합니다. Temporal Cloud는 그 일을 없애는 대신 청구서와 공급자를 남깁니다. 둘 다 괜찮은 선택이고, 앞쪽이 공짜인 척하는 것만 아닙니다.
- 태스크 큐와 워커 용량이 곧 처리량 설계이지 사소한 항목이 아닙니다. 워커는 이름 붙은 태스크 큐를 폴링하고, 워커가 포화된 큐는 그냥 태스크를 쌓습니다. 워크플로 태스크와 액티비티 태스크는 동시성 한도가 따로 있고, 오래 걸리는 액티비티를 짧은 것과 같은 큐에 두면 짧은 쪽이 굶습니다. 부하가 이유를 보여 주기 전에 작업 성격으로 큐를 나눠 두세요.

## .NET에서는

- Temporalio SDK에서 워크플로는 클래스이고 액티비티는 평범한 메서드입니다. 워크플로 본문은 I/O를 직접 건드리지 않고, 바깥에 영향을 주는 일은 전부 `ExecuteActivityAsync`를 지나며, 히스토리에 기록되는 것도 그것입니다.

```csharp
[Workflow]
public class OnboardWorkflow
{
    [WorkflowRun]
    public async Task<string> RunAsync(Signup signup)
    {
        // Timeouts and retries are declared on the call, not coded in a loop.
        var account = await Workflow.ExecuteActivityAsync(
            (Activities a) => a.CreateAccountAsync(signup),
            new()
            {
                StartToCloseTimeout = TimeSpan.FromMinutes(2),
                RetryPolicy = new() { MaximumAttempts = 4, InitialInterval = TimeSpan.FromSeconds(5) },
            });

        // A durable wait: no thread, and it survives a worker restart. The
        // condition is fed by the signal handler below.
        if (!await Workflow.WaitConditionAsync(() => approved is not null, TimeSpan.FromDays(3)))
        {
            return "escalated";
        }

        return approved == true ? "active" : "rejected";
    }

    private bool? approved;

    // The outside world reaches a running instance through signals.
    [WorkflowSignal]
    public Task ApproveAsync(bool decision)
    {
        approved = decision;
        return Task.CompletedTask;
    }
}
```

- 태스크 큐를 고르는 자리는 워커를 등록하는 곳이고, 이것은 의식적인 선택입니다. `TemporalWorker`는 클라이언트와 큐 이름과 워크플로 타입과 액티비티 인스턴스를 묶습니다. 그래서 느린 액티비티를 별도 큐와 별도 워커 프로세스로 떼어 내는 일이 다시 쓰기가 아니라 등록을 바꾸는 일이 됩니다.
- 액티비티는 두 번 이상 돌 수 있으므로 중복 제거의 의무는 그대로입니다. Temporal이 보장하는 것은 워크플로의 진행이지 액티비티의 부작용이 정확히 한 번 일어난다는 것이 아닙니다. 그리고 오래 걸리는 액티비티에 하트비트를 붙이면 서버가 타임아웃을 끝까지 기다리지 않고 죽은 워커를 알아챌 수 있습니다.
- 행복한 경로만 말고 재생도 테스트합니다. SDK는 기록된 히스토리를 현재 코드에 대고 돌려 보고 더 이상 맞지 않으면 실패시킬 수 있습니다. 위의 버저닝 주의점이, 지난주에 시작한 인스턴스를 배포가 깨뜨리기 전에 CI에서 도는 검사가 되는 셈입니다.
