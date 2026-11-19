'use strict';
// منطق الألعاب (كله على السيرفر). كل لعبة: init(n) و act(state, slot, msg)
// act ترجع نص خطأ أو null. الفرق: slot%2  (0 = فريق أ ، 1 = فريق ب)
// state.winner: null (شغّال) | 0 | 1 | 'draw'

const rnd = n => 1 + Math.floor(Math.random() * n);

/* ───────────── XO ───────────── */
function xoLine(st, i) {
  const { size, win, board } = st;
  const t = board[i], x = i % size, y = (i / size) | 0;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (cx >= 0 && cy >= 0 && cx < size && cy < size && board[cy * size + cx] === t) {
        cells.push(cy * size + cx); cx += dx * s; cy += dy * s;
      }
    }
    if (cells.length >= win) return cells;
  }
  return null;
}
const xo = {
  id: 'xo', name: 'XO', icon: 'XO', modes: ['1v1', '2v2'],
  desc: '1v1: لوحة 3×3 • 2v2: لوحة 5×5 وتحتاج 4 بالصف',
  init(n) {
    const size = n === 2 ? 3 : 5, win = n === 2 ? 3 : 4;
    return { n, size, win, board: Array(size * size).fill(null), turn: 0, winner: null, line: null, last: null };
  },
  act(st, slot, m) {
    if (st.winner !== null) return 'انتهت اللعبة';
    if (slot !== st.turn) return 'مو دورك';
    if (m.a !== 'place') return 'حركة غير صحيحة';
    const i = m.i | 0;
    if (i < 0 || i >= st.board.length || st.board[i] !== null) return 'الخانة مو متاحة';
    st.board[i] = slot % 2;
    const l = xoLine(st, i);
    if (l) { st.winner = slot % 2; st.line = l; }
    else if (st.board.every(v => v !== null)) st.winner = 'draw';
    else st.turn = (st.turn + 1) % st.n;
    return null;
  }
};

/* ───────────── نرد ───────────── */
const dice = {
  id: 'dice', name: 'نرد', icon: 'D6', modes: ['1v1', '2v2'],
  desc: 'كل لاعب يرمي نردين، مجموع الفريق الأكبر يفوز بالجولة. الأول إلى 3 جولات',
  init(n) {
    return { n, turn: 0, round: 1, target: 3, scores: [0, 0], rolls: Array(n).fill(null), history: [], winner: null, last: null };
  },
  act(st, slot, m) {
    if (st.winner !== null) return 'انتهت اللعبة';
    if (slot !== st.turn) return 'مو دورك';
    if (m.a !== 'roll') return 'حركة غير صحيحة';
    const d = [rnd(6), rnd(6)];
    st.rolls[slot] = d;
    st.last = { slot, text: `رمى ${d[0]} و ${d[1]}` };
    st.turn++;
    if (st.turn >= st.n) {
      const tot = [0, 0];
      st.rolls.forEach((r, i) => { tot[i % 2] += r[0] + r[1]; });
      let w = null;
      if (tot[0] > tot[1]) { st.scores[0]++; w = 0; }
      else if (tot[1] > tot[0]) { st.scores[1]++; w = 1; }
      st.history.push({ round: st.round, rolls: st.rolls, tot, w });
      if (st.scores[0] >= st.target) st.winner = 0;
      else if (st.scores[1] >= st.target) st.winner = 1;
      else { st.round++; st.rolls = Array(st.n).fill(null); st.turn = 0; }
    }
    return null;
  }
};

/* ───────────── حية ودرج ───────────── */
const LADDERS = { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 };
const SNAKES = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 };
const snakes = {
  id: 'snakes', name: 'حية ودرج', icon: 'S&D', modes: ['1v1', '2v2'],
  desc: 'أول من يوصل 100 يفوز (في 2v2 أول واحد من الفريق). الستة تعطي دور إضافي',
  ladders: LADDERS, snakes: SNAKES,
  init(n) { return { n, pos: Array(n).fill(0), turn: 0, dice: null, winner: null, last: null }; },
  act(st, slot, m) {
    if (st.winner !== null) return 'انتهت اللعبة';
    if (slot !== st.turn) return 'مو دورك';
    if (m.a !== 'roll') return 'حركة غير صحيحة';
    const d = rnd(6); st.dice = d;
    const from = st.pos[slot];
    let to = from + d, text = `رمى ${d}`, bounced = false;
    if (to > 100) { to = from; bounced = true; text += ' (يحتاج رقم أدق)'; }
    else if (LADDERS[to]) { text += ` 🪜 صعد من ${to} إلى ${LADDERS[to]}`; to = LADDERS[to]; }
    else if (SNAKES[to]) { text += ` 🐍 نزل من ${to} إلى ${SNAKES[to]}`; to = SNAKES[to]; }
    st.pos[slot] = to;
    st.last = { slot, text };
    if (to === 100) { st.winner = slot % 2; return null; }
    if (!(d === 6 && !bounced)) st.turn = (st.turn + 1) % st.n;
    return null;
  }
};

/* ───────────── لودو ───────────── */
// progress لكل حجر: -1 بالقاعدة | 0..50 على المسار | 51..55 ممر البيت | 56 وصل
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const colorOf = (n, slot) => (n === 2 ? [0, 2][slot] : slot);
const labs = (st, slot, p) => (13 * colorOf(st.n, slot) + p) % 52;
function ludoPass(st) {
  st.sixes = 0; st.phase = 'roll'; st.movable = [];
  for (let i = 1; i <= st.n; i++) {
    const s = (st.turn + i) % st.n;
    if (!st.tok[s].every(p => p === 56)) { st.turn = s; break; }
  }
  return null;
}
const ludo = {
  id: 'ludo', name: 'لودو', icon: 'LD', modes: ['1v1', '2v2'],
  desc: '4 أحجار لكل لاعب. ستة تُخرج حجر وتعطي دور إضافي. 2v2: الفريق يفوز لما كل أحجاره توصل',
  init(n) {
    return { n, tok: Array.from({ length: n }, () => [-1, -1, -1, -1]), turn: 0, phase: 'roll', dice: null, movable: [], sixes: 0, winner: null, last: null };
  },
  act(st, slot, m) {
    if (st.winner !== null) return 'انتهت اللعبة';
    if (slot !== st.turn) return 'مو دورك';
    if (m.a === 'roll') {
      if (st.phase !== 'roll') return 'اختر حجر للتحريك';
      const d = rnd(6); st.dice = d;
      st.sixes = d === 6 ? st.sixes + 1 : 0;
      if (st.sixes >= 3) { st.last = { slot, d, text: 'رمى ثلاث ستات! يضيع الدور' }; return ludoPass(st); }
      const mv = [];
      st.tok[slot].forEach((p, k) => { if (p === -1 ? d === 6 : p + d <= 56) mv.push(k); });
      if (!mv.length) { st.last = { slot, d, text: `رمى ${d} — ما في حركة` }; return ludoPass(st); }
      st.movable = mv; st.phase = 'move'; st.last = { slot, d, text: `رمى ${d}` };
      return null;
    }
    if (m.a === 'move') {
      if (st.phase !== 'move') return 'ارمِ النرد أولاً';
      const k = m.k | 0;
      if (!st.movable.includes(k)) return 'حركة غير مسموحة';
      const d = st.dice, t = st.tok[slot];
      t[k] = t[k] === -1 ? 0 : t[k] + d;
      let ate = false;
      if (t[k] <= 50) {
        const a = labs(st, slot, t[k]);
        if (!SAFE.has(a)) {
          for (let o = 0; o < st.n; o++) {
            if (o % 2 === slot % 2) continue;
            st.tok[o].forEach((q, j) => { if (q >= 0 && q <= 50 && labs(st, o, q) === a) { st.tok[o][j] = -1; ate = true; } });
          }
        }
      }
      const home = t[k] === 56;
      st.last = { slot, d, text: ate ? 'أكل حجر! 💥' : home ? 'وصل حجر للبيت 🏠' : 'حرّك حجر' };
      const team = slot % 2;
      st.movable = [];
      if (st.tok.every((tt, o) => o % 2 !== team || tt.every(p => p === 56))) { st.winner = team; return null; }
      if (d === 6 || ate || home) { st.phase = 'roll'; return null; }
      return ludoPass(st);
    }
    return 'حركة غير صحيحة';
  }
};


/* ───────────── ألعاب إضافية ───────────── */
const domino = {
  id:'domino', name:'دومينو', icon:'D', modes:['1v1','2v2'], desc:'اسحب قطعة تطابق أحد طرفي السلسلة. أول فريق ينهي قطعه يفوز',
  init(n){
    const all=[]; for(let a=0;a<=6;a++) for(let b=a;b<=6;b++) all.push([a,b]);
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    const hands=Array.from({length:n},(_,i)=>all.slice(i*7,(i+1)*7));
    return {n,hands,chain:[],turn:0,winner:null,last:null,passes:0};
  },
  act(st,slot,m){
    if(st.winner!==null)return 'انتهت اللعبة'; if(slot!==st.turn)return 'مو دورك';
    const hand=st.hands[slot];
    if(m.a==='play'){
      const k=m.k|0, tile=hand[k]; if(!tile)return 'قطعة غير موجودة';
      if(!st.chain.length) st.chain.push(tile);
      else {const l=st.chain[0][0],r=st.chain[st.chain.length-1][1];
        if(tile[1]===l) st.chain.unshift([tile[0],tile[1]]);
        else if(tile[0]===l) st.chain.unshift([tile[1],tile[0]]);
        else if(tile[0]===r) st.chain.push(tile);
        else if(tile[1]===r) st.chain.push([tile[1],tile[0]]);
        else return 'القطعة لا تطابق الطرفين';
      }
      hand.splice(k,1); st.passes=0; st.last={slot,text:'وضع قطعة'};
      if(!hand.length)st.winner=slot%2; else st.turn=(st.turn+1)%st.n;
      return null;
    }
    if(m.a==='pass'){if(st.chain.length && hand.some(t=>t.includes(st.chain[0][0])||t.includes(st.chain.at(-1)[1])))return 'لديك قطعة قابلة للعب'; st.passes++;st.last={slot,text:'مرّر الدور'}; if(st.passes>=st.n){const sums=[0,0];st.hands.forEach((h,i)=>h.forEach(t=>sums[i%2]+=t[0]+t[1]));st.winner=sums[0]===sums[1]?'draw':sums[0]<sums[1]?0:1;}else st.turn=(st.turn+1)%st.n;return null;}
    return 'حركة غير صحيحة';
  }
};
const idle={id:'idle',name:'Idle Factory',icon:'IF',modes:['1v1','2v2'],desc:'اجمع الطاقة وطور المصنع. أول فريق يصل إلى الهدف يفوز',init(n){return {n,energy:Array(n).fill(0),level:Array(n).fill(1),turn:0,winner:null,last:null,target:100};},act(st,slot,m){if(st.winner!==null)return 'انتهت اللعبة';if(slot!==st.turn)return 'مو دورك';if(m.a==='collect'){st.energy[slot]+=st.level[slot]*5;st.last={slot,text:'جمع موارد'};}else if(m.a==='upgrade'){if(st.energy[slot]<20)return 'تحتاج 20 طاقة للتطوير';st.energy[slot]-=20;st.level[slot]++;st.last={slot,text:'طور المصنع'};}else return 'حركة غير صحيحة';if(st.energy[slot]>=st.target)st.winner=slot%2;else st.turn=(st.turn+1)%st.n;return null;}};
const coop={id:'coop',name:'تحدي تعاوني',icon:'CO',modes:['1v1','2v2'],desc:'تعاونوا لإنجاز المهمة قبل نفاد المحاولات',init(n){return {n,progress:0,target:30,turn:0,tries:40,winner:null,last:null};},act(st,slot,m){if(st.winner!==null)return 'انتهت المهمة';if(slot!==st.turn)return 'انتظر دورك';if(m.a!=='work')return 'حركة غير صحيحة';st.progress+=1+(Math.random()<.25?1:0);st.tries--;st.last={slot,text:'تقدم الفريق'};if(st.progress>=st.target)st.winner=0;else if(st.tries<=0)st.winner=1;else st.turn=(st.turn+1)%st.n;return null;}};
const defense={id:'defense',name:'حماية المقر',icon:'HQ',modes:['1v1','2v2'],desc:'هاجم مقر الخصم أو أصلح دفاعات فريقك. 1 ضد 1 أو 2 ضد 2',init(n){return {n,hp:[100,100],shield:[20,20],turn:0,winner:null,last:null};},act(st,slot,m){if(st.winner!==null)return 'انتهت المعركة';if(slot!==st.turn)return 'مو دورك';const team=slot%2,enemy=1-team;if(m.a==='attack'){const dmg=25;const absorbed=Math.min(st.shield[enemy],dmg);st.shield[enemy]-=absorbed;st.hp[enemy]-=dmg-absorbed;st.last={slot,text:'هجوم على المقر'};}else if(m.a==='repair'){st.hp[team]=Math.min(100,st.hp[team]+18);st.shield[team]=Math.min(40,st.shield[team]+12);st.last={slot,text:'إصلاح الدفاعات'};}else return 'حركة غير صحيحة';if(st.hp[enemy]<=0)st.winner=team;else st.turn=(st.turn+1)%st.n;return null;}};

module.exports = {
  list: { xo, dice, snakes, ludo, domino, idle, coop, defense },
  soon: ['ألعاب ورق', 'ألعاب باركور']
};
