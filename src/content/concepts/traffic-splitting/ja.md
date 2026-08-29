---
title: "Traffic Splitting"
summary: "トラフィック分割は、決めた割合のリクエストを新しい経路へ、残りを古い経路へ送ります。この割合はスケジュールではなく、新しい経路が壊してよい量の上限です。"
category: "コンテナーとオーケストレーション"
scene: feature-flag
sceneStep: 2
related:
  - label: Feature Flag
    slug: feature-flag
  - label: Canary Release
    slug: canary-release
  - label: Blue-Green Deployment
    slug: blue-green-deployment
  - label: Rolling Update
    slug: rolling-update
  - label: Zero-Downtime Deployment
    slug: zero-downtime-deployment
  - label: OpenFeature
    slug: openfeature
  - label: Sticky Session
    slug: sticky-session
  - label: Load Balancer
    slug: load-balancer
  - label: Rollback
    slug: rollback
  - label: Shadow Deployment
    slug: shadow-deployment
references:
  - title: "Use feature filters to enable conditional feature flags"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/howto-feature-filters
  - title: "What is feature management?"
    url: https://learn.microsoft.com/en-us/azure/azure-app-configuration/concept-feature-management
  - title: "Safe deployment practices"
    url: https://learn.microsoft.com/en-us/devops/operate/safe-deployment-practices
---

シーンの 2 段階目を見ながら、分割が実際にどこで起きているかを確かめてください。動いたものは何もありません。同じサーバーが動き、同じコードがそのすべてに載っていて、トラフィックマネージャーには触れていません。変わったのは設定の中の数字が一つだけで、その結果は一段下に見えます。片側に並んでいた十個の点のうち、ちょうど一つが反対側へ移ります。分割は、ネットワークがパケットごとに下す判断ではなく、アプリケーションが呼び出し元ごとに下す判断です。

真ん中の帯が、その仕組みをそのまま描いたものです。各呼び出し元は自分のハッシュの高さに置かれ、影のついた帯が割合の分だけ立ち上がります。帯より下にいる呼び出し元は入り、上にいる呼び出し元は入りません。パーセンテージのロールアウトとはこれだけのことです。呼び出し元についての安定したハッシュを一つ、数字と比べるだけです。10% で十のうちおよそ一つではなく、ちょうど一つが入る理由はここにあり、誰も覚えていないのに同じ呼び出し元が次に来ても再び入る理由もここにあります。

リクエストではなく呼び出し元をハッシュするという点が肝心で、同時に最も間違えやすいところです。リクエストごとに無作為に引けば平均は同じでも体験はまったく別物になります。ユーザーが新しい決済画面に入り、再読み込み一回で古い画面に戻り、カートは二つの経路の片方しか知らない中途半端な状態で残ります。バケツで分ければ割り当ては呼び出し元の性質になるので、再読み込みにも、リトライにも、複数のタブにも、どのサーバーが答えても変わりません。

何をハッシュするかは、結果のついてくる設計判断です。ユーザー id をハッシュすれば個人が別々に動きます。消費者向け製品には合いますが、同僚二人が同じドキュメントで別のものを見ることになる共有ワークスペースには合いません。テナントをハッシュすれば顧客企業が丸ごと動きます。業務ソフトウェアには合いますが粒度が粗く、テナントの 10% がトラフィックの 10% よりずっと多かったりずっと少なかったりします。どちらを選ぶにせよ、ハッシュにフラグごとのソルトを足してください。そうしないと 10% のフラグはどれも同じ不運な十分の一を選び、一つのコホートがこれから行うすべての実験を一手に引き受けることになります。

割合は標本でもなければなりませんが、小さな割合はしばしば標本ではありません。一つのリージョン、一つのクライアントバージョン、一つの料金プランだけから取った 10% は、母集団の一切れではなく意見を持った部分集合であり、広げる瞬間まで平然と「問題なし」と報告します。入ったコホートが全体に似ているかを確かめ、量についても正直でいてください。リクエスト数がある水準を下回れば、10% のバケツはすでに知っていること以上を何も教えてくれません。

2 段階目で最後に見るべきは、割合が何ではないかです。割合はスケジュールでも進捗でもありません。一日経ったからという理由で 10% を 50% にするのは、安全なリリースではなく遅いリリースです。数字が何を言ったかに関係なく時計だけが進んだからです。ダイヤルを役に立つものにするのは、エラー率とレイテンシー、そして自分のドメインで意味を持つ信号を一つ二つ、同じ窓の中で二つのコホート間で比べること、そしてどの数字が出たら戻すのかを前もって書き留めておくことです。
