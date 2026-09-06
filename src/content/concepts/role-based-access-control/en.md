---
title: "Role-Based Access Control"
summary: "Role-based access control grants permissions to named bundles rather than to people: a caller carries a role, the role lists the verbs, and the gate decides from the badge alone."
category: "Authentication and authorization"
tags: ["oauth"]
level: 4
scene: authorization
sceneStep: 2
related:
  - label: Authorization
    slug: authorization
  - label: Policy
    slug: policy
  - label: Role
    slug: role
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-Based Access Control
    slug: attribute-based-access-control
  - label: Resource-Based Authorization
    slug: resource-based-authorization
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Introduction to authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction
---

The second step of the scene is the cheapest correct thing you can do once the gate has two stages. Every caller carries a badge, every badge names a set of verbs, and the gate compares the two. `A` is an editor and may write; `B` is a viewer and may read, so the viewer's write comes back refused before any document is touched. Nothing in that decision looked at a document, and that is what makes it fast, cacheable and easy to reason about.

The reason roles exist is arithmetic. Permissions granted person by person grow with the number of people, and a system with a thousand users and forty capabilities is a forty-thousand-cell table that somebody has to keep true. Roles factor that in two: a handful of bundles that change when the product changes, and one assignment per person that changes when a person changes jobs. Onboarding becomes "give them the support role" instead of a checklist, and offboarding becomes one revocation instead of a search.

A role is best understood as a claim the caller is carrying rather than a lookup the gate performs. That matters in practice: the role arrives in the token or the cookie, so the decision costs nothing, and it also means the role is as stale as the token. Somebody demoted a minute ago still carries the old badge until the token expires, which is one of the reasons access tokens are short and one of the reasons a genuinely urgent revocation has to reach further than the role table.

Roles stop working at the point where the answer starts depending on the resource. "May this user edit documents" is a role question. "May this user edit *this* document" is not, and no amount of naming will make it one. You can see the pressure in the names: the moment somebody proposes `editor-of-project-x`, the role has swallowed a resource identifier, and the set of roles is about to grow with the data rather than with the product. Application code creating and deleting roles at run time is the same smell.

Two habits keep the model honest for longer. Grant permissions to roles and roles to people, never permissions to people directly, so there is exactly one place to look when you ask what somebody can do. And prefer permission-shaped claims inside the policy to role names sprinkled through attributes: checking `documents.write` rather than `editor` survives a reorganisation that renames every role, and it keeps the definition of the bundle in one file instead of spread across a hundred endpoints.

When the role can no longer say it, the answer is not a bigger role. It is a policy that reads the resource at decision time, which is what the next step of the scene shows, and the two live together happily: the role narrows the population, the policy settles the row.
