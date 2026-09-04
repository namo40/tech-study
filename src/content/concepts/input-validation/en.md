---
title: "Input Validation"
summary: "Input validation checks shape, length and range at the boundary, so obvious nonsense is refused before it costs anything. It is a filter that reduces noise and blast radius, not the thing that makes a query safe — parameterization is."
category: "Application security"
tags: ["database"]
scene: sql-injection
sceneStep: 3
related:
  - label: SQL Injection
    slug: sql-injection
  - label: Prepared Statement
    slug: prepared-statement
  - label: Output Encoding
    slug: output-encoding
  - label: Cross-Site Scripting
    slug: cross-site-scripting
  - label: Deserialization Security
    slug: deserialization-security
  - label: Web Application Firewall
    slug: web-application-firewall
  - label: Least Privilege
    slug: least-privilege
  - label: Repository
    slug: repository
references:
  - title: "Input Validation Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
  - title: "Model validation in ASP.NET Core MVC"
    url: https://learn.microsoft.com/en-us/aspnet/core/mvc/models/validation
  - title: "SQL Injection Prevention Cheat Sheet"
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
---

The third step of the scene puts a rule card in front of the query and shows it doing exactly two things. A malformed value is turned away at the door and never costs a database round trip. Then a value that is perfectly well-formed walks straight past the same card, and lands harmlessly in the data slot anyway, because the channel it arrived on was never going to execute it. Both of those readings matter, and the second one is why this page exists as a companion rather than as the answer.

What validation is genuinely good at is narrowing the set of values your system will consider at all. An order id is a `Guid`, a page size is an integer between 1 and 100, a country code is two uppercase letters, an email has a shape and a maximum length, a file upload has a size and a content type. Every one of those rules is a statement about the domain, and enforcing it at the boundary means the rest of the code can stop asking. The benefit is not only security: it is fewer branches downstream, better error messages, and a smaller surface for anything to go wrong on.

The rule that decides how well validation works is allow-list first. Say what is acceptable and refuse everything else, rather than listing the things you believe are dangerous. A deny-list is a claim about the entire space of hostile inputs, and it is a claim you have to keep making correctly as encodings, normalisation forms, unicode look-alikes and new parsers arrive. An allow-list is a claim about your own domain, which you actually know. "Two uppercase ASCII letters" is a rule you can be sure of. "Anything except the characters I currently think are risky" is a rule that ages badly and fails quietly.

Where validation cannot help is the case the scene draws deliberately. A payload that satisfies your format rule is still a payload; the rule was written against the inputs you imagined, and it says nothing about what the value does after it is accepted. That is why validation is not what makes a query safe. Parameterization is a structural property: the value travels on a channel the parser never reads as code, so its contents stop being interesting. Once that is true, a hostile value that passes validation is simply a name that matches nobody. Once it is not true, the strictest format rule in the world is one clever encoding away from irrelevant.

The same relationship holds everywhere else input meets an interpreter. Validation is the filter; the defense is context-aware output encoding when a value reaches HTML, an allow-list of identifiers when a value names a column or a sort direction, a safe path-joining routine and a canonicalisation check when a value names a file, and a type allow-list when a value names something to deserialize. In each case the pattern is the same: validate to reduce noise, and encode or bind so the content cannot change what the receiver executes.

Two practical points decide whether validation is real. First, it has to run on the server. Client-side rules are a user-experience feature — they save a round trip and they stop nothing, because the request that matters never went through your form. Second, it has to run once, at the edge, on a model that represents the request. Validation scattered through a call chain is validation that some caller will skip, and re-validating the same value in four places is how the four rules drift apart. Bind the request to a type, validate that type, and let everything below it work with values that are already known to be in range.

In ASP.NET Core that is model validation. Data annotations cover shape, length and range declaratively; `IValidatableObject` or a validation library covers the rules that involve more than one property; and `ApiController` returns a 400 with a problem-details body automatically when the model is invalid, which since .NET 10 minimal APIs do as well once `AddValidation()` is registered, so the endpoint body only ever runs on input that passed. Keep the rules with the model rather than in the handler, keep the messages free of internal detail, and let the type system carry as much of the work as it can: a `Guid` parameter needs no rule about hexadecimal, and an `enum` needs no rule about which values exist.

The honest summary is the one the caption gives. Validate to keep noise out. Parameterize, encode and constrain the account because validation will miss.
