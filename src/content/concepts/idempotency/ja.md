---
title: "Idempotency"
summary: "ある操作をもう一度行っても、一度行ったあとと同じ状態のままであるとき、その操作は冪等です。再試行を安全に送れる根拠がこの性質です。"
category: "API とリアルタイム通信"
scene: idempotency-key
related:
  - label: Idempotency-Key
    slug: idempotency-key
  - label: Deduplication
    slug: deduplication
  - label: Unique Constraint
    slug: unique-constraint
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Idempotent Consumer
    slug: idempotent-consumer
  - label: Message ID
    slug: message-id
  - label: Retry
    slug: retry
  - label: REST
    slug: rest
references:
  - title: HTTP Semantics, idempotent methods (RFC 9110)
    url: https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
  - title: Idempotent (MDN glossary)
    url: https://developer.mozilla.org/en-US/docs/Glossary/Idempotent
  - title: RESTful web API design
    url: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
---

2 回行っても 1 回行ったのと同じ状態が残る操作を冪等といいます。これは応答ではなく効果についての話です。`DELETE /orders/7` は 2 回目が 204 ではなく 404 を返しても冪等ですし、毎回違う数を返す読み取りも何も変えないので冪等です。HTTP は `GET`、`PUT`、`DELETE` を冪等なメソッドと定め、`POST` はそうではないとしています。助けが必要なメソッドが `POST` なのはそのためです。この話が重要な理由は 1 つだけです。ネットワークは、タイムアウトしたリクエストが届いたかどうかを呼び出し側に教えてくれません。ならば選択肢は 2 つしかありません。すでに済んでいるかもしれない仕事を諦めるか、送り直したうえで 2 回目の送信が無害であるようにするかです。

この性質を得る方法は普通 5 つあり、最後のものから手を伸ばすのがよくある失敗です。1 つ目は、すでにその性質を持つメソッドを選ぶことです。クライアントが作った id で送る `PUT /carts/{id}` は世界がどうあるべきかを述べますが、`POST /carts` は呼ばれるたびに新しいものを 1 つずつ作ります。2 つ目は、業務がすでに含意している一意制約に頼ることです。注文 1 件に決済 1 件といったもので、2 回目はデータベースに拒否させます。3 つ目は、呼び出し側が最後に見た状態を条件にして書くことです。`ETag` と `If-Match`、あるいはバージョン列を使えば、送り直しは古い前提条件を持って来るので拒まれます。4 つ目は、呼び出し側に `Idempotency-Key` を出してもらい、そのキーの下に結果を保存することです。ほかの方法では安全にできない操作に対する一般的な答えになります。5 つ目は、キューを受け取る側であれば、すでに処理したメッセージ id を記録しておき、見覚えのあるものを捨てることです。

はっきりさせておく価値があることが 2 つあります。冪等であることと安全であることは別です。安全なメソッドは何も変えませんが、冪等なメソッドは最初に多くを変え、そのあとは何も変えないことがあります。そして、少なくとも 1 回の配信を人間が扱えるものに変えてくれるのがこの性質です。重複を無視するコンシューマーは、正確に 1 回の配信に必要な分散処理の仕掛けを何ひとつ持ち込まずに、正確に 1 回処理した効果を出します。ただし、確認と書き込みが 1 つの操作でなければすべて崩れます。「これはもうやったか」を読んでから実行するまでの間には、2 つの呼び出し側が並んで「まだ」と読んでどちらも進む隙間ができるので、確保と効果は 1 回の原子的な書き込みで一緒に置かれなければなりません。
