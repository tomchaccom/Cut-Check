/* test/integration-pipeline.js — 파이프라인 엔진 통합 테스트
 *
 * node test/integration-pipeline.js
 *
 * 개별 POC가 아니라 POC 간 접점을 검증한다:
 *   1. 파이프라인 실행 결과 → define 성공 조건 스키마가 맞는가
 *   2. 파이프라인 params → inputs 일관성이 맞는가
 *   3. 반례가 실제로 파이프라인 결과를 바꾸는가
 *   4. 파이프라인 결과 타입마다 렌더러가 있는가
 *   5. 파이프라인 이벤트가 기존 fold를 깨지 않는가
 *   6. 기존 미션(sm1~sm3)이 깨지지 않는가
 */
'use strict';

var pass = 0, fail = 0;
function assert(ok, msg) {
  if (ok) pass++;
  else { fail++; console.log('  FAIL ' + msg); }
}

/* ══════════════════════════════════════════════════════
 * POC 함수 인라인 (통합 후에는 js/core/ 에서 require)
 * ══════════════════════════════════════════════════════ */

/* ── 파이프라인 엔진 (poc-pipeline.js) ── */

var OPS = {
  split:{in:'text',out:'list'},filter:{in:'list',out:'list'},
  unique:{in:'list',out:'list'},count:{in:'list',out:'number'},
  sort:{in:'list',out:'list'},transform:{in:'list',out:'list'},
  join:{in:'list',out:'text'},toNumber:{in:'list',out:'numlist'},
  sum:{in:'numlist',out:'number'},max:{in:'numlist',out:'number'},
  min:{in:'numlist',out:'number'},groupCount:{in:'list',out:'pairs'}
};

var WHITELIST = [
  {id:'split-count',ops:['split','count']},
  {id:'split-unique-count',ops:['split','unique','count']},
  {id:'split-filter-count',ops:['split','filter','count']},
  {id:'split-filter-join',ops:['split','filter','join']},
  {id:'split-filter-unique-count',ops:['split','filter','unique','count']},
  {id:'split-sort-join',ops:['split','sort','join']},
  {id:'split-filter-sort-join',ops:['split','filter','sort','join']},
  {id:'split-transform-join',ops:['split','transform','join']},
  {id:'split-transform-unique-count',ops:['split','transform','unique','count']},
  {id:'split-num-sum',ops:['split','toNumber','sum']},
  {id:'split-num-max',ops:['split','toNumber','max']},
  {id:'split-num-min',ops:['split','toNumber','min']},
  {id:'split-group',ops:['split','groupCount']}
];

var SEP_MAP = {'쉼표':',','공백':/\s+/,'줄바꿈':'\n'};

function exec(op, val, slots, params) {
  switch(op){
    case 'split':{var sep=SEP_MAP[slots.sep]||',';return{t:'list',v:val.split(sep).filter(Boolean)};}
    case 'filter':{var tgt=params.filterTarget,cond=slots.cond,fn;
      if(Array.isArray(tgt)){fn=(cond==='있는'||cond==='포함')?function(x){return tgt.indexOf(x.trim())!==-1;}:function(x){return tgt.indexOf(x.trim())===-1;};}
      else{fn=(cond==='포함'||cond==='있는')?function(x){return x.indexOf(tgt)!==-1;}:function(x){return x.indexOf(tgt)===-1;};}
      return{t:'list',v:val.filter(fn)};}
    case 'unique':{var seen=[];val.forEach(function(x){if(seen.indexOf(x)===-1)seen.push(x);});return{t:'list',v:seen};}
    case 'count':return{t:'number',v:val.length};
    case 'sort':{var s=val.slice().sort(function(a,b){return a.localeCompare(b,'ko');});if(slots.dir==='거꾸로')s.reverse();return{t:'list',v:s};}
    case 'transform':{var arg=params.transformArg||'',tfn;
      if(slots.op==='공백제거')tfn=function(x){return x.trim();};
      else if(slots.op==='앞에붙이기')tfn=function(x){return arg+x.trim();};
      else if(slots.op==='뒤에붙이기')tfn=function(x){return x.trim()+arg;};
      else if(slots.op==='첫글자만')tfn=function(x){return x.trim().charAt(0);};
      else tfn=function(x){return x;};
      return{t:'list',v:val.map(tfn)};}
    case 'join':{var jm={'쉼표':',','공백':' ','줄바꿈':'\n','화살표':' → '};return{t:'text',v:val.join(jm[slots.joinSep]||',')};}
    case 'toNumber':{var nums=val.map(function(x){return Number(x.trim());});if(nums.some(isNaN))return{err:'숫자로 바꿀 수 없는 항목이 있어요.'};return{t:'numlist',v:nums};}
    case 'sum':return{t:'number',v:val.reduce(function(a,b){return a+b;},0)};
    case 'max':return{t:'number',v:Math.max.apply(null,val)};
    case 'min':return{t:'number',v:Math.min.apply(null,val)};
    case 'groupCount':{var g={};val.forEach(function(x){var k=x.trim();g[k]=(g[k]||0)+1;});return{t:'pairs',v:g};}
    default:return{err:'알 수 없는 연산: '+op};
  }
}

function runPipeline(id, slots, params, text) {
  var pipe=WHITELIST.filter(function(p){return p.id===id;})[0];
  if(!pipe)return{err:1,msg:'알 수 없는 파이프라인: '+id};
  var state={t:'text',v:text},steps=[];
  for(var i=0;i<pipe.ops.length;i++){
    var op=pipe.ops[i],def=OPS[op];
    if(def.in!==state.t)return{err:1,msg:(i+1)+'번 단계('+op+')가 '+def.in+'을 기대했지만 '+state.t+'이 왔어요.'};
    state=exec(op,state.v,slots,params||{});
    if(state.err)return{err:1,msg:state.err};
    steps.push({i:i,op:op,type:state.t,value:state.v});
  }
  return{err:0,type:state.t,value:state.v,steps:steps};
}

/* ── 파이프라인별 출력 타입 조회 ── */
function outputType(pipeId) {
  var pipe = WHITELIST.filter(function(p){return p.id===pipeId;})[0];
  if (!pipe) return null;
  var cur = 'text';
  for (var i = 0; i < pipe.ops.length; i++) cur = OPS[pipe.ops[i]].out;
  return cur;
}

/* ── define 검증 (poc-define.js) ── */

var METHOD_WORDS = ['나누','자르','split','정렬해','sorted','필터','filter',
  '반복','loop','for문','합쳐','join(','중복 제거해','.unique','쉼표로 나','공백으로 나'];

function validateDefine(def) {
  var errs = [];
  if (!def.q) errs.push('q 없음');
  if (!Array.isArray(def.options)) return ['options 없음'];
  if (def.options.length < 3) errs.push('R1: 보기 3개 미만');
  var traps = {'null':0,hardcode:0,luck:0};
  def.options.forEach(function(opt,i){
    var tv = opt.trap===null||opt.trap===undefined?'null':opt.trap;
    traps[tv]++;
    if (opt.trap===null && opt.v) {
      METHOD_WORDS.forEach(function(w){ if(opt.v.indexOf(w)!==-1) errs.push('R5: 방법 키워드 "'+w+'"'); });
    }
    if (opt.v && opt.v.length > 80) errs.push('R6: 80자 초과');
  });
  if (traps['null']<1) errs.push('R2: trap:null 없음');
  if (traps.hardcode<1) errs.push('R3: hardcode 없음');
  if (traps.luck<1) errs.push('R4: luck 없음');
  return errs;
}

/* ── params 검증 (poc-params-validate.js) ── */

function validateParams(pipeline, params, inputs) {
  if (!inputs||inputs.length<3) return {valid:false,msg:'자료 3개 미만'};
  if (pipeline.indexOf('filter')!==-1 && params.filterTarget) {
    var allItems=[];
    inputs.forEach(function(inp){String(inp.v).split(params.sep||',').filter(Boolean).forEach(function(x){x=x.trim();if(allItems.indexOf(x)===-1)allItems.push(x);});});
    var ft=params.filterTarget;
    var found=ft.filter(function(t){return allItems.indexOf(t)!==-1;});
    if(found.length===0) return{valid:false,msg:'filterTarget이 자료에 없음'};
    if(ft.length===allItems.length&&ft.every(function(t){return allItems.indexOf(t)!==-1;}))
      return{valid:false,msg:'filterTarget이 전체와 같음'};
  }
  return {valid:true};
}

/* ── pairs 렌더러 (poc-pairs-display.js) ── */

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

function renderPairsHTML(pairs) {
  if(!pairs||typeof pairs!=='object')return'<div class="result-pairs empty">(비어 있음)</div>';
  var keys=Object.keys(pairs);
  if(!keys.length)return'<div class="result-pairs empty">(비어 있음)</div>';
  var lines=keys.map(function(k){return'<div class="pair-row"><span class="pair-key">'+esc(k)+'</span><span class="pair-sep"> — </span><span class="pair-val">'+esc(String(pairs[k]))+'</span></div>';});
  return'<div class="result-pairs">'+lines.join('')+'</div>';
}

/* ── 결과 타입별 렌더러 맵 ── */

var RENDERERS = {
  number: function(v) { return '<span class="result-value">' + esc(String(v)) + '</span>'; },
  text:   function(v) { return '<span class="result-value">' + esc(String(v)) + '</span>'; },
  list:   function(v) { return '<span class="result-value">' + esc(v.join(', ')) + '</span>'; },
  pairs:  function(v) { return renderPairsHTML(v); },
  numlist:function(v) { return '<span class="result-value">' + esc(v.join(', ')) + '</span>'; }
};

/* ── 실제 events/fold 로드 ── */

global.window = {};
require('../js/core/events.js');
require('../js/core/fold.js');
var CC = global.window.CC;
var T = CC.events.T;

/* ══════════════════════════════════════════════════════
 * 통합 테스트 시나리오
 * ══════════════════════════════════════════════════════ */

/* ── 시나리오 1: split-filter-count 전체 라이프사이클 ── */

console.log('=== 시나리오 1: split-filter-count 라이프사이클 ===');

var S1 = {
  pipeline: 'split-filter-count',
  define: {
    q: '이 일이 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
    options: [
      { v: '화면에 2라고 뜨면 성공이다', key: null, trap: 'hardcode' },
      { v: '어떤 목록이 와도 조건에 맞는 것의 개수를 셀 수 있으면 성공이다', key: 'filtered_count', trap: null },
      { v: '오류 없이 끝까지 실행되면 성공이다', key: null, trap: 'luck' }
    ]
  },
  slots: { sep: '쉼표', cond: '있는' },
  params: { filterTarget: ['우유', '달걀', '땅콩'] },
  inputs: [
    { name: '주문서 1', v: '밥,우유,김치' },
    { name: '주문서 2', v: '빵,달걀,과자,떡' },
    { name: '주문서 3', v: '사과,바나나,물' }
  ]
};

// 1a. define 스키마 통과
assert(validateDefine(S1.define).length === 0, 'S1: define 스키마 통과');

// 1b. params/inputs 일관성 통과
assert(validateParams(S1.pipeline, S1.params, S1.inputs).valid, 'S1: params 일관성 통과');

// 1c. 정상 실행 → number 결과
var s1r1 = runPipeline(S1.pipeline, S1.slots, S1.params, S1.inputs[0].v);
assert(s1r1.err === 0 && s1r1.type === 'number' && s1r1.value === 1, 'S1: 정상 실행 (우유 1개)');

// 1d. 반례 실행 → 다른 결과 (0개)
var s1r3 = runPipeline(S1.pipeline, S1.slots, S1.params, S1.inputs[2].v);
assert(s1r3.err === 0 && s1r3.value === 0, 'S1: 반례 실행 (0개)');

// 1e. 결과 타입에 렌더러 존재
assert(typeof RENDERERS[s1r1.type] === 'function', 'S1: number 렌더러 존재');

// 1f. fold에 이벤트 흘리기
var s1evs = [
  CC.events.make(T.S_DEFINE, { choice: S1.define.options[1].v, reason: '조건에 맞는 것만 세야 하니까' }),
  CC.events.make(T.S_METHOD, { slots: S1.slots, pipelineId: S1.pipeline, reason: '쉼표로 나눠져 있어서' }),
  CC.events.make(T.S_RUN, { dataId: 'd01', result: { err: 0, type: 'number', value: 1 } }),
  CC.events.make(T.S_JUDGE, { runId: 0, verdict: '지켰다', basis: '우유 1개가 맞으니까' }),
  CC.events.make(T.S_RUN, { dataId: 'd03', result: { err: 0, type: 'number', value: 0 } }),
  CC.events.make(T.S_JUDGE, { runId: 1, verdict: '지키지 못했다', basis: '0이 나왔다' })
];
var s1f = CC.fold.fold(s1evs, { now: Date.now() });
assert(s1f.sDefine.choice === S1.define.options[1].v, 'S1: fold — define 보존');
assert(s1f.sMethod.slots.cond === '있는', 'S1: fold — 가변 슬롯(cond) 보존');
assert(s1f.sRuns.length === 2, 'S1: fold — 실행 2회 기록');
assert(s1f.sJudges.length === 2, 'S1: fold — 판정 2회 기록');
assert(s1f.sJudges[1].verdict === '지키지 못했다', 'S1: fold — 반례 판정 보존');

/* ── 시나리오 2: split-sort-join + identity 반례 ── */

console.log('\n=== 시나리오 2: split-sort-join + identity 반례 ===');

var S2 = {
  pipeline: 'split-sort-join',
  define: {
    q: '이 일이 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
    options: [
      { v: '화면에 바나나,사과,우유라고 뜨면 성공이다', key: null, trap: 'hardcode' },
      { v: '어떤 목록이 와도 순서대로 나열된 글이 나오면 성공이다', key: 'sorted', trap: null },
      { v: '오류 없이 끝까지 실행되면 성공이다', key: null, trap: 'luck' }
    ]
  },
  slots: { sep: '쉼표', dir: '가나다순', joinSep: '쉼표' },
  params: {},
  normal: '우유,바나나,사과',
  counter: '바나나,사과,우유'  // 이미 정렬됨 → identity 반례
};

assert(validateDefine(S2.define).length === 0, 'S2: define 스키마 통과');

var s2rN = runPipeline(S2.pipeline, S2.slots, S2.params, S2.normal);
var s2rC = runPipeline(S2.pipeline, S2.slots, S2.params, S2.counter);
assert(s2rN.type === 'text', 'S2: 출력 타입 text');
assert(s2rN.value === '바나나,사과,우유', 'S2: 정상 정렬');
assert(s2rC.value === '바나나,사과,우유', 'S2: identity — 반례도 같은 결과');
assert(s2rC.value === S2.counter, 'S2: identity — 입력 == 출력 (정렬 효과 없음)');
assert(typeof RENDERERS[s2rN.type] === 'function', 'S2: text 렌더러 존재');

/* ── 시나리오 3: split-group + pairs 렌더링 ── */

console.log('\n=== 시나리오 3: split-group + pairs 렌더링 ===');

var S3 = {
  pipeline: 'split-group',
  define: {
    q: '이 일이 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
    options: [
      { v: '화면에 사과:3이라고 뜨면 성공이다', key: null, trap: 'hardcode' },
      { v: '어떤 목록이 와도 같은 것끼리 묶인 개수가 나오면 성공이다', key: 'group', trap: null },
      { v: '뭐라도 나오면 성공이다', key: null, trap: 'luck' }
    ]
  },
  slots: { sep: '쉼표' },
  params: {},
  input: '사과,바나나,사과,우유,바나나,사과'
};

assert(validateDefine(S3.define).length === 0, 'S3: define 스키마 통과');

var s3r = runPipeline(S3.pipeline, S3.slots, S3.params, S3.input);
assert(s3r.type === 'pairs', 'S3: 출력 타입 pairs');
assert(s3r.value['사과'] === 3, 'S3: 사과 3개');
assert(s3r.value['바나나'] === 2, 'S3: 바나나 2개');

// pairs 렌더링
var s3html = RENDERERS.pairs(s3r.value);
assert(s3html.indexOf('사과') !== -1, 'S3: 렌더링에 키 포함');
assert(s3html.indexOf('3') !== -1, 'S3: 렌더링에 값 포함');
assert(s3html.indexOf('pair-row') !== -1, 'S3: pair-row 클래스');
assert(s3html.indexOf('<script') === -1, 'S3: XSS 안전');

// fold
var s3evs = [
  CC.events.make(T.S_METHOD, { slots: S3.slots, pipelineId: 'split-group', reason: '묶어서 세려고' }),
  CC.events.make(T.S_RUN, { dataId: 'd01', result: { err: 0, type: 'pairs', value: s3r.value } })
];
var s3f = CC.fold.fold(s3evs, { now: Date.now() });
assert(s3f.sRuns[0].result.type === 'pairs', 'S3: fold — pairs 타입 보존');
assert(s3f.sRuns[0].result.value['사과'] === 3, 'S3: fold — pairs 값 보존');

/* ── 시나리오 4: split-num-sum + 숫자 에러 ── */

console.log('\n=== 시나리오 4: split-num-sum + 에러 전파 ===');

var s4ok = runPipeline('split-num-sum', { sep: '쉼표' }, {}, '10,20,30');
assert(s4ok.value === 60, 'S4: 정상 합계 60');
assert(s4ok.type === 'number', 'S4: 출력 타입 number');

var s4err = runPipeline('split-num-sum', { sep: '쉼표' }, {}, '10,abc,30');
assert(s4err.err === 1, 'S4: 비숫자 입력 → 에러');
assert(s4err.msg.indexOf('숫자') !== -1, 'S4: 에러 메시지에 "숫자" 포함');

/* ── 시나리오 5: 기존 sm1 미션 하위 호환 ── */

console.log('\n=== 시나리오 5: 기존 미션 하위 호환 ===');

// 기존 sm1의 이벤트 (pipelineId 없음, 기존 슬롯 구조)
var s5evs = [
  CC.events.make(T.S_DEFINE, { choice: '서로 다른 상품 이름의 개수', reason: '중복을 빼야 하니까' }),
  CC.events.make(T.S_METHOD, {
    slots: { sep: '쉼표', dedup: '하나만 남긴다', output: '남은 항목의 개수' },
    reason: '쉼표가 보여서'
  }),
  CC.events.make(T.S_RUN, { dataId: 'd01', result: { err: 0, type: 'number', value: 3 } }),
  CC.events.make(T.S_JUDGE, { runId: 0, verdict: '지켰다', basis: '3개가 맞으니까' }),
  CC.events.make(T.S_WRAP, { text: '쉼표로 나누면 상품이 나뉜다는 걸 알았다' })
];
var s5f = CC.fold.fold(s5evs, { now: Date.now() });
assert(s5f.sDefine.choice === '서로 다른 상품 이름의 개수', 'S5: 기존 define 보존');
assert(s5f.sMethod.slots.sep === '쉼표', 'S5: 기존 slots.sep 보존');
assert(s5f.sMethod.slots.dedup === '하나만 남긴다', 'S5: 기존 slots.dedup 보존');
assert(s5f.sMethod.slots.output === '남은 항목의 개수', 'S5: 기존 slots.output 보존');
assert(s5f.sRuns.length === 1, 'S5: 기존 실행 기록 보존');
assert(s5f.sJudges[0].verdict === '지켰다', 'S5: 기존 판정 보존');
assert(s5f.sWrap === '쉼표로 나누면 상품이 나뉜다는 걸 알았다', 'S5: 기존 마무리 보존');

// 기존 + 새 파이프라인 이벤트가 한 학생에게 섞여도 fold가 안 깨지는가
var s5mixed = s5evs.concat([
  CC.events.make(T.S_DEFINE, { choice: '조건에 맞는 것의 개수', reason: '걸러내기' }),
  CC.events.make(T.S_METHOD, {
    slots: { sep: '쉼표', cond: '있는' },
    pipelineId: 'split-filter-count',
    reason: '필터링 해보려고'
  }),
  CC.events.make(T.S_RUN, { dataId: 'd01', result: { err: 0, type: 'number', value: 2 } })
]);
var s5mf = CC.fold.fold(s5mixed, { now: Date.now() });
assert(s5mf.sDefine.choice === '조건에 맞는 것의 개수', 'S5: 혼합 — 최신 define');
assert(s5mf.sMethod.slots.cond === '있는', 'S5: 혼합 — 새 슬롯(cond)');
assert(s5mf.sMethod.slots.dedup === undefined, 'S5: 혼합 — 기존 슬롯(dedup) 사라짐');
assert(s5mf.sRuns.length === 2, 'S5: 혼합 — 실행 누적');

/* ══════════════════════════════════════════════════════
 * 크로스컨선 일관성 검증
 * ══════════════════════════════════════════════════════ */

console.log('\n=== 크로스컨선: 전 파이프라인 커버리지 ===');

// 모든 파이프라인의 출력 타입에 렌더러가 있는가
WHITELIST.forEach(function(p) {
  var ot = outputType(p.id);
  assert(typeof RENDERERS[ot] === 'function',
    'CC1: ' + p.id + ' 출력 타입(' + ot + ')에 렌더러 존재');
});

// 파이프라인 출력 타입 → define 성공 조건 의미가 맞는가
// number 파이프라인의 define은 숫자 관련이어야 하고, text는 텍스트 관련이어야 한다
var OUTPUT_TYPE_MAP = {};
WHITELIST.forEach(function(p) { OUTPUT_TYPE_MAP[p.id] = outputType(p.id); });

var numberPipes = Object.keys(OUTPUT_TYPE_MAP).filter(function(k){return OUTPUT_TYPE_MAP[k]==='number';});
var textPipes = Object.keys(OUTPUT_TYPE_MAP).filter(function(k){return OUTPUT_TYPE_MAP[k]==='text';});
var pairsPipes = Object.keys(OUTPUT_TYPE_MAP).filter(function(k){return OUTPUT_TYPE_MAP[k]==='pairs';});

assert(numberPipes.length >= 5, 'CC2: number 출력 파이프라인 5개 이상 (' + numberPipes.length + ')');
assert(textPipes.length >= 3, 'CC2: text 출력 파이프라인 3개 이상 (' + textPipes.length + ')');
assert(pairsPipes.length >= 1, 'CC2: pairs 출력 파이프라인 1개 이상 (' + pairsPipes.length + ')');

// NEVER 필드가 파이프라인 이벤트에서도 차단되는가
console.log('\n=== 크로스컨선: NEVER 필드 차단 ===');

CC.events.NEVER.forEach(function(field) {
  var payload = { slots: { sep: '쉼표' }, pipelineId: 'split-count', reason: 'test' };
  payload[field] = 1;
  var blocked = false;
  try { CC.events.make(T.S_METHOD, payload); } catch(e) { blocked = true; }
  assert(blocked, 'CC3: s-method에 pipelineId 있어도 ' + field + ' 차단');
});

// params 검증이 유효하지 않은 미션을 잡는가
console.log('\n=== 크로스컨선: params 검증 ===');

assert(!validateParams('split-filter-count',
  { filterTarget: ['유니콘'] },
  [{ name:'a',v:'사과,바나나' },{ name:'b',v:'우유,빵' },{ name:'c',v:'김치,국' }]
).valid, 'CC4: 자료에 없는 filterTarget 거부');

assert(validateParams('split-count', {},
  [{ name:'a',v:'1,2' },{ name:'b',v:'3,4' },{ name:'c',v:'5,6' }]
).valid, 'CC4: filter 없는 파이프라인은 filterTarget 불필요');

/* ══════════════════════════════════════════════════════
 * 결론
 * ══════════════════════════════════════════════════════ */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\n통합 실패 — 위 FAIL 항목을 해결해야 통합 가능');
}
process.exit(fail ? 1 : 0);
