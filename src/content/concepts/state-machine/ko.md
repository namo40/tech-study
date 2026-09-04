---
title: "State Machine"
summary: "상태 머신은 어떤 대상이 놓일 수 있는 상태와, 그 사이를 옮기는 이벤트를 이름 붙여 정리한 것입니다. 표에 없는 일은 일어날 수 없고, 현재 상태는 저장했다가 이어받을 수 있으며, 오래 걸리는 프로세스는 기다리고 만료되고 한 단계씩 재시도하는 기계가 됩니다."
category: "예약 작업과 워크플로"
scene: state-machine
steps:
  - title: "상태와 이벤트"
    text: "주문은 Draft, Submitted, Paid, Shipped, Delivered 중 하나이고, 표에 적힌 이벤트만 상태를 옮깁니다. 아무도 결제하지 않은 주문을 발송하는 것은 따로 써야 할 오류 경로가 아니라, 그냥 표에 없는 일입니다."
  - title: "guard와 action"
    text: "전이에는 만족해야 할 조건과 지나가며 실행할 동작을 붙일 수 있습니다. 표는 겹겹이 쌓인 if가 숨기는 것을 드러냅니다. 모든 상태, 허용된 모든 이벤트, 각 간선에서 일어나는 일입니다."
  - title: "저장합니다"
    text: "현재 상태는 저장소의 행 하나이므로 재시작해도 멈춘 바로 그 자리에서 이어집니다. 시간도 이벤트입니다. 아무도 결제하지 않은 제출 주문은 타이머가 울리면 만료됩니다."
  - title: "오래 걸리는 프로세스"
    text: "승인을 며칠 기다리고, 불안정한 단계를 재시도하고, 재시작을 견디는 프로세스는 내구성 있는 history를 가진 상태 머신입니다. 워크플로 엔진은 그 history를 재생해 상태를 다시 만들므로, 코드는 며칠에 걸쳐 조각조각 실행됐어도 한 줄로 읽힙니다."
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: Human Approval
    slug: human-approval
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retryable Step
    slug: retryable-step
  - label: Scheduled Job
    slug: scheduled-job
  - label: Saga
    slug: saga
  - label: Orchestration
    slug: orchestration
  - label: Idempotency
    slug: idempotency
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: "Stateless, a state machine library for .NET"
    url: https://github.com/dotnet-state-machine/stateless
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Dapr Workflow overview"
    url: https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/
---

## 언제 쓰나

- 생애 주기를 가진 모든 대상. 주문, 구독, 문서, 작업, 커넥션이 그렇습니다. 도메인이 이미 "무슨 상태에 있다"는 말을 쓰고 있다면 상태 이름은 이미 정해진 것이고, 없는 것은 표뿐입니다.
- 다음에 무엇이 허용되는지가 지금 어디에 있는지에 달려 있고, 그 규칙을 여러 핸들러에 흩뿌려 두는 대신 한곳에서 읽고 싶을 때.
- 대기, 기한, 재시도, 사람이 개입하는 단계가 있어 요청 하나보다 오래 사는 프로세스일 때. 이런 일은 한 스레드에서 끝까지 달려서는 처리할 수 없습니다.
- 어떤 순서가 허용되는지를 두고 두 사람의 의견이 갈릴 때. 표가 있으면 논쟁은 호출 지점을 순회하는 일이 아니라 다섯 줄을 리뷰하는 일이 됩니다.

## 주의점

- 상태와 이벤트를 먼저 정합니다. 표가 곧 명세입니다. 어떤 전이가 없다면 그것은 버그가 아니라 결정이고, 있는 전이만큼 쉽게 가리킬 수 있어야 합니다.
- 상태와 대기 중인 타이머를 함께 저장합니다. 재시작은 기록된 것에서 다시 세워야지 메모리에 남은 것으로 추측해서는 안 되고, `Timer` 객체 안에만 있는 기한은 그 프로세스와 함께 사라집니다.
- 전이는 반복해도 안전해야 합니다. 같은 이벤트가 두 번 도착해도 기계가 두 번 움직여서는 안 됩니다. 이벤트 id로 중복을 걸러 내거나, 핸들러가 떠나려는 상태를 확인하게 만드십시오.
- 상태 개수를 주시합니다. 상태 일곱에 이벤트 넷이면 표지만, 상태 마흔에 이벤트 서른이면 아무도 읽지 않는 그림입니다. 애그리거트별로 기계를 나누거나, 달라지는 부분을 데이터로 끌어올리십시오.
- 인스턴스가 진행 중인데 워크플로 코드를 바꾸려면 버전 관리가 필요합니다. history를 재생해 상태를 세우는 엔진은 옛 history를 새 코드로 다시 흘려보내므로, 이미 일어난 일의 모양이 새 코드에도 이해 가능한 채로 남아 있어야 합니다.
- 규모에 맞는 도구를 고릅니다. 프로세스 안의 생애 주기에는 라이브러리, 서비스를 넘나드는 단계에는 사가, 며칠씩 대기와 재시도가 이어지는 프로세스에는 워크플로 엔진입니다.

## .NET에서는

`Stateless`는 표를 코드로 옮겨 놓습니다. 기계는 넘겨받은 두 함수를 통해 상태를 읽고 쓰므로, 상태 자체는 엔티티 안에 남아 나머지 필드와 함께 데이터베이스로 갑니다.

```csharp
public enum OrderState { Draft, Submitted, Paid, Shipped, Delivered, Cancelled, Expired }
public enum OrderTrigger { Submit, Pay, Ship, Deliver, Cancel, Timeout }

var machine = new StateMachine<OrderState, OrderTrigger>(() => order.State, s => order.State = s);

machine.Configure(OrderState.Draft)
    .Permit(OrderTrigger.Submit, OrderState.Submitted);

machine.Configure(OrderState.Submitted)
    .PermitIf(OrderTrigger.Pay, OrderState.Paid, () => payments.IsConfirmed(order.Id))   // guard
    .Permit(OrderTrigger.Cancel, OrderState.Cancelled)
    .Permit(OrderTrigger.Timeout, OrderState.Expired);

machine.Configure(OrderState.Paid)
    .OnEntryAsync(() => mail.SendReceiptAsync(order.Id))                                  // action
    .Permit(OrderTrigger.Ship, OrderState.Shipped)
    .Permit(OrderTrigger.Cancel, OrderState.Cancelled);

machine.Configure(OrderState.Shipped).Permit(OrderTrigger.Deliver, OrderState.Delivered);

if (machine.CanFire(OrderTrigger.Ship)) await machine.FireAsync(OrderTrigger.Ship);
await db.SaveChangesAsync(ct);   // the state is a column; timers are rows with a due time
```

`CanFire`가 표를 두는 이유 그 자체입니다. 어떤 이벤트가 허용되는지 묻는 데 비용이 들지 않고, 그 답이 실제로 실행될 핸들러를 읽어 보는 일에 달려 있지 않습니다.

며칠씩 이어지는 프로세스라면 history를 직접 관리하는 엔진에 기계를 맡깁니다. Azure Durable Functions, Temporal .NET SDK, Dapr Workflow는 모두 인스턴스에 이미 일어난 일을 재생해 상태를 다시 세웁니다. 그래서 오케스트레이션을 타이머나 외부 이벤트를 await하는 평범한 순차 코드로 쓰고도, 다른 머신에서 이어 실행할 수 있습니다. 단계가 하나의 프로세스가 아니라 여러 서비스에 걸쳐 있다면 사가로 잇고, 조정은 MassTransit 상태 머신에 맡기십시오.
