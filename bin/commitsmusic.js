#!/usr/bin/env node
/** commitsmusic — git commit history → music */

const fs=require('fs'),path=require('path');
const{generate,writeWav}=require('../src/engine');
const{playWithAnimation}=require('../src/animation');
const{spawn}=require('child_process');

// Terminal styling
const CSI='\x1b[';
const fg=c=>CSI+'38;5;'+c+'m';
const dim=CSI+'2m';
const bold=CSI+'1m';
const reset=CSI+'0m';

// ═══ Parse CLI args ══════════════════════════════════════════
const args=process.argv.slice(2);

let mode='direct';
let repo='.';
let nCommits=30;
let animate=true;

for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='tui'){mode='tui';continue}
  if(a==='-noan'||a==='--no-animation'){animate=false;continue}
  if(a.startsWith('-')&&!isNaN(a.slice(1))){nCommits=parseInt(a.slice(1));continue}
  if(!a.startsWith('-')){repo=a;continue}
}

// Resolve repo path
repo=path.resolve(repo);

if(mode==='tui'){
  runTUI();
}else{
  runDirect(repo,nCommits,animate);
}

// ═══ Direct Mode ════════════════════════════════════════════
async function runDirect(repo,n,anim){
  try{
    console.log(`\n  ${bold}commitsmusic${reset} — ${dim}${repo}${reset}\n`);
    
    const res=generate(repo,n);
    const{key,totalTime,mel,acc,chordSeq,samples,commitNotes,cs}=res;
    
    console.log(`  Key: ${fg(220)}${key.name} ${key.mode}${reset}  |  ${cs.length}c → ${mel.length}n → ${Math.round(totalTime)}s`);
    console.log(`  Chords: ${chordSeq.join(' → ')}`);
    
    // Write WAV
    const wavPath=path.join(repo,'.commitsmusic.wav');
    writeWav(samples,wavPath);
    console.log(`  wav: ${dim}${wavPath}${reset}\n`);
    
    if(anim){
      console.log('  Playing with animation... (q to quit)\n');
      await new Promise(r=>setTimeout(r,500));
      await playWithAnimation(samples,mel,commitNotes,totalTime,wavPath,key,cs.length);
    }else{
      console.log('  Playing...');
      spawn('afplay',[wavPath],{stdio:'ignore'});
      await new Promise(r=>setTimeout(r,totalTime*1000+500));
    }
    
    // Ask to save
    await askSave(wavPath);
  }catch(e){
    console.error(`  Error: ${e.message}`);
    process.exit(1);
  }
}

// ═══ Save Prompt ════════════════════════════════════════════
function askSave(wavPath){
  return new Promise((resolve)=>{
    const rl=require('readline').createInterface({input:process.stdin,output:process.stdout});
    rl.question(`\n  Save audio? [y/N/path]: `,(ans)=>{
      rl.close();
      if(!ans||ans.toLowerCase()==='n'){
        fs.unlinkSync(wavPath);
        console.log('  Deleted.\n');
      }else if(ans.toLowerCase()==='y'){
        console.log(`  Saved: ${wavPath}\n`);
      }else{
        const dest=path.resolve(ans);
        fs.copyFileSync(wavPath,dest);
        fs.unlinkSync(wavPath);
        console.log(`  Saved: ${dest}\n`);
      }
      resolve();
    });
  });
}

// ═══ TUI Mode ════════════════════════════════════════════════
function runTUI(){
  const{spawnSync}=require('child_process');
  const tuiScript=path.join(__dirname,'..','src','tui.js');
  const{status}=spawnSync(process.execPath,[tuiScript,...process.argv.slice(3)],{stdio:'inherit'});
  process.exit(status||0);
}
