---
title: "Canary Release"
summary: "카나리아 릴리스는 실제 트래픽의 일부만 새 버전으로 보내고, 그 일부가 어떤 결과를 내는지 지켜본 다음, 그 답에 따라 넓히거나 되돌립니다. 퍼센트는 일정이 아니라 받아들이기로 합의한 피해의 크기입니다."
category: "컨테이너와 오케스트레이션"
scene: blue-green-deployment
sceneStep: 3
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Traffic Manager routing methods"
    url: https://learn.microsoft.com/en-us/azure/traffic-manager/traffic-manager-routing-methods
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
---

장면의 3단계를 보면서 무엇이 바뀌고 무엇이 그대로인지 살펴보면 좋습니다. 환경 두 벌은 같은 두 벌입니다. 레인도 같은 레인이고, 데이터베이스도 같은 데이터베이스입니다. 바뀐 것은 위쪽의 조작 장치 하나뿐입니다. 위치가 둘뿐이던 스위치가 여러 눈금을 가진 다이얼이 되었고, 시험받는 버전은 전부도 아니고 아무것도 아니지도 않은 10분의 1의 트래픽을 들고 있습니다. 카나리아 릴리스라는 것은 전부 이 한 번의 교체에서 따라 나옵니다.

다이얼의 숫자는 보이는 것보다 정확한 일을 합니다. Green이 망가져 있고 Green이 트래픽의 10%를 들고 있다면, 시스템 전체가 보여 줄 수 있는 최악의 오류율은 10%입니다. 나머지 열에 아홉은 Green을 아예 건드리지 않기 때문입니다. 장면의 readout이 정확히 10까지 올라가고 거기서 멈추는 이유가 그것입니다. 그 숫자는 새 버전이 얼마나 망가졌는지를 재는 것이 아니라, 새 버전이 무엇을 망가뜨리도록 허락받았는지를 잽니다. 다이얼은 피해의 천장이고, 50%가 아니라 10%를 고르는 일은 확인하는 동안 얼마를 잃을 각오를 할지 고르는 일입니다.

그래서 다이얼을 움직이는 것은 시계가 아니라 지표입니다. 타이머로 넓히는 카나리아는 안전한 배포가 아니라 느린 배포입니다. 숫자가 무엇을 말했든 일정은 그대로 진행되기 때문입니다. 필요한 것은 비교입니다. 오류율, 꼬리 쪽 지연, 그리고 그 도메인에서 의미가 있는 신호 한둘을 카나리아 쪽과 안정된 쪽에서 같은 시간 창으로 함께 잽니다. 같은 시간 창이라는 조건은 들리는 것보다 중요합니다. 한산한 1분 동안 30초만 지켜본 카나리아는 아무것도 알려 준 것이 없습니다.

곤란한 점은 표본이 작으면 잡음이 많다는 것입니다. 초당 30건을 처리하는 서비스의 10%면 판단할 근거가 초당 세 건뿐이라, 느린 의존 호출 한 번이나 운 나쁜 클라이언트 하나가 성능 퇴행과 똑같아 보이고, 릴리스는 아무 이유 없이 되돌려집니다. 보통의 답은 이렇습니다. 첫 단계를 실제 표본이 쌓일 만큼 길게 잡고, 고정된 임계값이 아니라 안정된 쪽과 비교하고, 일정 트래픽 아래에서는 카나리아가 좋은 스테이징 환경보다 더 알려 줄 것이 없다는 사실을 솔직히 인정하는 것입니다.

조용히 일어나기 때문에 이름을 붙여 둘 만한 실패가 둘 있습니다. 첫째는 자기를 망가뜨릴 트래픽을 끝내 만나지 못하는 카나리아입니다. 라우팅이 요청 단위가 아니라 연결 단위로 가중되거나, 그 10%가 한 지역이나 한 클라이언트 버전에서만 뽑힌다면, 그것은 표본이 아니라 편향을 가진 부분집합입니다. 둘째는 상태입니다. 안정된 쪽과 같은 데이터베이스에 쓰는 카나리아는 옛 버전이 읽지 못하는 행을 남길 수 있고, 요청과 달리 행은 다이얼을 되돌린다고 함께 되돌아오지 않습니다. 장면의 4단계가 확대와 축소에 대해 말하는 모든 내용은 여기서 더 약해지지 않고 더 강해집니다. 카나리아는 두 버전이 동시에 쓰는 것을 처음부터 전제하기 때문입니다.

그러니 다이얼은 배포에 붙어 있을 뿐 사실은 노출을 조절하는 장치라고 보는 편이 낫습니다. 고르는 것은 얼마나 빨리 배포할지가 아닙니다. 트래픽의 얼마를 시험대에 올릴지, 얼마나 오래 지켜볼지, 어떤 숫자를 보면 되돌릴지입니다. 이 세 가지는 릴리스 도중이 아니라 릴리스 전에 적어 두세요. 그러면 롤백이 논쟁이 아니라 결정이 됩니다.
