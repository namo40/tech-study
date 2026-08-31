---
title: "Role"
summary: "A role is a named bundle of grants attached to a person rather than to a thing. It makes a cheap, readable outer gate that keeps obvious strangers out, and it is worth most when it is layered in front of a check that looks at the resource."
category: "Authentication and authorization"
tags: ["oauth"]
scene: resource-based-authorization
sceneStep: 3
related:
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Role-based Access Control
    slug: role-based-access-control
  - label: Default Deny
    slug: default-deny
  - label: Authorization
    slug: authorization
  - label: Claims
    slug: claims
  - label: Least Privilege
    slug: least-privilege
  - label: Attribute-based Access Control
    slug: attribute-based-access-control
  - label: Authentication
    slug: authentication
references:
  - title: "Role-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/roles
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "Resource-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/resourcebased
---

The third step of the scene is the one where the argument stops being about whether roles are a mistake. An `admin` card goes up in the Check, a badge appears on one caller, and a request that ownership would have refused walks through. That is what admin means, and drawing it as a rule card in the same stack as the owner rule is the point: the role did not vanish when the resource check arrived, and it did not win either. It took one line in the list, above the ownership rule, saying exactly one thing.

A role is a name for a set of grants. Its whole value is compression. "Support" instead of eleven separate permissions, "Auditor" instead of read access to nine tables, "Admin" instead of a conversation. That compression is what makes a role readable in a review, assignable by someone who is not an engineer, and revocable in one action when a person changes teams. None of those properties are small, and none of them are available if every permission is granted individually.

The compression is also the limit. A role is attached to the person and travels in the token, so it can only answer questions that do not mention a specific object. "May this caller reach the documents area at all" is a role question. "May this caller edit document 417" is not, and no amount of role design turns it into one. The moment you find yourself inventing `Editor_Project_417`, you have written an object into a name because the model had nowhere else to put it — and you have quietly signed up to create, assign and clean up one role per object forever.

So the sensible arrangement is layers, and the scene draws them in the order they run. The coarse gate is cheap and it fires first: is this caller authenticated, do they hold the scope, are they in the group that is allowed near this feature at all. That check needs nothing but the token, so it can refuse a stranger before a database connection is opened. The fine check runs afterwards, on a loaded resource, and decides the cases that actually differ between two objects of the same type. Roles reduce the volume; resource checks decide the questions.

The admin card in the scene is deliberately narrow. It grants one named operation, not everything, which is why the caption calls it a named grant rather than a skeleton key. This is the discipline that keeps an escape hatch from becoming the model: an administrator role that bypasses ownership for `Update` is a decision you can read, audit and test. An administrator role that bypasses every handler is an untested code path that only runs during incidents, which is exactly when you least want to discover what it allows.

Two practical habits follow. Grant roles to groups rather than to individuals, so joining and leaving a team is the only thing anybody has to remember. And treat a role as an input to a policy rather than as the policy itself: `IsInRole` scattered through endpoint bodies ages into a system where nobody can answer "who can do this" without grep. A named policy that happens to require a role today can require something else tomorrow without touching a single endpoint.

The honest summary is the one the scene gives. Roles do not disappear. They stop pretending to answer a question they were never shaped to answer, move to the front of the line where they are cheap and fast, and leave the deciding to the check that has the document in its hand.
