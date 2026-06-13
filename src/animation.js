/** commitsmusic — unbound timeline → smooth transition → piano roll */

const { spawn } = require('child_process');

const R='\x1b[0m',FG=c=>`\x1b[38;5;${c}m`,BG=c=>`\x1b[48;5;${c}m`;
const B='\x1b[1m',D='\x1b[2m';
const AS='\x1b[?1049h',AE='\x1b[?1049l',HI='\x1b[?25l',SH='\x1b[?25h';
const HOME='\x1b[H',SB='\x1b[?2026h',SE='\x1b[?2026l';

function noteColor(midi){
  const t=(midi-38)/46;
  const r=Math.floor(55+t*150),g=Math.floor(60+t*130),b=Math.floor(130-t*60);
  return `\x1b[38;2;${Math.min(255,r)};${Math.min(255,g)};${Math.min(255,b)}m`;
}

function playWithAnimation(samples,melody,commitNotes,totalTime,wavPath,key,nCommits){
  return new Promise(async resolve=>{

    const allCommits=[],seen=new Set();
    for(const n of melody.filter(x=>!x.tp)){
      const id=n.msg+n.t;
      if(!seen.has(id)){seen.add(id);allCommits.push(n)}
    }
    allCommits.sort((a,b)=>a.t-b.t);
    const notes=allCommits.map(n=>({t:n.t,dur:n.dur,midi:n.midi,msg:n.msg||'',au:n.au||'?',files:n.files||[]}));

    let player=null,quit=false;
    process.stdout.write(AS+HI);
    const wr=process.stdin.isRaw;
    if(process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('data',d=>{if(d[0]===113||d[0]===3)quit=true});

    const W=()=>process.stdout.columns||80,H=()=>process.stdout.rows||24;

    // ═══ Timeline — scrolls freely, no cap ═══
    const introTime=Math.min(5,totalTime*.35);
    const per=Math.max(0.04,introTime/allCommits.length);
    const tlX=Math.floor(W()*0.15);

    for(let cursor=0;cursor<allCommits.length;cursor++){
      if(quit){clean();resolve();return}
      const w=W(),h=H();
      const rows=[];

      // Header
      rows.push(center(`${B}${FG(220)}◈ commitsmusic${R}  ${D}git timeline${R}`,w));
      rows.push(wfix(D+'╌'.repeat(w)+R,w));

      // Show all commits from 0..cursor, newest at bottom, scroll up
      const start=0; // NO cap — show everything
      const count=cursor+1;
      // Position: newest commit fixed near bottom, older ones scroll off top
      const bottomPad=4; // rows reserved for progress bar
      const firstVisibleRow=2; // after header+sep
      const lastVisibleRow=h-bottomPad-1;
      const avail=lastVisibleRow-firstVisibleRow+1;

      // Each commit takes 2 rows (text + vertical line)
      // Newest commit is at lastVisibleRow
      // Scroll: as count grows, commits push up
      const newestRow=lastVisibleRow-1; // commit at this row
      const startRow=newestRow-(count-1)*2;

      for(let i=0;i<count;i++){
        const ci=start+i;
        const c=allCommits[ci];
        const isCurrent=ci===cursor;
        const row=startRow+i*2;
        
        if(row<firstVisibleRow) continue; // scrolled off top
        if(row>lastVisibleRow) continue;  // below viewport
        
        // Fill space before this row
        while(rows.length<row) rows.push('');
        
        const age=(cursor-ci)/Math.max(1,cursor); // 0=newest, 1=oldest
        const bright=Math.floor(248-age*80); // fade older commits
        const dot=isCurrent?B+FG(220)+'●'+R:D+FG(bright)+'○'+R;
        const msg=c.msg.slice(0,w-tlX-25);
        const msgColor=isCurrent?FG(226):FG(bright);
        
        rows.push(`${wfix('',tlX)}${dot} ${D}${FG(240)}${isCurrent?'┣':'│'}${R} ${msgColor}${isCurrent?B:''}${msg}${R}`);
        
        // Vertical connector below (if not last)
        if(i<count-1&&row+1<=lastVisibleRow){
          while(rows.length<row+1) rows.push('');
          rows.push(`${wfix('',tlX)}   ${D}${FG(240)}│${R}`);
        }
      }

      // Fill to bottom
      while(rows.length<h-3) rows.push('');

      // Progress
      const pct=(cursor+1)/allCommits.length;
      const bw=Math.min(w-12,40);
      const done=Math.floor(pct*bw);
      rows.push(center(`${FG(220)}${'━'.repeat(done)}${FG(236)}${'─'.repeat(bw-done)}${R}`,w));
      rows.push(center(`${D}${cursor+1}/${allCommits.length}${R}`,w));

      process.stdout.write(SB+HOME+rows.join('\n')+'\x1b[J'+SE);
      await sleep(per*1000);
    }
    if(quit){clean();resolve();return}

    // ═══ Cinematic transition: flash → blackout → reveal ═══
    // 1. Flash: all commit dots light up
    {
      const w=W(),h=H();
      const rows=[];
      rows.push(center(`${B}${FG(220)}◈ commitsmusic${R}  ${B}${FG(226)}${allCommits.length} commits loaded${R}`,w));
      rows.push(wfix(D+'╌'.repeat(w)+R,w));
      const show=Math.min(allCommits.length,h-6);
      for(let j=0;j<show;j++){
        const c=allCommits[j];
        rows.push(`${wfix('',tlX)}  ${FG(220)}●${R} ${FG(226)}${c.msg.slice(0,w-tlX-20)}${R}`);
      }
      while(rows.length<h-2) rows.push('');
      rows.push(center(`${FG(220)}▶${R}`,w));
      process.stdout.write(SB+HOME+rows.join('\n')+'\x1b[J'+SE);
      await sleep(400);
    }
    // 2. Blackout
    {
      const w=W(),h=H();
      process.stdout.write(SB+HOME+Array(h).fill(wfix('',w)).join('\n')+'\x1b[J'+SE);
      await sleep(200);
    }

    // ═══ Piano Roll ═══
    try{player=spawn('afplay',[wavPath],{stdio:'ignore'})}catch(_){}
    const t0=Date.now();
    let active=null;

    const iv=setInterval(()=>{
      if(quit){clean();resolve();clearInterval(iv);return}
      const el=(Date.now()-t0)/1000;
      if(el>totalTime+1.5){clean();resolve();clearInterval(iv);return}

      const w=W(),h=H(),hitX=Math.floor(w*0.18);
      const ROLL=Math.max(3,h-11),miLo=38,miHi=84,spc=2.2/(w-hitX-4);

      for(const n of notes){if(n.t<=el)active=n;else break}

      const rows=[];
      rows.push(wfix(`${B}${FG(220)}◈ commitsmusic${R}  ${FG(226)}${key.name} ${key.mode}${R}  ${B}${nCommits}c${R}  ${Math.round(totalTime)}s`,w));
      rows.push(wfix(D+'╌'.repeat(w)+R,w));

      for(let r=0;r<ROLL;r++){
        const midi=Math.round(miHi-r/(ROLL-1)*(miHi-miLo));
        const isRoot=midi%12===0,isFifth=midi%12===7;
        rows.push(isRoot?wfix(FG(238)+'·'+FG(234)+'·'.repeat(w-2)+R,w)
          :isFifth?wfix(FG(234)+'·'.repeat(w)+R,w):wfix('',w));
      }

      for(const n of notes){
        const dt=n.t-el;
        let x=hitX+Math.round(dt/spc),dw=Math.max(1,Math.round(n.dur/spc));
        if(x<hitX){dw-=(hitX-x);x=hitX}
        if(x>=w||dw<1)continue;
        const ww=Math.min(dw,w-x);
        const r=Math.round((miHi-n.midi)/(miHi-miLo)*(ROLL-1));
        if(r<0||r>=ROLL)continue;
        const ri=2+r,raw=rows[ri].replace(/\x1b\[[^m]*m/g,'');
        rows[ri]=wfix(raw.slice(0,x)+noteColor(n.midi)+'█'.repeat(ww)+R+raw.slice(x+ww),w);
      }

      for(let r=0;r<ROLL;r++){
        const ri=2+r,raw=rows[ri].replace(/\x1b\[[^m]*m/g,'');
        rows[ri]=wfix(raw.slice(0,hitX)+B+FG(15)+BG(236)+'║'+R+raw.slice(hitX+1),w);
      }

      rows.push(wfix(D+'╌'.repeat(w)+R,w));

      for(let i=0;i<6;i++){
        let t='';
        if(active){
          if(i===0) t=`  ${B}${FG(220)}${active.msg.slice(0,w-6)}`;
          else if(i===1) t=`  ${FG(248)}${D}by ${active.au}`;
          else if(i===2&&active.files&&active.files.length)
            t=`  ${FG(242)}${active.files.slice(0,5).join(' · ').slice(0,w-6)}`;
        }
        rows.push(wfix(t+R,w));
      }

      const pct=Math.min(1,el/totalTime),bw=w-18,f=Math.floor(pct*bw);
      const ti=`${pad2(Math.floor(el/60))}:${pad2(Math.floor(el%60))} / ${pad2(Math.floor(totalTime/60))}:${pad2(Math.floor(totalTime%60))}`;
      rows.push(`  ${FG(220)}${'▐'.repeat(f)}${D}${'▬'.repeat(bw-f)}${R}  ${FG(248)}${ti}${R}`);

      process.stdout.write(SB+HOME+rows.join('\n')+'\x1b[J'+SE);
    },67);

    function clean(){
      clearInterval(iv);if(player)player.kill();
      process.stdin.setRawMode(wr);process.stdout.write(SH+AE);
    }
  });
}

function wfix(s,W,ch=' '){const c=s.replace(/\x1b\[[^;]*m/g,'');return s+ch.repeat(Math.max(0,W-c.length))}
function pad2(n){return String(n).padStart(2,'0')}
function center(s,w){const c=s.replace(/\x1b\[[^;]*m/g,'');const p=Math.floor((w-c.length)/2);return ' '.repeat(Math.max(0,p))+s}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

module.exports={playWithAnimation};
