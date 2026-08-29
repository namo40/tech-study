---
title: "OpenFeature"
summary: "OpenFeature はフィーチャーフラグ評価のためのベンダー中立な API です。コードはクライアントに値を尋ね、プロバイダーが答えるので、コードベースに散らばった検査がフラグを保管している相手の名前を呼ばなくなります。"
category: "コンテナーとオーケストレーション"
scene: feature-flag
sceneStep: 4
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: Canary Release
    slug: canary-release
  - label: External Configuration
    slug: external-configuration
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rollback
    slug: rollback
  - label: Fallback
    slug: fallback
  - label: Cache-Aside
    slug: cache-aside
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
---

シーンの 4 段階目はスイッチを取り除くところで終わります。フラグをどう評価するかを選ぶときに思い出すべき瞬間が、まさにここです。追加するフラグの一つ一つが、いつか探し出して消すことになる分岐であり、それが簡単かどうかは、すべての検査が同じ形をしているかにほぼ全面的に懸かっています。半分はあるベンダーの SDK を呼び、いくつかは環境変数を読み、残りは自分で作ったデータベースのテーブルに尋ねているなら、フラグを取り除く作業は発掘になります。OpenFeature は、検査を一つの形にするために存在します。

その形は小さなものです。コードはフラグキーでクライアントに型のある値を尋ね、デフォルト値と評価コンテキストを一緒に渡します。起動時に一度登録したプロバイダーが答えます。呼び出し元から見える面はこれだけで、だからこそ面白いのは隠されている側です。どのサービスがフラグを保管しているのか、パーセンテージをどう計算するのか、答えがキャッシュから来たのかストリームから来たのか、プロバイダーに届かないときに何が起きるのか。どれも呼び出し箇所にある必要はなく、呼び出し箇所から消えてしまえば、コードに触れずにどれでも変えられます。

呼び出しごとに渡すデフォルト値は、見た目より多くの仕事をしています。プロバイダーが無い、設定が誤っている、遅い、そのキーを知らない、といったときに呼び出し元が受け取るのがデフォルト値です。つまり、kill switch を頼りにしていたまさにその障害の最中に返ってくる答えでもあります。新しい状態ではなく安全な状態を選んでください。公開途中の機能なら `false`、何かを守るスイッチなら、他のすべてが止まったときにシステムを動かし続ける側です。デフォルト値が危険な経路になっているフラグは、守るはずだった相手の強い依存へと静かに変わってしまったフラグです。

評価コンテキストは、2 段階目のパーセンテージが実際に生まれる場所です。ターゲティングキーと、ルールが読んでよい属性を運び、プロバイダーがターゲティングキーをハッシュして呼び出し元をバケツに入れます。リクエストにすでにある身元から、高いところで一度だけ作って下へ渡してください。呼び出しごとに作り直すと、一つのリクエストの中の二つの検査が、誰が呼んでいるかについて食い違うことがあります。属性は最小限に保ちます。どんなペイロードも最小限に保つのと同じ理由です。コンテキストに入れたものはすべて、フラグのルールが依存しうるものであり、六つの属性を読むルールは誰も消す勇気を持てません。

フックは、呼び出し箇所ごとにログを覚えていなくてもフラグを観測可能にしてくれる部分です。フックは評価の前後で走るので、一度登録すればプロセス内のすべての検査から、フラグキー、返した値、その理由、バリアントが得られます。コホートごとに指標を分けることが可能になるのはここで、フラグが死んでいると教えてくれるのもここです。何週間も全員に同じ値を返し続けるキーは、取り除かれるのを待っている分岐であり、何かが見張っていたからこそそれが分かります。

.NET ではパッケージが `OpenFeature` で、プロバイダーは別に配布されます。`Microsoft.FeatureManagement` の上に載せるプロバイダーもあるので、すでにそれを使っているアプリケーションなら、フラグの住む場所を変えずに中立な API へ移れます。起動時にプロバイダーを登録し、コンテナーから `IFeatureClient` を受け取り、呼び出し箇所は退屈なままにしておきます。キー一つ、デフォルト値一つ、コンテキスト一つ。そうすればベンダーは `Program.cs` の一行になり、この作業全体の狙いはまさにそこにあります。
