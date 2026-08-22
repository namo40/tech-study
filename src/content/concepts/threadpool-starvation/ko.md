---
title: "Thread Pool Starvation"
summary: "Thread Pool Starvation은 스레드가 있는데도 전부 막혀 있어 일을 못 하는 상태입니다. CPU는 놀고 있는데 큐는 쌓이고 지연 시간은 계단처럼 뜁니다."
category: "Pool과 자원 관리"
scene: thread-pool
sceneStep: 2
related:
  - label: Thread Pool
    slug: thread-pool
  - label: Async/Await
    slug: async-await
  - label: dotnet-counters
    slug: dotnet-counters
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

증상이 뚜렷합니다. 지연 시간이 매끄럽게 오르지 않고 계단처럼 뜁니다. 풀이 스레드를 천천히 보태고, 새로 보탠 스레드가 잠깐씩 큐를 덜어 주기 때문입니다. 큐 길이는 계속 자라고, 그동안 CPU는 낮게 유지됩니다. 요청이 Timeout으로 죽는데 장비는 거의 일하지 않고 있다면, 용량이 모자란 경우는 거의 없습니다.

원인은 거의 언제나 동기와 비동기를 뒤섞은 코드입니다. 요청 경로 어딘가의 `.Result`, `.Wait()`, `GetAwaiter().GetResult()`, 동기 데이터베이스 호출이나 동기 HTTP 호출입니다. 그 하나하나가 대기가 끝날 때까지 풀 스레드를 붙잡아 두고, 요청 수가 스레드 수를 넘어서는 순간부터 새 요청은 아무 일도 하지 않고 기다리기만 하는 작업 뒤에 줄을 섭니다.

진단은 `dotnet-counters monitor --counters System.Runtime`으로 합니다. `ThreadPool Queue Length`가 자라는 동안 `ThreadPool Thread Count`가 초당 하나꼴로 슬금슬금 오르고 CPU 사용률은 평평하다면 starvation입니다. 해법은 최소 스레드 수를 올리는 것이 아니라 막고 있는 호출을 찾는 것입니다.
