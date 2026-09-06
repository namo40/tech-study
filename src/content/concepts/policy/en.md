---
title: "Policy"
summary: "A policy is an authorization rule evaluated at decision time against the caller and the resource together, so the same badge can get a different answer for two different rows."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Least Privilege
    slug: least-privilege
  - label: Claims
    slug: claims
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resource-based
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

The third step of the scene is where the role runs out. `A` is an editor, so the role cheerfully allows `A` to edit `B`'s document: the bundle lists verbs, and "only your own" is not a verb. Switch the gate to a policy and the same request meets a different question. Is this caller the owner of this resource? The badge has not changed and the request has not changed, but the resource is now part of the decision, and the answer flips to a refusal.

That is the whole distinction worth holding on to. A role check is a statement about the caller. A policy is a statement about the caller *and* the thing being acted on, evaluated when the call happens rather than when the token was issued. Ownership is the obvious case, but so is tenancy, workflow state, a record locked while somebody else has it open, an amount over an approval threshold, or a time window during which a change is allowed at all.

Structurally a policy is a name attached to one or more requirements, and a requirement is answered by a handler. Naming it is more than tidiness: it gives the rule one spelling, so the same sentence is enforced at every endpoint that needs it, and it puts the rule somewhere you can unit test without a web server. Several handlers can answer one requirement, and in most frameworks any one of them succeeding is enough, which is how "the owner or an administrator" is expressed without either half knowing about the other.

The evaluation order matters and is easy to get subtly wrong. The handler cannot decide until it has the resource, so the endpoint has to load the row first and then ask, which means the decision sits after the fetch and before the mutation. That ordering is also why a policy cannot be evaluated by a gateway or a piece of middleware that has never seen the data: anything upstream can narrow the population, but the row-level answer belongs where the row is.

Two failure modes come up repeatedly. The first is a handler that finishes without deciding: silence has to mean no, so a rule that forgets to succeed refuses, and a rule that succeeds by default is a hole with a name. The second is a policy that turns into a small database query per request and then per item on a page; if the rule needs data, load it once for the whole batch and let the handler read what is already in memory, or the authorization becomes the performance problem.

Policies are also where authorization stops being a wall at the entrance. A role is checked once and colours a whole session; a policy is asked again for every call, against the object in front of it. That is more work and it is the right amount of work, because it is the only shape of rule that can say "yours, not theirs".
