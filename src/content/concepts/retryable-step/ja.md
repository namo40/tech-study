---
title: "Retryable Step"
summary: "エンジンがもう一度走らせてよいステップです。二度走らせた結果が一度走らせた結果と同じ状態を残すので、失敗後の再試行もクラッシュ後の再開も安全になります。"
category: "スケジュールされた作業とワークフロー"
scene: workflow-engine
sceneStep: 3
related:
  - label: Workflow Engine
    slug: workflow-engine
  - label: Retry
    slug: retry
  - label: Exponential Backoff
    slug: exponential-backoff
  - label: Idempotency-Key
    slug: idempotency-key
  - label: At-Least-Once
    slug: at-least-once
  - label: Dead Letter Queue
    slug: dead-letter-queue
  - label: Durable Workflow
    slug: durable-workflow
  - label: Saga
    slug: saga
  - label: Scheduled Job
    slug: scheduled-job
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: Retry pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
  - title: "Error handling in Durable Functions"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-error-handling
  - title: "Implement retries with exponential backoff"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-retries-exponential-backoff
---

シーンの三つ目のステップでは、ステップ 3 が失敗し、エンジンが少し退いて、もう一度走らせます。`attempt 2` が現れ、二回目の試行が成功し、history に一行増えます。実行は二回なのに、行は一つです。定義はそれで全部です。やり直しても安全なステップとは、二回目の実行が余計なものを何も残さないので、記録が「このステップは一度起きた」と正直に言えるステップのことです。

これが見た目より重要なのは、ワークフローエンジンが別々の二か所でこれを前提にしていて、そのうち目につくのは片方だけだからです。目につくほうは再試行です。ステップが失敗し、エンジンがもう一度試します。もう一方は再開です。作業を終えて行を書く前にエンジンが死ぬと、記録はそのステップが未完了だと言い、再起動したエンジンはそれをもう一度走らせます。実際には完了していたかもしれないのにです。この隙間は塞げません。作業と記録が別のシステムに住んでいる以上、両方を一緒にコミットできないからです。エンジンは「少なくとも一度」を「誰から見ても一度」に変える機械であり、それができるのはステップが協力するときだけです。

だから、ステップを書くたびの実務的な問いはこうなります。これが二度走ったら何が重複するか。答えが「何も」であることもあり、そのステップはすでに安全です。フィールドに値を入れる、ID で削除する、内容から名前を作ったファイルを書く、読むだけの API を呼ぶ。どれも繰り返して差し支えありません。すでにこの分類に入るステップがどれだけ多いかに気づいておくと得です。そうでない少数にだけ手をかければよいということですから。

答えが「何も」でないとき、対処はほとんどいつも鍵です。その操作に、相手側が見分けられる名前を与えます。名前はワークフローのインスタンスとステップから作り、試行ごとに新しく作らないようにして、二度目に届いたものは相手側に拒ませます。外向きの呼び出しに `Idempotency-Key` ヘッダがあるのも、挿入に一意制約を張るのも、更新に `where status = 'pending'` を付けるのも、すべてそのためです。鍵は試行のあいだで安定していなければなりません。エンジンがステップに決定的なインスタンス ID を渡し、`Guid.NewGuid()` を呼ばせない理由がそれです。

この処方が効きにくいものが二つあり、名前を付けておく価値があります。一つはメール送信のように、相手側に重複という概念がなく、取り消す手段もない場合です。よくある答えは、意図をまず自分の保存先に記録し、その記録に鍵を張り、別の配送ステップにそこから読ませることです。もう一つは、設定ではなく加算です。`balance = balance + 10` は二回目に間違う典型的なステップで、`balance = 60` なら問題ありませんでした。相対的な変更を絶対的な値に書き直すことが、いちばん安い対処であることは多いです。

最後に、再試行はただではありませんし、いつも正しいわけでもありません。入力が不正で失敗したステップは五回目の試行でも同じように失敗するので、繰り返す価値のあるエラーと、それ自体が答えであるエラーを区別してください。タイムアウトと 503 とデッドロックは再試行し、400 や検証の失敗は再試行しません。試行回数に上限を置き、再試行が相手側を倒し続ける原因にならないように間隔を空け、試行が尽きたときにインスタンスがどこへ行くのかを決めておいてください。下流にいる人にとって「永遠に再試行中」と「静かに失敗」は同じ結果です。
