---
title: "Kubernetes Lease"
summary: "A Lease is an ordinary Kubernetes object in the coordination.k8s.io API group whose spec records who holds it and when they last renewed. The control plane runs its own node heartbeats and leader elections on it, and applications borrow the same object through client libraries."
category: "Distributed coordination"
tags: ["kubernetes"]
scene: leader-election
sceneStep: 2
related:
  - label: Leader Election
    slug: leader-election
  - label: Lease TTL
    slug: lease-ttl
  - label: Lease Renewal
    slug: lease-renewal
  - label: Distributed Lock
    slug: distributed-lock
  - label: Singleton Worker
    slug: singleton-worker
references:
  - title: "Kubernetes: Leases"
    url: https://kubernetes.io/docs/concepts/architecture/leases/
---

In the scene's second step leadership is a lease rather than a title, and on Kubernetes that sentence is literal: the lease is a real object you can `kubectl get`. `Lease` belongs to the `coordination.k8s.io/v1` API group, lives in a namespace like any other resource, and carries a spec of four interesting fields: `holderIdentity`, a string the holder chose for itself; `leaseDurationSeconds`, how long the holder claims the seat for; `renewTime`, the last moment it said so; and `leaseTransitions`, a counter of how many times the seat has changed hands. There is no lock service anywhere in this picture. The safety comes from the API server's optimistic concurrency: a candidate writes the object with the `resourceVersion` it read, and if someone else wrote first the update is rejected with a conflict, so exactly one writer wins each round. What lease TTL says about renewal and expiry applies here without change; this page is about the object those semantics are stored in.

One property is worth stating plainly because it surprises people who expect a lock service. Nothing on the server side expires a Lease. The object does not disappear when `renewTime` plus `leaseDurationSeconds` has passed, and the API server will not refuse a write from a holder whose claim went stale. Expiry is a judgement made by the candidates: each one reads the object, compares those two fields against the current time, and only attempts to take over when the holder looks overdue. That is why the same clock caveats matter more here rather than less, and why the leader's own safety cannot rest on its in-memory belief that it still holds the object.

The best argument that this primitive is sound is that Kubernetes runs on it. Every node has a Lease in the `kube-node-lease` namespace which its kubelet renews on a short interval, and the node controller reads those objects instead of full node status updates to decide whether a node is still there. The control plane's own singletons elect themselves the same way: `kube-controller-manager` and `kube-scheduler` each contend for a Lease in `kube-system`, which is why a three-replica control plane still has one scheduler making decisions. `kubectl get leases -A` on any cluster shows both of these before it shows anything an application created.

Applications borrow the identical machinery rather than a copy of it. In Go the `leaderelection` package in client-go implements the acquire and renew loop over the Lease resource; in .NET the KubernetesClient's hosted-service integration does the same, and the identity written into `holderIdentity` is normally the pod name, which makes the current leader something an operator can read off the object during an incident. Three practical requirements come with it: the pod's service account needs RBAC permission to get, create and update leases in its namespace, the renewal loop must not share a thread with slow work, and the workload has to tolerate losing the seat at any moment, because the Lease grants a claim in the API server and never a guarantee about what a process elsewhere still believes.
