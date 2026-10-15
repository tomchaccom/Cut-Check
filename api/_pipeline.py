"""Cut & Check — 조합형 파이프라인 엔진 (Python 판)

js/core/pipeline.js 를 옮겨 심은 것이다. 생성된 미션의 반례가 진짜 반례인지
서버에서 실제로 돌려보려고 둔다.

규칙이 두 군데 생기면 반드시 갈라진다. 그래서 test/test_pipeline_parity.py 가
같은 입력을 JS·Python 양쪽에 넣어 결과가 다르면 깨진다.
JS 를 고치면 여기도 고치고, 그 테스트를 돌린다.

생성기가 쓰는 7개 파이프라인만 옮긴다 (max/min 은 생성기가 안 쓴다).
"""
import re

OPS = {
    'split': ('text', 'list'),
    'filter': ('list', 'list'),
    'unique': ('list', 'list'),
    'count': ('list', 'number'),
    'sort': ('list', 'list'),
    'transform': ('list', 'list'),
    'join': ('list', 'text'),
    'toNumber': ('list', 'numlist'),
    'sum': ('numlist', 'number'),
    'groupCount': ('list', 'pairs'),
}

WHITELIST = {
    'split-unique-count': ['split', 'unique', 'count'],
    'split-filter-count': ['split', 'filter', 'count'],
    'split-sort-join': ['split', 'sort', 'join'],
    'split-num-sum': ['split', 'toNumber', 'sum'],
    'split-group': ['split', 'groupCount'],
    'split-transform-join': ['split', 'transform', 'join'],
    'split-filter-num-sum': ['split', 'filter', 'toNumber', 'sum'],
}

SEP_MAP = {'쉼표': ',', '공백': re.compile(r'\s+'), '줄바꿈': '\n'}
JOIN_MAP = {'쉼표': ',', '공백': ' ', '줄바꿈': '\n', '화살표': ' → '}


def _js_trim(s):
    # JS String.prototype.trim 과 같은 공백 집합 (BOM 포함)
    return s.strip(' \t\n\r\v\f ﻿  ')


def _to_number(s):
    # JS Number(): 빈 문자열은 0, 숫자가 아니면 NaN(None)
    t = _js_trim(s)
    if t == '':
        return 0
    try:
        f = float(t)
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


def _exec(op, val, slots, params):
    if op == 'split':
        sep = SEP_MAP.get(slots.get('sep'), ',')
        parts = val.split(sep) if isinstance(sep, str) else sep.split(val)
        return 'list', [p for p in parts if p]
    if op == 'filter':
        tgt = params.get('filterTarget')
        cond = slots.get('cond') or ''
        if '그대로' in cond:
            return 'list', list(val)
        keep = '빼고' not in cond and (cond in ('있는', '포함') or '남긴다' in cond)
        if isinstance(tgt, list):
            hit = lambda x: _js_trim(x) in tgt
        else:
            hit = lambda x: (tgt or '') in x
        return 'list', [x for x in val if hit(x) == keep]
    if op == 'unique':
        if slots.get('dedup') == '각각 남긴다':
            return 'list', list(val)
        seen = []
        for x in val:
            if x not in seen:
                seen.append(x)
        return 'list', seen
    if op == 'count':
        if slots.get('output') == '항상 숫자 3':
            return 'number', 3
        return 'number', len(val)
    if op == 'sort':
        # ponytail: 코드포인트 정렬. 한글 음절끼리는 localeCompare('ko') 와 같고, 영문·숫자가 섞이면 다를 수 있다
        s = sorted(val)
        if slots.get('dir') == '거꾸로':
            s.reverse()
        return 'list', s
    if op == 'transform':
        arg = params.get('transformArg') or ''
        o = slots.get('op') or ''
        if o == '공백제거' or '공백' in o:
            f = _js_trim
        elif o == '앞에붙이기':
            f = lambda x: arg + _js_trim(x)
        elif o == '뒤에붙이기':
            f = lambda x: _js_trim(x) + arg
        elif o == '첫글자만' or '첫' in o:
            f = lambda x: _js_trim(x)[:1]
        else:
            f = lambda x: x
        return 'list', [f(x) for x in val]
    if op == 'join':
        return 'text', JOIN_MAP.get(slots.get('joinSep'), ',').join(val)
    if op == 'toNumber':
        nums = [_to_number(x) for x in val]
        if any(n is None for n in nums):
            raise _StepError('숫자로 바꿀 수 없는 항목이 있어요.')
        return 'numlist', nums
    if op == 'sum':
        return 'number', sum(val)
    if op == 'groupCount':
        g = {}
        for x in val:
            k = _js_trim(x)
            g[k] = g.get(k, 0) + 1
        return 'pairs', g
    raise _StepError('알 수 없는 연산: ' + op)


class _StepError(Exception):
    pass


def run(pipeline_id, slots, params, text):
    """→ {'err': 0, 'type', 'value'} 또는 {'err': 1, 'msg'}"""
    ops = WHITELIST.get(pipeline_id)
    if ops is None:
        return {'err': 1, 'msg': '알 수 없는 파이프라인: ' + pipeline_id}
    t, v = 'text', text
    for op in ops:
        if OPS[op][0] != t:
            return {'err': 1, 'msg': '값을 못 받았어요.'}
        try:
            t, v = _exec(op, v, slots or {}, params or {})
        except _StepError as e:
            return {'err': 1, 'msg': str(e)}
    return {'err': 0, 'type': t, 'value': v}
