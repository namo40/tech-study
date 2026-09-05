---
title: "Sticky Session"
summary: "Sticky Session は、各ユーザーをそのユーザーのメモリー内状態を持つインスタンスに固定します。状態を持つアプリを複数台に広げられる代わりに、負荷が偏り、インスタンスが消えるとセッションも消えます。セッションを共有ストアに移せば、この固定そのものが不要になります。"
category: "サーバー状態管理"
scene: sticky-session
steps:
  - title: "ラウンドロビンにメモリー内セッション"
    text: "A が inst 1 でログインします。次のリクエストは A を見たことのない inst 2 に落ち、ログアウトされます。このアプリはサインイン状態をセッションに持っているからです。B も inst 3 でログインし、次のリクエストは inst 1 に落ちて、またログアウトされます。"
  - title: "Sticky"
    text: "ロードバランサーが Cookie を付け、A のすべてのリクエストを inst 1 に戻します。動きはします。代わりに、忙しいユーザー 1 人が 1 つのインスタンスに集中し、別のインスタンスは遊ぶことになります。"
  - title: "インスタンスが消えればセッションも消える"
    text: "デプロイで inst 1 が再起動します。A の Cookie はまだそこを指していますが状態は消えており、A は順番が回ってきたインスタンスでもう一度ログインします。ロールアウトのたびに誰かがログアウトされます。"
  - title: "セッションを外に出す"
    text: "共有ストアに置けば、どのインスタンスでもどのユーザーでも処理できます。デプロイで人がログアウトされることはなくなり、負荷は均等に広がり、スティッキーセッションはキャッシュのための任意の最適化になります。"
related:
  - label: Session State
    slug: session-state
  - label: Distributed Session
    slug: distributed-session
  - label: Stateless Server
    slug: stateless-server
  - label: Stateful Server
    slug: stateful-server
  - label: Load Balancer
    slug: load-balancer
  - label: Round Robin
    slug: round-robin
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
  - label: Rolling Update
    slug: rolling-update
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
  - title: YARP session affinity
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/session-affinity
---

## いつ使うか

- つなぎとして使います。既存のアプリケーションが状態をメモリーに持っていて、今日すぐ複数インスタンスで動かす必要があり、作り直しは今週の仕事ではない場合です。
- 最適化として使います。ユーザーがよく触るデータがインスタンスごとにキャッシュされていて、同じところへ戻せばキャッシュを作り直す手間が省け、どこに落ちても正しさは変わらない場合です。

## 注意点

- スティッキーセッションは永続性ではありません。スケールイン、デプロイ、クラッシュで、そのインスタンスに固定されたセッションはすべて失われ、サインイン状態をセッションに持つアプリでは、ユーザーにはエラーではなくログアウトとして見えます。ASP.NET Core では ID は認証 Cookie に載るので、同じ症状はたいてい、下で述べるキーリングが共有されていないことを意味します。
- 負荷は、たまたま忙しいユーザーを抱えたインスタンスに偏ります。オートスケーリングが容量を足しても、ルーティングがすでにその容量を使わないと決めています。
- ASP.NET Core では、セッション状態を移すだけでは足りません。Data Protection のキーリングも共有する必要があり、そうしないと、あるインスタンスが発行した認証 Cookie を次のインスタンスが拒否します。
- ゲームルームやリアルタイム共同編集のように状態と計算が同じ場所にあるべき場合は、スティッキーセッションや無状態を無理に当てはめるより、状態を明示的に分けるパーティションモデルを選びます。

## .NET では

```csharp
var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis"]!);

// セッション状態は Redis にあるので、どのインスタンスからも読めます。マルチプレクサーは
// 1 つを下のキーリングと共有し、インスタンスごとに 2 本目の接続を張ることはしません。
builder.Services.AddStackExchangeRedisCache(options =>
    options.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis));
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(20);
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
});

// キーリングも共有しなければなりません。さもないと、あるインスタンスで署名した
// Cookie を次のインスタンスが読めなくなります。
builder.Services.AddDataProtection()
    .PersistKeysToStackExchangeRedis(redis, "shop:data-protection-keys")
    .SetApplicationName("shop");

var app = builder.Build();
app.UseSession();
```

YARP やクラウドロードバランサーの session affinity は、役に立つなら有効にしたままで構いません。ただし、正しさのためではなくキャッシュヒットのために使います。セッションが共有ストアに入ってしまえば、リクエストが別のインスタンスに落ちても往復が 1 回増えるだけで、ほかに失うものはありません。
