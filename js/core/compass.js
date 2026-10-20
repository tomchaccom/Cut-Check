/* Cut & Check — 나침반 (순수 함수)
 *
 * 선생님 화면과 학생 화면이 같은 그림을 쓴다. 단계(0~3)는 선생님 화면에서만 넘어온다 —
 * 학생 쪽은 levels 를 null 로 불러 바늘만 그린다. 색은 회색·검정뿐 (브랜드 색 미정).
 */
(function (CC) {
  'use strict';

  var DIRS = { N: '북쪽 · 이해', E: '동쪽 · 설계', S: '남쪽 · 구현', W: '서쪽 · 검증' };
  var NONE = '아직 방향이 뚜렷하지 않아요';
  var C = 60, R = 44;   /* 중심 · 3단계 반지름 */

  /* 바늘이 속한 반열린 부채꼴 — N [315,45) E [45,135) S [135,225) W [225,315). 서버(api/_compass.py)와 같다 */
  function dirOf(deg) {
    if (deg == null || isNaN(deg)) return null;
    var d = ((Number(deg) % 360) + 360) % 360;
    return d >= 315 || d < 45 ? 'N' : d < 135 ? 'E' : d < 225 ? 'S' : 'W';
  }

  function lv(levels, k) {
    var n = Math.round(Number(levels && levels[k]));
    return n >= 0 && n <= 3 ? n : 0;
  }

  function svg(levels, deg) {
    var hasNeedle = deg != null && !isNaN(deg);
    var name = hasNeedle ? DIRS[dirOf(deg)] : NONE;
    var o = '<svg class="compass-svg" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="' + name + '">';
    [1, 2, 3].forEach(function (n) {
      o += '<circle cx="60" cy="60" r="' + (R * n / 3) + '" fill="none" stroke="#bbb" stroke-width="0.8"/>';
    });
    o += '<path d="M60 12V108M12 60H108" stroke="#bbb" stroke-width="0.8"/>';
    if (levels) {
      var r = function (k) { return R * lv(levels, k) / 3; };
      o += '<polygon class="compass-poly" points="' + [C + ',' + (C - r('N')), (C + r('E')) + ',' + C, C + ',' + (C + r('S')), (C - r('W')) + ',' + C].join(' ') +
        '" fill="#888" fill-opacity="0.25" stroke="#555" stroke-width="1.2"/>';
    }
    if (hasNeedle) {
      o += '<g class="compass-needle" transform="rotate(' + Number(deg) + ' 60 60)">' +
        '<polygon points="60,10 55,60 65,60" fill="#111"/><polygon points="55,60 65,60 60,84" fill="#999"/></g>';
    }
    o += '<circle cx="60" cy="60" r="2.5" fill="#111"/>';
    [['N', '북', 60, 9], ['E', '동', 114, 63], ['S', '남', 60, 119], ['W', '서', 6, 63]].forEach(function (t) {
      o += '<text x="' + t[2] + '" y="' + t[3] + '" font-size="9" text-anchor="middle" fill="#666">' + t[1] + '</text>';
    });
    return o + '</svg>';
  }

  CC.compass = { DIRS: DIRS, NONE: NONE, dirOf: dirOf, svg: svg };
})(window.CC = window.CC || {});
