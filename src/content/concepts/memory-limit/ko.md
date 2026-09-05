---
title: "Memory Limit"
summary: "컨테이너가 붙들리는 천장입니다. CPU limit을 넘으면 프로세스가 스로틀링되고, memory limit을 넘으면 잡을 예외도 로그 한 줄도 없이 종료됩니다."
category: "컨테이너와 오케스트레이션"
scene: memory-pressure
sceneStep: 3
related:
  - label: Memory Pressure
    slug: memory-pressure
  - label: Resource Limit
    slug: resource-limit
  - label: Resource Request
    slug: resource-request
  - label: CPU Limit
    slug: cpu-limit
  - label: Allocation Rate
    slug: allocation-rate
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: Server GC
    slug: server-gc
  - label: ArrayPool
    slug: arraypool
references:
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Assign Memory Resources to Containers and Pods"
    url: https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
---

memory limit은 매니페스트에 적힌 숫자이자 그 뒤에 있는 커널의 강제 장치입니다. 컨테이너 런타임이 그 값을 cgroup에 기록하고, 그 cgroup의 메모리(익명 페이지에, 회수하지 못하는 페이지 캐시를 더한 것)가 허용치를 넘으면 커널이 그 안의 프로세스 하나를 골라 SIGKILL을 보냅니다. 협상도, 배압도, 유예 시간도 없습니다. 장면의 3단계가 바로 그 순간이고, 그 시점에 애플리케이션 안에서 일어나는 일은 멈춘다는 것 하나뿐입니다.

중요한 단어는 SIGKILL입니다. 처리할 수 없는 신호이므로 그 뒤로 프로세스 안에서는 아무것도 실행되지 않습니다. `catch`도, `finally`도, `IHostApplicationLifetime.ApplicationStopping`도, 로그 버퍼의 마지막 플러시도, 진행 중이던 요청의 성공이나 실패도 없습니다. 이것이 OOM 종료를 `OutOfMemoryException`과 갈라놓는 지점입니다. 후자는 런타임이 할당을 채워 주지 못할 때 던지는 평범한 관리 예외이고 원칙적으로는 잡을 수 있습니다. cgroup 경계에는 실패할 할당 자체가 없습니다. 다음 명령어 시점에 프로세스가 그냥 없고, 날아가던 요청은 호출자가 알아서 해석해야 하는 연결 재설정으로 끝납니다.

이 사실은 고장을 진단하는 방식에 곧바로 영향을 줍니다. 스택 트레이스를 전제로 한 반사 신경은 전부 소용이 없습니다. 스택이 없기 때문입니다. 남는 것은 프로세스 바깥에 있습니다. 파드의 재시작 횟수, `reason: OOMKilled`와 `exitCode: 137`이 적힌 `lastState.terminated` 블록, 그러니까 128에 신호 9를 더한 값, 파드의 이벤트, 그리고 선이 끊기는 순간까지의 메모리 그래프입니다. 로그에 아무것도 없이 20분마다 재시작하는 서비스는 수수께끼가 아니라 이것이고, 확인하는 방법은 로그 문장을 하나 더 넣는 것이 아니라 `kubectl describe pod`입니다.

이 limit에는 읽는 쪽이 하나 더 있고, 둘의 값은 일치해야 합니다. .NET은 컨테이너를 인식합니다. cgroup의 limit을 읽어 기본적으로 그 75%를 힙 하드 리밋으로 삼고, 남은 4분의 1은 스택과 JIT와 네이티브 버퍼처럼 관리 힙이 아닌 나머지 전부에 남겨 둡니다. 두 시각이 맞으면 수집기는 힙이 자기 천장에 가까워질수록 점점 공격적으로 돌면서 프로세스를 살려 두는 경우가 많습니다. 맞지 않으면, 그러니까 다른 기계를 보고 누군가 설정해 둔 `DOTNET_GCHeapHardLimit`이 있거나, cgroup v2를 읽기에 너무 오래된 런타임이거나, 런타임이 볼 수 없는 곳에 limit이 걸려 있으면, 수집기는 커널이 여유롭다고 여겼던 프로세스를 죽이는 순간까지 느긋하게 돕니다.

limit 옆에 있는 request는 다른 결정이고, 둘은 따로 두는 편이 좋습니다. request는 스케줄러가 확보해 두는 값이자 노드 용량을 계획하는 기준이고, limit은 커널이 강제하는 값입니다. 둘을 같게 두면(그리고 파드 안의 모든 컨테이너에서 CPU도 같게 두면) 파드가 Guaranteed가 되는데, 이는 가장 높은 서비스 품질 등급이며 노드 자체가 부족해졌을 때 가장 늦게 축출됩니다. 실제 이득이지만 한가한 노드의 남는 메모리를 쓸 수 있는 여지를 대가로 내줍니다. limit을 request보다 훨씬 높게 두면 그 남는 메모리를 쓸 수 있고 파드는 Burstable이 되는데, 노드가 압박을 받고 하필 가장 나쁜 시점에 축출 대상으로 뽑히기 전까지는 괜찮습니다.

그렇다고 limit이 바꿔야 할 대상이 되지는 않습니다. 장면의 4단계가 존재하는 이유는, limit을 올리면 절벽의 위치만 옮겨 갈 뿐 기울기는 그대로이기 때문입니다. 힙은 더 멀어진 천장을 향해 천천히 차오르고, 수집은 더 커진 라이브 세트를 훑느라 가는 길에 매번 더 오래 멈춥니다. 512Mi에서 40분마다 죽던 컨테이너는 1Gi에서 80분마다 죽고 그사이의 정지는 더 나빠지며, 그래프는 축의 숫자만 다를 뿐 거의 똑같이 보입니다. 진짜 변경을 준비하는 동안 시간을 벌려고 올리는 것은 좋습니다. 다만 그것이 수정이 아니라 집행유예라는 점은 스스로에게 분명히 해 둡니다.
