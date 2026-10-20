"""AI 튜터 답변의 형식 검사. 형식만 본다 — 정답이 새는지는 `_tutorjudge.py` 의 LLM 판정이 본다.

막는 것: 300자 초과, 코드 예시가 합쳐 세 줄 이상(`;` 로 이은 것도 줄로 센다), 칭찬, 반말, '너', 한자·일본어,
코드 예시에 이 미션 자료 낱말이나 학생 코드 변수 이름(ctx 를 줄 때) — 문법 예시는 미션과 상관없는 값으로 든다.
되묻기(kind='ask_back')는 `?` 로 끝나고 80자 이하여야 한다 — 중1은 긴 질문을 안 읽는다.
"""
import re

from _schema import BANMAL, FOREIGN, PRAISE, YOU

MAX = 300
ASK_MAX = 80
SEGMENT = re.compile(r'```[\s\S]*?```|`[^`\n]+`')

def _stmts(seg):
    body = re.sub(r'^python\s*', '', seg.strip('`').strip())
    return [p for ln in body.splitlines() for p in ln.split(';') if p.strip()]


def _mission_words(ctx):
    """미션 자료의 낱말(두 글자 이상, 숫자만인 것 제외) + 학생 코드에서 값을 넣은 변수 이름."""
    m = ctx.get('mission') or {}
    text = ' '.join([str(i.get('v', '')) for i in m.get('inputs') or [] if isinstance(i, dict)]
                    + [str(x) for x in m.get('items') or []])
    words = {w for w in re.findall(r'\w+', text) if len(w) > 1 and not w.isdigit()}
    words |= set(re.findall(r'^\s*([A-Za-z_]\w*)\s*=(?!=)', str(ctx.get('code') or ''), re.M))
    return sorted(words)


def _sentences(text):
    plain = SEGMENT.sub('코드', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', plain) if s.strip()]


def problems(answer, kind='answer', ctx=None):
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
    # 문법 예시는 1~2줄까지 준다(2026-10-21 사람이 정함). `d = {}; d['a'] = 1` 도 두 줄로 센다 — 전엔 `;` 하나로 막혀
    # 문법 질문이 고정 되묻기로 떨어졌다 (2026-10-20 리플레이 #11)
    # 한글이 따옴표 밖에 있으면 자리표시 꼴, 따옴표 안에만 있으면 (`d['사과'] = 1`) 예시 줄이다
    code = [x for x in segs if re.search(r'[(=:\[]', x) and not re.search(r'[가-힣]', re.sub(r'([\'"]).*?\1', '', x))]
    if sum(len(_stmts(x)) for x in code) > 2:
        out.append('코드 예시가 합쳐 세 줄 이상 — 두 줄까지만')
    elif any(len(_stmts(x)) > 2 for x in segs):
        out.append('코드 예시가 두 줄을 넘음 — 완성 코드가 된다')
    if ctx:
        own = _mission_words(ctx)
        quoted = str(ctx.get('code') or '')
        for x in segs:
            hit = [w for w in own if re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', x)]
            if hit and x.strip('`').strip() not in quoted:  # 학생 코드 줄을 그대로 짚는 건 위치 말하기다
                out.append(f"코드 예시에 미션 자료·학생 변수({', '.join(hit[:3])}) — 미션과 상관없는 값으로")
                break
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
