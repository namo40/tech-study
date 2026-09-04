---
title: "dotnet-counters"
summary: "dotnet-counters는 돌고 있는 .NET 프로세스가 이미 내보내고 있는 카운터를 읽는 명령줄 도구입니다. 살아 있는 프로세스에 붙어 GC와 스레드 풀과 예외율이 터미널에서 갱신되는 것을 보거나 파일로 수집하며, 애플리케이션에는 아무것도 설치하지 않습니다."
category: "성능과 최적화"
related:
  - label: Garbage Collection
    slug: garbage-collection
  - label: Thread Pool
    slug: thread-pool
  - label: Thread Pool Starvation
    slug: threadpool-starvation
  - label: Memory Pressure
    slug: memory-pressure
  - label: Allocation Rate
    slug: allocation-rate
  - label: Utilization
    slug: utilization
  - label: OpenTelemetry
    slug: opentelemetry
references:
  - title: "dotnet-counters diagnostic tool"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
  - title: ".NET runtime metrics"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics-runtime
---

## 언제 쓰나

- 프로세스가 지금 이상하게 굴고 있고 몇 초 안에 숫자가 필요할 때 가장 먼저 꺼냅니다. `dotnet-counters monitor`는 돌고 있는 프로세스에 붙어 GC 힙 크기와 할당률과 스레드 풀 큐 길이와 예외 횟수를 실시간 표로 찍어 줍니다. 재시작도 코드 수정도 패키지 참조도 필요 없습니다. "API가 느린 것 같다"와 "스레드 풀 큐가 4000이다"의 차이가 이것입니다.
- 궁금한 순간이 우리가 지켜볼 때까지 기다려 주지 않는다면 `collect`를 씁니다. 정한 간격으로 같은 카운터를 파일에 씁니다. 밤마다 나는 느려짐이나 천천히 새는 누수가, 누군가 마침 찍어 둔 화면 사진이 아니라 나중에 열어 볼 수 있는 시계열이 되는 셈입니다.
- 대시보드가 믿기지 않는 말을 할 때 씁니다. 프로세스 옆에서 카운터를 읽으면 서로 무관한 두 번째 출처가 생기고, 둘이 어긋난다면 대개는 진짜 런타임 문제가 아니라 망가진 내보내기 경로나 잘못된 수집 간격이나 엉뚱한 수준에서 집계된 지표입니다.
- 접근 경로만 마련해 두면 컨테이너 안에서도 씁니다. 컨테이너 안의 프로세스도 같은 카운터를 내보내므로, 진단용 사이드카를 두거나 이미지에 도구를 넣어 두면 문제가 실제로 일어나는 기계에서 같은 표를 볼 수 있습니다.

## 주의점

- 이것은 진단 도구이지 APM이 아닙니다. 붙어 있는 동안 카운터를 표본으로 떠서 보여 줄 뿐이고, 이력을 저장하지도 임계값으로 경보를 울리지도 서비스 사이를 이어 주지도 세션이 끝난 뒤까지 남지도 않습니다. 추세와 경보와 보존은 여전히 백엔드를 갖춘 OpenTelemetry 같은 메트릭 파이프라인의 일입니다. 이 도구를 그 대신 쓰면 다음번에도 누군가 우연히 들여다볼 때까지 아무도 알아채지 못합니다.
- 붙으려면 프로세스의 진단 포트에 접근할 수 있어야 하고, 컨테이너에서 걸리는 부분이 바로 그것입니다. 도구는 IPC 채널로 대상과 이야기하므로 같은 프로세스 네임스페이스와 같은 임시 디렉터리를 봐야 합니다. 쿠버네티스에서는 프로세스 네임스페이스를 공유하는 임시 디버그 컨테이너를 쓰거나 사이드카와 볼륨을 공유한다는 뜻이고, 다른 파드에 도구만 설치해 두면 아무것도 찾지 못합니다.
- 기본 갱신 주기가 1초라서 짧은 스파이크는 표본 두 개 사이로 빠질 수 있습니다. 200밀리초짜리 멈춤은 표에 아예 안 나타날 수 있고, 1초로 평균 낸 비율은 그 안의 폭증을 감춥니다. 짧은 것을 쫓을 때는 간격을 줄이고, 질문이 수준이 아니라 개별 이벤트에 대한 것이라면 추적 도구로 옮겨 갑니다.
- 카운터 이름은 정확해야 하고, 짐작으로 치면 한 세션을 날립니다. 공급자와 카운터 이름은 well-known counters 문서가 정본이고, 그럴듯하지만 틀린 이름을 치면 오류가 아니라 빈 열이 나옵니다. 런타임 쪽은 `System.Runtime`이 쥐고, 요청률과 큐 지표는 `Microsoft.AspNetCore.Hosting`이 쥐며, 무엇을 쓸 수 있는지는 도구의 `list` 명령이 나열해 줍니다.

## .NET에서는

- 애플리케이션에는 아무것도 설치하지 않습니다. `dotnet tool install --global dotnet-counters`로 도구를 한 번 설치하고, 프로세스를 찾고, 기본 묶음을 그대로 받는 대신 원하는 공급자와 카운터를 직접 지목합니다.

```bash
# List the processes the tool can attach to.
dotnet-counters ps

# Watch the runtime and the ASP.NET Core host side by side, twice a second.
dotnet-counters monitor --process-id 1428 --refresh-interval 0.5 \
  --counters System.Runtime[gc-heap-size,alloc-rate,threadpool-queue-length,exception-count],Microsoft.AspNetCore.Hosting[requests-per-second,current-requests]

# Same counters, written to a file for the twenty minutes the slowdown lasts.
dotnet-counters collect --process-id 1428 --format csv --output slowdown.csv \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting
```

- 위의 두 공급자는 서로 다른 질문에 답합니다. `System.Runtime`은 런타임이 자기 자신에게 무엇을 하고 있는지를 말해 주고, `Microsoft.AspNetCore.Hosting`은 애플리케이션이 무엇을 하라고 요구받고 있는지를 말해 줍니다. 요청률은 평평한데 큐 길이만 오르는 것과 둘이 함께 오르는 것은 아주 다른 이야기입니다.
- 우리가 만든 `Meter` 계측도 여기에 나옵니다. `System.Diagnostics.Metrics`로 만든 카운터나 히스토그램은 미터 이름으로 지목하므로, `--counters MyCompany.Orders`라고 쓰면 도메인 지표가 런타임 지표와 같은 표에 놓입니다. 백엔드에서 찾아 헤매기 전에 계측이 실제로 기록되고 있는지 빠르게 확인하는 방법입니다.
- `--counters`는 공급자 이름만 받기도 하고 대괄호 목록을 붙인 공급자를 받기도 합니다. 공급자만 쓰면 그 기본 묶음이 나오고, 시작점으로는 괜찮습니다. 정작 궁금한 것이 숫자 세 개일 때 표를 읽을 수 있게 유지해 주는 쪽은 대괄호로 좁히는 방법입니다.
