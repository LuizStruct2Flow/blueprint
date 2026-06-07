#!/usr/bin/env bash
# Team kick-off ceremony: round-robin the mic through every roster persona. Each
# claims the mic (Holder=<persona>, State=ACTIVE per ACTIVE-on-claim), presents itself, then
# hands to the next (OVER_TO_<NEXT>). Paced so the activity feed captures each.
# Ends back at Sylvia / OVER_TO_USER. Drives the real AGENT_SIGNAL.md baton.
set -uo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
sig="$repo_root/AGENT_SIGNAL.md"

# persona|one-line self-introduction  (array order = the order the mic travels)
intros=(
"Sylvia|Orchestrator. I coordinate the team: dispatch, handoffs, integration. Opening the floor, passing the mic round the table."
"Klaus|PO. I own the backlog, priorities, and what 'done' means for the customer."
"Kathrin|BA. I turn fuzzy storming impulses into clear requirements and acceptance criteria."
"Christian|Senior Architect. I own the system shape and the big technical calls."
"Slava|Architect. I detail the designs and keep them consistent across services."
"Nicole|UX. I own the flows, the editorial style, and that the output delights."
"Yannik|Front-End. I build the editor, the share/login surfaces, the UI."
"Alex|Front-End. I pair with Yannik on components, state, and polish."
"Matthias|Back-End. I own generation, the v2 pipeline, the APIs."
"Andreas|Back-End. I cover data, multi-tenancy, and the routes Matthias does not."
"Vitali|QA. Reproducers first, regression tests, the two-commit gate."
"Jesko|QA. Acceptance and E2E against live, snapshot review."
"Markus|Security. Auth, tenant isolation, the posture stack, DSGVO."
"Philipp|Infra. CDK, the pipeline, observability, the AWS edge."
"Elias|Infra. Drift, cost, rollback. The second pair of infra hands."
)

# Set Holder/State/Task in one shot (values passed as argv, so no quoting hazards).
step(){
  python3 - "$sig" "$1" "$2" "$3" <<'PY'
import sys,re
f,h,s,t=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]
x=open(f).read()
for field,val in (("Holder",h),("State",s),("Task",t)):
    x=re.sub(r'(\| '+field+r' \| ).*?( \|)', lambda m: m.group(1)+val+m.group(2), x, count=1)
open(f,'w').write(x)
PY
}

n=${#intros[@]}
for i in $(seq 0 $((n-1))); do
  name="${intros[$i]%%|*}"; intro="${intros[$i]#*|}"
  step "$name" ACTIVE "KICK-OFF: $intro"
  sleep 3
  if [ "$i" -lt $((n-1)) ]; then
    next="${intros[$((i+1))]%%|*}"
    NEXT=$(printf '%s' "$next" | tr '[:lower:]' '[:upper:]')
    step "$name" "OVER_TO_$NEXT" "Thanks. Handing the mic to $next."
    sleep 2
  fi
done

step Sylvia OVER_TO_USER "Team kick-off complete: all 15 personas presented and the mic travelled the full table. Sylvia (Orchestrator) holding; mic to founder."
echo "[team-kickoff] done"
