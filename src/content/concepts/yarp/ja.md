---
title: "YARP"
summary: "YARP は ASP.NET Core アプリケーションの中でホストするリバースプロキシです。場面の玄関がルートとクラスターを書いた設定ファイル一つと起動コード二行になり、残りはいつも書いているミドルウェアパイプラインのまま残ります。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: reverse-proxy
sceneStep: 1
related:
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: API Gateway
    slug: api-gateway
  - label: Load Balancer
    slug: load-balancer
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Least Connections
    slug: least-connections
  - label: Round Robin
    slug: round-robin
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

場面の最初の段階は二行が書かれたカード一枚で、YARP はそのカードを実物にしたものです。サービスコレクションに `AddReverseProxy().LoadFromConfig(...)` を入れ、パイプラインに `MapReverseProxy()` を入れ、辞書が二つ入った設定区画を渡します。ルートは入ってきたリクエストがどんな形であるべきかとどのクラスターが答えるかを書き、クラスターはその名前の後ろにどのアドレスがあり、その中からどう選ぶかを書きます。三つめの概念はなく、この一組を見てしまえば、場面全体が一つの設定ファイルとして読めます。

これが先行するプロキシと違うのは、どこで動くかという点です。Nginx や HAProxy は独自の設定言語と独自のリロード方式と独自のリクエスト観を持つ別プロセスです。YARP はすでに自分のものであるアプリケーションの中の NuGet パッケージであり、だから玄関を裏側と同じ道具で建てることになります。認証は ASP.NET Core の認証そのままで動き、ルートに付けた `RequireAuthorization` は他の場所と同じ意味を持ち、ログの提供元もテレメトリもすでに配線済みで、設定で書くには特殊すぎる規則は自分が C# で書く `RequestTransform` になります。プロキシは誰かが別に設定してくれるインフラであることをやめ、コードベースの一部になります。

その代償は、インプロセスのプロキシがいつも払う代償と同じです。.NET アプリケーションなので起動時間もガベージコレクターもメモリ使用量もあり、システムのすべてのリクエストが通る熱い経路で仕事をします。ルーティングが面白くトラフィックが普通のときには悪くない取引ですが、ルーティングが平凡でトラフィックが膨大なときには分の悪い取引です。必要なのが「TLS を終わらせて全部を一箇所へ送る」だけなら、C で書かれた何かがずっと少ない仕掛けでやってのけます。YARP が値をするのは、扉の前の判断がどのみちコードで書くことになる種類のときです。

設定は `IConfiguration` が来る場所ならどこからでも来られて、これは聞こえるより重要です。`LoadFromConfig` は区画にバインドするので、`appsettings.json` やその裏の提供元が変われば再起動なしに反映されます。すでに開いている接続は抜けていき、新しいリクエストから新しい表を使います。おかげで四つめの段階のストラングラー方式の移行が理屈ではなく実務になります。パス一つを古いクラスターから新しいクラスターへ移すのが、デプロイではなく設定変更だからです。表がデータベースや制御プレーンから来る必要があるなら、`LoadFromMemory` と `IProxyConfigProvider` インターフェースで自分で供給でき、リロードの約束はそのままです。

場面の三つめの段階に出てくる宛先のヘルスは、自分で書くコードではなくクラスターの設定です。アクティブヘルスチェックは呼ぶパスと呼ぶ間隔を YARP に渡し、失敗した宛先は再び通るまで集合から外れます。パッシブチェックは代わりに実際のトラフィックを見ていて、応答の失敗が十分に溜まったら宛先を外します。アクティブチェックは宛先ごと間隔ごとにリクエスト一つを使う代わりに、利用者が見つける前に障害を教えてくれます。パッシブチェックは費用がかからない代わりに、誰かがすでに嫌な思いをした後でしか気づきません。多くのシステムは、場面のあの区間が短く保たれる程度に細かい間隔のアクティブチェックを望みます。他と同じ話で、間隔も無料ではなく、遅れも無料ではありません。

早めに身につけておくとよい習慣が一つあり、それは場面が見せられない唯一のものでもあります。プロキシはバックエンドへ自分のリクエストを作って送るので、バックエンドが接続から知っていたことは、いまや全部プロキシについての情報です。リモートアドレスも、スキームも、ポートもそうです。YARP は元の値を `X-Forwarded-*` ヘッダーで転送しますが、バックエンドにはそれを信じてよいことと、どのプロキシにそう言う資格があるかを教える必要があります。`KnownNetworks` か `KnownProxies` を設定した `UseForwardedHeaders` を、認証より前、そしてリダイレクトする何よりも前に置きます。飛ばすと、症状は分かりやすくはなく奇妙です。すべてのクライアントが一つのアドレスから来たように見え、レート制限は呼び出し元ではなくプロキシに対してかかり、サービスはリクエストが平文の HTTP で届いたと確信しているので HTTPS リダイレクトが延々と回り続けます。
