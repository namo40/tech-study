---
title: "Consumer Acknowledgement"
summary: "コンシューマーの確認応答 (ack) は、作業が終わったとブローカーに伝える合図であり、メッセージをキューから消すのもこの合図です。それが届くまでメッセージの持ち主はブローカーのままで、ブローカーはそれを別のコンシューマーに渡します。"
category: "メッセージングとイベント処理"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: At-Least-Once
    slug: at-least-once
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Work Queue
    slug: work-queue
  - label: Retry
    slug: retry
  - label: Web Queue Worker
    slug: web-queue-worker
references:
  - title: RabbitMQ consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: Message transfers and locks in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
---

メッセージを配信することと、メッセージを終えることは別々の出来事で、確認応答は後者にあたります。コンシューマーがメッセージを取ってもブローカーはそれを消しません。そのコンシューマーに配信したと印を付けたまま、確認応答が届くか配信が失われるまで保持し続けます。処理の途中でコンシューマーが死んでも失うのが時間だけで済むのはこのためです。接続が切れるとブローカーは終わっていない配信に気づき、メッセージをキューの先頭に戻して空いているコンシューマーに渡します。ちょうど 1 回の配信が提供されない理由も同じ構造にあります。コンシューマーが作業を終え、確認応答がプロセスを出る直前に落ちることがありますが、ブローカーからはそれと何もせずに落ちた場合の区別が付かないので、再配信します。

ここから出てくる規則は 1 つです。確認応答は作業とその副作用が永続化されたあとに送り、その前には送りません。受け取った時点で自動的に確認応答を返す設定は、あらゆる障害、あらゆるデプロイ、あらゆる OOM kill を静かにメッセージの紛失へ変えてしまいますが、思ったより多くのクライアントでこれが既定値です。ハンドラーが気づけた失敗には否定応答を返し、そこでキューに戻すか dead-letter queue に送るかを選びます。次の試行では通るかもしれないものは戻し、通る見込みがないものは dead-letter queue に送ります。ブローカーが配信回数を数えてくれるのでこの判断は任せられますし、ハンドラー側でもその回数を読む価値があります。2 回目の試行は、ログを厚くして仕事を減らすのによい頃合いだからです。

prefetch は、1 つのコンシューマーが確認応答しないまま同時に抱えられるメッセージ数を決める設定で、競合するコンシューマーを 1 つのコンシューマーに戻してしまう設定でもあります。prefetch が 1 なら、空いているコンシューマーが必ず次のメッセージを受け取り、バッファーはキューだけになりますが、メッセージごとに往復が 1 回かかります。prefetch が 100 なら、隣が遊んでいる間に 1 つのコンシューマーが 100 件を自分のメモリに引き込めますし、そのコンシューマーが死ねば 100 件すべてが再配信されます。メッセージが小さくて均一で、往復がボトルネックなら値を上げ、メッセージごとにコストがばらつくなら低いままにします。メッセージを公平に分けたことは、仕事を公平に分けたことにはならないからです。
