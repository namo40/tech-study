---
title: "Anti-Corruption Layer"
summary: "anti-corruption layer は、新システムがまだ読まなければならない古いモデルとの間に置く翻訳の層です。古いモデルは境界で止まり、それを置き換えるはずのコードへ広がらなくなります。"
category: "アプリケーションアーキテクチャ"
scene: strangler-fig
sceneStep: 2
related:
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Bounded Context
    slug: bounded-context
  - label: Database per Service
    slug: database-per-service
  - label: Modular Monolith
    slug: modular-monolith
references:
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Domain analysis for microservices
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
---

移行が半ばまで来ると、新しいコードはまだ自分のものではない何かを必要とします。customers は移りましたが orders はまだで、顧客の画面には直近 3 件の注文を出さなければなりません。方法は 2 つあります。1 つは古いテーブルを直接読み、その行を新しいコードが欲しい形に移し替えて先へ進むことです。初日の午後はうまく動き、そして移行を失ういちばん確実なやり方でもあります。1 か月もすれば、古いスキーマの nullable な列、ステータスコード、「2016 年より前に作られたアカウントではこの項目の意味が違う」といった決まりが、すべて新システムの中で構造を支えるようになり、新システムは書式だけがましになった古いシステムの写しになります。もう 1 つは、両方の言語を話しながらどちらも通さない層を置くことです。

実際の姿は、新システム側にある小さくて退屈で持ち主のはっきりしたモジュールです。新システムの語彙で書いたインターフェイスが 1 つ、古いシステムを呼ぶ実装が 1 つ、そして隔離されているので醜くてよいマッピングです。古いシステムは、すでに開いている扉から呼びます。API でも、ストアドプロシージャでも、読み取りレプリカでも、夜間の抽出でもかまいません。その呼び出しは、ほかのネットワーク依存とまったく同じに扱います。タイムアウトを置き、再試行の回数を区切り、応答がないときの逃げ道を用意します。古いシステムが 3 通りに書くステータスを読み、新システムが理解する 1 つに直して返すような、ほかに置き場のない補正にとっても自然な場所です。

最後の性質がよく忘れられ、しかもそれは層がなぜそこにあるかで変わります。移行の中では、anti-corruption layer は死ぬために作るものです。ある機能のデータがまだ移っていないから存在するのであって、そのデータが移った日に消されるべきです。それぞれに持ち主を決め、いつなくすかを書き残し、そこを通るトラフィックを見張ります。呼び出し量が一向に減らない層は、止まってしまった移行です。生きている 2 つの bounded context の間や、決して自分のものにならないベンダー API の前では、同じ層が代わりに恒久的なものになり、上に書いたことは退役の日付を除いてすべて当てはまります。消せるようにするのは所有権をはっきりさせておくことなので、機能を移す前に、そのデータをあとでどちらのシステムが所有するかを決めます。両側がまだ書けるなら、それは 2 つのシステムの間の翻訳ではなく、共有データベース 1 つの上にアプリケーションが 2 つ乗っているだけで、このパターンの約束は何も残りません。
