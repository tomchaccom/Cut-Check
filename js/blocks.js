/* Cut & Check — 논리 블록 카탈로그
 *
 * 설계 원칙: 블록은 "무엇을 하는가"만 말하고, "언제 써야 하는가"는 말하지 않는다.
 * 설명문(desc)에 사용 조건을 적는 순간 그게 곧 힌트가 되어 판단을 대신하게 된다.
 */
(function (CC) {
  'use strict';

  var BLOCKS = {
    input: {
      kind: 'data',
      label: '데이터 받기',
      icon: '↓',
      arg: 'text'
    },
    cut: {
      kind: 'action',
      label: '기준으로 자르기',
      icon: '✂',
      arg: 'split()'
    },
    trim: {
      kind: 'action',
      label: '앞뒤 공백 없애기',
      icon: '⌫',
      arg: 'strip()'
    },
    save: {
      kind: 'output',
      label: '목록으로 담기',
      icon: '▤',
      arg: 'items'
    },
    loop: {
      kind: 'control',
      label: '하나씩 꺼내기',
      icon: '↻',
      arg: 'for'
    },
    check: {
      kind: 'control',
      label: '조건 확인',
      icon: '◇',
      arg: 'if'
    },
    collect: {
      kind: 'output',
      label: '걸린 것만 모으기',
      icon: '⊕',
      arg: 'append()'
    },
    show: {
      kind: 'output',
      label: '화면에 보여주기',
      icon: '▷',
      arg: 'print()'
    }
  };

  CC.BLOCKS = BLOCKS;
  CC.block = function (id) { return BLOCKS[id]; };
})(window.CC = window.CC || {});
