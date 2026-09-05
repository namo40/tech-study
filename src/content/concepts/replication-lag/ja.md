---
title: "Replication Lag"
summary: "Replication lag は、書き込みがプライマリに反映された時点と、同じ変更がレプリカに現れる時点との遅れです。そのあいだにレプリカが答えた読み取りは過去を見ることになり、対処は遅れが小さいままであることを願うことではなく、読み取りをどこへ送るかを決めることです。"
category: "データ分散と整合性"
scene: replication-lag
steps:
  - title: "プライマリとレプリカ"
    text: "書き込みはプライマリへ、読み取りはすべての変更を少し遅れて受け取るレプリカへ行きます。たいていはその少しの遅れは問題になりません。"
  - title: "自分の書き込みを読むと"
    text: "負荷がかかると遅れは数秒に伸びます。ユーザーが変更を保存して再読み込みすると古い値が見えます。読み取りがまだ追いついていないレプリカに行ったからです。やがて追いつくと変更が現れます。"
  - title: "セッションに必要なぶんだけ振り分ける"
    text: "書き込みの後の数秒間は、そのセッションの読み取りをプライマリに送るか、レプリカがその書き込みの位置に達するまで待たせます。ほかの全員はレプリカを読み続けます。"
  - title: "測り、代償を知っておく"
    text: "ユーザーより先に遅れへアラートを出します。プライマリが落ちるとレプリカが昇格し、まだ転送中だった変更は失われます。それが RPO であり、非同期レプリケーションの代償です。"
related:
  - label: Replication
    slug: replication
  - label: Read Replica
    slug: read-replica
  - label: Read-Your-Writes
    slug: read-your-writes
  - label: Session Consistency
    slug: session-consistency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Bounded Staleness
    slug: bounded-staleness
  - label: Failover
    slug: failover
  - label: RPO
    slug: rpo
  - label: Materialized View
    slug: materialized-view
  - label: Read Model
    slug: read-model
references:
  - title: Distributed data in cloud-native applications
    url: https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/distributed-data
  - title: Consistency levels in Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: Data store selection (Azure Architecture Center)
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/data-stores-getting-started
---

## いつ使うか

- 読み取りレプリカを置く構成には必ず遅れがあります。機械のあいだでデータを写すことの性質であって、一度直せば消える欠陥ではありません。問いは遅れをどう消すかではなく、どの読み取りがその遅れに耐えられるかです。
- レプリカは作りからして結果整合性を持ちます。すべての変更をいずれは持ちますが、尋ねたその瞬間にはまだ持っていません。その 1 文に逆らわず、前提として設計します。
- エンドポイントごとに決めます。古い値でよい読み取り、呼び出した本人の書き込みだけは必ず見なければならない読み取り、全員に対して最新でなければならない読み取りの 3 つは別の経路であり、ただなのは最初の 1 つだけです。
- 読み取りが書き込みよりずっと多く、その読み取りの大半が画面に出た時点ですでに数秒前のデータならレプリカが合います。ダッシュボード、一覧、検索結果のように人が眺めるものがそれです。
- 結果がそのまま書き込みにつながる読み取りはプライマリに残します。出金前の残高確認、予約前の在庫確認、挿入前の重複確認がそれにあたります。

## 注意点

- ユーザーから上がってくるのは、ほぼいつも自分の書き込みが読めない件です。保存した本人が数秒後に再読み込みして古い値を見ます。そのセッションの読み取りを数秒だけプライマリに送るか、その書き込みが受け取った位置にレプリカが達するまで留めておきます。
- 遅れは書き込みの集中、長いトランザクション、レプリカの CPU 負荷、スキーマの移行で大きくなり、レプリカが変更を 1 スレッドで適用しているときにいちばん速く開きます。ユーザーより先にアラートを出し、1 回の尖った値ではなく傾向に対して出します。
- 非同期レプリケーションは永続性を渡してレイテンシを得ます。failover で昇格したレプリカは自分が適用し終えたぶんしか持っていないので、転送中だった変更は消えます。RPO が 0 ではないということであり、これはデータベースの設定というより事業上の判断です。
- 同期レプリケーションはその損失をなくす代わりに、代償をすべての書き込みに移します。commit が 2 台目の機械を待つからです。可用性も結び付きますが、どれだけ強く結び付くかはデータベース次第です。`synchronous_standby_names` にスタンバイを名指しした PostgreSQL は、そのスタンバイが答えるまで commit を止めます。SQL Server の可用性グループはセッションタイムアウトを待ち切ると、同期済みのセカンダリを必須にするよう指示されていないかぎり、セカンダリなしで commit します。
- 結果が書き込みにつながる読み取りにレプリカを使ってはいけません。古い値を読んで計算して書き戻すと、まだ誰も見ていない変更を上書きすることになり、エラーは出ません。
- 書き込みと、それに依存するイベントとのあいだの遅れも見ておきます。commit 時に発行したメッセージが、レプリカを読むコンシューマーに変更より先に届くと、まだ存在しない行についてのメッセージのように見えます。

## .NET では

やることは結局ルーティングです。同じモデルの上にコンテキストを 2 つ置き、このセッションが直前に何を書いたかを覚え、読み取りに規則を 1 つ決めます。

```csharp
// 同じモデルの上にコンテキストを 2 つ。1 つはプライマリへ、1 つは読み取り専用のレプリカへ。
builder.Services.AddDbContext<PrimaryDbContext>(o => o.UseSqlServer(primaryConnection));
builder.Services.AddDbContext<ReplicaDbContext>(o =>
    o.UseSqlServer(replicaConnection + ";ApplicationIntent=ReadOnly"));

// 直前の書き込みをセッションごとに Cookie か分散キャッシュへ覚えておき、それで振り分けます。
public sealed class ReadRouter(
    PrimaryDbContext primary,
    ReplicaDbContext replica,
    IHttpContextAccessor http)
{
    private const string Cookie = "recently-wrote";
    private static readonly TimeSpan Window = TimeSpan.FromSeconds(5);

    public DbContext ForRead()
    {
        var wrote = http.HttpContext?.Request.Cookies[Cookie];
        if (wrote is not null
            && DateTimeOffset.TryParse(wrote, out var at)
            && DateTimeOffset.UtcNow - at < Window)
        {
            return primary;                       // 自分の書き込みを読む
        }

        return replica;
    }

    public void MarkWrote() =>
        http.HttpContext?.Response.Cookies.Append(
            Cookie,
            DateTimeOffset.UtcNow.ToString("O"),
            new CookieOptions { HttpOnly = true, MaxAge = Window });
}
```

SQL Server では、接続文字列に `ApplicationIntent=ReadOnly` と書けば可用性グループがルーティングを代わりに行います。リスナーがその接続を読み取り可能なセカンダリへ送るので、振り分けはコードではなく設定で済みます。ただし、その設定は自分で行わなければなりません。グループに読み取り専用ルーティングを用意し、レプリカごとにルーティング URL とルーティングリストを設定し、接続ではリスナーとデータベースを名指しする必要があります。そうでないと intent は受け付けられたうえで、セッションはそのままプライマリに着きます。PostgreSQL では `pg_last_wal_replay_lsn()` がレプリカのどこまで進んだかを教えてくれ、「レプリカがこの位置に達するまで待つ」方式はここから組み立てます。書き込みが返した位置を持っておいて比べ、待ち時間がリクエストの許す範囲を超えるならプライマリに切り替えます。どちらを使うにせよ、遅れはリクエストのレイテンシと並べて指標に出します。障害を追うとき、2 つの数字が互いを説明してくれるからです。
