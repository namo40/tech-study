---
title: "Azure Durable Functions"
summary: "Azure Durable Functions は、ワークフローを普通の C# として書かせてくれるサーバーレスのやり方です。オーケストレーターの await がチェックポイントで、ランタイムはその合間に関数を降ろし、イベントソーシングされた履歴から実行し直します。ですから、プロセスが落ちても、インスタンスが減っても、何日もの待ちが挟まっても生き延びます。"
category: "スケジュールされた作業とワークフロー"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: Human Approval
    slug: human-approval
  - label: State Machine
    slug: state-machine
  - label: Scheduled Job
    slug: scheduled-job
  - label: Retryable Step
    slug: retryable-step
  - label: Temporal
    slug: temporal
  - label: Dapr Workflow
    slug: dapr-workflow
  - label: Event Sourcing
    slug: event-sourcing
references:
  - title: Durable Functions overview
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
  - title: "Durable orchestrations: code constraints"
    url: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-code-constraints
---

## いつ使うか

- 複数の関数をまとめる必要があり、そのまとめ役自体が信頼できなければならないときに持ち出します。順に繋ぐ形と、100 個のアクティビティへ広げてから結果を集め直す形が、これが存在するふたつの理由です。どちらも、段ごとにキューを置いて完了数を数える表を足す代わりに、数行の `await` で済みます。
- 過程の中に待ちが含まれているときに使います。`context.CreateTimer` は配置をまたいでも生き残りますし、`WaitForExternalEvent` は月曜になってようやく返ってくる承認のためにインスタンスを開いたままにします。どちらもスレッドもロックも温めたインスタンスも抱えません。human approval のページがその形を説明していて、こちらは何も自分で運用せずにその形を実装してくれるランタイムのひとつです。
- 耐久性のあるオーケストレーションは欲しいがサーバーは持ちたくないときに使います。履歴は Azure Storage か Netherite のバックエンドに置かれ、スケールコントローラーがキューの深さを見てインスタンスを増減し、従量課金はインスタンスが待って過ごした日数ではなくアクティビティの実行に対して課金します。一週間遊んでいるワークフローは、遊んでいる間ほぼ無料です。
- 図が実のところプログラムであるとき、状態機械をコードとして書きます。オーケストレーターの中の分岐も繰り返しもエラー処理も `if` と `while` と `try` です。同じ遷移を表に散らすより読みやすくテストしやすいですし、手作りの状態機械なら別に設計が要ったはずの監査の記録を、履歴がそのまま与えてくれます。

## 注意点

- オーケストレーターは決定的でなければなりません。再開のたびに最初から実行し直されるからです。`DateTime.UtcNow`、`Guid.NewGuid()`、`Random`、直接呼ぶ HTTP やデータベースの呼び出し、順序の保証されない LINQ の並べ替えは、どれも再生のときに初回と違う答えを返し、ランタイムは自分の位置を見失います。`context.CurrentUtcDateTime` と `context.NewGuid()` と `CallActivityAsync` を使い、最初のオーケストレーターを書く前にコードの制約のページを読んでください。
- 副作用はすべてアクティビティに置くべきで、例外を作る価値のある場面はありません。アクティビティは記録された結果ごとに一度だけ走り、その出力が履歴に残るので、再生は呼び直す代わりに記録された値を返します。オーケストレーターで直接やったことは再生のたびに繰り返されます。再試行をひとつも設定していないのに同じメールが 5 通出ていく経路がこれです。
- インスタンスが進行中のままオーケストレーターを変えると、そのインスタンスの再生が壊れます。バージョン 1 で始まったインスタンスはバージョン 1 の履歴に対して再生されます。途中にアクティビティの呼び出しをひとつ挟んで配置すれば、再生が出会う履歴はもうコードと合いません。用意されている答えは、新しいバージョンを別の関数アプリか別のオーケストレーター名として配置し、古いインスタンスをその場で終わらせるか、進行中のインスタンスが抜けきってから配置するかです。最初のリリースの前にどちらかを選んでおきます。
- 履歴が長くなると、再生のたびにお金と時間がかかります。たいていの犯人は繰り返しです。延々とポーリングし続ける永続オーケストレーションはイベントを積み上げ、やがて再生そのものが遅い部分になります。答えは `ContinueAsNew` です。状態だけ新しく渡し、履歴は空にしてインスタンスを開始し直すもので、後から足す最適化ではなく、監視や繰り返しの性格を持つワークフローでは最初からの標準の形です。

## .NET では

- isolated worker のモデルでは、オーケストレーターもほかと変わらないひとつの関数で、それを再生可能に保つ API の面は `TaskOrchestrationContext` だけです。

```csharp
[Function(nameof(Onboard))]
public static async Task<string> Onboard(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    var signup = context.GetInput<Signup>()!;

    // Each call is a checkpoint: the result is written to the history, so a
    // replay returns the recorded value instead of running the activity again.
    var account = await context.CallActivityAsync<Account>(nameof(CreateAccount), signup);

    // A retry policy belongs to one activity, not to the orchestration.
    await context.CallActivityAsync(
        nameof(ProvisionLicence),
        account,
        TaskOptions.FromRetryPolicy(new RetryPolicy(
            maxNumberOfAttempts: 4,
            firstRetryInterval: TimeSpan.FromSeconds(5),
            backoffCoefficient: 2)));

    // Neither of these holds a thread. Note the deterministic clock: the
    // deadline is derived from context, never from DateTime.UtcNow.
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

- I/O が許されるのはアクティビティで、アクティビティにはメッセージ処理と同じ義務が付いてきます。ランタイムは同じアクティビティを二度走らせることがあるので、外へ影響を与える段には、相手側が重複を落とせる鍵が要ります。
- 外部イベントはクライアントから上げ、インスタンス id は生成せずに決めて使います。ワークフローが扱う対象から導いた id で `ScheduleNewOrchestrationInstanceAsync` を呼べば、同じ注文に対するふたつめのインスタンスをランタイムが断ってくれます。これより安い重複排除はありません。承認の webhook が呼ぶのは、イベント名を添えた `RaiseEventAsync` です。
- ストレージのプロバイダーは意識して選びます。既定の Azure Storage のバックエンドは始めるのがいちばん安く、激しいファンアウトではいちばん遅いです。Netherite と Microsoft SQL のプロバイダーは、費用と運用の面積を払ってスループットを得ます。そしてこれらの間を移るのは、コードの変更ではなく再配置です。
