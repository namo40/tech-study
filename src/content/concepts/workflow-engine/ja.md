---
title: "Workflow Engine"
summary: "ワークフローエンジンは複数ステップの処理を実行しながら、その進行を実行プロセスの外側に置きます。ステップは終わるたびに記録されるので、作業はクラッシュを越え、失敗したステップをやり直し、タイマーでも人でも、何かを待つあいだメモリーに何も握りません。"
category: "スケジュールされた作業とワークフロー"
scene: workflow-engine
steps:
  - title: "スケジュールが起こし、記録が守ります"
    text: "02:00 にエンジンがインスタンスを開始し、最初のステップを実行し、その 1 行を書いて、2 つ目のステップへ進みます。大事なのは history にあるその 1 行です。エンジンの記憶はプロセスではなく記録です。"
  - title: "ステップの途中で死んでも、続きます"
    text: "エンジンが落ち、再起動し、history を再生します。終わったステップは飛ばし、途切れたステップは最初からもう一度走らせます。最初のステップは二度走っていません。進行が、死んだプロセスではなく記録に生きていたからです。"
  - title: "失敗するのはステップであって、ワークフローではありません"
    text: "ステップ 3 が失敗すると、エンジンは少し退いてから、そのステップ 1 つだけをやり直します。2 回目の試行が成功します。再試行が安全なのは、各ステップが二度走っても害がないときだけで、それがすべてのステップが署名する契約です。"
  - title: "待つことも 1 つのステップです"
    text: "最後のステップは承認を待ちます。何時間かかるなら何時間でも。スレッドもメモリーもロックも握らないままです。答えが届くとエンジンが目を覚まし、仕上げ、最後の 1 行を書きます。ワークフローは、自分を実行したどのプロセスよりも長生きしました。"
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

- 処理が、それを始めたリクエストより長く生きる場合です。環境の準備、注文の履行、契約書を 3 段階の承認に通すこと、夜間の精算。どれも HTTP ハンドラーの中には収まらず、ハンドラーが返っても終わっていません。作業の単位が時間や日で測られ、そのあいだに起きるすべてを耐えなければならないなら、ワークフローエンジンの出番です。
- 作業の説明が「それから、それから、それから」になる場合です。前のステップに依存するステップが一列に並び、その合間に待ちと再試行が散らばっている形が、そのままエンジンの形です。処理を番号付きの箇条書きで書けて、その箇条書きに待ちが含まれるなら、エンジンは 2 度目の障害が来る前に元を取ります。
- ステップのいくつかが待ちである場合です。デプロイを越えなければならないタイマー、月曜まで返ってこないかもしれない承認、いつ来るか分からない決済事業者の webhook などです。`Task.Delay` もメモリー上の `TaskCompletionSource` もプロセスと一緒に死にますが、永続タイマーと永続外部イベントは死にません。この差はデモでは見えず、本番でだけ見えます。
- すでに自作版を運用している場合です。`status` 列と `next_attempt_at` 列、そしてテーブルを走査する cron ジョブは、記録も再生もバージョン管理のポリシーも可視性もないワークフローエンジンです。作ったこと自体は妥当ですが、そのまま増築していくのは筋が悪いです。誰かが「注文 4417 はどのステップで止まっていて、何回試したのか」と尋ねる日、必要だったのはエンジンです。
- 何が起きたのかを誰かが答えられる必要がある場合です。エンジンが書く記録は、それ自体が運用上の資産です。どのステップが失敗したか、何回再試行したか、承認がどれだけ答えのないまま置かれていたか、詰まったインスタンスの群れがどこで一斉に止まったかを教えてくれます。これは「いまの状態は何か」とは別の問いで、2 つのうち再起動を越えるのは片方だけです。

## 注意点

- すべてのステップは二度走っても安全でなければならず、エンジンは別々の 2 か所でそれを前提にしています。作業を終えて記録する前に落ちれば再開時にそのステップをもう一度走らせますし、失敗後の再試行も同じステップをもう一度走らせます。外側に影響を与えるステップには、相手側が重複を落とせる鍵があるか、確認してから行う形が安く繰り返せるかのどちらかが要ります。どちらもないままカードを切るステップは二度切りますし、エンジンの設定をいくら変えてもそれは直りません。
- オーケストレーションのコードは決定的でなければなりません。多くのエンジンは、オーケストレーターを記録に対して再実行することでインスタンスの位置を復元します。そのためオーケストレーターの中の `DateTime.UtcNow`、`Guid.NewGuid()`、`Random`、直接の I/O は近道ではなくバグです。再生のときに最初とは違う答えを返し、エンジンは自分の位置を失います。フレームワークはそのすべてに決定的な代替を用意しています。残りはすべてステップ側に置きます。
- インスタンスが動いているあいだに定義のバージョンを上げることは運用上もっとも難しい問題で、どのエンジンも代わりに決めてはくれません。分岐に使うバージョン印は与えてくれますが、古い経路をいつ捨ててよいかはやはり自分で選ぶことになります。バージョン 1 で始まったインスタンスはバージョン 1 の記録に対して再生されます。定義の途中にステップを 1 つ差し込んでデプロイすると、再生が出会う記録はもうコードと一致しません。よくある答えは、定義に明示的なバージョンを付けて古いインスタンスは古い定義で終わらせるか、動いているインスタンスが尽きるまでデプロイを止めるかです。最初の障害のときではなく、最初のリリースの前にどちらかを決めてください。
- タイマーと外部イベントは永続でなければなりません。`Task.Delay(TimeSpan.FromDays(2))` は 2 日の待ちではなく、デプロイ 1 回で取り消される 2 日の待ちですし、メモリー上の完了ソースはそれより悪いです。その待ちが重要なら、記録が住んでいるのと同じ保存先に住む必要があります。
- 保存先はただではありません。ステップごとに行が積まれ、ループを含むオーケストレーションは大量に積みます。終わったインスタンスを残す費用がいくらか、どれだけ残すか、掃除はどうするかを早めに決めてください。誰も刈り込まない履歴テーブルはデータベースで一番大きなテーブルになり、しかも静かにそうなります。
- 業務ルールはオーケストレーターの外に置いてください。オーケストレーターの仕事は次に何が走るかを言うことだけで、インスタンスが生きているあいだに何度も再実行されます。検証も計算もポリシーもステップ側に置きます。そこでは一度だけ走り、正直に失敗し、下にランタイムがなくてもテストできます。

## .NET では

Azure Durable Functions が、この形の全体に至る一番短い道です。オーケストレーターはふつうの C# で、それを生き延びさせるのがランタイムです。`await` の地点がチェックポイントです。関数はそのあいだ降ろされていて、次の結果が届くと記録から再実行されます。コードが台本のように読めてステートマシンのように振る舞う理由がこれです。

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var input = context.GetInput<Signup>()!;

    // 呼び出し 1 つがステップ 1 つです。その結果は history に書かれるので、
    // クラッシュ後の再生は、もう一度呼ぶ代わりに記録された値を返します。
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), input);
    await context.CallActivityAsync(nameof(SeedWorkspace), account);

    // 再試行ポリシーはワークフローではなくステップ 1 つに属します。繰り返される
    // のはこの呼び出しだけで、成功するかポリシーが諦めるまでです。
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // 待ちです。どちらもスレッドを握りません。インスタンスは降ろされ、
    // イベントかタイマーが届くとランタイムが呼び戻します。
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

これを成り立たせている規則は 2 つで、どちらも再生に関するものです。`DateTime.UtcNow` ではなく `context.CurrentUtcDateTime` を、`Guid.NewGuid()` ではなく `context.NewGuid()` を使います。再生は最初に到達した値へそのまま再び到達しなければならないからです。そして残りのすべてが住む場所がアクティビティです。アクティビティは記録された結果ごとに一度呼ばれ、I/O をしてよく、外側に影響を与えることが許された唯一の場所です。

```csharp
[Function(nameof(ProvisionLicence))]
public static async Task ProvisionLicence([ActivityTrigger] Account account)
{
    // このステップは、二度走らせても一度走らせたのと同じになるように書いて
    // あります。鍵はアカウントから作られるので、2 回目の呼び出しは 2 つ目の
    // ライセンスではなく、事業者が吸収する衝突になります。
    await licences.CreateAsync(new LicenceRequest
    {
        AccountId = account.Id,
        IdempotencyKey = $"licence:{account.Id}",
    });
}
```

インスタンスを始めるのはクライアント側の呼び出しで、インスタンス ID は生成するより選んで渡すほうがよいです。そのインスタンスが扱う対象から名前を作れば、エンジンは最初のインスタンスがまだ走っているあいだは 2 つ目の開始を拒みます。これより安い重複排除はありませんが、インスタンスが終われば ID はまた空くので、注文ごとに最大 1 回にしたいなら呼び出しの前に状態の確認が要ります。

```csharp
await client.ScheduleNewOrchestrationInstanceAsync(
    nameof(Onboard), signup, new StartOrchestrationOptions($"onboard-{signup.Id}"));
```

フレームワークが問題に対して大きすぎるときは、同じ形が `BackgroundService` 1 つとテーブル 2 つに収まります。インスタンスごとの 1 行に、どの定義を走っているかとどこまで来たかを持たせ、終わったステップごとに 1 行を持たせ、コードではなく記録が判定するように一意キーを張ります。

```csharp
public class WorkflowInstance
{
    public Guid Id { get; set; }
    public string Definition { get; set; } = "";
    public int Position { get; set; }              // 最後に記録されたステップ
    public DateTimeOffset? WakeAt { get; set; }    // 待ちが明ける時刻
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
    // 終わったステップごとに 1 行で、二度書く手立てはありません。Position は
    // このテーブルのキャッシュであって、2 つ目の真実の源ではありません。
    model.Entity<StepRecord>().HasKey(s => new { s.InstanceId, s.Step });
}
```

ワーカーは、反復のあいだに記憶を持たないループです。そこが肝心です。次に何をするかを決めるのに必要なものが、すべて 1 回の問い合わせで足ります。

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
    // どこから続けるかは記録についての事実であって、たまたま走っている
    // コードについての事実ではありません。ここで死んだプロセスは何も失いません。
    var next = await db.Steps.CountAsync(s => s.InstanceId == instance.Id, token);
    if (next >= steps.Count) { instance.Status = "done"; await db.SaveChangesAsync(token); return; }

    try
    {
        // ステップは、終わったときは null を、待ちに入るときはその期限を
        // 返します。待ちに入っても何も記録されず、まだ現在のステップのままです。
        var parkedUntil = await steps[next].RunAsync(instance, token);
        if (parkedUntil is { } until)
        {
            instance.WakeAt = until;
        }
        else
        {
            db.Steps.Add(new StepRecord { InstanceId = instance.Id, Step = next, At = DateTimeOffset.UtcNow });
            instance.Position = next + 1;
            instance.WakeAt = null;
        }
    }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        // 失敗したのはステップであってワークフローではありません。退いて、これをもう一度試します。
        var attempts = await Bump(instance.Id, next, token);
        instance.WakeAt = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(Math.Pow(2, attempts));
        if (attempts >= 5) instance.Status = "failed";
    }

    await db.SaveChangesAsync(token);
}
```

`WakeAt` は 2 つの仕事をしていて、どちらもこの構造が再起動を越える理由です。1 つは失敗したステップのバックオフ、もう 1 つは待ちであるステップの永続タイマーです。人を待つステップは、終わる代わりにエスカレーションの期限を返します。だから何も記録されず、`WakeAt` がそのタイマーになります。答えを運ぶ webhook がステップの記録を書いて `WakeAt` を空にすれば、次の巡回が、記録の言うその場所からインスタンスを拾い上げます。この巡回はレプリカ 1 つで走らせるか、インスタンスを取るときにリースを取ってください。複合キーが防ぐのはステップが二度「記録される」ことであって、2 つのワーカーが同時に「走らせる」ことではありません。

前半だけでよいなら、つまり 02:00 に何かを確実に走らせ、実行履歴と再試行ポリシーを持つところまででよいなら、Hangfire と Quartz.NET がワークフローのモデリングを求めずにそれをしてくれます。インスタンスが 1 つなら `PeriodicTimer` を使う `IHostedService` で十分です。インスタンスが 2 つになった瞬間、ロックを取るスケジューラーか、タイマーの前段のリーダー選出のどちらかが必要になります。そうしないとジョブは毎晩二度走り、問題になるまで誰も気づきません。
