---
title: "Default Deny"
summary: "Default deny is the rule that an action nothing granted is refused. It turns a forgotten handler into a closed door instead of an open one, which is why it is worth paying for with a little friction on every new endpoint."
category: "Authentication and authorization"
tags: ["oauth"]
scene: resource-based-authorization
sceneStep: 4
related:
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Role
    slug: role
  - label: Least Privilege
    slug: least-privilege
  - label: Authorization
    slug: authorization
  - label: Authentication
    slug: authentication
  - label: Claims
    slug: claims
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
---

The fourth step of the scene has a request arrive carrying a verb no card in the Check has ever mentioned. Nothing rejects it. The owner card is about editing, the admin card is about editing, and neither has an opinion about sharing. The request is refused anyway, and the reason is the whole of this page: it was refused because nothing granted it, not because something forbade it. Then a rule is written, the same request comes back, and it passes. The gap between those two moments is where every access-control incident lives.

The asymmetry is what makes the default matter. A system that grants by default fails open, and it fails open in exactly the situation where you have the least information: a new endpoint, a new verb, a merge that added a route and forgot the attribute. A system that denies by default fails closed, and it fails closed loudly, usually within a minute of somebody trying the new feature in a test environment. Both are mistakes. Only one of them is a mistake you find out about from your own team rather than from a stranger.

Denying by default is also what makes the rest of an authorization model readable. When silence means no, a policy is a complete statement: everything it permits is written down, so reviewing the list is reviewing the system. When silence means yes, the list of grants tells you nothing, because the interesting behaviour is in whatever nobody wrote a rule about. You cannot audit an absence.

In ASP.NET Core the pieces already lean this way, and the job is to close the last gap. A requirement is satisfied only by an explicit `context.Succeed`, so a handler that does nothing refuses, and an endpoint whose policy has no matching handler refuses. That is default deny inside a policy. The gap is the endpoint that never asked: without an `[Authorize]` attribute or an equivalent, the pipeline lets it through untouched. `SetFallbackPolicy` closes it by applying a policy to every endpoint that did not specify one, which turns "I forgot to protect this" into a 401 instead of a public route. Endpoints that really are public then say so with `[AllowAnonymous]`, which is a decision you can search for and count.

The tone of the failure matters as much as the fact of it. A denial should be obvious in development and in tests, and quiet toward the caller in production. Log the requirement that was not satisfied, the caller, and the resource id, because a denied request is the earliest breach signal you get and it costs one line. Return something dull to the caller, and pick 403 or 404 deliberately per resource type so the failure does not become a way to enumerate what exists.

The cost is real and small. Default deny means new work is blocked until somebody says what is allowed, and that friction lands on every feature branch rather than on a security review at the end. That is the trade being made on purpose: a little friction now, spread evenly, instead of one unbounded surprise later. Write it as a test and the friction becomes automatic — a test that every mapped route either carries a policy or explicitly opts out will fail on the pull request that forgot, which is the cheapest place in the world to find out.

The caption says it in three words. Silence means no. Everything on this page is one long footnote explaining why that default, and not the other one, is the one worth building on.
