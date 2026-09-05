---
title: "Aggregate Root"
summary: "整合性の境界へ入るただ 1 つの扉です。あらゆる変更がこの扉を通り、通る途中で不変条件が検査され、外にあるものはすべて中への参照ではなくルートの id だけを握ります。"
category: "アプリケーションアーキテクチャ"
scene: domain-driven-design
sceneStep: 3
related:
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Bounded Context
    slug: bounded-context
  - label: Aggregate
    slug: aggregate
  - label: Repository
    slug: repository
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Unit of Work
    slug: unit-of-work
  - label: Optimistic Concurrency
    slug: optimistic-concurrency
  - label: Eventual Consistency
    slug: eventual-consistency
  - label: Saga
    slug: saga
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: "Designing a microservice domain model"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-domain-model
  - title: "Design a DDD-oriented microservice"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
  - title: "Creating and configuring a model in EF Core"
    url: https://learn.microsoft.com/en-us/ef/core/modeling/
---

シーンの 3 番目のステップは、扉の前に番人を立て、2 種類の書き込みを送り込みます。1 つは Order を通ってきて、不変条件、つまり合計が行の合計と一致するかを検査され、通過します。もう 1 つは行へ直接届こうとして、何にも触れないうちに断られます。その拒絶が aggregate root の職務記述のすべてです。入り口が 1 つしかないので、ルートが守る規則が 2 か所で強制されることはなく、したがって 2 か所のうち片方でだけ強制されることも起きません。

ここで「ルート」という語が本当に働いています。集約は 1 つのかたまりとして一貫していなければならないオブジェクトの小さな束であり、ルートはその束のうち外部が名前を呼んでよい唯一の一員です。ほかはすべてルートを通してしか届きません。不変条件を検査できるようにしているのは、この形そのものです。呼び出し側が行を読み込んで保存できるなら、「合計は行の合計と一致しなければならない」という文には居場所がなくなります。それを壊せるコードが、それを知っているコードではないからです。扉が 1 つであることは好みの問題ではなく、規則を持つための前提です。

ルートが所有する規則は、集約がどれくらいの大きさであるべきかも教えてくれます。1 つの不変条件が可否を答えるために読む必要のあるデータだけをちょうど囲み、そこで止めます。規則が注文の合計についてのものなら、注文とその行が 1 つの集約です。誰かが顧客を入れようと言い出したら、同じトランザクションの中で顧客を必要とする不変条件は何かを尋ねてください。たいていは存在せず、入れるということは誰が何を買っても顧客にロックを掛けるという意味になります。不変条件がまったくないなら集約もなく、無関係なエンティティの束の上のルートは、競合だけを増やして何も返さない儀式です。

境界の外では、参照は id で行います。Sales の Order は `Customer` ではなく `CustomerId` を握り、注文の外にあるものは `OrderLine` を握りません。1 週間ほどは不便に見えて、そのあとは元を取り始めます。id は思いがけないクエリへ遅延読み込みされることがなく、2 つ目の集約を自分のトランザクションへ引きずり込むこともできず、別のルートに属するものを呼び出し側に変えさせることもできません。本当に両方が必要なときは両方を明示的に読み込むことになり、その費用がコードにそのまま見えます。

この規則のもう半分は、それが禁じることです。トランザクション 1 つは集約 1 つを覆います。ある変更が本当に 2 つの集約の合意を必要とするなら、その 2 つをまたぐトランザクションを開くことは許されず、代わりに何が起きるのかを設計が言わなければなりません。補償を伴う saga か、少し遅れることを許す結果整合性のある読み取りか、あるいは 2 つは本当は 1 つだったという意味なので境界を引き直すかです。その拒絶こそ、このパターンがする最も役に立つ仕事です。まだ箱を描いている段階で、分散の問題を目に見えるようにしてくれるからです。

隣の aggregate のページは、同じオブジェクトを Event Sourcing の目で見ています。そこで面白い問いは、コマンドがどうやってイベントになり、ログがどうやって状態になるかです。ここで扱うのはもっと狭く、もっと古い問いです。境界をどこに置くか、誰が扉を叩いてよいか、扉が閉まるときにいつでも真であるものは何か、といったものです。並行性も後から取り付けるものではなく、同じ境界から落ちてきます。集約はバージョン番号が属する単位だからです。書き込みは自分が判断の根拠にしたバージョンを一緒に運び、ほかの誰かが先に進んでいればストアがそれを断り、正直な対応は読み直して判断し直して再試行することです。
