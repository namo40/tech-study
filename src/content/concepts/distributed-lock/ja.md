---
title: "Distributed Lock"
summary: "分散ロックは、ある処理を一度に 1 つのインスタンスだけが行うようにするための仕組みです。実体は有効期限付きのリースなので、保持者は気づかないうちにロックを失うことがあり、古い保持者の書き込みをリソース自身に拒否させられるのはフェンシングトークンだけです。"
category: "分散協調"
scene: distributed-lock
steps:
  - title: "インスタンス 2 つに、仕事 1 つ"
    text: "夜間ジョブが両方のインスタンスで発火し、どちらも同じレポートに書き込み、書き込みが入り混じります。どちらも自分は成功したと思っています。"
  - title: "ロックではなくリース"
    text: "先に来たインスタンスが有効期限付きでキーを確保し、作業中はそれを更新し続けます。2 つ目は拒否されて待ちます。保持者が手放せば待機者が引き継ぎます。TTL は、死んだ保持者が全員を永遠に塞がないためにあります。"
  - title: "期限切れは尋ねてくれない"
    text: "保持者が長い GC やネットワークの途切れで止まり、そのあいだにリースが切れます。待機者がロックを取って書き込みます。そして古い保持者が目を覚まし、まだ自分がロックを握っていると信じたまま書き込みます。"
  - title: "Fencing"
    text: "取得のたびに増え続けるトークンを受け取り、リソースは自分が見た最大値を覚えています。古い保持者の書き込みは小さいトークンを伴うので、ストレージ自身が拒否します。そもそもロックに手を伸ばす前に、パーティショニング、unique 制約、冪等な操作を先に検討します。"
related:
  - label: Distributed Lease
    slug: distributed-lease
  - label: Fencing Token
    slug: fencing-token
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Leader Election
    slug: leader-election
  - label: Split Brain
    slug: split-brain
  - label: Kubernetes Lease
    slug: kubernetes-lease
  - label: Singleton Worker
    slug: singleton-worker
  - label: Partitioning
    slug: partitioning
  - label: Idempotency
    slug: idempotency
  - label: Lock
    slug: lock
  - label: Deadlock
    slug: deadlock
references:
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

## いつ使うか

- もっと安い答えをすべて排除したあとにだけ使います。キーで作業を分割して 2 つのインスタンスが同じ対象に触れないようにする、データベースの unique 制約で 2 番目の書き込みを弾く、条件付き更新で古い書き込みが着地しないようにする、ハンドラーを何度実行しても結果が変わらないようにする。これらが先です。
- 単一実行のワーカー、二度走ってはいけないスケジュールジョブ、一度きりであるべきマイグレーション手順。作業をキーで割ることもできず、繰り返すこともできない場合が、ロックの出番です。
- トランザクションの代わりにはなりません。分散ロックはプロセス同士の順序を合わせるだけで、2 つの書き込みを原子的にまとめてくれるわけでも、保持者が途中で死んだときに巻き戻してくれるわけでもありません。

## 注意点

- 分散ロックはリースです。保持者が仕事を終えていようと、ただ止まっているだけであろうと期限は切れるので、保持者が自分の状態を取り違えている前提で設計します。「自分がロックを持っているから誰も書いていない」という仮定は、長い GC 停止の前で崩れます。
- すべての書き込みに取得時のトークンを添え、リソースが小さいトークンを拒否するようにします。そうしなければ、ロックはストレージの耳に届かない助言にすぎません。トークン検査があれば排他を強制するのはストレージ側になり、ロックは最適化の道具に下がります。
- TTL は作業の p99 より十分長く取り、期限に余裕を残して更新し、更新が失敗した瞬間に作業を止めます。更新の失敗はリースがすでに消えているかもしれないという意味なので、正しい対応はもっと強く試すことではなく、作業を諦めることです。
- 取得失敗、更新失敗、保持時間を計測します。数分間握られたままのロックは設計の匂いです。臨界区間の中に HTTP 呼び出しやキュー送信、レポート生成といった、本来外にあるべき処理が入り込んでいます。
- ロックサービスの時計を真実の根拠にしないでください。Redis の期限切れ、プロセスの時計、リソース側の時計はいずれもずれていきます。フェンシングトークンは、正しさがそのどの時計にも依存しないようにするためのものです。
- 非同期レプリカを持つ単一の Redis プライマリは、フェイルオーバーをまたいでキーを二度渡すことがあります。取得が、昇格するレプリカにまだ届いていないかもしれないからです。Redlock の議論が扱うのはこの点で、フェンシングがあればそれは致命傷ではなく、生き延びられる事故になります。
- Kubernetes でリーダー選出が必要なら、自作せずに Lease オブジェクトを使います。リーダーが替わる瞬間には短い重なりがあると考えてください。新しいリーダーが動き始めても、古いリーダーがまだ走っていることがあります。

## .NET では

Redis 上のリースは 3 つの操作でできています。キーが存在しないときだけ確保し、まだ自分のものであるときだけ更新し、まだ自分のものであるときだけ解放します。それぞれが 1 つのスクリプトとして走るので、検査と書き込みが離れることはありません。これが、すでに他人の手に渡ったリースを延長したり削除したりすることを防ぎ、フェンシングトークンを発行の順序と一致させ続けます。

```csharp
public sealed record Lease(string Key, string Owner, long Token, TimeSpan Ttl);

public sealed class RedisLease(IDatabase redis)
{
    // キーの確保とトークンの発行を 1 つのスクリプトで行い、トークンが取得の
    // 順に増えるようにします。スクリプトの外の INCR は、あとから取得する
    // インスタンスに小さいトークンを渡してしまうことがあります。
    private const string AcquireScript = """
        if redis.call('exists', KEYS[1]) == 1 then return nil end
        local token = redis.call('incr', KEYS[2])
        redis.call('set', KEYS[1], ARGV[1] .. ':' .. token, 'PX', ARGV[2])
        return token
        """;

    public async Task<Lease?> TryAcquireAsync(string key, TimeSpan ttl)
    {
        var owner = Guid.NewGuid().ToString("N");
        var result = await redis.ScriptEvaluateAsync(AcquireScript,
            [key, $"{key}:fence"], [owner, (long)ttl.TotalMilliseconds]);
        return result.IsNull ? null : new Lease(key, owner, (long)result, ttl);
    }

    // まだ自分のものであるときだけ更新します (Lua による compare-and-set)。
    private const string RenewScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) end return 0";

    public async Task<bool> RenewAsync(Lease lease) =>
        (long)await redis.ScriptEvaluateAsync(RenewScript, [lease.Key],
            [$"{lease.Owner}:{lease.Token}", (long)lease.Ttl.TotalMilliseconds]) == 1;

    private const string ReleaseScript =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

    public Task ReleaseAsync(Lease lease) =>
        redis.ScriptEvaluateAsync(ReleaseScript, [lease.Key], [$"{lease.Owner}:{lease.Token}"]);
}

// リソース側です。見たなかで最大のトークンより古いものはすべて拒否します。
// UPDATE reports SET body = @body, last_token = @token WHERE id = @id AND last_token < @token;
// last_token の既定値は 0 にします。そうしないと最初の書き込みが NULL と比較され、決して着地しません。
```

ロックを安全にしているのは最後の 1 行だけで、たいてい抜け落ちているのもその 1 行です。リソースがトークンの列を持てないならフェンシングもできず、そのときロックにできる最善は、衝突を不可能にすることではなく稀にすることだけです。

Kubernetes で単一実行のワーカーが必要なら、Lease オブジェクトでリーダー選出を行い、状態の管理はプラットフォームに任せます。リーダー交代の瞬間には依然として短い重なりがあるので、ジョブは二度走っても害がないように書き、そのジョブが行う書き込みにはトークンを添え続けます。
