"""Cut & Check — 생성 미션의 형식과 검사

이 파일 하나가 두 가지 일을 한다.

  1. 형식 — 모델의 JSON 스키마를 structured output 으로 LLM 에 넘긴다.
     Field(description=...) 이 곧 LLM 에게 주는 생성 지시다.
  2. 검사 — 모양이 맞아도 내용이 틀릴 수 있다. model_validator 가
     실제로 엔진을 돌려보고 판정한다.

생성은 두 번에 나눈다 (평가에서 7개 유형이 섞인 큰 스키마를 한 번에 채우지 못했다).
  CHOICE      — 유형 하나만 고르는 작은 스키마
  DRAFTS[pid] — 그 유형의 초안 스키마. 다른 유형은 섞이지 않는다

LLM 이 바꿀 수 없는 것 — 빈칸 이름, 빈칸 보기 값, 정답 key, 하드코딩·요행 함정.
보기 값은 엔진(_pipeline.py)의 의미와 맞물려 있고, 하드코딩 함정은 엔진을 돌려야
나오는 "첫 자료의 실제 결과"라서 LLM 이 알 수 없다. 둘 다 코드가 쓴다.
LLM 이 쓰는 것 — 요청(구할 값을 말하는 한 문장)·상황·자료·반례의 이름. 성공 조건과 방법은 코드가 쓴다.

빈칸은 유형이 아니라 연산마다 정한다. 그래서 엔진의 허용 조합 14개가
손으로 표를 적지 않아도 전부 생성 대상이 된다.
"""
import re
from typing import Annotated, ClassVar, Literal

from pydantic import AfterValidator, BaseModel, Field, ValidationError, create_model, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError

from _pipeline import WHITELIST, run

# ── 유형 표 ─────────────────────────────────────────────────
# 연산 → (빈칸 이름, 학생이 고르는 보기, 정답 보기). 보기 순서 그대로 화면에 나간다.
SEP = ['쉼표', '공백', '줄바꿈']
OP_SLOT = {
    'split': ('sep', SEP, '쉼표'),  # 자료는 쉼표로 이어 붙이므로 정답은 늘 쉼표
    'unique': ('dedup', ['각각 남긴다', '하나만 남긴다'], '하나만 남긴다'),
    'count': ('output', ['남은 항목의 개수', '항상 숫자 3'], '남은 항목의 개수'),
    'sort': ('dir', ['가나다순으로', '거꾸로'], '가나다순으로'),
    'join': ('joinSep', ['쉼표', '공백'], '쉼표'),
    'transform': ('op', ['앞뒤 공백을 없앤다', '첫 글자만 남긴다'], '앞뒤 공백을 없앤다'),
    'filter': ('cond', ['있는', '없는'], '있는'),
}
# 숫자로 바꾸기 전에 거르는 경우는 "글자를 빼고 숫자만" 이라는 다른 판단이다
FILTER_NUM = ('cond', ['빼고 숫자만 남긴다', '그대로 둔다'], '빼고 숫자만 남긴다')

DESC = {  # 유형 고르기에 쓰는 설명. 학생이 무엇을 처리하는지로 쓴다
    'split-count': '목록의 항목 수 세기',
    'split-unique-count': '같은 항목이 겹쳐 나오는 목록에서 개수 세기',
    'split-filter-count': '조건에 맞는 항목만 골라 세기',
    'split-filter-join': '조건에 맞는 항목만 골라 다시 이어 붙이기',
    'split-filter-unique-count': '조건에 맞는 항목만 골라, 겹치는 건 한 번만 세기',
    'split-sort-join': '항목을 순서대로 늘어놓기',
    'split-filter-sort-join': '조건에 맞는 항목만 골라 순서대로 늘어놓기',
    'split-transform-join': '항목마다 앞뒤 공백 같은 것을 정리하기',
    'split-transform-unique-count': '항목을 정리한 뒤, 겹치는 건 한 번만 세기',
    'split-num-sum': '숫자 목록의 합계',
    'split-num-max': '숫자 목록에서 가장 큰 값',
    'split-num-min': '숫자 목록에서 가장 작은 값',
    'split-group': '같은 항목끼리 묶어 몇 번씩 나왔는지 세기',
    'split-filter-num-sum': '숫자와 글자가 섞인 목록에서 숫자만 골라 더하기',
}

KEY_MEAN = {  # 정답 key → 그 성공 조건이 가리키는 결과. goals 칸의 description 이 된다
    'count': '항목 개수', 'total': '겹쳐도 전부 센 개수', 'unique': '겹치는 건 한 번만 센 개수',
    'filtered_count': '조건에 맞는 항목의 개수', 'filtered': '조건에 맞는 항목만 남은 목록',
    'sorted': '순서대로 늘어선 목록', 'transformed': '항목마다 정리된 목록',
    'sum': '전부 더한 값', 'filtered_sum': '숫자만 골라 더한 값',
    'max': '가장 큰 값', 'min': '가장 작은 값', 'group': '항목마다 나온 횟수',
}

# 요청 문장에 있어야 하는 '구할 값' 말. 첫 번째 정답 key 로 고른다 (사람 결정 2026-10-16)
KEY_TARGET = {
    'count': r'몇', 'total': r'몇', 'unique': r'몇', 'filtered_count': r'몇', 'group': r'몇|횟수',
    'sum': r'얼마|합|모두 더', 'filtered_sum': r'얼마|합|모두 더', 'max': r'가장|제일', 'min': r'가장|제일',
    'sorted': r'순서|차례', 'filtered': r'목록|명단', 'transformed': r'목록|명단',
}


def _spec(pid):
    ops = WHITELIST[pid]
    slots, right = {}, {}
    for op in ops:
        if op in OP_SLOT:
            name, opts, ok = FILTER_NUM if op == 'filter' and 'toNumber' in ops else OP_SLOT[op]
            slots[name], right[name] = opts, ok
    last = ops[-1]
    if last == 'count' and 'unique' in ops:
        keys = {'unique': right, 'total': {**right, 'dedup': '각각 남긴다'}}
    elif last == 'count':
        keys = {'filtered_count' if 'filter' in ops else 'count': right}
    elif last == 'join':
        keys = {'sorted' if 'sort' in ops else 'transformed' if 'transform' in ops else 'filtered': right}
    elif last == 'sum':
        keys = {'filtered_sum' if 'filter' in ops else 'sum': right}
    else:  # max · min · groupCount
        keys = {'group' if last == 'groupCount' else last: right}
    return {'ops': ops, 'slots': slots, 'keys': keys}


#   slots — 빈칸 이름 → 학생이 고르는 보기
#   keys  — 정답 성공 조건 key → 그 성공을 내는 빈칸 조합 (검사 때 실제로 돌린다)
SPEC = {pid: _spec(pid) for pid in WHITELIST}


# ── 학생이 읽는 문장 ─────────────────────────────────────────
# CLAUDE.md 화면 문구 규칙 + docs/llm.md 거부 규칙.

PRAISE = re.compile(r'(잘했|훌륭|대단|멋지|최고|완벽|참 잘)')
CODE = re.compile(r'(```|split\s*\(|\bfor\b\s+\w+\s+in|\.strip\s*\(|append\s*\(|print\s*\()')
FOREIGN = re.compile(r'[一-鿿㐀-䶿぀-ヿ]')
# 중1이 읽는다. 개발 용어는 읽히지 않고, 지시문은 문제가 아니라 숙제처럼 읽힌다.
JARGON = re.compile(r'로직|데이터|타당성|집계|카운터|알고리즘|프로세스')
ORDER = re.compile(r'(명시|기술|서술|작성)하(세요|시오)')
# 화면이 학생에게 말할 때는 존댓말. 반말은 asks.js 에만 허용된다.
BANMAL = re.compile(r'(봐|해|야|지|어|니|자|래|줘|거든|잖아|냐)[.!?~]*$')
YOU = re.compile(r'(^|\s)(너|네가|너의|너는|너도)(\s|$)')
# 한 번에 읽혀야 한다. 중1은 덧붙인 설명을 읽지 않고, 안 읽으면 없는 것과 같다.
ASIDE = re.compile(r'[()\[\]]|—|–| - |즉|예를 들어|참고로|왜냐하면|다시 말해|단,|※')


def _text_problem(v):
    if PRAISE.search(v):
        return '칭찬 — 인정은 사람의 일이다'
    if CODE.search(v):
        return '코드 조각 — 베껴 쓸 답을 준다'
    if FOREIGN.search(v):
        return '한자·일본어 — 한국어만 쓴다'
    m = JARGON.search(v)
    if m:
        return f"개발 용어 '{m.group(0)}' — 중1이 읽는 문장이다"
    m = ORDER.search(v)
    if m:
        return f"지시문 '{m.group(0)}' — 학생에게 일을 맡기는 요청문으로 쓴다"


def _sentence_problem(v):
    if BANMAL.search(v.strip()):
        return '반말 — 학생 화면은 존댓말로 쓴다'
    if YOU.search(v):
        return "'너' — 화면이 학생을 너라고 부르지 않는다"


def _plain_problem(v):
    if len(re.findall(r'[.?!]+(\s|$)', v.strip())) > 1:
        return '두 문장 이상 — 한 칸에 한 문장만 쓴다'
    m = ASIDE.search(v)
    if m:
        return f"덧붙임 '{m.group(0)}' — 부연 설명 없이 한 번에 읽히게 쓴다"


def _polite_problem(v):
    """금지 목록으로는 '결정해라', '작성한다' 를 다 못 막았다. 통과 조건으로 쓴다."""
    if v.strip() and not re.search(r'요[.?!]?$', v.strip()):  # situation 은 비워 둘 수 있다
        return '존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요'


def _brief_problem(v):
    m = re.search(r'서로\s*다른|전체\s*개수|중복', v)
    if m:
        return f"답 암시 '{m.group(0)}' — 업무 요청은 모호해야 분해가 학생 몫으로 남는다"


ITEM_MAX = 12  # 항목은 단어다. 목록을 통째로("7 3 2 4") 넣거나 문장을 넣으면 길어진다


def _item(v: str) -> str:
    if not v.strip():
        raise ValueError('빈 항목 — 학생 화면에서 보이지 않는 칸이 된다')
    if len(v.strip()) > ITEM_MAX or re.search(r'[.?!]', v):
        raise ValueError(f"'{v}' — 항목은 {ITEM_MAX}자 안의 단어 하나")
    if ',' in v:
        raise ValueError('항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다')
    if re.fullmatch(r'항목\s*\d+|[A-Za-z]\d+|노래\s*\d+', v.strip()):
        raise ValueError('플레이스홀더 — 실제 한국어 단어를 쓴다')
    return v


Item = Annotated[str, AfterValidator(_item)]

# 칸 → 글자 수 한도. 스키마에는 maxLength 로 보이고, 검사는 model_validator 에서 한꺼번에 한다
# (필드 검사가 하나라도 실패하면 pydantic 이 model_validator 를 건너뛰어 다른 사유가 묻힌다)
_LIMIT = {'title': 20, 'brief': 40, 'situation': 30, 'itemName': 6, 'data': 15, 'counter': 15,
          'goals': 25, 'sentences': 25, 'filterDesc': 10, 'counterText': 40}


def _max(field, **kw):
    return Field(json_schema_extra={'maxLength': _LIMIT[field]}, **kw)


# ── 반례 ────────────────────────────────────────────────────

def _empty(v):
    return v in (0, '', [], {}, None)


def counter_problems(pid, data, filter_target, counter):
    """반례가 진짜 반례인가. 검사와 기본 틀 고르기가 같은 기준을 쓴다."""
    bad = []
    params = {'filterTarget': filter_target} if filter_target else {}
    texts = [','.join(d['items']) for d in data] + [counter['text']]
    for key, slots in SPEC[pid]['keys'].items():
        r1, r2, rc = [run(pid, slots, params, t) for t in texts]
        if r1['err'] or r2['err']:
            bad.append(('data', f"정답({key})으로 돌렸는데 앞 자료에서 에러: {(r1 if r1['err'] else r2)['msg']}"))
        elif rc['err']:
            bad.append(('counter', f"정답({key})으로 돌렸는데 반례에서 에러: {rc['msg']}"))
        elif rc['value'] == r1['value']:
            bad.append(('counter', f'정답({key}) 결과가 첫 자료와 같음 — 결과를 외운 학생이 안 깨진다'))
        elif counter['axis'] == 'empty' and not _empty(rc['value']):
            bad.append(('counter', 'axis=empty 인데 결과가 비어 있지 않음'))
    text, axis = counter['text'], counter['axis']
    pieces = [p for p in re.split(r'[,\s/·|]+', text) if p]
    if re.search(r'[.?!]', text) or any(len(p) > ITEM_MAX for p in pieces):
        bad.append(('counter', f"'{text[:20]}' — 반례도 자료다. 문장이 아니라 {ITEM_MAX}자 안의 항목들로"))
    # 반례는 앞 자료와 같은 종류여야 한다. 평가에서 "data1", "과일 개수" 같은 이름표가 반례로 왔다
    seen = {x.strip() for d in data for x in d['items']}
    ops = SPEC[pid]['ops']
    if 'toNumber' in ops and 'filter' not in ops:
        if any(not re.fullmatch(r'-?\d+', p) for p in pieces):
            bad.append(('counter', f"'{text[:20]}' — 숫자 유형의 반례는 숫자들로"))
    elif pieces and not ({p.strip() for p in pieces} & seen) and axis != 'empty':
        bad.append(('counter', f"'{text[:20]}' — 앞 자료에 나온 항목이 하나도 없음. 같은 상황의 다른 자료여야 한다"))
    if len(text) > _LIMIT['counterText']:
        bad.append(('counter', f"반례 원문 {len(text)}자 — {_LIMIT['counterText']}자 안으로"))
    if axis == 'sep' and not re.search(r'[ /·\-|\n]', text.strip()):
        bad.append(('counter', 'axis=sep 인데 쉼표 말고 다른 구분자가 없음'))
    if axis == 'invisible' and not any(p != p.strip() for p in text.split(',')):
        bad.append(('counter', 'axis=invisible 인데 앞뒤 공백 항목이 없음'))
    if axis == 'count' and len([p for p in text.split(',') if p]) == len(data[0]['items']):
        bad.append(('counter', 'axis=count 인데 항목 수가 첫 자료와 같음'))
    return bad


# ── 모델 ────────────────────────────────────────────────────

class DataSet(BaseModel):
    name: str = _max('data', description='자료 이름. 구체적으로 ("월요일 재료", "1반 신청"). "자료 1" 금지.')
    items: list[Item] = Field(min_length=3, max_length=5, description='항목 3~5개. 실제 한국어 단어. 항목 안에 쉼표 금지.')


class Counter(BaseModel):
    name: str = _max('counter', description='반례 자료 이름. 앞 자료와 같은 상황의 다른 날·다른 반 등.')
    text: str = Field(json_schema_extra={'maxLength': _LIMIT['counterText']}, description=(
        '반례 자료 원문 그대로 — 설명 문장이 아니라 앞 자료처럼 항목을 늘어놓은 것. '
        '앞 자료에 나온 항목을 하나 이상 다시 쓴다 (empty 제외). '
        '학생이 앞 두 자료로 세운 기준이 여기서 깨져야 한다. axis 에 맞게 만든다: '
        'count=항목 수가 다름 / sep=쉼표 대신 띄어쓰기 같은 다른 구분자 / empty=결과가 0이나 비어 있게 / '
        'invisible=항목 앞뒤에 공백.'))
    axis: Literal['count', 'sep', 'empty', 'invisible'] = Field(description=(
        '반례가 건드리는 축 하나. 개수 변화 / 구분자 변화 / 빈 결과 / 보이지 않는 차이.'))


class _Base(BaseModel):
    PID: ClassVar[str] = ''  # 유형별 모델이 덮어쓴다 (필드가 아니라 클래스 값)

    title: str = _max('title', description='중학생이 바로 알아듣는 상황 이름. 명사형 ("급식 알레르기 찾기"). 컴퓨터 용어 금지.')
    brief: str = _max('brief', description=(
        '학생에게 오는 업무 요청. 한 문장, 존댓말(~해 주세요). 배경은 situation 에. '
        '어떻게 하는지(나누기, 중복 빼기 등)는 쓰지 않는다 — 일부러 모호하게. '
        '무엇을 알아내야 하는지("몇 가지", "모두 얼마", "가장 큰")는 꼭 쓴다.'))
    situation: str = _max('situation', description='왜 이 일을 하는지. 한 문장, 존댓말로 "~요." 로 끝낸다 ("~해야 해요."). 덧붙임 금지.')
    itemName: str = _max('itemName', description='항목을 부르는 말 ("재료", "이름", "금액").')
    counter: Counter = Field(description='세 번째이자 마지막 자료. 반드시 반례.')

    @model_validator(mode='after')
    def _guard(self):
        """형식이 맞아도 내용이 틀릴 수 있다. 실제로 돌려보고 판정한다."""
        spec = SPEC[self.PID]
        bad = self._check_text() + self._check_data(spec)
        if not re.fullmatch(r'[가-힣 ]+', self.itemName.strip()):  # '같은 count는' 이 나왔다
            bad.append(('itemName', f"'{self.itemName}' — 항목을 부르는 말은 한글로"))
        if not any(f == 'data' for f, _ in bad):
            data = [d.model_dump() for d in self.data]
            bad += counter_problems(self.PID, data, getattr(self, 'filterTarget', None), self.counter.model_dump())
        key = next(iter(spec['keys']))
        if not re.search(KEY_TARGET[key], self.brief):
            bad.append(('brief', f"'{self.brief}' — 구할 값이 없음. '{KEY_TARGET[key].split('|')[0]}' 처럼 "
                                 '무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)'))
        if bad:
            raise ValidationError.from_exception_data(type(self).__name__, [
                InitErrorDetails(type=PydanticCustomError('guard', msg), loc=(field,), input=getattr(self, field, None))
                for field, msg in bad])
        return self

    def _check_text(self):
        """학생이 읽는 문장 전부. 필드 검사로 두지 않는 이유는 _LIMIT 주석과 같다."""
        said = {  # 칸 → (문장들, 학생에게 말하는 문장인가)
            'title': ([self.title], False),
            'itemName': ([self.itemName], False),
            'data': ([d.name for d in self.data], False),
            'counter': ([self.counter.name], False),
            'brief': ([self.brief], True),
            'situation': ([self.situation], True),
        }
        if getattr(self, 'filterDesc', None) is not None:
            said['filterDesc'] = ([self.filterDesc], False)
        bad = []
        for field, (texts, speaks) in said.items():
            for t in texts:
                n = len(t)
                if n > _LIMIT[field]:
                    bad.append((field, f"'{t}': {n}자 — {_LIMIT[field]}자 안으로"))
                    continue
                why = _text_problem(t) or (speaks and (_sentence_problem(t) or _plain_problem(t))) or (
                    field in ('brief', 'situation') and _polite_problem(t)) or (field == 'brief' and _brief_problem(t))
                if why:
                    bad.append((field, f"'{t}': {why}"))
        return bad

    def _check_data(self, spec):
        bad, ops = [], spec['ops']
        items = [x.strip() for d in self.data for x in d.items]  # 엔진처럼 앞뒤 공백을 지우고 본다
        num = lambda x: re.fullmatch(r'-?\d+', x.strip())  # noqa: E731
        ft = getattr(self, 'filterTarget', None) or []
        if 'filter' in ops and not set(ft) & set(items):
            bad.append(('data', '걸러낼 대상(filterTarget)이 자료에 하나도 없음'))
        if 'toNumber' in ops and any(not num(x) for x in items if x not in ft):
            bad.append(('data', '숫자 유형인데 정수가 아닌 항목이 있음' + (' (걸러낼 대상 말고)' if ft else '')))
        if 'transform' in ops and not any(x != x.strip() for d in self.data for x in d.items):
            bad.append(('data', '정리 유형인데 앞뒤 공백 항목이 없음 — 정리할 게 없다'))
        if 'groupCount' in ops and not any(len(set(d.items)) < len(d.items) for d in self.data):
            bad.append(('data', '묶어 세기 유형인데 같은 항목이 두 번 나오는 자료가 없음'))
        return bad


def _data_desc(ops):
    need = ['앞 자료 2개. 두 자료에서는 대충 세운 기준도 통할 수 있어야 반례가 의미 있다.']
    if 'filter' in ops and 'toNumber' in ops:
        need.append('숫자와 글자 항목을 섞는다. 글자 항목은 filterTarget 에 적는다.')
    elif 'toNumber' in ops:
        need.append('항목은 전부 정수.')
    elif 'filter' in ops:
        need.append('filterTarget 의 항목이 자료에 실제로 들어 있게.')
    if 'transform' in ops:
        need.append('일부 항목 앞뒤에 공백을 넣는다 (" 사과", "배 ").')
    if 'groupCount' in ops or 'unique' in ops:
        need.append('같은 항목이 두 번 이상 나오게.')
    return ' '.join(need)


def _draft(pid):
    spec = SPEC[pid]
    fields = {
        'data': (list[DataSet], Field(min_length=2, max_length=2, description=_data_desc(spec['ops']))),
    }
    if 'filter' in spec['ops']:
        fields['filterTarget'] = (list[str], Field(min_length=1, max_length=6, description=(
            '걸러낼 대상 1~3개. 자료 항목에 실제로 들어 있어야 한다.')))  # 보정이 글자 항목을 더할 수 있어 6
        fields['filterDesc'] = (str, _max('filterDesc', description='걸러낼 대상의 이름. 명사형 ("알레르기 목록").'))
    model = create_model('Draft_' + pid.replace('-', '_'), __base__=_Base, __doc__=DESC[pid], **fields)
    model.PID = pid
    return model


DRAFTS = {pid: _draft(pid) for pid in SPEC}

CHOICE = create_model('Choice', pipelineId=(Literal[tuple(SPEC)], Field(description=(
    '수업 내용에 가장 잘 이어지는 문제 유형 하나. ' + ' / '.join(f'{k}: {v}' for k, v in DESC.items())))))


def failed_fields(err: ValidationError):
    """검사 실패 → {칸 이름: [사유, ...]}. 칸별 폴백이 이걸 보고 칸을 갈아 끼운다."""
    out = {}
    for e in err.errors():
        field = str(e['loc'][0]) if e['loc'] else 'json'
        out.setdefault(field, []).append(e['msg'])
    return out


def validate(pid, draft):
    """→ 검사를 통과한 모델 또는 ValidationError"""
    return DRAFTS[pid].model_validate(draft)
