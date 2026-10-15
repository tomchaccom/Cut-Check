"""Cut & Check — 생성 미션의 형식과 검사

이 파일 하나가 두 가지 일을 한다.

  1. 형식 — 모델의 JSON 스키마를 structured output 으로 LLM 에 넘긴다.
     Field(description=...) 이 곧 LLM 에게 주는 생성 지시다.
     LLM 은 이 모양 밖으로 답할 수 없다.
  2. 검사 — 모양이 맞아도 내용이 틀릴 수 있다. model_validator 가
     실제로 엔진을 돌려보고 판정한다. 예전에 고정 틀(switch)로 만들던 규칙이
     여기서 가드레일이 된다.

검사 실패는 칸 이름(loc)을 달고 나온다. 부르는 쪽은 failed_fields() 로
어느 칸이 틀렸는지 보고, 그 칸만 다시 요청하거나 기본 틀로 갈아 끼운다.

LLM 이 바꿀 수 없는 것 — 빈칸 이름, 빈칸 보기 값, 정답 key.
보기 값은 엔진(_pipeline.py)의 의미와 맞물려 있어서 LLM 이 바꾸면 실행이 깨진다.
그래서 SPEC 표는 코드가 소유하고, LLM 은 문장 표현만 쓴다.
"""
import re
from typing import Annotated, Literal, Union

from pydantic import AfterValidator, BaseModel, Field, ValidationError, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError

from _pipeline import run

SEP = ['쉼표', '공백', '줄바꿈']

# 유형별 고정 표. 예전 assembleMission 의 값을 그대로 옮겼다.
#   slots — 빈칸 이름 → 학생이 고르는 보기 (순서 그대로 화면에 나간다)
#   keys  — 정답 성공 조건 key → 그 성공을 내는 슬롯 조합 (검사 때 실제로 돌린다)
SPEC = {
    'split-unique-count': {
        'slots': {'sep': SEP, 'dedup': ['각각 남긴다', '하나만 남긴다'],
                  'output': ['남은 항목의 개수', '항상 숫자 3']},
        'keys': {
            'total': {'sep': '쉼표', 'dedup': '각각 남긴다', 'output': '남은 항목의 개수'},
            'unique': {'sep': '쉼표', 'dedup': '하나만 남긴다', 'output': '남은 항목의 개수'},
        },
    },
    'split-filter-count': {
        'slots': {'sep': SEP, 'cond': ['있는', '없는']},
        'keys': {'filtered_count': {'sep': '쉼표', 'cond': '있는'}},
    },
    'split-sort-join': {
        'slots': {'sep': SEP, 'dir': ['가나다순으로', '거꾸로'], 'joinSep': ['쉼표', '공백']},
        'keys': {'sorted': {'sep': '쉼표', 'dir': '가나다순으로', 'joinSep': '쉼표'}},
    },
    'split-num-sum': {
        'slots': {'sep': SEP},
        'keys': {'sum': {'sep': '쉼표'}},
    },
    'split-group': {
        'slots': {'sep': SEP},
        'keys': {'group': {'sep': '쉼표'}},
    },
    'split-transform-join': {
        'slots': {'sep': SEP, 'op': ['앞뒤 공백을 없앤다', '첫 글자만 남긴다'], 'joinSep': ['쉼표', '공백']},
        'keys': {'transformed': {'sep': '쉼표', 'op': '앞뒤 공백을 없앤다', 'joinSep': '쉼표'}},
    },
    'split-filter-num-sum': {
        'slots': {'sep': SEP, 'cond': ['빼고 숫자만 남긴다', '그대로 둔다']},
        'keys': {'filtered_sum': {'sep': '쉼표', 'cond': '빼고 숫자만 남긴다'}},
    },
}


# ── 학생이 읽는 문장 ─────────────────────────────────────────
# CLAUDE.md 화면 문구 규칙 + docs/llm.md 거부 규칙.

PRAISE = re.compile(r'(잘했|훌륭|대단|멋지|최고|완벽|참 잘)')
CODE = re.compile(r'(```|split\s*\(|\bfor\b\s+\w+\s+in|\.strip\s*\(|append\s*\(|print\s*\()')
FOREIGN = re.compile(r'[一-鿿㐀-䶿぀-ヿ]')
# 화면이 학생에게 말할 때는 존댓말. 반말은 asks.js 에만 허용된다.
BANMAL = re.compile(r'(봐|해|야|지|어|니|자|래|줘|거든|잖아|냐)[.!?~]*$')
YOU = re.compile(r'(^|\s)(너|네가|너의|너는|너도)(\s|$)')


def _text_problem(v):
    if PRAISE.search(v):
        return '칭찬 — 인정은 사람의 일이다'
    if CODE.search(v):
        return '코드 조각 — 베껴 쓸 답을 준다'
    if FOREIGN.search(v):
        return '한자·일본어 — 한국어만 쓴다'


def _sentence_problem(v):
    if BANMAL.search(v.strip()):
        return '반말 — 학생 화면은 존댓말로 쓴다'
    if YOU.search(v):
        return "'너' — 화면이 학생을 너라고 부르지 않는다"


# 한 번에 읽혀야 한다. 중1은 덧붙인 설명을 읽지 않고, 안 읽으면 없는 것과 같다.
ASIDE = re.compile(r'[()\[\]]|—|–| - |즉|예를 들어|참고로|왜냐하면|다시 말해|단,|※')


def _plain_problem(v):
    if len(re.findall(r'[.?!]+(\s|$)', v.strip())) > 1:
        return '두 문장 이상 — 한 칸에 한 문장만 쓴다'
    m = ASIDE.search(v)
    if m:
        return f"덧붙임 '{m.group(0)}' — 부연 설명 없이 한 번에 읽히게 쓴다"


def _brief_problem(v):
    m = re.search(r'서로\s*다른|전체\s*개수|중복', v)
    if m:
        return f"답 암시 '{m.group(0)}' — 업무 요청은 모호해야 분해가 학생 몫으로 남는다"


def _item(v: str) -> str:
    if ',' in v:
        raise ValueError('항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다')
    if re.fullmatch(r'항목\s*\d+|[A-Za-z]\d+|노래\s*\d+', v.strip()):
        raise ValueError('플레이스홀더 — 실제 한국어 단어를 쓴다')
    return v


Item = Annotated[str, AfterValidator(_item)]


# ── 모델 ────────────────────────────────────────────────────

class DataSet(BaseModel):
    name: str = Field(json_schema_extra={'maxLength': 15}, description=(
        '자료 이름. 구체적으로 ("월요일 재료", "1반 신청"). "자료 1", "데이터 1" 금지.'))
    items: list[Item] = Field(min_length=3, max_length=5, description=(
        '항목 3~5개. 실제 한국어 단어. 항목 안에 쉼표를 넣지 않는다.'))


class Counter(BaseModel):
    name: str = Field(json_schema_extra={'maxLength': 15}, description='반례 자료 이름. 앞 자료와 같은 상황의 다른 날·다른 반 등.')
    text: str = Field(json_schema_extra={'maxLength': 40}, description=(
        '반례 자료 원문 그대로. 학생이 앞 두 자료로 세운 기준이 여기서 깨져야 한다. '
        'axis 에 맞게 만든다: count=항목 수가 다름 / sep=쉼표 대신 다른 구분자 / '
        'empty=결과가 0이나 비어 있게 / invisible=항목 앞뒤에 공백.'))
    axis: Literal['count', 'sep', 'empty', 'invisible'] = Field(description=(
        '반례가 건드리는 축 하나. 개수 변화 / 구분자 변화 / 빈 결과 / 보이지 않는 차이.'))


class Option(BaseModel):
    v: str = Field(json_schema_extra={'maxLength': 25}, description=(
        '학생이 고르는 성공 조건. 25자 안의 한 구절. 결과로만 쓴다 — 방법(쉼표로 나눈다 등)을 쓰면 정답 공개다. '
        '"~나오면 성공" 처럼 짧게.'))
    trap: Literal['hardcode', 'luck'] | None = Field(description=(
        'hardcode = 첫 번째 자료의 실제 결과값을 그대로 성공으로 삼는 문장 (그 값을 문장에 넣는다). '
        'luck = 에러만 안 나면 성공. null = 진짜 성공 조건.'))
    key: str | None = Field(default=None, description='trap 이 null 일 때만. 유형별 정답 key 중 하나.')


class Step(BaseModel):
    template: str = Field(json_schema_extra={'maxLength': 25}, description=(
        '방법 문장 하나. 25자 안. 빈칸 자리에 {slot} 을 정확히 한 번 쓴다 (예: "재료 목록을 {sep} 기준으로 나눈다."). '
        '빈칸 보기에 있는 말을 빈칸 밖에 미리 쓰지 않는다 — 답이 새어나간다.'))


class _Base(BaseModel):
    title: str = Field(json_schema_extra={'maxLength': 20}, description=(
        '중학생이 바로 알아듣는 구체적 상황 이름. 명사형 ("급식 알레르기 찾기"). 컴퓨터 용어 금지.'))
    brief: str = Field(json_schema_extra={'maxLength': 40}, description=(
        '학생에게 오는 업무 요청. 40자 안의 한 문장, 존댓말(~해 주세요). 배경 설명은 situation 에 쓰고 여기엔 요청만. '
        '괄호·줄표·"예를 들어" 같은 덧붙임 금지. 일부러 모호하게 — '
        '어떻게 하는지(나누기, 중복 빼기 등)는 쓰지 않는다.'))
    situation: str = Field(json_schema_extra={'maxLength': 30}, description='왜 이 일을 하는지. 30자 안의 한 문장, 존댓말. 덧붙임 금지.')
    itemName: str = Field(json_schema_extra={'maxLength': 6}, description='항목을 부르는 말 ("재료", "이름", "금액").')
    data: list[DataSet] = Field(min_length=2, max_length=2, description=(
        '학생이 먼저 실행해 볼 자료 2개. 두 자료에서는 대충 세운 기준도 통할 수 있어야 반례가 의미 있다.'))
    counter: Counter = Field(description='세 번째이자 마지막 자료. 반드시 반례.')
    options: list[Option] = Field(min_length=3, max_length=4, description=(
        '성공 조건 보기. hardcode 함정 1개 이상, luck 함정 1개 이상, 진짜 성공 1개 이상을 섞는다. '
        '어느 게 맞는지 문장에 드러나지 않게 쓴다.'))
    filterTarget: list[str] | None = None
    filterDesc: str | None = None

    def params(self):
        return {'filterTarget': self.filterTarget} if self.filterTarget else {}

    def inputs(self):
        return [','.join(d.items) for d in self.data] + [self.counter.text]

    @model_validator(mode='after')
    def _guard(self):
        """형식이 맞아도 내용이 틀릴 수 있다. 실제로 돌려보고 판정한다."""
        spec = SPEC[self.pipelineId]
        bad = self._check_text()  # (칸 이름, 사유)
        bad += self._check_data(spec)
        if not any(f == 'data' for f, _ in bad):
            runs = {k: [run(self.pipelineId, s, self.params(), t) for t in self.inputs()]
                    for k, s in spec['keys'].items()}
            bad += self._check_counter(runs)
            bad += self._check_options(spec, runs)
        bad += self._check_steps(spec)
        if bad:
            raise ValidationError.from_exception_data(type(self).__name__, [
                InitErrorDetails(type=PydanticCustomError('guard', msg), loc=(field,), input=getattr(self, field))
                for field, msg in bad])
        return self

    def _check_text(self):
        """학생이 읽는 문장 전부. 필드 검사로 두지 않는 이유 —
        필드 하나가 실패하면 pydantic 이 model_validator 를 건너뛰어서
        반례·함정 사유가 묻힌다. 재요청은 한 번뿐이라 사유를 한꺼번에 줘야 한다."""
        said = {  # 칸 → (문장들, 말하는 문장인가)
            'title': ([self.title], False),
            'itemName': ([self.itemName], False),
            'data': ([d.name for d in self.data], False),
            'counter': ([self.counter.name], False),
            'brief': ([self.brief], True),
            'situation': ([self.situation], True),
            'options': ([o.v for o in self.options], True),
            'sentences': ([s.template for s in self.sentences], True),
        }
        bad = []
        for field, (texts, speaks) in said.items():
            for t in texts:
                if len(t) > _LIMIT[field]:
                    bad.append((field, f"'{t}': {len(t)}자 — {_LIMIT[field]}자 안으로"))
                    continue
                why = _text_problem(t) or (speaks and (_sentence_problem(t) or _plain_problem(t))) or (
                    field == 'brief' and _brief_problem(t))
                if why:
                    bad.append((field, f"'{t}': {why}"))
        return bad

    def _check_data(self, spec):
        bad = []
        items = [x for d in self.data for x in d.items]
        if 'cond' in spec['slots']:
            if not self.filterTarget or not self.filterDesc:
                bad.append(('filterTarget', '걸러내기 유형인데 filterTarget/filterDesc 가 없음'))
            elif not set(self.filterTarget) & set(items):
                bad.append(('data', 'filterTarget 이 자료에 하나도 없음 — 걸러낼 게 없다'))
        if self.pipelineId == 'split-num-sum' and any(not re.fullmatch(r'-?\d+', x.strip()) for x in items):
            bad.append(('data', '합계 유형인데 정수가 아닌 항목이 있음'))
        if self.pipelineId == 'split-transform-join' and not any(x != x.strip() for x in items):
            bad.append(('data', '정리 유형인데 앞뒤 공백 항목이 없음 — 정리할 게 없다'))
        if self.pipelineId == 'split-group' and not any(len(set(d.items)) < len(d.items) for d in self.data):
            bad.append(('data', '묶어 세기 유형인데 같은 항목이 두 번 나오는 자료가 없음'))
        return bad

    def _check_counter(self, runs):
        bad = []
        c = self.counter
        if len(c.text) > _limit(Counter, 'text'):
            bad.append(('counter', f"반례 원문 {len(c.text)}자 — {_limit(Counter, 'text')}자 안으로"))
        for key, (r1, r2, rc) in runs.items():
            if r1['err'] or r2['err']:
                bad.append(('data', f"정답({key})으로 돌렸는데 앞 자료에서 에러: {(r1 if r1['err'] else r2)['msg']}"))
            elif rc['err']:
                bad.append(('counter', f"정답({key})으로 돌렸는데 반례에서 에러: {rc['msg']}"))
            elif rc['value'] == r1['value']:
                bad.append(('counter', f"정답({key}) 결과가 첫 자료와 같음 — 결과를 외운 학생이 안 깨진다"))
            elif c.axis == 'empty' and rc['value'] not in (0, '', [], {}):
                bad.append(('counter', 'axis=empty 인데 결과가 비어 있지 않음'))
        if c.axis == 'sep' and not re.search(r'[ /·\-|\n]', c.text.strip()):
            bad.append(('counter', 'axis=sep 인데 쉼표 말고 다른 구분자가 없음'))
        if c.axis == 'invisible' and not any(p != p.strip() for p in c.text.split(',')):
            bad.append(('counter', 'axis=invisible 인데 앞뒤 공백 항목이 없음'))
        if c.axis == 'count' and len([p for p in c.text.split(',') if p]) == len(self.data[0].items):
            bad.append(('counter', 'axis=count 인데 항목 수가 첫 자료와 같음'))
        return bad

    def _check_options(self, spec, runs):
        bad = []
        traps = [o.trap for o in self.options]
        for need, name in (('hardcode', 'hardcode 함정'), ('luck', 'luck 함정'), (None, '진짜 성공 조건')):
            if need not in traps:
                bad.append(('options', name + '이 없음'))
        for o in self.options:
            if o.trap is None:
                if o.key not in spec['keys']:
                    bad.append(('options', f"정답 key '{o.key}' 는 이 유형에 없음 (허용: {', '.join(spec['keys'])})"))
                m = re.search(r'쉼표|공백|줄바꿈|띄어쓰기|나누|나눈|나눠|자르|자른|잘라|반복', o.v)
                if m:
                    bad.append(('options', f"정답 보기에 방법 '{m.group(0)}' — 통과 조건은 결과로만 쓴다"))
            elif o.key is not None:
                bad.append(('options', '함정 보기에 key 가 있음'))
        first = [r[0] for r in runs.values() if not r[0]['err']]
        for o in self.options:
            if o.trap == 'hardcode' and first and not any(_mentions(o.v, r['value']) for r in first):
                bad.append(('options', f"hardcode 함정에 첫 자료의 실제 결과({_show(first[0]['value'])})가 없음"))
        return bad

    def _check_steps(self, spec):
        bad = []
        slots = [s.slot for s in self.sentences]
        if sorted(slots) != sorted(spec['slots']):
            bad.append(('sentences', f"빈칸이 {slots} — 이 유형은 {list(spec['slots'])} 를 한 번씩"))
        every = [v for opts in spec['slots'].values() for v in opts]
        for s in self.sentences:
            holes = re.findall(r'\{(\w+)\}', s.template)
            if holes != [s.slot]:
                bad.append(('sentences', f"'{s.template}' 의 빈칸이 {{{s.slot}}} 하나가 아님"))
            leak = [v for v in every if v in s.template]
            if leak:
                bad.append(('sentences', f"'{s.template}' 빈칸 밖에 보기 '{leak[0]}' — 답이 미리 적혀 있다"))
        return bad


def _limit(model, field):
    return model.model_fields[field].json_schema_extra['maxLength']


def _tokens(value):
    if isinstance(value, dict):
        return list(value)
    if isinstance(value, str):
        return [t for t in re.split(r'[,\s→]+', value) if t]
    return [str(value)]


def _mentions(text, value):
    if isinstance(value, (int, float)):
        return re.search(rf'(?<!\d){re.escape(str(value))}(?!\d)', text) is not None
    return any(t in text for t in _tokens(value))


def _show(value):
    return ', '.join(_tokens(value))[:20]


# ── 유형별 모델 ──────────────────────────────────────────────
# 빈칸 이름을 Literal 로 묶어서, 스키마 단계에서 유형에 없는 빈칸이 못 나오게 한다.

def _steps(pid):
    names = tuple(SPEC[pid]['slots'])
    return type('Step_' + pid.replace('-', '_'), (Step,), {
        '__annotations__': {'slot': Literal[names]},
        'slot': Field(description='빈칸 이름. 이 유형에서 쓸 수 있는 것: ' + ', '.join(names)),
    })


def _sentences_field(pid):
    names = list(SPEC[pid]['slots'])
    return Field(min_length=len(names), max_length=len(names), description=(
        f'방법 문장 {len(names)}개. 빈칸 {", ".join(names)} 를 순서대로 한 번씩.'))


_FILTER_TARGET = Field(min_length=2, max_length=3, description='걸러낼 대상 2~3개. 자료 항목에 실제로 들어 있어야 한다.')
_FILTER_DESC = Field(json_schema_extra={'maxLength': 10}, description='걸러낼 대상의 이름. 명사형 ("알레르기 목록").')


class UniqueCount(_Base):
    """목록에서 항목 세기. 같은 항목이 겹칠 수 있다."""
    pipelineId: Literal['split-unique-count']
    sentences: list[_steps('split-unique-count')] = _sentences_field('split-unique-count')


class FilterCount(_Base):
    """목록에서 조건에 맞는 것만 골라 세기."""
    pipelineId: Literal['split-filter-count']
    sentences: list[_steps('split-filter-count')] = _sentences_field('split-filter-count')
    filterTarget: list[str] = _FILTER_TARGET
    filterDesc: str = _FILTER_DESC


class SortJoin(_Base):
    """목록을 순서대로 정렬하기."""
    pipelineId: Literal['split-sort-join']
    sentences: list[_steps('split-sort-join')] = _sentences_field('split-sort-join')


class NumSum(_Base):
    """숫자 목록의 합계. 항목은 전부 정수."""
    pipelineId: Literal['split-num-sum']
    sentences: list[_steps('split-num-sum')] = _sentences_field('split-num-sum')


class Group(_Base):
    """같은 것끼리 묶어 세기. 같은 항목이 두 번 이상 나와야 한다."""
    pipelineId: Literal['split-group']
    sentences: list[_steps('split-group')] = _sentences_field('split-group')


class TransformJoin(_Base):
    """각 항목을 정리하기. 일부 항목에 앞뒤 공백이 있어야 한다."""
    pipelineId: Literal['split-transform-join']
    sentences: list[_steps('split-transform-join')] = _sentences_field('split-transform-join')


class FilterNumSum(_Base):
    """숫자와 글자가 섞인 목록에서 숫자만 골라 합계."""
    pipelineId: Literal['split-filter-num-sum']
    sentences: list[_steps('split-filter-num-sum')] = _sentences_field('split-filter-num-sum')
    filterTarget: list[str] = _FILTER_TARGET
    filterDesc: str = _FILTER_DESC


# 칸 → 글자 수 한도. Field 의 maxLength 를 그대로 읽는다 (한도는 한 곳에만).
_LIMIT = {
    'title': _limit(_Base, 'title'), 'brief': _limit(_Base, 'brief'),
    'situation': _limit(_Base, 'situation'), 'itemName': _limit(_Base, 'itemName'),
    'data': _limit(DataSet, 'name'), 'counter': _limit(Counter, 'name'),
    'options': _limit(Option, 'v'), 'sentences': _limit(Step, 'template'),
}


class MissionDraft(BaseModel):
    """LLM 에 넘기는 최상위 모델. structured output 은 루트가 객체여야 해서 한 겹 감싼다."""
    mission: Union[UniqueCount, FilterCount, SortJoin, NumSum, Group, TransformJoin, FilterNumSum] = Field(
        discriminator='pipelineId', description=(
            '수업 내용에 맞는 문제 유형 하나를 골라 그 유형의 모양으로 채운다.'))


def failed_fields(err: ValidationError):
    """검사 실패 → {칸 이름: [사유, ...]}. 부분 폴백이 이걸 보고 칸을 갈아 끼운다.

    loc 는 ('mission', 유형, 칸, ...) 이다. 유형 태그 자체가 틀리면 칸은 'pipelineId'.
    """
    out = {}
    for e in err.errors():
        loc = e['loc']
        field = loc[2] if len(loc) > 2 else 'pipelineId'
        out.setdefault(str(field), []).append(e['msg'])
    return out
