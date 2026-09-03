---
title: "Task"
summary: "Task는 아직 끝나지 않은 일에 대한 약속 객체입니다. 상태와 결과 또는 예외, 그리고 끝나기를 기다리는 continuation을 담습니다. 스레드가 아니라 손잡이이고, Task를 반환한다는 사실만으로는 스레드가 붙잡혀 있는지 알 수 없습니다."
category: "Pool과 자원 관리"
scene: async-await
sceneStep: 1
related:
  - label: Async/Await
    slug: async-await
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Bounded Concurrency
    slug: bounded-concurrency
references:
  - title: "The Task asynchronous programming model"
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/task-asynchronous-programming-model
  - title: "Task-based Asynchronous Pattern (TAP)"
    url: https://learn.microsoft.com/en-us/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap
---

장면의 첫 단계는 메서드가 끝나지 않은 `Task`를 호출자에게 돌려주는 것으로 끝납니다. 이 페이지가 다루는 것이 그 객체입니다. Task는 아직 끝나지 않은 일에 대한 약속입니다. 실행 중인지 성공했는지 실패했는지 취소되었는지를 나타내는 상태, 결과가 생겼다면 그 결과, 예외가 있었다면 그 예외, 그리고 결말이 났을 때 실행할 continuation 목록을 담고 있습니다. 스레드가 아니고, 일 자체도 아닙니다. 그 일을 하고 있지 않은 쪽이 일이 끝났다는 사실을 알아낼 수 있게 해 주는 손잡이입니다.

평범한 객체이므로 붙잡아 두고, 필드에 담고, 다른 메서드에 넘기고, 원하는 시점에 await할 수 있습니다. 두 번 await해도 되는데, 그때는 다시 하는 것이 아니라 같은 결과를 그대로 돌려줍니다. 결말이 난 Task는 하나의 값이기 때문입니다. 일은 이미 시작되어 있습니다. 시작시킨 것은 호출이고, await는 언제 알려 받을지만 정합니다.

```csharp
Task<Order> pending = GetOrderAsync(id);   // running from here
var summary = BuildSummary();              // unrelated work, no waiting
Order order = await pending;               // the same object, collected later
```

타입만 보아서는 스레드가 관여하는지 알 수 없습니다. `Task.Run`은 델리게이트를 스레드 풀에 예약합니다. 지금 스레드에서 치우고 싶은 CPU 작업에는 맞는 도구이고, I/O에는 맞지 않는 도구입니다. I/O에서는 운영체제가 이미 알아서 처리하고 있는 것을 기다리려고 풀 스레드 하나를 세워 두는 꼴이 됩니다. 끝까지 비동기로 이어지는 메서드는 그동안 스레드를 하나도 차지하지 않은 채 Task를 돌려줍니다. 둘 다 같은 타입을 반환하므로 시그니처는 증거가 되지 못합니다. 막히는 호출을 감싸 놓고 이름에 `Async`만 붙인 것은 막힌 스레드를 없앤 것이 아니라 옮긴 것이고, 어느 쪽이든 값은 풀이 치릅니다.

Task가 값을 하는 자리는 조합 도구들인데, 각각 알아 둘 만한 모서리가 있습니다. `Task.WhenAll`은 여럿을 한 번에 기다리고, await하면 첫 예외를 다시 던지며 나머지는 반환된 task에 남습니다. 그래서 await가 던진 것만 기록하는 핸들러는 나머지를 조용히 흘려버립니다. `Task.WhenAny`는 가장 먼저 결말이 난 것을 주고 진 쪽은 계속 돌게 두므로, 그쪽이 나중에 실패했을 때 갈 곳을 마련해 두어야 합니다. `Task.CompletedTask`와 `Task.FromResult`는 예약 없이 이미 끝난 것을 돌려주고, `ValueTask`는 대개 동기로 끝나는 뜨거운 경로를 위해 있으며 대신 한 번만 await할 수 있습니다. 가장 날카로운 모서리는 아무도 await하지 않는 Task입니다. 던져 놓고 잊는 호출은 결과와 함께 예외까지 버리고, 첫 await 전에 한꺼번에 시작해 둔 Task 목록은 고를 생각 없이 골라 버린 동시 실행 수준입니다.
