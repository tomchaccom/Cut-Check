"""Cut & Check — 미션 생성 (LLM 호출 → 검사 → 재요청 → 칸별 폴백)

  1. LLM 에 _schema.MissionDraft 의 JSON 스키마를 structured output 으로 넘긴다.
  2. 받은 초안을 pydantic 으로 검사한다 (_schema 의 model_validator).
  3. 틀리면 칸별 사유를 붙여 한 번만 다시 요청한다.
  4. 그래도 틀린 칸은 예전 고정 틀로 갈아 끼운다. 어느 칸을 갈았는지는 guard 에 남긴다.
     자료(data)는 갈아 끼울 틀이 없다 — 자료가 틀리면 미션 전체를 포기한다.

LLM 호출은 call_llm(messages) 로 주입받는다. 테스트는 가짜를 넣고, 핸들러는 진짜를 넣는다.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

from pydantic import ValidationError

from _pipeline import run
from _schema import SPEC, MissionDraft, failed_fields

DEFINE_Q = '언제 성공이라고 할 수 있을까요?'

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


def _post(body, key):
    req = urllib.request.Request(API_URL, data=json.dumps(body).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def pickle_llm(messages):
    """structured output 을 먼저 시도하고, 서버가 거절하면 JSON 모드로 내려간다.

    어느 쪽이든 결과는 pydantic 이 똑같이 검사한다 — 형식을 서버에 맡기지 않는다.
    """
    key = re.sub(r'\s', '', os.environ.get('PICKLE_API_KEY', ''))
    if not key:
        raise RuntimeError('PICKLE_API_KEY 가 설정되지 않았습니다.')
    schema = MissionDraft.model_json_schema()
    body = {'model': MODEL, 'max_tokens': 2000, 'messages': messages}
    try:
        return _post({**body, 'response_format': {
            'type': 'json_schema', 'json_schema': {'name': 'mission', 'schema': schema}}}, key)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
    # ponytail: 거절되면 매 호출마다 한 번씩 더 부른다. 지원 여부가 확인되면 한쪽으로 고정한다
    messages = [{**messages[0], 'content': messages[0]['content'] + '\n\n스키마:\n' +
                 json.dumps(schema, ensure_ascii=False)}] + messages[1:]
    return _post({**body, 'messages': messages, 'response_format': {'type': 'json_object'}}, key)


# ── 검사 ────────────────────────────────────────────────────

def _parse(raw):
    """→ (초안 dict | None, {칸: [사유]})"""
    m = re.search(r'\{[\s\S]*\}', raw or '')
    try:
        data = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        return None, {'json': ['JSON 이 아님']}
    if 'mission' not in data:  # 감싸지 않고 미션만 보낸 경우
        data = {'mission': data}
    try:
        MissionDraft.model_validate(data)
        return data['mission'], {}
    except ValidationError as e:
        return data['mission'], failed_fields(e)


# ── 폴백 (예전 고정 틀) ─────────────────────────────────────

def _josa(word, pair):
    """pair = '이가' | '은는' | '을를'. 받침이 없거나 한글이 아니면 뒤쪽."""
    c = str(word)[-1:] or ' '
    has = '가' <= c <= '힣' and (ord(c) - 0xAC00) % 28 != 0
    return pair[0] if has or c in '013678' else pair[1]  # 영·일·삼·육·칠·팔


def _first_token(value):
    if isinstance(value, dict):
        return next(iter(value), '')
    if isinstance(value, str):
        return next((t for t in re.split(r'[,\s→]+', value) if t), '')
    return str(value)


CORRECT = {  # 정답 보기 문장 — 결과로만 쓴다. 방법을 적으면 정답 공개다
    'total': '전체 {item} 수가 나오면 성공',
    'unique': '겹치는 건 한 번만 센 수가 나오면 성공',
    'filtered_count': '조건에 맞는 {item} 수가 나오면 성공',
    'sorted': '순서대로 늘어서면 성공',
    'sum': '전부 더한 값이 나오면 성공',
    'group': '같은 것끼리 센 수가 나오면 성공',
    'transformed': '{item}마다 깔끔해지면 성공',
    'filtered_sum': '숫자만 더한 값이 나오면 성공',
}

STEP = {  # 방법 문장 — 빈칸 밖에 보기 값을 쓰지 않는다
    'sep': '목록을 {sep} 기준으로 나눈다.',
    'dedup': '같은 {item}{eunneun} {dedup}.',
    'output': '{output}을 보여준다.',
    'dir': '{dir} 늘어놓는다.',
    'joinSep': '{joinSep} 기준으로 잇는다.',
    'op': '{item}마다 {op}.',
}


def _fallback(field, m):
    pid, item = m['pipelineId'], m.get('itemName') or '항목'
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
    if field == 'counter':
        # 예전 buildCounterexample 을 옮기되, 결과가 첫 자료와 같아지는 반례(이미 정렬된 목록 등)는 뺐다
        if pid == 'split-filter-count':
            safe = [x for x in items1 + items2 if x not in ft] + ['사과', '바나나', '포도']
            return {'name': '다른 날 자료', 'text': ','.join(dict.fromkeys(safe[:4])), 'axis': 'empty'}
        if pid == 'split-filter-num-sum':
            return {'name': '다른 날 자료', 'text': ','.join(ft + ft[:1]), 'axis': 'empty'}
        if pid == 'split-transform-join':
            return {'name': '다른 날 자료', 'text': ','.join(' ' + x.strip() + ' ' for x in items2), 'axis': 'invisible'}
        extra = {'split-unique-count': [items1[0], items2[0]], 'split-num-sum': items2[:1]}.get(pid, items2[:2])
        return {'name': '다른 날 자료', 'text': ','.join(items1 + extra), 'axis': 'count'}
    if field == 'options':
        first = run(pid, next(iter(SPEC[pid]['keys'].values())), {'filterTarget': ft}, ','.join(items1))
        tok = _first_token(first.get('value', ''))
        opts = [{'v': f'{tok}{_josa(tok, "이가")} 나오면 성공', 'trap': 'hardcode'}]
        opts += [{'v': CORRECT[k].format(item=item), 'trap': None, 'key': k} for k in SPEC[pid]['keys']]
        return opts + [{'v': '에러 안 나면 성공', 'trap': 'luck'}]
    if field == 'sentences':
        out = []
        for slot in SPEC[pid]['slots']:
            if slot == 'cond':
                desc = m.get('filterDesc') or '목록'
                tpl = ('숫자가 아닌 항목은 {cond}.' if pid == 'split-filter-num-sum'
                       else f'{desc}에 {{cond}} 것만 남긴다.')
                if len(tpl) > 25:
                    tpl = '목록에 {cond} 것만 남긴다.'
            else:
                tpl = STEP[slot].replace('{item}', item).replace('{eunneun}', _josa(item, '은는'))
            out.append({'template': tpl, 'slot': slot})
        return out
    return None  # data · filterTarget · pipelineId · json — 갈아 끼울 틀이 없다


ORDER = ['itemName', 'title', 'brief', 'situation', 'counter', 'options', 'sentences']


# ── 조립 ────────────────────────────────────────────────────

def _assemble(m, lesson, key_point, guard):
    pid = m['pipelineId']
    mission = {
        'id': 'ai-' + format(int(time.time() * 1000), 'x'), 'no': 'AI', 'type': 'sentence',
        'pipelineId': pid, 'stage': m['title'], 'title': m['title'],
        'brief': m['brief'], 'situation': m.get('situation', ''),
        'lesson': lesson, 'keyPoint': key_point,
        'define': {'q': DEFINE_Q, 'options': [
            {k: v for k, v in o.items() if k != 'key' or v is not None} for o in m['options']]},
        # 빈칸 보기는 코드가 붙인다 — LLM 은 문장 표현만 썼다
        'method': {'sentences': [{**s, 'options': SPEC[pid]['slots'][s['slot']]} for s in m['sentences']]},
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
    messages = [
        {'role': 'system', 'content': SYSTEM},
        {'role': 'user', 'content': f'오늘 수업: {lesson}\n핵심: {key_point}\n\n이 수업과 이어지는 문제 하나를 만드세요.'},
    ]
    raw = call_llm(messages)
    m, bad = _parse(raw)
    retried = False
    if bad:
        retried = True
        # 어떤 규칙이 얼마나 자주 걸리는지가 프롬프트 개선의 유일한 근거다 (docs/llm.md 2절)
        print('[generate-mission] 1차 사유', json.dumps(bad, ensure_ascii=False), file=sys.stderr)
        messages += [
            {'role': 'assistant', 'content': raw},
            {'role': 'user', 'content': '아래 칸이 규칙에 어긋납니다. 고친 JSON 전체를 다시 보내세요.\n' +
             json.dumps(bad, ensure_ascii=False, indent=1)},
        ]
        raw = call_llm(messages)
        m2, bad2 = _parse(raw)
        if m2 is not None:
            m, bad = m2, bad2
        else:  # 두 번째가 JSON 조차 아니면 첫 번째로 폴백을 시도한다
            bad.setdefault('json', ['두 번째 응답이 JSON 이 아님'])

    reasons = {f: bad[f] for f in bad}  # 남은 사유 — 교사 화면에 '왜 기본 틀인지' 로 간다
    if m is None or any(f not in ORDER for f in bad if f != 'json'):
        raise GenerateError('문제를 만들지 못했어요. 다시 생성해 주세요.', reasons)

    swapped = []
    for field in ORDER:
        if field in bad:
            m[field] = _fallback(field, m)
            swapped.append(field)
    if swapped:
        m, still = _parse(json.dumps({'mission': m}, ensure_ascii=False))
        if still:  # 폴백까지 걸리면 틀 자체가 틀린 것 — 내보내지 않는다
            raise GenerateError('문제를 만들지 못했어요. 다시 생성해 주세요.', {**reasons, 'fallback': still})

    return _assemble(m, lesson, key_point, {'fallback': swapped, 'reasons': reasons, 'retried': retried})
