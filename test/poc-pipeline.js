/* test/poc-pipeline.js — 조합형 파이프라인 엔진 POC
 *
 * node test/poc-pipeline.js
 *
 * 검증 목표:
 *   1. 12개 원자 연산이 타입 체인으로 조합되는가
 *   2. 화이트리스트 13개가 중학교 파이썬 개념을 커버하는가
 *   3. 유효하지 않은 조합이 잡히는가
 *   4. 결정적 실행: 같은 입력 → 같은 출력
 */
'use strict';

var pass = 0, fail = 0;
function assert(ok, msg) {
  if (ok) pass++;
  else { fail++; console.log('  FAIL ' + msg); }
}
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* ── 1. 연산 타입 정의 ─────────────────────────────── */

var OPS = {
  split:      { in: 'text',    out: 'list'    },
  filter:     { in: 'list',    out: 'list'    },
  unique:     { in: 'list',    out: 'list'    },
  count:      { in: 'list',    out: 'number'  },
  sort:       { in: 'list',    out: 'list'    },
  transform:  { in: 'list',    out: 'list'    },
  join:       { in: 'list',    out: 'text'    },
  toNumber:   { in: 'list',    out: 'numlist' },
  sum:        { in: 'numlist', out: 'number'  },
  max:        { in: 'numlist', out: 'number'  },
  min:        { in: 'numlist', out: 'number'  },
  groupCount: { in: 'list',    out: 'pairs'   }
};

/* ── 2. 화이트리스트 ───────────────────────────────── */

var WHITELIST = [
  /* 나누고 세기 */
  { id: 'split-count',                  ops: ['split','count'],                          py: 'len(x.split(","))' },
  { id: 'split-unique-count',           ops: ['split','unique','count'],                 py: 'len(set(x.split(",")))' },
  /* 걸러내기 */
  { id: 'split-filter-count',           ops: ['split','filter','count'],                 py: 'len([i for i in … if cond])' },
  { id: 'split-filter-join',            ops: ['split','filter','join'],                  py: '",".join(i for i in … if cond)' },
  { id: 'split-filter-unique-count',    ops: ['split','filter','unique','count'],         py: 'len(set(i for i in … if cond))' },
  /* 정렬 */
  { id: 'split-sort-join',              ops: ['split','sort','join'],                    py: '",".join(sorted(…))' },
  { id: 'split-filter-sort-join',       ops: ['split','filter','sort','join'],            py: '",".join(sorted(i for i in … if cond))' },
  /* 바꾸기 */
  { id: 'split-transform-join',         ops: ['split','transform','join'],               py: '",".join(f(i) for i in …)' },
  { id: 'split-transform-unique-count', ops: ['split','transform','unique','count'],      py: 'len(set(f(i) for i in …))' },
  /* 숫자 계산 */
  { id: 'split-num-sum',                ops: ['split','toNumber','sum'],                 py: 'sum(int(i) for i in …)' },
  { id: 'split-num-max',                ops: ['split','toNumber','max'],                 py: 'max(int(i) for i in …)' },
  { id: 'split-num-min',                ops: ['split','toNumber','min'],                 py: 'min(int(i) for i in …)' },
  /* 묶어서 세기 */
  { id: 'split-group',                  ops: ['split','groupCount'],                     py: 'Counter(x.split(","))' }
];

/* ── 3. 연산 실행 ──────────────────────────────────── */

var SEP_MAP = { '쉼표': ',', '공백': /\s+/, '줄바꿈': '\n' };

function exec(op, val, slots, params) {
  switch (op) {

    case 'split': {
      var sep = SEP_MAP[slots.sep] || ',';
      return { t: 'list', v: val.split(sep).filter(Boolean) };
    }

    case 'filter': {
      var tgt = params.filterTarget;
      var cond = slots.cond;
      var fn;
      if (Array.isArray(tgt)) {
        fn = (cond === '있는' || cond === '포함')
          ? function (x) { return tgt.indexOf(x.trim()) !== -1; }
          : function (x) { return tgt.indexOf(x.trim()) === -1; };
      } else {
        fn = (cond === '포함' || cond === '있는')
          ? function (x) { return x.indexOf(tgt) !== -1; }
          : function (x) { return x.indexOf(tgt) === -1; };
      }
      return { t: 'list', v: val.filter(fn) };
    }

    case 'unique': {
      var seen = [];
      val.forEach(function (x) { if (seen.indexOf(x) === -1) seen.push(x); });
      return { t: 'list', v: seen };
    }

    case 'count':
      return { t: 'number', v: val.length };

    case 'sort': {
      var s = val.slice().sort(function (a, b) { return a.localeCompare(b, 'ko'); });
      if (slots.dir === '거꾸로') s.reverse();
      return { t: 'list', v: s };
    }

    case 'transform': {
      var arg = params.transformArg || '';
      var tfn;
      if (slots.op === '공백제거')    tfn = function (x) { return x.trim(); };
      else if (slots.op === '앞에붙이기') tfn = function (x) { return arg + x.trim(); };
      else if (slots.op === '뒤에붙이기') tfn = function (x) { return x.trim() + arg; };
      else if (slots.op === '첫글자만')  tfn = function (x) { return x.trim().charAt(0); };
      else tfn = function (x) { return x; };
      return { t: 'list', v: val.map(tfn) };
    }

    case 'join': {
      var jm = { '쉼표': ',', '공백': ' ', '줄바꿈': '\n', '화살표': ' → ' };
      return { t: 'text', v: val.join(jm[slots.joinSep] || ',') };
    }

    case 'toNumber': {
      var nums = val.map(function (x) { return Number(x.trim()); });
      if (nums.some(isNaN))
        return { err: '숫자로 바꿀 수 없는 항목이 있어요.' };
      return { t: 'numlist', v: nums };
    }

    case 'sum':
      return { t: 'number', v: val.reduce(function (a, b) { return a + b; }, 0) };
    case 'max':
      return { t: 'number', v: Math.max.apply(null, val) };
    case 'min':
      return { t: 'number', v: Math.min.apply(null, val) };

    case 'groupCount': {
      var g = {};
      val.forEach(function (x) { var k = x.trim(); g[k] = (g[k] || 0) + 1; });
      return { t: 'pairs', v: g };
    }

    default:
      return { err: '알 수 없는 연산: ' + op };
  }
}

/* ── 4. 파이프라인 실행 ────────────────────────────── */

function run(id, slots, params, text) {
  var pipe = WHITELIST.filter(function (p) { return p.id === id; })[0];
  if (!pipe) return { err: 1, msg: '알 수 없는 파이프라인: ' + id };

  var state = { t: 'text', v: text };
  var steps = [];

  for (var i = 0; i < pipe.ops.length; i++) {
    var op = pipe.ops[i];
    var def = OPS[op];
    if (def.in !== state.t)
      return { err: 1, msg: (i + 1) + '번 단계(' + op + ')가 ' + def.in + '을 기대했지만 ' + state.t + '이 왔어요.' };

    state = exec(op, state.v, slots, params || {});
    if (state.err) return { err: 1, msg: state.err };
    steps.push({ i: i, op: op, type: state.t, value: state.v });
  }

  return { err: 0, type: state.t, value: state.v, steps: steps };
}

/* ── 5. 조합 검증 ──────────────────────────────────── */

function validate(ops) {
  var key = ops.join('-');
  var inList = WHITELIST.some(function (p) { return p.ops.join('-') === key; });
  if (!inList) return { ok: false, reason: '화이트리스트에 없음: ' + key };

  var cur = 'text';
  for (var i = 0; i < ops.length; i++) {
    var d = OPS[ops[i]];
    if (!d) return { ok: false, reason: '알 수 없는 연산: ' + ops[i] };
    if (d.in !== cur)
      return { ok: false, reason: ops[i] + '이 ' + d.in + '을 기대, 실제 ' + cur };
    cur = d.out;
  }
  return { ok: true };
}

/* ── 6. 테스트 ─────────────────────────────────────── */

console.log('=== 파이프라인 실행 ===');

var r;

// 나누고 세기
r = run('split-count', { sep: '쉼표' }, {}, '사과,바나나,우유');
assert(r.value === 3, 'split-count: ' + r.value);

r = run('split-unique-count', { sep: '쉼표' }, {}, '사과,바나나,우유,사과,빵');
assert(r.value === 4, 'split-unique-count: ' + r.value);

// 걸러내기 (부분 문자열)
r = run('split-filter-count', { sep: '쉼표', cond: '포함' }, { filterTarget: '우' }, '우유,빵,우동,치즈');
assert(r.value === 2, 'split-filter-count(포함): ' + r.value);

// 걸러내기 (목록 멤버십)
r = run('split-filter-count', { sep: '쉼표', cond: '있는' },
  { filterTarget: ['우유', '달걀', '땅콩'] }, '밥,우유,김치,달걀,국');
assert(r.value === 2, 'split-filter-count(있는): ' + r.value);

// 걸러내기 → 합치기
r = run('split-filter-join', { sep: '쉼표', cond: '있는', joinSep: '쉼표' },
  { filterTarget: ['우유', '달걀'] }, '밥,우유,김치,달걀');
assert(r.value === '우유,달걀', 'split-filter-join: ' + r.value);

// 걸러내기 → 중복 제거 → 세기
r = run('split-filter-unique-count', { sep: '쉼표', cond: '포함' },
  { filterTarget: '과' }, '사과,바나나,과일,사과,과자');
assert(r.value === 3, 'split-filter-unique-count: ' + r.value);

// 정렬
r = run('split-sort-join', { sep: '쉼표', dir: '가나다순', joinSep: '쉼표' }, {}, '우유,바나나,사과');
assert(r.value === '바나나,사과,우유', 'split-sort-join: ' + r.value);

r = run('split-sort-join', { sep: '쉼표', dir: '거꾸로', joinSep: '쉼표' }, {}, '우유,바나나,사과');
assert(r.value === '우유,사과,바나나', 'split-sort-join(거꾸로): ' + r.value);

// 걸러내기 → 정렬 → 합치기
r = run('split-filter-sort-join', { sep: '쉼표', cond: '미포함', dir: '가나다순', joinSep: '쉼표' },
  { filterTarget: '우' }, '우유,바나나,사과,우동');
assert(r.value === '바나나,사과', 'split-filter-sort-join: ' + r.value);

// 바꾸기 (공백제거)
r = run('split-transform-join', { sep: '쉼표', op: '공백제거', joinSep: '쉼표' }, {},
  ' 사과 , 바나나 ,우유 ');
assert(r.value === '사과,바나나,우유', 'split-transform-join(trim): ' + r.value);

// 바꾸기 (접두사)
r = run('split-transform-join', { sep: '쉼표', op: '앞에붙이기', joinSep: '쉼표' },
  { transformArg: '★' }, '사과,바나나');
assert(r.value === '★사과,★바나나', 'split-transform-join(prefix): ' + r.value);

// 바꾸기 → 중복 제거 → 세기
r = run('split-transform-unique-count', { sep: '쉼표', op: '첫글자만' }, {},
  '사과,사탕,바나나,사이다');
assert(r.value === 2, 'split-transform-unique-count: ' + r.value);

// 숫자 합계
r = run('split-num-sum', { sep: '쉼표' }, {}, '10,20,30');
assert(r.value === 60, 'split-num-sum: ' + r.value);

r = run('split-num-max', { sep: '쉼표' }, {}, '10,50,30');
assert(r.value === 50, 'split-num-max: ' + r.value);

r = run('split-num-min', { sep: '쉼표' }, {}, '10,50,30');
assert(r.value === 10, 'split-num-min: ' + r.value);

// 묶어서 세기
r = run('split-group', { sep: '쉼표' }, {}, '사과,바나나,사과,우유,바나나,사과');
assert(r.value['사과'] === 3 && r.value['바나나'] === 2 && r.value['우유'] === 1,
  'split-group: ' + JSON.stringify(r.value));

console.log('\n=== 에러 처리 ===');

r = run('split-num-sum', { sep: '쉼표' }, {}, '10,abc,30');
assert(r.err === 1, 'toNumber 에러: non-numeric');

r = run('없는거', {}, {}, '');
assert(r.err === 1, '없는 파이프라인 거부');

// 빈 결과 (반례에서 중요)
r = run('split-filter-count', { sep: '쉼표', cond: '있는' },
  { filterTarget: ['없는것'] }, '밥,국,김치');
assert(r.value === 0, 'filter 빈 결과: ' + r.value);

console.log('\n=== 결정적 실행 ===');

var r1 = run('split-filter-sort-join', { sep: '쉼표', cond: '미포함', dir: '가나다순', joinSep: '쉼표' },
  { filterTarget: '우' }, '우유,바나나,사과,우동');
var r2 = run('split-filter-sort-join', { sep: '쉼표', cond: '미포함', dir: '가나다순', joinSep: '쉼표' },
  { filterTarget: '우' }, '우유,바나나,사과,우동');
assert(deepEq(r1, r2), '같은 입력 → 같은 출력');

console.log('\n=== 조합 검증 ===');

// 유효
assert(validate(['split', 'count']).ok, 'valid: split-count');
assert(validate(['split', 'filter', 'count']).ok, 'valid: split-filter-count');
assert(validate(['split', 'toNumber', 'sum']).ok, 'valid: split-toNumber-sum');

// 타입 불일치
assert(!validate(['filter', 'count']).ok, 'reject: filter가 text를 받음');
assert(!validate(['split', 'sum']).ok, 'reject: sum이 list를 받음');
assert(!validate(['split', 'count', 'filter']).ok, 'reject: filter가 number를 받음');
assert(!validate(['toNumber', 'sum']).ok, 'reject: toNumber가 text를 받음');

// 화이트리스트에 없음 (타입은 맞지만 교육적으로 불필요)
assert(!validate(['split', 'sort', 'count']).ok, 'reject: split-sort-count (정렬 후 세기는 의미 없음)');
assert(!validate(['split', 'unique', 'sort', 'join']).ok, 'reject: split-unique-sort-join');
assert(!validate(['split', 'transform', 'sort', 'join']).ok, 'reject: split-transform-sort-join');

console.log('\n=== 개념 커버리지 ===');

var concepts = {
  'split()': false, 'len()': false, 'set()': false,
  'if / in': false, 'join()': false, 'sorted()': false,
  'str methods': false, 'int()': false, 'sum()': false,
  'max() min()': false, 'dict Counter': false
};
WHITELIST.forEach(function (p) {
  var s = p.py;
  if (s.indexOf('split') !== -1)   concepts['split()'] = true;
  if (s.indexOf('len') !== -1)     concepts['len()'] = true;
  if (s.indexOf('set') !== -1)     concepts['set()'] = true;
  if (s.indexOf('if') !== -1)      concepts['if / in'] = true;
  if (s.indexOf('join') !== -1)    concepts['join()'] = true;
  if (s.indexOf('sorted') !== -1)  concepts['sorted()'] = true;
  if (s.indexOf('f(i)') !== -1)    concepts['str methods'] = true;
  if (s.indexOf('int') !== -1)     concepts['int()'] = true;
  if (s.indexOf('sum') !== -1)     concepts['sum()'] = true;
  if (s.indexOf('max') !== -1)     concepts['max() min()'] = true;
  if (s.indexOf('Counter') !== -1) concepts['dict Counter'] = true;
});

var allCovered = true;
Object.keys(concepts).forEach(function (k) {
  var ok = concepts[k];
  console.log('  ' + (ok ? 'O' : 'X') + '  ' + k);
  if (!ok) allCovered = false;
});
assert(allCovered, 'all concepts covered');

console.log('\n=== 수업 → 파이프라인 매핑 ===');

var LESSON_MAP = {
  '리스트 기초':       ['split-count', 'split-unique-count'],
  '조건문 if':        ['split-filter-count', 'split-filter-join', 'split-filter-unique-count'],
  '반복문 for':       ['split-filter-count', 'split-transform-join'],
  '문자열 메서드':     ['split-transform-join', 'split-transform-unique-count'],
  '정렬 sorted':      ['split-sort-join', 'split-filter-sort-join'],
  '딕셔너리 dict':    ['split-group'],
  '숫자 연산 int sum': ['split-num-sum', 'split-num-max', 'split-num-min'],
  '집합 set':         ['split-unique-count', 'split-filter-unique-count']
};

Object.keys(LESSON_MAP).forEach(function (lesson) {
  console.log('  ' + lesson + '  ->  ' + LESSON_MAP[lesson].join(', '));
});

/* ── 결론 ── */

console.log('\n=== 화이트리스트 vs 타입만 ===');
var opNames = Object.keys(OPS);
var typeValidCount = 0;
// 2~4단계 조합 중 타입만 맞는 것 카운트
function chainValid(ops) {
  var cur = 'text';
  for (var i = 0; i < ops.length; i++) {
    if (OPS[ops[i]].in !== cur) return false;
    cur = OPS[ops[i]].out;
  }
  return true;
}
opNames.forEach(function (a) {
  opNames.forEach(function (b) {
    if (chainValid([a, b])) typeValidCount++;
  });
});
opNames.forEach(function (a) {
  opNames.forEach(function (b) {
    opNames.forEach(function (c) {
      if (chainValid([a, b, c])) typeValidCount++;
    });
  });
});
opNames.forEach(function (a) {
  opNames.forEach(function (b) {
    opNames.forEach(function (c) {
      opNames.forEach(function (d) {
        if (chainValid([a, b, c, d])) typeValidCount++;
      });
    });
  });
});
console.log('  타입만 맞는 2~4단계 조합: ' + typeValidCount + '개');
console.log('  화이트리스트:              ' + WHITELIST.length + '개');
console.log('  차단율:                    ' + Math.round((1 - WHITELIST.length / typeValidCount) * 100) + '%');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
