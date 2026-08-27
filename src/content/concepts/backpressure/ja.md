---
title: "Backpressure"
summary: "バックプレッシャーは生産者のペースを消費者のペースに結び付けます。間にある有限のバッファが満ちると押し返し、流入を遅くします。キューは時間を稼ぐだけで、より大きなキューはより長い嘘にすぎないからです。"
category: "回復性と障害対応"
scene: backpressure
steps:
  - title: "釣り合っているとき、キューはほとんど空です"
    text: "生産者は消費者が排出する速さで送り、バッファには一瞬の仕事が載るだけで、滞りは積もりません。0 近くの深さこそが健康な姿です。"
  - title: "キューはスパイクを吸収します。しばらくの間は"
    text: "流入が 3 倍になっても消費者は自分のペースを守り、下流はバーストを感じません。しかしキューは時間を稼ぐだけです。流入が排出を上回っている間、深さは育つ一方で、どの項目の待ち時間も一緒に育ちます。"
  - title: "満杯のバッファは押し返します"
    text: "有限のキューはとぼけません。満杯になれば生産者が待ちます。その待ちが上流へ伝わり、一度に入る生産者が減り、流入は実際にこなせる量に合わせられます。バックプレッシャーは、システムが自分自身に真実を告げる方法です。"
  - title: "さもなければ、排水口を広げます"
    text: "消費者がまとめて処理します。小さな項目がいくつも一度に行き来します。排出が倍になり、同じスパイクが再び来ても、深さはほとんど動きません。直すべきはバッファではなく速度です。より大きなキューは、より長い嘘にすぎません。"
related:
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Spike Test
    slug: spike-test
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
---

## いつ使うか

- 生産者と消費者が接するすべての継ぎ目です。プロセスの中でもサービスの間でも同じです。取り込みパイプライン、ログ転送、メッセージポンプ、チャネルベースのワーカー、ブローカーから読む `IHostedService` など、片方がより遅い相手に仕事を渡す場所には継ぎ目があり、残る問いはそこに上限があるかどうかだけです。
- 「キューを足した」が解決策だったところすべてです。キューは衝撃を吸収する部品であって、容量計画ではありません。満杯になったらどうなるかを誰も言えないなら、答えは何か別のものが壊れるまで育つということで、キューは速くて分かりやすい故障を、遅くて分かりにくい故障に変えただけです。
- 受け入れることより遅延が大切なときです。有限のバッファは待ち時間も有限にします。深さ掛ける処理時間が最悪の場合であり、その数字をダッシュボードに書けます。無限のバッファは書ける数字を与えてくれません。
- 本当の発生源がいる縁の部分です。バックプレッシャーは仕事を作っている相手まで届いて初めて効きます。プロセスの中では詰まる書き込みであり、ネットワークの向こうへは 429、503、`Retry-After`、あるいはフロー制御が仕様に入っているプロトコルです。
- もう一つの選択肢が捨てることであるときです。待つのが誤りで捨てるのが正しい場面もあります。メトリクスのパイプラインは、自分が測るアプリケーションを止めるくらいならサンプルを捨てるべきです。どちらも選ぶ方針であり、誤りはどちらも決めないことです。無限キューがまさにその状態です。

## 注意点

- 無限のキューはキューではなく、時限式のメモリリークです。過負荷が続く間、それはどこかの深さで落ち着くことはなく、ずっと育ちます。故障は後から来ます。メモリ不足で落ちるか、遅延がシステム中のあらゆるタイムアウトを越えた後で、その頃には中の仕事はどのみち古くなっています。
- 満杯のときの方針は意識して選びます。待つ、最も古いものを捨てる、最も新しいものを捨てる、書き手を断る。どれも別々の事業判断であり、それぞれ正しい場所があります。待つことは正しさを守り、痛みを上流に分けます。最も古いものを捨てるのは、最新の値だけに意味があるライブフィードに合います。断ることは、クライアントに伝えて判断させられる HTTP の縁に合います。選ばなかった既定値こそ、障害の最中に説明するはめになる値です。
- 押し返しは最後まで伝わらなければなりません。自分のコンポーネント同士をつなぐ有限のチャネルは簡単です。難しいのは最後の区間、圧力がプロセスの外へ出ていくところです。チャネルを埋めるスレッドがリクエストハンドラなら、それを止めることが圧力をクライアントに届ける方法ですが、そのスレッドが属するプールも有限である場合に限ります。ブローカーを読む背景処理なら、確認応答を止めるか、先読みを止めます。そうしなければブローカーは自分のメモリへ押し込み続けます。
- スループットではなく深さと古さを見ます。スループットはキューが空でも満杯でも同じに見えます。最も遅れて動き、最も役に立たない信号です。深さはバッファが埋まりつつあることを教え、最も古い項目の古さはリクエストが実際に体験していることを教えます。どちらも何かが壊れる前に動きます。
- まとめ処理は遅延を渡してスループットを買う取引なので、待ちに上限を置きます。10 ミリ秒で埋まるまとまりはただ同然です。最後の 1 件を 2 秒待ったまとまりは、その中の全項目を 2 秒ずつ悪くしています。最大の件数と最大の遅延を両方決め、先に来たほうを取ります。
- バッファの大きさを勘で決めないでください。容量は約束したいものから決まります。許せる最悪の待ちが 2 秒で、消費者が毎秒 50 件をこなすなら、バッファは 100 件を持ち、101 件目は入口で待ちます。「満杯を見ることがないくらい十分大きい」バッファは、問題を隠すよう命じられたバッファです。

## .NET では

`System.Threading.Channels` は、この図の全体をそのままプロセスの中に置いたものです。`CreateBounded` が 8 つのセルを与え、`FullMode` が場面で `wait` チップに変わるその方針です。

```csharp
// The seam: eight cells, and a producer that is made to wait for one.
var channel = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(capacity: 8)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = true,
});

// Producer. WriteAsync does not complete until there is a cell to write into,
// so the pace of this loop is the consumer's pace and nothing else. That one
// await is the whole pattern.
await foreach (var item in source.ReadAllAsync(token))
{
    await channel.Writer.WriteAsync(item, token);
}
channel.Writer.Complete();

// Consumer.
await foreach (var item in channel.Reader.ReadAllAsync(token))
{
    await handler.HandleAsync(item, token);
}
```

`Channel.CreateUnbounded` は上限だけを消した同じコードで、本番で壊れるほうです。`WriteAsync` が常にすぐ完了するので生産者は何も学べず、キューは過負荷を知らせる場所ではなく、過負荷をしまい込む場所になります。有限のほうが詰まるからという理由で無限のほうに手が伸びるなら、その詰まりこそ尋ねていた情報です。

残り 2 つの `FullMode` は詰まりません。`DropOldest` と `DropNewest` は書き手を動かし続け、代わりに仕事を捨てます。最新の値が前の値に取って代わるフィードには正しい選択で、処理すると約束したものには誤った選択です。`DropWrite` は書き込み自体を失敗させ、チャネルが持つ中では 503 に最も近いものです。

場面にある同時実行の上限はセマフォです。発生源で同時に走れる仕事の数を縛り、それが押し返しをバッファを持つ最初の地点で止めないようにします。

```csharp
// At most eight items outstanding, whatever the source offers.
var admits = new SemaphoreSlim(initialCount: 8, maxCount: 8);

await admits.WaitAsync(token);
try
{
    await channel.Writer.WriteAsync(item, token);
}
finally
{
    admits.Release();
}
```

HTTP の縁では同じ上限が `AddConcurrencyLimiter` になり、そこでは待ち行列が明示されます。`QueueLimit` は許可を待てる呼び出し元の数で、それを超えた分はメモリに立たせるのではなくステータスコードで断ります。これがバックプレッシャーと負荷の切り捨ての違いであり、両方が同じシステムに要ります。セマフォは待たせられる呼び出し元を遅くし、リミッターは待たせられない呼び出し元を断ります。

まとめ処理は 4 段階目で、忘れられがちなのは遅延の上限です。

```csharp
// Take up to `max` items, but never wait longer than `window` for the rest.
static async IAsyncEnumerable<T[]> Batches<T>(
    ChannelReader<T> reader,
    int max,
    TimeSpan window,
    [EnumeratorCancellation] CancellationToken token)
{
    var batch = new List<T>(max);
    while (await reader.WaitToReadAsync(token))
    {
        using var cap = CancellationTokenSource.CreateLinkedTokenSource(token);
        cap.CancelAfter(window);
        try
        {
            while (batch.Count < max && await reader.WaitToReadAsync(cap.Token))
            {
                while (batch.Count < max && reader.TryRead(out var item)) batch.Add(item);
            }
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            // The window closed. Send what we have rather than wait for a full batch.
        }

        if (batch.Count == 0) continue;
        yield return batch.ToArray();
        batch.Clear();
    }
}
```

多くの項目を一度に行き来させると、たいてい大きく勝ちます。`SqlBulkCopy` 一回、`SendMessagesAsync` 一回、一括インデックス要求一回で、呼び出しごとの費用を `max` 回ではなく一回だけ払うからです。場面が見せるのはやり方ではなく結果です。排出の速さが倍になり、同じスパイクが再び来ても、深さはほとんど動きません。それが正直な直し方です。容量を 8 から 8000 に上げれば、バッジが点くことはなくなったでしょうが、消費者が速くなったわけではありません。それは解決ではなく、より長い嘘です。
