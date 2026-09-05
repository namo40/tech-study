---
title: "Dependency Injection"
summary: "Dependency Injection は、頼むことと作ることを分けます。クラスは必要なものを宣言し、コンテナー 1 つが何をどう作るかを知り、リクエストごとにグラフが注文どおり組み立てられます。そしてすべてのインスタンスの寿命 (singleton、scoped、transient) は、先に new を呼んだ側ではなく登録が決めます。"
category: ".NET ランタイムとホスティング"
scene: dependency-injection
steps:
  - title: "new は設計を手で配線します"
    text: "ゴーストは各クラスが自分の依存を直接作るのを見せます。その依存たちもそれぞれの依存を作り、選択がグラフの奥深くまで配線されます。実装を 1 つ替えると、灯りのついた場所すべてが手を入れる場所になり、クラス 1 つをテストしようとすると木全体が付いてきます。解決は 1 つの分離です。クラスは必要を宣言し、製作は 1 つの場所が行うのです。"
  - title: "コンテナーはグラフを注文どおりに組み立てます"
    text: "登録は契約を実装につなぎます。リクエストが来ると、コンテナーはコンストラクターの連鎖をたどり、各部品が宣言した必要を作って満たします。どのクラスも、他のクラスが何でできているかを知りません。実装の差し替えはいまや登録 1 行で、グラフは自分で組み直され、テストも同じ道で偽物を渡します。"
  - title: "寿命は登録が決めます"
    text: "リクエストを 2 つ回して箱を数えてください。singleton は 1 つのインスタンスで両方に答え、scoped はリクエストごとに 1 つ作り、transient は注入ごとに 1 つ作ります。同じクラスでも成長曲線は 3 つです。そしてその選択は、型が使われる場所ではなく登録される場所で下されます。寿命のバグの大半は、その 2 つの場所の食い違いです。"
  - title: "コンテナーにも自分の生があります"
    text: "建てられるのは一度だけです。最初のリクエストより前に建てられ、そのときに登録も閉じました。スコープは閉じるたびに自分のインスタンスを連れて行き、作った順の逆で破棄します。終了時も同じです。"
related:
  - label: Hexagonal Architecture
    slug: hexagonal-architecture
  - label: Adapter
    slug: adapter
  - label: Clean Architecture
    slug: clean-architecture
  - label: Middleware Pipeline
    slug: middleware-pipeline
  - label: IHostedService
    slug: ihostedservice
  - label: Background Service
    slug: background-service
  - label: DbContext
    slug: dbcontext
  - label: Unit of Work
    slug: unit-of-work
  - label: Application Lifetime
    slug: application-lifetime
  - label: Graceful Shutdown
    slug: graceful-shutdown
references:
  - title: Dependency injection in .NET
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview
  - title: Dependency injection guidelines
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines
  - title: Dependency injection in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection
---

## いつ使うか

- ASP.NET Core ではすでに既定なので、使うかどうかではなく何が得られるかが本当の問いです。フレームワークがコントローラー、Minimal API のハンドラー、フィルター、ホステッドサービスをすべてコンテナーから組み立てるため、コンストラクター注入に追加の費用はなく、それ以外のやり方はフレームワークに逆らって泳ぐことになります。クラスは必要なものをコンストラクターに宣言し、それがどこから来るかは考えないでおきます。
- 同じ契約に正直な実装が 2 つ以上あるとき、そこが登録の出番です。本番では実際のメール送信、テストでは記録するだけの偽物、実時計と固定時計、クラウドのストレージをローカルではフォルダーに置き換える場合などです。試験対象のクラスは変わらず、違いはコンポジションルートの 1 行だけです。これが日々の見返りであり、テスト容易性と差し替え容易性が同じ性質を 2 つの角度から見たものである理由です。
- 横断的な振る舞いは継承ではなく組み合わせで載せます。ハンドラーを再試行で包むデコレーター、ハンドラー連鎖を持つ型付き `HttpClient`、`IEnumerable<IValidator<T>>` として解決される検証器の束は、どれも登録時点の配置であり、包まれる側のクラスは自分が包まれたことを知る必要がありません。
- 設定もオプションパターンで同じ道から入ってくるようにします。`IOptions<T>` とそのスナップショット、モニターの変種は、設定を注入される依存として表したものです。おかげでクラスが設定システムを直接読まずに済み、その設定値は他の依存と同じようにテストで差し替えられます。
- グラフが 2 段より深くなった時点から、コンテナーは元を取ります。クラスが 3 つしかない小さなコンソールツールなら、`Main` で手で結ぶのも正当なコンポジションルートで、そのためにコンテナーは要りません。コンテナーが買ってくれるのは、4 段目が現れても 3 段目が変わらないという性質です。

## 注意点

- キャプティブ依存は、このページが存在する理由です。scoped のサービスを singleton に注入すると、singleton は最初に渡されたインスタンスを掴み、プロセスが生きているあいだずっと持ち続けます。`DbContext` が代表的な犠牲者です。scoped で登録されているのには理由があり、スレッドセーフではなく、singleton が 1 つを握った瞬間、リクエスト単位の作業単位だったものが変更追跡が際限なく膨らむ共有オブジェクトになり、古くなったエンティティとリクエストをまたぐ汚染を生みます。依存は、自分を握っているものより長く生きてはいけません。
- スコープ検証がこれを代わりに捕まえてくれますが、有効になっているときだけです。組み込みのコンテナーは Development 環境でのみスコープを検証し、Production では検証しないため、ローカルで一度も踏まなかった経路が作ったキャプティブ依存はそのまま出荷されます。テストが走る環境では `ValidateScopes` と `ValidateOnBuild` を明示的に有効にしてください。そうすればこの欠陥は、目立たない本番のバグから CI の起動時例外へと居場所を変えます。
- singleton が本当に scoped のサービスを必要とするなら、`IServiceScopeFactory` を注入して作業単位ごとにスコープを開きます。これはバックグラウンドのコードですでに使われている実務の形で、ホステッドサービスが反復ごとに行っていることそのものであり、Background Service のページが適用側から描く絵も同じです。スコープを作り、その中で解決し、仕事をして、スコープを捨てます。解決したインスタンスをスコープの外へ持ち出さないでください。
- `IServiceProvider` を注入してクラスの中で `GetService` を呼ぶと、取り除いたはずの配線を元の場所に戻すことになります。依存はコンストラクターから見えなくなり、足りなくてもコンパイラーは教えてくれず、テストはオブジェクトを渡す代わりにコンテナーを建てる羽目になります。フレームワークが直接渡してくる場所で、かつ実行時まで型が分からない場合にだけプロバイダーを使い、それ以外では必要なものそのものを頼みます。
- パターンがそう言うからという理由で、すべてのクラスにインターフェイスを 1 つずつ登録するのは儀式です。実装がちょうど 1 つしかなく、2 つ目の実装も見当たらず、それを偽物に差し替えるテストもないインターフェイスは、理由もなく保守するファイルです。具象型を登録すれば十分です。インターフェイスは後から入れても小さく機械的な変更であり、先に入れるとすべてのスタックトレースに間接層が 1 つ増えます。
- 破棄は所有をたどり、作った順の逆に走ります。コンテナーは自分が作ったものを、スコープはスコープが作ったものを破棄し、`new` で自分で建てて登録に渡したものは自分で破棄します。ルートのプロバイダーから解決した `IDisposable` な transient はルートに掴まれ、終了までは離されません。これは漏れのように見えますし、実際に漏れです。
- 非同期の破棄には非同期のスコープが必要です。`IAsyncDisposable` を実装したサービスを、同期的に捨てたスコープの中で解決していると、例外になるかブロッキングの破棄に落ちます。スコープには `await using` を、プロバイダーには `DisposeAsync` を使います。スコープをフレームワークではなく自分で作るバックグラウンドのループでは特に間違えやすい場所です。
- 寿命の表は覚えられるほど短く、バグの大半はその表の 1 行です。singleton の中の transient は合法ですが凍りつきます。登録が何と言おうと、プロセスが生きるあいだインスタンスは 1 つです。singleton の中の scoped はバグです。何の中の singleton でも問題ありません。scoped の中の scoped は同じスコープを共有するので問題ありません。残りはすべて、いま自分がどのスコープの中にいるのかという問いです。

## .NET では

登録はメソッド 3 つで、3 つの違いは作られたものがどれだけ長く生きるかだけです。

```csharp
// アプリケーション全体で 1 つ。スレッドセーフでなければならず、
// 自分より短く生きるものを握ってはいけません。
builder.Services.AddSingleton<IClock, SystemClock>();

// スコープごとに 1 つ。ウェブアプリケーションではリクエストごとという意味です。
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddDbContext<ShopContext>(options => options.UseSqlServer(cs));

// 注入されるたびに新しいインスタンス。安価で、状態を持たず、共有されません。
builder.Services.AddTransient<IPriceCalculator, PriceCalculator>();
```

これらを名前で探しに行く場所はありません。クラスはコンストラクターに必要を宣言し、コンテナーが埋めます。

```csharp
public sealed class CheckoutService(
    IOrderRepository orders,
    IPriceCalculator prices,
    IClock clock)
{
    public async Task<Receipt> PlaceAsync(Cart cart, CancellationToken token) =>
        await orders.SaveAsync(prices.Total(cart), clock.UtcNow, token);
}
```

ビルドの失敗が本番の事故より安い環境なら、どこでも検証を有効にします。

```csharp
builder.Host.UseDefaultServiceProvider((context, options) =>
{
    // singleton に掴まれた scoped のサービスを捕まえ、しかもそれを
    // たまたま当たった最初のリクエストではなく起動時に捕まえます。
    options.ValidateScopes = true;
    options.ValidateOnBuild = true;
});
```

singleton が scoped のものを必要とするときは、1 つを握る代わりに自分のスコープを開きます。

```csharp
public sealed class OutboxPump(IServiceScopeFactory scopeFactory)
{
    public async Task PumpAsync(CancellationToken token)
    {
        // 反復ごとにスコープ 1 つ。DbContext はリクエストの中でそうであるように、
        // この中で生まれてこの中で死にます。
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ShopContext>();
        await db.DispatchPendingAsync(token);
    }
}
```

残りはホストの仕事です。`IHostApplicationLifetime` が開始、停止要求、停止完了のイベントを渡し、`builder.Services.Configure<T>` と `IOptions<T>` が設定を他と同じ注入される依存にし、`IHost.StopAsync` がホステッドサービスを止め、そのあとホストを破棄する (`Run` なら代わりにやってくれます) ことで、コンテナーと、まだ握っていたものが作った順の逆で手放されます。アプリケーションの寿命がコンテナーの寿命であり、残りのすべてはそのスコープのどれかの中で生きています。
