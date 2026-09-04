---
title: "Bounded Concurrency"
summary: "同時に走ってよい処理の数を決めておく方法です。バックプレッシャーが上流へ伝わる通路であり、上限に達すると次の呼び出し元が待ち、その待ちが発生源まで届きます。"
category: "回復性と障害対応"
scene: backpressure
sceneStep: 3
related:
  - label: Backpressure
    slug: backpressure
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Batching
    slug: batching
  - label: Concurrency Limiter
    slug: concurrency-limiter
  - label: Bulkhead
    slug: bulkhead
  - label: Thread Pool
    slug: thread-pool
  - label: Rate Limiter
    slug: rate-limiter
  - label: Web Queue Worker
    slug: web-queue-worker
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
references:
  - title: "System.Threading.Channels"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
  - title: "BoundedChannelOptions class"
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.channels.boundedchanneloptions
  - title: "Queue-Based Load Leveling pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
---

場面の 3 段階目は、バッファが遠慮をやめる瞬間です。満杯で、差し出せるものが何も残っておらず、育つ代わりに生産者を待たせます。`admits` の数が 8 から 3 へ下がるのが、その待ちが上流へ伝わる姿です。同時に走れるものが減るので始まるものが減り、流入の速さは消費者が実際にこなせる量まで落ちます。ここで何も速さを測っていないこと、何も遅くなるよう設定されていないことに注目してください。上限は個数であり、その個数が埋まり、ペースはそこから自然に出てきます。

深さがスループットより良い信号であるのと同じ理由で、個数は速さより良い制御です。フィードバックが閉じているからです。速さの上限は、下流がどれだけ速く動けるかについての推測であり、今日がどうなるか知らなかった誰かが前もって設定ファイルに書いたものです。同時実行の上限は推測しません。下流が遅くなれば許可 1 つが長く握られ、毎秒解放される許可が減り、出せる速さは下流が遅くなった分だけ正確に落ちます。指標も制御器も配備もなく、自動的にそうなります。リトルの法則が仕組みのすべてです。許可が N 個で平均処理時間が L なら、出せる速さは N 割る L であり、L はあなたではなく現実が測ります。

その自己修正は同時に落とし穴でもあります。同時実行に上限を置くことは、遅延に上限を置くことではないからです。20 ミリ秒から 4 秒に落ち込んだ依存先に許可 8 つを掛けても 8 つは通り、その後ろで待つ呼び出し元は非常に長く待ちます。ですから許可には個数だけでなく期限も要ります。待ち自体へのタイムアウトがあれば、すぐに入れない呼び出し元は永遠に立たされる代わりにそう告げられ、仕事へのタイムアウトがあれば、戻ってこないものが許可を握り続けることはありません。両方がなければ、リミッターは遅い依存先を待ち手の無限キューに変えます。防ぐために入れたはずの、まさにその壊れ方です。

上限をどこに置くかが、何を守るかを決めます。依存先の周りに置けばバルクヘッドです。遅い 1 つがプロセスのスレッドを食い尽くさないようにするのが目的で、正しい数はその依存先の容量から出ます。場面のように発生源に置けばバックプレッシャーです。システムが片付けられる速さより速く仕事が生まれないようにするのが目的で、正しい数は後ろにあるバッファから出ます。同じ道具、逆の理屈なので、いま自分がどちらの話をしているかを知っておく価値があります。続く数字が変わるからです。

数の選び方は見た目ほど不思議ではありません。最初に尽きる資源から始めます。プールの接続、コア、取引先が文書に書いた同時呼び出し数などです。上限をそこに合わせるか、少し下に置きます。本当の制約より大きい上限は、待ち行列を見えにくい場所へ移す以外に何もしないからです。次に、望む遅延に照らして算数を確かめます。N 割る L が実際に出る速さで、それが必要な値をはるかに下回るなら、答えはより大きな N ではなく、より速い消費者か、より多くの消費者です。飽和した依存先に対して N を上げても、買えるのはスループットではなく行列です。

最後に、リミッターは見えていなければなりません。使用中の許可、待っている呼び出し元、待った時間。この 3 つの数字が「システムが遅い気がする」を「6 分間ずっと上限に張り付いている」に変えます。場面がそれらを描くのは、誰にも見えない上限は不具合と見分けがつかないからです。仕事は届いているのにプロセスは忙しくなく、8 つがすでに走っていて 9 つ目が入口に立っていることを、ログの何も語ってくれません。
