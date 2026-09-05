---
title: "Blue-Green Deployment"
summary: "ブルーグリーンデプロイは、まったく同じ環境を 2 つ用意し、スイッチ 1 つでトラフィックを移す方式です。新しいバージョンは本番の隣で自分を証明し、切り替えも戻りも即時です。ただしデータベースを同じ慎重さで変えたときに限ります。"
category: "コンテナーとオーケストレーション"
scene: blue-green-deployment
steps:
  - title: "環境は 2 つ、トラフィックは片側"
    text: "Blue が 100% を受けている間に、v2 は隣の Green にデプロイされます。Green は温まり、ヘルスチェックに合格し、スモークテストまで受けます。本番のリクエストは 1 つも受けないままです。"
  - title: "行きもスイッチ 1 つ、戻りもスイッチ 1 つ"
    text: "トラフィックは一度に Green へ移ります。エラーが表面化しても、戻るのも即時です。Blue がまだ温かいままだからです。直してもう一度切り替えます。ブルーグリーンが買うのは最も安いロールバック、まだ動いている旧バージョンです。"
  - title: "スイッチの代わりにダイヤル"
    text: "カナリアはまず 10% だけ送り、エラー率を見張ります。悪いバージョンなら、被害を 10% に抑えたまま戻します。良いバージョンなら 50%、100% へ広げます。ペースを決めるのはカレンダーではなくメトリクスです。"
  - title: "データベースには Green がない"
    text: "2 つのバージョンがスキーマ 1 つを共有するので、変更は二手に分けます。先に広げて新旧を並走させ、古いものが何も残らなくなってから縮めます。この規律を飛ばすと、2 番目のステップからの即時ロールバックも消えます。"
related:
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Canary Release
    slug: canary-release
  - label: Expand-Contract Migration
    slug: expand-contract-migration
  - label: Readiness Probe
    slug: readiness-probe
  - label: Health Check
    slug: health-check
  - label: Graceful Shutdown
    slug: graceful-shutdown
  - label: Strangler Fig
    slug: strangler-fig
  - label: Feature Flag
    slug: feature-flag
  - label: Pod Disruption Budget
    slug: pod-disruption-budget
references:
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
  - title: "EF Core: Migrations overview"
    url: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/
  - title: "Blue-green deployment of AKS clusters"
    url: https://learn.microsoft.com/en-us/azure/architecture/guide/aks/blue-green-deployment-for-aks
---

## いつ使うか

- 即座に戻せることが必要で、その手順が身についていなければならないリリースに使います。旧バージョンはまだ動いていて、まだ温かいので、戻すのは再デプロイではなくルーティングの変更であり、いつも同じ数秒で済みます。
- 新旧が決して同時に応答してはいけないときに使います。ローリングアップデートは設計上その 2 つを混ぜますが、ブルーグリーンは混ぜません。プロトコルを変えるとき、2 通りに読めないキャッシュ形式を変えるとき、二度動いてはいけないバックグラウンドジョブがあるときがそうです。
- プラットフォームがすでにその仕組みを持っているときに使います。App Service のスロット、1 つのイングレスの後ろに置いた 2 つの AKS クラスター、2 つのプールの前に置いた重み付きプロファイルのように、入れ替えがサポートされた操作 1 つであれば、このパターンのリスクの大半はすでに片づいています。
- デプロイと露出を別々に決めたいときに使います。Green にデプロイすることと、Green へトラフィックを移すことは 2 つの行為であり、その間に一晩置いてもかまいません。

## 注意点

- 重なっている間は環境 2 つ分の費用を払います。しかもその期間は、切り替えの儀式が思わせるより長く続きます。切り替えの前に Green が起動していなければならず、切り替えの後も Blue が起動していなければなりません。そうでなければ、費用を払って買ったはずのロールバックは存在しません。
- 本当に難しいのは共有しているデータベースです。環境は 2 つでもスキーマは 1 つです。すべての変更を拡張と縮小に分け、その間にリリースを 1 つ挟まない限り、ロールバックは口先だけです。Blue に戻るということは、Green が書いたデータを読めないコードに戻るということだからです。
- ルーティングが切り替わっても、長く保たれる接続は一緒には移りません。WebSocket、SignalR の回路、gRPC のストリームは捨てられた側に残り続けます。タイムアウトが切ってくれるのを待たず、意図して空にし、クライアントに再接続するよう伝えてください。
- 冷えた Green は性能の劣化に見えます。キャッシュが空で、JIT が温まっておらず、接続プールが新しいため、切り替え直後の 1 分がその日いちばん遅い 1 分になります。ここにオートスケーラーが反応すると、良いリリースが障害に変わります。切り替えた後ではなく、切り替える前に温めます。
- スイッチが触れるものは、何であれ一緒に移す必要があります。両方の環境が動かせるキューコンシューマー、スケジュールジョブ、送信 Webhook は、休んでいる側に止まるよう伝えないと二重に動きます。二度動くジョブは、遅れて動くジョブより悪い結果になります。
- 何事もない日にロールバックを予行します。一度も使ったことのないロールバック経路は仮説であり、必要になった瞬間がそれを初めて試す瞬間になってはいけません。

## .NET では

Azure App Service では、このパターンは標準の機能です。ステージングスロットにデプロイし、ウォームアップが終わるのを待ってから入れ替えます。入れ替えはアプリケーションがすでに起動した状態で起こるルーティングの変更で、戻すのは同じ操作をもう一度行うことです。

```bash
az webapp deploy --resource-group shop --name shop-api --slot staging --src-path ./api.zip
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
# 戻り道も、同じコマンドをもう一度実行するだけです
az webapp deployment slot swap --resource-group shop --name shop-api --slot staging
```

入れ替えた直後の最初のリクエストが遅いリクエストにならないようにするのがウォームアップです。Windows プランでは、`web.config` の `applicationInitialization` が、スロットを準備完了と見なす前にどのパスを先に叩くかをプラットフォームに伝えます。Linux プランでは、そしてどちらでも使える代替としては、`WEBSITE_SWAP_WARMUP_PING_PATH` と `WEBSITE_SWAP_WARMUP_PING_STATUSES` のアプリ設定が同じことを伝えます。どちらにしても、スロット固有の設定は、入れ替えについていってはいけない設定です。

```xml
<system.webServer>
  <applicationInitialization>
    <add initializationPage="/healthz/ready" />
    <add initializationPage="/api/catalogue?page=1" />
  </applicationInitialization>
</system.webServer>
```

規律が要るのはデータベースで、EF Core はその規律を飛ばしても止めてくれません。変更を拡張マイグレーションと縮小マイグレーションに分け、その間に両方の形を書きつつ新しい形を読むリリースを 1 つ挟みます。拡張マイグレーションは追加だけを行います。名前を変えることも、削除することもありません。

```csharp
// 拡張: 新しい列は nullable で追加され、古いものには何も触れません。
migrationBuilder.AddColumn<string>(
    name: "Nickname", table: "Customers", type: "nvarchar(64)", nullable: true);

// 同じリリースで出します。両方に書き、値が入っているほうを読みます。
customer.Nickname = value;
customer.Name = value;                       // 戻る可能性のあるバージョンのために書き続けます
var shown = customer.Nickname ?? customer.Name;
```

縮小マイグレーションが出ていくのは、Blue が退役し、戻る可能性のあるどのデプロイも `Name` を読まなくなってからです。ここでよくある間違いは、アプリケーションの起動時にマイグレーションを適用することです。両方の環境が先に実行しようと競合するからです。スクリプトを生成しておくか、パイプラインで `database update` を独立した手順として実行します。

```csharp
// 縮小: ロールバックの窓が閉じた後、別のリリースで出す独立したマイグレーション。
migrationBuilder.DropColumn(name: "Name", table: "Customers");
```

プラットフォームが入れ替えではなく重みを与えてくれる場合、たとえば Azure Front Door や Traffic Manager やサービスメッシュの場合は、同じ 2 つの環境がカナリアになり、スイッチはダイヤルになります。データの規則は何も変わりません。変わるのは影響範囲の大きさだけです。
