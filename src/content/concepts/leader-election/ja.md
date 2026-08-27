---
title: "Leader Election"
summary: "リーダー選出は、同じ姿をした多くのインスタンスの中からちょうど一つだけを選び、名前の付いた役割を持たせる仕組みです。設定で決めておくのではなく、更新しなければ期限が切れるリースを取り合って決めるので、その役割はどれか一台が落ちても生き残ります。"
category: "分散協調"
scene: leader-election
steps:
  - title: "三つが起動し、一つが率います"
    text: "同じインスタンスが三つ立ち上がり、同じリース保管庫にただ一つのリースを要求します。保管庫はちょうど一つにだけ貸し出し、勝った側がリーダーになって仕事を始め、残りはフォロワーとして待機します。"
  - title: "リーダーシップは肩書きではなくリースです"
    text: "リーダーは TTL が尽きる前に更新を続けている間だけ席を保ちます。障害でも長い停止でもネットワーク分断でも、更新が止まれば席はそのまま期限切れになります。この期限切れこそが安全装置のすべてです。"
  - title: "リーダーが死んでも、率いるのは一つだけです"
    text: "リースが切れると二つのフォロワーが競い、保管庫はちょうど一つにだけ貸し出し、エポックが一つ上がります。戻ってきた元リーダーが更新を試みても、古いエポックは拒否されます。互いに自分がリーダーだと信じる二つのノード、つまりスプリットブレインこそ、この仕組みが防ごうとするただ一つのものです。"
  - title: "このすべては、仕事を一箇所でだけ回すためにあります"
    text: "作業ストリップを見ると、起動と停止と再選出を経ても、ティックは途切れない一本の列のまま続き、重複カウンターは動きません。席は一瞬空くことはあっても、決して二人で分け合うことはありません。"
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Singleton Worker
    slug: singleton-worker
  - label: Health Check
    slug: health-check
  - label: Heartbeat
    slug: heartbeat
  - label: Quorum
    slug: quorum
  - label: Failover
    slug: failover
references:
  - title: Leader Election pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/leader-election
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
  - title: BackgroundService Class
    url: https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.hosting.backgroundservice
---

## いつ使うか

- レプリカが何台あってもちょうど一度だけ起きなければならない背景処理。スケジュールジョブ、アウトボックスの送出、キューのポンプ、キャッシュの予熱、夜間の突合がこれに当たります。
- アプリケーションが水平にスケールしたせいで「コピーを一つだけ動かせばよい」という前提が崩れ、二つ目のコピーが一つ目と同じ仕事を始めてしまった場面。
- スケジュールではなく持ち主が必要な役割。パーティションを保持するインスタンス、マイグレーションを進めるインスタンス、書き手として応答するインスタンスがそうです。
- フェイルオーバーをポケベルの呼び出しではなく秒で測りたいとき。席はデプロイをやり直したからではなく、元の保持者が更新をやめたので自分で移ります。

## 注意点

- 更新は仕事とは別に、自分だけのループで回す必要があります。作業単位の合間に更新を挟むリーダーは、単位が一つでも TTL より長くなった瞬間に席を失い、数秒のガベージコレクション停止だけでもそうなります。
- 仕事は単位ごとにリーダーであることを確かめ直し、更新ループがリースを失ったと知らせたら直ちに止まらなければなりません。そうしないとリーダーは、途中だったバッチが終わるまで働き続けます。
- 元のリーダーがリースを失った時点と、それに気づく時点の間には必ず隙間があります。プロセスの中のどんな仕組みもこの隙間を消せないので、副作用のある処理は必ずエポックを載せて送り、リソース側で古いエポックを拒否させます。
- TTL は両端に代償のあるつまみです。短ければフェイルオーバーは速い代わりに、一瞬止まっただけのリーダーの席を他が奪う危険が増えます。長ければ誤った奪取はない代わりに、落ちた後その分だけ席が空いたままになります。
- 一つのリースが保証するリーダーは、そのリースの範囲の中で一つだけです。Kubernetes の `Lease` は一つのクラスターの名前空間に紐づくので、同じデプロイを動かす二つのクラスターは、互いを全く知らないリーダーを一つずつ選びます。
- リーダー選出は、繰り返し実行しても安全な処理設計の代わりにはなりません。重複実行の幅を引き継ぎの瞬間まで狭めるだけで、なくしてはくれません。

## .NET では

基本の形は `BackgroundService` 一つです。リースを取得し、別のタイマーで更新し、リースを失った瞬間に取り消されるトークンの下で仕事を回し、また待機に戻ります。

```csharp
public sealed class LeaderLoop(ILeaseStore store, ILogger<LeaderLoop> log) : BackgroundService
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan RenewEvery = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan RetryEvery = TimeSpan.FromSeconds(2);

    private readonly string identity = $"{Environment.MachineName}:{Environment.ProcessId}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var lease = await store.TryAcquireAsync(identity, Ttl, stoppingToken);
            if (lease is null)
            {
                // Follower: wait, look again. This is the watch in the scene.
                await Task.Delay(RetryEvery, stoppingToken);
                continue;
            }

            log.LogInformation("leading with epoch {Epoch}", lease.Epoch);
            await LeadAsync(lease, stoppingToken);
        }
    }

    private async Task LeadAsync(Lease lease, CancellationToken stoppingToken)
    {
        using var seat = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var work = RunWorkAsync(lease.Epoch, seat.Token);

        try
        {
            while (await store.TryRenewAsync(lease, Ttl, seat.Token))
            {
                await Task.Delay(RenewEvery, seat.Token);
            }
            log.LogWarning("lease {Epoch} lost, standing down", lease.Epoch);
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
        finally
        {
            await seat.CancelAsync();
            await work.WaitAsync(TimeSpan.FromSeconds(5), CancellationToken.None);
        }
    }
}
```

このループで効いているのは二点で、それが実質このパターンのすべてです。更新が仕事の合間に呼ばれるものではなく自分だけの `Task.Delay` の周期で回るので、遅い作業単位が更新を遅らせることはできません。そして更新が失敗した瞬間に `seat` が取り消されるため、リースが消えたのと同じ合図で仕事も止まります。

リースそのものは、すでにプラットフォームにあるものを使えば十分です。Kubernetes では `coordination.k8s.io` の `Lease` オブジェクトがそれで、.NET クライアントから作成も更新もでき、`spec.renewTime` と `spec.leaseTransitions` がシーンのレコードカードとエポックにそのまま対応します。SQL Server では、リーダーが開いたままにしているセッションの中で `sp_getapplock` を取れば、依存を増やさずに同じものが得られます。Azure では、期間を決めた blob リースが最も素朴な形のリースです。

```csharp
// SQL Server: one row, one holder, an expiry, and a number that only goes up.
const string acquire = """
    UPDATE leases
       SET holder = @identity,
           expires_at = SYSUTCDATETIME() + @ttl,
           epoch = epoch + 1
     WHERE name = @name
       AND (holder IS NULL OR expires_at <= SYSUTCDATETIME())
    OUTPUT inserted.epoch;
    """;
```

最後に書き込みを守ります。リーダーは与えられたエポックを持ち歩き、どの書き込みにもその値を載せるので、席を失ったことに気づいていないリーダーは、リソース側から信用される代わりに拒否されます。

```csharp
// Refused when a newer leader has already written under a higher epoch.
const string commit = """
    UPDATE outbox_cursor
       SET position = @position, epoch = @epoch
     WHERE name = @name AND epoch <= @epoch;
    """;
```

締めくくりに時計の話をしておきます。期限切れの判断はインスタンスではなく保管庫の仕事です。二台のマシンの時刻が、席を預けられるほど正確に一致することはないからです。リースがまだ自分のものかは保管庫に尋ね、待ち時間には `TimeProvider` を使います。他人が書いた期限を自分側の `DateTime.UtcNow` と比べてはいけません。
