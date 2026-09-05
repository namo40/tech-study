---
title: "Canary Release"
summary: "カナリアリリースは、実際のトラフィックのうち小さな割合だけを新しいバージョンへ送り、その割合が何を起こすかを見張り、その答えに従って広げるか戻すかを決めます。パーセントはスケジュールではなく、受け入れると合意した被害の大きさです。"
category: "コンテナーとオーケストレーション"
scene: blue-green-deployment
sceneStep: 3
related:
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
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
  - title: "Traffic Manager routing methods"
    url: https://learn.microsoft.com/en-us/azure/traffic-manager/traffic-manager-routing-methods
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
  - title: "Set up staging environments in Azure App Service"
    url: https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots
---

シーンの 3 番目のステップを見ながら、何が変わって何が変わらないかに注目してください。2 つの環境は同じ 2 つです。レーンも同じレーン、データベースも同じデータベースです。変わったのは上部の操作装置だけです。位置が 2 つしかなかったスイッチが、目盛りの多いダイヤルになり、試されているバージョンは全部でも 0 でもない 10 分の 1 のトラフィックを持っています。カナリアリリースと呼ばれるものは、すべてこの 1 回の置き換えから出てきます。

ダイヤルの数字は、見た目より正確な仕事をしています。Green が壊れていて、Green がトラフィックの 10% を持っているなら、システム全体が示せる最悪のエラー率は 10% です。残りの 10 分の 9 は Green に触れもしないからです。シーンの readout がちょうど 10 まで上がってそこで止まるのはそのためです。あの数字は新しいバージョンがどれだけ壊れているかを測っているのではなく、新しいバージョンが何を壊すことを許されているかを測っています。ダイヤルは被害の天井であり、50% ではなく 10% を選ぶことは、確かめている間にどれだけ失う覚悟をするかを選ぶことです。

だからダイヤルを動かすのは時計ではなくメトリクスです。タイマーで広げるカナリアは、安全なデプロイではなく遅いデプロイです。数字が何を言ったかに関係なく予定が進んでしまうからです。必要なのは比較です。エラー率、末尾のレイテンシ、そしてその領域で意味を持つ信号を 1 つか 2 つ、カナリア側と安定側で同じ時間枠のうちに測ります。同じ時間枠という条件は、聞こえるより重要です。すいている 1 分の間に 30 秒だけ観察したカナリアは、何も教えてくれていません。

やっかいなのは、標本が小さいとノイズが多いことです。毎秒 30 件を処理するサービスの 10% なら、判断の材料は毎秒 3 件しかありません。依存先の呼び出しが 1 回遅れただけ、運の悪いクライアントが 1 つ来ただけで、性能の劣化とまったく同じに見え、リリースは理由もなく戻されます。よくある答えはこうです。最初の段階を実際の標本がたまるだけの長さにすること、固定のしきい値ではなく安定側と比べること、そして一定のトラフィック量を下回るとカナリアは良いステージング環境以上のことは教えてくれないと正直に認めることです。

静かに起こるので名前をつけておきたい失敗が 2 つあります。1 つ目は、自分を壊すはずのトラフィックに最後まで出会えないカナリアです。ルーティングがリクエスト単位ではなく接続単位で重み付けされていたり、その 10% が 1 つのリージョンや 1 つのクライアントバージョンからだけ引かれていたりすると、それは標本ではなく偏りを持った部分集合です。2 つ目は状態です。安定側と同じデータベースに書くカナリアは、旧バージョンが読めない行を残すことがあり、リクエストと違って行はダイヤルを戻しても一緒に戻ってきません。シーンの 4 番目のステップが拡張と縮小について言うことは、ここでは弱まるどころか強まります。カナリアは 2 つのバージョンが同時に書くことを最初から前提にしているからです。

ですからダイヤルは、デプロイにくっついているだけで実際には露出を調整する装置だと考えるのがよいです。選んでいるのは、どれだけ速くリリースするかではありません。トラフィックのどれだけを試験台に載せるか、どれだけの時間見張るか、どの数字を見たら戻すかです。この 3 つはリリースの最中ではなくリリースの前に書き留めてください。そうすればロールバックが議論ではなく決定になります。
