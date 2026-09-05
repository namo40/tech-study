---
title: "Temporal"
summary: "Temporal は自分たちで運用する永続実行のプラットフォームです。ワークフローのコードを走らせるのはこちらのワーカーで、イベント履歴を握るのは Temporal サーバーなので、プロセスが落ちても、デプロイが出ても、1 週間待っても、それは失われた作業ではなく履歴の 2 つの項目の間の空白でしかありません。"
category: "スケジュールされた作業とワークフロー"
related:
  - label: Durable Workflow
    slug: durable-workflow
  - label: Workflow Engine
    slug: workflow-engine
  - label: State Machine
    slug: state-machine
  - label: Human Approval
    slug: human-approval
  - label: Retryable Step
    slug: retryable-step
  - label: Saga
    slug: saga
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Dapr Workflow
    slug: dapr-workflow
references:
  - title: Temporal Documentation
    url: https://docs.temporal.io/
  - title: Temporal .NET SDK
    url: https://docs.temporal.io/develop/dotnet
---

## いつ使うか

- 業務の過程が何日も何週間も走り、それを 1 つの読めるプログラムとして書く必要があるときに使います。サブスクリプションの一生、保険金請求の処理、4 つのシステムと 2 回の承認をまたぐオンボーディングといったものです。ワークフローとして書けばこれは繰り返しと分岐の入ったメソッド 1 つで、その数週間に起きるすべての再起動をプラットフォームが越えさせてくれます。状態が status 列と cron のジョブに散らばることもありません。
- 外から実行中のインスタンスに話しかける必要があるときに使います。シグナルは実行の途中のワークフローへイベントを届け、クエリは何も変えずに現在の状態を読み、アップデートは 1 つの呼び出しで両方をします。取り消しも訂正も承認も、すでに進行中の作業へこうして届きますし、手作りのワークフローの表がたいてい最後まで備えられない部分でもあります。
- 再試行とタイムアウトをコードではなく宣言で置きたいときに持ち出します。アクティビティごとに再試行のポリシーとタイムアウトの組が付きます。ですからバックオフも試行回数の上限も、「今回の試行が長すぎた」と「アクティビティ全体が長すぎた」の違いも、誰かが一度書いたきり誰も調整しない `while` の繰り返しではなく、呼び出し側の設定になります。
- 永続実行は欲しいが設計を特定のクラウドに縛りたくないときに選びます。サーバーはオープンソースで、自分たちのインフラで自分たちのデータベースを相手に動きますし、SDK は自分たちのサービスの中の普通のライブラリで、Temporal Cloud は移植先の別製品ではなく同じ API のマネージドの選択肢です。

## 注意点

- ワークフローのコードは決定的でなければならず、規則は再生に基づくエンジンならどこでも同じです。壁時計の時刻の読み取り、`Guid.NewGuid()`、`Random`、直接の I/O、そして動いている機械に依存するものは、再生のときに違う答えを返し、ワークフローを自分の履歴とずらします。`Workflow.UtcNow`、`Workflow.NewGuid()`、`Workflow.DelayAsync` とアクティビティを使い、残りは SDK の実行時検査（ワークフローのコードがスケジューラーの外へ逃げると `InvalidWorkflowOperationException` を投げます）と再生のテストが捕まえます。
- インスタンスが動いている最中にワークフローのロジックを変えることは、後から気付く問題ではなく先に計画しておく運用の問題です。古いインスタンスは、新しいコードがもう作らない履歴に対して再生され、結果は間違った答えではなく非決定性のエラーです。Temporal の答えは patching です。`Workflow.Patched` で変えた分岐に印を付け、古い履歴は古い道を、新しい履歴は新しい道を通らせ、のちに `DeprecatePatch` を経て、古いものが残らなくなったところで取り除きます。この 3 段階がバージョニングの話のすべてなので、最初の変更の前に身に付けてください。
- 分散システムを運用することになり、自前でホストするならそれを引き受けるという意味です。サーバーにはデータベース(Cassandra、MySQL、PostgreSQL)と visibility の保管先が要り、そこにいつもの監視とアップグレードと容量の見積もりが付いてきます。保持の設定が、履歴がどれだけ残り保管先がどれだけ大きくなるかを決めます。Temporal Cloud はその仕事をなくす代わりに、請求書とベンダーを残します。どちらもまっとうな選択ですが、前者を無料のように扱うことだけはまっとうではありません。
- タスクキューとワーカーの容量がそのままスループットの設計であり、細部ではありません。ワーカーは名前の付いたタスクキューをポーリングし、ワーカーが飽和したキューはただタスクを溜めます。ワークフローのタスクとアクティビティのタスクは同時実行の上限が別々ですし、長く走るアクティビティを短いものと同じキューに置けば短いほうが枯渇します。負荷が理由を見せてくれる前に、作業の性格でキューを分けておいてください。

## .NET では

- Temporalio の SDK では、ワークフローはクラスで、アクティビティは普通のメソッドです。ワークフローの本体は I/O に直接触れず、外へ影響を与えることはすべて `ExecuteActivityAsync` を通り、履歴に記録されるのもそれです。

```csharp
[Workflow]
public class OnboardWorkflow
{
    [WorkflowRun]
    public async Task<string> RunAsync(Signup signup)
    {
        // タイムアウトと再試行は呼び出し側の宣言であって、繰り返しに書くものではありません。
        var account = await Workflow.ExecuteActivityAsync(
            (Activities a) => a.CreateAccountAsync(signup),
            new()
            {
                StartToCloseTimeout = TimeSpan.FromMinutes(2),
                RetryPolicy = new() { MaximumAttempts = 4, InitialInterval = TimeSpan.FromSeconds(5) },
            });

        // 永続な待ちです。スレッドを使わず、ワーカーの再起動も越えます。
        // 条件を満たすのは、下のシグナルハンドラーです。
        if (!await Workflow.WaitConditionAsync(() => approved is not null, TimeSpan.FromDays(3)))
        {
            return "escalated";
        }

        return approved == true ? "active" : "rejected";
    }

    private bool? approved;

    // 外の世界は、動いているインスタンスへシグナルを通して届きます。
    [WorkflowSignal]
    public Task ApproveAsync(bool decision)
    {
        approved = decision;
        return Task.CompletedTask;
    }
}
```

- タスクキューを選ぶ場所はワーカーを登録するところで、これは意識して決めるものです。`TemporalWorker` はクライアントとキュー名とワークフローの型とアクティビティの実体を束ねます。ですから遅いアクティビティを専用のキューと専用のワーカープロセスへ切り出す作業が、書き直しではなく登録の変更になります。
- アクティビティは二度以上走ることがあるので、重複を落とす義務は変わりません。Temporal が保証するのはワークフローの前進であって、アクティビティの副作用がちょうど一度だけ起きることではありません。そして長く走るアクティビティにハートビートを付けておけば、サーバーはタイムアウトを待ち切らずに死んだワーカーに気付けます。
- 幸せな経路だけでなく再生もテストします。`WorkflowReplayer` が記録された履歴を現在のコードに対して走らせ、もう合わなければ失敗します。上のバージョニングの注意点が、先週始まったインスタンスをデプロイが壊す前に CI で回る検査になるわけです。
