---
title: "Deduplication"
summary: "重複排除は、すでに処理した id を覚えておき、同じ id で届いたものを捨てる仕組みです。少なくとも 1 回の配信を、意図 1 つに効果 1 つへ変える方法がこれです。"
category: "API とリアルタイム通信"
scene: idempotency-key
sceneStep: 2
related:
  - label: Idempotency Key
    slug: idempotency-key
  - label: Idempotency
    slug: idempotency
  - label: Message ID
    slug: message-id
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: TTL
    slug: ttl
  - label: Unique Constraint
    slug: unique-constraint
  - label: Retry
    slug: retry
  - label: Web Queue Worker
    slug: web-queue-worker
references:
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: The Idempotency-Key HTTP Header Field (IETF draft)
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
---

重複排除は、id のストアが 1 つと規則が 1 つです。この id がすでにストアにあるなら今回の到着は繰り返しなので、作業をやり直さない。id は送る側が付けなければなりません。2 回の到着が 1 つの意図だと知っているのは送る側だけだからです。HTTP では `Idempotency-Key` ヘッダーが、キューではメッセージ id が、ブローカーが再配信のたびに新しいメッセージ id を作る場合は本文の中の業務 id がその役目を負います。重複を捨てるだけなら id を保存すれば足ります。結果も一緒に保存すれば、重複に沈黙ではなくきちんとした答えを返せます。黙って流すコンシューマーと、最初の 201 をそのまま返す API の違いはここで生まれます。

ストアがどこにあるかが、実際に何を守るのかを決めます。ブローカー自身も重複を落とせますし、Azure Service Bus は設定した期間内にすでに見た `MessageId` のメッセージを破棄します。ただしそれが覆うのはブローカーから見える重複だけです。コンシューマーが効果を出したあと確認応答の前に落ちて、同じ仕事が 1 回配信され 2 回処理される状況には何の役にも立ちません。あなたの効果を守るストアは、その効果のすぐ隣にあるストアであり、できれば同じトランザクションの中にあるべきです。そうすれば「処理済み」の記録と実際の作業は、両方起きるか両方起きないかのどちらかになります。業務テーブルに張った一意制約はこのやり方のいちばん安い形で、別のストアがそもそも要りません。

重複排除のストアはどれも、期限の付いた約束です。id を永久に持ち続ければ誰も予算を取っていないテーブルが増え続けるので、id には寿命を与えます。そしてその寿命が保証の実際の範囲になります。その外では、重複と新しいリクエストは区別できません。送る側がどれだけ長く再試行しうるか、ブローカーがどれだけ長く再配信しうるかに合わせて決め、余裕を足し、その数値を書き留めます。ここを誤ると、遅れて届いた重複が新しい仕事として処理される形で表に出るからです。確保も原子的でなければなりません。読んでから書くのではなく、衝突したら失敗する INSERT である必要があります。そうでないと、同じ瞬間に届いた 2 つの複製が並んで空のストアを見て、どちらも進んでしまいます。
