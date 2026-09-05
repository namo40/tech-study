---
title: "Idempotent Consumer"
summary: "冪等なコンシューマーとは、同じメッセージを 2 回渡されても、1 回処理したあとと同じ状態にシステムを残せるコンシューマーのことで、at-least-once の配信に耐えられるようにするのがこの性質です。"
category: "メッセージングとイベント処理"
scene: competing-consumers
sceneStep: 3
related:
  - label: Competing Consumers
    slug: competing-consumers
  - label: Idempotency
    slug: idempotency
  - label: Idempotency Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Consumer Acknowledgement
    slug: consumer-acknowledgement
  - label: At-Least-Once
    slug: at-least-once
  - label: Unique Constraint
    slug: unique-constraint
  - label: TTL
    slug: ttl
references:
  - title: Idempotent Receiver (Enterprise Integration Patterns)
    url: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  - title: Duplicate detection in Azure Service Bus
    url: https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection
  - title: MassTransit consumers
    url: https://masstransit.massient.com/concepts/consumers
---

自分のトランザクション境界の外では、使うに値するブローカーはどれも at-least-once の配信しか約束しないので、ハンドラーは同じメッセージを 2 回見ることになります。効果を出したあと ack（確認応答）の前に落ちたコンシューマー、ネットワーク分断後の再配信、リバランス後の再生、デッドレターキューから一括で戻す運用者が、どれもその原因です。これを吸収できるのはコンシューマーだけです。効果が何だったかを知っている場所がそこしかないからです。吸収するやり方は 2 つのどちらかです。繰り返しだと気づいて何もしないか、何回動かしても同じ結果になる形で効果を書くかです。

繰り返しに気づくやり方は、メッセージ id のストアとそれに対する確保でできていて、その確保は原子的で、効果と同じトランザクションの中になければなりません。注文行を書くトランザクションの中で、一意制約を張ったテーブルにメッセージ id を `INSERT` すれば、両方起きるか両方起きないかになります。読んでから書くやり方はそうならず、同じ瞬間に届いた 2 つの複製が並んで空のストアを見て、どちらも進んでしまいます。効果がストアと同じデータベースにない場合、問題は消えずに場所を変えるだけです。決済 API を呼んでから id を記録するのは、また 2 つのシステムだからです。抜け道はたいてい、呼び出し自体にキーを載せて相手側に重複を落としてもらうか、outbox の行を書いて別のプロセスに呼ばせるかになります。

繰り返しを設計で消せるなら、そちらのほうが良いやり方です。余分なテーブルも期限も要りません。業務 id をキーにした upsert、増分ではなく絶対値の代入、すでに目的の状態にある行には何もしない状態遷移は、どれも構造として 2 回動かしても安全です。ストアが避けられないなら、id に寿命を与え、その期間が何を意味するかを理解しておきます。その外では、遅れて届いた重複と新しい仕事は区別できません。ブローカーがどれだけ長く再配信しうるか、運用者がデッドレターキューの一括再生にどれだけかかりうるかに合わせて決め、余裕を足し、その数値を書き留めます。
