#!/usr/bin/env bash
# 밤샘 실행 — docs/superpowers/plans/2026-10-18-onboarding-tutor-story.md
#
#   bash docs/overnight/2026-10-18-run.sh            # 바로 시작
#   bash docs/overnight/2026-10-18-run.sh 02:00      # 02:00 까지 기다렸다가 시작 (지났으면 내일 02:00)
#   bash docs/overnight/2026-10-18-run.sh 02:00 --dry  # 할 일만 출력
#
# Orca 터미널에 띄워 두고 자리를 뜬다. 맥이 잠들지 않게 caffeinate 로 감싼다.
# 튜터 리플레이·생성 eval 은 PICKLE_API_KEY 가 있어야 돈다 — 없으면 그 단계만 건너뛰고 리포트에 남긴다.
# 키 파일이 있으면 ENV_FILE=/경로/.env 로 넘긴다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLAN="docs/superpowers/plans/2026-10-18-onboarding-tutor-story.md"
BRANCH="tomchaccom/onboarding-tutor-story"
FIRST="$PLAN 를 Task 0 부터 subagent-driven 으로 실행해."
AT="${1:-}"
DRY="${2:-}"
[ "$AT" = "--dry" ] && { DRY="--dry"; AT=""; }

say() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
run() { if [ "$DRY" = "--dry" ]; then say "(dry) $*"; else "$@"; fi; }

cd "$ROOT"

# ── 시작 전 확인: 틀리면 밤새 엉뚱한 곳을 고친다
[ -f "$PLAN" ] || { say "계획 파일이 없어요: $PLAN"; exit 1; }
cur="$(git branch --show-current)"
[ "$cur" = "$BRANCH" ] || { say "브랜치가 $cur 예요. $BRANCH 에서 실행해야 해요."; exit 1; }
[ -z "$(git status --porcelain)" ] || { say "커밋 안 된 변경이 있어요. 정리한 뒤 다시 실행해 주세요."; git status --short; exit 1; }
command -v teamclaude >/dev/null || { say "teamclaude 가 없어요."; exit 1; }
command -v uv >/dev/null || say "주의: uv 가 없어요 — Python 테스트가 실패할 수 있어요."

if [ -n "${ENV_FILE:-}" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi
[ -n "${PICKLE_API_KEY:-}" ] && say "PICKLE_API_KEY 있음 — 리플레이·eval 이 돌아요." \
                              || say "PICKLE_API_KEY 없음 — Task 3 리플레이와 Task 5 eval 은 건너뛰어요."

# ── 신뢰 확인 창에서 멈추지 않게 (docs/트러블슈팅.md: agent-trust-workspace)
python3 - "$ROOT" "$DRY" <<'PY'
import json, os, shutil, sys
root, dry = sys.argv[1], sys.argv[2]
p = os.path.expanduser('~/.claude.json')
d = json.load(open(p)) if os.path.exists(p) else {}
proj = d.setdefault('projects', {}).setdefault(root, {})
if proj.get('hasTrustDialogAccepted'):
    print('[trust] 이미 신뢰한 폴더')
elif dry == '--dry':
    print('[trust] (dry) hasTrustDialogAccepted 를 true 로 넣을 예정')
else:
    shutil.copy(p, p + '.bak-overnight') if os.path.exists(p) else None
    proj['hasTrustDialogAccepted'] = True
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
    print('[trust] 넣음 (백업 ~/.claude.json.bak-overnight)')
PY

# ── 정적 서버: 이 워크트리 기준이어야 E2E·smoke 가 맞는 파일을 본다
pid="$(lsof -ti tcp:8123 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
if [ -n "$pid" ]; then
  where="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [ "$where" != "$ROOT" ]; then
    say "8123 을 다른 폴더($where)의 서버가 쓰고 있어요. 끄고 다시 실행해 주세요: kill $pid"; exit 1
  fi
  say "8123 서버 이미 이 워크트리에서 떠 있음"
else
  say "8123 서버 띄움"
  if [ "$DRY" != "--dry" ]; then
    nohup python3 -m http.server 8123 >/dev/null 2>&1 &
    disown
  fi
fi

# ── 시각까지 기다리기
if [ -n "$AT" ]; then
  now=$(date +%s)
  target=$(date -j -f '%Y-%m-%d %H:%M' "$(date +%Y-%m-%d) $AT" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  say "$(date -r "$target" '+%m-%d %H:%M') 에 시작해요 ($(( (target - now) / 60 ))분 뒤)."
  run caffeinate -dimsu sleep $((target - now))
fi

say "시작: teamclaude run (계정 확인)"
run teamclaude switch || true
# --auto-fallback: 프록시가 죽어 있으면 claude 를 직접 띄운다 — 계정 전환은 안 되지만 밤이 통째로 날아가진 않는다
run caffeinate -dimsu teamclaude run --auto-fallback ----dangerously-skip-permissions --autocompact 600k "$FIRST"
