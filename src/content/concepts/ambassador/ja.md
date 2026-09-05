---
title: "Ambassador"
summary: "ambassador は外を向いたサイドカーです。アプリは localhost のポートを 1 つ呼び、そのサービスと話していると信じます。隣のコンテナーが探索と再試行、タイムアウトとフェイルオーバーを代わりに引き受け、きれいな答えを 1 つ返します。"
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

ambassador はサイドカーという発想の出て行く側の半分です。入るときのサイドカーはトラフィックがアプリより先に届くものであり、出るときのサイドカーはアプリがネットワークより先に届くものです。アプリには `http://localhost:3500` のような基準アドレスが設定され、アプリはそこへ普通の呼び出しをします。そのループバックの向こう側には、本物のサービスが今日どこにいるか、そのインスタンスのどれが健康か、どのタイムアウトが適用されるか、何回まで試すのが妥当か、そして答えがついに来なかったら何をするかを知っているコンテナーが座っています。アプリケーションのコードにはそのどれも入っておらず、それが要点です。アプリの中では呼び出しはただの呼び出しであり、分散システムで呼び出しを難しくしているものはプロセス 1 つぶん左へ移りました。

シーンの 4 番目のステップが見せるのは、その中で最も小さい興味深い形です。アプリが呼び出しを 1 回します。遠くのサービスに一時障害があり、最初の試みを断ります。ambassador がもう一度試して答えを受け取り、アプリは何事もなかったかのようにその答えを渡されます。アプリ自身の記録には呼び出しが 1 回と書かれ、ネットワークの記録にはリクエストが 2 回出たと書かれます。どちらも本当で、その差こそがこのパターンの価値です。その結果を得るためにアプリが何を*持たずに*済んだかに注目してください。試行回数を数えるコードも、バックオフの予定も、どのステータスコードがもう一度試す価値があるかという分類もありません。そのポリシーは retry パターンの主題であり、ambassador はポリシーがアプリケーションを離れたあとに置かれる場所です。

クライアントライブラリではなくこちらを選ぶ理由は、ほかのサイドカーと同じです。そしてこれがサービス 1 つの論拠ではなくフリートの論拠であることは、正直に言っておく価値があります。1 つの言語で書かれたサービスが 1 つなら、回復性ライブラリを使って終わりにするほうがよいです。ハンドラーを付けた `IHttpClientFactory` やそれに相当するものは、仕掛けも少なくホップも 1 つ少なくて済みます。ambassador が元を取るのは、同じポリシーが違う言語で書かれたサービスの間で同一でなければならないとき、レガシーのバイナリを作り直せず再試行ポリシーを入れられないとき、そしてプラットフォームチームがアプリケーションのリポジトリを 1 つも開かずに資産全体のタイムアウトを変えなければならないときです。コネクションプーリングやサーキットブレイキング、プロトコル変換を、もともとそれらを持つつもりのなかったクライアントに後から載せる方法でもあります。

代償はこの形が予告するとおりのものです。出て行く呼び出しはすべてループバックを渡るので測るべきホップが 1 つ増え、ambassador はアプリが元気でも不健康になりうるプロセスです。デバッグは一段長くなります。失敗した呼び出しを見る場所が 2 か所になり、アプリのログは自分の半分しか説明しないからです。設定はアプリを離れてプラットフォームへ移り、これは一貫性には利得、局所性には損失です。コードを読む人はタイムアウトがいくつかをもう見られません。実用的な答えは 3 つあります。「外で実際に何が起きたか」に答えられるだけの計測を ambassador 自身に持たせてください。相関識別子をこちらにも伝播させ、呼び出しの 2 つの半分をつなげられるようにしてください。そして呼び出す側の期限がこのホップを越えて生き残り、ambassador の既定値に静かに置き換えられないようにしてください。
