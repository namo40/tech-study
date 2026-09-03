---
title: "Key Ring"
summary: "키 링은 ASP.NET Core 데이터 보호가 쿠키와 위조 방지 토큰, 수명이 짧은 페이로드를 보호할 때 쓰는 회전하는 키 묶음입니다. 하나는 현재 키이고 예전 키들은 복호화용으로 남으며, 애플리케이션의 모든 인스턴스가 같은 링을 보고 있어야 합니다."
category: "애플리케이션 보안"
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Signature
    slug: signature
  - label: Secret Management
    slug: secret-management
  - label: Secret Store
    slug: secret-store
  - label: Cookie Authentication
    slug: cookie-authentication
  - label: Antiforgery Token
    slug: antiforgery-token
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: ASP.NET Core Data Protection Overview
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-10.0
  - title: Key management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-management?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

## 언제 쓰나

- 애플리케이션이 로드 밸런서 뒤로 처음 들어가는 순간 의도적으로 설정합니다. 쿠키 인증, 위조 방지 토큰, TempData는 전부 보호된 페이로드이고, 한 인스턴스가 보호한 페이로드는 다른 링을 든 인스턴스가 읽지 못합니다. 링을 공유하지 않는 복제본 두 대는 두 요청 중 한 번은 로그인하지 않은 것처럼 보인다는 뜻입니다.
- 증상이 "한 대에서는 되는데 스케일 아웃하면 다 로그아웃된다"일 때 이 페이지를 봅니다. 인증 버그인 경우는 거의 없고, 대개는 키 링이 컨테이너 파일 시스템이나 파드별 볼륨, 아니면 메모리에 있는 경우입니다. 애플리케이션마다 하나여야 할 링이 인스턴스마다 하나가 된 것입니다.
- 배포가 재시작을 넘겨야 한다면 명시적으로 지정합니다. 시작할 때마다 새로 만들어지는 링은 이전 프로세스가 발급한 쿠키를 전부 무효로 만듭니다. 롤링 업데이트는 굴러가는 동안 사용자를 내보내고, 크래시 루프는 그 일을 반복합니다.
- 여러 애플리케이션이 정당하게 같은 보호 데이터를 읽어야 한다면 같은 링을 가리키게 합니다. 같은 보호 페이로드를 읽는 웹 프런트엔드와 백그라운드 사이트는 저장소도 애플리케이션 이름도 같아야 합니다. 이름 자체가 보호에 묶여 들어가기 때문입니다.

## 주의점

- 컨테이너 기본값은 임시 링이고, 아무도 경고해 주지 않습니다. 지속화를 설정하지 않으면 키는 쓰기 가능한 레이어 안의 디렉터리나 메모리로 갑니다. 재시작마다 사라지고 복제본끼리 공유되지도 않습니다. 애플리케이션은 잘 시작하고, 아무도 읽지 않는 경고를 남기고, 개발자의 한 대짜리 컴퓨터에서는 완벽하게 동작합니다.
- 링 저장소 자체가 최고 등급의 비밀입니다. 블롭 컨테이너에 암호화 없이 놓인 키는 인증 시스템 전체가 파일 하나에 들어 있는 것과 같습니다. 그래서 지속화와 보호는 별개의 결정입니다. 링을 오래가고 공유되는 곳에 두고, 그다음 키 관리 서비스로 저장 시 암호화해서 블롭을 읽는 것과 키를 쥐는 것이 같아지지 않게 합니다.
- 데이터 보호는 일시적인 페이로드를 위한 것이지 장기 보관 암호화용이 아닙니다. 키는 만료되고 결국 제거되며, 만료된 키로 암호화한 데이터는 그 키와 함께 읽을 수 없게 됩니다. 3년 뒤에도 복호화되어야 하는 필드는 수명 주기를 우리가 직접 관리하는 별도 암호화 체계에 두어야 합니다.
- 회전은 알아서 일어나고, 예전 키가 남아 있는 데는 이유가 있습니다. 기본 수명은 90일이고 그 뒤로는 새 키가 새 페이로드를 맡습니다. 이전 키들은 기존 쿠키가 만료될 때까지 계속 동작하도록 링에 남습니다. 정리한다고 예전 키를 지우는 것이 평범한 회전을 전원 로그아웃으로 바꾸는 행동입니다.

## .NET에서는

- 링을 인스턴스 바깥에 저장하고 그 자리에서 암호화합니다. 이 두 호출이 운영 설정의 전부이고, 애플리케이션 이름이 두 번째 애플리케이션도 같은 페이로드를 읽게 해 주는 부분입니다.

```csharp
builder.Services.AddDataProtection()
    // Shared and durable: every replica reads the same ring.
    .PersistKeysToAzureBlobStorage(blobUri, credential)
    // Encrypted at rest: reading the blob is not the same as holding the keys.
    .ProtectKeysWithAzureKeyVault(keyIdentifier, credential)
    // Part of the protection binding; changing it invalidates existing payloads.
    .SetApplicationName("contoso-web");
```

- 애플리케이션이 도는 자리에 맞는 저장소를 고릅니다. 공유 볼륨 위의 `PersistKeysToFileSystem`은 온프레미스 답이고, 블롭 저장소는 클라우드 답이며, 이미 있다면 Redis나 데이터베이스 기반 저장소도 맞습니다. 중요한 것은 그 위치가 인스턴스보다 오래 살고 모든 인스턴스에서 보인다는 점입니다.
- `SetApplicationName`은 상투적인 한 줄이 아니라 의도적인 결합입니다. 지정하지 않으면 콘텐츠 루트 경로에서 이름을 끌어내는데, 이 값은 로컬 실행과 컨테이너 사이에서 달라집니다. 페이로드를 공유해야 하는 두 애플리케이션은 같은 문자열을 받기 전까지 조용히 실패합니다.
- `SetDefaultKeyLifetime`은 회전 주기만 바꿉니다. 짧게 잡으면 키가 더 자주 만들어지고, 만료된 키는 전과 똑같이 복호화용으로 남습니다. 그러니 더 엄격한 정책이 필요할 때 안전하게 돌릴 손잡이는 수명이지 키를 손으로 지우는 쪽이 아닙니다.
