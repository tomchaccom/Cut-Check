/* Cut & Check — 코드 사실 (core)
 * 학생 한 명(그 미션으로 접은 것) + 미션 → 강사 서랍에 띄울 사실 문장. 판정·점수가 아니다.
 * 정답 값과 대조하지 않는다 — 반례 출력이 첫 자료 출력과 같다는 사실만 본다.
 */
(function (CC) {
  'use strict';

  function of(student, mission) {
    var out = [];
    var inputs = (mission && mission.inputs) || [];
    if (!inputs.length) return out;
    var first = inputs[0], counter = null;
    inputs.forEach(function (x) { if (x.counter) counter = x; });
    var codes = (student && student.sCodes) || [], probe = student && student.sProbe;

    if (counter && !codes.some(function (c) { return c.dataId === counter.v; })) {
      out.push({ kind: 'nocounter', text: '새로 온 자료로는 실행하지 않았어요' });
    }
    if (!probe) return out;

    var outs = probe.outs || [];
    function nameOf(dataId, i) {
      for (var k = 0; k < inputs.length; k++) if (inputs[k].v === dataId) return inputs[k].name || '자료 ' + (k + 1);
      return '자료 ' + (i + 1);
    }
    var bad = null;
    outs.forEach(function (o, i) { if (!bad && o.error) bad = nameOf(o.dataId, i); });
    if (bad) {
      out.push({ kind: 'error', text: (/^자료/.test(bad) ? '' : '자료 ') + bad + '에서는 에러가 나요' });
    } else if (counter) {
      var o1 = null, oc = null;
      outs.forEach(function (o) {
        if (o.dataId === first.v && !o1) o1 = o;
        if (o.dataId === counter.v) oc = o;
      });
      if (o1 && oc && counter !== first && String(oc.output).trim() === String(o1.output).trim()) {
        var n1 = first.name || '자료 1', val = String(oc.output).trim();
        out.push({ kind: 'hardcode', text: '새로 온 자료에서도 ' + n1 + CC.particle(n1, '과/와') + ' 같은 결과 ' + val + CC.particle(val, '이/가') + ' 나와요' });
      }
    }
    var c = mission.concept && CC.codemission.concept(mission.concept);
    if (c && Array.isArray(probe.uses) && !CC.codemission.uses(c.id, probe.uses)) {
      out.push({ kind: 'concept', text: '오늘 개념 ' + c.label + CC.particle(c.label, '이/가') + ' 코드에 없어요' });
    }
    return out;
  }

  CC.facts = { of: of };
})(typeof window !== 'undefined' ? (window.CC = window.CC || {}) : (global.CC = global.CC || {}));
