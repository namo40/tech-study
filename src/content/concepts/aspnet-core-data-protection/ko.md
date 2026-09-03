---
title: "ASP.NET Core Data Protection"
summary: "Data Protection은 프레임워크가 쿠키와 위조 방지 토큰과 TempData를 보호할 때 직접 쓰는 암호화 API입니다. `IDataProtector`가 페이로드를 암호화하고 무결성을 붙이며, 목적 문자열이 소비자끼리를 격리하고, 그 아래에서 키 링이 키를 댑니다."
category: "애플리케이션 보안"
related:
  - label: Key Ring
    slug: key-ring
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: Secret Store
    slug: secret-store
  - label: Distributed Session
    slug: distributed-session
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Consumer APIs overview for ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/consumer-apis/overview?view=aspnetcore-10.0
---

## 언제 쓰나

- 이미 쓰고 있기 때문에 알아 둡니다. 쿠키 인증도 위조 방지 토큰도 TempData도 누가 설정했든 아니든 이 층을 지나 페이로드를 보호합니다. 그래서 복제본 여러 대에서 인증 버그처럼 보이는 질문은 대개 이 API의 키에 대한 질문입니다. 우리가 설정하는 것은 그 키를 어디에 두고 어떻게 보호할지이고, 그 결정이 사는 자리는 Key Ring 페이지입니다.
- 우리 코드가 짧게 사는 값을 밖으로 내보냈다가 그대로 돌려받아야 할 때 `IDataProtector`를 꺼냅니다. 이메일 확인 토큰, 수신 거부 링크, 리디렉션을 왕복하는 state 매개변수 같은 것들입니다. 나갈 때 보호하고 들어올 때 해제하면, 손을 댄 값은 조용히 다른 무언가로 디코딩되는 대신 해제 자체에 실패합니다.
- 소비자끼리 서로의 페이로드를 읽지 못하게 하려면 목적 문자열을 씁니다. `CreateProtector("Contoso.EmailConfirmation")`은 같은 링에서 별개의 키를 유도합니다. 그래서 이메일 확인용으로 찍은 토큰은, 같은 애플리케이션에서 같은 키로 도는 비밀번호 재설정 보호기로는 해제되지 않습니다. 이 격리는 공짜이고, 이것을 건너뛰면 한 기능의 토큰이 다른 기능의 위조 입력이 됩니다.
- 페이로드가 스스로 만료되어야 한다면 시간제한 변형을 씁니다. `ToTimeLimitedDataProtector`는 보호된 값 안에 만료 시각을 심습니다. 그래서 만료된 토큰은 우리가 대조할 저장소 없이도 해제 단계에서 실패합니다. 비밀번호 재설정 링크가 딱 이 모양입니다.

## 주의점

- 이것은 장기 보관용 암호화가 아니고, 그렇게 여기면 데이터를 잃습니다. 키는 일정에 따라 굴러가고 옛 키는 결국 지워집니다. 그래서 오늘 보호한 페이로드가 1년 뒤에는 우리 잘못 없이도 읽히지 않을 수 있습니다. 그 키 수명 주기를 쥔 쪽은 우리가 아니라 프레임워크입니다. 교체 주기를 넘겨서도 해독할 수 있어야 하는 것은, 수명 주기를 우리가 쥐는 별도의 암호화 체계에 두어야 합니다.
- 보호는 암호화에 무결성을 더한 것이지 공개 서명이 아닙니다. 키 링이 없는 쪽에서 페이로드는 읽히지 않고 변조도 드러나지만, 검증할 수 있는 쪽도 그 링을 가진 쪽뿐이라서 제3자에게 작성자를 증명하지는 못합니다. 우리 키 없이 다른 쪽이 값을 검증해야 한다면 그것은 보호의 문제가 아니라 서명의 문제입니다.
- 목적 문자열은 계약이고, 바꾸면 기존 페이로드가 전부 무효가 됩니다. `"EmailConfirmation"`을 `"Email.Confirmation"`으로 이름만 바꿔도 사용자 메일함에 이미 들어간 링크가 전부 해제되지 않습니다. 문자열은 의식적으로 고르고, 인라인 리터럴이 아니라 상수로 두고, 하나를 바꾸는 일은 정리 작업이 아니라 마이그레이션으로 다루세요.
- 인스턴스가 여럿이라면 위의 모든 이야기가 성립하기 전에 키 링부터 공유해야 합니다. 한 복제본이 보호한 페이로드는 다른 링을 가진 복제본에게는 의미 없는 바이트이고, 컨테이너의 기본값은 프로세스와 함께 죽는 링입니다. 지속화와 애플리케이션 이름을 설정하는 일이 위의 모든 것의 전제 조건이고, 그 방법은 Key Ring 페이지가 다룹니다.

## .NET에서는

- `IDataProtectionProvider`를 주입받고 목적을 붙여 보호기를 만들고, 두 호출을 대칭으로 유지합니다. `Unprotect`는 변조되거나 만료된 페이로드에 예외를 던지므로, 이 catch는 방어적인 잡음이 아니라 API의 일부입니다.

```csharp
public sealed class EmailConfirmationTokens(IDataProtectionProvider provider)
{
    // The purpose is a contract: change this string and every issued token dies.
    private readonly ITimeLimitedDataProtector protector =
        provider.CreateProtector("Contoso.Web.EmailConfirmation").ToTimeLimitedDataProtector();

    // The expiry travels inside the payload; there is no table to check.
    public string Issue(Guid userId) =>
        protector.Protect(userId.ToString(), TimeSpan.FromHours(24));

    public bool TryRead(string token, out Guid userId)
    {
        userId = default;
        try
        {
            // Tampered, expired, or protected for a different purpose: all throw here.
            return Guid.TryParse(protector.Unprotect(token), out userId);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }
}
```

- 프레임워크 안의 소비자들도 정확히 이렇게 합니다. 쿠키 인증은 자기 목적 사슬로 보호기를 만들어 티켓을 보호합니다. 저장소는 공유하지만 애플리케이션 이름은 다른 두 애플리케이션 사이에서 한쪽이 발급한 쿠키를 다른 쪽이 읽지 못하는 이유가 그것입니다.
- 목적은 더 잘게 격리하려고 겹쳐 쓸 수 있습니다. `CreateProtector("Contoso.Web.EmailConfirmation", tenantId)`는 같은 링에서 테넌트마다 다른 키를 유도합니다. 그래서 두 번째 키 저장소도 두 번째 설정도 없이, 한 테넌트의 토큰이 다른 테넌트에서는 해제되지 않습니다.
- `IPersistedDataProtector`는 무엇을 요청하는지 알고 있을 때만 씁니다. 폐기되거나 만료된 키로도 해제할 수 있게 해 주는데, 이것은 특정 마이그레이션을 위한 복구 도구이지 위의 주의점을 우회하는 길이 아닙니다. 이것을 습관처럼 꺼내고 있다면 그 페이로드는 애초에 짧게 사는 값이 아니었던 것입니다.
