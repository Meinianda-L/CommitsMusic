#!/usr/bin/env node
/** GitMuse — turn git history into music */
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const SR = 44100, MAX = +process.env.GITMUSE_MAX || 200;
const NOANIM = process.argv.includes('--no-anim');
const repoPath = path.resolve(process.argv.filter(a => !a.startsWith('-')).slice(-1)[0] || '.');


const SIN = new Float32Array(4096);
for(let i=0;i<4096;i++) SIN[i]=Math.sin(2*Math.PI*i/4096);
const fastSin=ph=>{const p=((ph%1)+1)%1;return SIN[Math.min(4095,Math.floor(p*4096))]};

//Cross-platform audio
function playAudio(wp){
  const cmd = process.platform === 'darwin' ? ['afplay',[wp]]
    : process.platform === 'linux' ? ['aplay',[wp]]
    : ['powershell',['-c',`(New-Object Media.SoundPlayer '${wp}').PlaySync()`]];
  return spawn(cmd[0],cmd[1],{stdio:'ignore'});
}


const $={r:'\x1b[0m',B:'\x1b[1m',R:'\x1b[31m',G:'\x1b[32m',Y:'\x1b[33m',M:'\x1b[35m',C:'\x1b[36m',W:'\x1b[37m',g:'\x1b[90m',inv:'\x1b[7m'};
function K(a,s){return a+s+$.r}
function log(s){process.stdout.write(s+'\n')}


function parseGit(repo){
  log(K($.g,`  ${repo}`));
  const out=execSync(`git -C "${repo}" log --no-merges --format='%H|%aI|%s|%an' --shortstat`,{encoding:'utf8',maxBuffer:100e6});
  const cs=[];let cur=null;
  for(const l of out.split('\n')){
    if(/^[0-9a-f]{40}\|/.test(l)){if(cur)cs.push(cur);const p=l.split('|');cur={h:p[0].slice(0,8),d:p[1],m:p.slice(2,-1).join('|'),a:p.at(-1)||'?',f:0,i:0,x:0}}
    else if(cur){const mf=l.match(/(\d+) files? changed/),mi=l.match(/(\d+) insertion/),md=l.match(/(\d+) deletion/);if(mf)cur.f=+mf[1];if(mi)cur.i=+mi[1];if(md)cur.x=+md[1]}
  }
  if(cur)cs.push(cur);
  let r=cs.reverse();if(r.length>MAX){log(K($.g,`  last ${MAX} of ${r.length}`));r=r.slice(-MAX)}
  const mc=Math.max(1,...r.map(c=>c.i+c.x));
  return r.map(c=>({...c,hour:new Date(c.d).getHours(),intensity:(c.i+c.x)/mc}));
}


const MAJ=[0,2,4,5,7,9,11], MIN=[0,2,3,5,7,8,10], NAMES='C C# D Eb E F F# G Ab A Bb B'.split(' ');

function detectKey(commits){
  let bk=0,bm='major',bs=1/0;
  for(let ki=0;ki<12;ki++){
    for(const [m,ivs] of [['major',MAJ],['minor',MIN]]){
      let sc=0;
      for(const c of commits){
        const midi=48+Math.floor(c.hour/24*24),pc=midi%12;
        let md=99;for(const p of ivs.map(iv=>(ki+iv)%12))md=Math.min(md,Math.min(Math.abs(pc-p),12-Math.abs(pc-p)));
        sc+=md*(c.intensity||0.5); // FIXED: intensity is now pre-computed
      }
      if(sc<bs){bs=sc;bk=ki;bm=m}
    }
  }
  return {ki:bk,mode:bm,name:NAMES[bk],scale:new Set((bm==='major'?MAJ:MIN).map(iv=>(bk+iv)%12))};
}

function snap(midi,scale){
  const pc=midi%12;let n=midi,bd=99;
  for(const s of scale){const d=Math.min(Math.abs(pc-s),12-Math.abs(pc-s));if(d<bd){bd=d;n=midi-pc+s}}
  return Math.max(40,Math.min(84,n)); // wider range: 40-84
}


function buildChords(key){
  const forms=key.mode==='major'
    ?[[0,4,7],[2,5,9],[4,7,11],[5,9,0]]
    :[[0,3,7],[2,5,8],[3,7,10],[5,8,0]];
  return forms.map(ivs=>{
    const root=48+(key.ki+ivs[0])%12;
    return ivs.map((iv,i)=>root+(iv-ivs[0])+(i===0?0:12)); // spread across octaves
  });
}


function buildMelody(commits,key){
  const scale=key.scale;
  const raw=commits.map(c=>{let m=48+Math.floor(c.hour/24*24);return{midi:snap(m,scale),hour:c.hour,i:c.intensity,msg:c.m}});


  const smoothed=[raw[0]];
  for(let i=1;i<raw.length;i++){
    const prev=smoothed[i-1].midi,cur=raw[i].midi,gap=cur-prev;
    if(Math.abs(gap)>4&&Math.random()<0.7){const d=gap>0?1:-1;let nm=prev+d*2;raw[i].midi=snap(nm,scale)}
    if(i>=2){const a=smoothed[i-2].midi,b=prev,c=raw[i].midi;if(Math.abs(c-b)>3&&(c-b)*(b-a)>0)raw[i].midi=snap(b-(c-b),scale)}
    smoothed.push(raw[i]);
  }


  const phrases=[];let ph=[smoothed[0]];
  for(let i=1;i<smoothed.length;i++){if(Math.abs(smoothed[i].hour-smoothed[i-1].hour)>5&&ph.length>=3){phrases.push(ph);ph=[]}ph.push(smoothed[i])}
  if(ph.length)phrases.push(ph);

  const bpm=80,beat=60/bpm,bar=beat*4;
  const pats=[[1,.5,.5,1,.5,.5,1,1],[.75,.25,1,.5,.5,1,.75,.25],[1,1,.5,.5,1,.5,.5,1],[1.5,.5,1,1,.5,.5,1,.5],[2,1,1,2,1,.5,.5]];
  const melody=[];let time=0;
  for(let pi=0;pi<phrases.length;pi++){
    const phr=phrases[pi],pat=pats[pi%5],sc=8/pat.reduce((a,b)=>a+b);
    let ni=0;
    for(const dur of pat.map(p=>p*sc*beat)){if(ni>=phr.length)break;const n=phr[ni],pos=(time%bar)/beat,vel=pos<1?.75:(pos>=2&&pos<3?.6:.4+n.i*.35);melody.push({midi:snap(n.midi,scale),dur:Math.round(dur*1e3)/1e3,vel,t:Math.round(time*1e3)/1e3,msg:n.msg});time+=dur;ni++}
    time=Math.ceil(time/bar)*bar;
  }
  return {melody,totalTime:Math.ceil(time/bar)*bar};
}


function note(freq,dur,vel){
  const ts=Math.floor(Math.max(.02,dur)*SR),out=new Float32Array(ts);
  for(const h of[{m:1,a:.7},{m:2,a:.4},{m:3,a:.18}]){
    const f=freq*h.m*(1+h.m*.0001);
    for(let i=0;i<ts;i++){const t=i/SR,e=t<.003?t/.003:(t<dur*.25?1-.6*(t-.003)/(dur*.25):(t<dur*.8?.4:.4*(1-(t-dur*.8)/(dur*.2))));out[i]+=fastSin(f*t)*h.a*e*vel}
  }
  for(let i=0;i<Math.min(200,ts);i++)out[i]+=(Math.random()*2-1)*Math.exp(-i/200)*vel*.05;
  return out;
}
function padNote(freq,dur,vel){
  const ts=Math.floor(dur*SR),out=new Float32Array(ts);
  for(const m of[1,2,3]){const f=freq*m;for(let i=0;i<ts;i++){const t=i/SR;out[i]+=fastSin(f*(1+.003*fastSin(.5*t))*t)*[.5,.3,.15][m-1]*Math.min(1,t*2)*Math.exp(-t*.2/dur)*vel*.08}}
  return out;
}
function pluck(freq,dur,vel){
  const ts=Math.floor(Math.max(.02,dur)*SR),out=new Float32Array(ts);
  for(const m of[1,2]){const f=freq*m;for(let i=0;i<ts;i++)out[i]+=fastSin(f*i/SR)*[.45,.2][m-1]*Math.exp(-i/SR*(m===1?14:20))*vel}
  return out;
}
function drum(t,f){const ts=Math.floor(t*SR),o=new Float32Array(ts);for(let i=0;i<ts;i++)o[i]=f(i/SR);return o}
function mix(track,buf,off){for(let i=0;i<buf.length&&off+i<track.length;i++){track[off+i]+=buf[i];if(track[off+i]>3)track[off+i]=3;if(track[off+i]<-3)track[off+i]=-3}} // clip protection
function delay(inp,tm,fb,wet){const ln=Math.floor(tm*SR),b=new Float32Array(ln);let idx=0;const o=new Float32Array(inp.length);for(let i=0;i<inp.length;i++){const d=b[idx];o[i]=inp[i]+d*wet;b[idx]=Math.tanh(inp[i]+d*fb);idx=(idx+1)%ln}return o} // tanh on feedback


function render(melody,key,totalTime){
  const beat=0.75,bar=beat*4,TS=Math.floor(totalTime*SR*1.03);
  const t={l:new Float32Array(TS),h:new Float32Array(TS),c:new Float32Array(TS),b:new Float32Array(TS),a:new Float32Array(TS),p:new Float32Array(TS),k:new Float32Array(TS),s:new Float32Array(TS),ht:new Float32Array(TS),cl:new Float32Array(TS)};

  for(const n of melody) mix(t.l, note(440*2**((n.midi-69)/12),n.dur,n.vel), Math.floor(n.t*SR));

  const chords=buildChords(key);
  const sc=[];let tm=0;
  while(tm<totalTime){sc.push({s:tm,e:tm+4*bar,c:((sc.length/3|0)%2)===1});tm+=4*bar}

  for(const sec of sc){
    const sd=sec.e-sec.s,ch=chords[sc.indexOf(sec)%4],isC=sec.c;

    for(const m of ch) mix(t.p, padNote(440*2**((snap(m,key.scale)-69)/12),sd,.15), Math.floor(sec.s*SR));

    const rf=snap(ch[0]-12,key.scale),ff=snap(ch[2]-12,key.scale);
    const pat=[[rf,beat*1.5],[ff,beat*.5],[rf,beat*.5],[snap(ch[0]-24,key.scale),beat*.5],[rf,beat],[ff,beat*.5],[rf,beat*.5],[rf,beat]];
    const plen=pat.reduce((s,p)=>s+p[1],0);let pos=0;
    while(pos<sd){let off=0;for(const p of pat){const[m,d]=p;if(pos+off>=sd)break;mix(t.b,note(440*2**((snap(m,key.scale)-69)/12),d*.85,.6),Math.floor((sec.s+pos+off)*SR));off+=d}pos+=plen}

    const step=beat/3,fs=[];for(let i=0;i<6;i++)fs.push(ch[i%3]);
    for(let i=0;i<sd/step;i++)if(i%3!==1)mix(t.a,pluck(440*2**((snap(fs[i%6],key.scale)-69)/12),step*.3,.1),Math.floor((sec.s+i*step)*SR));

    for(let i=0;i<melody.length;i++){const n=melody[i];if(n.t<sec.s||n.t>=sec.e)continue;if(i%5===0){const target=n.midi-4;let nr=ch[0];for(const cm of ch)if(Math.abs(cm-target)<Math.abs(nr-target))nr=cm;mix(t.h,note(440*2**((snap(nr,key.scale)-69)/12),n.dur*.35,n.vel*.3),Math.floor(n.t*SR))}}

    if(isC)for(let i=0;i<melody.length;i++){const n=melody[i];if(n.t<sec.s||n.t>=sec.e)continue;if(i%9===0){const target=n.midi+7;let nr=ch[0];for(const cm of ch)if(Math.abs(cm-target)<Math.abs(nr-target))nr=cm;mix(t.c,note(440*2**((snap(nr,key.scale)-69)/12),n.dur*.2,n.vel*.15),Math.floor((n.t+beat*.1)*SR))}}

    for(let b16=0;b16<sd/(beat/4);b16++){const t0=sec.s+b16*beat/4,off=Math.floor(t0*SR),p=b16%16;if(p===0||p===8)mix(t.k,drum(.15,t=>fastSin((55+130*Math.exp(-t*18))*t)*Math.exp(-t*8)*.55),off);if(p===4||p===12)mix(t.s,drum(.08,t=>((Math.random()*2-1)*Math.exp(-t*25)*.35+fastSin(200*t)*Math.exp(-t*12)*.2)*Math.exp(-t*5)*.35),off);if(p%2===0&&p!==4&&p!==12)mix(t.ht,drum(.03,t=>(Math.random()*2-1)*Math.exp(-t*70)*.15),off);if(p===12&&(b16/16|0)%2===0)mix(t.cl,drum(.06,t=>((Math.random()*2-1)*Math.exp(-t*25)*.2)*Math.exp(-t*5)*.18),off)}
  }

  const mx=new Float32Array(TS),ld=delay(t.l,.12,.2,.15);
  for(let i=0;i<TS;i++)mx[i]=t.l[i]*1+ld[i]*.15+t.h[i]*.08+t.c[i]*.05+t.a[i]*.2+t.p[i]*.3+t.b[i]*.55+t.k[i]*.6+t.s[i]*.35+t.ht[i]*.15+t.cl[i]*.1;
  const rv=delay(mx,.04,.3,.08);for(let i=0;i<TS;i++)mx[i]+=rv[i]*.06;
  const fl=Math.floor(.2*SR);for(let i=0;i<fl&&i<TS;i++)mx[i]*=i/fl;for(let i=Math.max(0,TS-fl);i<TS;i++)mx[i]*=(TS-i)/fl;
  let pk=0;for(let i=0;i<TS;i++)pk=Math.max(pk,Math.abs(mx[i]));const gn=pk>0?.92/pk:1;
  for(let i=0;i<TS;i++)mx[i]=Math.tanh(mx[i]*gn*1.05);
  return mx;
}


function writeWAV(sp,fp){const N=sp.length,b=Buffer.alloc(44+N*2);b.write('RIFF',0);b.writeUInt32LE(36+N*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*2,40);for(let i=0;i<N;i++)b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.floor(sp[i]*32767))),44+i*2);fs.writeFileSync(fp,b)}


function showCommits(cs){const mxc=Math.max(1,...cs.map(x=>x.i+x.x));log('');for(const c of cs.slice(-8)){const d=new Date(c.d),ts=d.toISOString().slice(5,16).replace('T',' '),ch=c.i+c.x,w=Math.round(ch/mxc*18);log(`  ${K($.Y,c.h)} ${K($.g,ts)} ${K($.G,('+'+c.i).padStart(5))} ${K($.R,('-'+c.x).padStart(5))} ${K($.G,'▐'+'█'.repeat(Math.min(w,12)))+K($.R,'█'.repeat(Math.max(0,w-12)))+K($.g,'░'.repeat(18-Math.abs(w)))} ${K($.W,(c.m||'').slice(0,40))}`)}if(cs.length>8)log(K($.g,`  ··· ${cs.length-8} more ···`))}

function playAnim(wp,melody,totalTime,key){
  const ch=playAudio(wp),st=Date.now(),BL=60,PR=8;
  const mp=Math.min(...melody.map(n=>n.midi)),Mp=Math.max(...melody.map(n=>n.midi)),pr=Mp-mp||12,tpc=totalTime/BL;
  process.stdout.write('\x1b[?25l');
  const iv=setInterval(()=>{const el=(Date.now()-st)/1000;if(el>=totalTime+.5){clearInterval(iv);return}const g=Array.from({length:PR},()=>Array(BL).fill(' ')),nc=Math.floor(el/tpc);for(const n of melody){const col=Math.floor(n.t/tpc),row=PR-1-Math.floor(((n.midi-mp)/pr)*(PR-1));if(col>=0&&col<BL&&row>=0&&row<PR){if(n.t+n.dur<el){g[row][col]=K($.G,n.vel>.6?'█':n.vel>.4?'▓':'▒')}else if(n.t>el+2&&g[row][col]===' '){g[row][col]=K($.g,'·')}}}if(nc>=0&&nc<BL)for(let r=0;r<PR;r++)g[r][nc]=K($.W+$.inv,g[r][nc]===' '?'│':g[r][nc]);const pct=Math.min(100,Math.round(el/totalTime*100)),fi=Math.floor(pct/100*BL);const ls=[];ls.push('');ls.push(`  ${K($.B+$.W,'🎵 GitMuse')}  ${K($.Y,key.name+' '+key.mode)}  ${K($.C,pct+'%')}  ${K($.C,'█'.repeat(fi))}${K($.g,'░'.repeat(BL-fi))}`);for(let r=0;r<PR;r++)ls.push(`  ${K($.g,'│')}${g[r].join('')}${K($.g,'│')}`);ls.push(`  ${K($.g,'└'+'─'.repeat(BL)+'┘')}`);const cn=melody.find(n=>n.t<=el&&n.t+n.dur>=el);if(cn)ls.push(`  ${K($.G,'●')} ${K($.W,(cn.msg||'').slice(0,65))}`);process.stdout.write('\x1b[0J'+ls.join('\n')+'\x1b['+(ls.length+2)+'A')},60);
  return new Promise(r=>ch.on('close',()=>{clearInterval(iv);process.stdout.write('\x1b[?25h\n\n'+K($.G,'  ✓ done')+'\n');r()}));
}


(async()=>{
  const cs=parseGit(repoPath);
  if(!cs.length){log(K($.R,'  no commits'));process.exit(0)}
  showCommits(cs);

  process.stdout.write(K($.g,'  composing...'));
  const key=detectKey(cs); 
  const{melody,totalTime}=buildMelody(cs,key);
  process.stdout.write('\r'+K($.g,'  rendering...'));
  const samples=render(melody,key,totalTime);
  const wp=path.join(repoPath,'.gitmuse.wav');
  writeWAV(samples,wp);
  process.stdout.write('\r\x1b[K');

  const ins=cs.reduce((s,c)=>s+c.i,0),del=cs.reduce((s,c)=>s+c.x,0),ratio=ins/Math.max(del,1);
  let vibe,icon;if(ratio>2){vibe='UPLIFTING';icon='☀️'}else if(ratio<.7){vibe='MOODY';icon='🌙'}else if(cs.filter(c=>[0,6].includes(new Date(c.d).getDay())).length/cs.length>.25){vibe='LAID-BACK';icon='🌴'}else{vibe='DRIVING';icon='⚡'}
  log('');log(`  ${icon} ${K($.C,vibe)} ${K($.g,'·')} ${K($.Y,key.name+' '+key.mode)} ${K($.g,'·')} ${K($.W,cs.length+'c/'+Math.round(totalTime)+'s')} ${K($.g,'·')} ${K($.G,'+'+ins)} ${K($.R,'-'+del)}`);
  log(`  ${K($.g,'wav:')} ${wp}\n`);

  if(NOANIM){playAudio(wp);log(K($.G,'  ✓ playing\n'))}
  else await playAnim(wp,melody,totalTime,key);
})().catch(e=>{process.stdout.write('\x1b[?25h\n');console.error(e);process.exit(1)});
