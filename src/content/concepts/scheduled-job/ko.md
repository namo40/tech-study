---
title: "Scheduled Job"
summary: "누가 요청해서가 아니라 시계가 그렇게 말해서 시작되는 작업입니다. 언제 발화할지는 예약이 가지고 있고, 끝났는지 여부는 다른 쪽이 가지고 있어야 합니다."
category: "예약 작업과 워크플로"
scene: workflow-engine
sceneStep: 1
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Background Job
    slug: background-job
  - label: Long-Running Process
    slug: long-running-process
  - label: Durable Workflow
    slug: durable-workflow
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Leader Election
    slug: leader-election
  - label: Distributed Lock
    slug: distributed-lock
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web-Queue-Worker
    slug: web-queue-worker
references:
  - title: "Timer trigger for Azure Functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer
  - title: "Worker services in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

장면의 첫 단계에는 상자가 둘 있고, 둘은 완전히 다른 일을 합니다. Schedule은 `daily 02:00`이라는 상시 지시를 들고 있고, 하는 일은 `due`를 켜고 레인으로 신호 하나를 내려보내는 것뿐입니다. Engine은 그 신호를 받아 인스턴스를 시작합니다. 그 뒤의 모든 것은 Engine의 몫이고, Schedule은 다시는 소식을 듣지 않습니다. 이 분리가 예약 작업의 핵심이고, 직접 만들 때 사람들이 뭉개 버리는 부분이기도 합니다.

예약은 방아쇠이지 감독이 아닙니다. 답하는 질문은 딱 하나, 지금이 그 시각인가이고, 벽시계로 답합니다. 지난 실행이 끝났는지, 성공으로 끝났는지, 아직 돌고 있는지, 멈추기 전에 어디까지 갔는지는 알지 못합니다. 그 답들 중 하나라도 필요하다면 레인 건너편의 무언가가 그것을 들고 있어야 합니다. `history` 카드가 Schedule 상자가 아니라 Engine 상자에 있는 이유가 그것입니다.

그래서 예약 작업의 어려운 질문 두 개는 둘 다 겹침에 관한 것입니다. 02:00 실행이 03:00까지 이어져 다음 발화와 겹치면 어떻게 되나요. 답이 없는 예약은 두 번째를 시작하고, 이제 프로세스 두 개가 같은 행들을 만집니다. 흔한 해법은 두 번째 발화를 아무 일도 안 하게 만드는 동시성 가드, 실행이 도는 동안 쥐고 있는 리스, 또는 둘이 동시에 돌아도 안전한 정의입니다. 셋 중 하나를 의식적으로 고르세요. 대부분의 스케줄러에서 기본값은 "그래도 시작"입니다.

그리고 아무도 돌고 있지 않은 사이에 예약 시각이 지나가면 어떻게 되나요. 배포, 롤링 재시작, 하필 그 시각에 이십 분간 차단된 노드 같은 일들입니다. 어떤 스케줄러는 늦게라도 발화하고 어떤 스케줄러는 그 회차를 통째로 건너뜁니다. 이 차이는 돌아간 정산과 조용히 돌지 않은 정산의 차이입니다. 알아야 할 일이 생기기 전에 우리 것이 어느 쪽인지 확인하고, 놓친 회차를 따라잡을지 없던 일로 할지 정해 두세요.

나머지 절반은 서비스가 여러 노드에서 돌 때 한 번만 도는 문제입니다. `IHostedService` 안의 `PeriodicTimer`는 프로세스마다 하나씩 있는 타이머라서, 복제본이 셋이면 밤마다 세 번 돕니다. 보통은 작업을 만들고 몇 달 뒤 세 번째 복제본을 추가할 때 발견됩니다. 해법은 예약을 앱 바깥으로 옮기거나(스케줄러 서비스, cron 오브젝트, 타이머 트리거 함수), 타이머 앞에 분산 잠금이나 리더 선출을 두어 틱에 반응하는 복제본이 하나뿐이게 만드는 것입니다.

마지막으로, 예약은 기록이 아닙니다. 로그 한 줄이 남아 있으니 "작업이 02:00에 돌았다"로 충분하다고 여기기 쉽습니다. 하지만 로그 한 줄이 말하는 것은 프로세스가 시작했다는 사실이지 작업이 완료됐다는 사실이 아니고, 파드가 쫓겨나기 전에 아홉 단계 중 어디까지 갔는지는 더더욱 말해 주지 않습니다. 이 장면의 나머지가 하는 이야기가 그것입니다. 시계는 무언가를 시작하기에 좋은 방법입니다. 무슨 일이 있었는지 알기에는 형편없는 방법입니다.
