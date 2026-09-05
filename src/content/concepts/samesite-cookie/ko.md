---
title: "SameSite Cookie"
summary: "SameSite는 다른 사이트가 시작한 요청에 쿠키를 실어도 되는지 브라우저에게 알려 주는 속성입니다. Lax는 최상위 이동을 제외한 모든 경우에 쿠키를 빼고, Strict는 그 이동에서도 빼며, None은 모든 요청에 다시 붙이는 대신 Secure를 요구합니다."
category: "애플리케이션 보안"
scene: cors
sceneStep: 4
related:
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: Sticky Session
    slug: sticky-session
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Cookies: HTTP State Management Mechanism (RFC 6265bis)"
    url: https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
  - title: "Work with SameSite cookies in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/samesite?view=aspnetcore-10.0
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
---

장면의 4단계에서는 같은 위조 `POST`가 두 번 나가는데 두 번째는 서버에 닿지도 않습니다. 그사이 서버의 CORS 정책은 하나도 바뀌지 않았습니다. 달라진 것은 세션 쿠키가 이제 `SameSite=Lax`로 선언되어, 다른 사이트가 시작한 요청에 브라우저가 쿠키를 붙이지 않게 되었다는 점뿐입니다. 요청은 사용자를 식별할 것이 아무것도 없는 상태로 도착하고, 엔드포인트는 그것을 입구에서 돌려보냅니다. 답을 숨기는 것과 애초에 호출이 성립하지 않게 하는 것의 차이가 여기 있습니다.

값은 세 가지입니다. `Strict`는 요청받는 사이트와 요청하는 사이트가 같을 때만 쿠키를 붙입니다. 다른 곳에서 링크를 타고 들어오는 경우도 여기에서 빠지므로 링크를 따라간 첫 페이지는 로그아웃된 것처럼 보입니다. `Lax`는 딱 한 경우만 풀어 줍니다. 안전한 메서드로 이루어지는 최상위 이동, 즉 평범한 링크 클릭입니다. 그래서 사용자는 로그인된 상태로 도착하지만 크로스 사이트 `POST`, `fetch`, 이미지, iframe, 폼 전송은 여전히 아무것도 싣지 못합니다. `None`은 어디에나 쿠키를 붙이던 예전 동작으로 되돌리며, 브라우저는 `Secure`가 함께 있을 때만 이를 받아들이므로 평문 HTTP로는 전송되지 않습니다.

"같은 사이트"는 "같은 origin"이 아니고, 이 차이는 구성도를 그릴 때 중요해집니다. 사이트는 등록 가능 도메인으로 비교하므로 `app.example.com`과 `api.example.com`은 같은 사이트이고 `Lax`도 둘 사이에서는 쿠키를 붙여 줍니다. 반면 `shop.example`과 `api.example`은 다른 사이트라 붙지 않습니다. 명세가 정의하는 사이트에는 스킴도 포함되므로 `http` 페이지가 `https` 페이지를 호출하면 크로스 사이트입니다. 그래서 한 상위 도메인 아래에 둔 프런트엔드와 API는 `Lax`로도 쿠키 세션을 유지할 수 있고, 완전히 다른 도메인에 있는 프런트엔드는 `None`에 다른 방어를 모두 더하거나, 쿠키를 버리고 명시적으로 보내는 토큰을 쓰거나 둘 중 하나를 골라야 합니다.

Chromium 계열 브라우저는 속성이 없으면 `Lax`로 다루되, 쿠키가 설정된 뒤 2분 안의 `POST`는 허용하는 더 느슨한 형태로 다루고, 모든 브라우저가 같지는 않습니다. 값을 적어 두어야 하는 가장 강한 이유가 이것입니다. 기본값은 전에도 바뀐 적이 있고, 클라이언트마다 다르며, 명시한 값은 읽는 사람이 볼 수 있는 결정이기 때문입니다. 전역으로 한 번에 정하지 말고 쿠키마다 의도를 담아 지정합니다. 세션 쿠키는 대체로 `Lax`가 맞고, 임베드된 위젯이나 결제 리디렉션이 서드파티 맥락에서 필요로 하는 쿠키는 `None`과 `Secure`여야 하며, 그 경우에는 `SameSite`가 하려던 일을 antiforgery 토큰이 대신 맡아야 합니다.

ASP.NET Core에서는 기능별 쿠키 빌더에 값이 있습니다. 쿠키 인증 핸들러의 `options.Cookie.SameSite = SameSiteMode.Lax`, `AddAntiforgery`의 같은 설정, 세션 쿠키의 `SameSiteMode.Lax`가 그것입니다. `SameSiteMode.None`은 `CookieSecurePolicy.Always`와 직접 짝지어 주어야 합니다. 프레임워크는 아무것도 확인하지 않고, `Secure` 없이 나간 `None` 쿠키는 브라우저가 버립니다. 그리고 `SameSiteMode.Unspecified`는 값을 대신 골라 주는 대신 속성을 아예 빼 버립니다. 이것은 방어의 한 겹으로 다룹니다. 크로스 사이트 요청에서 자동 자격 증명을 없애 줄 뿐이고, 그것이 감당하지 못하는 부분은 antiforgery 토큰과 origin 검사가 채워야 합니다.
