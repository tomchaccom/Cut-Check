/* Cut & Check — 설계 카드 (core)
 *
 * 연산 하나 = 카드 하나 ≈ 코드 한 줄. 미션의 pipelineId 로 정해진다 — 서버는 카드를 모른다.
 * 채점하지 않는다: 학생이 고른 카드 순서를 정답과 대조하는 함수는 여기 없고, 만들지 않는다.
 * 틀린 설계는 코드를 반례로 돌릴 때 학생이 스스로 발견한다.
 */
(function (CC) {
  'use strict';

  var CARD = {
    split:      { label: '나누기', detail: { name: '기준', options: ['쉼표', '공백', '줄바꿈'] } },
    filter:     { label: '골라내기', detail: { name: '{desc}에', options: ['있는 것만', '없는 것만'] } },
    filterNum:  { label: '글자 빼기' },
    toNumber:   { label: '숫자로 바꾸기' },
    transform:  { label: '항목마다 다듬기', detail: { name: '어떻게', options: ['앞뒤 공백 없애기', '첫 글자만 남기기'] } },
    unique:     { label: '겹친 것은 하나만' },
    sort:       { label: '순서대로 늘어놓기', detail: { name: '순서', options: ['가나다순', '거꾸로'] } },
    join:       { label: '다시 이어 붙이기', detail: { name: '이을 때', options: ['쉼표', '공백'] } },
    count:      { label: '개수 세기' },
    sum:        { label: '모두 더하기' },
    max:        { label: '가장 큰 값 찾기' },
    min:        { label: '가장 작은 값 찾기' },
    groupCount: { label: '항목마다 몇 번인지 세기' }
  };

  /* 헷갈리는 카드 — 그 유형에 없는 연산. 무작위면 교사와 학생이 다른 화면을 본다 */
  var DECOY = {
    'split-count': 'unique', 'split-unique-count': 'sort', 'split-filter-count': 'unique',
    'split-filter-join': 'sort', 'split-filter-unique-count': 'sort', 'split-sort-join': 'unique',
    'split-filter-sort-join': 'unique', 'split-transform-join': 'sort',
    'split-transform-unique-count': 'sort', 'split-num-sum': 'max', 'split-num-max': 'sum',
    'split-num-min': 'max', 'split-group': 'unique', 'split-filter-num-sum': 'max'
  };

  function opsOf(pid) {
    var w = CC.pipeline.WHITELIST.filter(function (x) { return x.id === pid; })[0];
    return w ? w.ops : null;
  }

  function make(op, all, m, decoy) {
    var c = CARD[op === 'filter' && all.indexOf('toNumber') >= 0 ? 'filterNum' : op];
    var d = c.detail ? {
      name: c.detail.name.replace('{desc}', (m && m.filterDesc) || '목록'),
      options: c.detail.options.slice()
    } : null;
    return { op: op, label: c.label, detail: d, decoy: !!decoy };
  }

  function forMission(m) {
    if (m && Array.isArray(m.cards)) {   /* 새 꼴 미션: 카드를 미션이 직접 가진다 */
      return m.cards.map(function (c, i) { return { op: 'c' + i, label: c.label, detail: null, decoy: !!c.decoy }; })
        .sort(function (a, b) { return a.label.localeCompare(b.label, 'ko'); });
    }
    var all = m && opsOf(m.pipelineId);
    if (!all) return [];
    var list = all.map(function (op) { return make(op, all, m, false); });
    list.push(make(DECOY[m.pipelineId], all, m, true));
    /* 가나다순 — 늘 같은 순서라 교사도 같은 화면을 보고, 처리 순서를 드러내지 않는다 */
    return list.sort(function (a, b) { return a.label.localeCompare(b.label, 'ko'); });
  }

  /* 골라내기의 고정 목록 — 숨은 설정이 아니라 학생이 보는 자료다 ("민지 시간 vs 준호 시간").
   * 글자 빼고 숫자 더하기는 목록이 곧 '글자 항목'이라 보여 주면 판단을 대신하므로 뺀다. */
  function fixedList(m) {
    if (m && m.kind === 'code') return null;
    var all = m && opsOf(m.pipelineId);
    var ft = m && m.pipelineParams && m.pipelineParams.filterTarget;
    if (!all || all.indexOf('filter') < 0 || all.indexOf('toNumber') >= 0 || !ft || !ft.length) return null;
    return { name: m.filterDesc || '목록', items: ft.slice() };
  }

  function text(c) {
    return c.label + (c.detail ? ' (' + c.detail + ')' : '');
  }

  function skeleton(picked) {
    return picked.map(function (c, i) { return '# ' + (i + 1) + '. ' + text(c) + '\n\n'; }).join('');
  }

  var ALL_LABELS = [];
  Object.keys(CARD).forEach(function (k) {
    ALL_LABELS.push(CARD[k].label);
    if (CARD[k].detail) ALL_LABELS = ALL_LABELS.concat(CARD[k].detail.options);
  });

  CC.cards = { forMission: forMission, fixedList: fixedList, text: text, skeleton: skeleton, ALL_LABELS: ALL_LABELS };
})(window.CC = window.CC || {});
