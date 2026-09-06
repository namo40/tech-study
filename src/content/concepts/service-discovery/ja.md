---
title: "Service Discovery"
summary: "Service Discovery（サービスディスカバリー）は、呼び出す側がサービスの名前を実際につなげるアドレスへ変える方法です。呼び出す側がレジストリか DNS から今のインスタンスの一覧を受け取って自分で選ぶか、サービスの前に立つ何かが代わりに選びます。"
category: "エッジ、ルーティングとサービスネットワーク"
related:
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Sidecar
    slug: sidecar
  - label: Health Check
    slug: health-check
  - label: Readiness Probe
    slug: readiness-probe
  - label: YARP
    slug: yarp
references:
  - title: "Service discovery in .NET"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/service-discovery
  - title: "DNS for Services and Pods"
    url: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
  - title: "Service"
    url: https://kubernetes.io/docs/concepts/services-networking/service/
---

## いつ使うか

- 名前の後ろにあるインスタンスの集合が固定でなくなった時点から使います。デプロイがポッドを入れ替え、オートスケーリングが増やしたり減らしたりし、退避させられるノードが一度に何個も連れて行くので、設定に書いた IP アドレスは有効期限の付いた事実です。Service Discovery はアドレスを名前に置き換え、いまどのインスタンスが答えているのかという問いを、その集合を見ている側へ渡します。
- 選ぶ仕事を呼び出す側にさせたいなら、クライアント側の発見です。呼び出す側がレジストリか DNS に今の一覧を尋ね、自分でインスタンスを選びます。ネットワークのホップが 2 つではなく 1 つで、呼び出す側ごとにポリシーを変えられます。自分のゾーンを先に使う、別のインスタンスで再試行する、遅かったインスタンスを飛ばす、といった具合です。代わりに、すべての呼び出す側がクライアントとキャッシュとポリシーを抱えることになり、しかもフリートが話すすべての言語で抱えることになります。
- どの呼び出す側にも何も選ばせたくないなら、サーバー側の発見です。呼び出す側は安定したアドレス 1 つにつなぎ、その後ろのロードバランサーかリバースプロキシか Kubernetes の `Service` がインスタンスを選びます。呼び出す側には何も入れず、ポリシーは 1 か所に集まります。代わりにホップが 1 つ増え、落ちうる構成要素が 1 つ増えます。
- Kubernetes では両方がすでに用意されていて、それを作り直すのがいちばんよくある無駄です。`Service` はセレクターに合うポッドの前に置かれた安定した名前と仮想 IP で、クラスターの DNS が `catalog.shop.svc.cluster.local` をそこへ解決します。入れるものが何もないサーバー側の発見です。ヘッドレスの `Service`（`clusterIP: None`）は代わりにポッドのアドレスへ解決するので、自分で選びたい呼び出す側には一覧がそのまま渡ります。そして名前の付いたポートには `_grpc._tcp.catalog.shop.svc.cluster.local` のような SRV レコードが作られ、ポート番号まで運ぶので、ポートをあらかじめ知らないクライアントでもエンドポイントを見つけられます。
- アドレスが本当に安定しているなら使いません。エンドポイントが 1 つのマネージドデータベース、他人の DNS の後ろにあるサードパーティーの API、プラットフォームがすでに安定に保っているアドレスの後ろのインスタンスであれば、設定に書いた名前だけで必要な間接参照はもう足りていますし、その前にレジストリを置けば仕事のない構成要素が 1 つ増えるだけです。

## 注意点

- 受け取った答えはどれも有効期限の付いたキャッシュです。レジストリのクライアントは一覧を持ち、リゾルバーは TTL が尽きるまでレコードを持ち、コネクションプールは一度解決したアドレスへ開いたソケットを持っています。2 秒前に答えるのをやめたインスタンスは、その 3 つすべてにまだ残っています。だから問いは一覧が正しいかどうかではなく、どれだけ古くなってよいのか、その窓に入ったリクエストはどうなるのか、です。別のインスタンスで再試行し、その再試行が生きているインスタンスを見つけられるくらい窓を短く保ちます。
- 登録は簡単で、腐るのは登録解除のほうです。到着だけを聞かされるレジストリは、落ちたプロセス、OOM で終わったプロセス、デプロイの途中で入れ替わったプロセスのアドレスで埋まっていきます。どれも別れの挨拶を送る間がないからです。集合を間引く仕事は、インスタンスの礼儀ではなく、インスタンスを見ている側が引き受けなければなりません。更新しなければ期限が切れるリースか、レジストリが自分で回すヘルスチェックです。
- 登録されていることと、リクエストを受ける用意ができていることは別です。Kubernetes はこの 2 つをわざと結び付けています。readiness の状態のエンドポイントだけが `Service` に入るので、readiness probe が失敗すれば、何も消さずにポッドが DNS からも分配先の集合からも外れます。自分で作ったレジストリが落とすのは、まさにこのつながりです。プロセスは生きていても依存先が死んでいる間に 200 を返す probe は、受け取るリクエストごとに失敗するポッドを集合へ戻します。
- `HttpClient` は接続を開くときに名前を解決し、その接続については二度と解決せず、レコードの TTL にも従いません。死んだアドレスへの接続をすでにプールへ入れた長寿のクライアントは、そこへリクエストを渡し続けます。`SocketsHttpHandler` の `PooledConnectionLifetime` を設定し、接続が決まった周期で退いて、名前がもう一度引かれるようにします。その値はエンドポイントがどれくらい動くかへの賭けであって、そのまま写す定数ではありません。
- レジストリはいまや最初のリクエストすべての経路にあります。届かなければ誰も何も見つけられず、ディスカバリーの障害は 1 つのサービスの障害ではなく全面的な障害に見えます。届かないときは閉じて失敗させるのではなく、最後に受け取った正常な答えで答え続け、レプリカを 2 つ以上動かし、プラットフォームの仕組みがあるならそちらを先に使います。クラスターの DNS はすでに複製されていて、クラスターの中の残りすべてがすでにその上に載っています。

## .NET では

`Microsoft.Extensions.ServiceDiscovery` は Aspire のサービス参照が使うライブラリで、やることは小さいです。ホストが入る場所に論理名を書いた `HttpClient` を持てるようにし、リクエストが出る直前にその名前を実際のエンドポイントへ変えます。`AddServiceDiscovery` がプロバイダーを登録し、クライアントビルダー側の呼び出しが特定のクライアントを対象に加えます。

```csharp
// 既定のエンドポイントのプロバイダー。まず設定のプロバイダー、次に名前を
// DNS の名前としてそのまま返す通過のプロバイダー。
builder.Services.AddServiceDiscovery();

// アドレスはホストではなくサービスの名前。"https+http" は HTTPS の
// エンドポイントを先に解決し、1 つもないときだけ HTTP へ下がるという意味。
builder.Services.AddHttpClient<CatalogClient>(static client =>
    {
        client.BaseAddress = new Uri("https+http://catalog");
    })
    .AddServiceDiscovery();

// あるいはすべてのクライアントを一度に対象にし、プールした接続を決まった
// 周期で退かせて、移ったエンドポイントを開いたまま抱えず解決し直させる。
builder.Services.ConfigureHttpClientDefaults(http =>
{
    http.AddServiceDiscovery();
    http.ConfigurePrimaryHttpMessageHandler(static () =>
        new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(2) });
});
```

設定のプロバイダーは `IConfiguration` からエンドポイントを読みます。だから `catalog` の一覧は `Services:catalog:https` の下のふつうの設定で、その最初のものが `Services:catalog:https:0` です。`appsettings.json` から来ても、環境変数から来ても、サービスをどこに立てたかをすでに知っている Aspire の AppHost から来ても構いません。

```json
{
  "Services": {
    "catalog": {
      "https": [
        "catalog-1.internal:8443",
        "catalog-2.internal:8443"
      ]
    }
  }
}
```

クラスターの中では、たいていそのどれも設定しません。`AddServiceDiscovery` が一緒に登録する通過のプロバイダーは名前をそのまま `DnsEndPoint` として返すので、`https://catalog` はクラスターの DNS が `catalog` の `Service` に対して解決し、発見はプラットフォームがします。そこがこの仕掛けの要点です。同じコードが手を加えないまま、ノート PC では設定を通して、クラスターでは `Service` を通して解決されます。DNS SRV のプロバイダーは例外で、ヘッドレスの `Service` の名前の付いたポートのためのものであり、既定の登録ではなく中核の登録の上に足します。

```csharp
// パッケージは Microsoft.Extensions.ServiceDiscovery.Dns。
// AddServiceDiscoveryCore は既定のプロバイダーなしで骨組みだけを登録するので、
// 尋ねられるのは SRV だけになる。すると "https://_dashboard.catalog" は
// "catalog" サービスの "dashboard" という名前の付いたポートの SRV レコードへ解決される。
builder.Services.AddServiceDiscoveryCore();
builder.Services.AddDnsSrvServiceEndpointProvider();
```

どのプロバイダーが答えても、上の注意点はアプリケーション自身の仕事のままです。解決したエンドポイントがその後ろのインスタンスより長く生き残らないようにするのが `PooledConnectionLifetime` で、サービスがリクエストを受けるのに必要な依存先まで答える readiness のエンドポイントが、答えられない間このインスタンスを集合の外に置きます。発見はどのアドレスが存在するかを決め、readiness はそのうちどれがトラフィックを受けるに値するかを決めます。
