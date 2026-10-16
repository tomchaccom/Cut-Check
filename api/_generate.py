"""Cut & Check — 미션 생성 (유형 고르기 → 초안 → 검사 → 재요청 → 칸별 폴백)

  1. 유형 고르기 — 작은 스키마(_schema.CHOICE)로 14개 중 하나. 실패하면 키워드 규칙.
  2. 초안 — 그 유형의 스키마(_schema.DRAFTS[pid])만 넘긴다.
  3. 검사에 걸리면 칸별 사유를 붙여 다시 요청한다 (최대 MAX_RETRY 번, 시간이 남을 때만).
  4. 그래도 걸린 칸은 예전 고정 틀로 갈아 끼우고, 어느 칸인지 guard 에 남긴다.
     자료(data)는 갈아 끼울 틀이 없다 — 자료가 틀리면 미션 전체를 포기한다.
  5. 하드코딩·요행 함정은 코드가 붙인다. 하드코딩 함정은 엔진을 돌려야 나오는
     "첫 자료의 실제 결과"라 LLM 이 알 수 없다 (평가에서 12번 틀렸다).

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
"""
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

from pydantic import ValidationError

from _pipeline import run
from _schema import (CHOICE, DESC, DRAFTS, SPEC, STEP_EXAMPLE, STEP_EXAMPLE_NUM_COND, counter_problems,
                     failed_fields, template)

DEFINE_Q = '언제 성공이라고 할 수 있을까요?'
DEADLINE = 55     # 초. Vercel maxDuration 60 안에서 응답까지 끝낸다
RETRY_NEEDS = 15  # 초. 이만큼 안 남았으면 재요청 대신 바로 기본 틀로 간다
MAX_RETRY = 2     # 자료는 기본 틀이 없어서, 시간이 남으면 한 번 더 기회를 준다

SYSTEM = '\n'.join([
    '당신은 중학교 1학년 수업에 쓸 데이터 정리 문제를 만든다.',
    '학생은 문제를 보고 성공 조건과 처리 방법을 스스로 정한 뒤, 자료 세 개로 실행해 보고 판단한다.',
    '세 번째 자료는 반례다. 앞 두 자료로 대충 세운 기준이 여기서 깨져야 한다.',
    '',
    '지키는 것',
    '- 답, 방법, 고칠 곳을 문제에 쓰지 않는다. 문제는 일부러 모호하게 쓴다.',
    '- 학생에게 보이는 문장은 존댓말, 한 칸에 한 문장. 괄호·줄표·"예를 들어" 같은 덧붙임 없이 쓴다.',
    '- 칭찬하지 않는다. 한국어만 쓴다.',
    '- 각 칸의 description 과 글자 수(maxLength)를 따른다.',
    '',
    'JSON 하나만 응답한다.',
])


# ── LLM 호출 ────────────────────────────────────────────────

API_URL = 'https://llm.pcl.kr/v1/chat/completions'
MODEL = 'pickle-general'


def _post(body, key, timeout):
    req = urllib.request.Request(API_URL, data=json.dumps(body).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def pickle_llm(messages, schema, timeout):
    """structured output 을 쓴다. 서버가 거절하면 JSON 모드로 내려간다.

    평가에서 json_schema 는 매번 받아들여졌다. 어느 쪽이든 결과는 pydantic 이 똑같이 검사한다.
    """
    key = re.sub(r'\s', '', os.environ.get('PICKLE_API_KEY', ''))
    if not key:
        raise RuntimeError('PICKLE_API_KEY 가 설정되지 않았습니다.')
    body = {'model': MODEL, 'max_tokens': 1500, 'messages': messages}
    try:
        return _post({**body, 'response_format': {
            'type': 'json_schema', 'json_schema': {'name': 'mission', 'schema': schema}}}, key, timeout)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
    messages = [{**messages[0], 'content': messages[0]['content'] + '\n\n스키마:\n' +
                 json.dumps(schema, ensure_ascii=False)}] + messages[1:]
    return _post({**body, 'messages': messages, 'response_format': {'type': 'json_object'}}, key, timeout)


def _json(raw):
    m = re.search(r'\{[\s\S]*\}', raw or '')
    try:
        data = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict) and isinstance(data.get('mission'), dict):  # 한 겹 감싸 보낸 경우
        data = data['mission']
    return data if isinstance(data, dict) else None


def _repair(pid, d):
    """항목 사이의 관계는 모델이 재요청해도 잘 못 맞췄다 (평가 3회차 실패 5건이 전부 자료).
    코드가 확실히 고칠 수 있는 것만 고치고, 고친 내용은 d['_repaired'] 에 남긴다.
    자료의 내용(무슨 단어인지)은 바꾸지 않는다 — 단위를 떼거나 이미 있는 단어를 옮길 뿐이다."""
    notes = d.setdefault('_repaired', [])
    data = d.get('data')
    if not isinstance(data, list) or len(data) < 2 or not all(isinstance(x, dict) for x in data[:2]):
        return
    for ds in data[:2]:
        if isinstance(ds.get('items'), list):  # 숫자를 숫자로 보낸 경우, 빈 항목
            ds['items'] = [str(x) for x in ds['items'] if str(x).strip()]
    if isinstance(d.get('filterTarget'), list):  # 엔진은 앞뒤 공백을 지우고 비교한다
        d['filterTarget'] = [str(x).strip() for x in d['filterTarget'] if str(x).strip()]
    ops = SPEC[pid]['ops']
    integer = lambda x: re.fullmatch(r'-?\d+', x.strip())  # noqa: E731
    if 'toNumber' in ops:
        for ds in data[:2]:
            for i, x in enumerate(ds.get('items', [])):
                m = None if integer(x) else re.fullmatch(r'\D{0,3}?(-?\d{1,3}(?:,\d{3})+|-?\d+)\s*\D{0,3}', x.strip())
                if m:  # "1,000원" → "1000"
                    ds['items'][i] = m.group(1).replace(',', '')
                    notes.append(f"'{x}' → '{ds['items'][i]}' (단위·쉼표를 뗐어요)")
        if 'filter' in ops:  # 숫자가 아닌 항목이 곧 걸러낼 대상이다
            ft = list(d.get('filterTarget') or [])
            words = [x.strip() for ds in data[:2] for x in ds.get('items', []) if not integer(x) and x.strip() not in ft]
            if words:
                d['filterTarget'] = ft + list(dict.fromkeys(words))
                notes.append(f"걸러낼 대상에 {', '.join(dict.fromkeys(words))} 를 넣었어요")
    elif 'filter' in ops:
        ft = d.get('filterTarget') or []
        items = [x for ds in data[:2] for x in ds.get('items', [])]
        if ft and not set(ft) & set(items):  # 걸러낼 대상이 자료에 없으면 걸러낼 게 없다
            for ds, w in zip(data[:2], (ft[0], ft[-1])):
                its = ds.setdefault('items', [])
                if len(its) >= 5:
                    its[-1] = w
                else:
                    its.append(w)
            notes.append(f"걸러낼 대상 {ft[0]}·{ft[-1]} 를 자료에 넣었어요")
    if 'groupCount' in ops and all(len(set(ds.get('items', []))) == len(ds.get('items', [])) for ds in data[:2]):
        its = data[0].setdefault('items', [])  # 겹치는 항목이 없으면 묶어 셀 게 없다
        if its:
            if len(its) >= 5:
                its[-1] = its[0]
            else:
                its.append(its[0])
            notes.append(f"'{its[0]}' 를 한 번 더 넣었어요 (겹치는 항목이 있어야 묶어 셀 수 있어요)")


def _parse(pid, raw):
    """→ (초안 dict | None, {칸: [사유]})"""
    data = raw if isinstance(raw, dict) else _json(raw)
    if data is None:
        return None, {'json': ['JSON 이 아님']}
    data.pop('pipelineId', None)
    _repair(pid, data)
    try:
        DRAFTS[pid].model_validate(data)
        return data, {}
    except ValidationError as e:
        return data, failed_fields(e)


# ── 1. 유형 고르기 ──────────────────────────────────────────

# 예전 Node 생성기가 유형을 정하던 키워드 규칙. 이제는 LLM 이 못 골랐을 때만 쓴다.
KEYWORDS = [  # 구체적인 것이 먼저 걸리게 위에 둔다
    (['예외', 'try', 'except', '에러', 'error'], 'split-filter-num-sum'),
    (['최대', 'max', '가장 큰'], 'split-num-max'),
    (['최소', 'min', '가장 작은'], 'split-num-min'),
    (['딕셔너리', 'dict', '사전', '분류', '빈도'], 'split-group'),
    (['정렬', 'sort', '순서', '나열'], 'split-sort-join'),
    (['함수', 'def ', '변환', 'strip', 'replace', 'upper', 'lower', '공백'], 'split-transform-join'),
    (['조건', 'if', '필터', '걸러', '선별', '골라', '반복', 'for', 'while'], 'split-filter-count'),
    (['집합', 'set', '중복'], 'split-unique-count'),
    (['숫자', 'int', 'sum', '합계', '형변환', '계산', '더하'], 'split-num-sum'),
]


def by_keyword(lesson, key_point):
    text = f'{lesson} {key_point}'.lower()
    return next((pid for words, pid in KEYWORDS if any(w in text for w in words)), 'split-unique-count')


def choose(lesson, key_point, call_llm, timeout):
    messages = [
        {'role': 'system', 'content': '중학교 1학년 데이터 정리 문제의 유형을 고른다. JSON 하나만 응답한다.'},
        {'role': 'user', 'content': f'오늘 수업: {lesson}\n핵심: {key_point}\n\n이 수업과 가장 잘 이어지는 유형:\n' +
         '\n'.join(f'- {k}: {v}' for k, v in DESC.items())},
    ]
    try:
        pid = (_json(call_llm(messages, CHOICE.model_json_schema(), timeout)) or {}).get('pipelineId')
    except Exception as e:  # 유형 고르기가 실패해도 키워드로 이어 간다
        print('[generate-mission] 유형 고르기 실패', repr(e), file=sys.stderr)
        pid = None
    return (pid, 'llm') if pid in SPEC else (by_keyword(lesson, key_point), 'keyword')


# ── 폴백 (예전 고정 틀) ─────────────────────────────────────

def _josa(word, pair):
    """pair = '이가' | '은는' | '을를'. 받침이 없거나 한글·숫자가 아니면 뒤쪽."""
    c = str(word)[-1:] or ' '
    has = '가' <= c <= '힣' and (ord(c) - 0xAC00) % 28 != 0
    return pair[0] if has or c in '013678' else pair[1]  # 영·일·삼·육·칠·팔


CORRECT = {  # 정답 보기 기본 문장 — 결과로만 쓴다
    'count': '{item}{iga} 몇 개인지 나오면 성공', 'total': '전체 {item} 수가 나오면 성공',
    'unique': '겹치는 건 한 번만 센 수가 나오면 성공', 'filtered_count': '조건에 맞는 {item} 수가 나오면 성공',
    'filtered': '조건에 맞는 {item}만 남으면 성공', 'sorted': '순서대로 늘어서면 성공',
    'transformed': '{item}마다 깔끔해지면 성공', 'sum': '전부 더한 값이 나오면 성공',
    'filtered_sum': '숫자만 더한 값이 나오면 성공', 'max': '가장 큰 값이 나오면 성공',
    'min': '가장 작은 값이 나오면 성공', 'group': '{item}마다 나온 횟수가 보이면 성공',
}


def _counter_candidates(pid, items1, items2, ft):
    ops = SPEC[pid]['ops']
    other = '다른 날 자료'
    if 'filter' in ops:  # 걸러낼 대상이 하나도 없는 날 → 결과가 비어 버린다
        safe = list(dict.fromkeys(x for x in items1 + items2 if x not in ft))
        rest = ft + ft[:1] if 'toNumber' in ops else (safe + ['사과', '바나나', '포도'])[:4]
        yield {'name': other, 'text': ','.join(rest), 'axis': 'empty'}
    if 'transform' in ops:  # 눈에 안 보이는 앞뒤 공백
        yield {'name': other, 'text': ','.join(' ' + x.strip() + ' ' for x in items2), 'axis': 'invisible'}
    for extra in ([items1[0], items2[0]], items2[:2], items2[:1]):
        yield {'name': other, 'text': ','.join(items1 + extra), 'axis': 'count'}
    if 'toNumber' in ops and 'filter' not in ops:  # 최댓값·최솟값은 끝값이 바뀌어야 깨진다
        nums = [int(x) for x in items1]
        for v in (max(nums) + 100, min(nums) - 1):
            yield {'name': other, 'text': ','.join(items1 + [str(v)]), 'axis': 'count'}


def _fallback(field, pid, m):
    item = m.get('itemName') or '항목'
    items1, items2 = m['data'][0]['items'], m['data'][1]['items']
    ft = m.get('filterTarget') or []
    if field == 'title':
        return '오늘의 미션'
    if field == 'brief':
        return '이 목록을 정리해 주세요.'
    if field == 'situation':
        return ''
    if field == 'itemName':
        return '항목'
    if field == 'filterDesc':
        return '골라낼 것'
    if field == 'counter':
        for c in _counter_candidates(pid, items1, items2, ft):
            if not counter_problems(pid, m['data'], ft, c):
                return c
        return None
    if field == 'goals':
        return {k: CORRECT[k].format(item=item, iga=_josa(item, '이가')) for k in SPEC[pid]['keys']}
    if field == 'sentences':
        out = {}
        for slot in SPEC[pid]['slots']:
            num = slot == 'cond' and 'toNumber' in SPEC[pid]['ops']
            before, after = STEP_EXAMPLE_NUM_COND if num else STEP_EXAMPLE[slot]
            desc = m.get('filterDesc') or '목록'
            before = before.replace('{item}', item).replace('{eunneun}', _josa(item, '은는')).replace(
                '{desc}', desc if len(desc) <= 8 else '목록')
            out[slot] = {'before': before, 'after': after}
        return out
    return None  # data · filterTarget · json — 갈아 끼울 틀이 없다


ORDER = ['itemName', 'filterDesc', 'title', 'brief', 'situation', 'counter', 'goals', 'sentences']


# ── 함정 보기 (코드가 쓴다) ─────────────────────────────────

def _hardcode(value):
    """첫 자료의 실제 결과를 그대로 성공으로 삼는 문장."""
    if isinstance(value, dict):
        k, n = next(iter(value.items()), ('', 0))
        return f'{k}{_josa(k, "이가")} {n}번 나오면 성공'
    if value in (None, ''):
        return '빈 결과가 나오면 성공'
    if isinstance(value, str):
        if len(value) <= 12:
            return f'{value}{_josa(value, "이가")} 나오면 성공'
        first = re.split(r'[,\s→]+', value)[0]
        return f'{first}{_josa(first, "이가")} 맨 앞이면 성공'
    return f'{value}{_josa(value, "이가")} 나오면 성공'


def _options(pid, m):
    ft = m.get('filterTarget')
    first_key, slots = next(iter(SPEC[pid]['keys'].items()))
    value = run(pid, slots, {'filterTarget': ft} if ft else {}, ','.join(m['data'][0]['items']))['value']
    opts = [{'v': _hardcode(value), 'trap': 'hardcode'}]
    opts += [{'v': v, 'trap': None, 'key': k} for k, v in m['goals'].items()]
    opts.append({'v': '에러 안 나면 성공', 'trap': 'luck'})
    random.shuffle(opts)  # 늘 같은 자리에 있으면 학생은 내용이 아니라 자리를 외운다
    return opts


# ── 조립 ────────────────────────────────────────────────────

def _assemble(pid, m, lesson, key_point, guard):
    mission = {
        'id': 'ai-' + format(int(time.time() * 1000), 'x'), 'no': 'AI', 'type': 'sentence',
        'pipelineId': pid, 'stage': m['title'], 'title': m['title'],
        'brief': m['brief'], 'situation': m.get('situation', ''),
        'lesson': lesson, 'keyPoint': key_point,
        'define': {'q': DEFINE_Q, 'options': _options(pid, m)},
        # 빈칸 보기는 코드가 붙인다 — LLM 은 문장 표현만 썼다
        'method': {'sentences': [{'template': template(slot, m['sentences'][slot]), 'slot': slot, 'options': opts}
                                 for slot, opts in SPEC[pid]['slots'].items()]},
        'inputs': [{'id': f'd0{i + 1}', 'name': d['name'], 'v': ','.join(d['items'])} for i, d in enumerate(m['data'])]
        + [{'id': 'd03', 'name': m['counter']['name'], 'v': m['counter']['text'],
            'counter': True, 'axis': m['counter']['axis']}],
        'guard': guard,
    }
    if m.get('filterTarget'):
        mission['pipelineParams'] = {'filterTarget': m['filterTarget']}
    return mission


class GenerateError(Exception):
    def __init__(self, msg, reasons):
        super().__init__(msg)
        self.reasons = reasons


def generate(lesson, key_point, call_llm=pickle_llm):
    t0 = time.monotonic()
    left = lambda: DEADLINE - (time.monotonic() - t0)  # noqa: E731

    pid, picked = choose(lesson, key_point, call_llm, min(15, left()))
    schema = DRAFTS[pid].model_json_schema()
    messages = [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': f'오늘 수업: {lesson}\n핵심: {key_point}\n유형: {DESC[pid]}\n\n'
                                    '이 수업과 이어지는 문제 하나를 만드세요.'},
    ]
    raw = call_llm(messages, schema, left())
    m, bad = _parse(pid, raw)
    retried = 0
    while bad and retried < MAX_RETRY and left() > RETRY_NEEDS:
        retried += 1
        # 어떤 규칙이 얼마나 자주 걸리는지가 프롬프트 개선의 유일한 근거다 (docs/llm.md 2절)
        print(f'[generate-mission] {retried}차 사유', json.dumps(bad, ensure_ascii=False), file=sys.stderr)
        messages += [
            {'role': 'assistant', 'content': raw},
            {'role': 'user', 'content': '아래 칸이 규칙에 어긋납니다. 고친 JSON 전체를 다시 보내세요.\n' +
             json.dumps(bad, ensure_ascii=False, indent=1)},
        ]
        try:
            raw = call_llm(messages, schema, left())
        except Exception as e:  # 재요청이 시간 초과·오류면 이미 받은 초안으로 마무리한다
            print('[generate-mission] 재요청 실패', repr(e), file=sys.stderr)
            break
        m2, bad2 = _parse(pid, raw)
        if m2 is not None:
            m, bad = m2, bad2

    reasons = {f: v for f, v in bad.items()}  # 남은 사유 — 교사 화면에 '왜 기본 틀인지' 로 간다
    if m is None or any(f not in ORDER for f in bad):
        raise GenerateError('문제를 만들지 못했어요. 다시 생성해 주세요.', {**reasons, 'pipelineId': [pid]})

    # 칸이 아예 빠져 있으면 pydantic 이 내용 검사를 건너뛰어서, 빠진 칸을 채운 뒤에야
    # 다른 칸(예: 반말 brief)이 드러난다. 그래서 드러난 칸이 없어질 때까지 갈아 끼운다.
    swapped, todo = [], dict(bad)
    while todo:
        if any(f not in ORDER or f in swapped for f in todo):
            # 폴백까지 걸리면 틀 자체가 틀린 것 — 내보내지 않는다
            raise GenerateError('문제를 만들지 못했어요. 다시 생성해 주세요.', {**reasons, 'fallback': todo})
        for field in ORDER:
            if field in todo:
                m[field] = _fallback(field, pid, m)
                swapped.append(field)
        m, todo = _parse(pid, m)
        for f, v in todo.items():
            reasons.setdefault(f, v)

    repaired = list(dict.fromkeys(m.pop('_repaired', [])))
    return _assemble(pid, m, lesson, key_point, {'fallback': swapped, 'reasons': reasons, 'retried': retried,
                                                 'picked': picked, 'repaired': repaired})
