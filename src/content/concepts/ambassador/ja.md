---
title: "Ambassador"
summary: "ambassador は外を向いたサイドカーです。アプリは localhost のポートを一つ呼び、そのサービスと話していると信じます。隣のコンテナーが探索とリトライ、タイムアウトとフェイルオーバーを代わりに引き受け、きれいな答えをひとつ返します。"
category: "アプリケーションアーキテクチャ"
scene: sidecar
sceneStep: 4
related:
  - label: Sidecar
    slug: sidecar
  - label: Retry
    slug: retry
  - label: Request Timeout
    slug: request-timeout
  - label: Circuit Breaker
    slug: circuit-breaker
  - label: Failover
    slug: failover
  - label: Load Balancer
    slug: load-balancer
  - label: API Gateway
    slug: api-gateway
  - label: Reverse Proxy
    slug: reverse-proxy
  - label: Anti-Corruption Layer
    slug: anti-corruption-layer
  - label: Adapter
    slug: adapter
references:
  - title: "Ambassador pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/ambassador
  - title: "Sidecar pattern"
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/sidecar
  - title: "Sidecar Containers"
    url: https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/
---

ambassador はサイドカーという発想の出て行く側の半分です。入るときのサイドカーはトラフィックがアプリより先に届くものであり、出るときのサイドカーはアプリがネットワークより先に届くものです。アプリには `http://localhost:3500` のような基準アドレスが設定され、アプリはそこへ普通の呼び出しをします。そのループバックの向こう側には、本物のサービスが今日どこにいるか、そのインスタンスのどれが健康か、どのタイムアウトが適用されるか、何回まで試すのが妥当か、そして答えがついに来なかったら何をするかを知っているコンテナーが座っています。アプリケーションのコードにはそのどれも入っておらず、それが要点です。アプリの中では呼び出しはただの呼び出しであり、分散システムで呼び出しを難しくしているものはプロセス一つぶん左へ移りました。

シーンの四段目が見せるのは、その中で最も小さい興味深い形です。アプリが呼び出しを一度します。遠くのサービスに一時障害があり、最初の試みを断ります。ambassador がもう一度試して答えを受け取り、アプリは何事もなかったかのようにその答えを渡されます。アプリ自身の記録には呼び出しが一回と書かれ、ネットワークの記録にはリクエストが二回出たと書かれます。どちらも本当で、その差こそがこのパターンの値です。その結果を得るためにアプリが何を持たなくてよかったかに注目してください。試行回数を数えるコードも、バックオフの予定も、どのステータスコードがもう一度試す価値があるかという分類もありません。その方針は retry パターンの主題であり、ambassador は方針がアプリケーションを離れたあとに住む場所です。

クライアントライブラリではなくこちらを選ぶ理由は、ほかのサイドカーと同じです。そしてこれがサービス一つの論拠ではなく艦隊の論拠であることは、正直に言っておく価値があります。一つの言語で書かれたサービスが一つなら、回復性ライブラリを使って終わりにするほうがよいです。ハンドラーを付けた `IHttpClientFactory` やそれに相当するものは、仕掛けも少なくホップも一つ少なくて済みます。ambassador が元を取るのは、同じ方針が違う言語で書かれたサービスの間で同一でなければならないとき、レガシーのバイナリを作り直せずリトライ方針を入れられないとき、そしてプラットフォームチームがアプリケーションのリポジトリを一つも開かずに資産全体のタイムアウトを変えなければならないときです。コネクションプーリングやサーキットブレイキング、プロトコル変換を、もともとそれらを持つつもりのなかったクライアントに後から載せる方法でもあります。

代償はこの形が予告するとおりのものです。出て行く呼び出しはすべてループバックを渡るので測るべきホップが一つ増え、ambassador はアプリが元気でも不健康になりうるプロセスです。デバッグは一段長くなります。失敗した呼び出しを見る場所が二か所になり、アプリのログは自分の半分しか説明しないからです。設定はアプリを離れてプラットフォームへ移り、これは一貫性には利得、局所性には損失です。コードを読む人はタイムアウトがいくつかをもう見られません。実用的な答えは三つあります。「外で実際に何が起きたか」に答えられるだけの計測を ambassador 自身に持たせてください。相関識別子をこちらにも伝播させ、呼び出しの二つの半分をつなげられるようにしてください。そして呼び出す側の期限がこのホップを越えて生き残り、ambassador の既定値に静かに置き換えられないようにしてください。
