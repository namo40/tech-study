---
title: "Database Migration"
summary: "데이터베이스 마이그레이션은 옛 코드와 새 스키마가 함께 살아야 하는 배포입니다. 모든 변경을 두 앱 버전이 다 견디는 걸음으로 나눠 내보냅니다. 확장(expand), 백필(backfill), 전환(switch), 축소(contract)입니다. 그래서 스키마는 세상을 멈추는 순간 없이 진화합니다."
category: ".NET 데이터 접근"
scene: database-migration
steps:
  - title: "컬럼 이름 바꾸기는 순간이지만, 배포는 순간이 아닙니다"
    text: "v1 인스턴스 둘이 옛 컬럼을 읽는 동안 고스트가 한 방 마이그레이션을 보여 줍니다. 지금 이름을 바꾸고, 배포는 나중입니다. 모든 롤아웃에서 버전이 겹치고, 그러면 옛 코드는 더 이상 없는 컬럼을 조회합니다. 장애는 달력에서 왔습니다."
  - title: "깨지 않고 더합니다. 확장 단계입니다"
    text: "옛 컬럼 옆에 새 컬럼이 생기고, 추가는 v1에게 보이지 않습니다. 이어서 v2가 굴러 들어와 두 컬럼에 다 쓰고, v1은 계속 옛 컬럼에 쓰고, 모든 읽는 쪽은 여전히 기대한 것을 찾습니다. 앞뒤로 호환되는 변경이란 두 버전이 함께 살 수 있는 변경이고, 그 성질이 롤아웃을 지루하게 만들어 줍니다."
  - title: "과거가 따라잡고, 그다음 읽기가 옮겨 갑니다"
    text: "이중 쓰기는 새 행을 책임지고, 백필이 옛 행을 걸어가며 name을 full_name으로 작은 배치로 복사합니다. 두 컬럼이 일치할 때까지입니다. 그때에야 읽기가 새 컬럼으로 전환됩니다. 희망이 아니라 검증으로 하는 전환입니다. 마지막 v1이 퇴역하고, 바닥이 옮겨진 것을 아무도 알아채지 못했습니다."
  - title: "축소, 아무도 읽지 않는 것을 제거합니다"
    text: "옛 컬럼을 읽는 쪽이 남아 있지 않으므로, 제거는 추가가 그랬던 것만큼 보이지 않습니다. 그것이 요령의 전부입니다. 스키마는 도약으로 버전이 바뀌는 것이 아니라 걸음으로 진화합니다. 걸음마다 배포할 수 있고, 마지막 절단 전까지는 걸음마다 되돌릴 수 있습니다. 위험한 이름 바꾸기가 지루한 변경 네 개가 됐습니다."
related:
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
  - label: Schema Evolution
    slug: schema-evolution
  - label: Rolling Update
    slug: rolling-update
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Feature Flag
    slug: feature-flag
  - label: Schema Registry
    slug: schema-registry
  - label: Database Index
    slug: database-index
  - label: N+1 Query
    slug: n-plus-1-query
references:
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "EF Core: Applying migrations"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying
  - title: "EF Core: Migrations in team environments"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/teams
---

## 언제 쓰나

- 살아 있는 시스템의 모든 스키마 변경입니다. 이름 바꾸기, 컬럼 쪼개기, 타입 변경, NOT NULL 추가, 인덱스 생성 중 어느 것도 옛 코드가 아직 떠 있는 동안 한 문장으로 실행할 수 있는 변경이 아닙니다. 그리고 전부 그렇게 실행할 수 있는 걸음들로 분해됩니다.
- 배포가 롤링이든 블루-그린이든 카나리든 마찬가지입니다. 셋 다 똑같은 창을 만듭니다. 애플리케이션 두 버전이 하나의 데이터베이스에 말을 거는 구간이고, 스키마는 그 둘 모두에게 동시에 참이어야 합니다. 이 창은 짧게 줄여서 없앨 수 있는 위험이 아니라 배포가 굴러가는 방식 자체입니다.
- 스키마가 옮겨 간 뒤에도 되돌리기가 가능해야 할 때입니다. 되돌릴 수 없는 변경은 그 뒤의 모든 배포를 한쪽으로만 열리는 문으로 만듭니다. 옛 컬럼이 아직 남아 있는 동안의 가치는 정확히 이것, 되돌아가는 비용을 낮게 만들어 준다는 것입니다.
- 변경 자체에 시간이 걸릴 때입니다. 천만 행을 복사하는 일은 실행해 놓고 지켜보는 문장이 아니라 속도 제한이 붙은 백그라운드 작업입니다. 마이그레이션에 소요 시간이 있다면, 그동안 애플리케이션이 무엇을 할지에 대한 계획도 있어야 합니다.
- 고급 선택지로 두지 않습니다. 확장, 백필, 전환, 축소의 대안은 점검 창이고, 점검 창은 내려가겠다는 결정입니다. 그게 옳은 결정일 때도 있지만, 발견한 결정이 아니라 내린 결정이어야 합니다.

## 주의점

- 마이그레이션은 코드입니다. 애플리케이션 옆에 함께 버전 관리하고, 다른 변경과 똑같이 리뷰하고, 파이프라인에서 실행합니다. 이력이 누군가의 터미널에만 남아 있는 스키마는 아무도 재현할 수 없는 스키마이고, 그 사실이 처음 문제가 되는 날은 두 번째 환경이 필요해지는 날입니다.
- `migrate-on-startup`은 자기 자신과 경쟁합니다. 인스턴스 열 개가 동시에 뜨면 같은 마이그레이션을 열 번 시도하고, 진 쪽은 죽거나 더 나쁘게는 절반만 적용합니다. 마이그레이션은 롤아웃이 시작되기 전에, 한 곳에서, 배포 단계로 실행합니다.
- 파괴적인 변경은 분해하거나 아니면 깨집니다. 이름 바꾸기는 제거 더하기 추가입니다. 타입 변경은 새 컬럼 더하기 백필입니다. NOT NULL 추가에는 기본값과 이미 채워진 컬럼이 먼저 필요합니다. 전부 확장, 백필, 전환, 축소가 되고, 이 중 한 걸음을 건너뛰면 이 장면의 1단계가 일어납니다.
- 긴 백필에는 배치와 속도 조절이 필요합니다. 큰 테이블에 한 문장을 던지면 잠금을 오래 쥐고, 미리 쓰기 로그(WAL)를 넘치게 하고, 지키려던 트래픽을 굶깁니다. 피하려던 그 장애가 반대편에서 걸어 들어오는 셈입니다.
- 애플리케이션이 살아 있는 동안 실행할 수 없는 마이그레이션은 예정된 장애입니다. 잠금이 잠깐이기를 바라지 말고, 솔직하게 말하고 창을 잡고 사람들에게 알립니다.
- 축소는 전환보다 한참 뒤에 둡니다. 분이 아니라 날 단위입니다. 옛 컬럼은 유지 비용이 거의 없고, 되돌리기를 싸게 만들어 주는 유일한 물건입니다. 아무도 읽지 않는다는 증거가 생긴 뒤에 제거하고, 그 전에는 둡니다.

## .NET에서는

EF Core 마이그레이션이 버전 이력과 도구를 줍니다. 각 마이그레이션에 무엇이 들어가도 되는지는 위의 규율이 정합니다. 확장은 그 자체로 하나의 마이그레이션이고, 지루한 종류여야 합니다. 기본값 없는 nullable 컬럼이라 테이블이 다시 쓰이지 않습니다.

```csharp
// 확장. nullable이고 기본값이 없으므로, 추가는 모든 행을 다시 쓰는 일이
// 아니라 카탈로그 변경으로 끝납니다.
public partial class AddFullNameColumn : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "full_name", table: "customers", type: "text", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "full_name", table: "customers");
}
```

두 컬럼이 함께 있는 동안에는 새 버전이 둘을 맞춰 둡니다. 애플리케이션에서 컬럼이 둘이라는 사실을 아는 유일한 코드이고, contract와 함께 지웁니다. 관례로 매핑되는 것은 public 읽기·쓰기 속성뿐이므로, 두 컬럼을 internal로 두려면 `OnModelCreating`에서 이름을 지어 줘야 합니다. 그리고 그 앞에 선 public 속성은 무시하도록 해야 하는데, 그러지 않으면 관례가 그것을 세 번째 컬럼으로 만들어 버립니다.

```csharp
public sealed class Customer
{
    public int Id { get; set; }

    // 컬럼들입니다. internal이라 애플리케이션의 다른 어떤 곳도 한쪽만
    // 쓰지는 못합니다.
    internal string Name { get; set; } = "";
    internal string? FullName { get; set; }

    // 나머지 전부가 쓰는 속성입니다. 백필이 돌고 나면 읽기는 새 컬럼을
    // 먼저 봅니다. 둘이 함께 있는 동안 쓰기는 양쪽에 내려앉습니다. 이것은 컬럼
    // 자체가 아니므로 모델에 건드리지 말라고 알려 주어야 합니다.
    public string DisplayName
    {
        get => FullName ?? Name;
        set { Name = value; FullName = value; }
    }
}

protected override void OnModelCreating(ModelBuilder builder)
{
    builder.Entity<Customer>(customer =>
    {
        // 관례로는 이 둘 중 어느 것도 매핑되지 않으므로 손으로 매핑합니다.
        customer.Property(c => c.Name).HasColumnName("name");
        customer.Property(c => c.FullName).HasColumnName("full_name");

        // 그리고 관례라면 컬럼도 아닌 이것을 매핑해 버립니다.
        customer.Ignore(c => c.DisplayName);
    });
}
```

백필은 배치로 나눈 원시 SQL입니다. 작은 테이블이면 마이그레이션 안에서, 큰 테이블이면 작업으로 돌립니다. 배치가 이 일이 사고로 번지지 않게 막아 주고, `WHERE full_name IS NULL` 조건 덕분에 중간에 죽은 작업을 다시 시작해도 이미 복사한 행을 또 복사하지 않습니다.

```csharp
public sealed class FullNameBackfill(IDbContextFactory<ShopDbContext> factory, ILogger<FullNameBackfill> log)
{
    public async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await using var db = await factory.CreateDbContextAsync(token);

            // PostgreSQL 기준입니다. SQL Server에서는 배치가 UPDATE TOP (500)이고,
            // MySQL은 IN 서브쿼리 안의 LIMIT을 아예 허용하지 않습니다.
            var copied = await db.Database.ExecuteSqlRawAsync(
                """
                UPDATE customers SET full_name = name
                WHERE id IN (SELECT id FROM customers
                             WHERE full_name IS NULL ORDER BY id LIMIT 500)
                """, token);

            if (copied == 0)
            {
                log.LogInformation("backfill complete");
                return;
            }

            // 배치 사이에 데이터베이스에게 평소 트래픽을 돌려줍니다.
            await Task.Delay(TimeSpan.FromMilliseconds(200), token);
        }
    }
}
```

파이프라인에서는 애플리케이션이 스스로 마이그레이션을 적용하게 두지 말고 SQL을 뽑습니다. `dotnet ef migrations script --idempotent --output migrate.sql`은 각 단계 전에 이력 테이블을 확인하는 스크립트를 만들어 줍니다. 여러 번 실행해도 작업은 한 번만 일어나고, 이미 최신인 환경에 실행하면 아무 일도 하지 않습니다. 배포는 그 스크립트를 별도 단계로, 애플리케이션 자신에게는 없는 스키마 권한을 가진 연결로 실행하고, 그다음에야 롤아웃을 시작합니다. 파이프라인에 .NET SDK가 없다면 `dotnet ef migrations bundle`이 같은 것을 실행 파일로 묶어 줍니다.

작지만 제값을 하는 습관이 둘 있습니다. 마이그레이션 이름에 어느 걸음인지를 담습니다(`AddFullNameColumn`, `DropNameColumn`). 정작 중요한 리뷰가 이 마이그레이션 하나만 배포해도 안전한가이기 때문입니다. 그리고 두 브랜치가 동시에 마이그레이션을 추가했다면, 모델 스냅샷을 손으로 고치지 말고 다시 생성해서 해결합니다. 스냅샷은 파생된 파일이고, 손으로 병합한 스냅샷은 다음 마이그레이션에서야 드러나는 방식으로 모델과 어긋납니다.
