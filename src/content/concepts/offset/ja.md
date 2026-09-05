---
title: "Offset"
summary: "共有ログに挟んだしおりです。1 つの購読がどこまで読んだかを示す位置で、ログではなく読む側が持ちます。だから同じイベントを 2 人の読者が別々の場所で読んでも、どちらも相手を止めません。"
category: "メッセージングとイベント処理"
scene: publish-subscribe
sceneStep: 2
related:
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Checkpoint
    slug: checkpoint
  - label: Event Stream
    slug: event-stream
  - label: Ordering
    slug: ordering
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Work Queue
    slug: work-queue
  - label: Event Sourcing
    slug: event-sourcing
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: EventPosition (Event Hubs)
    url: https://learn.microsoft.com/en-us/dotnet/api/azure.messaging.eventhubs.consumer.eventposition
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

offset はしおりであり、シーンの 2 番目のステップはそれを誰が持つのかという話です。ログはイベントを 8 つ抱えたまま、どれも手放しません。購読が読んだときに変わるのはログではなく、その購読の名前の下にある数字と、セル 1 つの下に置かれた棒です。A は最新のイベントと並び、B は 2 つ遅れ、2 つのしおりは同じログの違う場所に同時に挟まっています。配信が何も取り出さないからこそ成り立ちます。

ここがトピックとキューの分かれ目で、正確に言っておく値打ちがあります。ワークキューでは状態をブローカーが持ちます。誰かが処理しているあいだメッセージはロックされ、ack（確認応答）すれば消えるので、キューの中身はコンシューマーが何をしたかで決まります。ログではブローカーはイベントだけを持ち、位置はコンシューマーがそれぞれ持ちます。B の位置はログのどこにも現れず、A の位置は B の中に現れないので、キューでよくあるあの失敗、つまり遅いコンシューマー 1 つがロックの後ろに全員を並ばせることが起きる場所そのものがありません。代償は、残りの仕事量をブローカーが教えてくれなくなることです。その値はログの先頭から offset を引いて求めるもので、通知を仕掛けるべき値もそれです。

offset は「開始」が何を意味するかも決めます。保存された位置を持たない購読には始点を教える必要があり、この選択は既定値のまま流してよい場所ではありません。`EventPosition.Earliest` は保持期間がまだ握っているものをすべて再生し、`EventPosition.Latest` は今から届くものだけを受け取ります。特定の区間を処理し直したいときのために、シーケンス番号や投入時刻から導く位置もあります。Kafka では同じ判断が `auto.offset.reset` という名前を持ちます。どちらに間違えても結果は控えめではありません。履歴を処理し直す用意のないサービスに `Earliest` を渡せばそのまま溺れ、新しいプロジェクションに `Latest` を渡せば、過去があるはずの場所に静かな穴が残ります。

このしおりが説明で終わらず役に立つのは、2 つの性質のおかげです。前にしか動かないので、配信は常に次のイベントであって飛躍ではありません。そして一度通り過ぎた場所は、誰かが意図して巻き戻さないかぎり通り過ぎたままです。もう 1 つは動かす値段の安さで、動かす作業がブローカーへのメッセージではなく算術だからです。安くないのは再起動を越えて生き延びさせるほうで、それは名前の違う別のものです。checkpoint とは、どこか永続的な場所に書き留めた offset のことです。シーンで 2 つをわざと離して描いた理由がここにあります。B の offset は B のメモリーにあり、B の checkpoint はそうではなく、その差こそ 3 番目のステップが語るものです。
