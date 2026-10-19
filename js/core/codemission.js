/* Cut & Check — 코드 꼴 미션 (core)
 *
 * 새 꼴 미션(kind:'code')은 자료를 파이썬 리터럴 그대로 둔다: data = [1500, 800].
 * 문자열로 둔 뒤 split 하게 하면 분해가 이미 끝나 버리고, 리스트·딕셔너리 같은 개념을 못 다룬다.
 * 옛 미션(kind 없음)은 지금처럼 따옴표 문자열로 돈다.
 * 여기는 순수 함수만 — 개념 표, 자료 줄, 생성된 미션의 코드 검사. 정답을 알려 주는 함수는 없다.
 */
(function (CC) {
  'use strict';

  var CONCEPTS = [
    { id: 'split', label: '문자열 나누기', needs: ['call:split'] },
    { id: 'index', label: '리스트·인덱스', needs: ['Subscript'] },
    { id: 'if', label: '조건문 if', needs: ['If', 'IfExp'] },
    { id: 'for', label: '반복문 for', needs: ['For', 'ListComp', 'SetComp', 'DictComp', 'GeneratorExp'] },
    { id: 'while', label: '반복문 while', needs: ['While'] },
    { id: 'dict', label: '딕셔너리', needs: ['Dict', 'DictComp', 'call:dict'] },
    { id: 'set', label: '집합', needs: ['Set', 'SetComp', 'call:set'] },
    { id: 'func', label: '함수', needs: ['FunctionDef', 'Lambda'] }
  ];

  function concept(id) {
    for (var i = 0; i < CONCEPTS.length; i++) if (CONCEPTS[i].id === id) return CONCEPTS[i];
    return null;
  }

  /* usesList 가 null(구문 에러·검사 못 함)이면 판단하지 않는다 */
  function uses(id, list) {
    if (list == null) return true;
    var c = concept(id);
    if (!c) return true;
    return c.needs.some(function (n) { return list.indexOf(n) >= 0; });
  }

  var USES_PY = [
    'import ast, json',
    'try:',
    '    _t = ast.parse(_src)',
    '    _s = set()',
    '    for _n in ast.walk(_t):',
    '        _s.add(type(_n).__name__)',
    '        if isinstance(_n, ast.Call):',
    '            _f = _n.func',
    '            if isinstance(_f, ast.Name):',
    '                _s.add("call:" + _f.id)',
    '            elif isinstance(_f, ast.Attribute):',
    '                _s.add("call:" + _f.attr)',
    '    print(json.dumps(sorted(_s)))',
    'except (SyntaxError, ValueError):',
    '    print("null")',
    ''
  ].join('\n');

  /* 공유 worker 의 전역(json·ast·임시 변수)을 더럽히지 않게 새 dict 안에서 돌린다 — 다음 학생 실행에 import 없이 json 이 되면 안 된다 */
  function usesCode(src) { return 'exec(' + JSON.stringify('_src = ' + JSON.stringify(src) + '\n' + USES_PY) + ', {})'; }

  /* 같은 코드인지만 알면 된다 — djb2 16진 */
  function sig(code) {
    var h = 5381, s = String(code == null ? '' : code);
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  var DATA_RE = /^data = .*$/m;

  function dataLine(m, v) {
    return 'data = ' + (m && m.kind === 'code' ? v : JSON.stringify(String(v)));
  }

  function solcheck(draft, runs, usesList) {
    var out = [];
    function add(code, msg) { out.push({ code: code, msg: msg }); }
    var inputs = draft.inputs || [];
    runs = runs || [];
    runs.forEach(function (r, i) {
      var nm = (inputs[i] && inputs[i].name) || ('자료 ' + (i + 1));
      if (r.error) {
        var to = CC.pyerr && r.error === CC.pyerr.TIMEOUT;
        add(to ? 'timeout' : 'error', nm + CC.particle(nm, '으로/로') + ' 돌리면 ' + (to ? '시간 안에 끝나지 않아요.' : '에러가 나요.'));
        return;
      }
      var o = String(r.output == null ? '' : r.output).trim();
      if (!o || /[\r\n]/.test(o) || o.length > 200) add('shape', nm + '의 결과가 한 줄 한 값이 아니에요.');
      if (/몇/.test(draft.brief || '') && !/^-?\d+(\.\d+)?$/.test(o)) add('count-not-number', nm + '의 결과가 숫자가 아니에요.');
    });
    if (!uses(draft.concept, usesList)) add('concept', '풀이 코드에 고른 개념이 쓰이지 않았어요.');
    if (runs.length >= 2 && !runs[0].error && !runs[runs.length - 1].error &&
        String(runs[0].output == null ? '' : runs[0].output).trim() === String(runs[runs.length - 1].output == null ? '' : runs[runs.length - 1].output).trim()) {
      add('counter-same', '반례의 결과가 첫 자료의 결과와 같아요.');
    }
    return out;
  }

  function hardcodeOption(name, value) {
    var s = String(value == null ? '' : value);
    return {
      v: s === '' ? name + '처럼 빈 결과가 나오면 성공' : name + '의 답과 같은 ' + s + CC.particle(s, '이/가') + ' 나오면 성공',
      trap: 'hardcode'
    };
  }

  CC.codemission = {
    CONCEPTS: CONCEPTS, concept: concept, uses: uses, USES_PY: USES_PY, usesCode: usesCode, sig: sig,
    DATA_RE: DATA_RE, dataLine: dataLine, solcheck: solcheck, hardcodeOption: hardcodeOption
  };
})(window.CC = window.CC || {});
