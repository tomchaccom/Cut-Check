"""AI 튜터 답변의 형식 검사. 형식만 본다 — 정답이 새는지는 `_tutorjudge.py` 의 LLM 판정이 본다.

막는 것: 300자 초과, 백틱 예시 둘 이상, 두 줄 이상 코드 예시, `;`, 칭찬, 반말, '너', 한자·일본어.
되묻기(kind='ask_back')는 `?` 로 끝나고 80자 이하여야 한다 — 중1은 긴 질문을 안 읽는다.
"""
import re

from _schema import BANMAL, FOREIGN, PRAISE, YOU

MAX = 300
ASK_MAX = 80
SEGMENT = re.compile(r'```[\s\S]*?```|`[^`\n]+`')

def _sentences(text):
    plain = SEGMENT.sub('코드', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', plain) if s.strip()]


def problems(answer, kind='answer'):
    a = str(answer or '').strip()
    if not a:
        return ['빈 답변']
    out = []
    if len(a) > MAX:
        out.append(f'{MAX}자 초과 ({len(a)}자)')
    # `append()` · `for` 처럼 이름만 감싼 건 예시가 아니다. 이걸 세면 평범한 문법 답이 거의 다 막혔다 (2026-10-16 10건 중 6건)
    segs = [x for x in SEGMENT.findall(a) if not re.fullmatch(r'`\w+(\(\))?`', x)]
    # 줄줄이 이으면 프로그램이 되는 건 '코드 줄' 이다. `a,b,c` 같은 값, `range(시작, 끝)` 같은 문법 꼴(한글 자리표시)은
    # 예시 줄이 아니다 — 이걸 세서 평범한 답이 또 막혔다 (2026-10-17, 거절 5건 중 4건)
    lines = [x for x in segs if re.search(r'[(=:]', x) and not re.search(r'[가-힣]', x)]
    if len(lines) > 2:
        out.append('코드 예시가 셋 이상 — 둘까지만')
    for s in segs:
        body = re.sub(r'^python\s*', '', s.strip('`').strip())
        if len([ln for ln in body.splitlines() if ln.strip()]) > 1:
            out.append('코드 예시가 한 줄을 넘음 — 완성 코드가 된다')
            break
    for s in segs:
        body = s.strip('`')
        if ';' in body:
            out.append('코드 예시에 ; — 한 줄에 프로그램을 담는다')
    if kind == 'ask_back' and not (a.endswith('?') and len(a) <= ASK_MAX):
        out.append(f'되묻기는 ? 로 끝나는 {ASK_MAX}자 이하 한 문장')
    if PRAISE.search(a):
        out.append('칭찬 — 인정은 사람의 일이다')
    if YOU.search(a):
        out.append("'너' — 화면이 학생을 너라고 부르지 않는다")
    if FOREIGN.search(a):
        out.append('한자·일본어')
    if any(BANMAL.search(s) for s in _sentences(a)):
        out.append('반말 — 튜터는 존댓말로 쓴다')
    return out
