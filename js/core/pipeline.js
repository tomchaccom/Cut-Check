/* Cut & Check — 조합형 파이프라인 엔진
 *
 * 12개 원자 연산을 타입 체인으로 조합한다.
 * 화이트리스트 13개만 허용 — 타입만 맞는 196개 중 93%를 차단한다.
 *
 * 이 파일은 core 층이다: localStorage, fetch, document를 모른다.
 */
(function (CC) {
  'use strict';

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

  var WHITELIST = [
    { id: 'split-count',                  ops: ['split','count'] },
    { id: 'split-unique-count',           ops: ['split','unique','count'] },
    { id: 'split-filter-count',           ops: ['split','filter','count'] },
    { id: 'split-filter-join',            ops: ['split','filter','join'] },
    { id: 'split-filter-unique-count',    ops: ['split','filter','unique','count'] },
    { id: 'split-sort-join',              ops: ['split','sort','join'] },
    { id: 'split-filter-sort-join',       ops: ['split','filter','sort','join'] },
    { id: 'split-transform-join',         ops: ['split','transform','join'] },
    { id: 'split-transform-unique-count', ops: ['split','transform','unique','count'] },
    { id: 'split-num-sum',                ops: ['split','toNumber','sum'] },
    { id: 'split-num-max',                ops: ['split','toNumber','max'] },
    { id: 'split-num-min',                ops: ['split','toNumber','min'] },
    { id: 'split-group',                  ops: ['split','groupCount'] },
    { id: 'split-filter-num-sum',          ops: ['split','filter','toNumber','sum'] }
  ];

  var SEP_MAP = { '쉼표': ',', '공백': /\s+/, '줄바꿈': '\n' };

  /* 연산별 한국어 라벨 — 학생 화면의 중간 결과 표시용 */
  var OP_LABEL = {
    split: '나누기', filter: '걸러내기', unique: '중복 제거',
    count: '세기', sort: '정렬', transform: '바꾸기',
    join: '합치기', toNumber: '숫자로', sum: '합계',
    max: '최대값', min: '최소값', groupCount: '묶어서 세기'
  };

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
        if (slots.op === '공백제거')       tfn = function (x) { return x.trim(); };
        else if (slots.op === '앞에붙이기') tfn = function (x) { return arg + x.trim(); };
        else if (slots.op === '뒤에붙이기') tfn = function (x) { return x.trim() + arg; };
        else if (slots.op === '첫글자만')   tfn = function (x) { return x.trim().charAt(0); };
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

  function run(id, slots, params, text) {
    var pipe = null;
    for (var w = 0; w < WHITELIST.length; w++) {
      if (WHITELIST[w].id === id) { pipe = WHITELIST[w]; break; }
    }
    if (!pipe) return { err: 1, msg: '알 수 없는 파이프라인: ' + id };

    var state = { t: 'text', v: text };
    var steps = [];

    for (var i = 0; i < pipe.ops.length; i++) {
      var op = pipe.ops[i];
      var def = OPS[op];
      if (def.in !== state.t)
        return { err: 1, msg: (i + 1) + '번 단계(' + (OP_LABEL[op] || op) + ')가 값을 못 받았어요.' };

      state = exec(op, state.v, slots, params || {});
      if (state.err) return { err: 1, msg: state.err };

      var stepVal = state.v;
      if (Array.isArray(stepVal)) stepVal = stepVal.slice();
      else if (stepVal && typeof stepVal === 'object') stepVal = JSON.parse(JSON.stringify(stepVal));
      steps.push({ i: i, op: op, label: OP_LABEL[op] || op, type: state.t, value: stepVal });
    }

    return { err: 0, type: state.t, value: state.v, steps: steps };
  }

  function outputType(pipeId) {
    for (var w = 0; w < WHITELIST.length; w++) {
      if (WHITELIST[w].id === pipeId) {
        var cur = 'text';
        var ops = WHITELIST[w].ops;
        for (var i = 0; i < ops.length; i++) cur = OPS[ops[i]].out;
        return cur;
      }
    }
    return null;
  }

  CC.pipeline = {
    run: run,
    outputType: outputType,
    WHITELIST: WHITELIST,
    OPS: OPS,
    OP_LABEL: OP_LABEL
  };

})(window.CC = window.CC || {});
