---
title: "Cross-Site Request Forgery"
summary: "Cross-site request forgery는 내가 만들지 않은 페이지가 내 브라우저를 시켜, 로그인해 둔 사이트로 인증된 요청을 보내게 하는 공격입니다. 브라우저가 쿠키를 붙이는 기준은 요청이 향하는 사이트이지 요청을 시킨 페이지가 아니며, 서버는 요청이 어디에서 왔는지 아무도 보기 전에 그 호출을 실행합니다."
category: "애플리케이션 보안"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "OWASP Cross-Site Request Forgery Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
---

장면의 네 번째 단계가 이 공격 전체입니다. `evil.example` 탭이 `api.example`로 `POST /transfer`를 보내면, 쿠키가 `api.example`의 것이고 요청이 그리로 가기 때문에 브라우저가 사용자의 쿠키를 붙여 줍니다. 서버는 그것을 실행하고 카운터가 올라갑니다. 브라우저가 응답을 페이지에 돌려주지 않기로 하는 것은 그다음이고, 그때는 이미 돈이 옮겨진 뒤입니다. "서버는 실행했다"와 "페이지는 답을 읽을 수 없다" 사이의 이 틈이 모든 cross-site request forgery가 사는 자리입니다.

이 공격이 성립하는 이유는 브라우저의 자격 증명이 주변 환경처럼 자동으로 따라붙기 때문입니다. 쿠키는 목적지를 기준으로 붙고, 진짜 로그인으로 만들어진 세션과 사용자가 신뢰한 적 없는 페이지가 올라탄 세션은 네트워크상에서 구분되지 않습니다. 공격 페이지는 무엇도 읽을 필요가 없습니다. 로드되자마자 전송되는 폼, 상태를 바꾸는 URL을 가리키는 이미지 태그, `credentials: "include"`를 붙인 `fetch` 하나면 충분합니다. 결과를 보는 것이 목적이 아니라 부수 효과가 목적이기 때문입니다.

CORS는 이 공격의 방어책이 아니며, 장면은 그 이유를 일부러 보여 줍니다. 관문은 응답만 검사하므로 막힌 응답은 막힌 "답"이지 막힌 요청이 아닙니다. 더 나쁜 점은, 가장 위험한 형태가 흔히 단순 요청이어서 preflight 자체가 없다는 것입니다. 폼 인코딩 `POST`는 누구의 허락도 구하지 않고 브라우저를 떠납니다. `Access-Control-Allow-Origin`으로 외부인을 막겠다는 것은 피해가 끝난 뒤에 도는 검사에 기대는 셈입니다.

실제로 막는 방법은 네 가지이고, 겹쳐 쓰면 됩니다. 세션 쿠키를 `SameSite=Lax`나 `Strict`로 선언해 브라우저가 크로스 사이트 요청에 애초에 쿠키를 붙이지 않게 하세요. 이것만으로도 공격이 의존하는 자동 자격 증명이 사라집니다. 상태를 바꾸는 엔드포인트마다 antiforgery 토큰을 요구해, 자기 origin이 내려준 페이지만 읽을 수 있는 값을 요청이 지니도록 하세요. 상태를 바꾸는 요청에 대해 `Origin` 헤더를 검사하는 값싼 이중 확인을 두고, 헤더 없이 온 요청은 거절하세요. 그리고 `GET`으로는 아무것도 바꾸지 마세요. `GET`은 공격자가 이미지 태그 하나로 촉발할 수 있는 유일한 형태입니다.

ASP.NET Core에서는 `AddAntiforgery`와 `app.UseAntiforgery()`가 폼 전송과 폼 데이터를 받는 minimal API 엔드포인트를 감당합니다. Razor Pages와 MVC 뷰는 숨은 필드를 자동으로 넣어 주고, 자바스크립트 클라이언트는 antiforgery 쿠키에서 토큰을 읽어 요청 헤더로 되돌려 보냅니다. 순수 토큰 API는 사정이 다릅니다. `Authorization: Bearer` 헤더는 자동으로 따라붙지 않으므로 위조된 요청은 그냥 인증되지 않은 채로 도착합니다. bearer 토큰이 이 공격에 면역이라고 말하는 진짜 이유가 이것이며, 편의를 위해 토큰을 쿠키에 담기로 하는 순간 그 말은 성립하지 않습니다.
