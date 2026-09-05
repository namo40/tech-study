---
title: "Failover"
summary: "Failover が動かすのはマシンではなく役割です。プライマリが応答をやめると鼓動が途切れ、過半数がそれは死んだと同意し、レプリカが昇格します。複製されなかった最後の数瞬と引き換えに、サービスの稼働を買う取引です。"
category: "データ分散と整合性"
scene: failover
steps:
  - title: "書く側が 1 つ、従う側が 1 つ"
    text: "アプリはプライマリの A に書き、すべての書き込みは少し遅れてレプリカの B へ複製されます。下のモニターでは 2 つの心臓が時間どおりに打ち、票は 3 分の 3 です。"
  - title: "鼓動が止まる"
    text: "ハートビートは、データベースが生きていると告げる方法です。A が応答をやめ、ランプが消えます。モニターは死と遅さを区別できません。鼓動が止まったことだけを知っています。書き込みは失敗し、複製が運びそこねた書き込み 1 つが、2 つのマシンの差として残ります。"
  - title: "3 つのうち 2 つが同意すれば"
    text: "過半数が A は死んだと言い、1 つが昇格します。B がプライマリになり、接続文字列がそれに従い、書き込みが再開します。複製が運びそこねたあの 1 件を除いてです。フェイルオーバーは最後の数瞬のデータと引き換えに、サービスの稼働を買います。"
  - title: "戻ってきたプライマリはレプリカに"
    text: "A は戻りますが、役割はすでに移っています。A はレプリカとして再合流し、B から遅れを取り戻し、ペアは逆方向を指したまま再び完全になります。役割がマシンの間を漂うこと、それがこの仕組みのすべてです。"
related:
  - label: Replication
    slug: replication
  - label: Replication Lag
    slug: replication-lag
  - label: RPO
    slug: rpo
  - label: Primary-Replica
    slug: primary-replica
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Lease TTL
    slug: lease-ttl
  - label: Singleton Worker
    slug: singleton-worker
  - label: Eventual Consistency
    slug: eventual-consistency
references:
  - title: "Auto-failover groups (Azure SQL Database)"
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/failover-group-sql-db
  - title: "Overview of Always On availability groups"
    url: https://learn.microsoft.com/en-us/sql/database-engine/availability-groups/windows/overview-of-always-on-availability-groups-sql-server
  - title: "Failover and load balancing (Npgsql)"
    url: https://www.npgsql.org/doc/failover-and-load-balancing.html
---

## いつ使うか

- 停止時間をデプロイ単位ではなく秒単位で測る、状態を持つサービスならすべて当てはまります。データベースが最初に来るのは、コピーを増やせば済むとは言えない唯一の構成要素だからです。同じ仕組みはキャッシュにもブローカーにも検索クラスターにもそのまま使えます。
- ほかの何かを決める前に、2 つの数字を決めます。RPO は失ってもよい末尾の量で、書き込み件数や書き込み何秒分で測ります。RTO は席が空いたままでよい時間です。同期複製か非同期複製か、検知タイムアウトをどれだけにするか、昇格に人の承認を挟むかは、すべてこの 2 つから導かれます。
- 代替のほうが悪いときに使います。自動フェイルオーバーの付いたペアは、1 台のマシンより動く部品が多く、その部品にはそれぞれの壊れ方があります。障害の代償が誤った昇格の代償を上回るときに、はじめて元が取れます。
- レプリカがすでにあるなら向いています。処理量のために読み取りレプリカを走らせているなら昇格の経路はほぼ無料で、議論はハードウェアではなく検知とルーティングに移ります。
- バックアップの代わりにはしないでください。フェイルオーバーが守るのは止まったマシンからです。壊れたマイグレーションや消されたテーブルには何の助けにもなりません。レプリカもその変更を忠実に、しかも即座に適用したからです。

## 注意点

- 非同期複製は、昇格が末尾を失うということです。レプリカがまだ適用していないものは役割が移った瞬間に消え、それが資料の中の言葉ではなく実物としての RPO です。遅れの量を測り続け、警報を設定し、正常値がどう見えるかを知っておいてはじめて、異常値が意味を持ちます。
- 検知はタイムアウトなので、どのフェイルオーバー設計にも誤検知の危険が含まれます。ただ遅くなっただけのプライマリは、長いチェックポイントでも飽和したディスクでもガベージコレクションの停止でも、死んだプライマリとまったく同じに見えます。どちらであれ証拠は沈黙だけだからです。判断に 1 人の意見ではなく過半数が要る理由はここにあり、タイムアウトが実際に起きる停止に耐えるだけ長くあるべき理由もここにあります。
- クライアントは名前を引き直さなければなりません。DNS の TTL が長いホスト名に固定された接続文字列は、もう役割を持っていないマシンを指し続けます。データベースの内側がどれだけ正しくても助けにはなりません。リダイレクトするリスナーのエンドポイントを使うか、複数のホストを知っているドライバーを使い、失敗時の再試行を有効にして、切り替えのあとの最初のリクエストが切り替えを見つける役になるようにします。
- 戻ってきた古いプライマリは、決して書き込みを受けてはいけません。自分はまだプライマリだと信じたまま戻り、誰かがそこに届けるなら、書き込みを受けるマシンが 2 台になり、あとで 2 つを突き合わせる方法がありません。レプリカとして再合流するか、人が見に来るまで止まっているかのどちらかです。
- 予定に合わせたフェイルバックは、自分で組んだ 2 度目の障害です。役割が移ってペアが再び健全になったなら、戻す理由はたいていありません。戻すなら静かな時間帯に、言葉で説明できる理由があるときだけにします。
- 試してください。一度も動かしたことのないフェイルオーバー経路は仮説にすぎず、壊れる場所がデータベースであることはまれです。死んだエンドポイントをキャッシュした接続プール、古いプライマリでしか走ったことのないマイグレーション、誰も見ないチャンネルに鳴った警報が壊れます。

## .NET では

データベース側は設定であり、アプリケーション側は接続文字列 1 つと、中断されることを前提にした再試行ポリシーです。

```csharp
// Npgsql: ホストを両方書き、必要なセッションの種類を伝える。ドライバーが両方を
// 探り、答えたほうをプライマリとして保ち、切り替えのあとは移る。
var connection =
    "Host=db-a.example.com,db-b.example.com;Database=orders;" +
    "Target Session Attributes=primary;" +
    "Timeout=5;Cancellation Timeout=2000";   // 秒、次はミリ秒

builder.Services.AddDbContext<OrdersDbContext>(options =>
    options.UseNpgsql(connection, npgsql =>
    {
        // フェイルオーバーは、その上のすべてから見れば一時的な障害に見える。だから
        // 昇格のあとの最初の呼び出しは、失敗して再試行されることを許す必要がある。
        npgsql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null);
    }));

// 少し古くてもよい読み取りは、立っているほうへ回してよい。そうすればレポート側は、
// 気にする必要のない昇格をまたいで生き続ける。
var readOnly = connection.Replace(
    "Target Session Attributes=primary",
    "Target Session Attributes=prefer-standby");
```

Azure SQL Database では、auto-failover group が名前の変わらないエンドポイントを 2 つ与えます。読み書き用のリスナーは常に現在プライマリを持っているサーバーに解決され、読み取り専用のリスナーはセカンダリに解決されます。アプリケーションはシステムが生きているあいだ接続文字列を 1 つ持ち続け、名前を動かすのは group の側です。シーンが描く置き換えはまさにこれです。SQL Server では Always On 可用性グループのリスナーが自社ネットワークの中で同じ役目を果たします。接続文字列の `MultiSubnetFailover=True` は、アドレスを順に辿らずすべて同時に試せという指示で、これが数秒で終わる切り替えと、アドレスごとに TCP タイムアウトを待つ切り替えの違いになります。

プラットフォームが何であれ、2 つの数字はダッシュボードに出しておくとよいでしょう。レプリカの遅れの量と、最後に成功したハートビートの古さです。前者は今この瞬間に昇格したら何を手放すことになるかを教え、後者はその代償を払えと言われるまでどれだけ近づいているかを教えます。`Microsoft.Extensions.Diagnostics.HealthChecks` はこの 2 つを見せるのに向いた場所です。データベースに届くことをすでに知っているヘルスチェックなら、レプリカがどれだけ遅れているかはクエリ 1 つ先にあるからです。
