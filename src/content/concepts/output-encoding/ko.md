---
title: "Output Encoding"
summary: "출력 인코딩은 파서에게 무언가를 뜻하는 글자를 자기 자신만 뜻하는 글자로 바꾸는 일입니다. 값을 내보내는 그 순간에 일어나며, 무엇을 바꿀지는 값이 놓일 자리가 정합니다. HTML 본문, 속성, URL, 스크립트는 저마다 다른 규칙을 가집니다."
category: "애플리케이션 보안"
scene: cross-site-scripting
sceneStep: 3
related:
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Deserialization Security
    slug: deserialization-security
references:
  - title: "Cross Site Scripting Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: "Prevent Cross-Site Scripting (XSS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cross-site-scripting
  - title: "Cross Site Scripting (XSS)"
    url: https://owasp.org/www-community/attacks/xss/
---

인코딩은 값과 문법 사이의 번역입니다. 페이지를 읽는 브라우저는 파서를 돌리고 있고, 몇 안 되는 글자들은 그 파서에게 내용이 아니라 명령입니다. 인코딩은 바로 그 글자들만을 자기 자신을 뜻하는 표기로 고쳐 씁니다. 여는 꺾쇠 하나가 여는 꺾쇠를 그리는 네 글자가 되는 식입니다. 그래서 파서는 그것을 실행하는 대신 화면에 올려 둡니다. 아무것도 지워지지 않고 아무것도 판정되지 않습니다. 값은 온전히 남고, 달라지는 것은 파서와의 관계뿐입니다. 텍스트가 코드로 오인되는 일에 대한 1차 방어가 인코딩인 이유가 여기 있고, 글자를 버리는 필터링이 그 대체가 되지 못하는 이유도 같습니다.

규칙은 값이 아니라 목적지의 것이며, 팀이 틀리는 곳이 바로 이 지점입니다. 태그 사이에서 문제가 되는 것은 태그나 엔티티를 시작할 수 있는 글자들입니다. 속성 안에서는 그 속성을 닫는 따옴표가 무엇보다 중요하고, 따옴표 없는 속성에서는 평범한 공백 하나로 새 속성으로 빠져나갈 수 있습니다. 본문용 인코더를 따옴표 없는 속성에 적용하면 동작하는 틈이 남는 이유입니다. URL에서는 예약 글자의 집합이 또 다릅니다. 인코딩한 값을 경로에 붙이는 일은 스킴을 한 번도 확인하지 않은 값에 대해서는 아무것도 해 주지 않습니다. 스크립트 블록 안은 세 번째 문법이고, 거기서 HTML 인코딩은 아무것도 이루지 못합니다. 그 자리에서 안전한 수는 더 좋은 인코더가 아니라 값을 스크립트 밖으로 완전히 빼는 것입니다. HTML 인코더가 다룰 수 있는 `data-` 속성에 담고, `dataset`으로 되읽고, `textContent`로 페이지에 씁니다.

인코딩이 입력이 아니라 출력에 속하는 이유는 두 가지이고, 둘 다 같은 사실에서 나옵니다. 첫째는 값이 도착하는 시점에는 목적지를 모른다는 것입니다. 같은 댓글이 페이지에도, 검색 색인에도, 메일에도, CSV 내보내기에도, 로그 한 줄에도 나타나며 각각이 원하는 처리가 다르거나 아예 없습니다. 둘째는 들어올 때 인코딩하면 원문이 파괴된다는 것입니다. 사용자가 되읽는 값이 그가 입력한 값이 아니게 되고, 편집할 때마다 이중 인코딩된 텍스트가 쌓이기 시작하며, 그가 쓴 말로 검색해도 더는 찾아지지 않습니다. 쓰인 것을 저장하세요. 어떻게 표기할지는 어디로 가는지 아는 순간에 정합니다.

실무에서는 이 대부분이 이미 되어 있고, 규율은 그것을 되돌리지 않는 것입니다. Razor는 `@value`를 HTML 문맥에 맞게 자동으로 인코딩하고 React는 `{value}`를 인코딩하며, 둘 다 쓰이는 자리에서 기본값으로 옳습니다. `System.Text.Encodings.Web`은 출력을 손으로 조립할 때를 위해 `HtmlEncoder`, `UrlEncoder`, `JavaScriptEncoder`를 줍니다. 세 개의 별도 타입인 이유는 세 개의 별도 작업이기 때문입니다. 지켜볼 실패는 탈출구들입니다. `Html.Raw`, `innerHTML`, `dangerouslySetInnerHTML`은 문자열을 파서에 곧장 넘겨 상류의 모든 인코더를 무효로 만듭니다. 그리고 이미 안전하게 표기된 값이 인코더를 한 번 더 지나 자기 마크업을 입은 채 페이지에 나타나는 이중 인코딩도 있습니다. 경계에서 한 번, 그 너머의 문법에 맞게 인코딩합니다.
