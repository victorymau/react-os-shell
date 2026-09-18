---
bump: patch
title: PopupSubmenu — Escape closes one level at a time
---

- **Escape in a nested `PopupSubmenu` closes only the deepest level.** With a
  submenu open inside another, one Escape closed both and sent focus to the
  outermost row. Each open level registers an Escape interceptor, and the
  interceptors are asked newest first — but React runs a parent's effects
  after its children's, so once both levels had re-rendered the outer one was
  the newest and took the key. An open level now declines Escape while a
  deeper one is open under it, so Escape walks back one level at a time with
  focus on the row that opened each, and the root menu closes only after the
  last submenu has.
