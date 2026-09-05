---
title: "Event Stream"
summary: "イベントが append され続けるパーティションログです。各パーティションは何も取り出されない順序付きのシーケンスなので、ストリームは空になるキューではなく育っていく履歴であり、キー内の順序が物理的に住む場所がそのパーティションです。"
category: "メッセージングとイベント処理"
scene: ordering
sceneStep: 2
related:
  - label: Ordering
    slug: ordering
  - label: Hot Partition
    slug: hot-partition
  - label: Offset
    slug: offset
  - label: Publish/Subscribe
    slug: publish-subscribe
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Competing Consumers
    slug: competing-consumers
  - label: Sharding
    slug: sharding
  - label: Consistent Hashing
    slug: consistent-hashing
  - label: At-Least-Once
    slug: at-least-once
references:
  - title: Features and terminology in Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-features
  - title: What is Azure Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about
  - title: Scaling with Event Hubs
    url: https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability
---

イベントストリームは append だけされ、取り出されないログです。シーンの 2 番目のステップは、それを概念ではなく物理として見せるように描かれています。`acct 7` のイベントが P0 に着くと P0 の行の右端にセルが 1 つ増え、コンシューマーが処理したあともそのセルは残ります。消費してもその行は変わりません。変わるのは、コンシューマーがどこまで通り過ぎたかだけです。キューとの分かれ目がここです。キューではメッセージはブローカーが抱えていて、誰かが持ち去れば消える作業の単位です。ストリームでは 2 つのコンシューマーが同じ場所を読んでも、どちらかが少なく受け取ることはありません。

順序を実際に背負っている単位はパーティションです。ストリームは 1 本のシーケンスではなく複数です。P0 の行はそれ自身の中で順序があり、P1 の行もそれ自身の中で順序がありますが、片方のセルともう片方のセルの間には何の主張もありません。2 番目のステップを見れば、2 つの行は互いを待ちません。1 つのプロデューサーを通ってきただけの、別々の 2 つのシーケンスです。「このストリームは順序が保証されますか」という問いに答えがない理由がここにあります。パーティションの中では構造上保証され、パーティション間では保証されず、どの設定でもそれは変わりません。

イベントをどのパーティションに入れるかを決めるのはキーであり、だからキーはメッセージの中で最も結果を左右するフィールドです。パーティションキーはハッシュされるので、同じキーは必ず同じパーティションへ行き、そのキーのイベントはブローカーが受け付けた順に 1 つの行へ積まれます。キーなしで送ったイベントは代わりに散らされます。Event Hubs はラウンドロビンで割り当て、Kafka のプロデューサーはバッチごとに 1 つのパーティションへ貼り付けますが、意味のある件数で見ればどちらも同じことです。どちらにせよ 1 番目のステップの絵がまさにそれです。速く、負荷は均等で、順序については何の約束もありません。どちらになるかは送信時にプロパティ 1 つで決まり、プロデューサーが求めなかった順序をコンシューマーが取り戻す方法はありません。

append だけという形は、ストリームを読み直せるものにしている理由でもあります。消費しても何も消えないので、最初から読み直したいコンシューマーは位置を戻して同じセルを読み直し、2 つ目のコンシューマーグループは同時に同じセルを読みながら互いに気づきもしません。限界は配信ではなく保持期間です。ログは窓を保ち、その窓から外れたものはすべての読み手から一度に消えます。ストリームはキューが与えない 2 つ、再生できる履歴と互いに独立した複数の読み手を与えます。その代わり、履歴をどこまで残すかを決めること、そして順序は選んだレーンの中でだけ受け取ることを求めます。
