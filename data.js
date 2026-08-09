/* ============================================================
   MORSE ACADEMY — data layer
   All morse mappings, curriculum, achievements, word banks.
   Pure data + a few derived-data helpers. No DOM, no state.
   ============================================================ */

/* Full ITU/International Morse reference (superset of the 40-char
   Koch training set below — used for the Reference tab so the app
   is a complete cheat sheet, not just a trainer). */
const MORSE_MAP = {
  "A":".-","B":"-...","C":"-.-.","D":"-..","E":".","F":"..-.","G":"--.","H":"....",
  "I":"..","J":".---","K":"-.-","L":".-..","M":"--","N":"-.","O":"---","P":".--.",
  "Q":"--.-","R":".-.","S":"...","T":"-","U":"..-","V":"...-","W":".--","X":"-..-",
  "Y":"-.--","Z":"--..",
  "0":"-----","1":".----","2":"..---","3":"...--","4":"....-",
  "5":".....","6":"-....","7":"--...","8":"---..","9":"----.",
  ".":".-.-.-",",":"--..--","?":"..--..","'":".----.","!":"-.-.--","/":"-..-.",
  "(":"-.--.",")":"-.--.-","&":".-...",":":"---...",";":"-.-.-.","=":"-...-",
  "+":".-.-.","-":"-....-","_":"..--.-","\"":".-..-.","$":"...-..-","@":".--.-."
};
const REVERSE_MAP = Object.fromEntries(Object.entries(MORSE_MAP).map(([k,v])=>[v,k]));

/* Prosigns are sent as a single fused character (no gap between the
   two letters). Kept separate from MORSE_MAP since they're taught,
   not drilled letter-by-letter. */
const PROSIGNS = {
  "AR":{code:".-.-.", meaning:"End of message / \"over\""},
  "SK":{code:"...-.-", meaning:"End of contact / \"clear\""},
  "BT":{code:"-...-", meaning:"Break — new paragraph/thought"},
  "KN":{code:"-.--.", meaning:"Invite a specific station only"},
  "AS":{code:".-...", meaning:"Stand by / wait"}
};

const QCODES = [
  ["QTH","What is your location?"],
  ["QRZ","Who is calling me?"],
  ["QSL","I acknowledge receipt / confirm"],
  ["QRM","I'm being interfered with"],
  ["QRN","I'm hearing static/atmospheric noise"],
  ["QSO","A conversation / contact"],
  ["QRS","Please send slower"],
  ["QRQ","Please send faster"],
  ["QRT","Stop sending / going off air"],
  ["QSY","Change frequency"],
  ["73","Best regards (traditional sign-off)"],
  ["88","Love and kisses (informal sign-off)"]
];

/* Koch method order — the real teaching order used across this app.
   Unlike the ABC alphabet chart, the FIRST characters taught are
   chosen for maximum sound-contrast (so your ear learns rhythm
   shapes, not letter order), and every character is always played
   at full target speed — only the SPACING slows down for beginners
   (Farnsworth timing). This is the single biggest reason Koch/
   Farnsworth training produces real 20+ WPM copiers while rote
   "memorize the chart" methods plateau around 5 WPM. */
const KOCH_ORDER = [
  "K","M","R","S","U","A","P","T","L","O","W","I","N","J","E","F","Y","V","G","Q",
  "Z","H","B","X","C","D","1","2","3","4","5","6","7","8","9","0",".",",","?","/"
];

/* A pool of short, common words filtered per-drill to only the
   characters the learner has unlocked so far. */
const WORD_BANK = [
  "THE","AND","YOU","ARE","FOR","NOT","BUT","ALL","CAN","HER","WAS","ONE","OUR",
  "OUT","DAY","GET","HAS","HIM","HIS","HOW","MAN","NEW","NOW","OLD","SEE","TWO",
  "WAY","WHO","BOY","DID","ITS","LET","PUT","SAY","SHE","TOO","USE","DAD","MOM",
  "CQ","DE","ES","TU","RIG","ANT","KEY","WPM","FIST","NAME","CALL","RADIO","SIGNAL",
  "TOWER","SIGNAL","MORSE","CODE","LEARN","PRACTICE","STATION","OPERATOR","CONTACT",
  "FREQUENCY","ANTENNA","RECEIVE","TRANSMIT","COPY","SOLID","GOOD","FINE","WORK",
  "THANKS","PLEASE","AGAIN","SLOW","FAST","HELLO","WORLD","EARTH","LIGHT","POWER",
  "GREEN","GOLD","NIGHT","RADIO","VOICE","SOUND","WAVES","SPARK","WIRE","TUBE"
];

/* Callsign-style random groups for advanced drills (letter+digit mix
   like real amateur radio callsigns, without impersonating anyone). */
function randomCallsign(rng){
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (s)=> s[Math.floor(rng()*s.length)];
  let cs = pick(letters);
  if (rng() > .5) cs += pick(letters);
  cs += String(Math.floor(rng()*10));
  cs += pick(letters)+pick(letters)+pick(letters);
  return cs;
}

/* ---------- Derived pedagogy tables (computed, not hand-typed, so
   they can never drift from MORSE_MAP) ---------- */

// Mirror pairs: characters whose code is the exact reverse of another's.
function computeMirrorPairs(){
  const seen = new Set();
  const pairs = [];
  for (const [ch, code] of Object.entries(MORSE_MAP)){
    if (!/^[A-Z]$/.test(ch)) continue;
    const rev = code.split("").reverse().join("");
    const partner = REVERSE_MAP[rev];
    if (partner && partner !== ch && /^[A-Z]$/.test(partner) && !seen.has(ch) && !seen.has(partner)){
      pairs.push([ch, code, partner, rev]);
      seen.add(ch); seen.add(partner);
    }
  }
  return pairs;
}

// Group letters by number of morse elements (great for "shape" intuition).
function computeLengthGroups(){
  const groups = {};
  for (const [ch, code] of Object.entries(MORSE_MAP)){
    if (!/^[A-Z]$/.test(ch)) continue;
    (groups[code.length] ||= []).push(ch);
  }
  return groups;
}

/* ============================================================
   THE 30-DAY CURRICULUM
   Each "Day" is a SESSION, not a calendar day — go at whatever pace
   gets you to mastery fastest. Do all 30 in a weekend or spread them
   over a month; the program tracks completed sessions, not the
   calendar.
   Phases: 1 Foundation · 2 Building · 3 Fluency · 4 Mastery
   ============================================================ */
const CURRICULUM = [
  {day:1, phase:1, title:"First Contact", newChars:["K","M"], goalWpm:20, goalEff:5,
   tasks:["Read the Curriculum tab's \"How this works\" panel (Koch + Farnsworth explained)",
          "Learn tab: flip flashcards for K and M until you recognize both by ear instantly",
          "Copy Drill: 20 reps of K/M only, hit 90% accuracy",
          "Reference tab: read the Mirror Pairs and Element-Length tables once"]},
  {day:2, phase:1, title:"Building the Ear", newChars:["R","S"], goalWpm:20, goalEff:5,
   tasks:["Warm up: 10 reps reviewing K, M by sound only (no looking)","Learn R and S",
          "Copy Drill: K M R S mixed, 25 reps, 90%+"]},
  {day:3, phase:1, title:"Four Become Six", newChars:["U","A"], goalWpm:20, goalEff:5,
   tasks:["Warm up on K M R S","Learn U and A — note A is the mirror of N (you'll meet N on Day 9)",
          "Copy Drill: 6-character set, 30 reps, 90%+"]},
  {day:4, phase:1, title:"Halfway to Twelve", newChars:["P","T"], goalWpm:20, goalEff:5,
   tasks:["Warm up on all 6 known characters","Learn P and T — T is the shortest dash, a single unit",
          "Copy Drill: 8-character set, 30 reps, 90%+"]},
  {day:5, phase:1, title:"Momentum", newChars:["L","O"], goalWpm:20, goalEff:6,
   tasks:["Warm up","Learn L and O","Copy Drill: 10-character set, 35 reps, 90%+",
          "Bump effective (Farnsworth) speed to 6 WPM in Settings"]},
  {day:6, phase:1, title:"The Dozen", newChars:["W","I"], goalWpm:20, goalEff:6,
   tasks:["Learn W and I — Phase 1's full 12-character set is now unlocked",
          "Copy Drill: full 12-char set, 40 reps, 90%+"]},
  {day:7, phase:1, title:"Phase 1 Checkpoint", newChars:[], goalWpm:20, goalEff:6,
   tasks:["Copy Drill: 50-rep test on the full 12-character set — must hit 90%+ to clear",
          "Review any character under 85% accuracy in the Achievements heatmap",
          "Read the Send Drill instructions — you'll start sending tomorrow"]},
  {day:8, phase:1, title:"Learning to Send", newChars:[], goalWpm:20, goalEff:6,
   tasks:["Send Drill: send each of the 12 known characters 5 times with the on-screen key or spacebar",
          "Aim for a consistent dit:dah ratio (the app scores your timing)",
          "Free copy: 30 reps for fun, no minimum this session"]},

  {day:9, phase:2, title:"Into the Alphabet", newChars:["N","J"], goalWpm:20, goalEff:7,
   tasks:["Learn N and J — N is the mirror of A","Copy Drill: 14-char set, 35 reps, 88%+"]},
  {day:10, phase:2, title:"Vowels and Fricatives", newChars:["E","F"], goalWpm:20, goalEff:7,
   tasks:["Learn E (single dit — the most common letter in English) and F",
          "Copy Drill: 16-char set, 35 reps, 88%+"]},
  {day:11, phase:2, title:"Y and V", newChars:["Y","V"], goalWpm:20, goalEff:7,
   tasks:["Learn Y and V (V is famously Beethoven's 5th rhythm: di-di-di-dah)",
          "Copy Drill: 18-char set, 40 reps, 88%+", "Send Drill: 10 reps on newest 6 characters"]},
  {day:12, phase:2, title:"G and Q", newChars:["G","Q"], goalWpm:20, goalEff:8,
   tasks:["Learn G and Q","Copy Drill: 20-char set, 40 reps, 88%+"]},
  {day:13, phase:2, title:"Z and H", newChars:["Z","H"], goalWpm:20, goalEff:8,
   tasks:["Learn Z and H (H is 4 dits — don't rush it into a dash)",
          "Copy Drill: 22-char set, 40 reps, 88%+"]},
  {day:14, phase:2, title:"B and X", newChars:["B","X"], goalWpm:20, goalEff:8,
   tasks:["Learn B and X","Copy Drill: 24-char set, 45 reps, 88%+","Send Drill: 15 reps mixed"]},
  {day:15, phase:2, title:"Alphabet Complete", newChars:["C","D"], goalWpm:20, goalEff:8,
   tasks:["Learn C and D — all 26 letters are now unlocked!",
          "Copy Drill: full alphabet, 50 reps, 85%+","Unlock check: Alphabet Ace achievement"]},
  {day:16, phase:2, title:"Phase 2 Checkpoint", newChars:[], goalWpm:20, goalEff:8,
   tasks:["Copy Drill: full-alphabet 60-rep test at 88%+",
          "Weak-character remediation: use \"Drill My Weak Chars\" (adaptive weighted mode)",
          "Send Drill: spell your name and one short word"]},

  {day:17, phase:3, title:"The Number Ramp", newChars:["1","2","3","4","5"], goalWpm:20, goalEff:9,
   tasks:["Read the \"Number Pattern Logic\" card in Reference — you'll never need to memorize digits again",
          "Learn 1–5 using the pattern (dits = the digit, dashes fill the rest)",
          "Copy Drill: letters+1-5, 40 reps, 85%+"]},
  {day:18, phase:3, title:"Digits Complete", newChars:["6","7","8","9","0"], goalWpm:20, goalEff:9,
   tasks:["Learn 6–0 using the mirrored pattern (dashes = digit-5)",
          "Copy Drill: all 26 letters + 10 digits, 50 reps, 85%+","Unlock check: Number Cruncher achievement"]},
  {day:19, phase:3, title:"Punctuation & Full Set", newChars:[".",",","?","/"], goalWpm:20, goalEff:9,
   tasks:["Learn period, comma, question mark, and slash — the full 40-character Koch set is complete",
          "Copy Drill: full 40-char set, 50 reps, 85%+","Unlock check: Full Set achievement"]},
  {day:20, phase:3, title:"Prosigns", newChars:[], goalWpm:20, goalEff:10,
   tasks:["Reference tab: study the 5 prosigns (AR, SK, BT, KN, AS) — sent as one fused shape, not two letters",
          "Learn tab: switch character set to \"Prosigns\" and drill each one 8 times",
          "Copy Drill: mixed 40-char set, 50 reps, 88%+"]},
  {day:21, phase:3, title:"Q-Codes & Ham Shorthand", newChars:[], goalWpm:20, goalEff:10,
   tasks:["Reference tab: read the Q-code cheat sheet (QTH, QRZ, QSL, 73, etc.)",
          "Copy Drill: Word Mode, 20 real words, 85%+","Send Drill: send QTH, QSL, and 73"]},
  {day:22, phase:3, title:"Words at Speed", newChars:[], goalWpm:22, goalEff:11,
   tasks:["Bump character speed to 22 WPM, effective to 11 in Settings",
          "Copy Drill: Word Mode, 25 words, 85%+","Send Drill: 15 reps, focus on even spacing"]},
  {day:23, phase:3, title:"Sentences", newChars:[], goalWpm:22, goalEff:12,
   tasks:["Copy Drill: Sentence Mode, 3 full sentences, 85%+",
          "Speed Builder: one short ramp session to feel the pace increase"]},
  {day:24, phase:3, title:"Phase 3 Checkpoint", newChars:[], goalWpm:22, goalEff:12,
   tasks:["Copy Drill: mixed words+letters+numbers, 60 reps, 88%+",
          "Send Drill: 20 reps, aim for a Timing Score of 80+",
          "Review weak-character heatmap and drill anything under 80%"]},

  {day:25, phase:4, title:"Speed Builder I", newChars:[], goalWpm:24, goalEff:15,
   tasks:["Speed Builder: run a full adaptive ramp session, target effective 15 WPM at 90%+"]},
  {day:26, phase:4, title:"Speed Builder II", newChars:[], goalWpm:26, goalEff:18,
   tasks:["Speed Builder: full ramp session, target effective 18 WPM at 90%+",
          "Copy Drill: Word Mode at current settings, 30 words, 85%+"]},
  {day:27, phase:4, title:"Simulated QSO", newChars:[], goalWpm:26, goalEff:18,
   tasks:["Copy Drill: switch to \"QSO Mode\" and copy a full simulated contact exchange",
          "Send Drill: send your own callsign-style reply (CQ, name, signal report, 73)"]},
  {day:28, phase:4, title:"Weak-Point Remediation", newChars:[], goalWpm:26, goalEff:18,
   tasks:["Achievements tab: identify your 5 lowest-accuracy characters",
          "Learn tab: drill only those 5 for 10 reps each",
          "Copy Drill: \"Drill My Weak Chars\" mode, 40 reps, 90%+"]},
  {day:29, phase:4, title:"Speed Builder III", newChars:[], goalWpm:28, goalEff:20,
   tasks:["Speed Builder: final ramp, push for a new personal-best WPM at 90%+ accuracy"]},
  {day:30, phase:4, title:"FINAL EXAM", newChars:[], goalWpm:28, goalEff:20,
   tasks:["Copy Drill: Final Exam mode — 5 minutes, fully random across all 40 characters",
          "Score 90%+ to earn the Morse Master badge and complete the program",
          "Send Drill: 20-rep timing test, Timing Score 85+"]}
];

const PHASES = [
  {id:1, name:"Foundation", range:"Days 1–8", color:"#E8B84B",
   desc:"First 12 Koch characters. You build the ear before the alphabet — every new sound gets drilled to 90% before moving on."},
  {id:2, name:"Building", range:"Days 9–16", color:"#4CC9E8",
   desc:"The remaining 14 letters. Full 26-letter alphabet unlocked by Day 15. Sending begins."},
  {id:3, name:"Fluency", range:"Days 17–24", color:"#9B4BE8",
   desc:"Digits (via the number-ramp pattern), punctuation, prosigns, Q-codes, real words and sentences."},
  {id:4, name:"Mastery", range:"Days 25–30", color:"#E85D5D",
   desc:"Speed builder ramps, a simulated QSO, weak-point remediation, and a timed final exam."}
];

/* ---------- Achievements ---------- */
const ACHIEVEMENTS = [
  {id:"first_contact", icon:"📡", name:"First Contact", desc:"Complete your first Copy Drill session.",
   check:(s)=> s.totalSessions >= 1},
  {id:"streak3", icon:"🔥", name:"Streak Starter", desc:"Practice 3 days in a row.",
   check:(s)=> s.streak >= 3},
  {id:"streak7", icon:"🌟", name:"Week Warrior", desc:"Practice 7 days in a row.",
   check:(s)=> s.streak >= 7},
  {id:"streak30", icon:"🏆", name:"Iron Fist", desc:"Practice 30 days in a row.",
   check:(s)=> s.streak >= 30},
  {id:"dozen", icon:"🎯", name:"Dozen Down", desc:"Unlock the first 12 characters (finish Phase 1).",
   check:(s)=> countUnlocked(s) >= 12},
  {id:"alphabet", icon:"🔤", name:"Alphabet Ace", desc:"Unlock all 26 letters.",
   check:(s)=> ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"]
                .every(c=> s.charStats[c]?.unlocked)},
  {id:"numbers", icon:"🔢", name:"Number Cruncher", desc:"Unlock all 10 digits.",
   check:(s)=> "0123456789".split("").every(c=> s.charStats[c]?.unlocked)},
  {id:"fullset", icon:"✅", name:"Full Set", desc:"Unlock all 40 Koch characters.",
   check:(s)=> countUnlocked(s) >= 40},
  {id:"sharpshooter", icon:"🎪", name:"Sharp Shooter", desc:"Score 95%+ on a drill of 20+ characters.",
   check:(s)=> s.bestAccuracyStreak >= 95},
  {id:"speeddemon", icon:"⚡", name:"Speed Demon", desc:"Pass a drill at 15+ effective WPM.",
   check:(s)=> s.pbEffWpm >= 15},
  {id:"speedking", icon:"🚀", name:"Velocity King", desc:"Pass a drill at 20+ effective WPM.",
   check:(s)=> s.pbEffWpm >= 20},
  {id:"onair", icon:"📻", name:"On The Air", desc:"Complete the simulated QSO drill.",
   check:(s)=> s.completedDays.includes(27)},
  {id:"master", icon:"👑", name:"Morse Master", desc:"Pass the Day 30 Final Exam at 90%+.",
   check:(s)=> s.completedDays.includes(30)},
  {id:"sender", icon:"🔑", name:"Steady Hand", desc:"Achieve a Send Drill timing score of 90+.",
   check:(s)=> s.bestTimingScore >= 90},
  {id:"marathon", icon:"⏱️", name:"Marathon Op", desc:"Log 60+ minutes of total practice time.",
   check:(s)=> s.totalPracticeMs >= 60*60*1000},
  {id:"century", icon:"💯", name:"Century Club", desc:"Copy 500 correct characters total.",
   check:(s)=> s.totalCorrectChars >= 500},
  {id:"daily5", icon:"📶", name:"Signal of the Day", desc:"Complete 5 different daily challenges.",
   check:(s)=> (s.dailyChallengeDates||[]).length >= 5}
];

function countUnlocked(s){
  return Object.values(s.charStats).filter(c=>c.unlocked).length;
}

/* ---------- Levels (titled after real amateur-radio license classes) ---------- */
const LEVELS = [
  {lvl:1, xp:0,     title:"Shortwave Listener"},
  {lvl:2, xp:120,   title:"Novice Operator"},
  {lvl:3, xp:320,   title:"Technician"},
  {lvl:4, xp:700,   title:"General"},
  {lvl:5, xp:1300,  title:"Advanced"},
  {lvl:6, xp:2200,  title:"Amateur Extra"},
  {lvl:7, xp:3500,  title:"Net Control Station"},
  {lvl:8, xp:5200,  title:"DXer"},
  {lvl:9, xp:7500,  title:"Contest Operator"},
  {lvl:10,xp:10500, title:"Elmer (Master Operator)"}
];
function levelForXp(xp){
  let cur = LEVELS[0];
  for (const l of LEVELS){ if (xp >= l.xp) cur = l; }
  const idx = LEVELS.indexOf(cur);
  const next = LEVELS[idx+1] || null;
  return {...cur, next};
}

/* Practice sentences — built from common letters, used once the
   learner has the full alphabet (Phase 3 onward). */
const SENTENCES = [
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "GOOD SIGNAL HERE HOW COPY",
  "PLEASE SEND SLOWER I AM A BEGINNER",
  "THANKS FOR THE CONTACT SEE YOU AGAIN",
  "MY NAME IS OPERATOR AND MY RIG IS FINE",
  "WEATHER HERE IS CLEAR AND SUNNY TODAY",
  "SEVENTY THREE AND GOOD LUCK ON THE BANDS",
  "THIS IS A TEST OF THE MORSE CODE TRAINER",
  "PRACTICE MAKES PERFECT SO KEEP GOING",
  "SLOW STEADY PRACTICE BUILDS REAL SPEED"
];

/* A short simulated on-air contact, line by line, for the Phase 4
   "Simulated QSO" drill. Any resemblance to real callsigns is
   coincidental — these are simple placeholder patterns. */
const QSO_SCRIPT = [
  "CQ CQ CQ DE K4ABC K4ABC K",
  "K4ABC DE W1XYZ W1XYZ K",
  "W1XYZ DE K4ABC GA OM TNX FER CALL",
  "NAME HERE IS JOHN JOHN QTH IS OHIO OHIO",
  "RIG IS 100W AND WIRE ANT HW CPY QSL? OVER",
  "K4ABC DE W1XYZ FB COPY 599 599 QSL ALL",
  "NAME HERE IS DAVE DAVE QTH IS MAINE MAINE",
  "TNX FOR NICE QSO 73 ES GUD DX",
  "K4ABC DE W1XYZ SK"
];

/* Simple seedable PRNG (mulberry32) so "randomness" can be reproducible
   for tests if ever needed, while feeling fully random in play. */
function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
