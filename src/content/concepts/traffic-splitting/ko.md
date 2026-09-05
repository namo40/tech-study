---
title: "Traffic Splitting"
summary: "트래픽 분할은 정해진 비율의 요청을 새 경로로, 나머지를 옛 경로로 보냅니다. 이 비율은 일정표가 아니라 새 경로가 망가뜨려도 되는 몫의 상한선입니다."
category: "컨테이너와 오케스트레이션"
scene: feature-flag
sceneStep: 2
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: OpenFeature
    slug: openfeature
  - label: Sticky Session
    slug: sticky-session
  - label: Load Balancer
    slug: load-balancer
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
---

장면의 2단계를 보면서 분할이 실제로 어디서 일어나는지 확인해 봅니다. 움직인 것이 하나도 없습니다. 같은 서버가 돌고 있고, 같은 코드가 전부에 올라가 있고, 트래픽 매니저는 건드리지 않았습니다. 바뀐 것은 설정 안의 숫자 하나이고, 그 숫자의 결과는 한 칸 아래에서 보입니다. 한쪽에 몰려 있던 열 개의 점 가운데 정확히 하나가 반대쪽으로 넘어갑니다. 분할은 네트워크가 패킷마다 내리는 판단이 아니라 애플리케이션이 호출자마다 내리는 판단입니다. 같은 용어는 로드 밸런서나 서비스 메시, 트래픽 매니저에서 하는 가중치 라우팅도 가리키며, 그것이 카나리 릴리스가 돌리는 다이얼입니다. 이 페이지는 플래그가 애플리케이션 안에서 수행하는 분할을 다룹니다.

가운데 띠가 그 구조를 그대로 그려 놓은 것입니다. 각 호출자는 자기 해시 높이에 놓이고 음영진 띠가 비율만큼 올라옵니다. 띠 아래에 있는 호출자는 들어가고 위에 있는 호출자는 들어가지 못합니다. 비율 기반 롤아웃은 딱 이만큼입니다. 호출자의 무언가를 안정되게 해시한 값 하나를 숫자 하나와 비교하는 일입니다. 10%에서 열 중 대략 하나가 아니라 정확히 하나가 들어가는 이유가 여기 있고, 아무도 기억해 두지 않았는데 같은 호출자가 다음에 와도 다시 들어가는 이유도 여기 있습니다.

요청이 아니라 호출자를 해시한다는 점이 핵심이고, 동시에 가장 틀리기 쉬운 지점입니다. 요청마다 무작위로 뽑으면 평균은 같지만 경험은 완전히 달라집니다. 사용자가 새 결제 화면에 들어갔다가 새로 고침 한 번에 옛 화면으로 돌아가고, 장바구니는 두 경로 중 한쪽만 아는 상태로 반쯤 남습니다. 버킷으로 나누면 배정이 호출자의 속성이 되므로 새로 고침에도, 재시도에도, 여러 탭에도, 어느 서버가 답하든 그대로 남습니다.

무엇을 해시할지는 결과가 따라붙는 설계 결정입니다. 사용자 id를 해시하면 개인이 따로 움직입니다. 소비자용 제품에는 맞지만, 두 동료가 같은 문서에서 서로 다른 화면을 보게 되는 공용 워크스페이스에는 맞지 않습니다. 테넌트를 해시하면 고객사 하나가 통째로 움직입니다. 업무용 소프트웨어에는 맞지만 알갱이가 굵어서 테넌트의 10%가 트래픽의 10%보다 훨씬 많거나 훨씬 적을 수 있습니다. 무엇을 고르든 해시에 플래그별 소금값을 더합니다. 그러지 않으면 10%짜리 플래그마다 똑같이 운 나쁜 10분의 1이 들어가고, 한 코호트가 앞으로 하는 모든 실험을 혼자 떠안게 됩니다.

비율은 표본이기도 해야 하는데, 작은 비율은 표본이 아닌 경우가 많습니다. 한 리전, 한 클라이언트 버전, 한 요금제에서만 뽑은 10%는 모집단의 한 조각이 아니라 편향을 가진 부분집합이고, 넓히는 순간까지 태연히 아무 문제 없다고 보고합니다. 들어간 코호트가 전체를 닮았는지 확인하고, 물량도 솔직하게 봐야 합니다. 요청 수가 일정 수준 아래면 10% 버킷은 이미 알던 것 말고는 아무것도 알려 주지 못합니다.

2단계에서 마지막으로 볼 것은 비율이 무엇이 아닌지입니다. 비율은 일정표가 아니고 진척도도 아닙니다. 하루가 지났다는 이유로 10%에서 50%로 올리는 것은 안전한 릴리스가 아니라 느린 릴리스입니다. 숫자가 무슨 말을 했든 시계만 흘렀기 때문입니다. 다이얼을 쓸모 있게 만드는 것은 오류율과 지연, 그리고 우리 도메인에서 의미를 갖는 신호 한둘을 같은 창 안에서 두 코호트끼리 비교하는 일, 그리고 어떤 숫자가 나오면 되돌릴지 미리 적어 두는 일입니다.
