#!/usr/bin/env node
/** commitsmusic engine — parse commits, generate music, render WAV */

const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const SR = 44100;

const SIN = new Float32Array(4096);
for(let i=0;i<4096;i++) SIN[i]=Math.sin(2*Math.PI*i/4096);
const sin=ph=>SIN[Math.min(4095,Math.floor((((ph%1)+1)%1)*4096))];
const m2f=m=>440*2**((m-69)/12);

// ═══ Git Parse ════════════════════════════════════════════════
function parse(repo, n=30){
  if(!fs.existsSync(path.join(repo,'.git'))) throw new Error(`not a git repository: ${repo}`);
  const out=execSync(`git -C "${repo}" log --no-merges --format='%aI|%an|%s' --stat -n ${n}`,{encoding:'utf8',maxBuffer:10e6});
  const cs=[];let c=null;
  for(const l of out.split('\n')){
    if(/^\d{4}-\d{2}-\d{2}T/.test(l)){if(c)cs.push(c);const p=l.split('|');c={d:p[0],au:p[1]||'unknown',m:p.slice(2).join('|')||'',i:0,x:0,files:[],diff:[]}}
    else if(c){
      const mi=l.match(/(\d+) insertion/), md=l.match(/(\d+) deletion/);
      if(mi)c.i=+mi[1];if(md)c.x=+md[1];
      // File line from --stat: " src/file.js | 5 +++"
      const fm=l.match(/^\s+(.+?)\s+\|\s+\d+/);
      if(fm)c.files.push(fm[1].trim());
      if(c.diff.length<3) c.diff.push(l.trim());
    }
  }
  if(c)cs.push(c);return cs.reverse();
}

// ═══ Music Theory ═════════════════════════════════════════════
const NM='C C# D Eb E F F# G Ab A Bb B'.split(' ');
const PM=[0,2,4,7,9], Pm=[0,3,5,7,10];
const KS_M=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KS_m=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

function detectKey(raw){
  const d=new Float32Array(12);let t=0;
  for(const n of raw){d[n.midi%12]+=n.w;t+=n.w}
  for(let i=0;i<12;i++)d[i]/=t;
  let bk=0,bc=-2,bm='major';
  for(let k=0;k<12;k++){
    for(const[m,ks]of[['major',KS_M],['minor',KS_m]]){
      const p=ks.map((_,i)=>ks[(i-k+12)%12]);let n=0,d1=0,d2=0;
      for(let i=0;i<12;i++){n+=(d[i]-1/12)*(p[i]-p.reduce((a,b)=>a+b)/12);d1+=(d[i]-1/12)**2;d2+=(p[i]-p.reduce((a,b)=>a+b)/12)**2}
      const c=n/Math.sqrt(d1*d2);if(c>bc){bc=c;bk=k;bm=m}
    }
  }
  return{ki:bk,mode:bm,name:NM[bk],pt:(bm==='major'?PM:Pm).map(d=>(bk+d)%12),corr:bc};
}
function snap(midi,pt){const pc=midi%12;let b=midi,bd=99;for(const p of pt){const d=Math.min(Math.abs(pc-p),12-Math.abs(pc-p));if(d<bd){bd=d;b=midi-pc+p}}return Math.max(40,Math.min(84,b))}

// ═══ Melody ═══════════════════════════════════════════════════
function buildMelody(cs,key){
  const pt=key.pt, mc=Math.max(1,...cs.map(c=>c.i+c.x));
  const raw=cs.map(c=>({midi:snap(48+Math.round((c.i+c.x)/mc*31),pt),h:new Date(c.d).getHours(),w:(c.i+c.x)/mc,msg:c.m.slice(0,80),au:c.au||'unknown',files:c.files||[],diff:c.diff}));

  let ci=0;for(let i=0;i<raw.length;i++)if(raw[i].w>raw[ci].w)ci=i;

  // Voice leading
  for(let i=1;i<raw.length;i++){const g=raw[i].midi-raw[i-1].midi;if(Math.abs(g)>7)raw[i].midi=snap(raw[i-1].midi+(g>0?5:-5),pt)}
  for(let i=2;i<raw.length;i++){const g1=raw[i-1].midi-raw[i-2].midi,g2=raw[i].midi-raw[i-1].midi;if(Math.abs(g1)>=4)raw[i].midi=snap(raw[i-1].midi+(-Math.sign(g1)||-1)*2,pt);else if(Math.abs(g2)>=4&&Math.abs(g1)>=4&&g1*g2>0)raw[i].midi=snap(raw[i-1].midi-(g2>0?2:-2),pt)}

  // Climax approach
  if(ci>3){
    const climMidi=snap(raw[ci].midi+12,pt);
    for(let s=1;s<=3;s++){raw.splice(ci,0,{midi:snap(climMidi-4*s,pt),h:raw[ci].h,w:.3,msg:'',diff:[],tp:true,tn:'approach'});ci++}
  }

  // Passing tones
  const nts=[];
  for(let i=0;i<raw.length;i++){
    if(!raw[i].tp) nts.push({...raw[i],tp:false}); else nts.push({...raw[i],tp:true});
    if(i<raw.length-1&&!raw[i].tp&&!raw[i+1].tp){
      const g=raw[i+1].midi-raw[i].midi,ag=Math.abs(g);
      if(ag>=3&&ag<=4) nts.push({midi:snap(Math.round((raw[i].midi+raw[i+1].midi)/2),pt),h:raw[i].h,w:.15,msg:'',diff:[],tp:true});
      else if(ag>=5){const d=g>0?1:-1;nts.push({midi:snap(raw[i].midi+d*2,pt),h:raw[i].h,w:.12,msg:'',diff:[],tp:true});nts.push({midi:snap(raw[i].midi+d*4,pt),h:raw[i].h,w:.12,msg:'',diff:[],tp:true})}
    }
  }

  // Phrases
  const phs=[];let ph=[nts[0]];for(let i=1;i<nts.length;i++){if(Math.abs(nts[i].h-nts[i-1].h)>4&&ph.length>=3){phs.push(ph);ph=[]}ph.push(nts[i])}if(ph.length)phs.push(ph);

  // Rhythm
  const BPM=80,beat=60/BPM;
  const durPatterns=[
    [2,0.5,1,0.5, 2,0.5,1,1],
    [1.5,0.5,1,1, 1.5,0.5,1,1],
    [1,0.5,0.5,1, 2,0.5,0.5,1],
    [2,1,0.5,0.5, 1.5,1,0.5,1],
    [1,1,1,0.5, 2,0.5,1,0.5],
  ];

  const mel=[];let time=0;
  for(let pi=0;pi<phs.length;pi++){
    const phr=phs[pi], dp=durPatterns[pi%durPatterns.length];
    let di=0;
    for(let ni=0;ni<phr.length;ni++){
      const n=phr[ni];
      const durBeats=dp[di%dp.length];
      let dur=beat*durBeats;
      if(n.tp) dur=beat*0.5;
      const vel=n.tp?.15:.55;
      mel.push({freq:m2f(n.midi),midi:n.midi,t:Math.round(time*1e3)/1e3,dur:Math.round(dur*1e3)/1e3,vel,msg:n.msg,au:n.au||'unknown',files:n.files||[],diff:n.diff,tp:n.tp});
      time+=dur;
      if(!n.tp) di++;
    }
    time+=beat*0.5;
  }

  return{mel,totalTime:time,phs,ci,raw};
}

// ═══ Chords (SCFA) ════════════════════════════════════════════
function buildAccompaniment(melody, totalTime, key){
  const BPM=80,beat=60/BPM,bar=beat*4;
  const pad=[], drums=[];
  const cofDeg=[0,7,2,9,4,11,5,10,3,8,1,6];
  const keyRoot=key.ki;
  const allChords=[];
  for(let ci=0;ci<12;ci++){
    const root=(keyRoot+cofDeg[ci])%12;
    const isMinor=[2,4,9].includes(cofDeg[ci]);
    const third=(root+(isMinor?3:4))%12, fifth=(root+7)%12;
    allChords.push({name:NM[root]+(isMinor?'m':''),root,third,fifth,cofPos:ci});
  }
  const symPositions=[0,3,6,9];
  let t=0,lastCof=-1;
  while(t<totalTime){
    const sd=Math.min(bar*2,totalTime-t);
    const melHere=melody.filter(n=>n.t>=t&&n.t<t+sd&&!n.tp);
    const melPCs=new Set(melHere.map(n=>n.midi%12));
    const melCount={};for(const pc of melPCs){melCount[pc]=melHere.filter(n=>n.midi%12===pc).length}
    
    let bestCh=null,bestScore=-1;
    for(const pos of symPositions){
      const ch=allChords[pos];
      if(pos===lastCof) continue;
      let score=0;
      for(const ct of[ch.root,ch.third,ch.fifth]){
        if(melPCs.has(ct)) score+=2+(melCount[ct]||0);
        if(melPCs.has((ct+2)%12)) score+=1;
      }
      if(score>bestScore){bestScore=score;bestCh=ch}
    }
    if(!bestCh){for(const ch of allChords){if(ch.cofPos===lastCof)continue;let score=0;for(const ct of[ch.root,ch.third,ch.fifth])if(melPCs.has(ct))score+=2;if(score>bestScore){bestScore=score;bestCh=ch}}}
    if(!bestCh) bestCh=allChords[0];
    lastCof=bestCh.cofPos;

    const{r:rt,t:tt,f:ft}=bestCh;
    for(const m of[ft+36,rt+48,tt+48,ft+48,rt+60,tt+60]) pad.push({freq:m2f(m),t,dur:sd,vel:.12,chordName:bestCh.name});

    const steps16=Math.floor(sd/(beat/4));
    for(let s=0;s<steps16;s++){
      const dt=Math.round((t+s*beat/4)*1e3)/1e3, p=s%16;
      if(p===0||p===8) drums.push({type:'kick',t:dt,dur:.12,vel:.4});
      if(p===14&&s%32<16) drums.push({type:'kick',t:dt,dur:.06,vel:.15});
      if(p===4||p===12) drums.push({type:'snare',t:dt,dur:.07,vel:.28});
      if(p%2===0) drums.push({type:'hat',t:dt,dur:.03,vel:.1});
    }
    t+=sd;
  }
  return{pad,drums};
}

// ═══ Synths ══════════════════════════════════════════════════
function pianoS(freq,dur,vel,midi){
  const fmComp=1+Math.max(0,(midi-50))*0.025;
  const ts=Math.floor(Math.max(.02,dur)*SR),o=new Float32Array(ts);
  for(const h of[{m:1,a:.8},{m:2,a:.5},{m:3,a:.25},{m:4,a:.12}]){
    const f=freq*h.m*(1+h.m*.0002);
    for(let i=0;i<ts;i++){const t=i/SR,e=t<.003?t/.003:(t<dur*.2?1-.65*(t-.003)/(dur*.2):(t<dur*.75?.35:.35*(1-(t-dur*.75)/(dur*.25))));o[i]+=sin(f*t)*h.a*e}
  }
  for(let i=0;i<Math.min(160,ts);i++)o[i]+=(Math.random()*2-1)*Math.exp(-i/150)*.05;
  let rms=0;for(let i=0;i<ts;i++)rms+=o[i]*o[i];rms=Math.sqrt(rms/ts);
  for(let i=0;i<ts;i++)o[i]*=(vel*fmComp)/(rms||1e-9);
  return o;
}
function padS(freq,dur,vel){
  const ts=Math.floor(dur*SR),o=new Float32Array(ts);
  for(const h of[{m:1,a:.6},{m:2,a:.4},{m:3,a:.2}]){const f=freq*h.m;for(let i=0;i<ts;i++){const t=i/SR;o[i]+=sin(f*t)*h.a*Math.min(1,t*3)*Math.exp(-t*.15/dur)*vel}}
  return o;
}
function kickS(d,v){const ts=Math.floor(d*SR),o=new Float32Array(ts);for(let i=0;i<ts;i++){const t=i/SR;o[i]=sin((55+130*Math.exp(-t*18))*t)*Math.exp(-t*8)*v}return o}
function snareS(d,v){const ts=Math.floor(d*SR),o=new Float32Array(ts);for(let i=0;i<ts;i++){const t=i/SR;o[i]=((Math.random()*2-1)*Math.exp(-t*25)*.35+sin(200*t)*Math.exp(-t*12)*.2)*Math.exp(-t*5)*v}return o}
function hatS(d,v){const ts=Math.floor(d*SR),o=new Float32Array(ts);for(let i=0;i<ts;i++)o[i]=(Math.random()*2-1)*Math.exp(-i/SR*70)*v*.2;return o}
function mix(t,b,o){for(let i=0;i<b.length&&o+i<t.length;i++){t[o+i]+=b[i];if(t[o+i]>3)t[o+i]=3;if(t[o+i]<-3)t[o+i]=-3}}

// ═══ Render ═══════════════════════════════════════════════════
function renderAll(melody,acc,totalTime){
  const TS=Math.floor(totalTime*SR*1.03),mx=new Float32Array(TS);
  let climaxT=totalTime*.5, maxMidi=0;
  for(const n of melody){if(!n.tp&&n.midi>maxMidi){maxMidi=n.midi;climaxT=n.t+n.dur*.5}}
  for(const n of melody){
    const buf=pianoS(n.freq,n.dur,n.vel,n.midi);
    const distFromClimax=Math.abs(n.t-climaxT)/totalTime;
    const dynArc=.55+.45*(1-Math.min(1,distFromClimax*2));
    for(let i=0;i<buf.length;i++) buf[i]*=dynArc;
    mix(mx, buf, Math.floor(n.t*SR));
  }
  for(const p of acc.pad) mix(mx, padS(p.freq,p.dur,p.vel), Math.floor(p.t*SR));
  for(const d of acc.drums) mix(mx, d.type==='kick'?kickS(d.dur,d.vel):d.type==='snare'?snareS(d.dur,d.vel):hatS(d.dur,d.vel), Math.floor(d.t*SR));
  for(let i=0;i<Math.floor(.08*SR)&&i<TS;i++)mx[i]*=i/(.08*SR);
  for(let i=Math.max(0,TS-Math.floor(.12*SR));i<TS;i++)mx[i]*=(TS-i)/(.12*SR);
  let pk=0;for(let i=0;i<TS;i++)pk=Math.max(pk,Math.abs(mx[i]));
  if(pk>0){const ng=.9/pk;for(let i=0;i<TS;i++)mx[i]=Math.tanh(mx[i]*ng)}
  return mx;
}
function writeWav(sp,fp){
  const N=sp.length,b=Buffer.alloc(44+N*2);
  b.write('RIFF',0);b.writeUInt32LE(36+N*2,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(N*2,40);
  for(let i=0;i<N;i++)b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.floor(sp[i]*32767))),44+i*2);
  fs.writeFileSync(fp,b);
}

// ═══ Generate Pipeline ════════════════════════════════════════
function generate(repo, n=30){
  const cs=parse(repo, n);
  if(!cs.length) throw new Error('no commits found');
  const mc=Math.max(1,...cs.map(c=>c.i+c.x));
  const rawForKey=cs.map(c=>({midi:48+Math.round((c.i+c.x)/mc*31),w:(c.i+c.x)/mc}));
  const key=detectKey(rawForKey);
  const{mel,totalTime}=buildMelody(cs,key);
  const acc=buildAccompaniment(mel,totalTime,key);
  const samples=renderAll(mel,acc,totalTime);
  const chordSeq=[...new Set(acc.pad.map(p=>p.chordName))];
  
  // Attach commit index to melody notes for animation
  const commitNotes=mel.filter(n=>!n.tp);
  
  return{samples,totalTime,key,mel,acc,chordSeq,commitNotes,cs};
}

module.exports={generate,writeWav,SR};
