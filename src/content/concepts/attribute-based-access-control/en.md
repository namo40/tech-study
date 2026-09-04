---
title: "Attribute-Based Access Control"
summary: "ABAC decides access by evaluating attributes of the subject, the resource, the action and the environment rather than by looking up a role name. It is the model that answers questions roles cannot phrase, and it composes where roles multiply."
category: "Authentication and authorization"
tags: ["oauth"]
scene: authorization
sceneStep: 3
related:
  - label: Authorization
    slug: authorization
  - label: Role-Based Access Control
    slug: role-based-access-control
  - label: Policy
    slug: policy
  - label: Resource-based Authorization
    slug: resource-based-authorization
  - label: Default Deny
    slug: default-deny
  - label: Role
    slug: role
references:
  - title: "Policy-based authorization in ASP.NET Core"
    url: https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies
  - title: "What is Azure attribute-based access control (Azure ABAC)?"
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/conditions-overview
---

The scene's third step is the sentence a role cannot say. A badge names what its holder may do and never whose things may be done to, which is why an editor's badge waves through a change to a document belonging to somebody else. Attribute-based access control is the model that takes the missing sentence seriously: instead of matching the caller against a name, it evaluates a boolean expression over facts. Facts about the subject, such as the department or clearance carried in the token. Facts about the resource, such as its owner, tenant or classification. Facts about the action, and facts about the environment, such as the time of day or whether the call arrived from a managed device. Access is granted when the expression is true and refused otherwise, which is the same default-deny stance the fourth step draws, expressed over data instead of over names.

```text
subject.department == resource.department
  and resource.classification != "restricted"
  and environment.device == "managed"
```

The honest motivation is not elegance but arithmetic. Roles are a good compression of permissions until the dimensions start multiplying: an editor role becomes an editor role per tenant, then per region, then a separate one for restricted documents, and the directory ends up holding the cross product of every dimension anyone ever needed. That is role explosion, and it is a multiplication. Attributes add instead. A new region is a new attribute compared in one clause, not a new row for every existing role, and the rule keeps its meaning as the organisation grows because the rule was never a list of names in the first place. The cost moves too: what used to be an administrative burden of granting and revoking many roles becomes the burden of keeping attributes accurate, because a wrong department on a user is now a wrong answer everywhere.

The two models are not rivals, and treating them as such is how ABAC projects go wrong. A role is simply one attribute among the others, usually the coarsest and the cheapest to check, so the practical shape is a role gate that decides whether the caller belongs anywhere near this operation followed by a condition that decides whether this particular resource is in scope. Azure's own implementation is exactly that arrangement: a role assignment grants the permission, and an optional condition attached to the assignment narrows it by comparing resource tags against the principal's attributes. Resource-based authorization is the same idea at its narrowest, where the only attribute consulted is ownership of the instance in front of you; ABAC is its general form, and where the checks are wired into an application is a separate question that belongs to policy.

What the model asks in return is that the attributes be trustworthy and available at the moment of the decision. Anything the caller can set about itself is not an attribute but a request, so subject attributes have to arrive signed in the token or be read from a directory the caller cannot edit. Resource attributes have to be loaded before the answer can be given, which is why these decisions live next to the data rather than at a gateway. And the complexity does not disappear, it relocates: a large set of overlapping conditions is as hard to reason about as a large set of roles, with the extra difficulty that "who can read this document" is now a search over expressions rather than a lookup. Keep the expressions few and named, write tests that assert refusals as carefully as approvals, and be able to log which attributes produced a decision, because an answer nobody can explain is an answer nobody can review.
