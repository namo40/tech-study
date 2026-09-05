---
title: "Throttling"
summary: "サービスを守るために速度を絞り、機能も絞る方法です。上限は壊れてから現れる数字ではなく、システムが実際にさばける量から選んだ設計値です。"
category: "回復性と障害対応"
scene: fallback
sceneStep: 3
related:
  - label: Fallback
    slug: fallback
  - label: Load Shedding
    slug: load-shedding
  - label: Rate Limiter
    slug: rate-limiter
  - label: Graceful Degradation
    slug: graceful-degradation
  - label: Bulkhead
    slug: bulkhead
  - label: Request Timeout
    slug: request-timeout
  - label: Tail Latency
    slug: tail-latency
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Retry
    slug: retry
  - label: Cache-Aside
    slug: cache-aside
references:
  - title: "Throttling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
  - title: "Rate limiting middleware in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit
  - title: "Fallback resilience strategy (Polly)"
    url: https://www.pollydocs.org/strategies/fallback.html
---

3 番目のステップで `throttle` のチップは `shed` より半秒早く灯り、その順番に意味があります。Throttling はサービスが毎秒どれだけの仕事を受けるかを決める判断で、Load Shedding はその量を超えたものに起きることです。片方はポリシーで、もう片方はそのポリシーの帰結です。前者なしに後者だけを持つサービスは、誰も選んでいない数字に従ってリクエストを断っていることになります。

その数字が設計のすべてです。スロットリングの上限は、どれだけのトラフィックが来そうかという推測ではなく、レイテンシの目標を守りながらシステムがさばける量についての言明であり、正直に得る方法は測ることしかありません。応答時間の曲線が折れるまで負荷試験を回し、スループットが最大になる点ではなく曲線が折れる点の速度を記録し、上限をそれより少し下に置きます。この区別が大事なのは、折れ点を過ぎたサービスもしばらくはスループットが伸び続けて見えるからです。だからスループットのグラフから選んだ容量は、たいてい何も速くない地点の容量になります。

Throttling には表に出にくい第二の形があり、シーンはその両方を見せます。毎秒の費用を減らす 1 つの方法は速度を絞ることで、もう 1 つはリクエスト 1 件がする仕事を減らすことです。負荷がかかった状態で推薦サービスが落ちていると分かっているとき、サービスは結果の見えている呼び出しに接続とスレッドとタイムアウトを使う代わりに、その呼び出し自体をやめます。付加情報を切る、画像の解像度を下げる、結果を 100 件ではなく 20 件返す、高くつくパーソナライズの問い合わせを飛ばす、そのどれもが Throttling です。仕事の件数ではなく、仕事 1 件の費用を変えるからです。たいていは機械を増やすより安く、数分ではなく数秒で使えます。

上限がどこにあるかが、何を守れるかを決めます。クライアント側の上限は依存先を守りますが自分は守りません。それを無視するクライアントはどのみち到着するからです。ゲートウェイの上限は全体を守り、デプロイなしで変えられますが、個々のインスタンスがどれだけ忙しいかは知りません。プロセス内の上限はそれを正確に知っており、誰かがサービスを直接呼んだときにも生き残る唯一の上限です。自分の成功に耐えるシステムはたいてい 3 つとも持ち、外側が先に効いて内側が最後の防壁になるように大きさを決めています。

スロットリングのもう半分は、クライアントに伝えることです。黙って断る上限は障害と区別がつきません。呼び出し側が動ける状態コードを返してください。「この呼び出し元の取り分を超えました」は `429`、「サービス全体が容量を超えました」は `503` で、どちらにも `Retry-After` を付けます。上限は文書に書き、呼び出し側が身内なら残りの許容量をヘッダーで出し、うるさい相手には断り始める前に知らせます。上限をめぐる不愉快なやりとりは、ほとんどが知らされずに発見された上限についてのやりとりです。

最後に、スロットリングは Bulkhead ではなく、混同すると穴が残ります。スロットリングは到着する速度の上限で、Bulkhead は呼び出し側 1 つ、あるいは依存先 1 つが共有資源を同時にどれだけ握れるかの上限です。毎秒リクエスト数の上限には余裕があるのに、スレッドプール全体が遅い下流の呼び出し 1 つに縛られていることはあります。2 つは互いを補うもので、このシーンの隣に両方が並んでいるのは、過負荷が 1 つの姿だけでやって来ることがめったにないからです。
