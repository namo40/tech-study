---
title: "Shadow Deployment"
summary: "그림자 배포는 운영 트래픽의 사본을 허공에 대고 답하게 합니다. 실요청이 새 판의 동작과 용량을 증명하는 동안 사용자는 현행판만 봅니다. 부작용이 설정으로 우리에 갇혀 있고, 새 판의 응답이 제공되지 않고 비교되기만 한다면 그렇습니다."
category: "컨테이너와 오케스트레이션"
scene: shadow-deployment
steps:
  - title: "합성 부하는 실물의 모양을 모릅니다"
    text: "고스트는 스테이징을 우수한 성적으로 통과합니다. 깨끗한 입력, 고른 박자. 그리고 운영을 만납니다. 긴 꼬리, 이상한 인코딩, 월요일의 급증. 시험은 정직했지만 그 안의 트래픽이 아니었습니다. 트래픽을 고쳐야 합니다. 실물의 사본을 상대로 새 판을 증명하는 것입니다."
  - title: "사본은 그림자에게, 응답은 사용자에게 갑니다"
    text: "모든 실요청은 여느 때처럼 현행판이 응답합니다. 그리고 그 쌍둥이가 새 판을 상대로 재생되고, 새 판의 응답은 소켓이 아니라 비교기로 떨어집니다. 진짜 입력, 진짜 물량, 진짜 박자, 사용자 영향은 0. 성적표를 받는 것은 코드뿐입니다."
  - title: "그림자의 부작용은 우리에 가둡니다"
    text: "진짜 코드가 진짜 입력을 상대로 도니, 쓰고, 청구하고, 보내려 들 것입니다. 그 하나하나가 벽에 부딪혀야 합니다. 읽기 전용 저장소, 모의 엔드포인트, 눌러 둔 메일. 우리는 포크가 아니라 설정입니다. 같은 빌드가 설정으로 갈라진 것입니다. 우리가 없는 그림자는 고객에게 메일을 두 번 보내는 두 번째 운영입니다."
  - title: "비교가 성적표이고, 승격이 졸업입니다"
    text: "불일치 하나하나가 어떤 사용자도 보지 못한 채 실물 트래픽에서 잡힌 버그입니다. 조사하고, 고치고, 다시 일치가 쌓이게 둡니다. 그림자가 몇 주 동안 실부하에서 현행판처럼 답해 왔다면, 승격은 앞으로 겪을 가장 심심한 배포입니다."
related:
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rollback
    slug: rollback
  - label: Feature Flag
    slug: feature-flag
  - label: Load Test
    slug: load-test
  - label: Capacity Test
    slug: capacity-test
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: External Configuration
    slug: external-configuration
  - label: Secret Injection
    slug: secret-injection
  - label: Configuration
    slug: configuration
references:
  - title: Shadow Testing
    url: https://microsoft.github.io/code-with-engineering-playbook/automated-testing/shadow-testing/
  - title: Mirroring
    url: https://istio.io/latest/docs/tasks/traffic-management/mirroring/
  - title: Dark Launching
    url: https://martinfowler.com/bliki/DarkLaunching.html
---

## 언제 쓰나

- 변경이 커서 스테이징이 동작 여부를 알려 주지 못할 때 꺼냅니다. 새 저장 엔진, 프레임워크 이식, 다시 쓴 가격 규칙처럼 동작이 똑같아야 하는 변경은, 옛 판이 받고 있는 바로 그 입력을 상대로 돌려 보는 것이 유일하게 정직한 확인 방법입니다. 그림자 배포는 또 하나의 시험 환경이 아니라, 실제 입력을 서비스의 두 번째 사본으로 향하게 하고 그 응답을 비교하는 일입니다.
- 질문이 정확성이 아니라 용량일 때 씁니다. "v2가 운영 물량을 견딜까"라는 질문의 물량은 믿을 만한 출처가 하나뿐입니다. 미러링된 흐름은 생성기가 상상한 분포가 아니라 실제 도착 패턴, 실제 키 분포, 실제 페이로드 크기를 줍니다. 다만 부하 시험이나 용량 시험을 대신하지는 않습니다. 그쪽은 오늘의 트래픽 너머로 일부러 밀어붙이는 수단이고, 그림자는 지금 일어나는 일만 보여 줍니다. 둘을 함께 쓰고, 합성 모델이 틀렸다는 사실은 그림자가 말하게 두는 것이 좋습니다.
- 플래그를 켜기 전 오래 묵히는 검증에 씁니다. 카나리는 새 코드를 실사용자 일부에게 보여 주지만 그림자는 아무에게도 보여 주지 않습니다. 그래서 카나리의 경쟁자가 아니라 그 앞 단계이고, 심각한 버그의 대가가 사과가 아니라 보고서의 불일치 한 줄로 끝나는 유일한 단계입니다. 며칠이나 몇 주를 돌리고 나면, 그 뒤의 승격은 시시합니다. 그 판은 이미 그 일을 해 오고 있었으니까요.
- 읽기가 많은 서비스부터 시작합니다. 우리를 만드는 값이 가장 싸기 때문입니다. 검색 엔드포인트, 가격 계산, 추천 호출은 억눌러야 할 것이 거의 없는 채로 진짜 경로를 돌릴 수 있습니다. 쓰고, 청구하고, 알리는 일이 많은 서비스일수록 첫 사본을 보내기 전에 필요한 설정이 늘어나고, 아래에 적은 점검도 그만큼 꼼꼼해야 합니다.
- 동작을 명세로 적기는 어려운데 비교하기는 쉬운 곳에서 가장 크게 남습니다. 답이 무엇이어야 하는지 적을 수 없어도, 현행판이 말하는 것과 같아야 한다고는 말할 수 있습니다. 비교기는 그 문장을 수백만 건의 실요청 위에서 측정 가능한 성질로 바꿔 줍니다.

## 주의점

- 부작용이 위험의 전부이고, 점검은 첫 미러링 요청 뒤가 아니라 앞에 옵니다. 서비스를 놓고 밖으로 내보내는 것을 전부 적습니다. 기록되는 행, 청구되는 결제, 나가는 메일과 푸시, 발사되는 웹훅, 발행되는 메시지, 호출되는 하위 서비스. 그리고 하나하나에 대해 억누를지, 모의로 바꿀지, 대역을 향하게 할지 정합니다. 그 목록이 닫힌 다음에야 미러링을 켭니다. 순서를 뒤집으면 서비스가 무엇을 내보내는지 두 번 나가는 광경을 보면서 알게 됩니다.
- 우리를 만드는 것은 설정이지 분기가 아닙니다. 그림자는 승격할 바로 그 산출물이어야 합니다. 아니면 앞으로 돌지 않을 빌드에 대해 무언가를 증명한 셈입니다. 기능 플래그는 꺼 두고, 메일 발신자는 아무 일도 하지 않는 구현으로 바꾸고, 연결 문자열은 읽기 복제본을 향하게 하고, 결제 게이트웨이는 샌드박스를 향하게 합니다. 전부 시작할 때 적용되는 설정에서 오므로, 승격하는 물건은 시험한 물건과 정확히 같습니다.
- 두 배가 된 부하는 진짜이고 누군가는 그 값을 냅니다. 미러링은 공유 의존 대상마다 읽기 트래픽을 두 배로 만들어서, 데이터베이스와 캐시와 모든 하위 서비스가 두 배를 감당하게 됩니다. 그만큼 용량을 잡든지, 그림자에게 복제본과 자기 캐시처럼 별도 데이터 경로를 주든지 해야 합니다. 후자를 고르면 두 판이 조금씩 다른 데이터를 읽게 되고, 그것 자체가 불일치의 원인이 됩니다.
- 비교에는 정규화가 필요합니다. 그러지 않으면 불일치가 잡음에 잠깁니다. 타임스탬프, 생성된 id, 요청 범위 카운터, 맵 순회 순서, 부동소수점 표기는 요청마다 다르고, 그것을 전부 보고하는 비교기는 아무것도 보고하지 않는 것과 같습니다. 변하기 마련인 필드를 정규화하고, 바이트가 아니라 구조로 비교하고, 잡음 예산을 설계의 일부로 다룹니다. 0 근처로 내리지 못하는 불일치율은 코드 문제가 아니라 비교기 문제입니다.
- 미러링된 트래픽은 아무에게도 응답하지 않는 코드 경로로 실사용자 데이터를 실어 나릅니다. 응답하지 않는다고 해서 데이터가 덜 진짜인 것은 아닙니다. 그림자는 운영과 똑같은 개인정보, 똑같은 토큰, 똑같은 요청 본문을 봅니다. 그러니 접근 통제도, 로그 가림도, 보존 규칙도, 데이터 지도에서의 자리도 운영과 같아야 합니다. 접근과 개인정보 관점에서는 운영으로 다루세요. 실제로 그렇기 때문입니다.
- 전량 미러링이 늘 감당되지는 않습니다. 보통은 표본을 뜹니다. 고정 비율이나 일부 테넌트 전체를 쓰는 식이고, 운영 트래픽의 10%만 해도 생성기보다 비교할 수 없이 대표성이 높습니다. 다만 의도를 갖고 뜨는 것이 좋습니다. 균일 표본은 드문 요청 모양을 적게 담는데, 그림자가 가장 잘 잡아내는 버그가 바로 그런 입력에서 나옵니다.
- 그림자가 건드려도 되는 대상은 두 번 건드려도 괜찮은 것이어야 합니다. 이제 같은 요청을 두 판이 처리하므로, 공유 큐 소비자나 카운터, 양쪽이 함께 쓰는 중복 방지 키는 중복 사고를 기다리는 자리입니다. 같은 요청을 반복해도 결과가 달라지지 않게 만드는 규율을 두 번째 독자에게도 적용하는 셈이고, "쓰게 두고 나중에 치우자"보다 "대역을 향하게 하자"가 더 안전한 조언인 이유이기도 합니다.
- 그림자는 응답이 일치한다는 것을 증명할 뿐, 새 판이 좋다는 것을 증명하지 않습니다. 옛 동작이 옳았는지는 말해 주지 못하고, 아직 아무도 보내지 않는 요청에 대해서는 아무것도 보지 못하며, 두 판이 똑같은 방식으로 틀렸다는 사실도 기꺼이 확인해 줍니다. 품질이 대단히 높은 회귀 그물일 뿐 그 이상은 아닙니다.

## .NET에서는

가장자리에서 미러링은 보통 메시가 맡습니다. Istio와 Envoy는 어떤 경로의 트래픽 사본을 두 번째 대상으로 보내고 그 응답을 버리므로, 애플리케이션은 갈라짐을 보지 못합니다.

```yaml
# 사본은 보내고 잊습니다. 호출자는 live가 응답하고 shadow를 기다리지 않으므로,
# 느리거나 실패하는 그림자가 사용자의 문제가 될 수 없습니다.
http:
  - route:
      - destination: { host: checkout, subset: live }
    mirror: { host: checkout, subset: shadow }
    mirrorPercentage: { value: 10.0 }
```

메시가 없다면 YARP가 파이프라인 안에서 요청을 복제할 수 있습니다. 사본은 버퍼에 담겼다가 따로 보내지므로, 사용자의 응답이 그것 때문에 붙들리는 일은 없습니다.

```csharp
app.Use(async (context, next) =>
{
    context.Request.EnableBuffering();
    var copy = await ShadowRequest.CaptureAsync(context.Request);
    context.Request.Body.Position = 0;

    // 사용자의 호출은 곧바로 이어집니다. 사본은 그림자로 발사되고
    // 그 응답은 비교기로 가며, 이 응답으로 돌아오지 않습니다.
    _ = shadow.SendAndCompareAsync(copy, context.TraceIdentifier);
    await next(context);
});
```

우리 자체는 평범한 설정입니다. 환경이 주는 값을 시작할 때 한 번 읽습니다.

```csharp
var role = builder.Configuration["Deployment:Role"];   // "live" 또는 "shadow"
var caged = role == "shadow";

// 빌드는 하나, 환경은 둘. 아래 어느 줄도 컴파일 시점의 차이가 아닙니다.
builder.Services.AddSingleton<IMailSender>(sp =>
    caged ? new NoOpMailSender() : sp.GetRequiredService<SmtpMailSender>());
builder.Services.AddDbContext<ShopContext>(o =>
    o.UseSqlServer(builder.Configuration[caged ? "Db:ReadReplica" : "Db:Primary"]));
builder.Services.Configure<PaymentOptions>(
    builder.Configuration.GetSection(caged ? "Payments:Sandbox" : "Payments:Live"));
```

비교기는 공들여 쓸 값어치가 있는 부분입니다. 이 일 전체가 신호를 내놓을지 잡음의 벽을 내놓을지가 여기서 갈립니다. 비교하기 전에 양쪽 응답을 정규화하고, 두 호출이 공유하는 상관 id로 비교마다 키를 붙이고, 재현할 수 있을 만큼의 요청과 함께 불일치를 기록합니다.

```csharp
static JsonNode Normalise(JsonNode answer)
{
    // 여기 있는 값은 요청마다 달라지고 아무 의미도 없습니다.
    // 이것을 걷어낸 뒤에 남는 것이 불일치가 정말로 가리키는 부분입니다.
    answer["generatedAt"] = null;
    answer["requestId"] = null;
    foreach (var line in answer["lines"]!.AsArray()) line!["rowVersion"] = null;
    return answer;
}
```

나머지는 늘 쓰는 플랫폼 살림입니다. 갈라짐에는 `IConfiguration`과 옵션 패턴을 쓰고, 그림자도 다른 것과 똑같이 배포되고 지켜보도록 health probe와 readiness probe를 두고, 성적표에 응답 본문뿐 아니라 지연과 오류율도 들어가도록 두 판에 같은 지표와 추적을 답니다. 불일치율이 충분히 오래 0에 머물렀다면 승격은 라우팅 변경 한 번이고, 트래픽을 받게 되는 판은 이미 어둠 속에서 그 일을 해 온 판입니다.
