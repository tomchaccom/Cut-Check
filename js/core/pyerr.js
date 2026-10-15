/* Cut & Check — 파이썬 에러를 학생 화면용 한 줄로
 *
 * 에러는 위치와 사실만 (CLAUDE.md 화면 문구 규칙). 몇 번째 줄인지와 파이썬이 한 말만 남기고,
 * 원인은 해석하지 않는다 — 그건 학생이 찾아야 할 결론이다.
 */
(function (CC) {
  'use strict';

  var NO_INPUT = '이 화면에서는 input()을 쓸 수 없어요. 자료는 data에 들어 있어요.';

  function short(msg) {
    var m = String(msg || '');
    if (m.indexOf('__NO_INPUT__') >= 0) return NO_INPUT;
    var lines = m.trim().split('\n').filter(function (x) { return x.trim(); });
    var last = (lines[lines.length - 1] || m).trim();
    var no = null, re = /File "<exec>", line (\d+)/g, x;
    while ((x = re.exec(m))) no = x[1];
    return no ? no + '번째 줄: ' + last : last;
  }

  CC.pyerr = { short: short, TIMEOUT: '5초 안에 끝나지 않아서 멈췄어요.', NO_INPUT: NO_INPUT };
})(window.CC = window.CC || {});
