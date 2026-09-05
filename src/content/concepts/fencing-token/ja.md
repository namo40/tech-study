---
title: "Fencing Token"
summary: "Fencing Token は、ロックを取得するたびに発行される、増える一方の番号です。保持者はすべての書き込みにこの番号を添え、リソースはすでに受け入れた最大値より小さいトークンを伴う書き込みを拒否します。"
category: "分散協調"
scene: distributed-lock
sceneStep: 4
related:
  - label: Distributed Lock
    slug: distributed-lock
  - label: Distributed Lease
    slug: distributed-lease
  - label: Lease TTL
    slug: lease-ttl
  - label: Split Brain
    slug: split-brain
  - label: Leader Election
    slug: leader-election
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Lost Update
    slug: lost-update
  - label: Idempotency
    slug: idempotency
references:
  - title: How to do distributed locking (Martin Kleppmann)
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: Distributed locks with Redis
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: Kubernetes Leases
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

Fencing Token が解くのは、シーンの 3 番目のステップが見せているあの状況です。リースを失うほど長く止まっていた保持者が、何も起きなかったかのように目を覚まします。その保持者には、内側から空白を検知する手段がありません。自分の時計ではスレッド時間が数ミリ秒進んだだけで、ロックのオブジェクトは今も自分がキーを持っていると言い、次の書き込みは直前の書き込みとまったく同じ形をしています。ロックサービスに問い直しても助けにはなりません。答えが返ってくるころにはリースがまた切れているかもしれないからです。

そこで検査を、それができる唯一の相手に移します。書き込まれる側のリソースです。取得のたびに、繰り返さず後戻りもしない番号が刻まれます。ふつうはキーの隣に置いた原子的なカウンターです。保持者はその番号をすべての書き込みに添えて運びます。リソースは受け入れた最大の番号を覚えていて、それより小さい値を伴う書き込みを拒否します。古い保持者の書き込みがトークン 37 を持って現れたとき、ストレージはすでに新しい保持者から 38 を受け取っており、その瞬間 37 には何の意味もありません。

この仕組みが働くのは、順序を決めるのが発行の並びを知る唯一の部品であるロックサービスであり、その順序を検査するのが書き込みを見る唯一の部品であるリソースだからです。どちらも時計を信じる必要がなく、保持者が自分をどう思っているかを信じる必要もありません。トークンは助言でしかなかったロックを、ストレージが実際に強制する排他へ変え、ロックのほうは競合を減らす最適化の道具に下がります。正しさがロックの上に乗っていない状態になります。

実装にかかるのは列 1 つと述語 1 つです。リレーショナルデータベースなら更新文に付く `WHERE last_token < @token` で、これは楽観的同時実行の検査と同じ形ですが、基準が行自身のバージョンではなくリースである点が違います。ドキュメントストアなら同じフィールドへの条件付き書き込みです。オブジェクトストアなら、現在のトークンを読んでから `If-Match` の前提条件で守った書き込みを行います。ストアが比べられるのは順序ではなく等しさだけだからです。この方式が崩れるのはリソースが条件そのものを表現できない場合だけで、設計がロックに寄りかかる前に確かめておく価値があります。宛先が古い書き込みを拒否できないなら、その先にあるどれも拒否できません。

間違えやすい点が 2 つあります。トークンは取得から受け取るものであり、書き手が自分のカウンターで作ってはいけません。そうすると 2 人の書き手が同じ値を刻めてしまいます。そしてリソースは、守っているデータの隣にトークンを永続的に保存しなければなりません。メモリーにだけ覚えたトークンは再起動一度で忘れられますが、古い保持者はよりにもよってその再起動を越えて生き残りがちです。
