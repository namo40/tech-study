---
title: "Deadline"
summary: "deadline은 요청 전체를 재는 기준이 되는 하나의 시점입니다. 그래서 그 아래의 모든 호출은 자기만의 새 타임아웃이 아니라 남은 시간을 받습니다."
category: "복원력과 장애 대응"
scene: request-timeout
sceneStep: 3
related:
  - label: Request Timeout
    slug: request-timeout
  - label: Timeout
    slug: timeout
  - label: Cancellation Token
    slug: cancellation-token
  - label: Connection Timeout
    slug: connection-timeout
  - label: Retry
    slug: retry
  - label: Retry Budget
    slug: retry-budget
  - label: Tail Latency
    slug: tail-latency
  - label: p99
    slug: p99
references:
  - title: gRPC deadlines
    url: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
  - title: Request timeouts middleware in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/timeouts?view=aspnetcore-10.0
  - title: CancellationTokenSource.CancelAfter
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.cancellationtokensource.cancelafter
---

timeout은 기간이고 deadline은 시점이며, 바로 그 차이가 핵심입니다. 요청이 도착할 때 deadline을 하나 주면, 그 뒤로 이 요청이 하는 모든 호출은 "나는 얼마나 써도 되는가"라는 질문에 대한 답을 갖게 되고, 그 답은 요청이 진행될수록 줄어듭니다. 대신 호출마다 기간을 주면 총합을 아무도 재지 않으므로, 호출자가 갖고 있다고 믿었던 보장은 경로 위 모든 상한의 합이 됩니다. 그 합은 언제나 개별 상한 하나보다 훨씬 큽니다. 800ms를 약속한 요청 아래에서 500ms짜리 호출이 두 번 일어나는 것은 어떤 설정도 어긴 것이 아닙니다. 다만 아무도 지키지 않던 약속이었을 뿐입니다.

계산은 한 번쯤 직접 해 볼 만합니다. 800ms를 가진 요청이 데이터베이스에 300을 썼다면 다음에 하는 HTTP 호출은 500을 받고, 그 호출이 연결부터 열어야 한다면 그 연결 시간도 공짜가 아니라 같은 500에서 나갑니다. 예산은 겹쳐지지, 더해지지 않습니다. 그래서 재시도 여부를 판단할 근거로 삼을 만한 것도 deadline뿐입니다. 두 번째 시도는 그것을 끝낼 만큼 예산이 남아 있을 때만 해 볼 가치가 있고 그렇지 않으면 순전한 낭비인데, 호출별 타임아웃은 이 질문을 던져 볼 수조차 없습니다.

deadline을 프로세스 경계 너머로 넘기는 일이야말로 이것을 한 서비스가 아니라 시스템에서 작동하게 만듭니다. gRPC에는 이 기능이 들어 있어서 클라이언트가 정한 deadline이 그대로 전달되고 서버에서는 `context.CancellationToken`으로 드러납니다. 덕분에 서버는 클라이언트가 이미 포기한 일을 멈출 수 있습니다. 평범한 HTTP에는 표준 헤더가 없으니 규약을 하나 정하고 지켜야 합니다. 한 프로세스 안에서는 `CancellationTokenSource.CreateLinkedTokenSource`에 `CancelAfter(remaining)`를 붙인 모양이 답입니다. 이렇게 만든 토큰은 들어온 요청이 중단될 때도 취소되고, 요청 자신의 시계가 다 되었을 때도 발동합니다.
