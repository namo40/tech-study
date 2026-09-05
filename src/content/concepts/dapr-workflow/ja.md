---
title: "Dapr Workflow"
summary: "Dapr Workflow は Dapr ランタイムの永続ワークフローのビルディングブロックです。オーケストレーションは自分の言語の SDK で書き、進み具合はサイドカーが構成された状態ストアへ残し、再生に基づく実行のモデルは Durable Functions や Temporal と同じ系統のものです。"
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
  - label: Azure Durable Functions
    slug: azure-durable-functions
  - label: Temporal
    slug: temporal
  - label: Sidecar
    slug: sidecar
  - label: Scheduled Job
    slug: scheduled-job
references:
  - title: "Dapr Workflow overview"
    url: https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/
---

## いつ使うか

- サービスがすでに Dapr で動いていて、そこへ長く走る過程が必要になったときに使います。ワークフローは状態管理や pub/sub の隣に並ぶビルディングブロックの 1 つとして加わり、同じサイドカーを通して使い、同じコンポーネントのファイルで構成され、同じアクセス制御で守られます。デプロイすべき 2 つ目のランタイムも、管理すべき 2 組目の資格情報も増えません。
- 自分たちの Kubernetes のクラスターの上で永続オーケストレーションを動かすときに使います。エンジンはホストされたサービスではなく自分のプロセスの隣のサイドカーで動きます。ですから再起動を越える複数段階の過程を、別のワークフローのサーバーを持ち込まずに自前の基盤で使えます。
- 問題の形がアクティビティとタイマーと外部のイベントと子ワークフローであるときに持ち出します。この 4 つの基本の要素が大半のオーケストレーションを覆います。ステップを呼んで永続的な結果を受け取り、スレッドを抱えずに 1 日眠り、外から届く承認を待ち、大きな過程を互いを呼び合うワークフローへ分けます。
- 特定のクラウドのサーバーレスのオーケストレーターと、本格的なワークフローの基盤との中間として考えてみます。Durable Functions より 1 つのベンダーに縛られず、Temporal のクラスターを運用するより手間が軽く済みます。機能の深さより移植性が大事なときに筋の通った選択になる理由です。

## 注意点

- ワークフローのコードは決定的でなければならず、この規則は Dapr の癖ではなく系統に共通の規則です。エンジンはワークフローを履歴から再生して状態を組み直します。ですから `DateTime.UtcNow` や `Guid.NewGuid()` や `Random` や直接の I/O は、再生のときに違う答えを返し、インスタンスをずらします。時刻はワークフローのコンテキストから読み、乱数はアクティビティの中で作り、外へ影響を与えることはすべて `CallActivityAsync` の向こう側に置きます。Durable Functions も Temporal も自分たちの API で同じ制約を述べるので、一度身に付ければ 3 つに通じます。
- 状態ストアがそのまま永続性であり、そのストアの保証がそのままワークフローの保証になります。進み具合は自分たちが構成したコンポーネントに住みます。ですからトランザクションに対応していない、バックアップがない、永続性がない、そういうストアを選べばワークフローも同じになります。長く生きるインスタンスを安全とみなす前に、選んだストアがトランザクションとアクターの状態の要件に応えるかを確かめます。
- サイドカーはもう自分たちが運用するランタイムです。ワークフローのホストごとに Dapr のサイドカーが届いて健全でなければならず、その下のアクターのために placement サービスが、タイマーの土台であるリマインダーのために scheduler サービスが要り、ランタイムを上げることはライブラリの版を上げることではなく足並みをそろえる作業です。サイドカーのないワークフローは、コンパイルの時点で大きな音を立てて失敗するのではなく、起動のときに失敗します。
- ここに並ぶ 3 つのエンジンの中では最も若いものです。このビルディングブロックは Dapr 1.15 から安定版ですが、そこに至るまでにリリースごとに API も既定値も動いたので、古いサンプルは当てにならない案内になります。ランタイムのバージョンを固定し、そのバージョンのリリースノートを読み、チュートリアルを信じるのではなくビルディングブロック自身のページが何と言っているかを確かめてください。

## .NET では

- `Dapr.Workflow` のパッケージでは、ワークフローは `RunAsync` メソッドを持つクラスで、アクティビティは別のクラスです。ワークフローの本体はサービスを直接呼びません。外へ影響を与えることはすべて `CallActivityAsync` を通り、履歴に記録されるのも再生が飛ばせるのもそれです。

```csharp
public class OrderWorkflow : Workflow<OrderPayload, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, OrderPayload order)
    {
        // I/O が許されるのはアクティビティの中だけです。
        var reserved = await context.CallActivityAsync<bool>(nameof(ReserveStock), order);
        if (!reserved) return "rejected";

        // 外側の何かを待つ永続的な待機です。スレッドを使わず、再起動も生き延びます。
        try
        {
            await context.WaitForExternalEventAsync<Approval>("approval", TimeSpan.FromDays(2));
        }
        catch (TaskCanceledException)
        {
            await context.CallActivityAsync(nameof(ReleaseStock), order);
            return "expired";
        }

        // 時計はコンテキストから取ります。DateTime.UtcNow は決して使いません。
        await context.CreateTimer(context.CurrentUtcDateTime.AddMinutes(5), CancellationToken.None);
        await context.CallActivityAsync(nameof(ChargeCard), order);
        return "completed";
    }
}
```

- 登録とホスティングは普通の ASP.NET Core の配線です。`builder.Services.AddDaprWorkflow(o => { o.RegisterWorkflow<OrderWorkflow>(); o.RegisterActivity<ReserveStock>(); })` がワークフローの型をホストへ入れ、そのうえでプロセスはサイドカーを隣に置いて動く必要があります。開発では `dapr run` で、Kubernetes ではポッドに付ける `dapr.io/enabled` の注釈です。
- インスタンスを始めることも、問い合わせることも、終わらせることも、メッセージではなくクライアントの呼び出しです。`DaprWorkflowClient` が自分で選んだ id で新しいインスタンスを予約し、現在の状態を読み、動いているインスタンスへ外部のイベントを差し入れ、終了させます。運用のツールや HTTP のエンドポイントが状態ストアに手を入れずにインスタンスを操る方法がこれです。
- アクティビティは二度以上動きうるので、重複を取り除く義務はそのままです。再試行されたアクティビティはすでに起きた副作用を繰り返すことがありますし、エンジンが保証するのはワークフローの進行であって、ちょうど一度の効果ではありません。再生に基づくエンジンならどこでも同じ代金です。
