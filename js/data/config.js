/* Cut & Check — 실행 설정
 *
 * 서버 없이도 수업이 되고, 서버가 붙으면 코드 수정 없이 붙는다.
 * 이 파일 하나만 바꾸면 모드가 바뀐다.
 *
 *   apiBase 가 비어 있으면  → 브라우저 안에서만 돈다 (local 어댑터)
 *   apiBase 가 있으면        → 그 서버로 보낸다 (http 어댑터)
 *
 * 왜 이렇게 하는가 —
 *   학교 와이파이는 끊긴다. 서버가 죽어도 수업은 끝까지 가야 한다.
 *   그래서 서버는 "있으면 좋은 것"이지 "없으면 안 되는 것"이 아니다.
 *   이 원칙을 지키려면 로컬 동작이 기본이고 서버가 옵션이어야 한다.
 *
 * 교사가 index.html 에서 이 값을 직접 고칠 수 있어야 한다 —
 *   <script>window.CC_CONFIG = { apiBase: 'https://...', classroomCode: '3-2' }</script>
 *   을 스크립트 태그들보다 먼저 넣으면 된다. 빌드도 환경변수도 없다.
 */
(function (CC) {
  'use strict';

  var given = (typeof window !== 'undefined' && window.CC_CONFIG) || {};

  CC.config = {
    /* 서버 주소. 빈 문자열이면 로컬 전용 */
    apiBase: given.apiBase || '',

    /* 교실 코드. 이름도 학번도 아니다 — 좌석만 구분하면 충분하다 */
    classroomCode: given.classroomCode || '',

    /* 이 브라우저의 좌석 id. 서버는 이게 누군지 모른다 */
    seatId: given.seatId || '',

    /* 이벤트 스키마 버전 (js/core/events.js 와 같아야 한다) */
    schema: 1,

    /* 보낼 때 몇 개씩 묶는가 */
    batchSize: given.batchSize || 20,

    /* 실패했을 때 다시 시도하기까지 (ms) */
    retryMs: given.retryMs || 5000,

    online: function () { return !!this.apiBase; }
  };
})(window.CC = window.CC || {});
