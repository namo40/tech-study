---
title: "HttpClient Connection Pool"
summary: "HttpClient が再利用する接続は、クライアントではなくその下のハンドラーにあります。SocketsHttpHandler がエンドポイントごとにプールを持ち、接続を貸し出します。このプールを正しく使うことは、おおむね 2 つの判断、すなわちプール内の接続がどれだけ長く生きてよいかと何本まであってよいかであり、そこに共有すべき相手はハンドラーだという規則が加わります。"
category: "エッジ、ルーティングとサービスネットワーク"
scene: multiplexing
sceneStep: 1
related:
  - label: Multiplexing
    slug: multiplexing
  - label: Keep-Alive
    slug: keep-alive
  - label: HTTP/2
    slug: http-2
  - label: Connection Lifetime
    slug: connection-lifetime
  - label: Database Connection Pool
    slug: database-connection-pool
  - label: Idle Timeout
    slug: idle-timeout
references:
  - title: "HttpClient guidelines for .NET"
    url: https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines
---

シーンの最初のステップは、リクエストの間も生き残る接続です。.NET でその生き残る接続を所有しているのは `HttpClient` ではなく、その下のハンドラーで、.NET Core 2.1 からそのハンドラーは `SocketsHttpHandler` です。このハンドラーは張り終えた接続のプールを保ち、リクエストごとに 1 本を貸し、空きがないときだけ新しく開きます。プールはエンドポイント単位に分かれており、ここでのエンドポイントとはスキームとホストとポートをまとめたものに加えて、使っているプロキシと資格情報とクライアント証明書までを指します。ですから `https://a.example` と `https://b.example` は接続を分け合わず、別々の証明書で構成された 2 つのクライアントも同じです。だからこそ、その上に載せるどの設定よりもオブジェクトの組み立て方のほうが効きます。`HttpClient` はハンドラーを薄く包んだものなので、呼び出しごとに作って捨てれば毎回プールを丸ごと捨てることになり、ソケットが `TIME_WAIT` に積み上がるあいだ、次の呼び出しは一からハンドシェイクします。プロセスの寿命いっぱい生きるクライアント 1 つ、あるいはその世話を代わりにしてくれる `IHttpClientFactory` が、プールが存在するための条件です。

```csharp
var handler = new SocketsHttpHandler
{
    PooledConnectionLifetime = TimeSpan.FromMinutes(2),
    PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
    MaxConnectionsPerServer = 50,
};
var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.example") };
```

`PooledConnectionLifetime` は理解しておく価値のある設定です。その目的が健康確認でも資源の節約でもないからです。接続は開いたときに決まった IP アドレス 1 つへ向かう TCP のセッションで、存在するあいだずっとそのアドレスと話し続けます。そのあとで DNS が何を言おうと関係ありません。サービスを新しいアドレスへ移したり、台数を増やしたり、障害切り替えをしたりしても、長く生き残ったプール内の接続は昨日の地形を呼び続けます。クライアントが DNS を無視しているのではなく、引かない名前を解決し直す理由がないだけです。接続を定期的に引退させることがその解決をもう一度起こす仕組みで、穴を埋める新しい接続は、いまのルーティングが送る先へ向かいます。これはデータベースのプールの connection lifetime がサーバーノードについて述べる論と正確に同じで、1 階層下で同じ結論に至ります。この値はタイムアウトではなく再均衡の間隔だ、という結論です。既定は無限なので素のハンドラーでは自分で入れる設定であり、`IHttpClientFactory` はハンドラーそのものを 2 分周期で入れ替える形で、同じ問題を反対側から扱います。2 つの仕組みは重なるので、いまの指針は pooled connection lifetime を設定してハンドラーの寿命には触れないほうです。

`PooledConnectionIdleTimeout` は残り半分で、使われていない接続がプールにどれだけ留まってから閉じられるかを決めます。データベースのプールが自分の接続に当てる、使われていない時間を基準にした回収と同じものです。keep-alive の競合にいちばん近く立っている設定でもあります。この値がネットワーク経路上の待機切断より短いほど、接続を引退させる側がクライアントになることが増え、他人がすでに引退させた接続をあとから見つけることが減るからです。`MaxConnectionsPerServer` は目標ではなく天井で、既定は無制限であり、制限のないファンアウトを見通せる待ち行列に変えるつまみです。

ファクトリーがこれらをどう並べるかは、いちばん驚かれる点です。名前付きクライアントや型付きクライアントは自分のハンドラーを所有しません。ファクトリーが名前ごとにハンドラーの連鎖を 1 つ持ち、その名前で作られるすべてのクライアントに渡します。だから型付きクライアントを transient で登録しても害はなく、その背後の接続は依然として共有されプールに入っています。同時に、ハンドラーの構成は名前単位だという意味でもあるので、同じホストを指す型付きクライアントでも名前が違えばハンドラーが違い、したがってプールも違います。HTTP/2 になると、そのプールが数えている対象そのものが変わります。接続 1 本が同時のストリームをいくつも運ぶので、サーバーあたりの接続数は HTTP/1.1 でのような同時実行の上限ではなくなります。そうした接続を 2 本以上許すハンドラーの設定は HTTP/2 のページで扱います。そもそもなぜ接続が持続するのか、向こう側が先に閉じたら何が起きるのかというプロトコル側の話は、keep-alive の担当です。
