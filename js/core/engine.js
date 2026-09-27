/* Cut & Check — 실행 엔진
 *
 * 설계 원칙 (중요):
 *   1. 엔진은 "어디서 멈췄는지"만 말한다. "무엇으로 고쳐라"는 절대 말하지 않는다.
 *   2. 정답 블록 순서와 대조하지 않는다. 대조하는 순간 학생은 우리 답을 추측하기 시작한다.
 *   3. 틀린 순서도 끝까지 실행을 시도한다. 막으면 학생은 다시 선생님을 부른다.
 *
 * 에러 메시지 작성 규칙:
 *   "N번 블록이 <무엇을> 못 받았어요"  (O) — 위치와 사실
 *   "앞에 자르기 블록을 놓으세요"        (X) — 해법 제시 = 판단 대행
 */
(function (CC) {
  'use strict';

  /* 값의 상태
   *   type: 'none' | 'text' | 'list'
   *   value: 실제 값
   *   opened: 목록을 하나씩 꺼내는 중인가 (loop 통과 여부)
   *   tested: 조건 확인을 통과했는가 (check 통과 여부)
   */
  function run(blocks, cfg, text) {
    var st = { type: 'none', value: null, opened: false, tested: false, saved: false, shown: false };
    var n = function (i) { return (i + 1) + '번 블록'; };
    /* 중간 상태를 남긴다.
     * 마지막 값만 보여주면 "세 장 다 빈 목록" 같은, 단서 없는 실패가 생긴다.
     * 학생이 자기 기준으로 자른 직후의 조각을 볼 수 있어야 증거가 된다. */
    var trace = [];
    var snap = function (i, id) {
      trace.push({ i: i, id: id, type: st.type, value: Array.isArray(st.value) ? st.value.slice() : st.value });
    };

    for (var i = 0; i < blocks.length; i++) {
      var id = blocks[i];

      if (id === 'input') {
        st.type = 'text';
        st.value = text;
        st.opened = false;
        st.tested = false;

      } else if (id === 'cut') {
        if (st.type === 'none') return err(i, n(i) + '이 자를 데이터를 아직 못 받았어요.');
        if (st.type !== 'text') return err(i, n(i) + '은 한 덩어리 글자를 기다리는데, 앞에서 다른 게 넘어왔어요.');
        st.value = String(st.value).split(cfg.sep);
        st.type = 'list';

      } else if (id === 'trim') {
        if (st.type !== 'list') return err(i, n(i) + '은 목록을 기다리는데, 지금 넘어온 건 목록이 아니에요.');
        st.value = st.value.map(function (s) { return String(s).trim(); });

      } else if (id === 'save') {
        if (st.type === 'none') return err(i, n(i) + '이 담을 값을 못 받았어요.');
        st.saved = true;

      } else if (id === 'loop') {
        if (st.type !== 'list') return err(i, n(i) + '은 하나씩 꺼낼 목록이 필요한데, 지금 넘어온 건 목록이 아니에요.');
        st.opened = true;
        st.tested = false;

      } else if (id === 'check') {
        if (!st.opened) return err(i, n(i) + '은 하나를 꺼내서 확인하는 블록인데, 아직 아무것도 꺼내지 않았어요.');
        st.tested = true;

      } else if (id === 'collect') {
        if (!st.tested) return err(i, n(i) + '이 모을 기준을 못 찾았어요. 무엇이 걸렸는지 판단한 적이 없어요.');
        /* 일부러 공백을 봐주지 않는다.
         * "사과, 우유, 빵" 을 쉼표로만 자르면 " 우유" 가 되어 걸러지지 않는다.
         * 여기서 봐주면 학생은 앞뒤 공백이라는 개념을 평생 만나지 못한다.
         * 결과가 빈 목록으로 나오는 것 자체가 증거이고, 해법은 알려주지 않는다. */
        var targets = cfg.targets || [];
        st.value = st.value.filter(function (v) { return targets.indexOf(String(v)) !== -1; });
        st.opened = false;
        st.tested = false;

      } else if (id === 'unique') {
        if (st.type !== 'list') return err(i, n(i) + '은 목록을 기다리는데, 지금 넘어온 건 목록이 아니에요.');
        var seen = [];
        st.value.forEach(function (v) { if (seen.indexOf(v) === -1) seen.push(v); });
        st.value = seen;

      } else if (id === 'count') {
        if (st.type !== 'list') return err(i, n(i) + '은 셀 목록이 필요한데, 지금 넘어온 건 목록이 아니에요.');
        st.value = st.value.length;
        st.type = 'number';
        st.opened = false;
        st.tested = false;

      } else if (id === 'show') {
        if (st.type === 'none') return err(i, n(i) + '이 보여줄 값을 못 받았어요.');
        st.shown = true;
      }
      snap(i, id);
    }

    if (st.type === 'none') {
      /* 원인을 짚어주면 안 된다 — '블록이 없어서' 는 학생이 찾아야 할 결론이다.
       * 상태만 말한다. (js/llmguard.js 의 DIAGNOSE 규칙이 이걸 잡아냈다) */
      return err(-1, '아직 어떤 블록에도 값이 흐르지 않았어요.');
    }
    return { err: 0, type: st.type, value: st.value, saved: st.saved, shown: st.shown, trace: trace };
  }

  function err(at, msg) { return { err: 1, at: at, msg: msg }; }

  /* 블록 → Python 코드.
   * X-ray 화면에서 블록과 코드를 같은 색으로 잇기 위해 줄 단위로 반환한다.
   * 학생이 만든 그대로를 번역한다. 틀린 순서면 틀린 코드가 나온다 — 그게 정직한 거울이다.
   */
  function toPython(blocks, cfg) {
    var lines = [];
    var depth = 0;
    var listVar = cfg.listVar || 'items';
    var textVar = cfg.textVar || 'data';
    var pad = function () { return new Array(depth + 1).join('    '); };

    /* 준비 줄: 학생이 놓지 않았지만 파이썬이 필요로 하는 것.
     * 블록으로 만들지 않은 이유 — 이건 판단이 아니라 문법이다.
     * 판단이 아닌 것까지 블록으로 만들면 블록 수만 늘고 사고는 늘지 않는다. */
    if (blocks.indexOf('check') !== -1 && cfg.targetList) {
      lines.push({
        i: -1, kind: 'setup',
        code: (cfg.targetVar || 'check_list') + ' = ["' + cfg.targetList.join('", "') + '"]'
      });
    }
    if (blocks.indexOf('collect') !== -1) {
      lines.push({ i: -1, kind: 'setup', code: 'found = []' });
    }

    blocks.forEach(function (id, i) {
      var kind = (CC.BLOCKS[id] || {}).kind || 'setup';
      var push = function (code) { lines.push({ i: i, id: id, kind: kind, code: pad() + code }); };

      if (id === 'input') {
        push(textVar + ' = "' + (cfg.sample || '') + '"');
      } else if (id === 'cut') {
        push(listVar + ' = ' + textVar + '.split("' + (cfg.sep === ' ' ? ' ' : cfg.sep) + '")');
      } else if (id === 'trim') {
        push(listVar + ' = [x.strip() for x in ' + listVar + ']');
      } else if (id === 'save') {
        push('# ' + listVar + ' 에 담겨 있어요');
      } else if (id === 'loop') {
        push('for one in ' + listVar + ':');
        depth++;
      } else if (id === 'check') {
        push('if one in ' + (cfg.targetVar || 'check_list') + ':');
        depth++;
      } else if (id === 'collect') {
        push('found.append(one)');
        depth = Math.max(0, depth - 2);
      } else if (id === 'unique') {
        push(listVar + ' = list(dict.fromkeys(' + listVar + '))');
      } else if (id === 'count') {
        push('how_many = len(' + listVar + ')');
      } else if (id === 'show') {
        push('print(' + (blocks.indexOf('count') !== -1 ? 'how_many'
          : blocks.indexOf('collect') !== -1 ? 'found' : listVar) + ')');
      }
    });

    return lines;
  }

  /* ── 문장형 실행 엔진 ──────────────────────────────
   *
   * 문장 입력 미션에서 학생의 슬롯 선택(slots)과 입력 텍스트로
   * 결정적인 결과를 반환한다. 같은 입력·같은 슬롯은 항상 같은 출력.
   *
   * slots 형태 (미션 01 기준):
   *   { sep: '쉼표' | '공백' | '줄바꿈',
   *     dedup: '각각 남긴다' | '하나만 남긴다',
   *     output: '남은 항목의 개수' | '항상 숫자 3' }
   *
   * 반환:
   *   성공 → { err: 0, type: 'number', value: <숫자>, steps: [...] }
   *   검증 실패 → { err: 1, msg: '...' }
   */
  function runSentence(slots, text) {
    /* 필수 슬롯 검증 — 빈 슬롯은 실행하지 않고 구체적으로 안내한다 */
    if (!slots) return err(-1, '방법이 아직 정해지지 않았어요.');
    if (!slots.sep) return err(-1, '나누는 기준을 선택해 주세요.');
    if (!slots.dedup) return err(-1, '같은 이름 처리 방법을 선택해 주세요.');
    if (!slots.output) return err(-1, '출력할 값을 선택해 주세요.');

    var steps = [];
    var SEP_MAP = { '쉼표': ',', '공백': ' ', '줄바꿈': '\n' };
    var sep = SEP_MAP[slots.sep];
    if (sep === undefined) return err(-1, '알 수 없는 나누기 기준이에요: ' + slots.sep);

    /* 1단계: 나누기 */
    var items = String(text).split(sep);
    steps.push({ step: '나누기', sep: slots.sep, result: items.slice() });

    /* 2단계: 중복 처리 */
    if (slots.dedup === '하나만 남긴다') {
      var seen = [];
      items.forEach(function (v) { if (seen.indexOf(v) === -1) seen.push(v); });
      items = seen;
    }
    /* '각각 남긴다' → 그대로 */
    steps.push({ step: '중복 처리', dedup: slots.dedup, result: items.slice() });

    /* 3단계: 출력 계산 */
    var value;
    if (slots.output === '항상 숫자 3') {
      value = 3;
    } else if (slots.output === '남은 항목의 개수') {
      value = items.length;
    } else {
      return err(-1, '알 수 없는 출력 방법이에요: ' + slots.output);
    }
    steps.push({ step: '출력', output: slots.output, result: value });

    return { err: 0, type: 'number', value: value, steps: steps };
  }

  CC.engine = { run: run, toPython: toPython, runSentence: runSentence };
})(window.CC = window.CC || {});
