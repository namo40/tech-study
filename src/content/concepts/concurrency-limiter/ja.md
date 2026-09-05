---
title: "Concurrency Limiter"
summary: "Concurrency Limiter は同時に処理中の呼び出し数を制限し、決められた数だけを待ち行列に置き、それを超える呼び出しは拒否します。"
category: "回復性と障害対応"
scene: bulkhead
related:
  - label: Bulkhead
    slug: bulkhead
  - label: Rate Limiter
    slug: rate-limiter
  - label: Bounded Concurrency
    slug: bounded-concurrency
  - label: SemaphoreSlim
    slug: semaphoreslim
references:
  - title: Introduction to resilient app development
    url: https://learn.microsoft.com/en-us/dotnet/core/resilience/
  - title: Bulkhead pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
---

Concurrency Limiter は permit で作ります。permit 1 つは処理中の呼び出し 1 件であり、permit の上限はその依存先が同じ瞬間に扱ってよい呼び出しの数です。呼び出しは出ていくときに permit を取り、応答が返るかタイムアウトになったときに返します。

キューは大きさの決まった待合室です。permit がすべて出払っていると、次の数件はすぐに失敗する代わりに空きを待ちます。大きさを決めておくことが要点です。上限のないキューは、遅くなった依存先を果てしないメモリー使用と果てしないレイテンシに変えてしまい、それは拒否より悪い結果です。

permit もキューも埋まると、Limiter は拒否します。この拒否は対処しそこねた失敗ではなく機能です。呼び出す側の応答を保ち、埋まった区画をメトリクスに見せてくれます。

Rate Limiter と Concurrency Limiter は測るものが違います。Rate Limiter は時間区間あたりのリクエスト数を数え、Concurrency Limiter は今処理中のリクエスト数を数えます。1 ミリ秒で応答する依存先は少ない同時実行でも非常に高い処理率を受け止められますが、10 秒かかる依存先はそうはいきません。多くのサービスには両方が必要です。
