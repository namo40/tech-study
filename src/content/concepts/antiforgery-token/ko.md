---
title: "Antiforgery Token"
summary: "Antiforgery token은 서버가 페이지 안에 심어 두고 다음 상태 변경 요청과 함께 돌려받기를 기대하는 값이며, 별도의 쿠키에 담긴 나머지 절반과 한 쌍을 이룹니다. 위조된 페이지는 브라우저가 쿠키를 보내게 만들 수는 있어도 우리 페이지를 읽지는 못하므로, 맞춰야 하는 절반을 되돌려 줄 수 없습니다."
category: "애플리케이션 보안"
scene: cookie-authentication
sceneStep: 4
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Origin Validation
    slug: origin-validation
  - label: Same-Origin Policy
    slug: same-origin-policy
  - label: CORS
    slug: cors
  - label: Access Token
    slug: access-token
  - label: Distributed Session
    slug: distributed-session
references:
  - title: "Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0
  - title: "IAntiforgery Interface"
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.antiforgery.iantiforgery
  - title: "Authentication and authorization in minimal APIs"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/security?view=aspnetcore-10.0
---

장면의 4단계는 폼에 칩을 하나 넣고 서버에 관문을 하나 세웁니다. 그 뒤로 토큰을 되돌려 주는 제출은 통과하고 되돌려 주지 못하는 쪽은 `400`으로 거부됩니다. 장면에서 거부되는 것은 위조된 요청이 아닙니다. 위조된 요청은 쿠키를 아예 달고 오지 못해 토큰을 묻기 훨씬 전에 인증 실패로 돌아섭니다. 거부되는 쪽은 토큰이 생기기 전에 그려진 페이지에서 온 정직한 제출이고, 통과한 요청과 같은 세션 쿠키를 달고 도착합니다. 그런데도 서버가 둘을 구별해 내는데, 이 지점은 정확히 짚어 둘 값어치가 있습니다. SameSite 혼자서는 할 수 없는 일이 바로 이것이기 때문입니다.

토큰은 하나의 값이 아니라 한 쌍입니다. 서버는 서로 연결된 두 절반을 만들어, 한쪽은 전용 쿠키에 쓰고 다른 쪽은 페이지 안에 렌더링합니다. 보통은 숨은 폼 필드로 넣고, 때로는 요청 헤더에 실으라고 스크립트에 건네줍니다. 정상적인 제출은 둘 다 돌려주고, 검증은 둘이 서로 맞을 때에만 통과합니다. 브라우저는 쿠키 쪽 절반을 세션 쿠키와 똑같이 요청하는 누구에게나 자동으로 보내므로, 그 절반만으로는 아무것도 증명하지 못합니다. 나머지 절반은 페이지에서 읽어 내야 하는데, 다른 사이트의 페이지가 우리 페이지를 읽지 못하게 막는 것이 same-origin policy입니다. 이 비대칭이 곧 전체 원리입니다. 쿠키는 목적지 기준으로 붙고, 페이지 내용은 origin 기준으로만 읽히며, 토큰은 둘 다를 요구합니다.

이 모양에서 따라 나오는 성질이 둘 있고, 붙잡아 둘 만합니다. 토큰은 세션이 아니라 사용자에게 묶여야 합니다. 그러지 않으면 익명 방문자에게 발급된 토큰이 로그인 이후에도 유효하게 남아, fixation과 비슷한 공격이 옆문으로 돌아옵니다. ASP.NET Core가 토큰을 인증된 사용자 신원에 묶는 이유가 이것이고, 로그인 전에 렌더링된 토큰이 로그인 후에는 통하지 않는 이유이기도 합니다. 그리고 토큰은 예측할 수 없어야 합니다. 세션 식별자나 사용자 식별자나 시계에서 유도한 값이 아니라, 프레임워크가 내주는 암호학적으로 무작위한 값을 씁니다.

실패 양상은 지루하고 흔한데, 그래서 적어 둘 값어치가 있습니다. 캐시된 페이지는 낡은 토큰을 들고 있어서 사용자가 새로 고칠 때까지 모든 제출이 실패합니다. 프레임워크는 토큰을 렌더링하는 응답에 이미 `Cache-Control: no-cache, no-store`를 설정하므로, 이 문제는 CDN이나 출력 캐시가 그 헤더를 덮어쓸 때 나타납니다. 폼을 아예 렌더링하지 않는 싱글 페이지 앱은 토큰을 따로 받아 헤더에 실어야 하고, 그 헤더 이름은 서버가 읽도록 설정된 것과 같아야 합니다. 세션이 만료된 뒤 제출된 폼은 로그인으로 리디렉션되는 대신 검증에서 실패하므로, antiforgery 예외를 알아보고 맨 `400` 대신 사용자를 적당한 곳으로 보내는 핸들러가 필요합니다. 그리고 한 서버에서 렌더링된 토큰을 다른 서버에서 검증하면 Data Protection 키 링을 공유하지 않는 한 실패합니다. 이 키 링은 인증 쿠키가 의존하는 바로 그 키 링이고, 로드 밸런서 뒤에서 간헐적 실패로 드러납니다.

토큰이 오히려 잘못된 도구인 경우도 있고, 거기서 이것을 집어 들면 막는 것보다 만드는 문제가 더 큽니다. bearer 토큰으로 인증하는 API에는 애초에 풀 위조 문제가 없습니다. 브라우저가 `Authorization` 헤더를 알아서 붙이지 않으므로, 다른 사이트의 페이지는 인증된 요청을 만들어 낼 방법 자체가 없습니다. 그런 엔드포인트에 antiforgery를 얹으면 얻는 것은 없고 브라우저가 아닌 클라이언트가 전부 깨집니다. 규칙은 자격 증명이 자동으로 붙는 곳에 antiforgery가 필요하다는 것이고, 실제로 그 말은 쿠키를 뜻합니다.

ASP.NET Core에서 필요한 조각은 작습니다. `AddAntiforgery`가 쿠키와 헤더 이름을 설정하고, form 태그 헬퍼가 POST 메서드를 쓰는 폼마다 숨은 필드를 써 넣습니다. `[ValidateAntiForgeryToken]`은 액션 하나를 검증하고, 전역에 건 `[AutoValidateAntiforgeryToken]`은 안전하지 않은 메서드 전부를 검증합니다. 이 페이지를 읽지 않은 사람이 새 엔드포인트를 추가해도 살아남는 모양은 후자입니다. Minimal API는 폼 데이터를 바인딩하는 엔드포인트에 대해 `UseAntiforgery`에서 같은 것을 얻습니다. 그런 엔드포인트에는 antiforgery 메타데이터가 기본으로 붙기 때문입니다. JSON 본문을 읽는 엔드포인트는 그 메타데이터를 직접 붙이거나 `ValidateRequestAsync`를 스스로 부르기 전까지는 보호되지 않습니다. 미들웨어는 토큰을 로그인한 사용자에게 묶을 수 있도록 인증 뒤에 놓습니다. 직접 만들어야 한다면 `IAntiforgery.GetAndStoreTokens`가 쌍을 만들고 `ValidateRequestAsync`가 그것을 검사합니다. 이 메서드는 false를 돌려주는 대신 예외를 던지므로, `await`를 빠뜨렸다고 해서 요청이 조용히 통과하는 일은 없습니다.

마지막으로 계층 관계를 분명히 해 둡니다. `SameSite=Lax`는 위조 요청 대부분을 브라우저 밖으로 나가기 전에 막고, antiforgery 토큰은 SameSite 규칙이 여전히 허용하는 것들을 잡아내며, origin 검사는 둘 다 놓친 것을 잡습니다. 토큰은 가운데 층이자 온전히 우리 애플리케이션 안에서만 동작하는 유일한 층이고, 그래서 배포되어 있다고 확신할 수 있는 층이기도 합니다.
