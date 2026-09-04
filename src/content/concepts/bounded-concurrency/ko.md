---
title: "Bounded Concurrency"
summary: "한 번에 떠 있을 수 있는 작업의 수를 정해 두는 방법입니다. 밀어내기가 상류로 번지는 통로이며, 한도가 차면 다음 호출자가 기다리고, 그 기다림이 출처까지 닿습니다."
category: "복원력과 장애 대응"
scene: backpressure
sceneStep: 3
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Batching
    slug: batching
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
---

장면의 3단계는 버퍼가 예의를 그만두는 순간입니다. 가득 찼고, 더 내줄 것이 없고, 자라는 대신 생산자를 기다리게 합니다. `admits` 숫자가 8에서 3으로 내려가는 것이 바로 그 기다림이 상류로 번지는 모습입니다. 한 번에 떠 있을 수 있는 것이 줄어드니 시작되는 것이 줄고, 유입 속도는 소비자가 실제로 해낼 수 있는 만큼까지 떨어집니다. 여기서 무엇도 속도를 재지 않았고, 무엇도 늦추라고 설정되지 않았다는 점을 보세요. 한도는 개수이고, 그 개수가 찼고, 속도는 거기서 저절로 나옵니다.

깊이가 처리량보다 나은 신호인 것과 같은 이유로, 개수는 속도보다 나은 조절 장치입니다. 되먹임이 닫혀 있기 때문입니다. 속도 제한은 하류가 얼마나 빠를 수 있는지에 대한 추측이고, 오늘이 어떨지 모르던 사람이 미리 설정 파일에 적어 둔 것입니다. 동시 실행 한도는 추측하지 않습니다. 하류가 느려지면 허가 하나가 더 오래 붙들리고, 초당 풀려나는 허가가 줄고, 내보내는 속도는 하류가 느려진 만큼 정확히 떨어집니다. 지표도 제어기도 배포도 없이 저절로 그렇게 됩니다. 리틀의 법칙이 장치의 전부입니다. 허가가 N개이고 평균 처리 시간이 L이면 낼 수 있는 속도는 N 나누기 L이고, L은 내가 아니라 현실이 잽니다.

그 자가 교정은 함정이기도 합니다. 동시 실행에 한도를 두었다고 지연에 한도를 둔 것은 아니기 때문입니다. 20밀리초에서 4초로 느려진 의존 대상에 허가 여덟 개를 걸어 두면 여전히 여덟 개는 들어가고, 그 뒤에서 기다리던 호출자들은 아주 오래 기다립니다. 그래서 허가에는 개수만이 아니라 기한도 필요합니다. 기다림 자체에 거는 타임아웃이 있어야 곧 들어가지 못하는 호출자가 영영 세워지는 대신 그 사실을 듣고, 작업에 거는 타임아웃이 있어야 돌아오지 않을 무언가가 허가를 붙들고 있지 않습니다. 둘 다 없으면 리미터는 느린 의존 대상을 대기자의 무한 큐로 바꿔 놓습니다. 애초에 막으려던 바로 그 고장입니다.

한도를 어디에 두느냐가 무엇을 지키는지를 정합니다. 의존 대상 둘레에 두면 벌크헤드입니다. 느린 하나가 프로세스의 스레드를 다 먹어 치우지 못하게 하는 것이 목적이고, 알맞은 숫자는 그 의존 대상의 용량에서 나옵니다. 장면처럼 출처에 두면 백프레셔입니다. 시스템이 처리해 낼 수 있는 속도보다 빠르게 일감이 생기지 않게 하는 것이 목적이고, 알맞은 숫자는 뒤에 있는 버퍼에서 나옵니다. 같은 도구, 반대의 논리이니 지금 어느 쪽을 이야기하고 있는지 아는 것이 좋습니다. 뒤따르는 숫자가 달라지기 때문입니다.

숫자를 고르는 일은 보기보다 신비롭지 않습니다. 가장 먼저 바닥날 자원에서 시작하세요. 풀의 커넥션, 코어, 파트너가 문서에 적어 둔 동시 호출 수 같은 것입니다. 한도를 거기에 맞추거나 살짝 아래에 두면 됩니다. 진짜 제약보다 큰 한도는 대기열을 덜 보이는 곳으로 옮기는 것 말고는 아무 일도 하지 않기 때문입니다. 그다음 원하는 지연에 대고 산수를 확인합니다. N 나누기 L이 실제로 낼 속도이고, 그것이 필요한 값보다 한참 아래라면 답은 더 큰 N이 아니라 더 빠른 소비자이거나 더 많은 소비자입니다. 포화된 의존 대상에 대고 N을 올리면 처리량이 아니라 줄서기를 삽니다.

마지막으로, 리미터는 보여야 합니다. 사용 중인 허가 수, 기다리는 호출자 수, 기다린 시간. 이 세 숫자가 "시스템이 느린 것 같다"를 "6분째 한도에 붙어 있다"로 바꿔 줍니다. 장면이 이것들을 그려 두는 이유는, 아무도 볼 수 없는 한도는 버그와 구별되지 않기 때문입니다. 일감은 들어오는데 프로세스는 바쁘지 않고, 여덟 개가 이미 떠 있고 아홉 번째가 문 앞에 서 있다는 사실을 로그의 무엇도 말해 주지 않습니다.
