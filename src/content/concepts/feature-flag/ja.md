---
title: "Feature Flag"
summary: "フィーチャーフラグは、コードをデプロイすることとリリースすることを切り離します。誰が何を見るかはスイッチが決め、パーセンテージは爆発半径をダイヤルに変え、kill switch はこれまでに作られた中で最も安いロールバックです。だからこそ、常にオンのフラグは取り除くべき負債になります。"
category: "コンテナーとオーケストレーション"
scene: feature-flag
steps:
  - title: "デプロイはリリースではありません"
    text: "フラグがなければ、v2 を出すことがそのままリリースです。全員が一斉に受け取り、取り戻すにはもう一度デプロイするしかありません。コードをフラグの後ろに置いて暗いまま出せば、v2 はすべてのサーバーにありますが、あなたが言うまで誰にも見えません。決めるのは船ではなくスイッチです。"
  - title: "10% に開き、見守り、広げます"
    text: "フラグはユーザーをハッシュしてバケツに入れるので、同じ人はいつも同じ側に立ちます。リクエストごとに投げるコインではなく、一貫した体験です。数字がよさそうなら 10% が 50% になります。爆発半径は、受け入れる事実ではなく回すダイヤルになります。"
  - title: "kill switch は、これまでに作られた中で最も安いロールバックです"
    text: "v2 が半分のユーザーにエラーを投げ始めます。そしてフラグを一度ひっくり返すだけで、数秒で全員が v1 に戻ります。ビルドも、デプロイも、ロールバックの窓もありません。悪いコードはまだサーバーにあり、届かなくなっただけです。回復の速さこそ、フラグが存在する理由のすべてです。"
  - title: "常にオンのフラグは、スイッチ付きの負債です"
    text: "直して検証した後、v2 は 100% へ行きます。その次はフラグを取り除きます。フラグの一つ一つがコードの経路を二倍にするからです。開き、証明し、取り除きます。標準 API は検査を移植可能に保ち、だから規律がベンダーより長生きします。"
related:
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: Traffic Splitting
    slug: traffic-splitting
  - label: OpenFeature
    slug: openfeature
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
  - label: External Configuration
    slug: external-configuration
  - label: Database Migration
    slug: database-migration
  - label: Backward-Compatible Migration
    slug: backward-compatible-migration
references:
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "OpenFeature Introduction"
    url: https://openfeature.dev/docs/reference/intro
---

## いつ使うか

- まだ終わっていないのにマージはしたい作業に使います。フラグがあれば、未完成の機能が main ブランチで生き、毎日本番に出ながら誰にも届きません。トランクベース開発が成り立つのはここです。長くならないブランチとは、結局フラグの後ろにあるブランチのことです。
- 少しずつ広げたいリリースに使います。10%、次に 50%、次に全員。各段階の間でエラー率とレイテンシーを見守ります。そうすれば失敗の大きさは、後から知る数字ではなく最初に選んだ数字になります。
- 急いで止めたくなるかもしれないものすべてに使います。新しい依存、書き直したアルゴリズム、こちらで制御できない外部連携がそうです。出す前に投げるべき問いは「これは動くか」ではなく「どうやって止めるか」で、フラグが最も安い答えです。
- リリースと関係のない運用トグルにも使います。負荷が高いときに重いレコメンドパネルを外すこと、月末にデータベースを叩くレポートを止めること、相手側が落ちている間だけ外部連携を黙らせること。どれも同じスイッチを別の理由で使っているだけです。
- 実験にも使います。A/B テストとは、割り当てを記録して結果を測るフィーチャーフラグのことです。フラグがすでにあるなら、実験の大部分もすでに揃っています。

## 注意点

- フラグの検査はリクエスト経路で起きるので、ローカルで、しかも速くなければなりません。バックグラウンドの更新が最新に保つ設定のスナップショットに対して評価してください。検査のたびにネットワークを呼ぶと、すべてのフラグが依存になり、プロバイダーの障害がそのまま自分の障害になります。
- リクエスト単位ではなく、安定した識別子でバケツを分けます。ユーザーやアカウント、テナントをハッシュして、同じ呼び出し元がいつも同じ側に立つようにします。リクエストごとにコインを投げると、新しい決済画面を見たユーザーが再読み込み一回で古い画面に戻り、それはバグのように読めます。実際バグです。
- 二つの経路がどちらも本番にあるので、どちらもこちらの責任です。両方をテストし、両方を監視し、指標はコホートごとに分けて見てください。フラグの両側を平均したエラー率は、フラグを入れた理由そのものである差を隠します。
- フラグは状態を掛け算します。二つあれば四通り、十あれば決してテストしきれない数になります。ですから長生きするフラグは負債として扱います。持ち主を決め、削除の期日を決め、完全にオンのまましばらく経ったら取り除きます。ロールアウトの最後の段階は 100% に届くことではなく、分岐を消すことです。
- kill switch が、それ自身の守る対象に依存してはいけません。フラグの設定が今落ちているサービスを経由して届くなら、あるいはそれを更新するキャッシュが止まったデータベースを必要とするなら、頼りにしていたスイッチは肝心の瞬間に届きません。最後に確認できた値をディスクに残し、そこへ落ちるようにしてください。
- フラグの状態はコードではなく設定であり、この事実は両側に効きます。変更が速いのは利点ですが、同時にレビューもビルドもない本番変更でもあります。誰がいつ何をひっくり返したかを残し、監査ログを後から足すものではなく機能の一部として扱ってください。

## .NET では

`Microsoft.FeatureManagement` が標準の実装です。設定セクションに登録したうえで、`IFeatureManager` に機能が有効かどうかを尋ねます。答えは呼び出しではなく設定のスナップショットから来るので、検査の費用は測る価値がないほど小さくなります。

```csharp
builder.Services.AddFeatureManagement();

// リクエスト経路で
if (await featureManager.IsEnabledAsync("NewCheckout"))
{
    return await newCheckout.PlaceAsync(order, ct);
}
return await legacyCheckout.PlaceAsync(order, ct);
```

パーセンテージとコホートはコードではなくフィルターです。ターゲティングフィルターは渡された識別子をハッシュするので、同じユーザーはリクエストが変わってもサーバーが変わっても同じ側に残り、公開範囲を広げる作業はデプロイではなく設定の編集になります。

```json
{
  "feature_management": {
    "feature_flags": [
      {
        "id": "NewCheckout",
        "enabled": true,
        "conditions": {
          "client_filters": [
            {
              "name": "Microsoft.Targeting",
              "parameters": { "Audience": { "DefaultRolloutPercentage": 10 } }
            }
          ]
        }
      }
    ]
  }
}
```

Azure App Configuration ではフラグがアプリケーションの外に住み、センチネルキーが更新を導きます。ポータルでスイッチをひっくり返せば、再起動なしで更新間隔のうちにすべてのインスタンスへ届きます。`AddAzureAppConfiguration` に `UseFeatureFlags` を付ければこの配線は終わり、何をハッシュするかは `ITargetingContextAccessor` で決めます。ユーザー単位のロールアウトならユーザー id、顧客企業ごとまとめて動かす必要があればテナント id です。

アプリケーション一つより大きな範囲になるなら、OpenFeature がベンダー中立の API です。コードはクライアントに真偽値を一つ尋ね、プロバイダーが答えます。そのためコードベースに散らばった検査が特定のベンダーを名前で呼ばなくなり、どのサービスがフラグを評価するかは、いつでも変えられる決定として残ります。
