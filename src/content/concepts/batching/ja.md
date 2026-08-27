---
title: "Batching"
summary: "いくつかをまとめて一度に処理する方法です。遅延を渡してスループットを買う取引なので、件数の上限と待ちの上限が両方要ります。そして、キューには決してなれない直し方です。"
category: "回復性と障害対応"
scene: backpressure
sceneStep: 4
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bulkhead
    slug: bulkhead
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

場面の 4 段階目は、算数そのものを変える唯一の一手です。消費者が一度に 4 つずつ取り始めると排出の速さが倍になり、同じスパイクが来ても深さは床からほとんど浮き上がりません。システムのほかは何も変わっていません。生産者は前とまったく同じだけ送り、バッファは同じ 8 セルで、前の段階はそのまま繰り返されます。違うのは、遅かった側がそこまで遅くなくなったことだけで、前の 3 段階のあらゆる問題は、その 1 つの事実の言い換えでした。

まとめ処理が勝つのは、項目ごとの費用の大半が、実は項目ごとではないからです。往復 1 回には固定の値段があります。ネットワークの 1 ホップ、TLS レコード、コマンドの解析、トランザクションの開始と確定、ロックの取得と解放、書き出されるログ 1 行。その値段は、載っているのが 1 行でも 500 行でも 1 回しか払いません。500 行を `SqlBulkCopy` 1 回、`SendMessagesAsync` 1 回、一括インデックス要求 1 回で送れば、固定費を 500 回ではなく 1 回だけ払うことになります。項目ごとの仕事はまだそこにあり、まだ本物です。崩れるのは付帯費用で、たいていのシステムではその付帯費用こそが大半でした。

代金は遅延で、それを払うのはまとまりの中で最初に来た項目です。まとまりが空のときに届いた項目は、まとまりが埋まるまで待ちます。だからまとまりには上限が 1 つではなく 2 つ要ります。最大の件数と最大の待ち、そして先に来たほうを取ります。待ちの上限がなければ、静かな時間が停止に変わります。3 件が届き、4 件目が来ず、その 3 件は流量が戻るまでそこに座ったままです。ちょうど誰も見ていないときにです。上限があれば、遅い 1 分が各項目に払わせるのは窓の長さまでで、その窓は遅延の予算の隣に書いて守れる数字です。

まとまりの大きさも、ある点を越えればただではありません。大きくすれば抱えるメモリが増え、トランザクションが長くなり、ロックが長くなり、再試行が大きくなり、失敗が粗くなります。500 件のまとまりで 1 件が壊れているとき、500 件すべてを失敗にするのか、まとまりを半分に割るのか、悪い 1 件だけを隔離するのかを誰かが決めなければなりません。最初の不良行が出ている最中ではなく、出る前に決めてください。魅力的に見える答え、つまり「まとまりごと再試行」こそ、毒入りメッセージ 1 件を無限ループに変え、そのたびに罪のない 499 件まで道連れにする道だからです。

まとめ処理は再実行の安全性とも絡みます。一部だけ適用されたまとまりは例外ではなく普通の場合だからです。400 件を確定している途中で落ちたプロセスは、もう一度動かしても安全でなければならず、そのためには項目に鍵が要り、書き込み先が繰り返しに耐える必要があります。少なくとも 1 回の配送を使うパイプラインならどのみち必要な条件ですが、まとめ処理はそれをより大きな声で言います。「一部が残った」と「全部が残った」の間の隙間が、1 件分ではなく 400 件分の幅になるからです。

場面がこの段階を最後に置くのは、これが正直な直し方で、もう一方はそうでないからです。埋まり続けるキューを前にして魅力的に見える変更はキューを大きくすることで、それは効きます。バッジは点かなくなり、警報は鳴らなくなり、ほかは何も良くなりません。待ちは長くなり、メモリは大きくなり、真実の瞬間は避けられるのではなく先送りされます。まとめ処理、消費者を増やすこと、消費者を速くすること。これらは速さを変え、そもそも間違っていたのは速さだけでした。より大きなキューは、より長い嘘にすぎません。
