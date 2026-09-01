---
title: "Cross-Site Scripting"
summary: "Cross-site scripting은 사용자의 텍스트가 코드로 렌더링되는 것입니다. 스크립트를 실은 댓글 하나가 저장되면 모든 독자의 브라우저에서 그 독자의 세션으로 실행됩니다. 해법은 값이 놓일 자리에 맞게 출력 시점에 인코딩하고, raw 출력 통로를 닫아 두고, 그 아래에 콘텐츠 보안 정책의 그물을 거는 것입니다."
category: "애플리케이션 보안"
scene: cross-site-scripting
steps:
  - title: "독자의 브라우저에서, 독자의 권한으로 실행됩니다"
    text: "고스트는 스크립트를 실은 댓글을 저장하고 손대지 않은 채 렌더합니다. 그러자 페이지가 모든 독자로서, 모든 독자의 쿠키와 세션으로 그것을 실행합니다. 작성자는 한 번 입력했을 뿐인데 사이트가 모두에게 배달합니다. SQL 인젝션과 같은 혼동입니다. 사용자의 텍스트가 이번에는 브라우저에서 코드로 실행됩니다."
  - title: "인코딩하면 같은 글자들이 표시가 됩니다"
    text: "저장소의 댓글은 그대로입니다. 나가는 길에 마크업 글자들이 무해한 표기로 바뀌고, 페이지는 스크립트를 실행하는 대신 글자로 보여 줍니다. 저장할 때가 아니라 출력할 때 인코딩합니다. 원문이 온전히 남아 자리마다 다르게 인코딩되도록요. 걸러진 것이 아니라 글자로 강등된 것입니다."
  - title: "놓이는 자리가 인코딩을 정합니다"
    text: "HTML 본문, 속성, URL. 문맥마다 자기 이스케이프 규칙이 있고, 틀린 규칙을 적용하면 틈이 남습니다. 따옴표 없는 속성 안에서는 본문용 인코딩으로도 빠져나옵니다. 물을 질문은 \"인코딩했는가\"가 아니라 \"놓일 자리에 맞게 인코딩했는가\"입니다. 템플릿 엔진이 기본값으로 옳게 답해 줍니다."
  - title: "탈출구는 잠그고, 그물은 이중으로 칩니다"
    text: "모든 템플릿 엔진에는 \"신뢰된\" HTML을 위한 raw 출력 문이 있습니다. 값이 증명 가능하게 우리 것일 때가 아니면 닫아 두세요. raw 호출 하나가 상류의 모든 인코더를 무효로 만듭니다. 그 아래에는 정책의 그물이 걸립니다. 방어는 인코딩이고, 그물은 누군가 문을 여는 날을 받아 냅니다."
related:
  - label: SQL Injection
    slug: sql-injection
  - label: Input Validation
    slug: input-validation
  - label: Output Encoding
    slug: output-encoding
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
  - title: "Cross Site Scripting (XSS)"
    url: https://owasp.org/www-community/attacks/xss/
  - title: "Cross Site Scripting Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: "Prevent Cross-Site Scripting (XSS) in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/cross-site-scripting
---

## 언제 쓰나

이 방어들을 쓰지 않기로 결정하는 상황은 없습니다. 달라지는 것은 도구가 이미 얼마나 해 두었는가, 그리고 그것을 얼마나 조심스럽게 무너뜨리지 않는가입니다.

- 내가 직접 쓴 값이 아니면 전부, 놓일 자리에 맞게 인코딩합니다. Razor는 `@value`에 대해 이것을 기본으로 해 주고 React는 `{value}`에 대해 해 줍니다. 규율은 그것을 이기지 않는 것입니다. 출력을 손으로 조립하는 자리에서만 명시적인 인코더를 꺼내고, 그때도 목적지에 맞는 것을 꺼냅니다.
- 폼 필드만이 아니라 전부를 신뢰하지 않는 값으로 다룹니다. 우리 데이터베이스에서 나온 표시 이름도 누군가 입력한 것입니다. 파트너 피드에서 동기화한 상품 설명, 업로드 목록의 파일 이름, 서드파티 API에서 되돌아온 오류 메시지, 작년에 우리 서비스가 직접 쓴 값도 마찬가지입니다. "신뢰하지 않음"은 "이 코드베이스가 작성하지 않음"이라는 뜻이고, 페이지 위의 거의 모든 것이 여기 해당합니다.
- 세 얼굴을 알아 둡니다. 셋은 하나의 혼동을 공유합니다. 저장형은 데이터베이스에 살면서 페이지를 여는 모두에게 배달됩니다. 반사형은 링크에 살면서 그 링크를 따라간 사람에게 실행됩니다. DOM 기반은 서버에 아예 닿지 않습니다. 값이 `location.hash`에서 `innerHTML`로 브라우저 안에서 건너가고, 서버 쪽 인코딩은 그 일이 벌어지는 것을 볼 수 없습니다. 셋 다 출력 지점에서 텍스트가 코드가 되는 일입니다.
- 방어를 입력이 아니라 출력에 둡니다. 같은 댓글이 어떤 자리에서는 안전하고 어떤 자리에서는 위험하므로, 판단은 목적지를 아는 곳에 있어야 합니다. 들어올 때 인코딩하면 원문도 함께 파괴되는데, 그 원문이야말로 사용자가 나중에 편집하고 내보내고 검색할 값입니다.
- 입력 검증은 정답이 아니라 2차 방어로 더합니다. `Guid`가 아닌 `Guid`를 거절하고 페이지 크기를 1에서 100 사이로 묶는 일은 쓸모없는 것을 시스템 밖에 두며, 그것만으로도 할 가치가 있습니다. 다만 입력 검증은 형태에 대한 필터이고 스크립트를 실은 댓글도 형태로는 멀쩡한 댓글일 수 있으므로, 어떤 문자열이 속성 안으로 렌더링되는 일을 막아 주지는 못합니다.
- 콘텐츠 보안 정책을 그물로 배치합니다. 어떤 스크립트 출처가 정당한지 통보받은 브라우저는 우리가 이름 붙이지 않은 것을 거부하고, 그래서 인코더 하나를 놓친 사고가 침해가 아니라 리포트가 됩니다. 이 목록의 마지막에 있는 이유는 실무에서도 마지막 층이기 때문입니다.

## 주의점

- `Html.Raw`, `innerHTML`, `dangerouslySetInnerHTML`이 취약 지점입니다. 셋 다 "이 문자열은 이미 HTML이니 파서에 그대로 넘겨라"라고 말하며, 그 위쪽의 모든 인코더를 꺼 버립니다. 사용할 때마다 리뷰에서 방어할 수 있는 근거가 필요합니다. 값이 내가 쓴 상수이거나, 새니타이저를 통과했거나, 인코딩된 조각들로 조립되었거나. "테스트에서는 괜찮아 보였다"는 근거가 아닙니다.
- 리치 HTML을 정화하는 일은 전문가의 몫입니다. 제품이 정말로 사용자 서식 입력을 필요로 한다면, 요소와 속성의 허용 목록을 갖춘 유지 보수되는 새니타이저 라이브러리를 쓰고 다른 보안 의존성처럼 갱신합니다. 필터를 직접 쓰지 마세요. 특히 정규식으로는 쓰지 마세요. HTML은 정규 언어가 아니고, 우회 목록은 이미 다른 사람들이 수십 년에 걸쳐 메운 길입니다.
- 문맥마다 뚫리는 방식이 다릅니다. 따옴표 없는 속성에 놓인 값은 꺾쇠 없이 공백 하나면 빠져나갑니다. 사용자가 정하는 URL은 우리가 예상하지 않은 스킴을 실을 수 있으므로, 인코딩하고 기대하는 대신 `https:`나 `/`로 시작하는지 검증합니다. `<script>` 블록 안은 세 번째 문법이고, 거기서 HTML 인코딩은 아무 쓸모가 없습니다.
- 신뢰하지 않는 값은 인라인 스크립트에 아예 넣지 않습니다. HTML 인코더가 제 일을 할 수 있는 `data-` 속성에 담고, 자바스크립트에서 `dataset`으로 읽고, `innerHTML`이 아니라 `textContent`로 페이지에 씁니다. 모두에게 그 문맥의 이스케이프를 가르치는 대신 문맥 하나를 코드베이스에서 지우는 방법입니다.
- 세션을 실은 쿠키에는 `HttpOnly`가 필요하고 `Secure`와 `SameSite`도 함께 필요합니다. `HttpOnly`는 쿠키를 훔쳐 보이는 시연을 판에서 치워 주며 그것만으로도 값어치가 있지만, 하지 못하는 일도 분명히 해 둡니다. 우리 페이지 안에서 도는 스크립트는 여전히 그 페이지를 통해 독자로서 행동할 수 있습니다. 전리품을 없앨 뿐 문제를 없애지는 않습니다.
- 콘텐츠 보안 정책은 그물이지 방어가 아닙니다. 리포트 전용 모드로 시작해 일주일쯤 리포트를 읽습니다. 첫 판은 언제나 우리가 하고 있는 줄도 몰랐던 무언가를 깨뜨리기 때문입니다. 그다음에 강제합니다. 사이트를 다시 동작시키려고 `unsafe-inline`으로 채운 정책은 아무것도 받아 내지 못하는 정책이므로, 인라인 핸들러를 걷어 낼 시간을 대신 잡아 둡니다.

## .NET에서는

- Razor는 요청받지 않아도 어디서나 `@value`를 나가는 길에 HTML 인코딩합니다. 그렇게 하지 않는 유일한 구문이 `@Html.Raw(value)`이므로, 이 표현이 나오는 자리를 전부 리뷰 지점으로 삼습니다. 저장소 전체에서 `Html.Raw`를 검색하는 일은 2분짜리 점검이고, 릴리스마다 돌려 볼 값어치가 있습니다.
- 세 인코더는 `System.Text.Encodings.Web`에 있습니다. `HtmlEncoder`, `UrlEncoder`, `JavaScriptEncoder`입니다. 서로 바꿔 쓸 수 없으며, 잘못 고르는 것이 바로 이 씬의 세 번째 단계가 다루는 실수입니다.

```csharp
using System.Text.Encodings.Web;

var body = HtmlEncoder.Default.Encode(comment);      // 태그 사이
var query = UrlEncoder.Default.Encode(searchTerm);   // URL 안
var script = JavaScriptEncoder.Default.Encode(name); // 스크립트 리터럴 안
```

- 정책은 미들웨어에서 보내 모든 응답이 싣도록 하고, 리포트 전용 모드로 시작합니다.

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers["Content-Security-Policy-Report-Only"] =
        "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'";
    await next();
});
```

- 세션 쿠키의 플래그는 인증 스킴을 설정하는 자리에서 지정합니다. 기본값이 계속 그대로일 것이라고 믿지 않습니다.

```csharp
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Lax;
    });
```

- 클라이언트 스크립트로 값을 넘길 때는 생성된 자바스크립트가 아니라 마크업을 통합니다. `<div id="board" data-board-name="@board.Name"></div>`는 값을 HTML 속성에 두어 Razor가 알맞게 인코딩하게 하고, `document.getElementById("board").dataset.boardName`은 파서가 그것을 코드로 보는 일 없이 값을 되읽습니다.
- 리치 텍스트에는 직접 만든 헬퍼 대신 유지 보수되는 새니타이저 패키지를 더하고, 출력 지점에서 돌리고, 원문은 데이터베이스에 남깁니다. 정화된 형태를 저장하면 나중에 허용 목록을 바꿔도 다시 적용할 대상이 남아 있지 않습니다.
