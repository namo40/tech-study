---
title: "Transactional Outbox"
summary: "Transactional Outbox は、業務上の変更と、その変更が意味するメッセージを 1 つのローカルトランザクションでまとめて書き、発行はあとからリレーに任せる方式です。ブローカーが落ちていてもよく、リレーが落ちて再試行してもかまいません。メッセージは失われることも、ありもしない出来事として作られることもなく、ただときどきもう一度届くだけです。"
category: "分散トランザクションとメッセージ整合性"
scene: transactional-outbox
steps:
  - title: "トランザクションのない 2 回の書き込み"
    text: "注文をコミットしてからイベントを発行しようとしたら、ブローカーが落ちています。注文はテーブルに入っているのに、外の世界はその知らせを聞けません。順序を逆にすると、コミットは失敗したのに、存在しない注文のイベントだけが残ります。"
  - title: "1 つのトランザクション、2 つの行"
    text: "変更と、その変更が意味するメッセージを一緒に書きます。注文は注文テーブルへ、イベントは outbox へ、コミットは 1 回です。失敗すれば注文もメッセージもありません。成功すればメッセージはすでに存在し、ブローカーが落ちていてももう問題になりません。"
  - title: "リレーが再試行するので、配信は at-least-once です"
    text: "リレーは pending の行を読んで発行し、sent と記します。発行と記録の間で落ちると、再起動のあと同じ id の同じメッセージがもう一度出ていきます。コンシューマーは重複を見ることはあっても、抜けを見ることはありません。"
  - title: "順番に、まとめて、片づけながら"
    text: "outbox はログです。行は挿入した順にまとまって出ていき、送り終えた行は整理します。ポーリングが重くなったら change data capture がデータベースのログを代わりに読み、リレーはインフラの中へ消えていきます。"
related:
  - label: Saga
    slug: saga
  - label: Choreography
    slug: choreography
  - label: Orchestration
    slug: orchestration
  - label: Idempotency Key
    slug: idempotency-key
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Deduplication
    slug: deduplication
  - label: Message ID
    slug: message-id
  - label: Change Data Capture
    slug: change-data-capture
  - label: Competing Consumers
    slug: competing-consumers
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Local Transaction
    slug: local-transaction
references:
  - title: Transactional Outbox pattern with Azure Cosmos DB
    url: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
  - title: Using transactions (EF Core)
    url: https://learn.microsoft.com/en-us/ef/core/saving/transactions
  - title: Transactional Outbox (MassTransit)
    url: https://masstransit.massient.com/concepts/outbox
  - title: Implementing event-based communication between microservices
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events
---

## いつ使うか

- 1 つの操作が状態を変え、同時に外へ知らせなければならないときに使います。注文が入る、アカウントが作られる、決済が確定する、文書が承認される。そういう瞬間です。この 2 回の書き込みは切り離してはならず、ブローカーの前でいくら再試行しても 2 つをまとめてはくれません。
- この方式が答えるのは二重書き込みの問題であって、遅いメッセージングの問題ではありません。イベントがあれば便利という程度なら、あるいは受け取る側が問い合わせて作り直せるなら、テーブルを 1 つ増やしてそれを空にするリレーを持つのは、ただの維持費です。

## 注意点

- outbox は変更と同じデータベースにあり、同じトランザクションが書かなければなりません。データベースを別に置く、コネクションを別に張る、保存のコールバックから発行を呼ぶ。どれをやってもテーブルが 1 つ増えただけの元の場所に戻ります。
- この方式が買ってくれるのは at-least-once の配信であって、exactly-once ではありません。リレーはメッセージを発行し、発行したという記録を残す前に落ちることがあり、あとを継いだリレーは同じ id でもう一度発行します。コンシューマー側を先に設計します。変わらないメッセージ id、すでに処理したものを書き留める記録、そして同じメッセージがもう一度来たときに何をしてよいかの規則が要ります。
- 順序を守って発行するとその分だけスループットを手放しますし、挿入順はコミット順ではありません。並行する 2 つのトランザクションでは小さい id のほうが後にコミットされることがあり、「最後に送った id より大きいもの」を前へ辿るリレーはその行を永久に飛ばします。代わりに状態カラムかリースで pending の行をつかんでください。コンシューマーが 1 つの注文や 1 つのアカウントの中でのイベント順序を気にするなら、そのキーの中だけ直列にし、それ以外はリレーにまとめさせます。
- リレーが 2 台で同じテーブルをポーリングすると、つかむ動作がロックでない限り同じ行を一緒につかみます。`SELECT ... FOR UPDATE SKIP LOCKED`、短いリースを持つ所有者カラム、リーダーを 1 台だけ選ぶ方式。この 3 つがよくある答えで、台数を増やすサービスなら初日からどれか 1 つが要ります。
- 行はトランザクションが書くので、そのコードの形をそのまま抱えます。本文はドメインエンティティをシリアライズした結果ではなく、明示的な契約として保ちます。そうしないと、一度のデプロイがコンシューマーに読めない形を渡してしまいます。
- ポーリングには下限があります。1 秒ごとに起きるリレーはレイテンシを 1 秒足し、インスタンスごとに毎秒 1 回の問い合わせを足します。間隔を縮めても、片方の費用をもう片方の費用に付け替えるだけです。どちらも受け入れられなくなったら、change data capture がデータベースのログを代わりに読み、テーブルはもうポーリングされません。
- 2 つの数を見ます。まだ pending の行が何件あるか、そのうち一番古いものがどれだけ待っているかです。pending が増える一方で減らないなら、パイプラインが止まったという最も早い合図であり、イベントが来ないという声が下流から上がるよりずっと前に見えます。
- 送り終えた行をどう片づけるかは、必要になる前に決めておきます。outbox はテーブルの姿をしたキューであり、誰も整理しないテーブルはやがてそのデータベースで一番大きなテーブルになります。

## .NET では

EF Core なら、エンティティと outbox 行を同じ `DbContext` に入れて `SaveChanges` 1 回でコミットするか、複数の呼び出しをまとめてコミットさせたいときは `BeginTransaction` で明示的に囲みます。リレーはたいてい `BackgroundService` にして、pending の行をバッチでつかんで発行し、sent と記します。このとき PostgreSQL なら `FOR UPDATE SKIP LOCKED`、SQL Server なら `WITH (UPDLOCK, READPAST, ROWLOCK)` を使い、2 つのインスタンスが同じ行をつかまないようにします。MassTransit はこの流れを自分の `DbContext` の上で扱う outbox を用意しているので、自作するつもりでも一度読む価値があります。ポーリングの費用が大きくなりすぎたら、SQL Server の change data capture や Debezium のコネクタがログを代わりに読み、リレーはサービスの一部ではなくインフラの一部になります。
