---
title: "Deserialization Security"
summary: "역직렬화는 우리가 쓰지 않은 바이트를 살아 있는 객체로 되살리는 일이고, 그 생성의 순간이 곧 공격면입니다. 방어는 페이로드가 스스로 타입을 지목할 수 있는 형식을 거절하고, 역직렬화 지점 하나하나를 신뢰 경계로 다루는 것입니다."
category: "애플리케이션 보안"
related:
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
  - label: SQL Injection
    slug: sql-injection
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Web Application Firewall
    slug: web-application-firewall
references:
  - title: Deserialization risks in use of BinaryFormatter and related types
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/binaryformatter-security-guide
  - title: Deserialization Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
  - title: JSON serialization and deserialization in .NET
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview
---

## 언제 쓰나

- 외부 바이트가 객체가 되는 지점을 전부 목록으로 만듭니다. 요청 본문만이 아닙니다. 큐 메시지, 캐시 항목, 업로드된 파일, 웹훅 페이로드, 다른 서비스가 써 넣은 행도 모두 역직렬화되고, 한눈에 "사용자 입력"으로 보이지 않는 쪽이 아무도 검토하지 않은 쪽입니다. "우리가 직접 쓴 데이터"라는 말은 다른 누구도 그 저장소에 쓸 수 없는 동안만 성립합니다. 공유 Redis나 접근 정책이 넓은 큐라면 그 바이트도 신뢰 경계 밖입니다.
- 레거시 바이너리 포매터 점검은 상시 작업으로 둡니다. `BinaryFormatter`, `SoapFormatter`, `NetDataContractSerializer`, `LosFormatter`는 모두 페이로드 안에 적힌 타입을 그대로 되살립니다. 페이로드에 무엇이 들어 있든 이 성질 자체가 안전하지 않습니다. 찾는 것은 검색 한 번이고 바꾸는 것은 이관 작업이라, 기한에 쫓기기 전에 시작하는 편이 낫습니다.
- 타입 메타데이터를 실은 JSON은 따로 검토합니다. CLR 타입 이름이 들어간 필드가 있는 문서는 역직렬화기에게 무엇을 만들지 골라 달라고 요청하는 것이고, 그 선택권은 보낸 쪽이 아니라 우리 허용 목록에 있어야 합니다.
- 새 연동의 형식을 고를 때부터 설계 문제로 다룹니다. 스키마가 고정된 계약 우선 형식은 이 문제 부류를 통째로 없애 줍니다. 처음에 정하면 비용이 0이고 나중에 바꾸면 재작성입니다.

## 주의점

- `BinaryFormatter`는 .NET 9에서 제거되었으므로 이관은 더 이상 선택이 아닙니다. API가 사용 중단으로 표시되었다가 예외를 던지게 바뀌었고, 이제 구현 자체가 런타임에서 빠졌습니다. 아직 여기에 기대는 구성 요소는 업그레이드하는 순간 멈추는 구성 요소입니다. 호환 패키지를 찾기보다 형식 변경을 계획합니다.
- 타입 이름 처리는 데이터 형식을 코드 선택 장치로 바꿔 놓습니다. Newtonsoft.Json에서 `TypeNameHandling.Auto`와 `TypeNameHandling.All`은 어떤 타입을 만들지 문서가 정하게 합니다. 우리가 만든 데이터라면 받아들일 만하지만 받은 데이터라면 위험합니다. 바깥에서 닿을 수 있는 경로에서는 `None`으로 두세요.
- 역직렬화한 뒤에 검증하는 것은 이미 늦습니다. 생성 자체가 코드를 실행합니다. 생성자와 속성 설정자, 콜백, 종료자가 우리 검사가 객체를 보기 전에 이미 돌아갑니다. 그래서 검사는 나온 객체가 아니라 입력의 모양과 허용된 타입 집합에 대해 이루어져야 합니다.
- 깊이와 크기는 파싱 전에 제한합니다. 깊게 중첩되거나 거대한 문서는 파싱만으로도 CPU와 메모리를 먹습니다. 타입을 가지고 장난칠 필요조차 없는 서비스 거부입니다. 최대 깊이를 정하고 요청 본문 크기에 상한을 두고, 잘라내지 말고 거절합니다.

## .NET에서는

- `System.Text.Json`은 문서가 지목한 타입을 만들지 않기 때문에 기본이 안전합니다. 다형성은 명시적으로 켜고 닫힌 목록으로만 씁니다. 허용할 하위 타입을 `[JsonDerivedType]`으로 선언하고, 그 목록에 없는 구분자는 조회 실패가 아니라 역직렬화 실패가 됩니다.

```csharp
// The allow-list is in your code; the payload only picks from it.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(CardPayment), "card")]
[JsonDerivedType(typeof(BankTransfer), "transfer")]
public abstract class Payment;

var options = new JsonSerializerOptions
{
    // Parsing limit, applied before any object exists.
    MaxDepth = 32,
    UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
};
```

- 파서 한도는 엔드포인트 한도 옆에 나란히 둡니다. `MaxDepth`가 중첩을 막고 ASP.NET Core의 요청 본문 크기 제한이 파서에 닿는 바이트를 막습니다. 둘이 함께 있어야 악의적인 문서의 자원 비용이 느려짐이 아니라 거절로 끝납니다.
- `DataContractSerializer` 계열은 타입 이름이 아니라 계약에 묶여 있고, 알려진 타입을 코드에서 선언합니다. 그래서 XML 연동의 목적지로는 합리적입니다. 다만 알려진 타입 목록을 닫힌 상태로 유지하고, XML 리더가 문서 형식 정의와 외부 엔터티를 무시하도록 설정해 두어야 합니다.
- 가능한 곳에서는 이관을 기계적으로 만듭니다. 우리 구성 요소끼리 바이너리로 직렬화하던 페이로드는 대개 같은 필드를 가진 JSON이나 protobuf 계약으로 그대로 옮겨집니다. 계약을 명시적으로 적어 두는 것이, 다음 구성 요소가 드러낼 생각도 없던 객체 그래프를 직렬화하는 일을 막아 줍니다.
