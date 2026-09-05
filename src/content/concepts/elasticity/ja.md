---
title: "Elasticity"
summary: "弾力性とは需要を追いかける容量のことです。負荷が上がればレプリカが増え、リクエスト値がずれたポッドはサイズが直され、その下のノードプールも合わせて増減します。いつか要るかもしれないものではなく、今動いているものに支払います。"
category: "コンテナーとオーケストレーション"
scene: elasticity
steps:
  - title: "固定容量は 1 日に二度失敗します"
    text: "朝のピークにはポッド 3 つが溺れ、ユーザーが待ちます。深夜 3 時には同じ 3 つが遊んでいるのに、料金は走り続けます。ピークに合わせれば夜が無駄になり、夜に合わせれば朝が壊れます。弾力性はその選択を拒みます。容量が需要を推測する代わりに、追いかけます。"
  - title: "まず水平です。同じポッドを増やします"
    text: "需要が上がり CPU が目標を超えると、オートスケーラーがレプリカを 1 つ足します。同じサービスの後ろに同じポッドが並び、分け前を受け持ちます。需要が下がれば余分は取り除かれますが、遅れを置いてです。性急な縮小はさざ波を再起動の嵐に変えます。"
  - title: "ポッドそのものが間違ったサイズなら垂直です"
    text: "1 年前に書いたリクエスト値が今日の負荷と出会います。あるポッドは小さすぎる箱の中で枯渇し、別のポッドは使う量よりはるかに大きな箱に収まっています。垂直オートスケーラーは再起動という代価を払って、それを正します。"
  - title: "ノードプールも弾力的です。ポッドには立つ場所が要りますから"
    text: "スケールアウトがノードを満たすと次のポッドは pending になり、クラスターオートスケーラーがそのポッドのために機械を足します。需要が引けば、空になったノードはドレインされて返されます。料金がようやく仕事を追いかけます。いつか要るかもしれないものではなく、今動いているものに支払うのです。"
related:
  - label: Horizontal Pod Autoscaler
    slug: horizontal-pod-autoscaler
  - label: Vertical Pod Autoscaler
    slug: vertical-pod-autoscaler
  - label: Cluster Autoscaler
    slug: cluster-autoscaler
  - label: Resource Limit
    slug: resource-limit
  - label: Memory Pressure
    slug: memory-pressure
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Rolling Update
    slug: rolling-update
  - label: Load Balancer
    slug: load-balancer
  - label: Backpressure
    slug: backpressure
  - label: Throughput
    slug: throughput
references:
  - title: "Kubernetes: autoscaling workloads"
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/
  - title: "Kubernetes: cluster autoscaling"
    url: https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/
  - title: "Scaling options for applications in AKS"
    url: https://learn.microsoft.com/en-us/azure/aks/concepts-scale
---

## いつ使うか

- 時間帯やイベントで上下する需要です。1 日の周期、キャンペーン、バッチ枠のように、トラフィックのグラフが水平線ではなく形を持っている場合です。
- 「念のため」に残した遊休容量に料金を払っていて、その「念のため」が 1 日の大半を占めている場合です。
- 固定した規模では吸収できないピークでレイテンシの予算が壊れる場合です。ピークに合わせて買うと、週に数時間のために買うことになります。
- レプリカ数やリソースのリクエスト値を最後に見直してから何か月も経っている Kubernetes のワークロードです。その数字は、すでに変わってしまったワークロードに合っていた値です。

## 注意点

- 弾力性には、それを見て動ける信号が要ります。アプリケーションが実際に詰まる場所ではない指標でオートスケールすると、見当違いのものが高くつく形で増えます。データベースを待っているサービスについて CPU は何も語りませんし、すでに飽和したコンシューマーグループのキューにレプリカを足しても接続が増えるだけです。
- スケールアウトの速さはポッドの起動より速くなりません。イメージのプル、JIT のウォームアップ、キャッシュの温めが、トラフィックの到着と容量の到着のあいだにすべて入ります。その隙間が 1 分なら、5 分のピークはポッドが準備できる前に半分終わっています。イメージを先に取っておき、起動を軽く保ち、その隙間を埋める余裕容量を残してください。
- 水平オートスケーラーと垂直オートスケーラーを同じ指標に向けると互いに争います。責任を分けてください。水平は負荷に、垂直はサイズの是正に向けるか、垂直側は推奨モードで回して学んだ値を人が反映する方法があります。
- 危ないのは縮小の方向で、しかも中断予算はここでは役に立ちません。レプリカ数を下げるとコントローラーがポッドを削除しますが、これは eviction API を通らないので予算を参照しません。予算が制約するのは、ノードのドレインやクラスターの縮小から来る退避のほうです。縮小を安全にするのは安定化ウィンドウと、ポッドが抱えていた仕事を仕上げる正常終了です。増やすときは積極的に、減らすときは辛抱強くというのは一貫性のなさではなく、それ自体が要点です。
- 状態を持つワークロードは伸び方が違います。ストレージはステートレスなポッドのようには増えませんし、シャードやリースを持つレプリカは単純に倍にできません。弾力性がよく効くのは状態を持たない層で、状態を持つ層には別の計画が要ります。
- クラスターオートスケーラーは使用量ではなくリクエスト値から容量を計画します。リクエスト値がずれたワークロードは、同じ方向にずれたノードプールを手にします。サイズの是正が容量計画と別の問題ではなく、その入力である理由です。

## .NET では

仕事の大半はマニフェストではなくアプリケーション側にあります。水平に増えるサービスは、2 つ目のコピーが必要とするものをローカルに抱えず、止まれと言われたら手元の仕事を仕上げ、実際に応答できるようになるまでは自分を準備できていないと報告する必要があります。

```csharp
var builder = WebApplication.CreateBuilder(args);

// 共有状態はポッドの外に置きます。どのレプリカでもどのリクエストに答えられます。
// これが登録するのは `IDistributedCache` で、セッション状態にはさらに `AddSession` が要ります。
builder.Services.AddStackExchangeRedisCache(options =>
    options.Configuration = builder.Configuration.GetConnectionString("Redis"));

// 準備状態がトラフィックを制御します。応答できないのに ready と報告するポッドは
// 急増をより悪くします。ロードバランサーが分け前を送り、それが失敗するからです。
builder.Services.AddHealthChecks()
    .AddCheck<WarmupHealthCheck>("warmup", tags: ["ready"]);

var app = builder.Build();
app.MapHealthChecks("/healthz/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});

// 縮小は退避です。プロセスが去る前に手にした仕事を終わらせます。
var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() => Drain.Begin());
app.Run();
```

HTTP ではなくキューが駆動する仕事なら、KEDA がキューの長さやコンシューマーの遅れを直接見てスケールします。ワーカーが遅れ始めたときに実際に動く信号がそれです。バッチのあいだはゼロまで縮めることもできますが、これは CPU ベースの規則では不可能です。やることのないワーカーはどちらにせよ CPU を使わないからです。
