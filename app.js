/* ============================================================
   MORSE ACADEMY — app engine
   State, audio, drills, rendering. Depends on data.js being
   loaded first (MORSE_MAP, KOCH_ORDER, CURRICULUM, etc).
   ============================================================ */
"use strict";

/* ---------------------------------------------------------------
   STATE
   --------------------------------------------------------------- */
const STORE_KEY = "morseAcademyState_v1";

function freshState(){
  const charStats = {};
  KOCH_ORDER.forEach((ch,i)=>{ charStats[ch] = {attempts:0, correct:0, unlocked:i<2}; });
  return {
    version:1,
    xp:0,
    streak:0,
    lastPracticeDate:null,
    firstUseDate: todayStr(),
    charStats,
    settings:{ wpm:20, effWpm:5, sendWpm:15, freq:600, sound:true, reduceMotion:false, accent:"amber", bandNoise:false },
    completedDays:[],
    taskChecks:{},
    achievements:[],
    totalDits:0, totalDahs:0, totalSessions:0, totalPracticeMs:0,
    totalCorrectChars:0,
    pbEffWpm:0, bestAccuracyStreak:0, bestTimingScore:0,
    speedRounds:[],
    sessionLog:[],
    dailyChallengeDates:[]
  };
}

function todayStr(){ return new Date().toISOString().slice(0,10); }

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    const fresh = freshState();
    // shallow-merge to survive schema additions between versions
    const merged = {...fresh, ...parsed};
    merged.settings = {...fresh.settings, ...(parsed.settings||{})};
    merged.charStats = {...fresh.charStats, ...(parsed.charStats||{})};
    return merged;
  }catch(e){
    console.warn("Could not load saved progress, starting fresh.", e);
    return freshState();
  }
}

function saveState(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function unlockedChars(){
  return KOCH_ORDER.filter(c => state.charStats[c]?.unlocked);
}

function recordAttempt(ch, correct){
  const st = state.charStats[ch];
  if (!st) return;
  st.attempts++;
  if (correct) st.correct++;
}

function accuracyOf(ch){
  const st = state.charStats[ch];
  if (!st || st.attempts===0) return null;
  return Math.round((st.correct/st.attempts)*100);
}

/* ---------------------------------------------------------------
   XP / LEVEL / STREAK
   --------------------------------------------------------------- */
function addXp(amount){
  const before = levelForXp(state.xp);
  state.xp += amount;
  const after = levelForXp(state.xp);
  saveState();
  if (after.lvl > before.lvl){
    toast(`Level Up! · ${after.title}`, `You're now Level ${after.lvl}.`, "green");
    burstConfetti();
  }
}

function touchStreak(){
  const today = todayStr();
  if (state.lastPracticeDate === today) return; // already counted today
  const y = new Date(); y.setDate(y.getDate()-1);
  const yesterday = y.toISOString().slice(0,10);
  if (state.lastPracticeDate === yesterday){
    state.streak += 1;
  } else {
    state.streak = 1;
  }
  state.lastPracticeDate = today;
  saveState();
}

/* ---------------------------------------------------------------
   ACHIEVEMENTS + TOASTS
   --------------------------------------------------------------- */
function checkAchievements(){
  let unlockedAny = false;
  ACHIEVEMENTS.forEach(a=>{
    if (!state.achievements.includes(a.id) && a.check(state)){
      state.achievements.push(a.id);
      unlockedAny = true;
      toast(`Achievement Unlocked · ${a.icon} ${a.name}`, a.desc, "amber");
      burstConfetti();
      addXp(100);
    }
  });
  if (unlockedAny) saveState();
  return unlockedAny;
}

function logSession(entry){
  state.sessionLog.unshift({ts:Date.now(), ...entry});
  state.sessionLog = state.sessionLog.slice(0,25);
}

function toast(title, body, cls){
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast" + (cls==="green" ? " green" : "");
  el.innerHTML = `<b>${escapeHtml(title)}</b>${escapeHtml(body||"")}`;
  wrap.appendChild(el);
  setTimeout(()=> el.remove(), 3700);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* ---------------------------------------------------------------
   AUDIO ENGINE
   --------------------------------------------------------------- */
const Audio_ = (()=>{
  let ctx = null;
  let liveOsc = null, liveGain = null;
  let analyser = null;
  let noiseSrc = null, noiseGain = null;

  function ensure(){
    if (!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function getAnalyser(){ return analyser; }

  function setNoise(on){
    const c = ensure();
    if (on){
      if (noiseSrc) return;
      const bufSec = 2, bufferSize = Math.floor(c.sampleRate*bufSec);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1);
      noiseSrc = c.createBufferSource();
      noiseSrc.buffer = buffer; noiseSrc.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass"; filter.frequency.value = 1800; filter.Q.value = 0.5;
      noiseGain = c.createGain(); noiseGain.gain.value = 0.015;
      noiseSrc.connect(filter).connect(noiseGain).connect(c.destination);
      noiseSrc.start();
    } else if (noiseSrc){
      try{ noiseSrc.stop(); }catch(e){}
      noiseSrc.disconnect();
      noiseSrc = null;
    }
  }

  // Generic beep scheduler — works on ANY BaseAudioContext (live or
  // offline), which is what lets playTokens() and exportWav() below
  // share one code path instead of duplicating the timing logic.
  function scheduleBeepOn(c, destination, freq, startAt, durSec){
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    const a = 0.006;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.28, startAt + a);
    gain.gain.setValueAtTime(0.28, Math.max(startAt+a, startAt + durSec - a));
    gain.gain.linearRampToValueAtTime(0, startAt + durSec);
    osc.connect(gain).connect(destination);
    osc.start(startAt);
    osc.stop(startAt + durSec + 0.02);
    return gain;
  }

  function scheduleBeep(freq, startAt, durSec){
    if (!state.settings.sound) return;
    const c = ensure();
    const gain = scheduleBeepOn(c, c.destination, freq, startAt, durSec);
    if (analyser) gain.connect(analyser);
  }

  function tokenCode(tok){
    if (tok === " ") return null;
    if (PROSIGNS[tok]) return PROSIGNS[tok].code;
    if (MORSE_MAP[tok]) return MORSE_MAP[tok];
    return null;
  }

  // Pure timing math shared by live playback and WAV export: converts a
  // token list into {freq, start, dur} segments (all in seconds, start
  // relative to t=0) plus the total duration.
  function computeSchedule(tokens, opts){
    const wpmChar = opts.wpmChar || state.settings.wpm;
    const wpmEff = Math.min(opts.wpmEff || state.settings.effWpm, wpmChar);
    const freq = opts.freq || state.settings.freq;
    const unit = (1200/wpmChar)/1000;      // sec, element speed (always fast/correct shape)
    const gapUnit = (1200/wpmEff)/1000;    // sec, spacing speed (slow for beginners = Farnsworth)
    let t = 0.05;
    const segments = [];
    for (let i=0;i<tokens.length;i++){
      const tok = tokens[i];
      if (tok === " "){ t += gapUnit*7; continue; }
      const code = tokenCode(tok);
      if (!code) continue;
      for (let j=0;j<code.length;j++){
        const sym = code[j];
        const dur = sym === "." ? unit : unit*3;
        segments.push({freq, start:t, dur});
        t += dur;
        if (j < code.length-1) t += unit;
      }
      if (i < tokens.length-1 && tokens[i+1] !== " ") t += gapUnit*3;
    }
    return {segments, totalSec: t + 0.12};
  }

  // Plays an array of tokens (single letters, or prosign keys like "AR").
  // Returns a Promise resolving after the audio finishes.
  function playTokens(tokens, opts){
    const {segments, totalSec} = computeSchedule(tokens, opts||{});
    const c = ensure();
    const base = c.currentTime + 0.05;
    segments.forEach(seg => scheduleBeep(seg.freq, base + seg.start, seg.dur));
    return new Promise(res => setTimeout(res, totalSec*1000 + 40));
  }

  // Renders a token list to an in-memory WAV file via OfflineAudioContext
  // — a real, downloadable audio file of any message, at any speed.
  async function exportWav(tokens, opts){
    const {segments, totalSec} = computeSchedule(tokens, opts||{});
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(sampleRate*totalSec)), sampleRate);
    segments.forEach(seg => scheduleBeepOn(offline, offline.destination, seg.freq, seg.start, seg.dur));
    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  }

  function audioBufferToWavBlob(buffer){
    const numCh = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numCh*bytesPerSample;
    const dataSize = samples*blockAlign;
    const bufOut = new ArrayBuffer(44+dataSize);
    const view = new DataView(bufOut);
    const writeStr = (off,str)=>{ for (let i=0;i<str.length;i++) view.setUint8(off+i, str.charCodeAt(i)); };
    writeStr(0,"RIFF"); view.setUint32(4, 36+dataSize, true); writeStr(8,"WAVE");
    writeStr(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,numCh,true); view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*blockAlign,true); view.setUint16(32,blockAlign,true); view.setUint16(34,16,true);
    writeStr(36,"data"); view.setUint32(40,dataSize,true);
    let offset = 44;
    const chData = []; for (let ch=0; ch<numCh; ch++) chData.push(buffer.getChannelData(ch));
    for (let i=0;i<samples;i++){
      for (let ch=0; ch<numCh; ch++){
        const s = Math.max(-1, Math.min(1, chData[ch][i]));
        view.setInt16(offset, s<0 ? s*0x8000 : s*0x7FFF, true);
        offset += 2;
      }
    }
    return new Blob([bufOut], {type:"audio/wav"});
  }

  function startLiveTone(freq){
    if (!state.settings.sound) return;
    const c = ensure();
    liveOsc = c.createOscillator();
    liveGain = c.createGain();
    liveOsc.frequency.value = freq || state.settings.freq;
    liveOsc.type = "sine";
    liveGain.gain.setValueAtTime(0, c.currentTime);
    liveGain.gain.linearRampToValueAtTime(0.28, c.currentTime + 0.008);
    liveOsc.connect(liveGain).connect(c.destination);
    if (analyser) liveGain.connect(analyser);
    liveOsc.start();
  }

  function stopLiveTone(){
    if (!liveOsc) return;
    const c = ensure();
    const o = liveOsc, g = liveGain;
    liveOsc = null; liveGain = null;
    g.gain.setValueAtTime(g.gain.value, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.012);
    o.stop(c.currentTime + 0.02);
  }

  return { ensure, playTokens, exportWav, startLiveTone, stopLiveTone, getAnalyser, setNoise };
})();

/* ---------- Oscilloscope: draws whichever .scope-canvas elements are
   currently visible, reading live samples off the shared analyser. ---------- */
function initScopes(){
  function frame(){
    requestAnimationFrame(frame);
    const analyser = Audio_.getAnalyser();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#E8A33D";
    document.querySelectorAll(".scope-canvas").forEach(cv=>{
      if (cv.offsetParent === null) return;
      const g = cv.getContext("2d");
      const w = cv.width, h = cv.height;
      g.clearRect(0,0,w,h);
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      if (analyser){
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        const step = Math.max(1, Math.floor(data.length/w));
        for (let x=0, i=0; x<w; x++, i+=step){
          const y = (data[i]/255)*h;
          x===0 ? g.moveTo(x,y) : g.lineTo(x,y);
        }
      } else {
        g.moveTo(0,h/2); g.lineTo(w,h/2);
      }
      g.stroke();
    });
  }
  requestAnimationFrame(frame);
}

/* ---------- Confetti burst (achievements / level-ups) ---------- */
function burstConfetti(){
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx2 = canvas.getContext("2d");
  const colors = ["#E8A33D","#4CD97B","#E85D5D","#4CC9E8","#FFDD8A"];
  const particles = Array.from({length:70}, ()=>({
    x: canvas.width/2 + (Math.random()-0.5)*260,
    y: canvas.height*0.22,
    vx:(Math.random()-0.5)*11,
    vy: Math.random()*-7-2,
    g: 0.28+Math.random()*0.16,
    size: 3+Math.random()*4,
    color: colors[Math.floor(Math.random()*colors.length)],
    rot: Math.random()*Math.PI*2,
    vr:(Math.random()-0.5)*0.35
  }));
  let frameN = 0;
  (function step(){
    frameN++;
    ctx2.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx2.save();
      ctx2.translate(p.x, p.y); ctx2.rotate(p.rot);
      ctx2.globalAlpha = Math.max(0, 1-frameN/65);
      ctx2.fillStyle = p.color;
      ctx2.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.55);
      ctx2.restore();
    });
    if (frameN < 65) requestAnimationFrame(step);
    else ctx2.clearRect(0,0,canvas.width,canvas.height);
  })();
}

/* ---------------------------------------------------------------
   AMBIENT VISUALS — lamp loop (no audio-context / no gesture needed),
   starfield canvas, radar sweep, morse "rain"
   --------------------------------------------------------------- */
function scheduleVisualLoop(el, text, wpmChar){
  const unit = 1200/wpmChar;
  const tokens = text.toUpperCase().split("");
  let timer = null;
  function step(i){
    if (document.hidden){ timer = setTimeout(()=>step(i), 400); return; }
    if (i >= tokens.length){ timer = setTimeout(()=>step(0), unit*10); return; }
    const tok = tokens[i];
    if (tok === " "){ timer = setTimeout(()=>step(i+1), unit*7); return; }
    const code = MORSE_MAP[tok];
    if (!code){ timer = setTimeout(()=>step(i+1), unit); return; }
    let j = 0;
    function playSym(){
      if (j >= code.length){ timer = setTimeout(()=>step(i+1), unit*2); return; }
      const sym = code[j];
      const dur = sym === "." ? unit : unit*3;
      el.classList.add("lit");
      timer = setTimeout(()=>{
        el.classList.remove("lit");
        j++;
        timer = setTimeout(playSym, unit);
      }, dur);
    }
    playSym();
  }
  step(0);
  return ()=> clearTimeout(timer);
}

function initStarfield(){
  const canvas = document.getElementById("stars");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let stars = [];
  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const n = Math.floor((canvas.width*canvas.height)/9000);
    stars = Array.from({length:n}, ()=>({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height,
      r: Math.random()*1.3+0.2,
      s: Math.random()*0.6+0.15,
      phase: Math.random()*Math.PI*2
    }));
  }
  let t = 0;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#E8A33D";
    stars.forEach(st=>{
      const tw = 0.4 + 0.6*Math.abs(Math.sin(t*st.s + st.phase));
      ctx.globalAlpha = tw*0.7;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI*2);
      ctx.fill();
      st.y += st.s*0.06;
      if (st.y > canvas.height) st.y = 0;
    });
    ctx.globalAlpha = 1;
    t += 0.02;
    requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}

function initMorseRain(){
  const wrap = document.getElementById("morse-rain");
  if (!wrap) return;
  const cols = Math.max(6, Math.floor(window.innerWidth/140));
  for (let i=0;i<cols;i++){
    const col = document.createElement("div");
    col.className = "rain-col";
    const chars = KOCH_ORDER.filter(c=>/[A-Z0-9]/.test(c));
    let txt = "";
    for (let j=0;j<28;j++){
      const ch = chars[Math.floor(Math.random()*chars.length)];
      txt += MORSE_MAP[ch] + "\n";
    }
    col.textContent = txt;
    col.style.left = (Math.random()*96)+"%";
    col.style.animationDuration = (14 + Math.random()*16)+"s";
    col.style.animationDelay = (-Math.random()*20)+"s";
    wrap.appendChild(col);
  }
}

/* ---------------------------------------------------------------
   NAV / TAB SWITCHING
   --------------------------------------------------------------- */
function initNav(){
  document.querySelectorAll("nav a[data-tab]").forEach(a=>{
    a.addEventListener("click", ()=> showTab(a.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach(a=>{
    a.addEventListener("click", ()=> showTab(a.dataset.goto));
  });
}

function showTab(id){
  document.querySelectorAll("nav a[data-tab]").forEach(a=> a.classList.toggle("active", a.dataset.tab===id));
  document.querySelectorAll(".tabpage").forEach(p=> p.classList.toggle("active", p.id === "tab-"+id));
  window.scrollTo({top:0, behavior:"instant" in window ? "instant" : "auto"});
  const renderers = {
    dashboard: renderDashboard, curriculum: renderCurriculum, learn: renderLearn,
    copy: renderCopy, send: renderSend, speed: renderSpeed, translator: renderTranslator,
    reference: renderReference, achievements: renderAchievements, settings: renderSettings
  };
  if (renderers[id]) renderers[id]();
}

/* ---------------------------------------------------------------
   RANDOM HELPERS
   --------------------------------------------------------------- */
const rng = makeRng(Date.now() & 0xffffffff);
function pickRandom(arr){ return arr[Math.floor(rng()*arr.length)]; }

function weightedPick(chars){
  const weights = chars.map(c=>{
    const acc = accuracyOf(c);
    return acc===null ? 3 : 1 + (1-(acc/100))*5;
  });
  const total = weights.reduce((a,b)=>a+b,0);
  let r = rng()*total;
  for (let i=0;i<chars.length;i++){ r -= weights[i]; if (r<=0) return chars[i]; }
  return chars[chars.length-1];
}

function wordsForUnlocked(){
  const set = new Set(unlockedChars());
  return WORD_BANK.filter(w => w.split("").every(ch=> set.has(ch)));
}

function sentencesForUnlocked(){
  const set = new Set(unlockedChars());
  return SENTENCES.filter(s => s.replace(/[^A-Z]/g,"").split("").every(ch=> set.has(ch)));
}

/* ---------------------------------------------------------------
   TODAY'S SIGNAL — a daily-seeded challenge word. Same word for
   everyone on the same calendar date (deterministic hash of the
   date string), different every day — bragging-rights variety on
   top of the structured curriculum.
   --------------------------------------------------------------- */
function hashStr(s){
  let h = 0;
  for (let i=0;i<s.length;i++) h = (Math.imul(h,31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function todaysChallengeWord(){
  const r = makeRng(hashStr("morse-academy-"+todayStr()));
  return WORD_BANK[Math.floor(r()*WORD_BANK.length)];
}

let dailyTarget = null;

async function playDailyChallenge(){
  dailyTarget = todaysChallengeWord();
  const btn = document.getElementById("dailyPlayBtn");
  btn.disabled = true;
  document.getElementById("dailyStatus").textContent = "Listening…";
  document.getElementById("dailyInput").style.display = "none";
  document.getElementById("dailySubmitBtn").style.display = "none";
  await Audio_.playTokens(dailyTarget.split(""), {});
  btn.disabled = false;
  document.getElementById("dailyStatus").textContent = "Type what you heard:";
  const input = document.getElementById("dailyInput");
  input.style.display = "inline-block";
  input.value = "";
  input.focus();
  document.getElementById("dailySubmitBtn").style.display = "inline-block";
}

function submitDailyChallenge(){
  if (!dailyTarget) return;
  const guess = document.getElementById("dailyInput").value.trim().toUpperCase();
  const ok = guess === dailyTarget;
  const today = todayStr();
  const already = state.dailyChallengeDates.includes(today);
  document.getElementById("dailyStatus").innerHTML = ok
    ? `<span class="ok">Correct! It was "${dailyTarget}"${already?" (already logged today)":""}</span>`
    : `<span class="bad">Not quite — it was "${dailyTarget}"</span>`;
  if (!already){
    state.dailyChallengeDates.push(today);
    if (ok) addXp(40);
    touchStreak();
    logSession({mode:"Daily Signal", targets:1, correct:ok?1:0, pct: ok?100:0});
    saveState();
    checkAchievements();
    renderDashboard();
  }
}

/* ---------------------------------------------------------------
   DASHBOARD
   --------------------------------------------------------------- */
function currentDayNumber(){
  for (const d of CURRICULUM){ if (!state.completedDays.includes(d.day)) return d.day; }
  return 30;
}

function isDayComplete(day){ return state.completedDays.includes(day); }

function renderDashboard(){
  const lvl = levelForXp(state.xp);
  document.getElementById("heroLevel").textContent = `Lv.${lvl.lvl} · ${lvl.title}`;
  const nextXp = lvl.next ? lvl.next.xp : lvl.xp;
  const span = nextXp - lvl.xp || 1;
  const pct = lvl.next ? Math.min(100, Math.round(((state.xp-lvl.xp)/span)*100)) : 100;
  document.getElementById("xpFill").style.width = pct+"%";
  document.getElementById("xpLabel").innerHTML = `<b>${state.xp} XP</b> ${lvl.next ? `— ${lvl.next.xp - state.xp} to ${lvl.next.title}` : "— max level"}`;

  document.getElementById("statStreak").textContent = state.streak;
  document.getElementById("statChars").textContent = countUnlocked(state) + "/40";
  document.getElementById("statAcc").textContent = overallAccuracy()+"%";
  document.getElementById("statDay").textContent = currentDayNumber();
  document.getElementById("statSessions").textContent = state.totalSessions;

  // phase cards
  const curDay = currentDayNumber();
  const curPhase = CURRICULUM.find(d=>d.day===curDay)?.phase || 4;
  document.getElementById("phaseCards").innerHTML = PHASES.map(p=>{
    const daysInPhase = CURRICULUM.filter(d=>d.phase===p.id);
    const done = daysInPhase.filter(d=>isDayComplete(d.day)).length;
    const pctP = Math.round((done/daysInPhase.length)*100);
    return `<div class="ph-card ${p.id===curPhase?"current":""}" style="--ph-c:${p.color}" data-goto-day="${daysInPhase[0].day}">
      <div class="ph-num">Phase ${p.id}</div>
      <div class="ph-name">${p.name}</div>
      <div class="ph-days">${p.range}</div>
      <div class="ph-desc">${p.desc}</div>
      <div class="ph-prog"><i style="width:${pctP}%"></i></div>
    </div>`;
  }).join("");
  document.querySelectorAll("#phaseCards .ph-card").forEach(el=>{
    el.addEventListener("click", ()=>{ showTab("curriculum"); setTimeout(()=>openDay(Number(el.dataset.gotoDay)),50); });
  });

  renderCalendar("miniCal", true);
  renderDayPanel(curDay, "todayPanel");

  const doneToday = state.dailyChallengeDates.includes(todayStr());
  document.getElementById("dailyNote").textContent = doneToday
    ? `Logged today (${state.dailyChallengeDates.length} total) — replay for practice, no bonus XP.`
    : "A fresh word, seeded by today's date. First correct copy each day earns bonus XP.";
}

function overallAccuracy(){
  let a=0,t=0;
  Object.values(state.charStats).forEach(s=>{ a+=s.correct; t+=s.attempts; });
  return t ? Math.round((a/t)*100) : 0;
}

function renderCalendar(containerId, compact){
  const el = document.getElementById(containerId);
  if (!el) return;
  const curDay = currentDayNumber();
  el.innerHTML = CURRICULUM.map(d=>{
    let cls = `cal-day p${d.phase}`;
    if (isDayComplete(d.day)) cls += " done";
    else if (d.day===curDay) cls += " current";
    else if (d.day > curDay) cls += " locked";
    return `<div class="${cls}" data-day="${d.day}" title="${escapeHtml(d.title)}">
      <span>${d.day}</span>${compact?"":`<span class="cd-tiny">${d.newChars.length? d.newChars.join(""):"—"}</span>`}
    </div>`;
  }).join("");
  el.querySelectorAll(".cal-day").forEach(c=>{
    c.addEventListener("click", ()=>{
      const day = Number(c.dataset.day);
      if (containerId === "miniCal"){ showTab("curriculum"); setTimeout(()=>openDay(day),50); }
      else openDay(day);
    });
  });
}

/* ---------------------------------------------------------------
   CURRICULUM TAB
   --------------------------------------------------------------- */
let openDayNum = null;

function renderCurriculum(){
  renderCalendar("fullCal", false);
  const target = openDayNum || currentDayNumber();
  openDay(target);
}

function openDay(day){
  openDayNum = day;
  renderCalendar("fullCal", false);
  renderDayPanel(day, "dayPanel");
}

function renderDayPanel(day, containerId){
  const el = document.getElementById(containerId);
  if (!el) return;
  const d = CURRICULUM.find(x=>x.day===day);
  if (!d){ el.innerHTML=""; return; }
  const phase = PHASES.find(p=>p.id===d.phase);
  const doneCount = d.tasks.filter((_,i)=> state.taskChecks[`${d.day}-${i}`]).length;
  el.innerHTML = `
    <div class="card">
      <div class="dp-head">
        <div>
          <div class="sh-tag" style="color:${phase.color}">PHASE ${d.phase} · ${phase.name.toUpperCase()}</div>
          <div class="dp-title">Day ${d.day} — ${escapeHtml(d.title)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="fc-stats">Goal: ${d.goalWpm} WPM char / ${d.goalEff} WPM effective</span>
          ${isDayComplete(d.day)?'<span class="chip small">✓ COMPLETE</span>':''}
        </div>
      </div>
      ${d.newChars.length ? `<div class="dp-newchars">${d.newChars.map(c=>`<span class="chip">${c==="."||c===","||c==="?"||c==="/"?c:c} <small style="color:var(--tm)">${MORSE_MAP[c]}</small></span>`).join("")}</div>` : ""}
      <div class="tasklist">
        ${d.tasks.map((t,i)=>{
          const key = `${d.day}-${i}`;
          const done = !!state.taskChecks[key];
          return `<div class="task ${done?"done":""}" data-key="${key}" data-day="${d.day}">
            <span class="task-check">${done?"✓":""}</span>
            <span class="task-txt">${escapeHtml(t)}</span>
          </div>`;
        }).join("")}
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <div class="fc-stats">${doneCount}/${d.tasks.length} tasks checked</div>
        <button class="btn small" data-jump="learn">Go to Learn →</button>
        <button class="btn small" data-jump="copy">Go to Copy Drill →</button>
        ${d.day>=8 ? '<button class="btn small" data-jump="send">Go to Send Drill →</button>' : ''}
      </div>
    </div>`;
  el.querySelectorAll(".task").forEach(t=>{
    t.addEventListener("click", ()=>{
      const key = t.dataset.key;
      state.taskChecks[key] = !state.taskChecks[key];
      const dayNum = Number(t.dataset.day);
      const dObj = CURRICULUM.find(x=>x.day===dayNum);
      const allDone = dObj.tasks.every((_,i)=> state.taskChecks[`${dayNum}-${i}`]);
      if (allDone && !state.completedDays.includes(dayNum)){
        state.completedDays.push(dayNum);
        addXp(50);
        toast("Day Complete!", `Day ${dayNum} — ${dObj.title}`, "green");
      } else if (!allDone && state.completedDays.includes(dayNum)){
        state.completedDays = state.completedDays.filter(x=>x!==dayNum);
      }
      saveState();
      checkAchievements();
      renderDayPanel(dayNum, containerId);
      renderCalendar(containerId==="dayPanel" ? "fullCal" : "miniCal", containerId!=="dayPanel");
    });
  });
  el.querySelectorAll("[data-jump]").forEach(b=> b.addEventListener("click", ()=> showTab(b.dataset.jump)));
}

/* ---------------------------------------------------------------
   LEARN TAB (Koch flashcards)
   --------------------------------------------------------------- */
let learnChar = null;

function renderLearn(){
  const grid = document.getElementById("learnGrid");
  grid.innerHTML = KOCH_ORDER.map((c,i)=>{
    const unlocked = state.charStats[c].unlocked;
    const acc = accuracyOf(c);
    const col = acc===null ? "rgba(255,255,255,.15)" : acc>=85 ? "var(--green)" : acc>=60 ? "var(--amber)" : "var(--red)";
    return `<div class="char-tile ${unlocked?"":"locked"} ${learnChar===c?"active":""}" data-char="${c}">
      <div>${c}</div>
      <div class="ct-bar"><i style="width:${acc??0}%;background:${col}"></i></div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".char-tile:not(.locked)").forEach(t=>{
    t.addEventListener("click", ()=> setLearnChar(t.dataset.char));
  });

  const nextIdx = KOCH_ORDER.findIndex(c=>!state.charStats[c].unlocked);
  const nextBtn = document.getElementById("unlockNextBtn");
  if (nextIdx === -1){
    nextBtn.disabled = true; nextBtn.textContent = "All 40 Characters Unlocked";
  } else {
    nextBtn.disabled = false;
    nextBtn.textContent = `Unlock Next: "${KOCH_ORDER[nextIdx]}"`;
  }

  if (!learnChar || !state.charStats[learnChar].unlocked) setLearnChar(unlockedChars()[0] || "K");
  else renderFlashcard();
}

function setLearnChar(c){
  learnChar = c;
  renderLearn();
}

function renderFlashcard(){
  const c = learnChar;
  if (!c) return;
  document.getElementById("fcChar").textContent = c;
  document.getElementById("fcCode").textContent = "";
  const st = state.charStats[c];
  const acc = accuracyOf(c);
  document.getElementById("fcStats").textContent = st.attempts ? `${st.attempts} reps · ${acc}% accuracy` : "No drill data yet";

  const mirrorPairs = computeMirrorPairs();
  const mp = mirrorPairs.find(p=>p[0]===c || p[2]===c);
  const groups = computeLengthGroups();
  const code = MORSE_MAP[c];
  const note = `${code.length} element${code.length>1?"s":""}: ` + code.split("").map(s=> s==="." ? "dot":"dash").join(" – ");
  let extra = "";
  if (mp){
    const partner = mp[0]===c ? mp[2] : mp[0];
    extra = ` This is the mirror image of <b>${partner}</b> — reverse the rhythm and you get ${partner}.`;
  } else if (/[0-9]/.test(c)){
    const n = Number(c==="0" ? 10 : c);
    extra = n<=5 ? ` Number logic: ${c} dot${c==="1"?"":"s"} then dashes to fill 5 — digits 1–5 are just "N dots, rest dashes."`
                 : ` Number logic: dashes = digit minus 5, rest dots — digits 6–0 mirror 1–5 with dots and dashes swapped.`;
  }
  document.getElementById("fcMnemonic").innerHTML = `${note}.${extra}`;
}

function playLearnChar(){
  if (!learnChar) return;
  document.getElementById("fcCode").textContent = MORSE_MAP[learnChar];
  Audio_.playTokens([learnChar], {});
}

function unlockNextChar(){
  const nextIdx = KOCH_ORDER.findIndex(c=>!state.charStats[c].unlocked);
  if (nextIdx === -1) return;
  const ch = KOCH_ORDER[nextIdx];
  state.charStats[ch].unlocked = true;
  addXp(25);
  saveState();
  toast("Character Unlocked", `"${ch}" (${MORSE_MAP[ch]}) is now in your drill set.`, "green");
  checkAchievements();
  setLearnChar(ch);
}

/* ---------------------------------------------------------------
   COPY DRILL
   --------------------------------------------------------------- */
const CopyDrill = {
  running:false, mode:"char", target:"", history:[], correct:0, incorrect:0,
  totalTargets:0, streak:0, startedAt:0, qsoIdx:0, timerEnd:null, tickHandle:null,

  start(mode){
    this.running = true; this.mode = mode;
    this.history = []; this.correct=0; this.incorrect=0; this.totalTargets=0; this.streak=0;
    this.qsoIdx = 0;
    this.startedAt = performance.now();
    this.timerEnd = mode==="final" ? performance.now()+5*60*1000 : null;
    document.getElementById("copyStart").style.display = "none";
    document.getElementById("copyStage").style.display = "flex";
    document.getElementById("copyInput").value = "";
    document.getElementById("copyInput").focus();
    this.renderTally();
    if (this.timerEnd) this.tick();
    this.nextTarget();
  },

  tick(){
    if (!this.running || !this.timerEnd) return;
    const left = Math.max(0, this.timerEnd - performance.now());
    document.getElementById("drillTimer").textContent = left>0 ? `${Math.ceil(left/1000)}s` : "TIME";
    if (left<=0){ this.finish(); return; }
    this.tickHandle = setTimeout(()=>this.tick(), 250);
  },

  pickTarget(){
    const unlocked = unlockedChars();
    if (this.mode==="char") return pickRandom(unlocked.length?unlocked:["K"]);
    if (this.mode==="weak") return weightedPick(unlocked.length?unlocked:["K"]);
    if (this.mode==="final") return pickRandom(KOCH_ORDER);
    if (this.mode==="word"){
      const pool = wordsForUnlocked();
      if (pool.length) return pickRandom(pool);
      return Array.from({length:3},()=>pickRandom(unlocked.length?unlocked:["K"])).join("");
    }
    if (this.mode==="sentence"){
      const pool = sentencesForUnlocked();
      return pool.length ? pickRandom(pool) : pickRandom(unlockedChars());
    }
    if (this.mode==="qso"){
      const line = QSO_SCRIPT[this.qsoIdx % QSO_SCRIPT.length];
      this.qsoIdx++;
      return line;
    }
    return pickRandom(unlocked);
  },

  async nextTarget(){
    if (!this.running) return;
    this.target = this.pickTarget();
    document.getElementById("copyReadout").innerHTML = `<span class="pending">${"•".repeat(Math.min(this.target.length,24))}</span>`;
    document.getElementById("copyInput").value = "";
    await this.replay();
  },

  async replay(){
    if (!this.running || !this.target) return;
    const btn = document.getElementById("copyReplayBtn");
    if (btn) btn.disabled = true;
    document.getElementById("copyHint").textContent = "Listening…";
    await Audio_.playTokens(this.target.split(""), {});
    document.getElementById("copyHint").textContent = this.mode==="char" ? "Type the character you heard" : "Type what you heard, then press Enter";
    if (btn) btn.disabled = false;
  },

  submit(raw){
    if (!this.running) return;
    const guess = raw.trim().toUpperCase();
    if (!guess) return;
    const target = this.target;
    let allCorrect = guess === target;
    const len = Math.max(guess.length, target.length);
    for (let i=0;i<target.length;i++){
      const tch = target[i];
      if (!/[A-Z0-9.,?\/]/i.test(tch)) continue;
      const ok = guess[i] === tch;
      if (state.charStats[tch]) recordAttempt(tch, ok);
    }
    this.totalTargets++;
    if (allCorrect){
      this.correct++; this.streak++;
      addXp(10 + target.length*2);
      state.totalCorrectChars += target.length;
    } else {
      this.incorrect++; this.streak=0;
    }
    this.history.unshift({target, guess, ok:allCorrect});
    this.history = this.history.slice(0,10);
    this.renderHistory();
    this.renderTally();
    saveState();
    if (this.mode==="final" && this.timerEnd && performance.now()>=this.timerEnd){ this.finish(); return; }
    setTimeout(()=> this.nextTarget(), 550);
  },

  renderHistory(){
    document.getElementById("copyReadout").innerHTML = this.history.slice(0,8).reverse().map(h=>
      `<span class="${h.ok?"ok":"bad"}" title="heard: ${escapeHtml(h.target)}">${escapeHtml(h.guess||"—")}</span>`
    ).join(" ");
  },

  renderTally(){
    document.getElementById("dtCorrect").textContent = this.correct;
    document.getElementById("dtIncorrect").textContent = this.incorrect;
    document.getElementById("dtStreak").textContent = this.streak;
    const pct = this.totalTargets ? Math.round((this.correct/this.totalTargets)*100) : 0;
    document.getElementById("dtAcc").textContent = pct+"%";
  },

  finish(){
    this.running = false;
    clearTimeout(this.tickHandle);
    const elapsed = performance.now() - this.startedAt;
    state.totalSessions++;
    state.totalPracticeMs += elapsed;
    const pct = this.totalTargets ? Math.round((this.correct/this.totalTargets)*100) : 0;
    if (this.totalTargets>=20) state.bestAccuracyStreak = Math.max(state.bestAccuracyStreak, pct);
    if (pct>=90 && this.totalTargets>=10) state.pbEffWpm = Math.max(state.pbEffWpm, state.settings.effWpm);
    touchStreak();
    logSession({mode:"Copy · "+this.mode, targets:this.totalTargets, correct:this.correct, pct});
    saveState();
    checkAchievements();
    document.getElementById("copyStage").style.display = "none";
    document.getElementById("copyStart").style.display = "flex";
    document.getElementById("copySummary").innerHTML =
      `<div class="card"><b style="color:var(--amber);font-family:'Cinzel',serif">Session complete</b><br>
       ${this.totalTargets} targets · ${this.correct} correct · <b>${pct}% accuracy</b> · +${(this.correct*10)} XP<br>
       <span style="color:var(--tm);font-size:11px">Practiced ${(elapsed/1000).toFixed(0)}s. ${pct>=85?"Nice copy — keep it up!":"Keep drilling — accuracy climbs fast with repetition."}</span></div>`;
    toast("Drill Complete", `${pct}% accuracy over ${this.totalTargets} reps.`, pct>=85?"green":undefined);
    renderDashboard();
  },

  stop(){
    if (!this.running) return;
    this.finish();
  }
};

function renderCopy(){
  document.getElementById("copyStage").style.display = "none";
  document.getElementById("copyStart").style.display = "flex";
  document.getElementById("copySummary").innerHTML = "";
  document.getElementById("drillTimer").textContent = "";
  const unlocked = unlockedChars();
  document.getElementById("copyUnlockedCount").textContent = `${unlocked.length} characters unlocked`;
}

/* ---------------------------------------------------------------
   SEND DRILL
   --------------------------------------------------------------- */
const SendDrill = {
  active:false, target:"", buffer:"", decoded:"", downAt:0, lastUpAt:null,
  watchdog:null, ditDurs:[], dahDurs:[], sent:0, correct:0,

  reverseFor(code){
    if (REVERSE_MAP[code]) return REVERSE_MAP[code];
    for (const [k,v] of Object.entries(PROSIGNS)) if (v.code===code) return k;
    return "?";
  },

  newTarget(){
    const unlocked = unlockedChars();
    this.target = pickRandom(unlocked.length?unlocked:["K"]);
    this.buffer = ""; this.decoded = "";
    document.getElementById("sendTarget").textContent = this.target;
    document.getElementById("sendReadout").innerHTML = `<span class="pending">Ready…</span>`;
  },

  down(){
    if (!this.active || this.downAt) return;
    const now = performance.now();
    if (this.lastUpAt != null){
      const gap = now - this.lastUpAt;
      const unit = 1200/state.settings.sendWpm;
      if (gap > unit*5){ this.finalizeLetter(); this.decoded += " "; }
      else if (gap > unit*1.8){ this.finalizeLetter(); }
    }
    this.downAt = now;
    clearTimeout(this.watchdog);
    Audio_.startLiveTone(state.settings.freq);
    document.getElementById("sendKey").classList.add("down");
  },

  up(){
    if (!this.active || !this.downAt) return;
    const now = performance.now();
    const dur = now - this.downAt;
    const unit = 1200/state.settings.sendWpm;
    const sym = dur < unit*2 ? "." : "-";
    if (sym===".") this.ditDurs.push(dur); else this.dahDurs.push(dur);
    this.buffer += sym;
    this.downAt = 0;
    this.lastUpAt = now;
    Audio_.stopLiveTone();
    document.getElementById("sendKey").classList.remove("down");
    document.getElementById("sendReadout").innerHTML = `<span class="pending">${this.decoded}${this.buffer.replace(/\./g,"·")}</span>`;
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(()=>{ this.finalizeLetter(); this.evaluate(); }, unit*6);
  },

  finalizeLetter(){
    if (!this.buffer) return;
    this.decoded += this.reverseFor(this.buffer);
    this.buffer = "";
  },

  evaluate(){
    const guess = this.decoded.trim();
    if (!guess) return;
    const ok = guess === this.target;
    this.sent++;
    if (ok) this.correct++;
    const score = this.timingScore();
    state.bestTimingScore = Math.max(state.bestTimingScore, score);
    document.getElementById("sendReadout").innerHTML = `<span class="${ok?"ok":"bad"}">${escapeHtml(guess)}</span> <span style="color:var(--tm);font-size:12px">(target: ${escapeHtml(this.target)})</span>`;
    document.getElementById("sendScore").textContent = score;
    document.getElementById("sendTally").textContent = `${this.correct}/${this.sent}`;
    if (ok) addXp(15);
    saveState();
    checkAchievements();
    setTimeout(()=> this.newTarget(), 900);
  },

  timingScore(){
    const cv = arr=>{
      if (arr.length<2) return 0;
      const m = arr.reduce((a,b)=>a+b,0)/arr.length;
      const sd = Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length);
      return m ? sd/m : 0;
    };
    const c = (cv(this.ditDurs)+cv(this.dahDurs))/2;
    return Math.max(0, Math.min(100, Math.round(100-c*160)));
  },

  start(){
    this.active = true; this.sent=0; this.correct=0; this.ditDurs=[]; this.dahDurs=[]; this.lastUpAt=null;
    document.getElementById("sendStart").style.display="none";
    document.getElementById("sendStage").style.display="flex";
    this.newTarget();
  },
  stop(){
    this.active = false;
    state.totalDits += this.ditDurs.length;
    state.totalDahs += this.dahDurs.length;
    state.totalSessions++;
    touchStreak();
    const pct = this.sent ? Math.round((this.correct/this.sent)*100) : 0;
    logSession({mode:"Send Drill", targets:this.sent, correct:this.correct, pct});
    saveState();
    document.getElementById("sendStage").style.display="none";
    document.getElementById("sendStart").style.display="flex";
    toast("Send Drill Complete", `${this.correct}/${this.sent} correct · best timing score ${state.bestTimingScore}`, "green");
    renderDashboard();
  }
};

function renderSend(){
  document.getElementById("sendStage").style.display = "none";
  document.getElementById("sendStart").style.display = "flex";
}

/* ---------------------------------------------------------------
   SPEED BUILDER
   --------------------------------------------------------------- */
const SpeedBuilder = {
  running:false, eff:5, rounds:[],
  start(){
    this.running = true;
    this.eff = state.settings.effWpm;
    this.rounds = [];
    document.getElementById("speedStart").style.display="none";
    document.getElementById("speedStage").style.display="flex";
    this.runRound();
  },
  async runRound(){
    if (!this.running) return;
    document.getElementById("speedWpm").textContent = this.eff;
    const unlocked = unlockedChars();
    const seq = Array.from({length:10}, ()=> pickRandom(unlocked.length?unlocked:["K"]));
    let correct = 0;
    document.getElementById("speedReadout").textContent = "Listen…";
    for (const ch of seq){
      await Audio_.playTokens([ch], {wpmEff:this.eff});
      const guess = await waitForKey();
      if (guess === ch) correct++;
      recordAttempt(ch, guess===ch);
    }
    const pct = Math.round((correct/seq.length)*100);
    this.rounds.push({eff:this.eff, pct});
    this.renderSparkline();
    saveState();
    if (pct >= 90 && this.eff < state.settings.wpm){
      toast("Round Passed", `${pct}% at ${this.eff} WPM — speeding up!`, "green");
      this.eff = Math.min(state.settings.wpm, this.eff+2);
      state.pbEffWpm = Math.max(state.pbEffWpm, this.rounds[this.rounds.length-1].eff);
      checkAchievements();
      setTimeout(()=>this.runRound(), 700);
    } else {
      this.finish(pct);
    }
  },
  renderSparkline(){
    const w=280,h=60,pad=6;
    const pts = this.rounds.map((r,i)=>{
      const x = pad + (i/(Math.max(1,this.rounds.length-1)))*(w-pad*2);
      const y = h-pad - (r.pct/100)*(h-pad*2);
      return `${x},${y}`;
    }).join(" ");
    document.getElementById("speedSpark").innerHTML =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <polyline points="${pts}" fill="none" stroke="#E8A33D" stroke-width="2"/>
        ${this.rounds.map((r,i)=>{
          const x = pad + (i/(Math.max(1,this.rounds.length-1)))*(w-pad*2);
          const y = h-pad - (r.pct/100)*(h-pad*2);
          return `<circle cx="${x}" cy="${y}" r="3" fill="${r.pct>=90?'#4CD97B':'#E85D5D'}"/>`;
        }).join("")}
      </svg>`;
  },
  finish(pct){
    this.running = false;
    state.totalSessions++;
    touchStreak();
    logSession({mode:"Speed Builder", targets:this.rounds.length*10, correct:null, pct, wpm:this.eff});
    saveState();
    checkAchievements();
    document.getElementById("speedReadout").innerHTML =
      `Session ended at <b style="color:var(--amber)">${this.eff} WPM</b> (${pct}% — below the 90% pass line). Personal best: <b style="color:var(--green)">${state.pbEffWpm} WPM</b>.`;
    document.getElementById("speedStop").style.display = "none";
    renderDashboard();
  },
  stop(){
    if (this.running) this.finish(this.rounds.length ? this.rounds[this.rounds.length-1].pct : 0);
  }
};

function waitForKey(){
  return new Promise(resolve=>{
    function handler(e){
      if (e.key.length!==1) return;
      document.removeEventListener("keydown", handler);
      resolve(e.key.toUpperCase());
    }
    document.addEventListener("keydown", handler);
  });
}

function renderSpeed(){
  document.getElementById("speedStage").style.display = "none";
  document.getElementById("speedStart").style.display = "flex";
  document.getElementById("speedStop").style.display = "inline-block";
  document.getElementById("pbWpm").textContent = state.pbEffWpm;
}

/* ---------------------------------------------------------------
   TRANSLATOR — free-form text <-> Morse, plus real WAV export.
   Not a curriculum drill: a utility for sending your own messages.
   --------------------------------------------------------------- */
function textToMorseString(text){
  return text.toUpperCase().split(" ").map(word=>
    word.split("").map(ch=> MORSE_MAP[ch]).filter(Boolean).join(" ")
  ).filter(w=>w.length).join("  /  ");
}

function tokenizeText(text){
  return text.toUpperCase().split("").filter(ch=> ch===" " || MORSE_MAP[ch]);
}

function morseToText(str){
  return str.trim().split(/\s*\/\s*|\s{2,}/).filter(w=>w.trim()).map(word=>
    word.trim().split(/\s+/).map(code=> REVERSE_MAP[code] || "□").join("")
  ).join(" ");
}

function renderTranslator(){
  syncTranslatorEncode();
  document.getElementById("xlateMorseIn").value = "";
  document.getElementById("xlateTextOut").textContent = "";
}

function syncTranslatorEncode(){
  const text = document.getElementById("xlateText").value;
  document.getElementById("xlateMorseOut").textContent = text.trim() ? textToMorseString(text) : "";
}

function wireTranslator(){
  const textEl = document.getElementById("xlateText");
  textEl.addEventListener("input", syncTranslatorEncode);

  document.getElementById("xlatePlayBtn").addEventListener("click", async ()=>{
    const tokens = tokenizeText(textEl.value);
    if (!tokens.length) return;
    await Audio_.playTokens(tokens, {});
  });

  document.getElementById("xlateWavBtn").addEventListener("click", async ()=>{
    const tokens = tokenizeText(textEl.value);
    if (!tokens.length) return;
    const btn = document.getElementById("xlateWavBtn");
    btn.disabled = true; btn.textContent = "Rendering…";
    try{
      const blob = await Audio_.exportWav(tokens, {});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = textEl.value.trim().slice(0,24).replace(/[^A-Za-z0-9]+/g,"-").toLowerCase() || "message";
      a.href = url; a.download = `morse-${slug}.wav`; a.click();
      URL.revokeObjectURL(url);
      toast("WAV Exported", "Your Morse message audio file downloaded.", "green");
    } catch(e){
      toast("Export Failed", "Could not render audio in this browser.");
    }
    btn.disabled = false; btn.textContent = "⬇ Export as .WAV";
  });

  const morseIn = document.getElementById("xlateMorseIn");
  morseIn.addEventListener("input", ()=>{
    document.getElementById("xlateTextOut").textContent = morseIn.value.trim() ? morseToText(morseIn.value) : "";
  });
  document.getElementById("xlateDecodePlayBtn").addEventListener("click", async ()=>{
    const text = morseToText(morseIn.value);
    const tokens = tokenizeText(text);
    if (!tokens.length) return;
    await Audio_.playTokens(tokens, {});
  });
}

/* ---------------------------------------------------------------
   REFERENCE TAB
   --------------------------------------------------------------- */
function renderReference(){
  const order = "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z 0 1 2 3 4 5 6 7 8 9 . , ? ' ! / ( ) & : ; = + - _ \" $ @".split(" ");
  document.getElementById("refGrid").innerHTML = order.map(c=>
    `<div class="ref-cell"><div class="rc-char">${c}</div><div class="rc-code">${MORSE_MAP[c]}</div></div>`
  ).join("");
  document.querySelectorAll("#refGrid .ref-cell").forEach((el,i)=>{
    el.addEventListener("click", ()=> Audio_.playTokens([order[i]], {}));
  });

  document.getElementById("mirrorTable").innerHTML = computeMirrorPairs().map(([a,ca,b,cb])=>
    `<tr><td>${a} ${ca}</td><td>mirrors</td><td>${b} ${cb}</td></tr>`
  ).join("");

  const groups = computeLengthGroups();
  document.getElementById("lengthGroups").innerHTML = Object.keys(groups).sort().map(len=>
    `<div class="res-item"><b>${len}-element letters</b><p>${groups[len].map(c=>`${c} <span style="color:var(--green);font-family:'JetBrains Mono',monospace">${MORSE_MAP[c]}</span>`).join("  ·  ")}</p></div>`
  ).join("");

  document.getElementById("prosignTable").innerHTML = Object.entries(PROSIGNS).map(([k,v])=>
    `<tr><td>${k} <span style="color:var(--tm);font-family:'JetBrains Mono',monospace">${v.code}</span></td><td colspan="2">${v.meaning}</td></tr>`
  ).join("");

  document.getElementById("qcodeTable").innerHTML = QCODES.map(([k,v])=>
    `<tr><td>${k}</td><td>${v}</td></tr>`
  ).join("");
}

/* ---------------------------------------------------------------
   ACHIEVEMENTS TAB
   --------------------------------------------------------------- */
function renderAchievements(){
  document.getElementById("badgeGrid").innerHTML = ACHIEVEMENTS.map(a=>{
    const un = state.achievements.includes(a.id);
    return `<div class="badge ${un?"unlocked":""}">
      <div class="b-icon">${a.icon}</div>
      <div class="b-name">${a.name}</div>
      <div class="b-desc">${a.desc}</div>
    </div>`;
  }).join("");

  const mins = Math.round(state.totalPracticeMs/60000);
  document.getElementById("tallyGrid").innerHTML = [
    [state.totalSessions, "Sessions"],
    [state.totalCorrectChars, "Chars Copied"],
    [state.totalDits, "Dits Sent"],
    [state.totalDahs, "Dahs Sent"],
    [mins, "Minutes Practiced"],
    [state.streak, "Day Streak"],
    [countUnlocked(state), "Chars Unlocked"],
    [state.pbEffWpm, "Best Eff. WPM"]
  ].map(([n,l])=>`<div class="tally-card"><div class="tc-num">${n}</div><div class="tc-lbl">${l}</div></div>`).join("");

  document.getElementById("heatmap").innerHTML = KOCH_ORDER.map(c=>{
    const acc = accuracyOf(c);
    const bg = acc===null ? "rgba(255,255,255,.03)" : acc>=85 ? "var(--green-g)" : acc>=60 ? "var(--amber-g)" : "var(--red-g)";
    const bd = acc===null ? "rgba(255,255,255,.08)" : acc>=85 ? "var(--green)" : acc>=60 ? "var(--amber)" : "var(--red)";
    return `<div class="hm-cell" style="background:${bg};border-color:${bd};color:${bd}">${c}<small>${acc===null?"—":acc+"%"}</small></div>`;
  }).join("");

  document.getElementById("badgeCount").textContent = `${state.achievements.length}/${ACHIEVEMENTS.length} unlocked`;

  const logBody = document.getElementById("practiceLog");
  if (logBody){
    logBody.innerHTML = state.sessionLog.length ? state.sessionLog.map(e=>{
      const d = new Date(e.ts);
      const when = d.toLocaleDateString(undefined,{month:"short",day:"numeric"}) + " " + d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
      const resultTxt = e.correct===null ? `${e.pct}% (best ${e.wpm} WPM)` : `${e.correct}/${e.targets} · ${e.pct}%`;
      return `<tr><td>${when}</td><td>${escapeHtml(e.mode)}</td><td>${resultTxt}</td></tr>`;
    }).join("") : `<tr><td colspan="3" style="color:var(--td)">No sessions logged yet — finish a drill to see it here.</td></tr>`;
  }
}

/* ---------------------------------------------------------------
   SETTINGS TAB
   --------------------------------------------------------------- */
function renderSettings(){
  document.getElementById("setWpm").value = state.settings.wpm;
  document.getElementById("setWpmVal").textContent = state.settings.wpm;
  document.getElementById("setEff").value = state.settings.effWpm;
  document.getElementById("setEffVal").textContent = state.settings.effWpm;
  document.getElementById("setSendWpm").value = state.settings.sendWpm;
  document.getElementById("setSendWpmVal").textContent = state.settings.sendWpm;
  document.getElementById("setFreq").value = state.settings.freq;
  document.getElementById("setFreqVal").textContent = state.settings.freq+" Hz";
  document.getElementById("setSound").checked = state.settings.sound;
  document.getElementById("setMotion").checked = state.settings.reduceMotion;
  document.getElementById("setNoise").checked = state.settings.bandNoise;
  document.getElementById("setEff").max = state.settings.wpm;
  document.querySelectorAll(".theme-swatch").forEach(el=>{
    el.classList.toggle("active", el.dataset.theme === state.settings.accent);
  });
  const unlockedNow = countUnlocked(state);
  document.getElementById("setUnlockedCount").value = unlockedNow;
  document.getElementById("setUnlockedVal").textContent = unlockedNow+"/40";
}

function setUnlockedCount(n){
  n = Math.max(2, Math.min(KOCH_ORDER.length, n));
  KOCH_ORDER.forEach((c,i)=>{ state.charStats[c].unlocked = i < n; });
  if (learnChar && !state.charStats[learnChar].unlocked) learnChar = null;
  saveState();
  checkAchievements();
}

function applyTheme(name){
  if (!name || name==="amber") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = name;
}

function wireSettings(){
  const bind = (id, fn)=> document.getElementById(id).addEventListener("input", fn);
  bind("setWpm", e=>{ state.settings.wpm = Number(e.target.value); document.getElementById("setWpmVal").textContent=e.target.value; document.getElementById("setEff").max=e.target.value; saveState(); });
  bind("setEff", e=>{ state.settings.effWpm = Number(e.target.value); document.getElementById("setEffVal").textContent=e.target.value; saveState(); });
  bind("setSendWpm", e=>{ state.settings.sendWpm = Number(e.target.value); document.getElementById("setSendWpmVal").textContent=e.target.value; saveState(); });
  bind("setFreq", e=>{ state.settings.freq = Number(e.target.value); document.getElementById("setFreqVal").textContent=e.target.value+" Hz"; saveState(); });
  document.getElementById("setSound").addEventListener("change", e=>{ state.settings.sound = e.target.checked; saveState(); });
  document.getElementById("setMotion").addEventListener("change", e=>{
    state.settings.reduceMotion = e.target.checked;
    document.body.classList.toggle("reduce-motion", e.target.checked);
    saveState();
  });
  document.getElementById("setNoise").addEventListener("change", e=>{
    state.settings.bandNoise = e.target.checked;
    Audio_.setNoise(e.target.checked);
    saveState();
  });
  document.querySelectorAll(".theme-swatch").forEach(el=>{
    el.addEventListener("click", ()=>{
      state.settings.accent = el.dataset.theme;
      applyTheme(el.dataset.theme);
      saveState();
      renderSettings();
    });
  });
  document.getElementById("btnUnlockAll").addEventListener("click", ()=>{
    KOCH_ORDER.forEach(c=> state.charStats[c].unlocked = true);
    saveState(); toast("All Characters Unlocked", "Free-practice mode — the curriculum tab still tracks recommended pacing.", "green");
    checkAchievements();
    renderSettings();
  });
  document.getElementById("setUnlockedCount").addEventListener("input", e=>{
    document.getElementById("setUnlockedVal").textContent = e.target.value+"/40";
  });
  document.getElementById("btnApplyUnlockCount").addEventListener("click", ()=>{
    const n = Number(document.getElementById("setUnlockedCount").value);
    setUnlockedCount(n);
    toast("Unlocked Characters Adjusted", `Now unlocked: first ${n} of 40. XP, streak, and achievements untouched.`, "green");
    renderSettings();
  });
  document.getElementById("btnExport").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "morse-academy-progress.json"; a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("importFile").addEventListener("change", e=>{
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(reader.result);
        state = {...freshState(), ...parsed};
        saveState();
        toast("Progress Imported", "Your saved data has been loaded.", "green");
        showTab("dashboard");
      }catch(err){ toast("Import Failed", "That file isn't valid progress data.", undefined); }
    };
    reader.readAsText(file);
  });
  document.getElementById("btnReset").addEventListener("click", ()=>{
    if (!confirm("Reset ALL progress? This cannot be undone.")) return;
    state = freshState();
    saveState();
    toast("Progress Reset", "Starting fresh from Day 1.", undefined);
    showTab("dashboard");
  });
}

/* ---------------------------------------------------------------
   BOOTSTRAP
   --------------------------------------------------------------- */
function wireDrillControls(){
  document.querySelectorAll("#copyModeButtons [data-mode]").forEach(b=>{
    b.addEventListener("click", ()=> CopyDrill.start(b.dataset.mode));
  });
  document.getElementById("copyStopBtn").addEventListener("click", ()=> CopyDrill.stop());
  document.getElementById("copyReplayBtn").addEventListener("click", ()=> CopyDrill.replay());
  const copyInput = document.getElementById("copyInput");
  copyInput.addEventListener("keydown", e=>{
    if (e.key !== "Enter") return;
    CopyDrill.submit(copyInput.value);
    copyInput.value = "";
  });
  copyInput.addEventListener("input", ()=>{
    if (CopyDrill.mode === "char" && copyInput.value.length >= CopyDrill.target.length){
      const v = copyInput.value;
      copyInput.value = "";
      CopyDrill.submit(v);
    }
  });

  const key = document.getElementById("sendKey");
  const down = ()=> SendDrill.down();
  const up = ()=> SendDrill.up();
  key.addEventListener("mousedown", down);
  key.addEventListener("touchstart", e=>{ e.preventDefault(); down(); }, {passive:false});
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
  document.addEventListener("keydown", e=>{
    if (e.code === "Space" && SendDrill.active && !e.repeat){ e.preventDefault(); down(); }
  });
  document.addEventListener("keyup", e=>{
    if (e.code === "Space" && SendDrill.active){ e.preventDefault(); up(); }
  });
  document.getElementById("sendStartBtn").addEventListener("click", ()=> SendDrill.start());
  document.getElementById("sendStopBtn").addEventListener("click", ()=> SendDrill.stop());

  document.getElementById("speedStartBtn").addEventListener("click", ()=> SpeedBuilder.start());
  document.getElementById("speedStop").addEventListener("click", ()=> SpeedBuilder.stop());

  document.getElementById("playLearnBtn").addEventListener("click", playLearnChar);
  document.getElementById("unlockNextBtn").addEventListener("click", unlockNextChar);

  document.getElementById("dailyPlayBtn").addEventListener("click", playDailyChallenge);
  document.getElementById("dailySubmitBtn").addEventListener("click", submitDailyChallenge);
  document.getElementById("dailyInput").addEventListener("keydown", e=>{
    if (e.key === "Enter") submitDailyChallenge();
  });
}

function initSoundGate(){
  const gate = document.getElementById("soundGate");
  const lamp = gate.querySelector(".lamp");
  scheduleVisualLoop(lamp, "SOS", 18);
  document.getElementById("enableSoundBtn").addEventListener("click", ()=>{
    Audio_.ensure();
    Audio_.playTokens(["V"], {wpmChar:20, wpmEff:20});
    if (state.settings.bandNoise) Audio_.setNoise(true);
    gate.style.display = "none";
  });
  document.getElementById("skipSoundBtn").addEventListener("click", ()=>{
    state.settings.sound = false;
    saveState();
    gate.style.display = "none";
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
  applyTheme(state.settings.accent);
  initStarfield();
  initMorseRain();
  initScopes();
  scheduleVisualLoop(document.getElementById("heroLamp"), "CQ CQ", 18);
  initSoundGate();
  initNav();
  wireDrillControls();
  wireSettings();
  wireTranslator();
  showTab("dashboard");
});
