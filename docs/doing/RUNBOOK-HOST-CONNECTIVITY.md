# Runbook — remote access to `evo-x2`

> **This file is host-specific and deliberately lives in `docs/doing/`.**
> `.gitattributes` marks `docs/doing/**` `export-ignore`, so it does NOT ship
> into projects bootstrapped from this blueprint. That placement is the point:
> it names one machine, one LAN, and one founder's routers. The two obvious
> alternatives are both wrong — `project_config_paths.md` is simultaneously this
> repo's config *and* the seed template every new project inherits (**BUG-009**),
> and `docs/doing/HANDOVER.md` is `-export-ignore`, so it ships too. An earlier
> revision of this content went into HANDOVER §1c-bis and would have seeded
> another host's network topology into every new project — the same defect as
> BUG-002, BUG-009 and BUG-010, which is a strong hint about how easy this
> mistake is to make.
>
> **Last verified: 2026-08-02.**

## The problem

Connections from the founder's Mac to `evo-x2` dropped repeatedly — SSH and
VS Code Remote-SSH alike.

## Diagnosis (2026-08-02)

**It is not the Wi-Fi and it is not the cable.** 12 kernel NIC events in 2 days;
the physical links never went down.

**`evo-x2` is dual-homed onto two different routers, with two default routes:**

| Interface | Address | Gateway | Metric |
|---|---|---|---|
| `eno1` (ethernet) | 192.168.0.97 | 192.168.0.1 | 100 |
| `wlp195s0` (Wi-Fi) | 192.168.178.130 | 192.168.178.1 | 600 |

Two separate LANs. `tailscale netcheck` logged
`portmap: monitor: gateway and self IP changed` *during a single run* — the flap
is observable live, not inferred.

Consequences measured:

- **22,194** magicsock/DERP/rebind events in 3 days.
- **63** `endpoints changed` and **4** home-DERP changes in one day.
- The remote Mac sat on `active; relay "fra"` — hairpinning through Tailscale's
  Frankfurt DERP relay instead of a direct path. Relayed links are
  latency-bound, bandwidth-throttled, and drop readily.

The mechanism: with two default routes across two subnets, `evo-x2` keeps
re-advertising a *moving* endpoint set. A remote peer's NAT hole-punch never
converges, so it falls back to DERP — and DERP is the connection that drops.

`evo-x2`'s own NAT is **not** the problem: `UDP: true`,
`MappingVariesByDestIP: false` — easy NAT, direct connections are achievable.

## What is already true (do not re-derive)

- `tailscaled` listens on a **fixed** port: `PORT="41641"` in
  `/etc/default/tailscaled`. It is therefore forwardable.
- `netcheck` reports `PortMapping:` **empty** — no UPnP, NAT-PMP or PCP on the
  router. Tailscale **cannot** open a port for itself; hole-punching is the only
  automatic path to direct.
- `eno1` carries a **public IPv6** (`2a02:810d:4b93:9400::/64`) as well as IPv4.
  IPv6 needs no port forwarding — only a firewall allow.
- Network stack is **netplan + systemd-networkd** (`NetworkManager` is inactive,
  `nmcli`/`iw` are not installed).
- Nearest DERP is Frankfurt, 18.7 ms.

## Status

**Same-LAN: solved.** Moving the Mac onto `192.168.0.x` (same subnet as
`eno1`) gives `active; direct 192.168.0.191:41641` and churn dropped to **zero
events in 45 minutes**. No NAT traversal needed, so the endpoint churn stops
mattering.

**Working from abroad: NOT solved.** The same-LAN fix is contingent on the
subnet. From a foreign network the connection must hole-punch again, and the
dual default route is still present and unchanged.

## The fixes, in order of payoff

### 1. Remove the Wi-Fi default route (fixes the churn)

Validate first — reversible and instant:

```bash
sudo ip link set wlp195s0 down
journalctl -u tailscaled -f | grep -E "endpoints changed|gateway and self"
```

If the churn stops, that confirms the diagnosis. To make it durable, add to
`wlp195s0` in `/etc/netplan/00-installer-config.yaml`:

```yaml
dhcp4-overrides:
  use-routes: false
```

This keeps the /24 (the address still assigns its on-link route) but stops DHCP
installing a competing default.

**Apply with `sudo netplan try`, never `netplan apply`.** `try` auto-rolls back
after 120 s if the session is lost — the protection you want when changing
routing on a box you reach remotely. If Wi-Fi is not needed at all, disabling
the radio is simpler and has the same effect.

### 2. Port-forward UDP 41641 → 192.168.0.97 on the 192.168.0.1 router

**The single biggest win for working abroad**, and the one that cannot be done
from the host. Because `PortMapping` is empty, without this there is no stable
reachable endpoint and direct depends entirely on hole-punching succeeding from
whatever network you are on. With it, `evo-x2` has a permanent endpoint and
direct works from arbitrary foreign networks.

Caveat: if the line is DS-Lite/CGNAT there is no IPv4 forward to be had. Fall
back to the IPv6 path, which is already public — allow UDP 41641 inbound to
`eno1`'s address and no forwarding is required.

### 3. Make the fallback survivable

If a foreign network blocks UDP outright, DERP is unavoidable and no host change
fixes it. Make it degrade gracefully instead of hanging:

- Mac `~/.ssh/config`: `ServerAliveInterval 20`, `ServerAliveCountMax 6`
- `evo-x2` `/etc/ssh/sshd_config`: `ClientAliveInterval 20`,
  `ClientAliveCountMax 6`
- `mosh` for terminal work — built for exactly this, survives drops and IP
  changes. It does **not** help VS Code Remote-SSH, which needs the SSH tunnel.

Expect VS Code Remote-SSH over a Frankfurt relay from a distant country to feel
bad regardless. That is latency, not a fault.

## Diagnostics

Run **on the Mac** from abroad — this is the check that decides whether direct
is even possible from that network:

```bash
tailscale netcheck
```

`UDP: false` or `MappingVariesByDestIP: true` means direct is impossible from
there and you are relay-bound no matter what `evo-x2` does.

On `evo-x2`:

```bash
ip route show default                      # two defaults = the bug is back
tailscale status                           # want "direct", not 'relay "fra"'
tailscale netcheck                         # UDP / PortMapping / nearest DERP
journalctl -u tailscaled --since "-1h" | grep -cE "endpoints changed|home is now"
journalctl -k --since "-2 days" | grep -cE "wlp195s0|eno1"   # rules out the NIC
```

Healthy baseline: one default route, `direct` in `tailscale status`, and
approximately zero `endpoints changed` per hour.
