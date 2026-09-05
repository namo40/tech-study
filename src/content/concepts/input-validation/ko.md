---
title: "Input Validation"
summary: "입력 검증은 경계에서 형식과 길이와 범위를 확인해, 뻔한 헛소리가 비용을 치르기 전에 거절하는 일입니다. 소음과 폭발 반경을 줄이는 필터이지 쿼리를 안전하게 만들어 주는 것은 아닙니다. 그 일은 파라미터화가 합니다."
category: "애플리케이션 보안"
scene: sql-injection
sceneStep: 3
related:
  - label: SQL Injection
    slug: sql-injection
  - label: Prepared Statement
    slug: prepared-statement
  - label: Output Encoding
    slug: output-encoding
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Deserialization Security
    slug: deserialization-security
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Least Privilege
    slug: least-privilege
  - label: Repository
    slug: repository
references:
  - title: "Input Validation Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
  - title: "Model validation in ASP.NET Core MVC"
    url: https://learn.microsoft.com/en-us/aspnet/core/mvc/models/validation
  - title: "SQL Injection Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
---

장면의 3단계는 쿼리 앞에 규칙 카드를 세워 두고 딱 두 가지를 보여 줍니다. 형식이 어긋난 값은 문 앞에서 돌려보내지고 데이터베이스 왕복 한 번도 쓰지 않습니다. 그다음, 형식상 완벽한 값이 같은 카드를 그대로 지나가고, 그래도 data 슬롯에 무해하게 내려앉습니다. 그 값이 도착한 채널은 애초에 무엇도 실행할 채널이 아니었기 때문입니다. 두 가지 읽기 모두 중요하고, 두 번째가 이 페이지가 답이 아니라 동행으로 존재하는 이유입니다.

검증이 정말 잘하는 일은 시스템이 아예 고려할 값의 집합을 좁히는 것입니다. 주문 id는 `Guid`이고, 페이지 크기는 1과 100 사이의 정수이고, 국가 코드는 대문자 두 글자이고, 이메일에는 모양과 최대 길이가 있고, 업로드에는 크기와 콘텐츠 타입이 있습니다. 이 규칙들은 전부 도메인에 대한 진술이고, 경계에서 강제하면 나머지 코드는 그 질문을 그만할 수 있습니다. 이득은 보안만이 아닙니다. 아래쪽 분기가 줄고, 오류 메시지가 좋아지고, 무엇이든 잘못될 수 있는 표면이 작아집니다.

검증이 얼마나 잘 듣는지는 허용 목록 우선 원칙이 정합니다. 위험하다고 믿는 것들을 나열하는 대신, 받아들일 것을 말하고 나머지를 거절합니다. 거부 목록은 적대적 입력의 공간 전체에 대한 주장이고, 인코딩과 정규화 형식과 유니코드 유사 문자와 새 파서가 등장할 때마다 그 주장을 계속 정확하게 유지해야 합니다. 허용 목록은 우리가 실제로 아는 자기 도메인에 대한 주장입니다. "대문자 ASCII 두 글자"는 확신할 수 있는 규칙입니다. "지금 위험하다고 생각하는 문자만 빼고 전부"는 시간이 지나면 낡아 버리고 조용히 실패하는 규칙입니다.

검증이 도울 수 없는 지점은 장면이 일부러 그려 보이는 경우입니다. 형식 규칙을 만족한 공격도 여전히 공격입니다. 규칙은 우리가 상상한 입력을 기준으로 쓰였고, 그 값이 통과한 뒤에 무엇을 하는지에 대해서는 아무 말도 하지 않습니다. 검증이 쿼리를 안전하게 만들어 주지 않는 이유입니다. 파라미터화는 구조적 성질입니다. 값이 이동하는 채널을 파서가 코드로 읽지 않으니, 그 값의 내용은 흥미롭지 않은 것이 됩니다. 그 조건이 성립하면 검증을 통과한 적대적 값은 그저 아무와도 일치하지 않는 이름일 뿐입니다. 성립하지 않으면, 세상에서 가장 엄격한 형식 규칙도 교묘한 인코딩 하나면 의미를 잃습니다.

입력이 해석기를 만나는 다른 모든 자리에서도 관계는 같습니다. 검증은 필터이고, 방어는 값이 HTML에 닿을 때의 컨텍스트 인식 출력 인코딩이고, 값이 컬럼이나 정렬 방향을 지목할 때의 식별자 허용 목록이고, 값이 파일을 지목할 때의 안전한 경로 결합과 정규화 확인이고, 값이 역직렬화 대상을 지목할 때의 타입 허용 목록입니다. 어느 경우든 형태는 같습니다. 소음을 줄이려고 검증하고, 내용이 수신자의 실행을 바꾸지 못하도록 인코딩하거나 바인딩합니다.

검증이 진짜인지는 실무적인 두 가지가 정합니다. 첫째, 서버에서 돌아야 합니다. 클라이언트 측 규칙은 사용자 경험 기능입니다. 왕복을 아껴 주지만 아무것도 막지 못합니다. 정작 문제가 되는 요청은 우리 폼을 거치지 않기 때문입니다. 둘째, 요청을 표현하는 모델 위에서 경계에서 한 번만 돌아야 합니다. 호출 사슬 곳곳에 흩뿌려진 검증은 어느 호출자가 건너뛰게 되어 있는 검증이고, 같은 값을 네 군데에서 다시 검증하는 것은 네 규칙이 서로 어긋나는 지름길입니다. 요청을 타입에 바인딩하고, 그 타입을 검증하고, 그 아래는 전부 이미 범위 안이라고 아는 값으로만 일하게 둡니다.

ASP.NET Core에서는 그것이 모델 검증입니다. 데이터 애너테이션이 형식과 길이와 범위를 선언적으로 덮고, `IValidatableObject`나 검증 라이브러리가 속성 여러 개가 얽힌 규칙을 덮고, `ApiController`는 모델이 유효하지 않으면 problem details 본문과 함께 400을 자동으로 돌려주며, .NET 10부터는 `AddValidation()`을 등록해 두면 Minimal API도 같은 일을 합니다. 엔드포인트 본문은 통과한 입력에서만 실행되는 셈입니다. 규칙은 핸들러가 아니라 모델 옆에 두고, 메시지에 내부 사정을 담지 않고, 타입 시스템이 질 수 있는 몫은 최대한 짊어지게 합니다. `Guid` 파라미터에는 16진수 규칙이 필요 없고, `enum`에는 어떤 값이 존재하는지에 대한 규칙이 필요 없습니다.

정직한 요약은 자막이 말하는 그대로입니다. 소음을 걸러 내려고 검증합니다. 그리고 검증이 놓칠 것이기에 파라미터화하고, 인코딩하고, 계정을 좁힙니다.
