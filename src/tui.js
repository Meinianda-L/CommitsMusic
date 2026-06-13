#!/usr/bin/env node
/** commitsmusic TUI — blessed selector → engine → animation */

const blessed=require('blessed');
const fs=require('fs'),path=require('path');
const{generate,writeWav}=require('./engine');
const{playWithAnimation}=require('./animation');
const{spawn}=require('child_process');

// ═══ Find repos ═════════════════════════════════════════════
function findRepos(){
  const dirs=[];
  function scan(dir,d=0){
    if(d>3)return;
    try{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(e.name.startsWith('.'))continue;
      const fp=path.join(dir,e.name);
      if(e.isDirectory()){try{if(fs.existsSync(path.join(fp,'.git')))dirs.push(fp);else scan(fp,d+1)}catch(_){}}
    }}catch(_){}
  }
  const home=process.env.HOME||'/Users/'+process.env.USER;
  scan(home,1);scan(path.join(home,'Desktop'),2);
  const cwd=process.cwd();
  if(!dirs.includes(cwd)&&fs.existsSync(path.join(cwd,'.git')))dirs.unshift(cwd);
  return dirs.length?dirs:[cwd];
}

const repos=findRepos();
const state={repo:repos[0],nCommits:30,animate:true};

function dim(s){return s.length>80?'...'+s.slice(-77):s}

// ═══ Screen ═════════════════════════════════════════════════
const screen=blessed.screen({smartCSR:true,title:'commitsmusic',fullUnicode:true});

const header=blessed.box({
  top:0,left:0,width:'100%',height:2,
  content:'{bold}{yellow-fg}  ♪ commitsmusic{/yellow-fg}{/bold}  {grey-fg}turn git history into music{/grey-fg}',
  tags:true,
});

const repoList=blessed.list({
  top:3,left:2,width:'100%-4',height:Math.min(9,repos.length+2),
  label:'{bold} Repository {/bold}',
  items:repos.map(r=>path.basename(r)+'  '+dim(r)),
  keys:true,vi:true,
  style:{selected:{fg:'black',bg:'yellow'},item:{fg:'white',bg:'black'}},
  border:{type:'line',fg:'cyan'},
  tags:true,
});
repoList.on('select',(_,idx)=>{state.repo=repos[idx];updateInfo()});

const infoBox=blessed.box({
  top:13,left:2,width:'100%-4',height:4,shrink:true,
  border:{type:'line',fg:'cyan'},
  tags:true,
});
function updateInfo(){
  const bar='█'.repeat(Math.min(state.nCommits/10,15))+'░'.repeat(Math.max(0,15-Math.floor(state.nCommits/10)));
  infoBox.setContent(
    `{bold}Commits:{/bold} {yellow-fg}${state.nCommits}{/yellow-fg}  ${bar}\n`+
    `{bold}Animation:{/bold} ${state.animate?'{green-fg}ON{/green-fg}':'{red-fg}OFF{/red-fg}'}\n`+
    `{cyan-fg}${dim(state.repo)}{/cyan-fg}`
  );
  screen.render();
}
updateInfo();

const helpBox=blessed.box({
  bottom:3,left:0,width:'100%',height:2,
  content:'{grey-fg}  ↑↓ repo  ←→ commits  a toggle anim  Enter GENERATE  q quit{/grey-fg}',
  tags:true,
});

const genBtn=blessed.box({
  bottom:1,left:'center',width:24,height:1,
  content:'{black-fg}{yellow-bg}  ▶  GENERATE  {/yellow-bg}{/black-fg}',
  tags:true,align:'center',
});

screen.append(header);screen.append(repoList);screen.append(infoBox);
screen.append(helpBox);screen.append(genBtn);

screen.key(['left','h'],()=>{state.nCommits=Math.max(10,state.nCommits-10);updateInfo()});
screen.key(['right','l'],()=>{state.nCommits=Math.min(500,state.nCommits+10);updateInfo()});
screen.key(['a'],()=>{state.animate=!state.animate;updateInfo()});
screen.key(['q','C-c'],()=>{screen.destroy();process.exit(0)});
screen.key(['enter'],()=>runGenerate());

screen.render();repoList.focus();

// ═══ Generate & Play ════════════════════════════════════════
async function runGenerate(){
  screen.destroy();
  try{
    console.log(`\n  {bold}commitsmusic{/bold} — ${dim(state.repo)}\n`.replace(/\{(\/?)\w+(-\w+)?\}/g,''));
    const res=generate(state.repo,state.nCommits);
    const{key,totalTime,mel,chordSeq,samples,commitNotes,cs}=res;
    console.log(`  Key: ${key.name} ${key.mode}  |  ${cs.length}c → ${mel.length}n → ${Math.round(totalTime)}s`);
    console.log(`  Chords: ${chordSeq.join(' → ')}`);
    const wavPath=path.join(state.repo,'.commitsmusic.wav');
    writeWav(samples,wavPath);
    console.log(`  wav: ${wavPath}\n`);

    if(state.animate){
      console.log('  Playing... (q to quit)\n');
      await new Promise(r=>setTimeout(r,800));
      await playWithAnimation(samples,mel,commitNotes,totalTime,wavPath,key,cs.length);
    }else{
      console.log('  Playing...');
      spawn('afplay',[wavPath],{stdio:'ignore'});
      await new Promise(r=>setTimeout(r,totalTime*1000+500));
    }

    // Save prompt
    const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});
    rl.question('\n  Save audio? [y/N/path]: ',(a)=>{
      rl.close();
      if(!a||a.toLowerCase()==='n'){fs.unlinkSync(wavPath);console.log('  Deleted.')}
      else if(a.toLowerCase()==='y'){console.log(`  Saved: ${wavPath}`)}
      else{const d=path.resolve(a);fs.copyFileSync(wavPath,d);fs.unlinkSync(wavPath);console.log(`  Saved: ${d}`)}
      process.exit(0);
    });
  }catch(e){
    console.error(`  Error: ${e.message}`);
    process.exit(1);
  }
}
