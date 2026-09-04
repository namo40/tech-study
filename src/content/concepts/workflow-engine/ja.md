---
title: "Workflow Engine"
summary: "ワークフローエンジンは複数ステップの処理を実行しながら、その進行を実行プロセスの外側に置きます。ステップは終わるたびに記録されるので、作業はクラッシュを越え、失敗したステップをやり直し、タイマーでも人でも、何かを待つあいだメモリに何も握りません。"
category: "スケジュールされた作業とワークフロー"
scene: workflow-engine
steps:
  - title: "スケジュールが起こし、記録が守ります"
    text: "02:00 にエンジンがインスタンスを開始し、最初のステップを実行します。大事なのは、ステップが終わるときに history に書かれる一行です。エンジンの記憶はプロセスではなく記録です。"
  - title: "ステップの途中で死んでも、続きます"
    text: "エンジンが落ち、再起動し、history を再生します。終わったステップは飛ばし、途切れたステップから再開します。何も二度は走っていません。進行が、死んだプロセスではなく記録に生きていたからです。"
  - title: "失敗するのはステップであって、ワークフローではありません"
    text: "ステップ 3 が失敗すると、エンジンは少し退いてから、そのステップ一つだけをやり直します。二回目の試行が成功します。再試行が安全なのは、各ステップが二度走っても害がないときだけで、それがすべてのステップが署名する契約です。"
  - title: "待つことも一つのステップです"
    text: "最後のステップは承認を待ちます。何時間かかるなら何時間でも。スレッドもメモリもロックも握らないままです。答えが届くとエンジンが目を覚まし、仕上げ、最後の一行を書きます。ワークフローは、自分を実行したどのプロセスよりも長生きしました。"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Long-Running Process
    slug: long-running-process
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Human Approval
    slug: human-approval
  - label: Background Job
    slug: background-job
  - label: Saga
    slug: saga
  - label: Retry
    slug: retry
  - label: Transactional Outbox
    slug: transactional-outbox
references:
  - title: "Durable Functions overview"
    url: https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-overview
  - title: "Durable Functions orchestrations"
    url: https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations
  - title: "Background tasks with hosted services in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services
---

## いつ使うか

- 処理が、それを始めたリクエストより長く生きる場合です。環境の準備、注文の履行、契約書を三段階の承認に通すこと、夜間の精算。どれも HTTP ハンドラの中には収まらず、ハンドラが返っても終わっていません。作業の単位が時間や日で測られ、そのあいだに起きるすべてを耐えなければならないなら、ワークフローエンジンの出番です。
- 作業の説明が「それから、それから、それから」になる場合です。前のステップに依存するステップが一列に並び、その合間に待ちと再試行が散らばっている形が、そのままエンジンの形です。処理を番号付きの箇条書きで書けて、その箇条書きに待ちが含まれるなら、エンジンは二度目の障害が来る前に元を取ります。
- ステップのいくつかが待ちである場合です。デプロイを越えなければならないタイマー、月曜まで返ってこないかもしれない承認、いつ来るか分からない決済事業者の webhook などです。`Task.Delay` もメモリ上の `TaskCompletionSource` もプロセスと一緒に死にますが、永続タイマーと永続外部イベントは死にません。この差はデモでは見えず、本番でだけ見えます。
- すでに自作版を運用している場合です。`status` 列と `next_attempt_at` 列、そしてテーブルを走査する cron ジョブは、記録も再生もバージョン管理の方針も可視性もないワークフローエンジンです。作ったこと自体は妥当ですが、そのまま増築していくのは筋が悪いです。誰かが「注文 4417 はどのステップで止まっていて、何回試したのか」と尋ねる日、必要だったのはエンジンです。
- 何が起きたのかを誰かが答えられる必要がある場合です。エンジンが書く記録は、それ自体が運用上の資産です。どのステップが失敗したか、何回再試行したか、承認がどれだけ答えのないまま置かれていたか、詰まったインスタンスの群れがどこで一斉に止まったかを教えてくれます。これは「いまの状態は何か」とは別の問いで、二つのうち再起動を越えるのは片方だけです。

## 注意点

- すべてのステップは二度走っても安全でなければならず、エンジンは別々の二か所でそれを前提にしています。作業を終えて記録する前に落ちれば再開時にそのステップをもう一度走らせますし、失敗後の再試行も同じステップをもう一度走らせます。外側に影響を与えるステップには、相手側が重複を落とせる鍵があるか、確認してから行う形が安く繰り返せるかのどちらかが要ります。どちらもないままカードを切るステップは二度切りますし、エンジンの設定をいくら変えてもそれは直りません。
- オーケストレーションのコードは決定的でなければなりません。多くのエンジンは、オーケストレーターを記録に対して再実行することでインスタンスの位置を復元します。そのためオーケストレーターの中の `DateTime.UtcNow`、`Guid.NewGuid()`、`Random`、直接の I/O は近道ではなくバグです。再生のときに最初とは違う答えを返し、エンジンは自分の位置を失います。フレームワークはそのすべてに決定的な代替を用意しています。残りはすべてステップ側に置きます。
- インスタンスが動いているあいだに定義のバージョンを上げることは運用上もっとも難しい問題で、一般的な解はありません。バージョン 1 で始まったインスタンスはバージョン 1 の記録に対して再生されます。定義の途中にステップを一つ差し込んでデプロイすると、再生が出会う記録はもうコードと一致しません。よくある答えは、定義に明示的なバージョンを付けて古いインスタンスは古い定義で終わらせるか、動いているインスタンスが尽きるまでデプロイを止めるかです。最初の障害のときではなく、最初のリリースの前にどちらかを決めてください。
- タイマーと外部イベントは永続でなければなりません。`Task.Delay(TimeSpan.FromDays(2))` は二日の待ちではなく、デプロイ一回で取り消される二日の待ちですし、メモリ上の完了ソースはそれより悪いです。その待ちが重要なら、記録が住んでいるのと同じ保存先に住む必要があります。
- 保存先はただではありません。ステップごとに行が積まれ、ループを含むオーケストレーションは大量に積みます。終わったインスタンスを残す費用がいくらか、どれだけ残すか、掃除はどうするかを早めに決めてください。誰も刈り込まない履歴テーブルはデータベースで一番大きなテーブルになり、しかも静かにそうなります。
- 業務ルールはオーケストレーターの外に置いてください。オーケストレーターの仕事は次に何が走るかを言うことだけで、インスタンスが生きているあいだに何度も再実行されます。検証も計算も方針もステップ側に置きます。そこでは一度だけ走り、正直に失敗し、下にランタイムがなくてもテストできます。

## .NET では

Azure Durable Functions が、この形の全体に至る一番短い道です。オーケストレーターはふつうの C# で、それを生き延びさせるのがランタイムです。`await` の地点がチェックポイントです。関数はそのあいだ降ろされていて、次の結果が届くと記録から再実行されます。コードが台本のように読めて状態機械のように振る舞う理由がこれです。

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var input = context.GetInput<Signup>()!;

    // Each call is a step. Its result is written to the history, so a replay
    // after a crash returns the recorded value instead of calling again.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), input);
    await context.CallActivityAsync(nameof(SeedWorkspace), account);

    // A retry policy belongs to one step, not to the workflow. Only this call
    // is repeated, and only until it succeeds or the policy gives up.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // The wait. Neither of these holds a thread: the instance is unloaded and
    // the runtime brings it back when the event or the timer arrives.
    using var cts = new CancellationTokenSource();
    var approval = context.WaitForExternalEvent<bool>("Approved");
    var deadline = context.CreateTimer(context.CurrentUtcDateTime.AddDays(3), cts.Token);

    if (approval != await Task.WhenAny(approval, deadline))
    {
        await context.CallActivityAsync(nameof(Escalate), account);
        return "escalated";
    }

    cts.Cancel();
    await context.CallActivityAsync(nameof(Activate), account);
    return "active";
}
```

これを成り立たせている規則は二つで、どちらも再生に関するものです。`DateTime.UtcNow` ではなく `context.CurrentUtcDateTime` を、`Guid.NewGuid()` ではなく `context.NewGuid()` を使います。再生は最初に到達した値へそのまま再び到達しなければならないからです。そして残りのすべてが住む場所がアクティビティです。アクティビティは記録された結果ごとに一度呼ばれ、I/O をしてよく、外側に影響を与えることが許された唯一の場所です。

```csharp
[Function(nameof(ProvisionLicence))]
public static async Task ProvisionLicence([ActivityTrigger] Account account)
{
    // The step is written so that running it twice is the same as running it
    // once: the key is derived from the account, so the second call is a
    // conflict the provider absorbs rather than a second licence.
    await licences.CreateAsync(new LicenceRequest
    {
        AccountId = account.Id,
        IdempotencyKey = $"licence:{account.Id}",
    });
}
```

インスタンスを始めるのはクライアント側の呼び出しで、インスタンス ID は生成するより選んで渡すほうがよいです。そのインスタンスが扱う対象から名前を作れば、エンジンは同じ注文に対する二つ目のインスタンスの開始を拒みます。これより安い重複排除はありません。

```csharp
await client.ScheduleNewOrchestrationInstanceAsync(
    nameof(Onboard), signup, new StartOrchestrationOptions($"onboard-{signup.Id}"));
```

フレームワークが問題に対して大きすぎるときは、同じ形が `BackgroundService` 一つとテーブル二つに収まります。インスタンスごとの一行に、どの定義を走っているかとどこまで来たかを持たせ、終わったステップごとに一行を持たせ、コードではなく記録が判定するように一意キーを張ります。

```csharp
public class WorkflowInstance
{
    public Guid Id { get; set; }
    public string Definition { get; set; } = "";
    public int Position { get; set; }              // the last recorded step
    public DateTimeOffset? WakeAt { get; set; }    // when a wait is due
    public string Status { get; set; } = "running";
}

public class StepRecord
{
    public Guid InstanceId { get; set; }
    public int Step { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset At { get; set; }
}

protected override void OnModelCreating(ModelBuilder model)
{
    // One row per finished step, and no way to write it twice. Position is a
    // cache of this table, not a second source of truth.
    model.Entity<StepRecord>().HasKey(s => new { s.InstanceId, s.Step });
}
```

ワーカーは、反復のあいだに記憶を持たないループです。そこが肝心です。次に何をするかを決めるのに必要なものが、すべて一回の問い合わせで足ります。

```csharp
protected override async Task ExecuteAsync(CancellationToken stopping)
{
    while (!stopping.IsCancellationRequested)
    {
        var due = await db.Instances
            .Where(i => i.Status == "running")
            .Where(i => i.WakeAt == null || i.WakeAt <= DateTimeOffset.UtcNow)
            .OrderBy(i => i.Id)
            .Take(20)
            .ToListAsync(stopping);

        foreach (var instance in due) await AdvanceAsync(instance, stopping);
        await Task.Delay(TimeSpan.FromSeconds(5), stopping);
    }
}

async Task AdvanceAsync(WorkflowInstance instance, CancellationToken token)
{
    var steps = definitions[instance.Definition];
    // Where to carry on from is a fact about the record, not about the code
    // that happens to be running. A process that died here loses nothing.
    var next = await db.Steps.CountAsync(s => s.InstanceId == instance.Id, token);
    if (next >= steps.Count) { instance.Status = "done"; await db.SaveChangesAsync(token); return; }

    try
    {
        await steps[next].RunAsync(instance, token);
        db.Steps.Add(new StepRecord { InstanceId = instance.Id, Step = next, At = DateTimeOffset.UtcNow });
        instance.Position = next + 1;
        instance.WakeAt = null;
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        // The step failed, not the workflow. Back off and try this one again.
        var attempts = await Bump(instance.Id, next, token);
        instance.WakeAt = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(Math.Pow(2, attempts));
        if (attempts >= 5) instance.Status = "failed";
    }

    await db.SaveChangesAsync(token);
}
```

`WakeAt` は二つの仕事をしていて、どちらもこの構造が再起動を越える理由です。一つは失敗したステップのバックオフ、もう一つは待ちであるステップの永続タイマーです。人を待つステップは `WakeAt` をエスカレーションの期限に置き、何も記録せずに戻ります。答えを運ぶ webhook がステップの記録を書いて `WakeAt` を空にすれば、次の巡回が、記録の言うその場所からインスタンスを拾い上げます。

前半だけでよいなら、つまり 02:00 に何かを確実に走らせ、実行履歴と再試行方針を持つところまででよいなら、Hangfire と Quartz.NET がワークフローのモデリングを求めずにそれをしてくれます。インスタンスが一つなら `PeriodicTimer` を使う `IHostedService` で十分です。インスタンスが二つになった瞬間、ロックを取るスケジューラか、タイマーの前段のリーダー選出のどちらかが必要になります。そうしないとジョブは毎晩二度走り、問題になるまで誰も気づきません。
