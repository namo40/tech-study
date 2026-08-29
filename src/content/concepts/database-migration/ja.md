---
title: "Database Migration"
summary: "データベースマイグレーションは、古いコードと新しいスキーマが同時に生きていなければならないデプロイです。すべての変更を、両方のアプリバージョンが耐えられる歩みに分けて出します。expand、backfill、switch、contract です。だからスキーマは、世界を止める瞬間なしに進化します。"
category: ".NET データアクセス"
scene: database-migration
steps:
  - title: "列名の変更は一瞬ですが、デプロイは一瞬ではありません"
    text: "v1 インスタンス二つが古い列を読む間、ゴーストが一発マイグレーションを見せます。名前を変えて、新しいコードをデプロイするやり方です。しかしどのロールアウトにもバージョンが重なる区間があり、その窓の中で古いコードはもう存在しない列を照会します。スキーマは時間どおりに着いたのに、障害はカレンダーから来ました。"
  - title: "壊さずに足します。expand の段階です"
    text: "古い列の隣に新しい列が生まれ、追加は v1 には見えません。続いて v2 が転がり込んで両方の列に書き、v1 は古い列に書き続け、どの読み手も相変わらず期待したものを見つけます。後方互換な変更とは両方のバージョンが一緒に生きられる変更であり、その性質がロールアウトを退屈にしてくれます。"
  - title: "過去が追いつき、それから読みが移ります"
    text: "二重書き込みは新しい行を受け持ち、バックフィルが古い行を歩きながら name を full_name へ小さなバッチで写します。二つの列が一致するまでです。そのときになって初めて、読みが新しい列へ切り替わります。希望ではなく検証による切り替えです。最後の v1 が退役し、床が動いたことに誰も気づきませんでした。"
  - title: "contract、誰も読まないものを取り除きます"
    text: "古い列にはもう読み手が残っていないので、削除は追加がそうだったのと同じくらい見えません。それがこつのすべてです。スキーマは跳躍で版が変わるのではなく、歩みで進化します。一歩ごとにデプロイでき、最後の切断までは一歩ごとに戻せます。危険な列名変更が、退屈な変更四つになりました。"
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

## いつ使うか

- 生きているシステムのすべてのスキーマ変更です。列名の変更、列の分割、型の変更、NOT NULL の追加、インデックスの作成。どれも古いコードがまだ動いている間に一文で実行できる変更ではなく、そしてどれも実行できる歩みに分解できます。
- デプロイがローリングでも、ブルーグリーンでも、カナリアでも同じです。三つとも同じ窓を作ります。アプリケーションの二つのバージョンが一つのデータベースに話しかける区間であり、スキーマはその両方に対して同時に真でなければなりません。この窓は短くして消せるリスクではなく、デプロイが動く仕組みそのものです。
- スキーマが動いたあとも切り戻しを残しておきたいときです。戻せない変更は、その後ろのすべてのデプロイを一方通行の扉に変えます。古い列がまだ残っている間の値打ちは、まさにこれ、戻る道を安くしてくれることです。
- 変更そのものに時間がかかるときです。一千万行を写す作業は、実行して眺める一文ではなく、速度制限の付いたバックグラウンドジョブです。マイグレーションに所要時間があるなら、その間アプリケーションが何をするかの計画も要ります。
- 上級者向けの選択肢としては扱いません。expand、backfill、switch、contract の代わりはメンテナンス窓であり、メンテナンス窓は落とすという決定です。それが正しい決定のこともありますが、見つけた決定ではなく下した決定であるべきです。

## 注意点

- マイグレーションはコードです。アプリケーションの隣で一緒にバージョン管理し、ほかの変更と同じようにレビューし、パイプラインから実行します。履歴が誰かの端末にしか残っていないスキーマは誰にも再現できないスキーマで、それが最初に問題になる日は二つ目の環境が必要になる日です。
- `migrate-on-startup` は自分自身と競争します。インスタンスが十個同時に立ち上がれば同じマイグレーションを十回試み、負けたほうは落ちるか、もっと悪ければ半分だけ適用します。マイグレーションはロールアウトが始まる前に、一か所から、デプロイの一段階として実行してください。
- 破壊的な変更は分解するか、さもなければ壊れます。列名の変更は削除足す追加です。型の変更は新しい列足すバックフィルです。NOT NULL の追加には既定値と、すでに埋まった列が先に要ります。どれも expand、backfill、switch、contract になり、この一歩を飛ばすとこのシーンの第一段階が起きます。
- 長いバックフィルにはバッチと速度調整が要ります。大きなテーブルに一文を投げると、ロックを長く握り、書き込みログをあふれさせ、守ろうとしていたトラフィックを飢えさせます。避けようとしていたその障害が、反対側から歩いて入ってくるわけです。
- アプリケーションが生きている間に実行できないマイグレーションは、予定された障害です。ロックが短いことを願うのではなく、正直に言って窓を取り、人に知らせてください。
- contract は switch よりずっと後ろに置きます。分ではなく日の単位です。古い列は維持費がほとんどかからず、切り戻しを安くしてくれる唯一の道具です。誰も読んでいないという証拠が出てから取り除き、それまでは置いておいてください。

## .NET では

EF Core のマイグレーションが版の履歴と道具を与えてくれます。各マイグレーションに何を入れてよいかは、上の規律が決めます。expand はそれ自体で一つのマイグレーションで、退屈な種類であるべきです。既定値のない nullable な列なので、テーブルが書き直されません。

```csharp
// Expand. Nullable and without a default, so adding it is a catalogue change
// rather than a rewrite of every row.
public partial class AddFullName : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "full_name", table: "customers", type: "text", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "full_name", table: "customers");
}
```

二つの列がそろっている間は、新しいバージョンが両方をそろえて保ちます。アプリケーションの中で列が二つあることを知っている唯一のコードであり、contract と一緒に消します。

```csharp
public sealed class Customer
{
    public int Id { get; set; }

    // The columns, mapped privately so nothing else in the application can
    // write one of them without the other.
    internal string Name { get; set; } = "";
    internal string? FullName { get; set; }

    // The property everything else uses. Reads prefer the new column once the
    // backfill has run; writes land in both while both are there.
    public string DisplayName
    {
        get => FullName ?? Name;
        set { Name = value; FullName = value; }
    }
}
```

バックフィルはバッチに分けた生の SQL です。小さなテーブルならマイグレーションの中で、大きなテーブルならジョブとして回します。バッチがこの作業を事故に変えないよう抑えてくれ、`WHERE full_name IS NULL` の条件のおかげで、途中で止まったジョブを再開しても写し終えた行を二度写しません。

```csharp
public sealed class FullNameBackfill(IDbContextFactory<ShopDbContext> factory, ILogger<FullNameBackfill> log)
{
    public async Task RunAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await using var db = await factory.CreateDbContextAsync(token);
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

            // Give the database its ordinary traffic back between batches.
            await Task.Delay(TimeSpan.FromMilliseconds(200), token);
        }
    }
}
```

パイプラインでは、アプリケーションに自分でマイグレーションを適用させるのではなく SQL を出力します。`dotnet ef migrations script --idempotent --output migrate.sql` は、各段階の前に履歴テーブルを確認するスクリプトを作ります。何度実行しても作業は一度だけ起き、すでに最新の環境に対して実行すると何も起きません。デプロイはそのスクリプトを独立した段階として、アプリケーション自身は持たないスキーマ権限の接続で実行し、そのあとで初めてロールアウトを始めます。パイプラインに .NET SDK がなければ、`dotnet ef migrations bundle` が同じものを実行ファイルにまとめてくれます。

小さくても元が取れる習慣が二つあります。マイグレーションの名前にどの歩みかを入れます(`AddFullNameColumn`、`DropNameColumn`)。本当に大事なレビューは、このマイグレーション一つだけをデプロイしても安全かどうかだからです。そして二つのブランチが同時にマイグレーションを追加したときは、モデルスナップショットを手で直さずに作り直して解決します。スナップショットは派生したファイルであり、手で併合したものは次のマイグレーションで初めて表に出る形でモデルとずれます。
