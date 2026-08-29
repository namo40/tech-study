---
title: "Retry Queue"
summary: "再試行キューは失敗したメッセージを載せる脇道です。試行ごとに伸びる遅延のあいだ預かってから列の後ろへ戻し、そうやって先頭詰まりを背景で払うコストに変えます。"
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
    url: https://masstransit.io/documentation/concepts/exceptions
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
---

第三段が始まる瞬間を見てください。失敗したメッセージがコンシューマーから横へ運び出され、本流はすぐに回復します。止まっていたキューが一件ずつ抜けていき、深さが減り、十秒以上のぼり続けていた待ち時間が下がります。悪いメッセージ自体は何も変わっていません。変わったのは、それがもう先頭にいないという事実だけで、再試行キューの値打ちはそれがすべてです。先頭詰まりは失敗が起こすのではありません。ほかの全員が待っている場所でその失敗を再試行することが起こします。

仕掛けは遅延一つと、戻ってくる地点一つです。メッセージをコンシューマーが読んでいない場所へ移し、タイマーを掛け、タイマーが鳴ったら先頭ではなく末尾でキューに再合流させます。末尾へ戻すことは遅延と同じくらい重要です。先頭へ戻せば、タイマーが切れた瞬間に壁を建て直したのと同じです。遅延は試行ごとに伸び、一つ目が 5 秒だったのに二つ目のリングが 15 秒で上がってくる場面がその話です。ここでのバックオフは、苦しんでいる下流への礼儀でもありますが、それだけではありません。メッセージ一つがコンシューマーの注意をどこまで持っていってよいかという予算です。

作り方はよくある三つです。予約配信を持つブローカーなら、未来の時刻でメッセージを自分自身へ送ればよく、Azure Service Bus がそれを提供します。使えるなら一番安上がりです。メッセージ単位の有効期限と本キューを指すデッドレター先を持つ専用キューを置けば、期限切れがそのまま再合流になります。RabbitMQ の古典的な構成です。あるいはバックオフの段ごとに遅延キューを一つずつ用意し、試行番号に合うキューへ送ります。ログにはメッセージ単位のタイマーがないので、Kafka 界隈はたいていこうします。三つとも形が同じで、罠も同じです。再配達されたメッセージはブローカーから見ればたいてい新しいメッセージなので、配信回数がまた 1 から始まります。試行番号は自分でヘッダーに載せてください。そうしないと第四段が頼りにしている予算がいつまでも尽きません。

最後に正直でいるべきなのは、再試行キューが直さない部分です。毒メッセージを成功させてはくれませんし、もしかしたら成功するかもしれないという前提で調整してはいけません。遅延のはしごが数時間まで伸びると、決して成功しないメッセージが数時間システムに残り、試行のたびに枠を一つ、アラートを一つ、誰かの注意を食べます。失敗をまず分類してください。恒久的なエラーは再試行キューに入るべきですらなく、最初の試行でそのままデッドレターキューへ行くべきです。再試行キューは、あとで成功する見込みが本当にあるメッセージのためのものであり、その見込みを試しているあいだ本流に時間を買い戻してやるためのものです。
