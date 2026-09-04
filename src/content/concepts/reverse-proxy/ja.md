---
title: "Reverse Proxy"
summary: "リバースプロキシは、複数の内部サービスの前に立つただ一つの公開玄関です。クライアントに代わってすべてのリクエストを受け取り、TLS、ルーティング、転送ヘッダー、ヘルスといった境界の仕事を引き受けたうえで、残りを内側へ渡します。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: reverse-proxy
steps:
  - title: "アドレスは一つ、サービスは複数です"
    text: "すべてのクライアントが同じ玄関と話します。プロキシはパスを読んで `/app` はこちらへ、`/api` はあちらへ渡し、答えを返します。バックエンドはクライアントが決して見ない内部アドレスだけで生きています。"
  - title: "境界の仕事はエッジが引き受けます"
    text: "TLS はプロキシで終わります。外側は暗号化、内側は平文です。バックエンドにはプロキシが呼び出し元に見えるため、元のクライアントは `X-Forwarded-For` に載って一緒に届きます。このヘッダーは自分のプロキシが書いたものだけを信じるべきです。"
  - title: "障害は扉の後ろにとどまります"
    text: "プロキシはバックエンドを監視し続けます。インスタンスが一つ落ちても、新しいリクエストはクライアントに気づかれないまま健康な側へ流れ、復帰すれば静かに戻ります。障害を吸収する場所がエッジです。"
  - title: "この席に製品の仕事まで任せると、ゲートウェイになります"
    text: "席は同じで、仕事が増えます。トークンのないリクエストは扉で断り、限度を超えるバーストは切り落とし、複数のサービスを一つの API 面に組み立てます。API ゲートウェイは、製品の関心事まで引き受けたリバースプロキシです。"
related:
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Least Connections
    slug: least-connections
  - label: Layer 7 Load Balancing
    slug: layer-7-load-balancing
  - label: Health-Based Routing
    slug: health-based-routing
  - label: Sticky Session
    slug: sticky-session
  - label: Strangler Fig
    slug: strangler-fig
  - label: Facade
    slug: facade
  - label: CORS
    slug: cors
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
references:
  - title: "YARP: Getting started"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/getting-started?view=aspnetcore-10.0
  - title: Configure ASP.NET Core to work with proxy servers and load balancers
    url: https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
  - title: "X-Forwarded-For"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
---

## いつ使うか

- 複数のサービスを一つのサイトに見せたいときに使います。クライアントが受け取るのはホスト名一つと証明書一つで、どのサービスが答えるかはパスが決めます。`/app` と `/api` が別のマシンの別プロセスであることは、誰も知る必要がありません。
- 証明書と TLS を一箇所にまとめたいときに使います。更新も、暗号スイートの選択も、HTTP/2 を有効にすることも、エッジで一度やるほうがサービスごとに繰り返すよりずっと手間が少なく、どれか一つで間違える可能性もずっと低くなります。
- 構成を外に出したくないときに使います。バックエンドはクライアントが到達できないアドレスで待ち受けるので、間違いの一群がまとめて消えます。公開するつもりのなかった内部管理エンドポイントには、そもそも届きません。
- サービスのインスタンスが一つ落ちても呼び出し元に見せたくないときに使います。プロキシはバックエンドを監視し、応答が止まった相手には仕事を送らなくなるので、デプロイも障害も再起動もエッジで吸収されます。
- 移行で、古い側と新しい側を分ける場所が要るときに使います。ストラングラー方式の書き換えが成り立つのは、プロキシがパス一つだけを新しいサービスへ送り、残りはそのまま古いサービスへ送れるからであり、その境界をパス単位で動かせるからです。
- 横断的な関心事に一つの住所を与えたいときに使います。圧縮、リクエストログ、相関 ID、HTTP から HTTPS へのリダイレクトは、どれもサービスごとに最新に保つライブラリより、前段の規則一つにするほうが安上がりです。

## 注意点

- 転送ヘッダーは事実ではなく入力です。`X-Forwarded-For` と `X-Forwarded-Proto` は、何かが取り除かない限りリクエストを送った側が書いた値なので、クライアントは好きなアドレスを自分のものだと主張できます。`ForwardedHeaders` には実際に信頼するプロキシとネットワークだけを書き、それ以外の場所では信頼できない入力として扱ってください。
- ホップの数も信頼と同じくらい重要です。サービスの前にプロキシが二つあればヘッダーにはアドレスが二つ入り、どこまで遡って読むかは `ForwardLimit` が決めます。ここを誤ると、レート制限も位置推定も監査ログも、全部が違うクライアントを記録します。
- タイムアウトとリトライは両方の層にあり、掛け算になります。30 秒待つサービスの前でプロキシが 30 秒待てばクライアントは 1 分の沈黙を味わい、2 回リトライするサービスの前でプロキシが 2 回リトライすれば、一つのリクエストが九つになります。外側の予算を内側より短くし、リトライは一箇所だけにしてください。
- プロキシ自身が単一点です。後ろがどれだけ冗長でも、プロキシが一つしかなければ意味がありません。最低二つ動かし、その前に両者を切り替えられる何かを置き、設定のリロードが本番の重要経路になったことを忘れないようにします。
- バッファリングは既定値ではなく決定です。リクエストとレスポンスの本文をバッファリングするプロキシは遅いバックエンドを守りますが、ストリーミングを壊します。サーバー送信イベントは最後にまとめて届き、大きなアップロードはメモリに溜まり、gRPC ストリームはそもそも動きません。手を触れずに通すべきエンドポイントがどれかを把握しておく必要があります。
- WebSocket、gRPC、ロングポーリングは個別に考える必要があります。これらはリクエストとレスポンスの対ではなく接続なので、アイドルタイムアウトもアップグレードヘッダーもデプロイ中の接続整理も、普通の場合とは違う振る舞いをします。
- ルーティング規則は、自分のコードの外に住むコードです。二つのサービスが同時に主張するパス接頭辞、より具体的な規則より先に当たる規則、マッチを変えてしまう末尾のスラッシュは、どれもバグであり、どれも両サービスのテストには現れません。

## .NET では

YARP は ASP.NET Core アプリケーションの中でホストするリバースプロキシです。つまりルーティング表は設定になり、それ以外はすでに知っているミドルウェアパイプラインのままです。

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapReverseProxy();
app.Run();
```

設定は互いを参照する二つのリストです。ルートは入ってきたリクエストがどんな形であるべきかと、どのクラスターが答えるかを書き、クラスターはその名前の後ろにどのアドレスがあるかを書きます。

```json
{
  "ReverseProxy": {
    "Routes": {
      "app": {
        "ClusterId": "app",
        "Match": { "Path": "/app/{**catch-all}" }
      },
      "api": {
        "ClusterId": "api",
        "Match": { "Path": "/api/{**catch-all}" }
      }
    },
    "Clusters": {
      "app": {
        "LoadBalancingPolicy": "PowerOfTwoChoices",
        "HealthCheck": {
          "Active": {
            "Enabled": true,
            "Interval": "00:00:05",
            "Path": "/healthz"
          }
        },
        "Destinations": {
          "a1": { "Address": "http://10.0.1.11:8080/" },
          "a2": { "Address": "http://10.0.1.12:8080/" }
        }
      },
      "api": {
        "Destinations": {
          "api1": { "Address": "http://10.0.2.11:8080/" }
        }
      }
    }
  }
}
```

これが場面の三つめの段階を文字にしたものです。アクティブヘルスチェックがあの監視にあたります。`a1` が `/healthz` に答えなくなると宛先の集合から外れ、新しいリクエストは `a2` へ向かい、また答え始めれば戻ってきます。クライアントのリクエストで変わるものは一つもなく、それこそが要点です。間隔とは、すでに死んだ相手にプロキシが仕事を送り続けられる時間の長さなので、議論すべきは仕組みではなくその数字です。

バックエンド側には必ずやるべきことが一つあり、それが最も飛ばされやすい箇所です。前にプロキシが立った瞬間、`HttpContext.Connection.RemoteIpAddress` はプロキシになり、クライアントが HTTPS で来ていても `Request.Scheme` は `http` になります。`UseForwardedHeaders` が本来の値を戻しますが、何を信じるかは教えてやる必要があります。

```csharp
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

    // The defaults trust only loopback. Say which proxies are yours.
    options.KnownProxies.Clear();
    options.KnownNetworks.Clear();
    options.KnownNetworks.Add(new IPNetwork(IPAddress.Parse("10.0.0.0"), 8));

    // Two hops in front means two addresses in the header.
    options.ForwardLimit = 2;
});

var app = builder.Build();

// Before anything that reads the scheme or the client address.
app.UseForwardedHeaders();
app.UseAuthentication();
```

この順序は飾りではありません。認証もレート制限も HTTPS リダイレクトもリクエストログも、すべて `UseForwardedHeaders` が書いた値を読むので、それらより前に来ます。遅れて実行するとリダイレクトの輪ができます。サービスは `http` を見て `https` へ飛ばし、プロキシは同じリクエストをまた `http` として入れ直します。

設定では表現できない規則が要るときは、YARP が変換を用意しています。同じパイプラインの考え方を一つのルートに当てはめたものです。

```csharp
builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // The seat knows which cluster answered; the client should not.
        context.AddResponseHeaderRemove("Server");
        context.AddRequestTransform(transform =>
        {
            transform.ProxyRequest.Headers.Remove("X-Internal-Token");
            return ValueTask.CompletedTask;
        });
    });
```

場面の最後の段階は、ここからさらに進めると何が起きるかを見せています。ルートに `.RequireAuthorization()` を付け、`MapReverseProxy` の前に `AddRateLimiter` を置き、二つのクラスターへ広げて答えをまとめるエンドポイントを作る、といった具合です。それでもこの席の正体は変わりません。相変わらず複数のサービスの前にある一つのアドレスであり、ここに何かを足すときに慎重であるべき理由は、ここに置く規則が一つ増えるたびに、どのサービスも単独では見ることも試すことも考えることもできない規則が一つ増えるからです。
