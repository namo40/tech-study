---
title: "Adapter"
summary: "アダプターはポートと世界のあいだに座る翻訳機です。片面は HTTP や SQL やベンダーの SDK を話し、もう片面はドメインが所有する契約だけを話します。1 つを抜いて別のものを挿せるという事実が、その後ろのすべてを詳細にします。"
category: "アプリケーションアーキテクチャ"
scene: hexagonal-architecture
sceneStep: 3
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Repository
    slug: repository
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Clean Architecture
    slug: clean-architecture
  - label: Dependency Injection
    slug: dependency-injection
  - label: Domain-Driven Design
    slug: domain-driven-design
references:
  - title: "Hexagonal architecture"
    url: https://alistair.cockburn.us/hexagonal-architecture/
  - title: "Common web application architectures"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
  - title: "Architectural principles"
    url: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/architectural-principles
---

アダプターには面がちょうど 2 つあり、3 つ目はありません。外向きの面では、今年の世界が話すものをそのまま話します。HTTP のリクエストボディ、SQL の文、ブローカーから来たメッセージ、エラーとは何かについて独自の考えを持つベンダーの SDK といったものです。内向きの面ではポートを話します。ポートは、ドメインが自分の言葉で書いたインターフェイスです。このクラスの仕事は一方をもう一方へ変えることがすべてで、それに名前を付ける価値がある理由は、その変換がどこかで必ず起きなければならず、置ける他の場所がどれも悪いからです。

向きが 2 つあり、取り違えやすいところです。駆動するアダプターは外側からアプリケーションに何かをしてくれと頼みます。POST をコマンドに変えるコントローラー、メッセージを同じコマンドに変えるキューのコンシューマー、タイマーでそれを起こすスケジューラーがそうです。駆動されるアダプターは内側から頼まれます。ドメインが宣言したストアを実装するクラス、ドメインが送れと言ったメールを実際に送るクライアントがそうです。駆動するアダプターはポートを呼び、駆動されるアダプターはポートを実装します。シーンでは上のプレートが駆動する側、下のプレートが駆動される側で、差し替えが下で起きるのは、そちらがドメインの見ない面だからです。

差し替えられることはアダプターの良い性質ではなく、アダプターの定義です。ポートの後ろのクラスを別のクラスに換えてもドメインが観測できるものが何 1 つ変わらないなら、そのクラスが知っていたことはすべて詳細でした。ストレージエンジンも、ワイヤーフォーマットも、再試行ポリシーも、接続文字列もです。換えたらドメインのテストが壊れるなら、何かが漏れており、漏れているのはたいていアダプターではなくポートのほうです。`IQueryable` を返したり、プロバイダーの例外をそのまま渡したり、遅延読み込みされるグラフを見せたりするポートは、アダプターの内部をインターフェイスの名前で公開したのであり、実装の中でどれだけ気を付けてもそれは戻せません。

薄く保ち、退屈さを意図して守ります。目安は、そのアダプターを単体テストしたくなるかどうかです。したくなるなら判断が育っており、その判断はもうスイート内のすべての速いテストから見えません。速いテストは偽物を相手に回るからです。マッピングと翻訳、転送まわりの扱い、エラーの変換はここに属します。注文をいつ取り消してよいかというルールは属しません。たまたまデータを目の前に持っているクラスがこれだから、ここに置くのがひどく便利であるときでさえそうです。

コストは実在し、声に出して名指しする価値があります。アダプターの一つ一つが、データを線の向こうへ移すためだけに存在するクラスであり、そこに向きごとのマッピングが付き、テスト用の偽物がもう 1 つ付きます。守るべきルールがあるシステムでは、これは内側に触れずに外側を変えられる能力の代金としては安いほうです。行を読み書きするだけのシステムでは、これは図の付いた純粋な負担であり、正直な選択は飛ばしてフレームワークを直接呼ぶことです。価値はアダプターを持つことにあるのではなく、アダプターが内側へ向けさせてくれるあの矢印にあります。
