---
title: "Retry Queue"
summary: "再試行キューは、本流を止めないために失敗したメッセージを載せておく脇道です。試行ごとに伸びる遅延のあいだ預かってから列の後ろへ戻し、そうやって先頭詰まりをバックグラウンドで払うコストに変えます。"
category: "メッセージングとイベント処理"
scene: poison-message
sceneStep: 3
related:
  - label: Poison Message
    slug: poison-message
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: At-Least-Once
    slug: at-least-once
  - label: Work Queue
    slug: work-queue
  - label: Competing Consumers
    slug: competing-consumers
  - label: Exactly-Once
    slug: exactly-once
  - label: Backpressure
    slug: backpressure
references:
  - title: Service Bus message sequencing and scheduled delivery
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/message-sequencing
  - title: MassTransit exceptions and redelivery
    url: https://masstransit.massient.com/concepts/exceptions
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
---

シーンの 3 番目のステップが始まる瞬間を見てください。失敗したメッセージがコンシューマーから横へ運び出され、本流はすぐに回復します。止まっていたキューが 1 件ずつ抜けていき、深さが減り、10 秒のあいだのぼり続けていた待ち時間が下がります。悪いメッセージ自体は何も変わっていません。変わったのは、それがもう先頭にいないという事実だけで、再試行キューの値打ちはそれがすべてです。先頭詰まりは失敗が起こすのではありません。ほかの全員が待っている場所でその失敗を再試行することが起こします。

仕掛けは遅延 1 つと、戻ってくる地点 1 つです。メッセージをコンシューマーが読んでいない場所へ移し、タイマーを掛け、タイマーが鳴ったら先頭ではなく末尾でキューに再合流させます。末尾へ戻すことは遅延と同じくらい重要です。先頭へ戻せば、タイマーが切れた瞬間に壁を建て直したのと同じです。遅延は試行ごとに伸びます。シーンで 1 つ目のリングが 5 秒だったあと 2 つ目が 15 秒で上がってくるのは、そのことを表しています。ここでのバックオフは、苦しんでいる下流への礼儀でもありますが、それだけではありません。メッセージ 1 つがコンシューマーの注意をどこまで持っていってよいかという予算です。

作り方はよくある 3 つです。予約配信を持つブローカーなら、未来の時刻でメッセージを自分自身へ送ればよく、Azure Service Bus がそれを提供します。使えるなら一番安上がりです。メッセージ単位の有効期限と本キューを指すデッドレター先を持つ専用キューを置けば、期限切れがそのまま再合流になります。RabbitMQ の古典的な構成です。あるいはバックオフの段ごとに遅延キューを 1 つずつ用意し、試行番号に合うキューへ送ります。ログにはメッセージ単位のタイマーがないので、Kafka 界隈はたいていこうします。3 つとも形が同じで、罠もおおむね同じです。再配信されたメッセージはブローカーから見ればたいてい新しいメッセージなので、配信回数がまた 1 から始まります。例外は RabbitMQ の構成で、デッドレターへ送られるたびに `x-death` の項目が付き、その `count` がキューと理由ごとに積み上がるので、それを読めば足ります。Service Bus の予約した写しや Kafka の再試行トピックでは、試行番号を自分でヘッダーに載せなければ、4 番目のステップが頼りにしている予算はいつまでも尽きません。

最後に正直でいるべきなのは、再試行キューが直さない部分です。毒メッセージを成功させてはくれませんし、もしかしたら成功するかもしれないという前提で調整してはいけません。遅延のはしごが数時間まで伸びると、決して成功しないメッセージが数時間システムに残り、試行のたびに枠を 1 つ、アラートを 1 つ、誰かの注意を食べます。失敗をまず分類してください。恒久的なエラーは再試行キューに入るべきですらなく、最初の試行でそのままデッドレターキューへ行くべきです。再試行キューは、あとで成功する見込みが本当にあるメッセージのためのものであり、その見込みを試しているあいだ本流に時間を買い戻してやるためのものです。
