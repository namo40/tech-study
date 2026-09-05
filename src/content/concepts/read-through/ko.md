---
title: "Read-Through"
summary: "Read-through는 캐시를 채우는 일을 캐시 쪽으로 옮깁니다. 애플리케이션은 키를 묻고 값을 받을 뿐이고, 그 값이 메모리에서 왔는지 지나가는 길에 데이터베이스에서 왔는지는 호출 지점이 아니라 캐시 계층이 알아서 할 일입니다."
category: "캐시"
scene: cache-aside
sceneStep: 1
related:
  - label: Cache-Aside
    slug: cache-aside
  - label: HybridCache
    slug: hybridcache
  - label: IDistributedCache
    slug: idistributedcache
  - label: Write-Through
    slug: write-through
  - label: Cache Stampede
    slug: cache-stampede
references:
  - title: Cache-Aside pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
  - title: Caching guidance
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching
---

장면의 1단계는 미스가 메워지는 장면입니다. 캐시가 비어 있으니 애플리케이션이 데이터베이스를 읽고, 돌아오는 길에 그 결과를 저장합니다. Read-through는 이 그림에서 딱 한 가지를 바꾸는데, 그것은 순서가 아니라 주체입니다. 애플리케이션은 더 이상 미스를 알아차리지 않습니다. 키를 들고 캐시를 부르면 값이 돌아올 뿐이고, 저장된 것이 없다는 사실을 발견하고 미리 넘겨받은 로더를 호출하고 그 답을 보관했다가 돌려주는 쪽은 캐시입니다. Cache-aside와 read-through는 같은 데이터를 같은 순서로 캐시에 채웁니다. 갈리는 것은 채우는 코드를 누가 들고 있느냐입니다.

그 코드를 옮긴 결과는 호출 지점이 깔끔해지는 것보다 값이 큽니다. 모든 미스를 읽는 쪽이 저마다 메우지 않고 한 구성 요소가 메우면, 미스 경로가 결정을 내릴 수 있는 한 자리가 됩니다. 같은 키에 동시에 도착한 미스들을 거기서 하나로 접을 수 있어서, 함께 들어온 읽기 요청 열 개가 데이터베이스 호출 열 번이 아니라 한 번을 만듭니다. 손으로 쓴 미스 분기라면 일부러 넣어 주어야 하고 대개는 넣지 않는 스탬피드 대비가 바로 이것입니다. 만료 정책과 키 조립과 직렬화도 같은 자리에 살기 때문에, 배치 작업이 쓴 항목과 요청 핸들러가 쓴 항목의 모양이 같아집니다. Cache-aside가 부르는 실수는 대개 서른 군데 호출 지점 중 한 군데에서 빠뜨리는 실수입니다. 잊어버린 저장, 혼자만 다른 TTL, 구분자를 살짝 다르게 붙여 만든 키입니다.

.NET에서는 `HybridCache.GetOrCreateAsync`가 바로 이 모양을 줍니다. 이름보다 모양을 정확히 보아 두는 편이 낫습니다. 키와 값을 만들어 낼 팩토리를 넘겨주면, 찾아보는 일도 아무것도 없다는 판단도 적재도 다시 써 넣는 일도 전부 그 한 번의 호출 안에서 벌어집니다. 그 호출 뒤에 무엇이 있는지는 hybridcache 페이지가 다룹니다. 좀처럼 만나기 어려운 쪽은 캐시 서버 자신이 read-through를 구현한 형태, 그러니까 Redis가 데이터베이스로 가는 연결을 쥐고 스스로 행을 읽어 오는 형태입니다. `IDistributedCache`는 그런 고리를 일부러 두지 않았고, 그래서 .NET에서 read-through는 저장소의 기능이 아니라 저장소를 감싼 라이브러리의 모양으로 나타납니다. 이 구분은 무언가 실패할 때 의미를 갖습니다. 로더는 내 프로세스에서, 내 스레드 위에서, 내 취소 토큰 아래에서 돌고, 거기서 나온 예외는 해석해야 할 캐시 오류가 아니라 내 예외입니다.

이 배치가 치르는 대가는 캐시가 이제 읽기 경로 위에 더 깊이 올라앉는다는 것입니다. Cache-aside라면 캐시를 쓸 수 없다는 것을 알아차린 읽는 쪽이 그 호출 지점에서 데이터베이스로 그냥 내려가겠다고 정할 수 있지만, read-through에서는 그 대체 경로도 계층의 몫이고 계층이 내놓지 않으면 그 실패를 그대로 물려받습니다. 함께 봐 둘 다른 하나는 이 패턴의 폭이 얼마나 좁은지입니다. Read-through는 미스를 누가 메우는지만 정할 뿐, 값이 바뀔 때 무슨 일이 벌어지는지에 대해서는 한마디도 하지 않습니다. 쓰기가 기록 원본과 캐시 양쪽에 닿아야 하는 장면의 4단계는 별개의 결정이고, write-through와 write-behind가 서로 다르게 답합니다.
