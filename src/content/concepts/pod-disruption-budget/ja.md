---
title: "Pod Disruption Budget"
summary: "pod disruption budget は、自発的に一度に降ろせるポッドの数を制限します。そして実際に降りるポッドは preStop、SIGTERM、猶予時間という儀式を通って出ていくので、計画されたメンテナンスが障害のようには見えません。"
category: "コンテナーとオーケストレーション"
scene: pod-disruption-budget
steps:
  - title: '予算は「降ろせ」を「一度に一つずつ」に変えます'
    text: "ドレインはポッドを二つ降ろしたがり、予算は二つが ready であることを要求します。だから退去はちょうど一つだけ進み、もう一つは待ちます。拒否ではなく保留です。メンテナンスが障害ではなく行列になります。"
  - title: "退場は儀式であって、停電ではありません"
    text: "まず preStop フックが動きます。新しい仕事を受けず、接続を空けます。次が SIGTERM です。処刑ではなく要請であり、アプリは抱えていたものを仕上げます。どのステップも、リクエストが飛行中に死なないためにあります。"
  - title: "猶予時間は、期限のある忍耐です"
    text: "アプリが間に合ったので、終了は正常なまま残りました。期限を過ぎてぐずぐずしていたら、SIGKILL が会話を終わらせます。フラッシュも別れの挨拶もありません。猶予は希望まじりの既定値ではなく、最も長い正直なシャットダウン時間に合わせておく値です。"
  - title: "予算が実際に買ってくれたものです"
    text: "交代のポッドが上がり、準備数が三つに戻り、そこで初めて二つ目の退去が始まります。ドレインの全過程で ready は二つを下回ったことがなく、SLO ランプは一度も瞬きませんでした。それが製品のすべてです。ユーザーに感知できない計画作業。"
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

- レプリカ数がスループットではなく可用性のために存在する Deployment に使います。一つ失っても耐えられるように写しを三つ置いているなら、プラットフォームが三つまとめて持っていくのを止められるのは予算だけです。Kubernetes の他のどれも、そのポッド三つが同じ約束の写し三つだということを知りません。
- 人がサービスを使っている最中に初めてノードをドレインする前に使います。ドレイン、クラスターのアップグレード、ノードプールの入れ替え、オートスケーラーによるノードの統合は、ワークロードから見ればすべて同じ出来事です。アプリケーションの外側の何かが、ポッドを動かすと決めたのです。予算は、その決定を深夜三時ではなく午後二時に下しても安全なものにします。
- ドレインするのが人ではなくコントローラーのときに使います。Cluster Autoscaler、Karpenter、マネージドのノードアップグレード、descheduler はどれも eviction API を通り、どれも予算を守り、どれも先に尋ねてはくれません。予算は彼らが読む唯一の指示書です。
- `minAvailable` を SLO に書ける数にしたいときに使います。三つのうち二つという値はプラットフォームチームが思いついた数ではなく、サービスが遅延目標の中で応答したまま失える容量がどれだけかという言明です。予算はレプリカ数ではなく、その数から書きます。
- 一つのノードに複数のワークロードが載っていて、壊れ方がそれぞれ違うときに使います。ドレインはノード上のすべてを一度に動かすので、いちばん神経質なワークロードの予算がそのノードの速度を決めます。予算をまったく持たないワークロードは、何の速度も決めません。

## 注意点

- 予算が守るのは自発的な中断だけです。カーネルパニック、壊れたディスク、電源が落ちたノード、OOM による強制終了は eviction API に許可を求めませんし、予算も消費しません。`minAvailable: 2` は常に二つが ready だという意味ではありません。二つを下回る原因がプラットフォームではない、という意味です。ずっと小さな約束ですが、それでも持つ価値のある約束です。
- `minAvailable` をレプリカ数と同じにすると、あらゆるドレインがデッドロックします。レプリカ三つに `minAvailable: 3` なら許される中断は永遠に 0 なので、クラスターのアップグレードを始めたノードドレインが詰まり、再試行し、また詰まり、アップグレードは終わりません。壊れ方は静かです。何も落ちず、ドレインがただ戻ってこないだけです。`maxUnavailable: 0` は同じ間違いを裏返して書いたものです。
- 予算は ready の数に対する算数であり、ready が嘘をつけばその算数は無価値です。接続を拒否しながら readiness プローブに 200 を返すポッドは `minAvailable` に数えられますが、誰の役にも立っていません。予算が守るものはすべて、プローブが「このポッドは今リクエストを処理できるか」に正直に答えるという前提の上に立っています。
- ready は、シャットダウンが始まるとき、接続を空けるより先に下がらなければなりません。このポッドを指すエンドポイントの一覧はクラスターのすべてのノードに写しとして存在するので、「私は終了中です」と「もう誰も私にルーティングしていません」の間には時間差ができます。preStop フックは、まさにその時間差に座っているためにあります。これを飛ばすと、トラフィックがまだ届いているのにポッドが受け付けをやめます。それは正常終了で包んだ 502 です。
- 猶予時間は助言ではなく期限です。時間が尽きればプロセスはそのまま殺されるので、終わらなかったシャットダウンは、書きかけの状態を残したクラッシュになります。接続の排出と最後の遅いリクエストまで含めて、最も長い正直なシャットダウン時間を測り、猶予をそれより大きく取ります。平均で取ると、デプロイのたびに 1000 件に 1 件が失敗し、誰も再現できない状態になります。
- レプリカが一つのワークロードに予算を付けて、それで助かると期待しないでください。レプリカ一つに `minAvailable: 1` ならあらゆるドレインが詰まり、一つに `maxUnavailable: 1` なら存在する唯一の中断を許します。予算はレプリカ数が持っていない可用性を生み出せませんし、そのふりをすれば障害がポッドからアップグレードへ移るだけです。
- 予算は中断を配給するだけで、中断を安全にはしません。ポッドがきちんと出ていくための時間を買うだけで、その時間を使うかどうかはアプリケーションの仕事です。SIGTERM を無視するアプリケーションは、予算があってもなくても同じ割合でリクエストを落とします。二つの半分は、そろって初めて働きます。

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

ホストが知らないものが一つあります。readiness のエンドポイントです。そして予算が読むのは、まさにその部分です。シャットダウンが始まった瞬間に readiness を失敗させ、すでに受けたリクエストを処理している間にもエンドポイントの一覧がこのポッドを外し始めるようにします。

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
        while (!stopping.IsCancellationRequested)
        {
            // このトークンは SIGTERM でホストがキャンセルします。トークンを無視
            // するループは、猶予時間がいずれ書き込みの途中で殺すループです。
            await PumpOnceAsync(stopping);
            await Task.Delay(TimeSpan.FromSeconds(1), stopping);
        }

        // `stopping` は渡しません。それはもうキャンセル済みです。手にあるものを
        // 仕上げることこそ、猶予時間がある理由です。
        await DrainAsync(CancellationToken.None);
    }
}
```

プラットフォーム側では予算は四行で、儀式の時間が決まるのはポッドの spec です。preStop の sleep は小細工ではありません。readiness がすでに失敗に変わったあと、エンドポイントの一覧がそれに追いつくための時間差の区間です。

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2          # レプリカ三つのうち二つ、だから退去は一度に一つ
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
                # readiness はもう失敗し始めています。この停止は、リスナーを
                # 閉じる前にすべてのルーティングテーブルがそれを聞くための時間で、
                # その中では他に何も起きません。
                command: ["/bin/sleep", "10"]
          readinessProbe:
            httpGet: { path: /healthz/ready, port: 8080 }
            periodSeconds: 2
            failureThreshold: 2
```

三つの数は一緒に読む必要があります。フックが始まって 4 秒ほどで readiness が失敗し、フックがポッドを 10 秒つかまえ、ホストが最大 25 秒で仕上げ、プラットフォームは 45 秒まで待ちます。どれか一つを変えたら残りの二つを確認してください。取り違えたときの唯一の症状は、デプロイ中にだけ失敗し、他のどこでも失敗しない少数のリクエストだからです。

最後に、予算を信じる前に予算を確認します。`kubectl get pdb` はクラスターが今信じている値を見せますし、見た目は健全なサービスに `ALLOWED DISRUPTIONS: 0` が出ているなら、それが上で述べたデッドロックが、誰かがアップグレードを始めるのを待っている姿です。

```bash
# ALLOWED DISRUPTIONS が肝心の数です。`currentHealthy` から `desiredHealthy` を
# 引いた値で、継続的に計算し直され、退去させるコントローラーが何かを持って
# いく前に読む値です。
kubectl get pdb api -o wide
```
