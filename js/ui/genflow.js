/* 강사 화면 단계별 생성 — 1단계 개념 확인, 2단계 예시 고르기 (3·4단계는 뒤 작업).
 * 서버 통신은 CC.sb.api 만 쓴다. teacher.html 은 init 한 줄만 부른다.
 *
 *   CC.genflow.init({ room: fn, students: fn, saved: fn })
 */
(function (CC) {
  function $(s) { return document.querySelector(s); }
  var st = { concept: null, examples: [], seen: [], pick: -1, py: null };

  function level() {
    return { difficulty: $('#gen-diff').value, stages: CC.onboard.spread(st.opts.students()) };
  }
  function call(body) {
    var l = level(); body.difficulty = l.difficulty; body.stages = l.stages;
    return CC.sb.api('/api/mission-steps', body);
  }
  function say(t) { $('#sg-status').textContent = t || ''; }
  function fail(e) { say(e && e.message ? e.message : '잠시 뒤에 다시 해 주세요.'); }

  function pick(i) {
    st.pick = i;
    [].forEach.call(document.querySelectorAll('.sg-ex'), function (b, k) {
      b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
    });
    $('#sg-build').disabled = i < 0;
  }

  function show(list) {
    var box = $('#sg-examples');
    box.textContent = '';
    st.examples = list;
    list.forEach(function (x, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sg-ex'; b.setAttribute('aria-pressed', 'false');
      [x.title, x.situation, '→ ' + x.why].forEach(function (t) {
        var s = document.createElement('span'); s.textContent = t; b.appendChild(s);
      });
      b.addEventListener('click', function () { pick(i); });
      box.appendChild(b);
    });
    pick(-1);
  }

  /* more=true 면 지금 보인 제목을 seen 에 쌓아 겹치지 않게 받는다. 개념을 바꾸면 처음부터 */
  function load(more) {
    if (more) st.examples.forEach(function (x) { st.seen.push(x.title); }); else st.seen = [];
    say('예시를 가져오는 중이에요.');
    return call({ action: 'examples', concept: st.concept, seen: st.seen.slice() }).then(function (r) {
      show(r.examples || []); say('');
    }).catch(fail);
  }

  function boot() {
    if (st.py || !CC.pyrun) return;
    st.py = CC.pyrun.create(function () {});   /* 한 번만 — 4단계가 st.py 로 모범 답안을 돌린다 */
  }

  function concept() {
    var lesson = $('#gen-lesson').value.trim(), key = $('#gen-key').value.trim();
    if (!lesson) { say('수업 내용을 입력해주세요.'); return; }
    boot();
    $('#sg').hidden = false;
    say('개념을 확인하는 중이에요.');
    call({ action: 'concept', lesson: lesson, keyPoint: key }).then(function (r) {
      st.concept = r.concept;
      $('#sg-concept-pick').value = r.concept;
      return load(false);
    }).catch(fail);
  }

  CC.genflow = {
    state: st,
    init: function (opts) {
      st.opts = opts;
      var sel = $('#sg-concept-pick');
      CC.codemission.CONCEPTS.forEach(function (c) {
        var o = document.createElement('option'); o.value = c.id; o.textContent = c.label; sel.appendChild(o);
      });
      $('#sg-concept').addEventListener('click', concept);
      $('#sg-more').addEventListener('click', function () { load(true); });
      sel.addEventListener('change', function () { st.concept = sel.value; load(false); });
    }
  };
})(window.CC = window.CC || {});
