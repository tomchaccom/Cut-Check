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
  var sb = null;
  if (url && key && typeof window !== 'undefined' && window.supabase) {
    sb = window.supabase.createClient(url, key);
  }

  CC.sb = {
    active: function () { return !!sb; },
    client: function () { return sb; },

    /* ── 인증 ────────────────────────────────── */
    /* 프로필은 DB 트리거(handle_new_user)가 자동 생성한다.
     * 클라이언트는 메타데이터로 name/role만 넘긴다. */
    signUp: function (email, password, name, role) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: name, role: role || 'student' } }
      }).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    signIn: function (email, password) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.auth.signInWithPassword({ email: email, password: password })
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

    joinClassroom: function (code) {
      if (!sb) return Promise.reject(new Error('Supabase 미설정'));
      return sb.rpc('find_classroom_by_code', { join_code: code.toUpperCase() })
        .then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || !res.data.length) throw new Error('교실을 찾을 수 없어요.');
          var classroom = res.data[0];
          return sb.auth.getUser().then(function (uRes) {
            return sb.from('enrollments').upsert({
              student_id: uRes.data.user.id, classroom_id: classroom.id
            }).then(function () { return classroom; });
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
        .select('student_id, profiles(id, name)')
        .eq('classroom_id', classroomId)
        .then(function (r) {
          return (r.data || []).map(function (e) { return e.profiles; }).filter(Boolean);
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
