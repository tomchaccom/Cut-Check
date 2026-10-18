/* Cut & Check — Supabase 클라이언트
 *
 * 인증과 DB를 담당한다. config.js처럼 설정 한 줄로 켜고 끈다.
 * Supabase가 설정 안 되어 있으면 localStorage 전용으로 동작한다.
 */
(function (CC) {
  'use strict';

  var given = (typeof window !== 'undefined' && window.CC_SUPABASE) || {};
  var url = given.url || '';
  var key = given.anonKey || '';

  /* Supabase CDN 클라이언트가 로드되어 있고 설정이 있을 때만 활성화 */
  var STUDENT_DOMAIN = 'students.invalid';
  var sb = null;
  if (url && key && typeof window !== 'undefined' && window.supabase) {
    sb = window.supabase.createClient(url, key);
  }

  function accounts(body) {
    if (!sb) return Promise.reject(new Error('Supabase 미설정'));
    return sb.auth.getSession().then(function (res) {
      var token = res.data && res.data.session && res.data.session.access_token;
      if (!token) throw new Error('다시 로그인해 주세요.');
      return fetch('/api/create-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || '서버에 연결하지 못했어요.');
        return j;
      });
    });
  }

  CC.sb = {
    active: function () { return !!sb; },
    client: function () { return sb; },

    /* ── 인증 ────────────────────────────────── */
    /* 프로필은 DB 트리거(handle_new_user)가 자동 생성한다.
     * 스스로 가입하는 사람은 모두 강사다 — 역할은 트리거가 정하고, 여기서 넘기지 않는다.
     * 학생 계정은 선생님이 createStudent 로 만든다. */
    signUp: function (email, password, name) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: name } }
      }).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    /* 이메일이 아니면 학생 아이디다 — 내부 이메일은 <아이디>@students.invalid */
    loginEmail: function (idOrEmail) {
      var s = String(idOrEmail || '').trim();
      return s.indexOf('@') >= 0 ? s : s.toLowerCase() + '@' + STUDENT_DOMAIN;
    },

    signIn: function (idOrEmail, password) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.auth.signInWithPassword({ email: CC.sb.loginEmail(idOrEmail), password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          return res.data;
        });
    },

    signOut: function () {
      if (!sb) return Promise.resolve();
      return sb.auth.signOut();
    },

    getUser: function () {
      if (!sb) return Promise.resolve(null);
      return sb.auth.getUser().then(function (res) {
        return res.data.user || null;
      });
    },

    getProfile: function () {
      if (!sb) return Promise.resolve(null);
      return sb.auth.getUser().then(function (res) {
        if (!res.data.user) return null;
        return sb.from('profiles').select('*').eq('id', res.data.user.id).single()
          .then(function (pRes) { return pRes.data; });
      });
    },

    onAuthChange: function (cb) {
      if (!sb) return;
      sb.auth.onAuthStateChange(function (event, session) { cb(event, session); });
    },

    /* ── 교실 ────────────────────────────────── */
    createClassroom: function (name) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      var code = Math.random().toString(36).substring(2, 8).toUpperCase();
      return sb.auth.getUser().then(function (res) {
        return sb.from('classrooms').insert({
          code: code, name: name, teacher_id: res.data.user.id
        }).select().single().then(function (r) {
          if (r.error) throw r.error;
          return r.data;
        });
      });
    },

    myClassrooms: function () {
      if (!sb) return Promise.resolve([]);
      return sb.auth.getUser().then(function (res) {
        if (!res.data.user) return [];
        var uid = res.data.user.id;
        /* 강사: 자기 교실, 학생: 수강 중인 교실 */
        return sb.from('classrooms').select('*').eq('teacher_id', uid)
          .then(function (tRes) {
            if (tRes.data && tRes.data.length) return tRes.data;
            return sb.from('enrollments').select('classroom_id, classrooms(*)').eq('student_id', uid)
              .then(function (sRes) {
                return (sRes.data || []).map(function (e) { return e.classrooms; });
              });
          });
      });
    },

    /* ── 미션 ────────────────────────────────── */
    saveMission: function (classroomId, missionData) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.auth.getUser().then(function (res) {
        return sb.from('missions').insert({
          classroom_id: classroomId, data: missionData, created_by: res.data.user.id
        }).select().single().then(function (r) {
          if (r.error) throw r.error;
          return r.data;
        });
      });
    },

    getMissions: function (classroomId) {
      if (!sb) return Promise.resolve([]);
      return sb.from('missions').select('*').eq('classroom_id', classroomId)
        .order('created_at', { ascending: false })
        .then(function (r) { return r.data || []; });
    },

    updateMission: function (missionId, missionData) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.from('missions').update({ data: missionData })
        .eq('id', missionId).select().single()
        .then(function (r) { if (r.error) throw r.error; return r.data; });
    },

    deleteMission: function (missionId) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.from('missions').delete().eq('id', missionId)
        .then(function (r) { if (r.error) throw r.error; return r; });
    },

    /* ── 교실 학생 목록 ────────────────────────── */
    getClassroomStudents: function (classroomId) {
      if (!sb) return Promise.resolve([]);
      return sb.from('enrollments')
        .select('student_id, profiles(id, name, login_id)')
        .eq('classroom_id', classroomId)
        .then(function (r) {
          return (r.data || []).map(function (e) { return e.profiles; }).filter(Boolean);
        });
    },

    /* 학생 계정 만들기 · 비밀번호 다시 만들기 — 서버(api/create-student.py)가 service 키로 한다.
     * 브라우저는 선생님 토큰만 넘긴다. password 를 비우면 서버가 만든다. → { loginId, password } */
    createStudent: function (classroomId, s) {
      return accounts({ action: 'create', classroomId: classroomId, name: s.name, loginId: s.loginId, password: s.password || '' });
    },

    resetStudentPassword: function (classroomId, loginId, password) {
      return accounts({ action: 'reset', classroomId: classroomId, loginId: loginId, password: password || '' });
    },

    /* 교실에서 학생 빼기 — 수강 한 줄만 지운다. 기록은 남는다.
     * RLS 에 막히면 에러 없이 0줄이 지워지므로, 지워진 줄이 없으면 실패로 본다 */
    removeStudent: function (classroomId, studentId) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.from('enrollments').delete().eq('classroom_id', classroomId).eq('student_id', studentId).select()
        .then(function (r) {
          if (r.error) throw r.error;
          if (!r.data || !r.data.length) throw new Error('학생을 뺄 수 없었어요. 권한을 확인해 주세요.');
          return r.data[0];
        });
    },

    /* ── 이벤트 (학생 기록) ──────────────────── */
    pushEvent: function (classroomId, missionId, event) {
      if (!sb) return Promise.resolve(null);
      return sb.auth.getUser().then(function (res) {
        if (!res.data.user) return null;
        return sb.from('student_events').insert({
          student_id: res.data.user.id,
          classroom_id: classroomId,
          mission_id: missionId,
          event: event
        }).then(function (r) {
          if (r.error) console.warn('이벤트 저장 실패:', r.error.message);
          return r;
        });
      });
    },

    getClassroomEvents: function (classroomId) {
      if (!sb) return Promise.resolve([]);
      return sb.from('student_events').select('*, profiles(name)')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: true })
        .then(function (r) { return r.error ? null : (r.data || []); }); /* 실패는 null — 빈 목록과 구분한다 */
    },

    getMyEvents: function (classroomId, missionId) {
      if (!sb) return Promise.resolve([]);
      return sb.auth.getUser().then(function (res) {
        if (!res.data.user) return [];
        var q = sb.from('student_events').select('mission_id, event')
          .eq('student_id', res.data.user.id)
          .eq('classroom_id', classroomId)
          .order('created_at', { ascending: true });
        if (missionId) q = q.eq('mission_id', missionId);
        /* _missionDbId: 내 미션 목록이 미션별 상태를 셀 때 쓴다 (이벤트 본문에는 DB id 가 없다) */
        return q.then(function (r) {
          return (r.data || []).map(function (row) {
            var ev = {}; for (var k in row.event) ev[k] = row.event[k];
            ev._missionDbId = row.mission_id;
            return ev;
          });
        });
      });
    }
  };
})(window.CC = window.CC || {});
