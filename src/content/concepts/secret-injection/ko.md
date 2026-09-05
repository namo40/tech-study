---
title: "Secret Injection"
summary: "시크릿 주입은 자격 증명이 산출물 안에 살지 않으면서 워크로드에 도착하는 방식입니다. 이미지는 깨끗하게 남고, 플랫폼이 시작 시점에 환경 변수나 마운트된 파일로 비밀을 배달하며, 배달된 것은 아무것도 다시 빌드하지 않고 교체하거나 범위를 좁힐 수 있습니다."
category: "컨테이너와 오케스트레이션"
scene: secret-injection
steps:
  - title: "이미지에 구운 비밀은 이미지가 가는 곳마다 따라갑니다"
    text: "고스트는 레이어에 봉인된 자격 증명을 보여 줍니다. 모든 pull이 그것을 복사하고, 모든 캐시가 그것을 보관하며, 교체하려면 세상을 다시 빌드해야 합니다. 주입은 전제를 뒤집습니다. 산출물은 비밀을 싣지 않고, 플랫폼이 실행 중인 파드 하나에 배달합니다."
  - title: "환경 변수는 가장 쉬운 길이고, 그만큼 잘 샙니다"
    text: "플랫폼은 파드가 뜨는 동안 슬롯을 채웁니다. 어떤 런타임이든 읽을 수 있고 라이브러리도 필요 없습니다. 그러나 환경은 여행합니다. 자식이 물려받고, 덤프가 싣고 다니고, 진단 페이지가 출력해 버립니다. 값은 시작 시점에 얼어붙습니다. 교체는 곧 재시작입니다."
  - title: "스토어에서 파일로. 한곳에서 관리되고, 목록으로 좁혀집니다"
    text: "비밀은 버전을 아는 스토어에 살고, 접근 목록에 있는 파드에만 마운트된 파일로 도착합니다. 저 deny가 곧 기능입니다. 교체할 곳 하나, 감사할 곳 하나, 누가 읽어도 되는지 말하는 목록 하나. 파일은 환경 변수의 누수도 비켜 갑니다. 아무도 물려받지 않고, 덤프에 실리지 않습니다."
  - title: "교체는 배달 경로를 따라 흐릅니다"
    text: "스토어에서 버전을 바꾸면 퍼져 나갑니다. 마운트된 파일은 제자리에서 갱신되고, 환경 변수는 다음 재시작에 따라잡고, 어디에서도 이미지를 다시 빌드하지 않습니다. 비밀의 수명은 스토어의 것, 워크로드의 수명은 플랫폼의 것, 산출물은 어느 쪽 것도 아닙니다."
related:
  - label: Secret Management
    slug: secret-management
  - label: Workload Identity
    slug: workload-identity
  - label: Key Rotation
    slug: key-rotation
  - label: Environment Variable
    slug: environment-variable
  - label: Secret Store
    slug: secret-store
  - label: Configuration
    slug: configuration
  - label: Key Ring
    slug: key-ring
  - label: Least Privilege
    slug: least-privilege
  - label: Sidecar
    slug: sidecar
references:
  - title: Secrets
    url: https://kubernetes.io/docs/concepts/configuration/secret/
  - title: Use the Azure Key Vault provider for Secrets Store CSI Driver in AKS
    url: https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver
  - title: Safe storage of app secrets in development in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets
---

## 언제 쓰나

- 컨테이너가 실제로 필요로 하는 모든 자격 증명, 그러니까 연결 문자열, API 키, 인증서, 서명 재료를 빌드에 새겨 넣는 대신 시작 시점에 배달할 때 씁니다. 판단 기준은 간단합니다. 누군가 이미지를 받아서 그 안에서 비밀을 읽어 낼 수 있다면, 그 비밀을 지켜 준 것은 아무도 모를 것이라는 기대뿐이었습니다. 공개 레지스트리나 유출된 pull 토큰, 한 번이라도 `docker save`를 돌린 노트북 앞에서 그 기대는 남지 않습니다.
- 같은 산출물이 둘 이상의 환경에서 돌아야 할 때 씁니다. 한 번 빌드하고 다르게 주입한다는 것이 이 패턴이 존재하는 이유입니다. 이미지 하나가 스테이징과 운영에 그대로 가서 시작할 때 서로 다른 값을 받아 오고, 그 결과 테스트한 것과 배포한 것이 비트 단위로 같아집니다. 환경마다 이미지를 따로 만드는 쪽을 고르면 빌드 조합이 늘어나고, 가장 덜 테스트된 이미지가 하필 운영 이미지가 됩니다.
- 교체가 곧 재빌드여서는 안 될 때 씁니다. 레이어에 사는 자격 증명은 새 산출물을 만들고 그것을 돌리는 모든 곳을 다시 배포해야만 교체되므로, 교체가 릴리스가 되어 버립니다. 배달이 시작 시점에 일어나면 교체는 스토어 한 곳의 변경과, 많아야 재시작 한 번입니다. 분기마다 붙잡는 프로젝트와 평범한 화요일 사이의 차이가 여기서 갈립니다.
- 접근을 워크로드마다 좁혀야 할 때 씁니다. 접근 목록을 가진 스토어는 이 자격 증명이 이 두 워크로드에만 가고 다른 어디에도 가지 않는다고 말할 수 있고, 그 말을 검토자가 읽을 수 있는 자리에 적어 둘 수 있습니다. 이미지에 구워진 것은 범위를 좁힐 방법이 아예 없습니다. 이미지를 가진 사람이 값을 가집니다.
- **비밀이 아예 없는 쪽이 낫습니다.** 플랫폼이 워크로드를 대신 보증할 수 있는 곳에서는 그렇습니다. 워크로드 ID는 자격 증명을 배달하는 대신 없애 버리고, 존재하지 않는 자격 증명은 새지도, 어색한 시점에 만료되지도, 주인이 필요하지도 않습니다. 주입은 그래도 존재해야 하는 자격 증명을 위한 것입니다. 서드파티 API 키, 벤더가 페더레이션해 주지 않는 데이터베이스 암호, 오래된 시스템처럼 아직은 대부분이 여기에 해당하지만, 해마다 줄어듭니다.
- **개발자 노트북에 운영 비밀을 두는 우회로로는 쓰지 않습니다.** 로컬 개발은 자기 값을 따로 가집니다. 저장소 바깥의 사용자 비밀 저장소, 로컬 에뮬레이터, 버려도 되는 계정 같은 것들입니다. 로컬에서 앱을 돌리는 유일한 방법이 운영 자격 증명을 쥐는 것이라면, 이 패턴은 도입된 것이 아니라 장식된 것입니다.

## 주의점

- 환경 변수는 옆으로 새고, 새는 경로는 하나같이 평범합니다. 자식 프로세스가 환경 전체를 물려받으니 셸로 호출하는 무엇이든 값을 받습니다. 크래시 덤프가 값을 담습니다. 설정을 출력하는 진단 엔드포인트나 오류 페이지가 값을 출력합니다. 플랫폼에 따라 프로세스 목록에 드러나기도 합니다. 어느 것도 특이한 일이 아니고, 그저 환경이 원래 그러라고 있는 것입니다. 값어치가 큰 비밀은 마운트된 파일에 두거나 시작할 때 클라이언트로 받아 오고, 환경 변수는 노출되어도 심각하기보다 성가신 정도인 값에 남겨 두는 편이 낫습니다.
- 마운트된 비밀은 조건에 따라 제자리에서 갱신되고, 그래도 애플리케이션이 그것을 알아차려야 합니다. 볼륨을 `subPath`로 마운트했다면 아예 갱신되지 않고, 갱신되는 경우에도 변경은 kubelet의 동기화 주기보다 빨리 오지 않으므로 교체는 즉시가 아니라 결국에는 일어나는 일입니다. CSI Secrets Store 마운트는 드라이버를 설치할 때 교체를 켜 두었을 때만 교체됩니다. 그다음이 애플리케이션의 몫입니다. 파일은 돌아가는 프로세스 밑에서 바뀌고, 아무도 대신 다시 열어 주지 않습니다. 파일을 감시해서 다시 읽든지, 다음 읽기 시점에 반영되는 방식을 받아들이되 옛 값이 통하지 않게 되기 전에 그 읽기가 일어나도록 만들어야 합니다. 시작할 때 비밀을 한 번 읽어 정적 필드에 담아 두는 앱은 교체되는 파일을 다시 얼어붙은 환경 변수로 만들어 버린 셈입니다.
- 매니페스트 안의 base64는 인코딩이지 암호화가 아닙니다. 이진 값이 텍스트 형식에서 살아남게 하려고 있는 것이고, 지켜 주는 것은 하나도 없습니다. base64가 들어 있는 매니페스트는 평문이 들어 있는 매니페스트와 똑같이 다루면 됩니다. 스토어의 저장 시 암호화를 켜고, 읽기를 RBAC로 막고, 키가 다른 곳에 있는 무언가로 봉인하거나 암호화하지 않은 매니페스트는 버전 관리에 넣지 않습니다.
- 접근 목록은 워크로드 단위로 좁힙니다. 클러스터의 모든 파드가 읽을 수 있는 스토어는 단계만 늘어난 구운 비밀입니다. 워크로드 하나가 뚫렸을 때의 영향 범위가 다시 전부가 되기 때문입니다. 비밀마다 목록 하나, 그 목록에 그 비밀이 필요한 워크로드만 적는 것이 스토어와 공유 폴더를 가르는 전부입니다. 역할 할당을 검토하듯 목록도 검토할 값어치가 있습니다.
- 값은 절대 로그에 남기지 말고, 버전을 남깁니다. 사고를 되짚을 때마다 어느 워크로드가 어느 버전을 쥐고 있었는지 알고 싶어지는데, 그 질문은 비밀을 로그 한 줄, 추적 속성, 지표 레이블, 예외 메시지 어디에도 넣지 않고 답할 수 있습니다. 마스킹 필터는 두 번째 방어선이지 첫 번째가 아닙니다. 값은 애초에 로깅 호출까지 도달하지 않아야 합니다.
- 저장소에는 참조를 커밋하고 원본 값은 커밋하지 않습니다. 저장소는 비밀이 복제되고 미러링되고 영원히 남는 것이 보장된 유일한 장소입니다. 그곳에 들어갈 것은 스토어 항목의 이름, 봉인되거나 암호화된 덩어리, `secretRef`를 가리키는 매니페스트 같은 포인터이고, 값은 스토어에 들어갑니다. 이미 복제되어 나간 것은 히스토리를 다시 써도 유출되지 않은 상태로 돌아가지 않습니다.
- 배달은 인가가 아닙니다. 주입은 이 워크로드가 자격 증명을 어떻게 받는지에 답할 뿐, 받아도 되는지에는 답하지 않습니다. 두 결정은 서로 다른 자리에서 내려지고, 묻는 모든 것에 모든 비밀을 내주는 스토어는 둘 중 어느 쪽에도 답하지 않은 것입니다.

## .NET에서는

`IConfiguration`은 바로 이 모양을 위해 만들어졌습니다. 순서가 있는 소스를 겹쳐 쌓고 뒤에 온 것이 이기므로, 같은 코드가 운영에서는 파일에서, 컨테이너에서는 환경 변수에서, 노트북에서는 개발자 자신의 저장소에서 온 값을 읽습니다. 애플리케이션 어디에도 분기가 없습니다.

```csharp
// Program.cs — 소스가 무엇인지는 배포의 일이지 코드의 일이 아닙니다.
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false)
    .AddKeyPerFile("/mnt/secrets", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

var connection = builder.Configuration.GetConnectionString("Orders")
    ?? throw new InvalidOperationException("no connection string was injected");
```

`AddKeyPerFile`이 마운트된 파일 경로입니다. 디렉터리의 파일 하나가 키 하나이고 그 내용이 값인데, 이것이 바로 Kubernetes 시크릿 볼륨이나 CSI 드라이버가 만들어 내는 모양입니다. 장면의 4단계를 성립하게 하는 것이 `reloadOnChange`입니다. 파일이 제자리에서 교체되면 구성이 그것을 집어 올립니다. 다만 그 마운트가 애초에 갱신되는 종류일 때만 그렇습니다.

교체되는 값을 `IOptionsMonitor<T>`로 읽으면 현재 값은 언제나 현재 값이고, 애플리케이션은 무엇이 교체됐는지 알 필요가 없습니다.

```csharp
public sealed class PaymentClient(IOptionsMonitor<PaymentOptions> options)
{
    // 호출할 때마다 읽습니다. 생성자에서 필드에 담아 두면 맨 처음 요청이
    // 우연히 본 값에 얼어붙습니다.
    private PaymentOptions Current => options.CurrentValue;
}
```

중첩된 키가 환경 변수가 될 때는 밑줄 두 개를 씁니다. 배포가 잎사귀 하나만 덮어쓸 수 있게 해 주는 것이 이 표기이므로, 외워 둘 값어치가 있는 유일한 문법입니다.

```yaml
# 매니페스트는 시크릿의 이름을 부릅니다. 값은 담지 않습니다.
env:
  - name: ConnectionStrings__Orders
    valueFrom:
      secretKeyRef:
        name: orders-db
        key: connection-string
```

마운트된 파일은 같은 비밀을 다른 쪽 길로 배달한 것이고, 그 차이가 매니페스트에 드러납니다. 파드는 디렉터리를 어디에 두고 싶은지만 말하고, 값에 관한 것은 어디에도 나오지 않습니다.

```yaml
volumes:
  - name: orders-secrets
    secret:
      secretName: orders-db
containers:
  - name: api
    volumeMounts:
      - name: orders-secrets
        mountPath: /mnt/secrets
        readOnly: true
```

비밀이 클러스터가 아니라 볼트에 살면, 구성 공급자가 워크로드 자신의 아이덴티티로 시작할 때 그것을 가져옵니다. 그래서 이미지에도 자격 증명이 없고 매니페스트에도 없습니다.

```csharp
builder.Configuration.AddAzureKeyVault(
    new Uri("https://<vault-name>.vault.azure.net/"),
    new DefaultAzureCredential());
```

로컬 개발에서는 같은 키를 저장소 바깥의 저장소에서 받아 오고, 그것이 `dotnet user-secrets`가 있는 이유입니다. 암호화되지도 않고 운영용 장치도 아닙니다. 이 도구의 값어치는 오로지 파일이 작업 트리가 아니라 사용자 프로필에 산다는 것, 그래서 실수로 커밋될 수 없다는 데 있습니다.

```sh
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:Orders" "<local-development-value>"
```

.NET에만 있는 조각 하나는 디스크가 아니라 스토어에 있어야 합니다. 데이터 보호 키 링입니다. 기본값은 파일 시스템에 쓰는 것이라, 컨테이너가 재시작하면 키 링을 잃고 그동안 발급한 쿠키와 토큰을 아무도 읽을 수 없게 됩니다. 영구 저장소를 가리키게 하고, 키 자체는 관리형 키로 보호합니다.

```csharp
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri("<blob-uri-with-no-embedded-key>"), credential)
    .ProtectKeysWithAzureKeyVault(new Uri("<key-identifier>"), credential);
```

목표로 삼을 모양은 장면이 끝나는 자리 그대로입니다. 이미지는 모든 환경에서 같고 비밀은 하나도 담지 않습니다. 매니페스트는 이름을 부를 뿐 아무것도 쥐지 않습니다. 스토어가 값과 그 버전을 소유하고, 누가 읽어도 되는지 알고, 누가 읽었는지 기록합니다. 교체는 그 한 곳의 변경이고, 비밀이 배달되던 그 경로를 따라 돌아가는 시스템까지 닿습니다.
