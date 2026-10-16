"""AI 튜터 답변 검사.

튜터는 설계도를 낸 뒤 코드 단계에서만 열린다. 방법은 학생이 이미 정했으므로
문법을 알려주는 건 판단 대행이 아니다. 대신 아래는 코드로 막는다 —
LLM 에게 "정답 주지 마"라고 말하는 것만으로는 지켜지지 않는다 (docs/llm.md).

막는 것: 이 미션의 자료·제목, 두 줄 이상 코드, 코드 조각 둘 이상, 학생 코드 옮겨 쓰기,
방법 판단, 칭찬, 반말, '너', 한자·일본어, 200자 초과.
"""
import re

from _schema import BANMAL, FOREIGN, PRAISE, YOU

MAX = 200
SEGMENT = re.compile(r'```[\s\S]*?```|`[^`\n]+`')
METHOD = re.compile(r'이 미션|이 문제|이번 자료|여기서는|학생 코드|작성한 코드|정답|답은|고치면|바꾸면 돼|넣으면 돼|'
                    r'이렇게 하면|중복을 (빼|없애|지우)')


def _sentences(text):
    plain = SEGMENT.sub('코드', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', plain) if s.strip()]


def problems(answer, mission, code=''):
    a = str(answer or '').strip()
    if not a:
        return ['빈 답변']
    out = []
    if len(a) > MAX:
        out.append(f'{MAX}자 초과 ({len(a)}자)')
    segs = SEGMENT.findall(a)
    if len(segs) > 1:
        out.append('코드 예시가 둘 이상 — 한 줄 예시 하나만')
    for s in segs:
        body = re.sub(r'^python\s*', '', s.strip('`').strip())
        if len([ln for ln in body.splitlines() if ln.strip()]) > 1:
            out.append('코드 예시가 한 줄을 넘음 — 완성 코드가 된다')
            break
    words = list(mission.get('items') or []) + [mission.get('title') or '', mission.get('itemName') or '']
    for w in words:
        w = str(w).strip()
        if len(w) >= 2 and w in a:
            out.append(f"미션 단어 '{w}' — 예시는 미션과 다른 자료로 든다")
            break
    squashed = re.sub(r'\s+', '', a)
    names = {'data'}
    for line in (code or '').splitlines():
        ln = line.strip()
        m = re.match(r'(\w+)\s*=', ln)
        if m:
            names.add(m.group(1))
        sq = re.sub(r'\s+', '', ln)
        if len(sq) >= 6 and not ln.startswith('#') and not sq.startswith('data=') and sq in squashed:
            out.append('학생 코드를 답에 옮김 — 고친 코드를 돌려주지 않는다')
            break
    for s in segs:
        body = s.strip('`')
        if ';' in body:
            out.append('코드 예시에 ; — 한 줄에 프로그램을 담는다')
        if re.search(r'print\s*\(.*\w\s*\(', body):
            out.append('print 안에 호출 — 결과까지 내는 완성 프로그램이다')
        if any(re.search(r'(?<![\w.])' + re.escape(n) + r'(?!\w)', body) for n in names):
            out.append('학생이 쓴 변수 이름 — 학생 코드를 옮기는 것과 같다')
    m = METHOD.search(a)
    if m:
        out.append(f"방법 판단 '{m.group(0)}' — 설계도는 학생이 이미 정했다")
    if PRAISE.search(a):
        out.append('칭찬 — 인정은 사람의 일이다')
    if YOU.search(a):
        out.append("'너' — 화면이 학생을 너라고 부르지 않는다")
    if FOREIGN.search(a):
        out.append('한자·일본어')
    if any(BANMAL.search(s) for s in _sentences(a)):
        out.append('반말 — 튜터는 존댓말로 쓴다')
    return out
