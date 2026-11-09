(()=>{
"use strict";
const COLS=28,ROWS=31,T=20,W=COLS*T,H=ROWS*T;
const MAP=[
"############################",
"#............##............#",
"#.####.#####.##.#####.####.#",
"#o####.#####.##.#####.####o#",
"#.####.#####.##.#####.####.#",
"#..........................#",
"#.####.##.########.##.####.#",
"#.####.##.########.##.####.#",
"#......##....##....##......#",
"######.##### ## #####.######",
"     #.##### ## #####.#     ",
"     #.##          ##.#     ",
"     #.## ###--### ##.#     ",
"######.## #      # ##.######",
"      .   #      #   .      ",
"######.## #      # ##.######",
"     #.## ######## ##.#     ",
"     #.##          ##.#     ",
"     #.## ######## ##.#     ",
"######.## ######## ##.######",
"#............##............#",
"#.####.#####.##.#####.####.#",
"#.####.#####.##.#####.####.#",
"#o..##.......  .......##..o#",
"###.##.##.########.##.##.###",
"###.##.##.########.##.##.###",
"#......##....##....##......#",
"#.##########.##.##########.#",
"#.##########.##.##########.#",
"#..........................#",
"############################"
].map(r=>r.padEnd(COLS,' ').slice(0,COLS));

/* Dificuldades */
const DIFF={
  easy:  {label:'FÁCIL',  ghost:5.2,frSpeed:3.0,power:9,  scatter:9,chase:12,release:[0,5,10,15],rnd:.30,agg:false},
  medium:{label:'MÉDIO',  ghost:6.4,frSpeed:3.4,power:6,  scatter:6,chase:20,release:[0,3,6,9],  rnd:.06,agg:false},
  hard:  {label:'DIFÍCIL',ghost:7.4,frSpeed:3.8,power:3.5,scatter:3,chase:40,release:[0,1.5,3,4.5],rnd:0,  agg:true}
};
const PAC_SPEED=8;
let cfgKey='medium',cfg=DIFF.medium;

const DIRS=[{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}];
const $=id=>document.getElementById(id);
const cv=$('game'),ctx=cv.getContext('2d'),msg=$('msg');
const dpr=Math.min(window.devicePixelRatio||1,2);
cv.width=W*dpr;cv.height=H*dpr;
const FONT='"Press Start 2P","Courier New",monospace';
const TAU=Math.PI*2;

let grid,dots,pac,ghosts,popups=[];
let score=0,lives=3,level=1,hi=0,frT=0,combo=0,modeT=0,freeze=0,scatter=true,extra=false,waka=0;
let gstate='menu',stateT=0,paused=false,time=0;

/* ---------- Som ---------- */
let AC=null,muted=false;
function audioInit(){
  try{
    if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();
  }catch(e){}
}
function beep(f,d,type,v,slide){
  if(muted||!AC)return;
  try{
    const t0=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
    o.type=type||'square';
    o.frequency.setValueAtTime(f,t0);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t0+d);
    g.gain.setValueAtTime(v||.05,t0);
    g.gain.exponentialRampToValueAtTime(.0001,t0+d);
    o.connect(g);g.connect(AC.destination);
    o.start(t0);o.stop(t0+d);
  }catch(e){}
}

/* ---------- Paredes pré-renderizadas (neon) ---------- */
function makeWalls(col,fill){
  const c=document.createElement('canvas');c.width=W*dpr;c.height=H*dpr;
  const x=c.getContext('2d');x.scale(dpr,dpr);
  const isW=(q,r)=>r<0||r>=ROWS||q<0||q>=COLS||MAP[r][q]==='#';
  x.fillStyle=fill;
  for(let r=0;r<ROWS;r++)for(let q=0;q<COLS;q++)if(MAP[r][q]==='#')x.fillRect(q*T,r*T,T,T);
  x.beginPath();
  for(let r=0;r<ROWS;r++)for(let q=0;q<COLS;q++){
    if(MAP[r][q]!=='#')continue;
    const X=q*T,Y=r*T;
    if(!isW(q,r-1)){x.moveTo(X,Y);x.lineTo(X+T,Y);}
    if(!isW(q,r+1)){x.moveTo(X,Y+T);x.lineTo(X+T,Y+T);}
    if(!isW(q-1,r)){x.moveTo(X,Y);x.lineTo(X,Y+T);}
    if(!isW(q+1,r)){x.moveTo(X+T,Y);x.lineTo(X+T,Y+T);}
  }
  x.lineCap='round';x.lineJoin='round';
  x.strokeStyle=col;x.shadowColor=col;x.shadowBlur=10;x.lineWidth=2.2;x.stroke();
  x.shadowBlur=0;x.lineWidth=1.2;x.stroke();
  for(let r=0;r<ROWS;r++)for(let q=0;q<COLS;q++)if(MAP[r][q]==='-'){
    x.strokeStyle='#ff9ad9';x.shadowColor='#ff9ad9';x.shadowBlur=8;x.lineWidth=3;
    x.beginPath();x.moveTo(q*T,r*T+T/2);x.lineTo(q*T+T,r*T+T/2);x.stroke();
  }
  return c;
}
const walls=makeWalls('#2f5bff','#02021c'),wallsW=makeWalls('#ffffff','#26267a');

/* ---------- Mapas de distância (fantasmas voltam / saem da base) ---------- */
function bfs(tc,tr){
  const d=Array.from({length:ROWS},()=>Array(COLS).fill(Infinity));
  d[tr][tc]=0;const q=[[tc,tr]];
  for(let i=0;i<q.length;i++){
    const c=q[i][0],r=q[i][1];
    for(const dd of DIRS){
      const nr=r+dd.y;if(nr<0||nr>=ROWS)continue;
      const nc=(c+dd.x+COLS)%COLS;
      if(MAP[nr][nc]==='#'||d[nr][nc]!==Infinity)continue;
      d[nr][nc]=d[r][c]+1;q.push([nc,nr]);
    }
  }
  return d;
}
const distHouse=bfs(13,14),distExit=bfs(13,11);

/* ---------- Utilidades ---------- */
const tile=(c,r)=>r<0||r>=ROWS?'#':grid[r][((c%COLS)+COLS)%COLS];
const px=e=>e.c+e.dx*e.t,py=e=>e.r+e.dy*e.t;
const pad=n=>String(n).padStart(6,'0');
const showMsg=h=>{msg.innerHTML=h;msg.classList.remove('hide');};
const hideMsg=()=>msg.classList.add('hide');
function setState(s){gstate=s;stateT=0;}
function loadHi(){try{return +localStorage.getItem('pacHi_'+cfgKey)||0}catch(e){return 0}}
function saveHi(){try{localStorage.setItem('pacHi_'+cfgKey,hi)}catch(e){}}
function scoreHud(){$('score').textContent=pad(score);$('hi').textContent=pad(hi);}
function lifeHud(){$('lives').innerHTML='<i class="life"></i>'.repeat(Math.max(lives,0));}
function levelHud(){$('info').textContent=cfg.label+' · NÍVEL '+level;}
function add(n){
  score+=n;if(score>hi)hi=score;
  if(!extra&&score>=10000){extra=true;lives++;lifeHud();beep(700,.3,'square',.05,600);}
  scoreHud();
}
function menuHTML(){
  return '<div class="btns">'+
    '<button class="btn e" data-d="easy">1 · FÁCIL</button>'+
    '<button class="btn m" data-d="medium">2 · MÉDIO</button>'+
    '<button class="btn h" data-d="hard">3 · DIFÍCIL</button></div>'+
    '<p>SETAS OU WASD · P PAUSA · M SOM<br>CELULAR: DESLIZE O DEDO</p>';
}

/* ---------- Estado do jogo ---------- */
function newGrid(){
  grid=MAP.map(r=>r.split(''));
  const seen=new Set([23*COLS+13]),q=[[13,23]];
  while(q.length){
    const cur=q.pop(),c=cur[0],r=cur[1];
    for(const d of DIRS){
      const nr=r+d.y;if(nr<0||nr>=ROWS)continue;
      const nc=(c+d.x+COLS)%COLS,ch=grid[nr][nc];
      if(ch==='#'||ch==='-'||seen.has(nr*COLS+nc))continue;
      seen.add(nr*COLS+nc);q.push([nc,nr]);
    }
  }
  dots=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const ch=grid[r][c];
    if(ch==='.'||ch==='o'){if(seen.has(r*COLS+c))dots++;else grid[r][c]=' ';}
  }
}
function resetActors(){
  pac={c:13,r:23,dx:0,dy:0,t:0,wx:-1,wy:0,fx:-1,fy:0,anim:0,moving:false};
  const G=(name,color,c,r,corner,state,timer)=>({name,color,c,r,dx:0,dy:0,t:0,state,timer,scared:false,rev:false,corner});
  ghosts=[
    G('blinky','#ff2a2a',13,11,{c:25,r:-3},'normal',0),
    G('pinky','#ff8ce6',13,14,{c:2,r:-3},'house',cfg.release[1]),
    G('inky','#25e6ff',11,14,{c:27,r:31},'house',cfg.release[2]),
    G('clyde','#ffa227',15,14,{c:0,r:31},'house',cfg.release[3])
  ];
  ghosts[0].dx=-1;
  frT=0;combo=0;modeT=0;freeze=0;scatter=true;popups=[];
}
function start(k){
  if(gstate!=='menu'&&gstate!=='over')return;
  cfgKey=DIFF[k]?k:'medium';cfg=DIFF[cfgKey];
  score=0;lives=3;level=1;extra=false;paused=false;
  hi=loadHi();audioInit();
  newGrid();resetActors();hideMsg();setState('ready');
  scoreHud();lifeHud();levelHud();
}
function gameOver(){
  saveHi();setState('over');
  showMsg('<h1 class="red">GAME OVER</h1><p>PONTOS: '+pad(score)+'</p><p>JOGAR DE NOVO:</p>'+menuHTML());
}

/* ---------- Pac-Man ---------- */
const can=(c,r,dx,dy)=>{const ch=tile(c+dx,r+dy);return ch!=='#'&&ch!=='-';};
function eatAt(c,r){
  const ch=grid[r][c];
  if(ch==='.'){grid[r][c]=' ';add(10);dots--;waka^=1;beep(waka?260:340,.05,'square',.04);}
  else if(ch==='o'){grid[r][c]=' ';add(50);dots--;power();}
  else return;
  if(dots<=0){saveHi();setState('clear');}
}
function power(){
  combo=0;frT=Math.max(2,cfg.power-(level-1)*0.7);
  beep(180,.35,'sawtooth',.05,500);
  ghosts.forEach(g=>{
    if(g.state==='eaten')return;
    g.scared=true;
    if(g.state==='normal'){
      if(g.t>0){g.c=(g.c+g.dx+COLS)%COLS;g.r+=g.dy;g.t=1-g.t;g.dx=-g.dx;g.dy=-g.dy;}
      else g.rev=true;
    }
  });
}
function movePac(dt){
  pac.moving=false;
  if(pac.t>0&&(pac.wx||pac.wy)&&pac.wx===-pac.dx&&pac.wy===-pac.dy){
    pac.c=(pac.c+pac.dx+COLS)%COLS;pac.r+=pac.dy;pac.t=1-pac.t;pac.dx=-pac.dx;pac.dy=-pac.dy;
  }
  let rem=PAC_SPEED*dt,g=0;
  while(rem>1e-9&&g++<8){
    if(pac.t===0){
      if((pac.wx||pac.wy)&&can(pac.c,pac.r,pac.wx,pac.wy)){pac.dx=pac.wx;pac.dy=pac.wy;}
      if((pac.dx||pac.dy)&&!can(pac.c,pac.r,pac.dx,pac.dy)){pac.dx=pac.dy=0;}
      if(!pac.dx&&!pac.dy)break;
    }
    pac.moving=true;
    const s=Math.min(rem,1-pac.t);pac.t+=s;rem-=s;
    pac.fx=pac.dx;pac.fy=pac.dy;
    if(pac.t>=0.99999){pac.c=(pac.c+pac.dx+COLS)%COLS;pac.r+=pac.dy;pac.t=0;}
  }
  if(pac.moving)pac.anim+=dt*18;
  const half=pac.t>=.5&&(pac.dx||pac.dy);
  eatAt(half?(pac.c+pac.dx+COLS)%COLS:pac.c, half?pac.r+pac.dy:pac.r);
}

/* ---------- Fantasmas ---------- */
function target(g){
  if(scatter)return g.corner;
  const pc=pac.c,pr=pac.r,fx=pac.fx,fy=pac.fy;
  switch(g.name){
    case 'blinky':return {c:pc,r:pr};
    case 'pinky':return {c:pc+fx*4,r:pr+fy*4};
    case 'inky':{const b=ghosts[0];return {c:2*(pc+fx*2)-b.c,r:2*(pr+fy*2)-b.r};}
    default:return (cfg.agg||Math.hypot(g.c-pc,g.r-pr)>8)?{c:pc,r:pr}:g.corner;
  }
}
function chooseDir(g){
  const pass=d=>{const ch=tile(g.c+d.x,g.r+d.y);return ch!=='#'&&(ch!=='-'||g.state==='leave'||g.state==='eaten');};
  if(g.state==='eaten'||g.state==='leave'){
    const map=g.state==='eaten'?distHouse:distExit;
    let best=null,bd=Infinity;
    for(const d of DIRS){
      if(!pass(d))continue;
      const v=map[g.r+d.y][(g.c+d.x+COLS)%COLS];
      if(v<bd){bd=v;best=d;}
    }
    if(best){g.dx=best.x;g.dy=best.y;}else{g.dx=g.dy=0;}
    return;
  }
  if(g.rev){
    g.rev=false;
    const rd={x:-g.dx,y:-g.dy};
    if((rd.x||rd.y)&&pass(rd)){g.dx=rd.x;g.dy=rd.y;return;}
  }
  let opts=DIRS.filter(d=>pass(d)&&!(d.x===-g.dx&&d.y===-g.dy));
  if(!opts.length)opts=DIRS.filter(pass);
  if(!opts.length){g.dx=g.dy=0;return;}
  let best;
  if(g.scared||Math.random()<cfg.rnd)best=opts[(Math.random()*opts.length)|0];
  else{
    const tg=target(g);let bd=Infinity;
    for(const d of opts){
      const dd=(g.c+d.x-tg.c)**2+(g.r+d.y-tg.r)**2;
      if(dd<bd){bd=dd;best=d;}
    }
  }
  g.dx=best.x;g.dy=best.y;
}
function gSpeed(g){
  if(g.state==='eaten')return 16;
  if(g.state==='leave')return 4.5;
  let s=g.scared?cfg.frSpeed:Math.min(7.9,cfg.ghost+0.25*(level-1));
  if(g.r===14&&(g.c<6||g.c>21))s*=0.55;
  return s;
}
function moveGhost(g,dt){
  if(g.state==='house'){g.timer-=dt;if(g.timer<=0)g.state='leave';return;}
  let rem=gSpeed(g)*dt,n=0;
  while(rem>1e-9&&n++<8){
    if(g.t===0){
      if(g.state==='leave'&&g.c===13&&g.r===11)g.state='normal';
      if(g.state==='eaten'&&g.c===13&&g.r===14){
        g.state='house';g.timer=4;g.scared=false;g.dx=g.dy=0;return; // espera 4s na base
      }
      chooseDir(g);
      if(!g.dx&&!g.dy)return;
    }
    const s=Math.min(rem,1-g.t);g.t+=s;rem-=s;
    if(g.t>=0.99999){g.c=(g.c+g.dx+COLS)%COLS;g.r+=g.dy;g.t=0;}
  }
}
function collisions(){
  const ax=px(pac),ay=py(pac);
  for(const g of ghosts){
    if(g.state==='house'||g.state==='eaten')continue;
    let ddx=Math.abs(ax-px(g));ddx=Math.min(ddx,COLS-ddx);
    if(Math.hypot(ddx,ay-py(g))<0.6){
      if(g.scared){
        const pts=200*Math.pow(2,combo);combo++;
        g.scared=false;g.state='eaten';add(pts);freeze=0.5;
        popups.push({x:px(g),y:py(g),txt:String(pts),life:1});
        beep(400,.25,'square',.06,900);
      }else{
        pac.moving=false;setState('dying');
        beep(500,1.2,'sawtooth',.06,-450);
        return;
      }
    }
  }
}

/* ---------- Atualização (passo fixo de 1/120 s) ---------- */
function step(dt){
  stateT+=dt;
  if(gstate==='ready'){if(stateT>=2)setState('play');return;}
  if(gstate==='dying'){
    if(stateT>=2){
      lives--;lifeHud();
      if(lives<=0)gameOver();else{resetActors();setState('ready');}
    }
    return;
  }
  if(gstate==='clear'){
    if(stateT>=2.4){level++;levelHud();newGrid();resetActors();setState('ready');}
    return;
  }
  if(gstate!=='play')return;
  if(freeze>0){freeze-=dt;return;}
  if(frT<=0)modeT+=dt;
  scatter=(modeT%(cfg.scatter+cfg.chase))<cfg.scatter;
  movePac(dt);
  if(gstate!=='play')return;
  for(const g of ghosts)moveGhost(g,dt);
  if(frT>0){frT-=dt;if(frT<=0){frT=0;ghosts.forEach(g=>g.scared=false);}}
  collisions();
}

/* ---------- Desenho ---------- */
function wrapDraw(e,fn){
  const X=px(e),Y=py(e);
  for(const o of [-COLS,0,COLS]){
    const x=(X+o+.5)*T;
    if(x<-T||x>W+T)continue;
    fn(e,x,(Y+.5)*T);
  }
}
function drawDots(){
  const pulse=0.75+0.25*Math.sin(time*9);
  ctx.fillStyle='#ffe3b8';
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const ch=grid[r][c];
    if(ch==='.'){ctx.beginPath();ctx.arc(c*T+T/2,r*T+T/2,2,0,TAU);ctx.fill();}
    else if(ch==='o'){
      ctx.save();ctx.shadowColor='#fff3c0';ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(c*T+T/2,r*T+T/2,T*0.24*pulse+1.5,0,TAU);ctx.fill();ctx.restore();
    }
  }
}
function drawPacman(e,cx,cy){
  const r=T*.46;
  let ang=Math.atan2(e.fy,e.fx),m;
  if(gstate==='dying'){
    const p=Math.max(0,(stateT-.4)/1.4);
    if(p>=1)return;
    ang=-Math.PI/2;m=.1+p*(Math.PI-.1);
  }else m=e.moving?.05+.7*Math.abs(Math.sin(e.anim)):.3;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);
  const gr=ctx.createRadialGradient(-r*.3,-r*.3,1,0,0,r);
  gr.addColorStop(0,'#fff6a0');gr.addColorStop(.5,'#ffe100');gr.addColorStop(1,'#ffa800');
  ctx.shadowColor='#ffc400';ctx.shadowBlur=12;ctx.fillStyle=gr;
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,m,TAU-m);ctx.closePath();ctx.fill();
  if(gstate!=='dying'){
    ctx.shadowBlur=0;ctx.fillStyle='#1a1a1a';ctx.beginPath();
    ctx.arc(r*.1,Math.cos(ang)<-.5?r*.5:-r*.5,r*.11,0,TAU);ctx.fill();
  }
  ctx.restore();
}
function drawGhost(g,cx,cy0){
  const r=T*.46,eaten=g.state==='eaten';
  const cy=cy0+(g.state==='house'?Math.sin(time*7+g.c)*2:0);
  const flash=g.scared&&frT<1.6&&Math.floor(time*8)%2===0;
  ctx.save();
  if(!eaten){
    const col=g.scared?(flash?'#ffffff':'#2437ff'):g.color;
    ctx.shadowColor=col;ctx.shadowBlur=12;ctx.fillStyle=col;
    const b=cy+r*.9,ph=Math.floor(time*8)%2;
    ctx.beginPath();ctx.arc(cx,cy-r*.1,r,Math.PI,0);ctx.lineTo(cx+r,b);
    for(let i=1;i<=6;i++)ctx.lineTo(cx+r-i*r/3,b-(((i+ph)%2)?r*.3:0));
    ctx.closePath();ctx.fill();
  }
  ctx.shadowBlur=0;
  if(g.scared&&!eaten){
    ctx.fillStyle=flash?'#e2222a':'#ffd2b8';
    ctx.fillRect(cx-r*.5,cy-r*.35,r*.25,r*.25);ctx.fillRect(cx+r*.25,cy-r*.35,r*.25,r*.25);
    ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx-r*.65,cy+r*.45);
    for(let i=1;i<=6;i++)ctx.lineTo(cx-r*.65+i*r*.217,cy+r*((i%2)?.2:.45));
    ctx.stroke();
  }else{
    for(const s of [-1,1]){
      ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(cx+s*r*.4,cy-r*.2,r*.28,r*.34,0,0,TAU);ctx.fill();
      ctx.fillStyle='#1b3cff';ctx.beginPath();
      ctx.arc(cx+s*r*.4+g.dx*r*.13,cy-r*.2+g.dy*r*.16,r*.15,0,TAU);ctx.fill();
    }
  }
  ctx.restore();
}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const fl=gstate==='clear'&&Math.floor(stateT*5)%2===1;
  ctx.drawImage(fl?wallsW:walls,0,0,W,H);
  drawDots();
  if(gstate!=='clear'&&!(gstate==='dying'&&stateT>0.8))ghosts.forEach(g=>wrapDraw(g,drawGhost));
  wrapDraw(pac,drawPacman);
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const p of popups){
    ctx.globalAlpha=Math.max(0,Math.min(1,p.life*2));
    ctx.font='bold 10px '+FONT;ctx.fillStyle='#4df0ff';
    ctx.fillText(p.txt,(p.x+.5)*T,(p.y+.5)*T-(1-p.life)*14);
  }
  ctx.globalAlpha=1;
  if(gstate==='ready'){
    ctx.font='bold 13px '+FONT;ctx.fillStyle='#ffe100';ctx.shadowColor='#ffb300';ctx.shadowBlur=10;
    ctx.fillText('PRONTO!',W/2,17.5*T);ctx.shadowBlur=0;
  }
}

/* ---------- Controles ---------- */
const KM={arrowleft:[-1,0],a:[-1,0],arrowright:[1,0],d:[1,0],arrowup:[0,-1],w:[0,-1],arrowdown:[0,1],s:[0,1]};
const setDir=d=>{pac.wx=d[0];pac.wy=d[1];};
function setPause(v){
  if(gstate!=='play'&&gstate!=='ready')return;
  paused=v;
  if(v)showMsg('<h1>PAUSA</h1><p class="blink">P OU TOQUE PARA CONTINUAR</p>');else hideMsg();
}
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(KM[k]){e.preventDefault();setDir(KM[k]);return;}
  if(k==='1'||k==='2'||k==='3'){
    if(gstate==='menu'||gstate==='over')start(['easy','medium','hard'][+k-1]);
    return;
  }
  if(k==='enter'||k===' '){
    e.preventDefault();
    if(gstate==='menu'||gstate==='over')start(cfgKey);else if(paused)setPause(false);
    return;
  }
  if(k==='p'||k==='escape'){setPause(!paused);return;}
  if(k==='m')muted=!muted;
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused)setPause(true);});
msg.addEventListener('click',e=>{
  const b=e.target.closest?e.target.closest('[data-d]'):null;
  if(b){start(b.getAttribute('data-d'));return;}
  if(paused)setPause(false);
});
let tx=0,ty=0;
cv.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];tx=t.clientX;ty=t.clientY;},{passive:false});
cv.addEventListener('touchmove',e=>{
  e.preventDefault();
  const t=e.touches[0],dx=t.clientX-tx,dy=t.clientY-ty;
  if(Math.hypot(dx,dy)>20){
    setDir(Math.abs(dx)>Math.abs(dy)?[dx>0?1:-1,0]:[0,dy>0?1:-1]);
    tx=t.clientX;ty=t.clientY;
  }
},{passive:false});

/* ---------- Início ---------- */
hi=loadHi();
newGrid();resetActors();scoreHud();lifeHud();levelHud();
showMsg('<h1>PAC-MAN</h1><p>ESCOLHA A DIFICULDADE</p>'+menuHTML());

const STEP=1/120;
let last=0,acc=0;
function loop(ts){
  let dt=(ts-last)/1000;last=ts;
  if(!(dt>0)||dt>0.1)dt=0.016;
  time+=dt;
  popups=popups.filter(p=>(p.life-=dt)>0);
  if(!paused){
    acc+=dt;let n=0;
    while(acc>=STEP&&n++<20){step(STEP);acc-=STEP;}
    if(n>=20)acc=0;
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

})();
