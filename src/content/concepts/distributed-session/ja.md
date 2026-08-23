---
title: "Distributed Session"
summary: "Distributed Session は、セッション状態をすべてのインスタンスが読めるストアに置きます。どのインスタンスでもどのユーザーでも処理でき、再起動しても失うものがありません。"
category: "サーバー状態管理"
scene: sticky-session
sceneStep: 4
related:
  - label: Sticky Session
    slug: sticky-session
  - label: Session State
    slug: session-state
  - label: Redis
    slug: redis
  - label: ASP.NET Core Data Protection
    slug: aspnet-core-data-protection
references:
  - title: Session and state management in ASP.NET Core
    url: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state?view=aspnetcore-10.0
  - title: Configure ASP.NET Core Data Protection
    url: https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0
---

インスタンスを互いに置き換え可能にするのはストアです。セッション状態がプロセスの外へ、Redis や SQL Server のように配置全体から届く場所へ移ると、そのユーザーを一度も見たことのないインスタンスが、別のインスタンスの続きをそのまま引き受けます。再起動、スケールイン、ローリングデプロイの代価は、ログインではなく往復 1 回になります。

ASP.NET Core では、セッションを移すだけでは半分です。セッション cookie も認証 cookie も Data Protection のキーリングで保護されますが、このキーリングは既定でローカルファイルシステムに書かれ、そこに留まります。キーリングが別々の 2 つのインスタンスは互いの cookie を読めないため、ユーザーは以前と同じ頻度でログアウトされます。キーを同じ共有ストアに保存し、すべてのインスタンスに同じアプリケーション名を与えます。

有効期限は、もう時計が 1 つではなく 2 つです。`IdleTimeout` は誰も触れないセッション項目がどれだけ残るかを決め、cookie は cookie で自分の寿命を持ちます。ストア自身の追い出しポリシーまで数えれば 3 つです。セッションは小さく保ち、大切なものを記録する場所ではなく、作り直せる値を置くキャッシュとして扱います。前のリクエストにあった項目が今回のリクエストにもあるとは前提にしません。
