---
title: "Aggregate"
summary: "一つのトランザクションが覆ってよい単位です。コマンドを受け取り、自分だけが責任を負うルールを確かめ、それに続くイベントを生み出します。だから整合性は内側では保証され、外側では交渉になります。"
category: "アプリケーションアーキテクチャ"
scene: event-sourcing
sceneStep: 1
related:
  - label: Event Sourcing
    slug: event-sourcing
  - label: Event Replay
    slug: event-replay
  - label: Snapshot
    slug: snapshot
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Saga
    slug: saga
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Local Transaction
    slug: local-transaction
references:
  - title: "Event Sourcing pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing
  - title: "Apply simplified CQRS and DDD patterns in a microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/apply-simplified-microservice-cqrs-ddd-patterns
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

場面の 1 段階目には動く部分が 3 つあり、そのうち何かを決めるのは一つだけです。コマンドが App から降りてきて、Order がそれを見て、イベントがログへ出ていきます。Order が集約であり、これが両者の間に座っている理由は、ルールを引き受ける誰かが必要だからです。「すでに支払われた注文には品目を追加できない」は主語のある文であり、その主語が集約です。

覚えておく価値のある定義は狭いものです。集約は、一つのトランザクションが覆ってよい境界です。その内側はコマンドが戻る瞬間に整合します。ロック一つ、バージョン確認一つ、コミット一つが全体を守るからです。外側は後から整合します。イベントとサガと再試行と謝罪を経てそうなります。この一文が、この作りのシステムの設計のほとんどをこなしています。「どのエンティティが一緒に属するか」を、好みの問題から算数の問題に変えてくれるからです。一つのルールが「はい」か「いいえ」を言うために読む必要のあるデータに、ちょうど合わせて境界を引けばよいのです。

だから集約は小さくあるべきで、大きくしたくなる直感はたいてい間違いです。大きな集約は、より多くの不変条件がトランザクションの内側に入るので安全に見えます。しかしその分、より多くのコマンドが同じバージョン番号を取り合い、いちばん遅いものの後ろに列ができます。ルールが注文の合計についてなら、明細を所有する `Order` は正しいです。顧客とその住所録とポイントまで所有する `Order` は、誰かが何かを買うたびにその顧客をロックすることです。2 つのデータが同じルールに一緒に現れないなら、名詞がどれほど自然に響いても同じ境界には属しません。

集約はイベントを生み出すことを許された唯一の存在であり、それがログを信頼できるものにします。場面では、Order を通さずに Log へ書くものはありません。ほかのコードが `ItemAdded` を直接追記できるなら、不変条件は 2 か所に住み、結局どちらか一方でしか守られなくなります。だから形はいつも同じです。コマンドが尋ね、集約が自分のイベントから組み立て直した状態に照らして確かめ、答えが「はい」ならイベントを起こして自分に適用し、ストアへ渡します。カードの上の状態はそのイベントの結果であって、別に代入した値ではありません。

同時実行制御は、後付けの装置ではなく境界から自然に出てきます。集約ごとにバージョンがあり、それは最後のイベントの順番です。追記はコマンドが判断の根拠にしたバージョンを一緒に持っていき、ほかの誰かが先に進んでいればストアが拒みます。追加の列なしの楽観的同時実行制御であり、確かめてくれるのが主キーです。失敗したときの正直な対応はたいてい、読み直し、判断し直し、やり直すことです。コマンドが結果(`items を 3 に`)ではなく意図(`この品目を追加`)として表されているので、人に尋ねずに新しい状態へ適用し直せるからです。

集約の最後の使いどころは、トランザクションが覆ってはいけない範囲を決めてくれることです。一つのコマンドが 2 つの集約の合意を必要とした瞬間、両者にまたがるトランザクションを開くことは許されず、代わりに何をするのかを設計が語らなければなりません。補償で両者を調整するサガ、少し遅れることを許す結果整合の照会、あるいはルールが「その 2 つは実は一つだ」と教えてくれたのだから境界を引き直すこと、のいずれかです。その拒絶が集約のいちばん役に立つ性質です。分散という問題を、ロックが 2 つのサービスにまたがっている午前 3 時ではなく、まだ何も作っていない設計の時点で見えるようにしてくれます。
