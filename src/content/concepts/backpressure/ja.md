---
title: "Backpressure"
summary: "バックプレッシャーはプロデューサーのペースをコンシューマーのペースに結び付けます。間にある有限のバッファが満ちると押し返し、流入を遅くします。キューは時間を稼ぐだけで、より大きなキューはより長い嘘にすぎないからです。"
category: "回復性と障害対応"
scene: backpressure
steps:
  - title: "釣り合っているとき、キューはほとんど空です"
    text: "プロデューサーはコンシューマーが排出する速さで送り、バッファには一瞬の仕事が載るだけで、滞りは積もりません。0 近くの深さこそが健康な姿です。"
  - title: "キューはスパイクを吸収します。しばらくの間は"
    text: "流入が 3 倍になってもコンシューマーは自分のペースを守り、下流はバーストを感じません。しかしキューは時間を稼ぐだけです。流入が排出を上回っている間、深さは育つ一方で、どの項目の待ち時間も一緒に育ちます。"
  - title: "満杯のバッファは押し返します"
    text: "有限のキューはとぼけません。満杯になればプロデューサーが待ちます。その待ちが上流へ伝わり、admits の上限が段階的に下がって同時に走る項目が減り、流入はこなせる量に合わせられます。バックプレッシャーは、システムが自分自身に真実を告げる方法です。"
  - title: "さもなければ、排水を速くします"
    text: "コンシューマーがまとめて処理します。小さな項目がいくつも一度に行き来します。排出が倍になり、同じ速さのバーストが再び来ても、深さはほとんど動きません。直すべきはバッファではなく速度です。より大きなキューは、より長い嘘にすぎません。"
related:
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Batching
    slug: batching
  - label: Web Queue Worker
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

- プロデューサーとコンシューマーが接するすべての継ぎ目です。プロセスの中でもサービスの間でも同じです。取り込みパイプライン、ログ転送、メッセージポンプ、チャネルベースのワーカー、ブローカーから読む `IHostedService` など、片方がより遅い相手に仕事を渡す場所には継ぎ目があり、残る問いはそこに上限があるかどうかだけです。
- 「キューを足した」が解決策だったところすべてです。キューは衝撃を吸収する部品であって、容量計画ではありません。満杯になったらどうなるかを誰も言えないなら、答えは何か別のものが壊れるまで育つということで、キューは速くて分かりやすい故障を、遅くて分かりにくい故障に変えただけです。
- 受け入れることよりレイテンシが大切なときです。有限のバッファは待ち時間も有限にします。深さ掛ける処理時間が最悪の場合であり、その数字をダッシュボードに書けます。無限のバッファは書ける数字を与えてくれません。
- 本当の発生源がいる縁の部分です。バックプレッシャーは仕事を作っている相手まで届いて初めて効きます。プロセスの中では詰まる書き込みであり、ネットワークの向こうへは 429、503、`Retry-After`、あるいはフロー制御が仕様に入っているプロトコルです。
- もう 1 つの選択肢が捨てることであるときです。待つのが誤りで捨てるのが正しい場面もあります。メトリクスのパイプラインは、自分が測るアプリケーションを止めるくらいならサンプルを捨てるべきです。どちらも選ぶポリシーであり、誤りはどちらも決めないことです。無限キューがまさにその状態です。

## 注意点

- 無限のキューはキューではなく、時限式のメモリーリークです。過負荷が続く間、それはどこかの深さで落ち着くことはなく、ずっと育ちます。故障は後から来ます。メモリー不足で落ちるか、レイテンシがシステム中のあらゆるタイムアウトを越えた後で、その頃には中の仕事はどのみち古くなっています。
- 満杯のときのポリシーは意識して選びます。待つ、最も古いものを捨てる、最も新しいものを捨てる、書き手を断る。どれも別々の事業判断であり、それぞれ正しい場所があります。待つことは正しさを守り、痛みを上流に分けます。最も古いものを捨てるのは、最新の値だけに意味があるライブフィードに合います。断ることは、クライアントに伝えて判断させられる HTTP の縁に合います。選ばなかった既定値こそ、障害の最中に説明するはめになる値です。
- 押し返しは最後まで伝わらなければなりません。自分のコンポーネント同士をつなぐ有限のチャネルは簡単です。難しいのは最後の区間、圧力がプロセスの外へ出ていくところです。チャネルを埋めるスレッドがリクエストハンドラーなら、それを止めることが圧力をクライアントに届ける方法ですが、そのスレッドが属するプールも有限である場合に限ります。ブローカーを読む背景処理なら、ack（確認応答）を止めるか、先読みを止めます。そうしなければブローカーはこちらのメモリーへ押し込み続けます。
- スループットではなく深さと古さを見ます。スループットはキューが空でも満杯でも同じに見えます。最も遅れて動き、最も役に立たない信号です。深さはバッファが埋まりつつあることを教え、最も古い項目の古さはリクエストが実際に体験していることを教えます。どちらも何かが壊れる前に動きます。
- まとめ処理はレイテンシを渡してスループットを買う取引なので、待ちに上限を置きます。10 ミリ秒で埋まるまとまりはただ同然です。最後の 1 件を 2 秒待ったまとまりは、その中の全項目を 2 秒ずつ悪くしています。最大の件数と最大の遅延を両方決め、先に来たほうを取ります。
- バッファの大きさを勘で決めないでください。容量は約束したいものから決まります。許せる最悪の待ちが 2 秒で、コンシューマーが毎秒 50 件をこなすなら、バッファは 100 件を持ち、101 件目は入口で待ちます。「満杯を見ることがないくらい十分大きい」バッファは、問題を隠すよう命じられたバッファです。

## .NET では

`System.Threading.Channels` は、この図の全体をそのままプロセスの中に置いたものです。`CreateBounded` が 8 つのセルを与え、`FullMode` がシーンで `wait` チップに変わるそのポリシーです。

```csharp
// 継ぎ目です。セルは 8 つで、プロデューサーは空きが 1 つできるまで待たされます。
var channel = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(capacity: 8)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = true,
});

// プロデューサー。WriteAsync は書き込めるセルができるまで完了しないので、
// このループのペースはコンシューマーのペースそのものです。この await 1 つが
// パターンのすべてです。
await foreach (var item in source.ReadAllAsync(token))
{
    await channel.Writer.WriteAsync(item, token);
}
channel.Writer.Complete();

// コンシューマー。
await foreach (var item in channel.Reader.ReadAllAsync(token))
{
    await handler.HandleAsync(item, token);
}
```

`Channel.CreateUnbounded` は上限だけを消した同じコードで、本番で壊れるほうです。`WriteAsync` が常にすぐ完了するのでプロデューサーは何も学べず、キューは過負荷を知らせる場所ではなく、過負荷をしまい込む場所になります。有限のほうが詰まるからという理由で無限のほうに手が伸びるなら、その詰まりこそ尋ねていた情報です。

残り 3 つの `FullMode` は詰まりません。`DropOldest` と `DropNewest` は書き手を動かし続け、代わりに仕事を捨てます。最新の値が前の値に取って代わるフィードには正しい選択で、処理すると約束したものには誤った選択です。`DropWrite` は書き込もうとした項目を捨て、書き手には成功と報告します。`TryWrite` は `true` を返し、`WriteAsync` は完了し、唯一の合図は `Channel.CreateBounded` の `itemDropped` コールバックです。503 がリクエストを断るように書き込みを断るものはチャネルにはないので、プロデューサーに知らせる必要があるなら `Wait` モードのままにして `TryWrite` に false を返させるか、`WriteAsync` にタイムアウトを付けます。

シーンにある同時実行の上限はセマフォです。発生源で同時に走れる仕事の数を縛り、それが押し返しをバッファを持つ最初の地点で止めないようにします。

```csharp
// 発生源が何を出してこようと、未処理の項目は最大 8 件です。許可は項目をキューに
// 入れる前に取り、コンシューマーが処理を終えて初めて返します。WriteAsync の後で
// 解放すると代わりに書き手の側を縛ることになり、それは有限のチャネルがすでに
// やっていることです。
var admits = new SemaphoreSlim(initialCount: 8, maxCount: 8);

// プロデューサー。
await admits.WaitAsync(token);
await channel.Writer.WriteAsync(item, token);

// コンシューマー。
try
{
    await handler.HandleAsync(item, token);
}
finally
{
    admits.Release();
}
```

HTTP の縁では同じ上限が `AddConcurrencyLimiter` になり、そこでは待ち行列が明示されます。`QueueLimit` は許可を待てる呼び出し元の数で、それを超えた分はメモリーに立たせるのではなくステータスコードで断ります。これがバックプレッシャーと負荷の切り捨ての違いであり、両方が同じシステムに要ります。セマフォは待たせられる呼び出し元を遅くし、リミッターは待たせられない呼び出し元を断ります。

まとめ処理は 4 番目のステップで、忘れられがちなのは遅延の上限です。

```csharp
// 最大で `max` 件まで取りますが、残りを待つのは `window` までです。
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
            // 窓が閉じました。まとまりが埋まるのを待たず、手元にある分を送ります。
        }

        if (batch.Count == 0) continue;
        yield return batch.ToArray();
        batch.Clear();
    }
}
```

多くの項目を一度に行き来させると、たいてい大きく勝ちます。`SqlBulkCopy` 1 回、`SendMessagesAsync` 1 回、一括インデックスリクエスト 1 回で、呼び出しごとの費用を `max` 回ではなく 1 回だけ払うからです。シーンが見せるのはやり方ではなく結果です。排出の速さが倍になり、同じスパイクが再び来ても、深さはほとんど動きません。それが正直な直し方です。容量を 8 から 8000 に上げれば、バッジが点くことはなくなったでしょうが、コンシューマーが速くなったわけではありません。それは解決ではなく、より長い嘘です。
