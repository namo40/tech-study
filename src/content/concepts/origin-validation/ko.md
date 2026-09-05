---
title: "Origin Validation"
summary: "Origin validation은 서버가 스스로, 브라우저가 붙여 준 Origin 헤더를 읽어 이 요청이 어느 사이트에서 시작됐는지 확인하고 예상 밖의 호스트를 거부하는 검사입니다. SameSite와 antiforgery 토큰 뒤에 서는 세 번째 선이며, 앞의 둘과는 다른 방식으로 무너집니다."
category: "애플리케이션 보안"
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Bearer Token
    slug: bearer-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Origin"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
  - title: "Referer"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

장면의 4단계는 `SameSite`와 `token` 다음에 세 번째 관문을 켜고, 옆의 요약이 셋 다 버틴다고 말합니다. 앞의 둘이 이미 위조 요청을 막았는데 세 번째가 왜 필요한지 묻게 됩니다. 답은 셋이 서로 다르게 무너지기 때문이고, 계층 방어는 각 층이 같은 실패를 공유하지 않을 때에만 진짜가 됩니다.

`SameSite`는 브라우저에 삽니다. 그래서 브라우저가 오래됐을 때, 쿠키가 속성 없이 쓰였을 때, 또는 그 규칙이 여전히 허용하는 요청일 때 무너집니다. `Lax` 아래에서 최상위 GET 이동이 바로 장면이 보여 주는 경우입니다. antiforgery 토큰은 애플리케이션에 삽니다. 그래서 새 엔드포인트가 특성을 빠뜨렸을 때, 프레임워크가 알지 못하는 무언가가 폼을 렌더링했을 때, 또는 토큰이 페이지와 함께 캐시되어 다른 사람에게 전달됐을 때 무너집니다. Origin 검사는 서버에 살면서 페이지가 설정할 수 없는 헤더를 읽으므로 그 모든 상황을 견딥니다. 이쪽이 무너지는 지점은 `Origin` 헤더를 아예 보내지 않는 호출자입니다.

작동 방식은 짧습니다. 브라우저는 모든 교차 origin 요청과 안전하지 않은 메서드를 쓰는 모든 요청에 `Origin`을 붙이며, 같은 origin의 POST에도 붙입니다. 값은 스킴, 호스트, 포트뿐이고 경로는 없습니다. 사용자가 어느 페이지에 있었는지 새어 나가지 않도록 일부러 그렇게 되어 있습니다. 값이 문자 그대로 `null`일 수도 있는데, 교차 origin 리디렉션이나 샌드박스 iframe이 그런 값을 만듭니다. 이것은 헤더가 없는 경우가 아니라 외부 origin으로 다룹니다. `Origin`은 금지된 헤더 목록에 있어서 스크립트가 설정하거나 바꿀 수 없습니다. 페이지는 본문에 무엇이든 담을 수 있지만 이 헤더만은 브라우저가 씁니다. 검사가 딛고 서는 성질이 정확히 이것입니다.

그래서 규칙은 이렇습니다. 상태를 바꾸는 요청마다 `Origin`을 읽고, 우리가 서비스하는 origin 집합과 견주고, 그 밖의 것은 거부합니다. 부분 문자열이 아니라 origin 전체를 비교합니다. 순진하게 `StartsWith`로 비교하면 `https://your-site.example.evil.example`이 우리 호스트로 시작하고, `https://evil-your-site.example`은 우리 호스트를 포함합니다. 헤더를 URI로 파싱해서 스킴, 호스트, 포트를 허용 목록과 정확히 일치하는지 비교합니다.

빈틈은 `Origin`이 아예 없는 요청입니다. 오래된 브라우저는 같은 origin 요청에서 이 헤더를 생략했고, `curl`이나 서비스 간 클라이언트처럼 브라우저가 아닌 호출자는 애초에 보내지 않습니다. `Referer`가 전통적인 대체재이고 origin 부분만 비교한다는 점에서 동작 방식은 같지만, 사용자와 프록시가 이 헤더를 떼어 내기도 합니다. 헤더가 없을 때 취할 수 있는 정직한 선택은 셋이고, 어느 쪽이 맞는지는 엔드포인트에 달렸습니다. 그냥 거부하는 방법은 가장 안전하고 브라우저가 없는 호출자를 끊습니다. `Referer`로 물러섰다가 둘 다 없을 때만 거부하는 방법이 있습니다. 또는 없는 것을 받아들이되 브라우저가 자동으로 붙이지 않는 자격 증명, 예를 들어 bearer 토큰을 요구하는 방법이 있는데, 이것이 곧 위조가 위협이 아닌 경우입니다. 절대 맞지 않는 선택은 쿠키로 인증되는 엔드포인트에서 `Origin`이 없다는 이유로 통과시키는 것입니다. 그러면 이 검사는 공격자가 그저 건드리지 않기만 하면 되는 검사로 바뀝니다.

`Sec-Fetch-Site`는 같은 발상의 더 새롭고 직접적인 형태입니다. 브라우저가 HTTPS origin으로 가는 모든 요청에 `same-origin`, `same-site`, `cross-site`, `none` 중 하나를 담아 보내므로 서버는 관계를 유도하지 않고 바로 읽을 수 있고, 이 헤더 역시 스크립트가 설정할 수 없습니다. 지금은 지원이 충분해서 먼저 확인할 만하고, 보내지 않는 클라이언트를 위해 `Origin`을 뒤에 둡니다.

ASP.NET Core에서는 이 검사를 핸들러 곳곳에 흩뿌리지 않고 엔드포인트 앞의 미들웨어에 둡니다. 그래야 새 엔드포인트가 누군가의 기억이 아니라 이미 있는 코드로 덮입니다. 안전한 메서드는 통과시키고, `Origin`을 설정된 호스트와 견주고, 아니면 `400`을 돌려주는 짧은 필터는 `UseAuthentication`과 `UseAntiforgery` 사이에 자연스럽게 놓입니다. 이 목적으로 CORS 미들웨어를 집어 들지 않습니다. CORS는 누가 우리 응답을 읽어도 되는지를 정하고 브라우저가 사후에 강제하므로, 느슨한 CORS 정책은 위조 요청을 얼마든지 통과시키고, 엄격한 정책도 폼 제출 같은 단순 요청이 전송되는 것은 막지 못합니다. 붙들리는 것은 preflight를 거치는 요청뿐입니다. Origin 검사는 서버 쪽의 거부이고, 그렇게 쓰여야 합니다.
