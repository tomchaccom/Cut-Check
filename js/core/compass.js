/* Cut & Check — 나침반 (순수 함수)
 *
 * 선생님 화면과 학생 화면이 같은 그림을 쓴다. 2차: 바늘 하나(각도 + 길이)만 그린다 —
 * 단계 다각형은 없다. 색은 회색·검정뿐, 방향은 모양(▲ ◧ ○ ◇)으로 구분한다.
 */
(function (CC) {
  'use strict';

  var DIRS = { N: '북쪽 · 이해', E: '동쪽 · 설계', S: '남쪽 · 구현', W: '서쪽 · 검증' };
  var NAME = { N: '이해', E: '설계', S: '구현', W: '검증' };      /* 알림 문장 · 학생 문장이 방향을 부르는 낱말 */
  var SHAPE = { N: '▲', E: '◧', S: '○', W: '◇' };                   /* 흑백에서도 구분되게 색 대신 모양 */
  var DIR_WORD = { N: '북', E: '동', S: '남', W: '서' };
  /* 서버 api/_compass.py 의 MIN_LEN(0.25) 과 CANCEL(0.5) 에 묶여 있다: 지워지지 않은 바늘은 길이가 0.358 이상이라
   * 이 값 이하는 선생님이 고른 방향(길이 MIN_LEN)뿐이다. 서버 길이식을 바꾸면 같이 본다. */
  var MIN_SHORT = 0.3;                                               /* 이 이하면 한쪽으로 기울었다고 말하지 않는다 */
  var C = 60;

  /* 바늘이 속한 반열린 부채꼴 — N [315,45) E [45,135) S [135,225) W [225,315). 서버(api/_compass.py)와 같다 */
  function dirOf(deg) {
    if (deg == null || isNaN(deg)) return null;
    var d = ((Number(deg) % 360) + 360) % 360;
    return d >= 315 || d < 45 ? 'N' : d < 135 ? 'E' : d < 225 ? 'S' : 'W';
  }

  /* 학생 한 줄 — "북쪽으로 가고 있어요". 바늘이 짧으면 even() 이 참 — 화면이 "고르게 가고 있어요" 를 덧붙인다 */
  function line(dir) { return DIR_WORD[dir] ? DIR_WORD[dir] + '쪽으로 가고 있어요' : ''; }
  function even(len) { return len != null && Number(len) <= MIN_SHORT; }

  /* deg: 바늘 각도, len: 서버가 준 반지름 비율(0.25~0.9). 없으면 바늘 없이 판만 그린다 */
  function svg(deg, len) {
    var hasNeedle = deg != null && !isNaN(deg);
    var name = hasNeedle ? DIRS[dirOf(deg)] : '방향 없음';
    var f = len == null || isNaN(len) ? 0.9 : Math.max(0.25, Math.min(0.9, Number(len)));
    var o = '<svg class="compass-svg" viewBox="-12 -12 144 144" width="144" height="144" role="img" aria-label="' + name + '">';
    [1, 2, 3].forEach(function (n) {
      o += '<circle cx="60" cy="60" r="' + (44 * n / 3) + '" fill="none" stroke="#bbb" stroke-width="0.8"/>';
    });
    o += '<path d="M60 12V108M12 60H108" stroke="#bbb" stroke-width="0.8"/>';
    if (hasNeedle) {
      var tip = C - 50 * f / 0.9;
      o += '<g class="compass-needle" transform="rotate(' + Number(deg) + ' 60 60)">' +
        '<polygon points="60,' + tip + ' 55,60 65,60" fill="currentColor"/><polygon points="55,60 65,60 60,' + (C + 24) + '" fill="currentColor" fill-opacity="0.4"/></g>';
    }
    o += '<circle cx="60" cy="60" r="2.5" fill="currentColor"/>';
    [['N', 60, 2], ['E', 124, 64], ['S', 60, 128], ['W', -4, 64]].forEach(function (t) {
      o += '<text x="' + t[1] + '" y="' + t[2] + '" font-size="12" text-anchor="middle" fill="currentColor" fill-opacity="0.75" aria-hidden="true">' + SHAPE[t[0]] + DIR_WORD[t[0]] + '</text>';
    });
    return o + '</svg>';
  }

  CC.compass = { DIRS: DIRS, NAME: NAME, SHAPE: SHAPE, MIN_SHORT: MIN_SHORT, dirOf: dirOf, line: line, even: even, svg: svg };
})(window.CC = window.CC || {});
