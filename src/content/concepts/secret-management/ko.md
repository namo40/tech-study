---
title: "Secret Management"
summary: "비밀은 집이 하나여야 하고 나머지 모든 곳은 그 참조만 들고 있어야 합니다. 참조로 배포하면 회전이 릴리스가 아니라 데이터 변경이 되고, 모든 읽기를 감사해 두면 유출의 피해 범위를 실제로 잴 수 있습니다."
category: "인증과 인가"
scene: key-rotation
sceneStep: 4
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
  - label: Mutual TLS
    slug: mutual-tls
  - label: Authentication
    slug: authentication
references:
  - title: Azure Key Vault configuration provider
    url: https://learn.microsoft.com/en-us/aspnet/core/security/key-vault-configuration
  - title: Safe storage of app secrets in development
    url: https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets
  - title: Azure Key Vault logging
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/logging
---

비밀 관리는 규칙 하나에서 출발합니다. 비밀은 집이 정확히 하나이고, 나머지 모든 곳은 사본이 아니라 참조를 들고 있습니다. 연결 문자열이 appsettings 파일에, CI 변수에, 배포 매니페스트에, 동료에게 보낸 메시지에 붙여 넣어지는 순간 자격 증명은 더 이상 하나가 아니라 넷입니다. 각각 자기 수명이 있고, 각각 새어 나가는 자기만의 경로가 있습니다. 그래서 진짜 물어야 할 것은 "어디에 암호화해 둘까"가 아니라 "교체하려면 몇 군데를 고쳐야 하는가"이고, 두 번째 질문의 좋은 대답은 한 군데입니다.

참조로 배포하는 방식이 그 대답을 가능하게 합니다. 애플리케이션에는 비밀의 이름과 그것을 읽을 수 있는 신원만 설정하고, 시작할 때와 갱신 주기마다 저장소에서 현재 값을 가져옵니다. 자격 증명 자체는 이미지에도 매니페스트에도 구워 들어가지 않으니 회전은 릴리스가 아니라 데이터 변경이 되고, 저장소가 바뀐 시점과 프로세스가 알아차리는 시점 사이의 간격은 풀 리퀘스트 대기열이 아니라 내가 고른 숫자가 됩니다. 그 숫자는 보안 파라미터입니다. 이미 값을 쥔 프로세스 안에서 폐기된 값이 계속 통하는 시간이 정확히 그만큼이기 때문입니다. 그러니 의도를 갖고 정하고, 비상 회전이 사고 처리 시간 안에 끝날 만큼 짧게 두고, 갱신에 실패하면 지난주 값으로 조용히 되돌아가는 대신 시끄럽게 실패하도록 만듭니다.

읽기 감사는 팀들이 건너뛰었다가 나중에 아쉬워하는 부분입니다. 누가 어떤 비밀을 언제 어디서 가져갔는지 남기는 저장소는 유출 뒤의 최악의 질문을 대답 가능한 질문으로 바꿔 놓습니다. "처음부터 전부라고 가정하자" 대신 신원 목록과 시간 창을 얻습니다. 다만 이것은 그 신원들이 나열할 가치가 있을 때만 통합니다. 공용 애플리케이션 계정 하나가 아니라 서비스마다 신원 하나여야 하고, 권한은 그 서비스가 실제로 필요로 하는 몇 개의 비밀로만 좁혀져 있어야 합니다. 여기서 최소 권한은 서류 작업이 아닙니다. 감사 로그를 소음의 벽에서 피해 범위로 바꿔 놓는 장치이고, 침해된 작업 하나가 볼트 전체를 읽지 못하게 막는 장치입니다.

관리 비용이 가장 싼 비밀은 아예 존재하지 않는 비밀입니다. 관리 ID, 워크로드 아이덴티티 페더레이션, 짧은 수명의 토큰은 저장된 문자열을 플랫폼이 필요할 때 발급하고 아무에게도 알리지 않고 회전해 주는 자격 증명으로 대체합니다. 설정에 한 번도 등장하지 않는 자격 증명은 설정에서 새어 나갈 수도 없습니다. 진짜 비밀이 불가피한 자리라면 그 주위의 다른 문들을 닫습니다. 붙여 넣기가 침해 보고서가 아니라 커밋에서 잡히도록 저장소에 시크릿 스캐닝과 푸시 보호를 켜고, 볼트보다 더 많은 사람이 읽을 수 있는 로그 저장소에 값이 도착하지 않도록 로깅 파이프라인에서 마스킹하고, 폐기와 교체 경로를 미리 연습해 둡니다. 한 번도 돌려 보지 않은 계획은 계획이 아닙니다.
