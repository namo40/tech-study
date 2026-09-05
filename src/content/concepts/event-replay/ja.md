---
title: "Event Replay"
summary: "保存されたイベントを順に畳み込み関数へ流し、状態へたどり着くことです。再起動した集約が自分を組み立て直す方法であり、read model を一から作り直す方法であり、昔の姿を覗く方法です。"
category: "アプリケーションアーキテクチャ"
scene: event-sourcing
sceneStep: 2
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Snapshot
    slug: snapshot
  - label: Aggregate
    slug: aggregate
  - label: Projection
    slug: projection
  - label: Read Model
    slug: read-model
  - label: Materialized View
    slug: materialized-view
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Change Data Capture
    slug: change-data-capture
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "How to serialize and deserialize JSON in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to
  - title: "CQRS pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
---

シーンの 2 番目のステップは、わざと集約を消します。`items` が 0 に落ち、`paid` バッジが消え、しばらく Order は何も知りません。それから読み取りがログ側から 1 つずつ渡ってきて、同じ状態が最初に育ったのと同じ順で育ち直します。復旧されたものはありません。失ったものがなかったからです。状態はもともと記録ではなかったので、それを消しても失われる情報はありません。

考えの全体はこれだけで、聞こえるより小さいものです。再生は `events.Aggregate(seed, Apply)`、つまり順序のあるリストの上の畳み込みです。面白い工学は繰り返しの中ではなく、その繰り返しが必要とする 2 つの性質にあります。イベントはストリームの中で全順序を持つ必要があり、順番はそのためにあります。そして `Apply` は状態とイベントだけの純関数である必要があり、それが畳み込みを繰り返し可能にします。同じイベントを同じ順で入れれば、今が何時でも、隣で何が動いていても、何度目であっても、いつも同じ答えが出なければなりません。

2 つ目の性質のほうが壊れやすく、壊れ方はいつも同じです。誰かが `Apply` の中に副作用を入れます。メール、Webhook、決済代行への呼び出し、保存までされてしまう `DateTime.UtcNow` のようなものです。そして本番での最初の全再構成が、去年入った注文 4000 件に確認メールを送ります。ルールは絶対で、壁に貼っておく価値があります。イベントを適用することはメモリーを変え、それ以外は何も変えません。イベントに反応する処理 (メールが属するのはこちらです) は、新しいイベントだけを見て、ストリームの中の自分の位置を知っている購読者の中で起きます。再生は前者だけを辿り、後者には触れません。

畳み込みを早めに止めれば時間旅行になります。シーンは `seq 2` までだけ再生し、そこで届いた状態を保って見せます。これは誰かが別に作った機能ではなく、ログにもともと入っていたものです。「支払いの前にこの注文はどんな姿だったか」は前半に対する畳み込みであり、「誰がいつ変えたか」はその間のイベントに付いたメタデータです。現在状態だけを保存するシステムは、この種の問いに、誰も信じていないトリガー製の履歴テーブルを大量に持ち出して答えます。ログはいつもより少ない仕事で答えます。

再生は read model を直す方法でもあります。projection も畳み込みなので、そこにあるバグはテーブルを消し、保存された位置を 0 に戻し、ログをもう一度流せば直ります。マイグレーションも、バックフィルのスクリプトも、どの行が間違いかという推論もありません。ビューが多いシステムで Event Sourcing が元を取る性質はこれです。導出データが捨ててよいものになり、捨ててよいデータは腐りません。そしてこれは、projection の位置をその projection が書く行と同じトランザクションに入れておくべき理由でもあります。バッチの途中で死んだ購読者が、飛ばしも二重適用もせずに再開できます。

代償は時間であり、時間はログとともに育ちます。イベント 50 個のストリームはすぐ再生されますが、20 万個のものはそうはいきません。コマンドのたびに組み立て直す必要のある集約なら、それを体感します。スナップショットが和らげるために存在する圧力はこれであり、スナップショットが何を変えるのかははっきりさせておく価値があります。スナップショットは再生を短くするだけで、再生を不要にはしません。状態の定義は依然として畳み込みであり、スナップショットから出発する再構成は種が違うだけの同じ繰り返しです。
