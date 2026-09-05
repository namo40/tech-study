---
title: "Same-Origin Policy"
summary: "Same-origin policy는 브라우저가 사이트와 사이트 사이에 긋는 기본 경계입니다. 페이지는 자기 origin이 돌려준 것을 읽을 수 있고 다른 origin이 돌려준 것은 읽을 수 없습니다. 이 규칙이 제한하는 것은 읽기이지 보내기가 아니며, 그래서 아무 페이지에 있는 폼이라도 우리 사이트로 제출될 수 있습니다."
category: "애플리케이션 보안"
scene: cookie-authentication
sceneStep: 2
related:
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: CORS
    slug: cors
  - label: Cross-Site Request Forgery
    slug: cross-site-request-forgery
  - label: SameSite Cookie
    slug: samesite-cookie
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Origin Validation
    slug: origin-validation
  - label: Bearer Token
    slug: bearer-token
  - label: Access Token
    slug: access-token
references:
  - title: "Same-origin policy"
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
  - title: "Enable Cross-Origin Requests (CORS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cors?view=aspnetcore-10.0
  - title: "Window: postMessage() method"
    url: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
---

장면의 2단계는 우리 회사 누구도 만들지 않은 페이지가 우리 서버로 폼을 제출하고, 브라우저가 거기에 세션 쿠키를 붙여 주는 장면입니다. 처음 보면 브라우저가 애초에 그걸 막았어야 하는 것 아니냐는 생각이 듭니다. 브라우저는 사이트를 갈라 놓는 일을 하기 때문입니다. 실제로 갈라 놓기는 합니다. 그 분리가 same-origin policy이고, 이것이 정확히 무엇을 갈라 놓는지 알고 나면 장면의 나머지가 납득됩니다.

origin은 스킴, 호스트, 포트 세 가지가 모두 정확히 일치하는 조합입니다. `https://shop.example`과 `https://api.shop.example`은 서로 다른 origin이고, `https://shop.example`과 `http://shop.example`도 다르며, 같은 호스트의 443 포트와 8443 포트도 다릅니다. "거의 같다"는 개념은 없습니다. 서브도메인은 남의 도메인만큼이나 외부입니다. 이것은 의도된 설계입니다. 반대로 가면 경계가 흐릿한 규칙이 되고, 경계가 흐릿한 보안 규칙은 논쟁 끝에 쓸모를 잃기 때문입니다.

이 정책이 실제로 금지하는 것은 한 origin이 다른 origin의 데이터를 읽는 일입니다. `evil.example`의 스크립트는 우리 API로 보낸 fetch의 응답 본문을 읽지 못합니다. 우리 페이지를 담은 프레임 안으로 손을 뻗어 DOM을 읽지 못합니다. 우리 호스트의 `document.cookie`를 읽지 못합니다. 우리 origin에서 가져온 이미지를 캔버스에 그린 뒤 그 픽셀을 다시 읽어 내지도 못합니다. 이 목록은 전부 읽기이고, 패턴은 한결같습니다. 브라우저는 요청은 기꺼이 보내 주고, 그 답을 요청한 페이지에 건네주기만 거부합니다.

반대로 이 정책이 금지하지 않는 것은 보내기입니다. 삽입은 설계상 허용됩니다. 웹은 남의 이미지, 스크립트, 스타일시트, 폰트, 영상을 끌어다 쓰는 페이지들로 이루어져 있고, 그 하나하나가 브라우저가 보내고 처리하되 삽입한 페이지에는 바이트를 보여 주지 않는 교차 origin 요청입니다. 폼도 마찬가지입니다. HTML은 처음부터 어떤 페이지든 어떤 URL로든 폼을 제출할 수 있게 해 두었고, 브라우저는 그 목적지에 저장된 쿠키를 실어서 보냅니다. 최상위 이동도 마찬가지입니다. 이 중 어느 것도 실수로 열어 둔 구멍이 아니라 플랫폼이 딛고 선 동작이고, 보안 모델보다 몇 년 앞서 있습니다.

이 두 반쪽이 분명해지면 장면이 더는 놀랍지 않습니다. 위조된 제출이 나가는 이유는 보내기가 애초에 제한된 적이 없기 때문입니다. 쿠키가 함께 실리는 이유는 쿠키가 목적지 기준으로 붙지 누가 요청했는지를 기준으로 붙지 않기 때문입니다. 그리고 공격자는 응답에서 아무것도 알아내지 못하는데, 읽기는 제한되기 때문입니다. cross-site request forgery가 데이터를 훔치는 공격이 아니라 결과를 일으키는 공격인 이유가 여기 있습니다. 공격자는 서버가 무언가를 하게 만들 수는 있어도, 서버가 뭐라고 답했는지는 볼 수 없습니다.

기억해 둘 만한 결론이 둘 더 있습니다. 첫째, CORS는 이 정책에 뚫린 구멍이 아니라 통제된 예외이고, 완화하는 것은 읽기 쪽 절반뿐입니다. 서버는 어떤 origin이 자기 응답을 읽어도 되는지 말할 수 있고, 그 말은 누가 보낼 수 있는지에 대해서는 아무것도 바꾸지 않습니다. 위조 문제를 고쳐 보겠다고 느슨한 CORS 정책을 추가한 팀은 규칙의 엉뚱한 절반을 건드린 것이고, 대개 상황을 더 나쁘게 만듭니다. 자격 증명을 켠 채로 `Access-Control-Allow-Origin`을 열면 공격자에게 읽기 쪽 절반까지 넘겨주는 셈이기 때문입니다.

둘째, 이 정책은 브라우저의 규칙이고 오직 브라우저의 규칙입니다. `curl`, 모바일 앱, 백엔드 서비스, 스크래퍼에는 origin도 없고 정책도 없습니다. 네트워크로 닿을 수 있는 것은 전부 읽을 수 있습니다. 그러니 브라우저가 읽기를 거부해 준다는 이유만으로 안전한 비공개 API는 비공개가 아니고, 엔드포인트의 진짜 방어는 서버에서의 인증과 인가여야 합니다. Same-origin policy는 사용자가 열어 둔 페이지들 사이의 경계이지, 우리 서버를 둘러싼 경계가 아닙니다.
