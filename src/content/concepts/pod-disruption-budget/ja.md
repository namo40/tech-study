---
title: "Pod Disruption Budget"
summary: "Pod Disruption Budget は、自発的に一度に降ろせるポッドの数を制限します。そして実際に降りるポッドは preStop、SIGTERM、猶予期間という儀式を通って出ていくので、計画されたメンテナンスが障害のようには見えません。"
category: "コンテナーとオーケストレーション"
scene: pod-disruption-budget
steps:
  - title: '予算は「降ろせ」を「一度に 1 つずつ」に変えます'
    text: "ドレインはポッドを 2 つ降ろしたがり、予算は 2 つが ready であることを要求します。だから退避はちょうど 1 つだけ進み、もう 1 つは待ちます。拒否ではなく保留です。メンテナンスが障害ではなく行列になります。"
  - title: "退場は儀式であって、停電ではありません"
    text: "まず preStop フックが動きます。新しい仕事を受けず、接続を空けます。次が SIGTERM です。処刑ではなく要請であり、アプリは抱えていたものを仕上げます。どのステップも、リクエストが飛行中に死なないためにあります。"
  - title: "猶予期間は、期限のある忍耐です"
    text: "アプリが間に合ったので、終了は正常なまま残りました。期限を過ぎてぐずぐずしていたら、SIGKILL が会話を終わらせます。フラッシュも別れの挨拶もありません。猶予は希望まじりの既定値ではなく、最も長い正直なシャットダウン時間に合わせます。"
  - title: "予算が実際に買ってくれたものです"
    text: "交代のポッドが上がり、準備数が 3 つに戻り、そこで初めて 2 つ目の退避が始まります。ドレインの全過程で ready は 2 つを下回ったことがなく、SLO ランプは一度も瞬きませんでした。それが製品のすべてです。ユーザーに感知できない計画作業。"
related:
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: SIGTERM
    slug: sigterm
  - label: Pre-Stop Hook
    slug: pre-stop-hook
  - label: Termination Grace Period
    slug: termination-grace-period
  - label: Rolling Update
    slug: rolling-update
  - label: Readiness Probe
    slug: readiness-probe
  - label: Connection Draining
    slug: connection-draining
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Health Check
    slug: health-check
references:
  - title: "Disruptions"
    url: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
  - title: "Specifying a Disruption Budget for your Application"
    url: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
  - title: "Pod Lifecycle"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
  - title: ".NET Generic Host: host shutdown"
    url: https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host
---

## いつ使うか

- レプリカ数がスループットではなく可用性のために存在する Deployment に使います。1 つ失っても耐えられるように写しを 3 つ置いているなら、プラットフォームが 3 つまとめて持っていくのを止められるのは予算だけです。Kubernetes の他のどれも、そのポッド 3 つが同じ約束の写し 3 つだということを知りません。
- 人がサービスを使っている最中に初めてノードをドレインする前に使います。ドレイン、クラスターのアップグレード、ノードプールの入れ替え、オートスケーラーによるノードの統合は、ワークロードから見ればすべて同じ出来事です。アプリケーションの外側の何かが、ポッドを動かすと決めたのです。予算は、その決定を深夜 3 時ではなく午後 2 時に下しても安全なものにします。
- ドレインするのが人ではなくコントローラーのときに使います。Cluster Autoscaler、Karpenter、マネージドのノードアップグレード、descheduler はどれも eviction API を通り、どれも予算を守り、どれも先に尋ねてはくれません。予算は彼らが読む唯一の指示書です。
- `minAvailable` を SLO に書ける数にしたいときに使います。3 つのうち 2 つという値はプラットフォームチームが思いついた数ではなく、サービスがレイテンシ目標の中で応答したまま失える容量がどれだけかという言明です。予算はレプリカ数ではなく、その数から書きます。
- 1 つのノードに複数のワークロードが載っていて、壊れ方がそれぞれ違うときに使います。ドレインはノード上のすべてを一度に動かすので、いちばん神経質なワークロードの予算がそのノードの速度を決めます。予算をまったく持たないワークロードは、何の速度も決めません。

## 注意点

- 予算が守るのは自発的な中断だけです。カーネルパニック、壊れたディスク、電源が落ちたノード、OOM による強制終了は eviction API に許可を求めませんし、予算も消費しません。`minAvailable: 2` は常に 2 つが ready だという意味ではありません。2 つを下回る原因がプラットフォームではない、という意味です。ずっと小さな約束ですが、それでも持つ価値のある約束です。
- `minAvailable` をレプリカ数と同じにすると、あらゆるドレインがデッドロックします。レプリカ 3 つに `minAvailable: 3` なら許される中断は永遠に 0 なので、クラスターのアップグレードを始めたノードドレインが詰まり、再試行し、また詰まり、アップグレードは終わりません。壊れ方は静かです。何も落ちず、ドレインがただ戻ってこないだけです。`maxUnavailable: 0` は同じ間違いを裏返して書いたものです。
- 予算は ready の数に対する算数であり、ready が嘘をつけばその算数は無価値です。接続を拒否しながら readiness プローブに 200 を返すポッドは `minAvailable` に数えられますが、誰の役にも立っていません。予算が守るものはすべて、プローブが「このポッドは今リクエストを処理できるか」に正直に答えるという前提の上に立っています。
- ポッドは削除された時点でエンドポイントから外されますが、その写しが追いつくには時間がかかります。このポッドを指すエンドポイントの一覧はクラスターのすべてのノードにあるので、「このポッドはいなくなる」と「もう誰も私にルーティングしていません」の間には時間差ができます。preStop フックは、まさにその時間差に座っているためにあります。これを飛ばすと、トラフィックがまだ届いているのにポッドが受け付けをやめます。それは正常終了で包んだ 502 です。
- 猶予期間は助言ではなく期限です。時間が尽きればプロセスはそのまま殺されるので、終わらなかったシャットダウンは、書きかけの状態を残したクラッシュになります。接続の排出と最後の遅いリクエストまで含めて、最も長い正直なシャットダウン時間を測り、猶予をそれより大きく取ります。平均で取ると、デプロイのたびに 1000 件に 1 件が失敗し、誰も再現できない状態になります。
- レプリカが 1 つのワークロードに予算を付けて、それで助かると期待しないでください。レプリカ 1 つに `minAvailable: 1` ならあらゆるドレインが詰まり、1 つに `maxUnavailable: 1` なら存在する唯一の中断を許します。予算はレプリカ数が持っていない可用性を生み出せませんし、そのふりをすれば障害がポッドからアップグレードへ移るだけです。
- 予算は中断を配給するだけで、中断を安全にはしません。ポッドがきちんと出ていくための時間を買うだけで、その時間を使うかどうかはアプリケーションの仕事です。SIGTERM を無視するアプリケーションは、予算があってもなくても同じ割合でリクエストを落とします。2 つの半分は、そろって初めて働きます。

## .NET では

ホストが儀式のほとんどをすでに実装しています。`IHost.RunAsync` は SIGTERM のハンドラーを登録し、届いたらサーバーに新しい接続を受けさせず、進行中のリクエストを待ち、すべての `IHostedService.StopAsync` を回してから終了します。私たちが設定するのは、どれだけ長く待つかです。

```csharp
builder.Services.Configure<HostOptions>(options =>
{
    // terminationGracePeriodSeconds より必ず小さく取ります。アプリケーションは
    // 数秒を残して自分で片付けを終えるべきで、片付けの途中でプラットフォームに
    // 断ち切られてはいけません。
    options.ShutdownTimeout = TimeSpan.FromSeconds(25);
});
```

ホストが知らないものが 1 つあります。readiness のエンドポイントです。そして予算が読むのは、まさにその部分です。予算は `Ready` 条件が真のポッドを数えるので、ポッドが動いている間の算数は、プローブが正直な分しか正しくありません。シャットダウンが始まった瞬間にも readiness を失敗させ、このポッドを直接プローブするルーターが仕事を送るのをやめるようにします。Kubernetes では、Service のエンドポイントは削除の時点ですでに知らされています。

```csharp
// readiness プローブが叩く先として登録します。このエンドポイントが答えるのは
// 「私にルーティングしてよいか」であって、「生きているか」とは別の問いです。
// 最後のリクエストを仕上げている最中のポッドは健全ですが、ルーティング先に
// なってはいけません。
var shuttingDown = new CancellationTokenSource();
app.Lifetime.ApplicationStopping.Register(() => shuttingDown.Cancel());

app.MapGet("/healthz/ready", () =>
    shuttingDown.IsCancellationRequested ? Results.StatusCode(503) : Results.Ok());
```

`ApplicationStopping` は SIGTERM が届いた時点、そしてサーバーが受け付けをやめる前に発生します。この検査が置かれるべき場所はそこだけです。`ApplicationStopped` はすべてが終わったあとに発生し、誰も二度と尋ねないものを書き出す場所です。

```csharp
public sealed class OutboxPump(IHostApplicationLifetime lifetime) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        try
        {
            while (!stopping.IsCancellationRequested)
            {
                // このトークンは SIGTERM でホストがキャンセルします。トークンを
                // 無視するループは、猶予期間が書き込みの途中で殺すループです。
                await PumpOnceAsync(stopping);
                await Task.Delay(TimeSpan.FromSeconds(1), stopping);
            }
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            // キャンセルはほぼ必ず delay の中で起き、例外として届きます。
            // これがないと下のドレインは走りません。
        }

        // `stopping` は渡しません。それはもうキャンセル済みです。手にあるものを
        // 仕上げることこそ、猶予期間がある理由です。
        await DrainAsync(CancellationToken.None);
    }
}
```

プラットフォーム側では予算は 4 行で、儀式の時間が決まるのはポッドの spec です。preStop の sleep は小細工ではありません。エンドポイントの一覧は削除された瞬間からこのポッドを外し始めており、sleep はその写しが追いつくための時間差の区間です。

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2          # レプリカ 3 つのうち 2 つ、だから退避は一度に 1 つ
  selector:
    matchLabels:
      app: api
---
spec:
  template:
    spec:
      # preStop の sleep、進行中のリクエスト、ホスト自身のシャットダウン
      # タイムアウトをすべて覆ってなお余裕が残る値です。
      terminationGracePeriodSeconds: 45
      containers:
        - name: api
          lifecycle:
            preStop:
              exec:
                # 削除の時点でこのポッドのエンドポイントには terminating の印が
                # 付いています。この停止は、リスナーを閉じる前にすべてのルーティング
                # テーブルがそれを聞くための時間で、その中では他に何も起きません。
                command: ["/bin/sleep", "10"]
          readinessProbe:
            httpGet: { path: /healthz/ready, port: 8080 }
            periodSeconds: 2
            failureThreshold: 2
```

3 つの数は一緒に読む必要があります。エンドポイントの変更は削除の時点で始まり、フックはそれが伝わるあいだポッドを 10 秒つかまえ、ホストは最大 25 秒で仕上げ、プラットフォームは 45 秒まで待ちます。readiness が 503 になるのは、フックの終わりに SIGTERM が届いたときです。ポッド自身をプローブするルーターには、それで十分早く届きます。フックの実行中に失敗させたいなら、sleep の代わりに、フックからアプリケーションへ合図する必要があります。監視しているファイルに触れる、ローカルのエンドポイントを呼ぶ、といった方法です。どれか 1 つを変えたら残りの 2 つを確認してください。取り違えたときの唯一の症状は、デプロイ中にだけ失敗し、他のどこでも失敗しない少数のリクエストだからです。

最後に、予算を信じる前に予算を確認します。`kubectl get pdb` はクラスターが今信じている値を見せますし、見た目は健全なサービスに `ALLOWED DISRUPTIONS: 0` が出ているなら、それが上で述べたデッドロックが、誰かがアップグレードを始めるのを待っている姿です。

```bash
# ALLOWED DISRUPTIONS が肝心の数です。`currentHealthy` から `desiredHealthy` を
# 引いた値で、継続的に計算し直され、退避させるコントローラーが何かを持って
# いく前に読む値です。
kubectl get pdb api -o wide
```
