---
title: "Bounded Context"
summary: "言語が変わる場所に引かれたモデルの国境です。その中では一つの単語がちょうど一つのことを意味し、外では同じ単語が誰か別の人のモデルに属します。"
category: "アプリケーションアーキテクチャ"
scene: domain-driven-design
sceneStep: 2
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Aggregate Root
    slug: aggregate-root
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Aggregate
    slug: aggregate
  - label: Event Sourcing
    slug: event-sourcing
  - label: CQRS
    slug: command-query-responsibility-segregation
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Using domain analysis to model microservices"
    url: https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Anti-corruption Layer pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
---

シーンの 2 段階目は、同じ単語を二度描きます。Sales には価格と合計を持つ Order があり、Shipping には住所と箱の数を持つ Order があります。どちらも相手の部分集合ではなく、どちらも相手に統合されるのを待ってはおらず、どちらも間違っていません。それが bounded context です。一つの単語がちょうど一つのことを意味する領域であり、その外では同じ単語が誰か別の人のものだという約束が一緒についてきます。

国境は言語が変わる場所に引き、根拠になるのも言語です。営業チームが「注文」と言うとき、それは価格と割引があり、まだ取り消すかもしれない顧客がついた何かです。倉庫が「注文」と言うとき、それは重さと宛先とピッキング順序がある何かです。どちらも、まだ誰も書き下していないより真実の Order の部分的な眺めではありません。二つは同じ現実の出来事についての二つのモデルで、それぞれ持ち主が答えなければならない質問の形をしています。その二つを一つにしようとすると、どちらの質問にもうまく答えられないオブジェクトができます。シーンの 1 段階目がまさにその一つにされたオブジェクトで、フィールドが一つずつ足されて育ち、やがてあらゆる変更を四つの部署と交渉しなければならなくなります。

国境が実際に買ってくれるのは、小さくいられる権利です。コンテキストの中では `Order.Total` と書いて一つのことを意味でき、検証規則を書いてそれがどこに効くかを知ることができ、誰にも尋ねずにフィールドを消せます。それに頼るものがすべて国境の内側に一緒にいるからです。国境の外では誰も自分のクラスを握っていないので、相手のリリース日程が自分のリリース日程になりません。その独立性がモデリングの労力の見返りのすべてであり、国境が技術的な何かである前に所有についてのものである理由です。

国境が何でないかもはっきりさせておく価値があります。デプロイの境界ではありません。互いのテーブルを読まない二つのコンテキストを持つモジュラーモノリスは国境を完全に守り、`Entities` アセンブリを一つ共有するサービスの群れは現代的に見えながら国境を破ります。名前空間でもありません。誰も強制しない名前空間は、善意のある命名規約にすぎません。そして人を防ぐ壁でもなく、チームがこの考えに反発する理由はたいていその読み違いです。二つのコンテキストは絶えず対話します。しないのはクラスを共有することだけです。

二つのコンテキストが出会う場所では、関係を習慣に任せず書き留めます。心地よいのは公開された契約です。上流のコンテキストが自分の言語でイベントを発行し、下流がそれを自分のモデルへ翻訳します。シーンの 4 段階目が見せているのがこの形です。心地よくないのは、自分では制御できないモデルが漏れ込んでくる場合で、答えは anti-corruption layer です。相手の形を自分の形に変えるだけの小さなクラスを一つ置けば、相手のコードでの名前変更は自分のドメインの変更ではなく、ファイル一つのコンパイルエラーになります。どちらも同じ地図の上に描かれ、コンテキストとそのあいだの翻訳でできた地図こそがアーキテクチャです。コードはその下流にあります。

本物の国境を見つけたかどうかを確かめる実用的な方法は、用語集です。大事な単語を一つ選び、ビジネスの別の部分にいる二人に定義を尋ねます。定義が意味のある形で食い違うなら国境はその二人のあいだを通っており、正直な選択は共有テーブルと長い議論ではなく、それぞれに自分のモデルと翻訳を与えることです。定義が一致するなら、そこにはコンテキストが一つあるのであり、あいだに国境を引けば何も買ってくれない翻訳層だけを抱えることになります。
