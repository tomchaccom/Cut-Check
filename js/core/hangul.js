/* Cut & Check — 조사 붙이기
 *
 * 중학생이 보는 화면에서 "개수이 나올 줄 알았는데"가 뜨면
 * 그 순간 학생은 이 도구를 대충 만든 물건으로 분류한다.
 * 문장을 데이터로 조립하는 화면이라면 조사는 반드시 계산해야 한다.
 */
(function (CC) {
  'use strict';

  /* 마지막 글자에 받침이 있는가 */
  function hasBatchim(word) {
    if (!word) return false;
    var ch = String(word).trim().slice(-1);
    var code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) {
      /* 한글이 아니면 숫자·영문 발음 기준으로 대충 맞춘다 */
      return '136780lmnr'.indexOf(ch.toLowerCase()) !== -1;
    }
    return (code - 0xAC00) % 28 !== 0;
  }

  /* '으로/로' 는 ㄹ 받침에도 '로' 다 — 서울로, 1(일)로 */
  function rieul(word) {
    var ch = String(word).trim().slice(-1), code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return '178l'.indexOf(ch.toLowerCase()) !== -1;
    return (code - 0xAC00) % 28 === 8;
  }

  function pick(word, pair) {
    var p = pair.split('/');
    if (pair === '으로/로' && word && rieul(word)) return p[1];
    return hasBatchim(word) ? p[0] : p[1];
  }

  /* josa('개수', '이/가') → '개수가' */
  function josa(word, pair) { return word + pick(word, pair); }

  /* particle('개수', '이/가') → '가'  — 단어를 <b> 로 감싸야 할 때 쓴다 */
  function particle(word, pair) { return pick(word, pair); }

  CC.josa = josa;
  CC.particle = particle;
  CC.hasBatchim = hasBatchim;
})(window.CC = window.CC || {});
