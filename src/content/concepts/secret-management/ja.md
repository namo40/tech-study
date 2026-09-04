---
title: "Secret Management"
summary: "シークレットの家はちょうど一つで、ほかのすべての場所はその参照だけを持つべきです。参照で配布すればローテーションはリリースではなくデータの変更になり、すべての読み取りを監査しておけば漏洩の被害範囲を実際に測れます。"
category: "認証と認可"
scene: key-rotation
sceneStep: 4
related:
  - label: Key Rotation
    slug: key-rotation
  - label: Secret Store
    slug: secret-store
  - label: Secret Injection
    slug: secret-injection
  - label: Workload Identity
    slug: workload-identity
  - label: API Key
    slug: api-key
  - label: Token Rotation
    slug: token-rotation
  - label: Signature
    slug: signature
  - label: Key Ring
    slug: key-ring
  - label: Token Revocation
    slug: token-revocation
  - label: JSON Web Token
    slug: json-web-token
  - label: Mutual TLS
    slug: mutual-tls
  - label: Authentication
    slug: authentication
references:
  - title: Azure Key Vault configuration provider
    url: https://learn.microsoft.com/en-us/aspnet/core/security/key-vault-configuration
  - title: Safe storage of app secrets in development
    url: https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets
  - title: Azure Key Vault logging
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/logging
---

シークレット管理は一つの規則から始まります。シークレットの家はちょうど一つで、ほかのすべての場所は写しではなく参照を持ちます。接続文字列が appsettings ファイルに、CI 変数に、デプロイマニフェストに、同僚へのメッセージに貼り付けられた瞬間、資格情報はもう一つではなく四つです。それぞれが自分の寿命を持ち、それぞれが漏れ出る自分の経路を持ちます。だから本当に問うべきなのは「どこで暗号化するか」ではなく「入れ替えるには何か所を直すのか」で、二つ目の問いのよい答えは一か所です。

その答えを可能にするのが参照による配布です。アプリケーションにはシークレットの名前と、それを読める ID だけを設定し、起動時と更新周期ごとにストアから現在の値を取得します。資格情報そのものはイメージにもマニフェストにも焼き込まれないので、入れ替えはリリースではなくデータの変更になり、ストアが更新された時刻とプロセスが気づく時刻の差は、プルリクエストの待ち行列ではなく自分で選んだ数字になります。その数字はセキュリティのパラメータです。すでに値を持っているプロセスの中で、失効した値が通り続ける時間がちょうどそれだからです。意図を持って決め、緊急のローテーションがインシデントの時間内に終わるくらい短く保ち、更新に失敗したら先週の値へ静かに戻るのではなく、うるさく失敗するようにしておきます。

読み取りの監査は、チームが飛ばしておいて後から欲しくなる部分です。誰がどのシークレットを、いつ、どこから取得したかを残すストアは、漏洩の後の最悪の問いを答えられる問いに変えます。「最初からすべてだと仮定する」の代わりに、ID の一覧と時間の窓が手に入ります。ただしそれは、その ID が列挙する価値のあるものであるときにだけ働きます。共有のアプリケーションアカウント一つではなくサービスごとに ID を一つにし、権限はそのサービスが実際に必要とする数個のシークレットだけに絞ります。ここでの最小権限は書類仕事ではありません。監査ログを雑音の壁から被害範囲へ変える仕掛けであり、侵害されたジョブ一つがボールト全体を読めないようにする仕掛けです。

管理がいちばん安いシークレットは、そもそも存在しないシークレットです。マネージド ID、ワークロード ID フェデレーション、寿命の短いトークンは、保存された文字列を、プラットフォームが必要に応じて発行し誰にも告げずに回す資格情報に置き換えます。設定に一度も現れない資格情報は、設定から漏れることもできません。本物のシークレットが避けられない場所では、その周りのほかの扉を閉じます。貼り付けが侵害報告ではなくコミットの時点で捕まるようにリポジトリでシークレットスキャンとプッシュ保護を有効にし、ボールトより多くの人が読めるログの保存先に値が届かないようにログのパイプラインでマスクし、失効と交換の経路をあらかじめ練習しておきます。一度も走らせたことのない計画は計画ではありません。
