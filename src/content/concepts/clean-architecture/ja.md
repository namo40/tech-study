---
title: "Clean Architecture"
summary: "クリーンアーキテクチャは同じルールを同心円で描きます。真ん中にエンティティ、その周りにユースケース、外側にアダプターとフレームワークがあり、ソースコードの依存はつねに中心を向きます。ヘキサゴナルとオニオンは絵だけが違う同じルールです。"
category: "アプリケーションアーキテクチャ"
scene: hexagonal-architecture
sceneStep: 4
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Onion Architecture
    slug: onion-architecture
  - label: Domain-Driven Design
    slug: domain-driven-design
  - label: Adapter
    slug: adapter
  - label: Dependency Injection
    slug: dependency-injection
  - label: Entity
    slug: entity
  - label: Value Object
    slug: value-object
  - label: Repository
    slug: repository
references:
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
---

クリーンアーキテクチャは、層を輪として描いた絵です。真ん中にエンティティが座り、ソフトウェアが無かったとしてもビジネスにとって正しかったであろうルールを持ちます。その周りにユースケースが座り、アプリケーションが行う特定の仕事ひとつのためにそのルールたちを取りまとめます。さらにその周りには、外の世界をユースケースが受け取る形へ変えるインターフェースアダプターがあり、すべての外側にフレームワークとドライバーと配信手段の輪があります。この絵に付いたルールはひとつ、ソースコードの依存がどちらを向いてよいかについてのものです。つねに内側であり、決して外側ではなく、実行時の制御の流れが逆向きであることは関係ありません。

その最後の部分こそ、輪が存在する本当の理由です。ユースケースはデータベースに何かを書かせなければならないので、制御は明らかに真ん中から外へ流れます。しかし参照はそうではありません。ユースケースは自分が所有するインターフェースを呼び、外の輪にある何かがそれを実装するからです。その依存ひとつを反転させることが仕掛けのすべてであり、実際に仕事をするのは具体的なものたちなのに絵がそれらを外側に描く理由でもあります。真ん中に、外の輪の何かを名前で呼ぶ `using` が一つでも見つかるなら、その絵は飾りです。

これは、いま見た場面と同じルールを別の作図の流儀で書いたものです。六角形が辺にソケットを描いてポートと呼ぶところで、同心円は二つの円のあいだに境界を描いてインターフェースと呼びます。オニオンは芯の周りに層を描いて、また同じものを呼びます。三つとも真ん中は外の名前を知らないと言い切り、三つとも外側に中心が宣言した契約を実装させ、三つとも同じやり方で確かめられます。プロジェクト参照を開いて、逆を向いているものがあるかを見るだけです。チームはどの絵を描くかで驚くほど多くの時間を使ってきましたが、その議論のうちルールについてのものはほとんどありませんでした。

絵が分かれるのは語彙と、輪をいくつ提案するかです。クリーンアーキテクチャは四つに名前を付け、その数が神聖ではないことをはっきり述べます。ヘキサゴナルはそもそも名前を付けず、境界だけを気にします。オニオンはたいてい三つか四つで描かれます。語彙の違いは見た目より値打ちがあります。「ユースケース」は操作ひとつを取りまとめるクラスに付ける名前として本当に役に立ち、「エンティティ」は不変条件がどこに住むかについての伝統をまるごと引き連れてきます。役に立つと感じた名前は借りて使い、輪の数は仕様として扱いません。

失敗の仕方も共有されており、三つのどれを採るにせよ、その前に知っておく値打ちがあります。輪が境界ではなくフォルダーになり、アセンブリ四つと双方向にもつれた参照グラフだけが残ります。「便利だから」とインターフェースを外の輪に宣言し、反転は静かに消えます。輪ごとに自分のモデルを持ち、コードベースの半分が守るべきルールのないマッピングコードになります。そしてルールがそもそも無いサービスにこの形が当てられ、保護ではなく儀式を買うことになります。チームがいちばん読みやすい絵を選び、向きを守り、議論は大事なところに使ってください。
