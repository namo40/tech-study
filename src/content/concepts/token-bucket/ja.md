---
title: "Token Bucket"
summary: "Token Bucket は容量の分だけバーストを許し、補充速度と同じ持続的な速度を許します。Rate Limiter を実装するときに最も広く使われるアルゴリズムです。"
category: "回復性と障害対応"
scene: rate-limiter
related:
  - label: Rate Limiter
    slug: rate-limiter
  - label: Leaky Bucket
    slug: leaky-bucket
  - label: Fixed Window
    slug: fixed-window
  - label: Sliding Window
    slug: sliding-window
references:
  - title: System.Threading.RateLimiting
    url: https://learn.microsoft.com/en-us/dotnet/api/system.threading.ratelimiting
  - title: Rate Limiting pattern
    url: https://learn.microsoft.com/en-us/azure/architecture/patterns/rate-limiting-pattern
---

Token Bucket は決められた数までトークンをためておき、一定の速度で補充します。リクエストはトークンを 1 つ取り、空のバケットに届いたリクエストは拒否されます。このアルゴリズムは容量と補充速度という 2 つの数値ですべて説明できます。

容量は許すバーストの大きさです。容量が 20 なら、しばらく静かだったクライアントはリクエストを 20 件続けて送れます。休んでいるあいだにトークンがたまったからです。補充速度は持続的な処理量です。区間を十分に長く取れば、クライアントはその速度を超えられません。

Fixed Window の方式には、バケットにはない境界の問題があります。1 分あたり 100 件の制限なら、クライアントは分が終わる直前に 100 件、分が変わった直後にもう 100 件を送れます。2 秒ほどのあいだに 200 件ですが、規則は破っていません。トークンは使うことと補充することが途切れずに続くので、狙って合わせられる境界がありません。

補充速度は依存先が支えられる量から決め、容量は正常なバーストの大きさから決めます。補充の数秒分を容量にするのがよくある出発点です。それより大きく取りすぎると、バーストが続くあいだ制限が何も守らなくなります。
