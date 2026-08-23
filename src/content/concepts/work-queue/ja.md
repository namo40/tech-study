---
title: "Work Queue"
summary: "Work Queue は、リクエストを受け取る層と実際に処理を行う層のあいだに置く緩衝材です。両者がそれぞれの速度で動けるようになり、ピークは失敗ではなく未処理の滞留に変わります。"
category: "アプリケーションアーキテクチャ"
scene: web-queue-worker
sceneStep: 2
related:
  - label: Web-Queue-Worker
    slug: web-queue-worker
  - label: Background Job
    slug: background-job
  - label: Competing Consumers
    slug: competing-consumers
  - label: Queue-Based Load Leveling
    slug: queue-based-load-leveling
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Azure Service Bus
    slug: azure-service-bus
  - label: RabbitMQ
    slug: rabbitmq
references:
  - title: Queue-Based Load Leveling pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling
  - title: Competing Consumers pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers
  - title: System.Threading.Channels
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/channels
---

キューは 2 つの層を時間軸のうえで切り離します。Web 層はジョブを 1 件書き込んだらそこで手を離し、ワーカーは余裕ができたときにそれを読み取ります。どちらの層も相手のいちばん忙しい 1 分に合わせて容量を用意する必要がなくなり、リクエストが成功するかどうかを到着レートが決めることもなくなります。そのうえ、本当に見るべき指標が 1 つ手に入ります。キューの深さと、最も古いメッセージの経過時間です。上がり続けて下がってこない深さは一時的なスパイクではなく、ワーカーが恒常的に足りていないという意味ですが、CPU のグラフはそれをここまではっきりとは教えてくれません。

キューの永続性は、キューを保持している側の永続性と同じです。`System.Threading.Channels` はプロセス内のキューを提供し、開発環境や、失っても構わない処理にはよく合います。再起動すれば中に残っていたものはすべて消えるからです。必ず残らなければならない処理は、Azure Service Bus や RabbitMQ のようなブローカーに置きます。すると 1 つだけ隙間が残ります。データベースへの書き込みとブローカーへの書き込みは、それぞれ別に失敗しうる 2 つの操作だという点です。業務データと同じトランザクションで書いておき、あとからブローカーへ中継する outbox テーブルが、その隙間を埋めます。

1 つのキューを複数のワーカーが読む形が competing consumers パターンであり、ワーカーを 1 つ足すことをスループットの変更だけで済ませてくれるのがこの構造です。代償は順序です。メッセージは順番にキューを離れますが、終わる順番はワーカーが終えた順番になるため、決して重なってはいけない 2 つのジョブには共有キューではなくパーティションキーが要ります。Azure Service Bus の session、RabbitMQ の consistent hash exchange、テナントごとのキューなどです。それ以外の場面ではワーカーどうしを競わせ、兄弟のどれが先に着いたかに左右されないハンドラーを書きます。
