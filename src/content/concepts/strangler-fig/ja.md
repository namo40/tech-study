---
title: "Strangler Fig"
summary: "Strangler Fig はシステムを機能 1 つずつ置き換えます。古いシステムの前にルーティングの facade を置き、機能を作り直してはその経路だけを新しい側へ切り替えます。古いシステムはそのぶん小さくなり、やがて facade の後ろには何も残らなくなります。"
category: "アプリケーションアーキテクチャ"
scene: strangler-fig
steps:
  - title: "まず facade を置く"
    text: "古いシステムの前にルーターを置きます。初日は何も変わりません。すべての経路がまだ legacy を指しています。変わったのは、これから経路を 1 つずつ移せるということです。"
  - title: "機能を 1 つ移す"
    text: "customers を新システムに作り直し、その経路だけを切り替え、ほかはそのままにします。新しいコードがまだ古いデータを必要とするところでは、anti-corruption layer が legacy のモデルを漏らさずに翻訳します。"
  - title: "少しずつ切り替える"
    text: "orders のトラフィックの 1 割を新しいコードに送り、次に半分、そして全部にします。失敗したときはデプロイを戻すのではなく、経路を戻すだけです。"
  - title: "何も残らなくなるまで"
    text: "reports が最後に移り、データも一緒に移ります。古いシステムは、すべての行が new を指すルーターの後ろで退役します。移行は最後までやり切ります。半分だけ移したシステムは両方の欠点だけが残ります。"
related:
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Facade
    slug: facade
  - label: Adapter
    slug: adapter
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: YARP
    slug: yarp
  - label: API Gateway
    slug: api-gateway
  - label: Canary Release
    slug: canary-release
  - label: Modular Monolith
    slug: modular-monolith
  - label: Database per Service
    slug: database-per-service
  - label: Bounded Context
    slug: bounded-context
references:
  - title: Strangler Fig pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
  - title: Anti-Corruption Layer pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  - title: YARP configuration files
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/config-files
---

## いつ使うか

- 一度に書き直すには大きすぎる、あるいは危険すぎるシステムを置き換えるとき。
- 機能を経路の後ろに分けられ、移したあとはそれぞれにデータの持ち主がはっきりしているとき。
- 古いシステムを再デプロイせずに機能 1 つを戻せる必要があるとき。

## 注意点

- 移す前に機能ごとのデータの持ち主を決めます。anti-corruption layer は翻訳であって、共有データベースではありません。
- 経路を切り替えた機能は、古い経路が退役するまで両側を観測できるようにしておきます。
- facade を新しいモノリスにしないでください。facade は経路を決めるだけで、ロジックを持ちません。
- 最後までやり切ります。途中で止まった移行は、運用する面積を恒久的に 2 倍にします。

## .NET では

YARP の facade は、経路の指すクラスターを変えるだけで機能を 1 つずつ移します。次の設定では `customers` はすでに移り、`orders` はカナリアの分だけ新システムに向き、`reports` はまだそのままです。

```json
{
  "ReverseProxy": {
    "Routes": {
      "customers": { "ClusterId": "new",    "Match": { "Path": "/customers/{**rest}" } },
      "orders-canary": {
        "ClusterId": "new", "Order": 0,
        "Match": { "Path": "/orders/{**rest}", "Headers": [ { "Name": "X-Canary", "Values": [ "1" ] } ] }
      },
      "orders":    { "ClusterId": "legacy", "Order": 1, "Match": { "Path": "/orders/{**rest}" } },
      "reports":   { "ClusterId": "legacy", "Match": { "Path": "/reports/{**rest}" } }
    },
    "Clusters": {
      "legacy": { "Destinations": { "d1": { "Address": "https://legacy.internal/" } } },
      "new":    { "Destinations": { "d1": { "Address": "https://shop-new.internal/" } } }
    }
  }
}
```

```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.MapReverseProxy();
```

経路は設定なので、戻すのも設定の変更です。古いシステムを再デプロイする必要も、コミットを取り消す必要も、2 つのバージョンが中途半端に同時に動く時間帯もありません。ヘッダーではなく割合で分けるのも、同じ考えをもう一歩進めたものです。一部のクライアントだけが持つヘッダーやクッキーで一致させるか、両方の宛先を持つクラスターにカスタムのロードバランシングポリシーを付けて作ります。
