// Street Racer — script.js
// Simple endless top-down racer using canvas.
// Controls: ArrowLeft/ArrowRight or A/D to steer, Space to brake, R to restart.

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  // UI
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnPause = document.getElementById('btnPause');
  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highScore');

  // HiDPI
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Game config
  const LANE_COUNT = 3;
  let laneWidth;
  const ROAD_PADDING = 40;
  let speed = 220;        // px/s forward speed (visual)
  let speedFactor = 1;    // increases over time
  const MAX_SPEED = 1200;
  let spawnTimer = 0;
  let spawnInterval = 1.0; // seconds initial
  let obstacles = [];
  let particles = [];

  // Player
  const player = {
    lane: 1,             // 0..LANE_COUNT-1
    x: 0,
    y: 0,
    width: 48,
    height: 90,
    targetX: 0,
    steerX: 0,
    steerSpeed: 10,    // how fast car slides to lane
    braking: false,
    alive: true
  };

  // Game state
  let lastTime = performance.now()/1000;
  let running = false;
  let paused = false;
  let distance = 0;
  let score = 0;
  let highScore = parseInt(localStorage.getItem('streetRacerHigh') || '0', 10);

  highEl.textContent = highScore;

  // Input
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase()==='r') restart(); });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // Touch buttons
  btnLeft.addEventListener('touchstart', e => { e.preventDefault(); keys['arrowleft'] = true; }, {passive:false});
  btnLeft.addEventListener('touchend', e => { keys['arrowleft'] = false; }, {passive:false});
  btnRight.addEventListener('touchstart', e => { e.preventDefault(); keys['arrowright'] = true; }, {passive:false});
  btnRight.addEventListener('touchend', e => { keys['arrowright'] = false; }, {passive:false});

  // Mouse click for pause/resume
  btnPause.addEventListener('click', () => { togglePause(); });

  startBtn.addEventListener('click', () => { startGame(); });
  resumeBtn.addEventListener('click', () => { resumeGame(); });
  restartBtn.addEventListener('click', () => { restart(); });

  // Simple swipe steering on mobile
  let touchStartX = 0;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
  }, {passive:true});

  canvas.addEventListener('touchend', e => {
    if (e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx < -30) steerLeft();
      if (dx > 30) steerRight();
    }
  });

  // Helpers
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function randRange(a,b){ return a + Math.random()*(b-a); }

  // Game functions
  function startGame() {
    resizeCanvas();
    laneWidth = (canvas.getBoundingClientRect().width - ROAD_PADDING*2) / LANE_COUNT;
    player.lane = 1;
    player.x = laneToX(player.lane);
    player.targetX = player.x;
    player.y = canvas.getBoundingClientRect().height - player.height - 30;
    player.alive = true;
    obstacles = [];
    particles = [];
    spawnTimer = 0;
    speedFactor = 1;
    spawnInterval = 1.0;
    distance = 0;
    score = 0;
    running = true;
    paused = false;
    overlay.style.display = 'none';
    lastTime = performance.now()/1000;
    loop();
  }

  function restart() {
    running = false;
    overlay.style.display = 'flex';
    document.getElementById('msg').textContent = 'Ready for another run?';
    resumeBtn.style.display = 'none';
    startBtn.style.display = 'inline-block';
    // reset scores etc.
  }

  function pauseGame() {
    paused = true;
    overlay.style.display = 'flex';
    startBtn.style.display = 'none';
    resumeBtn.style.display = 'inline-block';
    document.getElementById('msg').textContent = 'Paused';
  }

  function resumeGame() {
    paused = false;
    overlay.style.display = 'none';
    lastTime = performance.now()/1000;
    loop();
  }

  function togglePause(){
    if (!running) return;
    if (paused) resumeGame(); else pauseGame();
  }

  function laneToX(l) {
    const rect = canvas.getBoundingClientRect();
    const left = ROAD_PADDING;
    return left + l*laneWidth + laneWidth/2 - player.width/2;
  }

  function steerLeft(){
    player.lane = clamp(player.lane - 1, 0, LANE_COUNT-1);
    player.targetX = laneToX(player.lane);
  }
  function steerRight(){
    player.lane = clamp(player.lane + 1, 0, LANE_COUNT-1);
    player.targetX = laneToX(player.lane);
  }

  function spawnObstacle() {
    // obstacle sits in random lane at top
    const lane = Math.floor(Math.random()*LANE_COUNT);
    const w = randRange(player.width*0.8, player.width*1.4);
    const h = randRange(player.height*0.6, player.height*1.6);
    const rect = {
      lane,
      x: laneToX(lane),
      y: -h - 20,
      width: w,
      height: h,
      speedMult: randRange(0.8, 1.4),
      color: `hsl(${randRange(0,40)}, 80%, ${randRange(35,55)}%)`
    };
    obstacles.push(rect);
  }

  function rectsIntersect(a,b){
    return !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
  }

  // Main loop
  function loop() {
    if (!running || paused) return;
    const nowTime = performance.now()/1000;
    let dt = nowTime - lastTime;
    lastTime = nowTime;
    if (dt > 0.05) dt = 0.05; // clamp

    // Increase difficulty gradually
    speedFactor += dt * 0.02;
    const currentSpeed = clamp(speed * speedFactor * (player.braking ? 0.6 : 1), 200, MAX_SPEED);

    // Spawn logic
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnInterval = clamp(spawnInterval * 0.98, 0.45, 1.6); // slowly spawn faster
      spawnObstacle();
    }

    // Handle input steering
    if (keys['arrowleft'] || keys['a']) steerLeftImmediate();
    if (keys['arrowright'] || keys['d']) steerRightImmediate();
    player.braking = !!(keys[' ']);

    // Slide player toward targetX for smooth lane change
    const rect = canvas.getBoundingClientRect();
    player.x += (player.targetX - player.x) * clamp(dt * player.steerSpeed, 0, 1);

    // Move obstacles toward bottom (simulates forward motion)
    for (let i=obstacles.length-1;i>=0;i--) {
      const ob = obstacles[i];
      ob.y += (currentSpeed * ob.speedMult) * dt;
      // check collision
      const pbox = { x: player.x, y: player.y, width: player.width, height: player.height };
      const obbox = { x: ob.x, y: ob.y, width: ob.width, height: ob.height };
      if (rectsIntersect(pbox, obbox) && player.alive) {
        // crash
        player.alive = false;
        running = false;
        setTimeout(() => {
          overlay.style.display = 'flex';
          document.getElementById('msg').textContent = `You crashed! Score: ${Math.floor(score)}`;
          resumeBtn.style.display = 'none'; startBtn.style.display = 'none';
          // update highscore
          if (Math.floor(score) > highScore) {
            highScore = Math.floor(score);
            localStorage.setItem('streetRacerHigh', highScore);
            highEl.textContent = highScore;
          }
        }, 250);
      }
      // remove off-screen
      if (ob.y > rect.height + 200) obstacles.splice(i,1);
    }

    // Update distance/score
    distance += currentSpeed * dt;
    score += currentSpeed * dt * 0.02;
    scoreEl.textContent = Math.floor(score);

    // Draw scene
    drawScene(currentSpeed);

    requestAnimationFrame(loop);
  }

  function steerLeftImmediate(){
    if (keys._leftHandled) return;
    steerLeft(); keys._leftHandled = true;
    setTimeout(()=> keys._leftHandled = false, 140);
  }
  function steerRightImmediate(){
    if (keys._rightHandled) return;
    steerRight(); keys._rightHandled = true;
    setTimeout(()=> keys._rightHandled = false, 140);
  }

  // Drawing
  function drawScene(currentSpeed) {
    const r = canvas.getBoundingClientRect();
    const cw = r.width, ch = r.height;
    // clear background
    ctx.fillStyle = '#0b1a12';
    ctx.fillRect(0,0,cw,ch);

    // road
    const roadLeft = ROAD_PADDING;
    const roadRight = cw - ROAD_PADDING;
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.roundRect(roadLeft, 0, roadRight - roadLeft, ch, 18);
    ctx.fill();

    // side grass
    ctx.fillStyle = '#0a2b18';
    ctx.fillRect(0,0,roadLeft,ch);
    ctx.fillRect(roadRight,0,cw-roadRight,ch);

    // lane markings (move with speed for motion illusion)
    const markerH = 40;
    const spacing = 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i=1;i<LANE_COUNT;i++){
      const x = roadLeft + i*laneWidth;
      // dashed center line
      let offset = (distance/10) % (markerH + spacing);
      for (let y = - (markerH + spacing) ; y < ch + markerH; y += (markerH + spacing)) {
        ctx.beginPath();
        ctx.moveTo(x, y + offset);
        ctx.lineTo(x, y + offset + markerH);
        ctx.stroke();
      }
    }

    // Draw obstacles
    obstacles.forEach(ob => {
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(ob.x+6, ob.y+6, ob.width, ob.height);
      // car block
      ctx.fillStyle = ob.color;
      roundRect(ctx, ob.x, ob.y, ob.width, ob.height, 8);
      // windows highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(ob.x + ob.width*0.15, ob.y + ob.height*0.15, ob.width*0.7, ob.height*0.35);
    });

    // Draw player car (as smooth rounded car)
    const px = player.x;
    const py = player.y;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, px + 6, py + player.height - 6, player.width, 10, 8, true);
    // body
    const grad = ctx.createLinearGradient(px, py, px, py + player.height);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(1, '#b33d3d');
    ctx.fillStyle = grad;
    roundRect(ctx, px, py, player.width, player.height, 12, true);
    // windshield
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, px + player.width*0.15, py + player.height*0.12, player.width*0.7, player.height*0.28, 6, true);
    // headlights
    ctx.fillStyle = 'rgba(255,255,200,0.95)';
    roundRect(ctx, px + 6, py + player.height - 22, 8, 12, 3, true);
    roundRect(ctx, px + player.width - 14, py + player.height - 22, 8, 12, 3, true);
  }

  // Small helper rounded rect
  function roundRect(ctx, x, y, w, h, r, fill=true) {
    const radius = r || 4;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
  }

  // Initialize player position relative to canvas rect
  function layoutPlayer() {
    const r = canvas.getBoundingClientRect();
    laneWidth = (r.width - ROAD_PADDING*2) / LANE_COUNT;
    player.x = laneToX(player.lane);
    player.targetX = player.x;
    player.y = r.height - player.height - 30;
  }

  // initial layout
  layoutPlayer();

  // Auto-fit on load
  window.addEventListener('load', () => { resizeCanvas(); layoutPlayer(); });

  // Start with overlay visible
  overlay.style.display = 'flex';
})();
