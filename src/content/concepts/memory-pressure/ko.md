---
title: "Memory Pressure"
summary: "memory pressure는 한도 근처에서 살아가는 힙입니다. 할당이 수집보다 빠르게 들어오면 수집기는 더 자주 돌고 더 오래 멈추며, 한도를 넘는 순간에는 잡을 오류조차 없이 컨테이너가 그냥 종료됩니다."
category: "컨테이너와 오케스트레이션"
scene: memory-pressure
steps:
  - title: "한도에서 먼 힙은 GC를 거의 느끼지 못합니다"
    text: "할당이 채우고 수집이 비우며 게이지는 30%와 50% 사이에서 숨을 쉽니다. 수집은 값싼 배경 소음입니다. 이것이 건강한 모습이고, 아무도 이 그래프를 들여다보지 않습니다."
  - title: "압박은 빈도로 먼저 나타납니다"
    text: "할당 속도가 3배가 되면 수집기는 다섯 배 자주 돌고, 매번 더 오래 멈추고, 한 번에 덜 비워 냅니다. 힙은 이제 천장 근처에서 삽니다. 같은 기계, 같은 코드인데 모든 요청이 그 차이를 느낍니다."
  - title: "한도는 아무것도 던지지 않습니다"
    text: "cgroup 경계에는 잡을 OutOfMemoryException이 없습니다. 커널이 요청 도중에 컨테이너를 죽이고, 파드가 재시작하고, 카운터가 하나 올라갑니다. 힙은 비어 있고 코드는 그대로이니 같은 상승이 다시 시작됩니다."
  - title: "답은 더 큰 한도가 아니라 더 적은 할당입니다"
    text: "큰 버퍼를 풀로 만들어 빌리고, 쓰고, 반납하면 할당 속도가 무너져 내립니다. 같은 트래픽을 다시 흘려도 게이지는 40%에서 한가롭고 GC는 조용해집니다. 더 큰 한도는 절벽을 옮겨 놓을 뿐이었을 것입니다. 재시작 횟수는 그대로 남습니다. 흉터가 곧 교훈입니다."
related:
  - label: Allocation Rate
    slug: allocation-rate
  - label: Memory Limit
    slug: memory-limit
  - label: Object Pool
    slug: object-pool
  - label: Garbage Collection
    slug: garbage-collection
  - label: Large Object Heap
    slug: large-object-heap
  - label: ArrayPool
    slug: arraypool
  - label: "Span<T>"
    slug: span-t
  - label: Server GC
    slug: server-gc
  - label: Workstation GC
    slug: workstation-gc
  - label: Resource Limit
    slug: resource-limit
references:
  - title: "Fundamentals of garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals
  - title: "Runtime configuration options for garbage collection"
    url: https://learn.microsoft.com/en-us/dotnet/core/runtime-config/garbage-collector
  - title: "Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "ArrayPool<T> Class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1
---

## 언제 쓰나

- 경보가 아니라 판독으로 씁니다. 세 숫자는 함께 놓아야 뜻이 생깁니다. 수집기가 얼마나 자주 도는지, 한 번에 얼마나 오래 멈추는지, 힙이 한도에 얼마나 가까운지입니다. 하나씩 떼어 놓으면 아무 의미가 없습니다. 여유 있는 힙에서 분당 20번 수집은 정상이고, 아무것도 채우지 않는다면 80%에 머무는 힙도 정상입니다. 압박은 이 셋의 조합이며, 03시 14분에 일어난 사건이 아니라 서비스가 놓여 있는 상태입니다.
- 지연이 나빠졌는데 설명할 것이 없을 때입니다. 배포도 없었고 트래픽도 그대로이고 느려진 의존성도 없는데 p95만 올라갑니다. 할당 속도가 나빠진 경우가 정확히 이렇게 보입니다. 바뀐 것은 요청당 작업량이 아니라 요청당 쓰레기이고, 그 비용은 원인이 된 요청 하나가 아니라 프로세스 안의 모든 요청이 나눠 냅니다.
- 컨테이너는 재시작하는데 로그에 아무것도 없을 때입니다. 예외도 스택도 종료 메시지도 없이 종료 코드 137만 남는 것이 이 고장의 서명이고, 애플리케이션 쪽에서 디버깅할 수 있는 크래시가 아닙니다. 증거는 재시작 횟수, 죽기 직전까지의 메모리 그래프, 그리고 파드의 이벤트입니다.
- 릴리스를 넘기면서 Gen2나 대형 객체 힙이 자라날 때입니다. 예전에는 gen0에서 죽던 객체가 이제는 살아남아 승격됩니다. 수집기가 그 객체들이 쓰레기가 되기도 전에 도착하기 때문입니다. 릴리스마다 조금씩 올라가는 라이브 세트는 같은 이야기를 천천히 하는 것입니다.
- 메모리 한도를 올리기 전에 봅니다. 한도는 바꾸기가 가장 쉬우면서 바꿔야 할 이유는 거의 없는 숫자입니다. 먼저 상태를 읽습니다. 512Mi에서 죽는 컨테이너와 2Gi에서 죽는 컨테이너는 같은 결함을 가진 같은 컨테이너이고, 뒤쪽은 거기까지 가는 데 더 오래 걸리고 도착했을 때 더 오래 멈출 뿐입니다.

## 주의점

- 플랫폼이 강제하는 한도와 런타임이 믿고 있는 한도는 같은 숫자여야 합니다. .NET은 cgroup에서 컨테이너 한도를 읽고 그 일부를 힙 크기로 잡으므로 기본값은 대개 맞습니다. 다만 누군가 `DOTNET_GCHeapHardLimit`을 손으로 설정했거나, cgroup v2를 지원하지 않는 오래된 런타임이거나, 런타임이 볼 수 없는 방식으로 파드에 한도가 걸린 순간부터는 맞지 않게 됩니다. 런타임이 커널이 허락한 것보다 여유가 많다고 믿으면 수집기는 끝내 충분히 공격적으로 돌지 않고, GC가 아직 느긋한 동안 종료가 찾아옵니다.
- OOM 종료는 예외가 아닙니다. cgroup 경계에는 `OutOfMemoryException`도, `catch`도, `finally`도, 정상 종료도, 마지막 로그 한 줄도 없습니다. 커널의 OOM 킬러가 SIGKILL을 보내고 프로세스는 명령어 두 개 사이에서 존재하기를 멈춥니다. 스택 트레이스를 읽는 것을 전제로 만들어진 진단 습관은 여기서 전부 무너지고, 그래서 볼 숫자는 `restarts`이고 볼 곳은 애플리케이션 로그가 아니라 파드의 이벤트입니다.
- 더 큰 한도는 시간을 사 주고 그 값을 청구합니다. 한도를 두 배로 늘리면 절벽의 위치만 옮겨 갈 뿐 기울기는 그대로이고, 멈추는 시간은 수집기가 훑어야 하는 라이브 세트에 대략 비례합니다. 40분마다 죽던 서비스가 이제 80분마다 죽고, 가는 길에 매번 두 배씩 멈춥니다. 진짜 수정을 준비하는 동안 서비스를 살려 두려고 일부러 그렇게 하는 것은 괜찮습니다. 그것이 수정인 적은 없습니다.
- 할당 속도가 지렛대이고, 사실상 유일한 지렛대입니다. 큰 버퍼를 풀로 돌리고, 응답을 버퍼에 담는 대신 흘려보내고, 복사 대신 `Span<T>`으로 잘라 쓰고, 뜨거운 경로에서 아예 할당하지 않는 변경이 상태를 바꿉니다. 수집기 튜닝은 대개 바꾸지 못합니다. Server GC는 짧은 정지를 얻는 대신 메모리 사용량을 더 쓰고 `GCConserveMemory`는 작은 힙을 얻는 대신 처리량을 내주지만, 둘 중 어느 것도 프로세스가 쓰레기를 만들어 내는 일을 멈추지는 못합니다.
- 대형 객체 힙은 이 문제가 조용히 어긋나는 자리입니다. 85,000바이트가 넘는 것은 버퍼든 큰 배열이든 직렬화된 페이로드든 전부 거기에 할당되고, gen2와 함께만 수집되며, 요청하지 않으면 압축되지 않습니다. 요청마다 큰 버퍼를 할당하는 작업 부하는 LOH를 다시 쓸 수 없는 구멍으로 조각내므로, 라이브 세트는 그대로인데 힙만 계속 자랍니다. 그래프는 어떤 프로파일러도 주인을 찾아 주지 못하는 누수처럼 보입니다.
- 메모리는 CPU가 아니고, 두 한도는 같은 방식으로 고장 나지 않습니다. CPU 한도를 넘으면 스로틀링되어 느려지고, 메모리 한도를 넘으면 종료되어 사라집니다. 이 비대칭 때문에 메모리 한도에는 CPU 한도가 필요로 하지 않는 여유가 필요합니다. 그리고 메모리 한도를 요청량과 같게 두는 것은 파드를 Guaranteed로 만드는 설정이므로, 천장에 대한 결정이면서 동시에 축출 우선순위에 대한 결정이기도 합니다.

## .NET에서는

런타임은 기본적으로 컨테이너를 인식합니다. cgroup의 메모리 한도를 읽어 그 75%를 힙 하드 리밋으로 잡고, 나머지는 스택과 JIT와 네이티브 할당처럼 관리 힙이 아닌 나머지 전부에 남겨 둡니다. 그래서 실제로 따져야 할 숫자는 컨테이너의 한도이고, 아래 설정은 그 기본 판독이 틀린 경우를 위한 것입니다.

```jsonc
// runtimeconfig.json. 이유를 모르면 아무것도 설정하지 않습니다. 기본값은
// 컨테이너 한도에서 파생되고, 이것을 덮어쓰는 것이 프로세스가 커널이 주지
// 않을 여유를 가졌다고 믿게 되는 경로입니다.
{
  "configProperties": {
    // 바이트 단위의 명시적 상한, 또는 컨테이너 한도에 대한 비율.
    "System.GC.HeapHardLimit": 402653184,
    "System.GC.HeapHardLimitPercent": 75,
    // Server GC는 코어마다 힙 하나를 둡니다. 정지는 짧아지고 사용량은
    // 커지는데, 한도에 그만한 여유가 있어야 감당할 수 있는 거래입니다.
    "System.GC.Server": true
  }
}
```

상태를 읽는 데는 명령 하나와 카운터 셋이면 충분합니다. `dotnet-counters`는 실행 중인 프로세스에 붙어 값을 그대로 보여 주고, 할당 속도를 짐작하는 것과 아는 것의 차이가 여기서 갈립니다.

```bash
# gc-heap-size는 게이지의 위치, alloc-rate는 그것을 채우는 속도,
# gen-2-gc-count와 time-in-gc는 그 자리를 유지하는 비용입니다.
dotnet-counters monitor --process-id 1 \
  --counters System.Runtime[gc-heap-size,alloc-rate,gen-2-gc-count,time-in-gc]
```

풀링이 숫자를 실제로 움직이는 변경입니다. `ArrayPool<T>.Shared`는 요청한 크기 이상인 버퍼를 빌려주고 나중에 돌려받습니다. 버퍼는 할당되는 대신 재사용되므로 그 바이트는 쓰레기가 되지 않고 수집기가 쳐다볼 일도 없습니다.

```csharp
public async Task<int> CopyAsync(Stream source, Stream target, CancellationToken token)
{
    // 할당이 아니라 대여입니다. 배열이 64 KB보다 클 수 있어서
    // 읽기는 항상 실제로 반환된 길이로 제한합니다.
    var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
    try
    {
        var total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, token)) > 0)
        {
            await target.WriteAsync(buffer.AsMemory(0, read), token);
            total += read;
        }
        return total;
    }
    finally
    {
        // `finally`가 계약의 전부입니다. 반납하지 않은 버퍼는 누수가 아니라
        // 다음번에 풀이 새로 하나 할당할 뿐이지만, 풀을 둔 이유 자체를
        // 없애 버립니다.
        ArrayPool<byte>.Shared.Return(buffer);
    }
}
```

같은 수정의 나머지 절반은 애초에 그 바이트를 만들지 않는 것입니다. 응답을 `byte[]`에 담아 두면 길이만큼을 한 번에 할당하고 대개 대형 객체 힙으로 갑니다. 만들어지는 대로 흘려보내면 요청마다 재사용되는 대여 버퍼 하나로 끝납니다.

```csharp
// 페이로드 전체를 두 번 할당합니다. 문자열로 한 번, UTF-8 바이트로 한 번.
var json = JsonSerializer.Serialize(report);
await response.WriteAsync(json, token);

// 대신 풀링된 버퍼를 통해 흘려보냅니다. 페이로드 크기만 한 것은 아무것도
// 할당되지 않으므로 페이로드 크기만 한 것은 아무것도 수집되지 않습니다.
await JsonSerializer.SerializeAsync(response.Body, report, cancellationToken: token);
```

플랫폼 쪽에서 한도는 한 줄이고, 그 한도에 닿았을 때의 진단도 한 줄입니다. OOM으로 종료된 파드는 마지막 상태에 그렇게 적어 두며, 뒤에 스택 트레이스가 없는 종료 코드가 함께 남습니다.

```yaml
resources:
  requests:
    memory: 512Mi     # 스케줄러가 확보해 두는 양
  limits:
    memory: 512Mi     # 커널이 SIGKILL로 강제하는 양
```

```bash
# reason: OOMKilled, exitCode: 137. 대조할 애플리케이션 로그가 없습니다.
# 프로세스는 멈추기 전에 아무 통보도 받지 못했기 때문입니다.
kubectl get pod api-7d9f -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'
```

재시작 횟수가 올라가고 있는데 진짜 수정이 일주일 뒤라면 한도를 올리되, 그것이 집행유예일 뿐이라고 소리 내어 말해 두세요. 그다음에 요청마다 프로세스가 무엇을 할당하는지 찾아보세요. 그 숫자가 상태를 이루는 값이고, 그래프의 크기가 아니라 모양을 바꾸는 유일한 값입니다.
