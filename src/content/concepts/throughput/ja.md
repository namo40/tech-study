---
title: "Throughput"
summary: "Throughput とは毎秒どれだけの仕事が終わるかであり、レイテンシとは別の軸です。utilization は資源がどれだけ忙しいかを示し、saturation は流入が容量を超えたときにできる行列であり、天井の近くではスループットがもう一単位伸びるずっと前にレイテンシが爆発します。"
category: "要件と品質特性"
scene: throughput
steps:
  - title: "スループットとレイテンシは別々の軸です"
    text: "仕事一つを 100ms で終える作業者一人は毎秒十件を処理します。一つを 400ms で終える四人のプールも毎秒十件です。速い応答は量を保証せず、量が速さを要求するわけでもありません。システムには両方の数字があり、片方を見ながらもう片方を調整するのが、グラフが人を驚かせるやり方です。"
  - title: "utilization はどれだけ忙しいかで、スループットはどれだけ終わるかです"
    text: "流入を上げると二つは一緒に上がります。40% の忙しさでは来た端から出ていき、80% でもまだ大丈夫ですが、バーストを受け止める余裕は減ります。utilization が最も安い早期シグナルなのは、痛くなる前に天井があとどれだけ残っているかを教えてくれるからです。"
  - title: "saturation は行列であり、レイテンシは行列に住んでいます"
    text: "流入が容量を超えると列が伸びます。スループットは天井で平らになるのに、待ち時間は爆発します。新しいリクエストのそれぞれが、すでに待っている全員の後ろに並ぶからです。サーバーは 100% 忙しいのに、余分に終わるものはありません。満杯は速さではありません。満杯は遅さの始まる場所です。"
  - title: "天井はボトルネックのものであり、余裕は設計の選択です"
    text: "容量を増やせば天井が上がり、流入の圧力を減らせば天井から一歩下がれます。そして他の段が何をしようと、いちばん狭い段が数字を決めます。80% 付近で回すのは、列を短く保つバースト余裕を買うことです。スループットはボトルネックで買い、平和は余裕で買うのです。"
related:
  - label: Utilization
    slug: utilization
  - label: Saturation
    slug: saturation
  - label: Tail Latency
    slug: tail-latency
  - label: p95
    slug: p95
  - label: p99
    slug: p99
  - label: Backpressure
    slug: backpressure
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Load Shedding
    slug: load-shedding
  - label: Thread Pool
    slug: thread-pool
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Elasticity
    slug: elasticity
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Batching
    slug: batching
references:
  - title: "Performance efficiency design principles"
    url: https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/principles
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

## いつ使うか

- 何かのサイズを決めるとき。プール、レプリカ、パーティション、コネクション上限、ワーカー数は、どれも「毎秒どれだけの仕事が必要で、ここからそこまででいちばん狭い段はどこか」という一つの問いです。スループットの数字なしに選んだサイズは、デモのときの感触で選んだサイズです。
- 負荷テストの結果を読むとき。レイテンシ曲線の膝がまさに saturation であり、グラフの中で見る価値があるのはそこだけです。膝の下では負荷を上げるとスループットも上がり、レイテンシはほとんど動きません。膝の上ではスループットが止まり、レイテンシは行列の行く先に従います。膝の位置がわかれば、天井と安全な運転帯の両方がわかります。
- SLO を設計するとき。レイテンシ目標は静かに utilization に上限をかけます。資源が満杯に近づくほど待ち時間が急に伸びるからです。「p99 は 200ms 以下」と「機材は 95% で回そう」は二つの要件ではなく、一つの要件とそれを否定する言葉です。
- 行列の後ろにワーカーがいる構成。流入と処理がどちらも速度であるとき、滞留の運命はその差だけで決まります。流入が処理を十分に長く上回れば、行列をどう調整しても効きません。残る問いは、容量を足すのか、受ける仕事を減らすのかだけです。
- 誰かが「システムが遅い」と言ったとき。何が遅いのでしょうか。飽和した資源はスレッドを足すほど遅くなる遅さで、本当に遅い依存先はスレッドを足しても変わらない遅さです。スループットと utilization を並べて見れば、いまどちらの話をしているのかがわかります。

## 注意点

- スループットとレイテンシは別の問いに答えるので、両方を報告し、一つのスコアに平均してはいけません。二つを混ぜた数字は、手を打てる理由で上下しません。場面の第 1 段階がその問題をそのまま縮めて見せています。スループットが同じでレイテンシが 4 倍違う二つのシステムがあり、その二つを区別できる単一の数値はありません。
- 100% に近い utilization は効率ではなく、これから起きる行列です。待ち時間は残りの余裕の逆数におおむね比例するので、資源の最後の数パーセントは最初の 80% よりはるかに高いレイテンシを請求します。余裕は意図して取ってください(ピークで 70~80% がよくある目安です)。そして「95% まで上げた」という報告は、節約ではなく脆さの報告として読んでください。
- 天井はボトルネックが決めるので、他を最適化しても変わるのは請求額だけです。飽和したデータベースの前でウェブ層を倍にしても、買えるのは長い行列であって、終わる仕事の量ではありません。他の段が空いているのに一つだけ 100% の段を見つけて、そこに使います。
- 行列はどの層にも隠れていて、それぞれが待ちを足します。スレッドプールに一つ、コネクションプールに一つ、ネットワークカードに一つ、ディスクに一つ、ブローカーに一つあります。計測したどの区間でも速く見えるリクエストが遅いことはあります。誰も描かなかった行列で時間を使ったからです。
- リトルの法則が検算です。行列の長さは流入速度かける待ち時間なので、見ている三つの数字のうち二つが残りの一つを説明できないなら、どれかの測り方が間違っているか、仮定した定常状態ではありません。掛け算一回で済み、それで落ちるおかしな話はかなりの数になります。
- goodput はスループットではありません。リトライ、すでに諦めたタイムアウト、誰も読まなかった応答は、後者だけを膨らませて役に立った量を動かしません。過負荷のときほど二つの差はいちばん速く開きますが、よりによってダッシュボードを信じたい瞬間がそこです。やった仕事ではなく、役に立った仕事を数えます。
- 区間のない速度は測定ではありません。1 分間の「毎秒 2000」は、平らな 2000 かもしれず、30 秒の 4000 と 30 秒のゼロかもしれません。2000 に合わせて作ったシステムに収まるのは、そのうち一方だけです。

## .NET では

言い合う前に測ります。`dotnet-counters` は、この場面が描く三つの数字を、コードの変更も再起動もなしに見せてくれます。仕事が届く速度、プールがどれだけ使われているか、行列がどれだけ長いかです。

```bash
# Arrival rate, thread pool queue depth, and connection pool pressure, live.
dotnet-counters monitor --process-id 1234 \
  --counters System.Runtime,Microsoft.AspNetCore.Hosting,Microsoft.Data.SqlClient.EventSource
```

`Microsoft.AspNetCore.Hosting` は `requests-per-second` と `current-requests` を報告します。それぞれこの場面の `out` と、おおよその行列にあたります。`System.Runtime` は `threadpool-queue-length` を報告します。この値がずっとゼロより大きいなら、仕事がスレッドを待っているということで、その待ちはどの span にも現れないレイテンシです。

自分で作った段には、速度と所要時間を `Meter` として公開します。そうすれば同じ二つの軸が、端だけでなく構成要素ごとに存在します。

```csharp
// One meter per stage, so the bottleneck names itself instead of being guessed.
private static readonly Meter Meter = new("Orders.Pipeline");
private static readonly Counter<long> Finished = Meter.CreateCounter<long>("orders.finished");
private static readonly Histogram<double> Wait =
    Meter.CreateHistogram<double>("orders.queue_wait", unit: "ms");
private static readonly UpDownCounter<int> InFlight =
    Meter.CreateUpDownCounter<int>("orders.in_flight");

public async Task<Receipt> HandleAsync(Order order, CancellationToken token)
{
    var queued = Stopwatch.GetTimestamp();
    await _gate.WaitAsync(token);          // the bounded stage: this is the queue
    Wait.Record(Stopwatch.GetElapsedTime(queued).TotalMilliseconds);
    InFlight.Add(1);
    try
    {
        var receipt = await _work.RunAsync(order, token);
        Finished.Add(1);                   // goodput: only what actually completed
        return receipt;
    }
    finally
    {
        InFlight.Add(-1);
        _gate.Release();
    }
}
```

数字を価値あるものにする習慣が三つあります。膝の向こうまで意図的に負荷をかけてください。楽な帯で止まるテストは、天井がどこかも、その向こうがどんな姿かも教えてくれません。待ち時間は作業時間と分けて記録してください。呼び出し側が経験するレイテンシは二つの和だけですが、二つを直す手段はまったく違います。そして数字が指した段を直します。隣が空いているのに一つだけ 100% の段が天井であり、残りに注いだ時間は何も買ってくれません。
