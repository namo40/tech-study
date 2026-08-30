---
title: "Saturation"
summary: "流入が容量を超えたときにできる行列です。その時点でスループットはすでに伸びを止めているので、超えた分はすべて待ち時間になり、レイテンシはまさにここに住んでいます。"
category: "要件と品質特性"
scene: throughput
sceneStep: 3
related:
  - label: Throughput
    slug: throughput
  - label: Utilization
    slug: utilization
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
  - title: "The USE Method"
    url: https://www.brendangregg.com/usemethod.html
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Well-known EventCounters in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/diagnostics/available-counters
---

場面の第 3 段階は、二つの軸が完全に離れる瞬間です。流入が天井を越え、その瞬間から `out` は動かなくなります。容量に張り付くのですが、それが容量という言葉の意味だからです。線を越えた負荷はどこかへ行かねばならず、残っている場所は行列だけなので、セルが一つずつ埋まり `wait` も一緒に伸びます。サーバーは 100% なのに、終わらせている量はバーストが始まる 1 秒前とまったく同じです。満杯は速さではありません。満杯は遅さの始まる場所です。

これが saturation のすべてで、別の名前を持つに値する理由は、ここで utilization が情報を失うからです。天井より上では、流入が 1% 超過でも 3 倍超過でも `busy` は同じく 100% と読めるので、線形区間で警告してくれた数字はいまや平らで役に立ちません。まだ動くのは行列の深さで、天井をどれだけ越えたかに比例して動きます。USE メソッドが utilization と saturation を別々に求めるのはこのためです。前者は悪いということしか言わず、後者はどれだけ悪いかを言います。

飽和したシステムのレイテンシは、仕事そのものの性質ではなく、列の中の位置が作る性質です。処理に 20ms かかるリクエストも、すでに並んでいる全員の後ろで待つので、応答時間は行列の深さかける処理時間に自分の分を足した値になります。コードが遅くなったものは何もありません。場面はその計算をそのまま描いています。300ms ごとに一つ処理するサーバーの前に滞留が 5 単位あれば待ちは 1.5 秒で、少し前なら即座に終わっていたリクエストにも同じ 1.5 秒がかかります。「遅いエンドポイント」をプロファイルして直そうとしても何も出てきません。時間はそこで使われていないからです。

バーストが収まっても行列はひとりでに消えません。流入が容量とちょうど同じ値に戻ると、列は伸びるのをやめるだけです。届くより速くはけていくものがないので、滞留とそれが生む待ちはあった場所にそのまま残ります。第 3 段階と第 4 段階のあいだの拍がこれで、障害対応のときに人が繰り返し間違えるところでもあります。滞留を抜くには流入が容量より低いか、容量が流入より高いことが必要で、かかる時間を決めるのは二つの速度の差だけです。3 分かけて積み上がった列は、不均衡がちょうど反転したときに 3 分かかり、差がもっと小さければもっとかかります。

ですからスループットではなく深さと古さを見てください。スループットはいちばん遅れて動き、動いたときにいちばん役に立ちません。深さはバーストがあることを教え、いちばん古い項目の古さは、いまリクエストが実際に何を経験しているかを教えます。どちらも何かが壊れる前に動き、行列ができるどの層でも読めます。スレッドプールの行列、コネクションプールの待機者、ブローカーの遅れ、ディスクの行列長です。リクエストは遅いのにどの span も速く見えるなら、消えた時間はそのどれかにあります。

抜け道はちょうど二つで、場面の第 3 段階はそのどちらも選ばないので、ここではっきり名前を付けておく価値があります。天井を上げること、つまりボトルネックに容量を足すことです。ボトルネック以外は当てはまりません。あるいは流入を下げること、つまり捨てるか、絞るか、仕事を生み出している側を押し返すことです。残りはすべて置き場所の入れ替えです。大きな行列は時間を買うだけで、不均衡が短いバーストではなく続く状態なら、買えるのは同じ故障までの長い待ちだけです。そのとき中に入っている仕事は、もっと古びています。
