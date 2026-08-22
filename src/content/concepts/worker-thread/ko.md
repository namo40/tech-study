---
title: "Worker Thread"
summary: "Worker Thread는 큐에 쌓인 작업 항목을 실행하는, 풀의 범용 스레드입니다. I/O 완료 스레드는 그와 별개의 묶음으로, 운영체제가 끝낸 작업을 이어받습니다."
category: "Pool과 자원 관리"
scene: thread-pool
sceneStep: 1
related:
  - label: Thread Pool
    slug: thread-pool
  - label: I/O Completion Port
    slug: io-completion-port
references:
  - title: The managed thread pool
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool
---

풀은 두 종류의 스레드를 둡니다. Worker Thread는 큐에 들어온 것을 실행합니다. `Task.Run`의 본문, 타이머 콜백, 요청 처리기의 동기 구간 같은 것들입니다. I/O 완료 스레드는 운영체제가 끝낸 작업을 이어받기 위해 있습니다. 덕분에 `await` 뒤의 연속 작업이 실행될 자리가 생기고, 그동안 워커 스레드가 놀면서 기다릴 필요가 없습니다. 둘 다 각자의 최소치와 최대치를 가지며, `ThreadPool.SetMinThreads`는 두 가지를 함께 설정합니다.

최소치는 풀이 망설임 없이 만들어 주는 스레드 수입니다. 그 위로는 새 스레드가 천천히, 대략 초당 하나꼴로 늘어납니다. 이 속도 때문에 starvation은 완만한 비탈이 아니라 절벽처럼 느껴지고, 그래서 최소치를 올리는 것이 해결처럼 보입니다. 해결이 아닙니다. 최소치를 올리면 같은 벽에 부딪히기 전까지 버틸 수 있는 버스트가 커질 뿐이므로, 예상되는 기동 직후의 스파이크를 넘기는 용도로만 쓰고 막고 있는 호출을 덮는 데 쓰지 않습니다.
