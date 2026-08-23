import { W, H, GROUND_Y, BASE_SPEED, HUNTER_MAX_GAP, PHASE_2_SCORE, PHASE_3_SCORE, ROCK_DIG_GRACE, ROCK_DIG_DURATION, ROCK_DIG_DEPTH, VICTORY_SCORE } from "./Config.js";
import { lerpColor, drawVineRope } from "./Helpers.js";
import { Player } from "./Player.js";
import { Hunter } from "./Hunter.js";
import { Environment } from "./Environment.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Pre-rendered Nebulae offscreen canvas for maximum performance
const nebCanvas = document.createElement("canvas");
nebCanvas.width = W;
nebCanvas.height = H;
const nebCtx = nebCanvas.getContext("2d");
nebCtx.globalCompositeOperation = "screen";

const pinkNeb = nebCtx.createRadialGradient(W * 0.3, 80, 10, W * 0.3, 80, 140);
pinkNeb.addColorStop(0, "rgba(255, 0, 128, 1)");
pinkNeb.addColorStop(1, "rgba(0, 0, 0, 0)");
nebCtx.fillStyle = pinkNeb;
nebCtx.beginPath();
nebCtx.arc(W * 0.3, 80, 140, 0, Math.PI * 2);
nebCtx.fill();

const blueNeb = nebCtx.createRadialGradient(W * 0.7, 60, 20, W * 0.7, 60, 160);
blueNeb.addColorStop(0, "rgba(0, 128, 255, 1)");
blueNeb.addColorStop(1, "rgba(0, 0, 0, 0)");
nebCtx.fillStyle = blueNeb;
nebCtx.beginPath();
nebCtx.arc(W * 0.7, 60, 160, 0, Math.PI * 2);
nebCtx.fill();

  const scoreEl = document.getElementById("score");
  const bananasEl = document.getElementById("bananas");
  const highscoreEl = document.getElementById("highscore");
  const startScreen = document.getElementById("start-screen");
  const gameoverScreen = document.getElementById("gameover-screen");
  const finalScoreEl = document.getElementById("final-score");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");
  const victoryScreen = document.getElementById("victory-screen");
  const victoryScoreEl = document.getElementById("victory-score");
  const restartVictoryBtn = document.getElementById("restart-victory-btn");

  const hunterFillEl = document.getElementById("hunter-fill");
  const hunterMeterEl = document.getElementById("hunter-meter");
  const digBtn = document.getElementById("dig-btn");



  // --- áudio sintetizado (Web Audio API) — sem arquivos de som externos ---
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtor ? new AudioCtor() : null;

  function unlockAudio() {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone({ freq = 440, duration = 0.15, type = "sine", startFreq = null, endFreq = null, volume = 0.25 }) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    if (startFreq && endFreq) {
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    } else {
      osc.frequency.setValueAtTime(freq, now);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function playNoiseBurst(duration = 0.2, volume = 0.2) {
    if (!audioCtx) return;
    const bufferSize = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    noise.connect(gain).connect(audioCtx.destination);
    noise.start();
  }

  const sfx = {
    jump: () => playTone({ startFreq: 300, endFreq: 650, duration: 0.14, type: "square", volume: 0.15 }),
    banana: () => {
      playTone({ startFreq: 500, endFreq: 900, duration: 0.1, type: "triangle", volume: 0.2 });
      setTimeout(() => playTone({ startFreq: 700, endFreq: 1100, duration: 0.09, type: "triangle", volume: 0.15 }), 55);
    },
    vineGrab: () => playTone({ startFreq: 260, endFreq: 420, duration: 0.08, type: "sine", volume: 0.15 }),
    vineRelease: () => playTone({ startFreq: 420, endFreq: 260, duration: 0.08, type: "sine", volume: 0.15 }),
    digTick: () => playTone({ freq: 140 + Math.random() * 50, duration: 0.05, type: "square", volume: 0.08 }),
    splash: () => {
      playTone({ startFreq: 220, endFreq: 60, duration: 0.3, type: "sine", volume: 0.22 });
      playNoiseBurst(0.18, 0.15);
    },
    hit: () => playTone({ startFreq: 200, endFreq: 50, duration: 0.28, type: "sawtooth", volume: 0.28 }),
    gameover: () => playTone({ startFreq: 400, endFreq: 80, duration: 0.5, type: "sawtooth", volume: 0.25 }),
    victory: () => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          playTone({ freq, duration: 0.25, type: "triangle", volume: 0.25 });
        }, idx * 120);
      });
    }
  };

  let highScore = Number(localStorage.getItem("monkeyGameHighScore") || 0);
  highscoreEl.textContent = `Recorde: ${highScore}`;

  let state = "idle"; // idle | playing | gameover

  // Instantiating Modular Objects
  const player = new Player();
  const hunter = new Hunter();
  const environment = new Environment();

  let speed, score, bananaCount, frame;
  let activeRock, rockGraceLeft, digProgress, groundOffset;
  let downHeld = false;

  // Screen shake variables
  let shakeTime = 0;

  // Background weather/time dynamic elements
  let clouds = [], stars = [], shootingStars = [], planets = [], dragon = {}, ufo = {};

  function initBackgroundElements() {
    clouds = [
      { x: 100, y: 50, speed: 0.15, scale: 0.8 },
      { x: 350, y: 80, speed: 0.22, scale: 1.1 },
      { x: 600, y: 40, speed: 0.1, scale: 0.6 },
    ];
    stars = [];
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y - 40),
        size: 0.5 + Math.random() * 1.8,
        twinkleSpeed: 0.015 + Math.random() * 0.045,
        phase: Math.random() * Math.PI * 2,
      });
    }
    shootingStars = [];
    planets = [
      { x: W - 150, y: 70, r: 16, color: "#e06c53", name: "mars", speed: 0.02 },
      { x: 220, y: 110, r: 22, color: "#d9ab55", name: "saturn", rings: true, speed: 0.015 },
      { x: 450, y: 50, r: 12, color: "#55d9bb", name: "emerald", speed: 0.01 },
    ];
    dragon = {
      x: -120,
      y: 60,
      active: false,
      timer: 500,
      particles: [],
      frame: 0
    };
    ufo = {
      x: -100,
      y: 40,
      active: false,
      timer: 800,
      beamProgress: 0,
      state: "fly-in",
      beamOpacity: 0
    };
  }

  function triggerScreenShake() {
    shakeTime = 12;
  }



  function resetGame() {
    player.reset();
    hunter.reset();
    environment.reset();

    speed = BASE_SPEED;
    score = 0;
    bananaCount = 0;
    frame = 0;

    activeRock = null;
    rockGraceLeft = 0;
    digProgress = 0;
    groundOffset = 0;
    
    hunterMeterEl.classList.remove("critical");
    hunterFillEl.style.width = "0%";
    initBackgroundElements();
    shakeTime = 0;

    victoryScreen.classList.add("hidden");
    ufo.rescueStage = null;
  }

  function handleAction() {
    unlockAudio();
    if (state === "idle") startGame();
    else if (state === "playing") {
      if (player.swinging) player.handleSwingRelease(frame, sfx);
      else player.jump(sfx);
    } else if (state === "gameover") startGame();
  }

  function startGame() {
    resetGame();
    state = "playing";
    startScreen.classList.add("hidden");
    gameoverScreen.classList.add("hidden");
    victoryScreen.classList.add("hidden");
    requestAnimationFrame(loop);
  }

  function handleDamage(reason) {
    if (player.invulnerableTimer > 0) return;
    
    player.lives--;
    if (player.lives <= 0) {
      endGame(reason);
    } else {
      player.invulnerableTimer = 90;
      triggerScreenShake();
      sfx.hit(); // Standard hit sound
      // Push hunter back to give breathing room
      hunter.gap = Math.min(HUNTER_MAX_GAP, hunter.gap + 150);
    }
  }

  function endGame(reason) {
    state = "gameover";
    downHeld = false;
    if (digBtn) digBtn.classList.add("hidden");
    if (reason === "river") sfx.splash();
    else sfx.hit();
    setTimeout(() => sfx.gameover(), 180);

    if (score > highScore) {
      highScore = score;
      localStorage.setItem("monkeyGameHighScore", String(Math.floor(highScore)));
      highscoreEl.textContent = `Recorde: ${Math.floor(highScore)}`;
    }
    const REASON_TEXT = {
      hunter: "O caçador te agarrou! 🥅",
      river: "Você caiu no rio! 🌊",
      vine: "O cipó arrebentou de tanto você ficar pendurado! 🍃",
      log: "Você bateu num tronco! 🪵",
      rock: "A rocha bloqueou seu caminho! 🪨",
    };
    finalScoreEl.textContent = `${REASON_TEXT[reason]}  Pontos: ${Math.floor(score)}  |  🍌 x ${bananaCount}`;
    gameoverScreen.classList.remove("hidden");
  }

  function updateBackgroundElements() {
    // 1. Clouds
    for (const cloud of clouds) {
      cloud.x -= cloud.speed * (speed * 0.5);
      if (cloud.x + 120 * cloud.scale < 0) {
        cloud.x = W + 50;
        cloud.y = 30 + Math.random() * 60;
      }
    }

    // 2. Stars (twinkle phase)
    for (const star of stars) {
      star.phase += star.twinkleSpeed;
    }

    // 3. Shooting stars
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE && Math.random() < 0.008 && shootingStars.length < 2) {
      shootingStars.push({
        x: Math.random() * (W - 100),
        y: Math.random() * 80,
        length: 40 + Math.random() * 40,
        speed: 8 + Math.random() * 6,
        progress: 0,
        angle: Math.PI / 6 + Math.random() * (Math.PI / 12),
      });
    }
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const ss = shootingStars[i];
      ss.progress += ss.speed;
      if (ss.progress > ss.length + 100) {
        shootingStars.splice(i, 1);
      }
    }

    // 4. Planets
    for (const planet of planets) {
      planet.x -= planet.speed * (speed * 0.2);
      if (planet.x + 50 < 0) {
        planet.x = W + 100;
        planet.y = 40 + Math.random() * 100;
      }
    }

    // 5. Dragon (Easter egg)
    if (score < PHASE_3_SCORE) {
      if (!dragon.active) {
        dragon.timer--;
        if (dragon.timer <= 0) {
          dragon.active = true;
          dragon.x = W + 120;
          dragon.y = 30 + Math.random() * 70;
          dragon.speed = 3.5 + Math.random() * 1.5;
          dragon.frame = 0;
        }
      } else {
        dragon.frame++;
        dragon.x -= dragon.speed;
        dragon.y += Math.sin(dragon.frame * 0.08) * 1.6;

        // Spawn fire particles
        if (dragon.frame % 3 === 0) {
          dragon.particles.push({
            x: dragon.x - 10,
            y: dragon.y + 6,
            vx: -(1 + Math.random() * 1.5),
            vy: (Math.random() - 0.5) * 1.2,
            size: 3.5 + Math.random() * 3.5,
            alpha: 1,
          });
        }

        if (dragon.x < -150) {
          dragon.active = false;
          dragon.timer = 600 + Math.random() * 300;
        }
      }

      // Update fire particles
      for (let i = dragon.particles.length - 1; i >= 0; i--) {
        const p = dragon.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.022;
        if (p.alpha <= 0) {
          dragon.particles.splice(i, 1);
        }
      }
    }

    // 6. UFO (Easter egg)
    if (score >= PHASE_2_SCORE) {
      if (!ufo.active) {
        ufo.timer--;
        if (ufo.timer <= 0) {
          ufo.active = true;
          ufo.x = W + 100;
          ufo.y = 30 + Math.random() * 40;
          ufo.speed = 2.5;
          ufo.state = "fly-in";
          ufo.beamProgress = 0;
          ufo.beamOpacity = 0;
        }
      } else {
        if (ufo.state === "fly-in") {
          ufo.x -= ufo.speed;
          if (ufo.x <= W / 2) {
            ufo.state = "hover";
            ufo.beamProgress = 0;
          }
        } else if (ufo.state === "hover") {
          ufo.beamProgress += 0.015;
          ufo.beamOpacity = Math.sin(ufo.beamProgress * Math.PI) * 0.45;
          if (ufo.beamProgress >= 1) {
            ufo.state = "fly-out";
          }
        } else if (ufo.state === "fly-out") {
          ufo.x -= ufo.speed * 1.6;
          if (ufo.x < -100) {
            ufo.active = false;
            ufo.timer = 800 + Math.random() * 400;
          }
        }
      }
    }
  }

  let transitionDone = false;

  function triggerUfoTransition() {
    state = "transition";
    downHeld = false;
    if (digBtn) digBtn.classList.add("hidden");
    
    ufo.active = true;
    ufo.state = "rescue-fly-in";
    ufo.x = W + 80;
    ufo.y = 80;
    ufo.beamProgress = 0;
    ufo.beamOpacity = 0;
    ufo.rescueStage = "fly-in"; // fly-in | hover-beam | float-up | fly-out | done
    ufo.rescueT = 0;
  }

  function updateUfoTransition() {
    // 1. Slow down general speed and stop ground movement eventually
    if (speed > 0) speed = Math.max(0, speed - 0.08);
    groundOffset = (groundOffset + speed) % 24;

    // 2. Update existing obstacles scrolling off-screen
    environment.logs.forEach(l => l.x -= speed);
    environment.rocks.forEach(r => r.x -= speed);
    environment.rivers.forEach(r => r.x -= speed);
    environment.bananas.forEach(b => b.x -= speed);
    environment.powerups.forEach(p => p.x -= speed);

    // 3. Move hunter off-screen to the left (surprised!)
    if (hunter.gap < HUNTER_MAX_GAP + 200) {
      hunter.gap += 4; // Hunter gets left behind
    }
    hunterFillEl.style.width = "0%";
    hunterMeterEl.classList.remove("critical");

    // 4. Align player to center of the screen
    const targetX = W / 2 - player.w / 2;
    if (player.x < targetX - 2) player.x += 2;
    else if (player.x > targetX + 2) player.x -= 2;
    else player.x = targetX;

    if (player.swinging) {
      player.swinging = false;
      player.jumping = true;
    }
    if (player.y < GROUND_Y - player.h && ufo.rescueStage !== "float-up" && ufo.rescueStage !== "fly-out") {
      player.y = Math.min(GROUND_Y - player.h, player.y + 4);
    }

    // 5. Orchestrate UFO rescue
    if (ufo.rescueStage === "fly-in") {
      ufo.active = true;
      const targetUfoX = W / 2;
      const targetUfoY = 70;
      ufo.x -= (ufo.x - targetUfoX) * 0.07;
      ufo.y -= (ufo.y - targetUfoY) * 0.07;
      if (Math.abs(ufo.x - targetUfoX) < 3 && Math.abs(ufo.y - targetUfoY) < 3) {
        ufo.x = targetUfoX;
        ufo.y = targetUfoY;
        ufo.rescueStage = "hover-beam";
        ufo.beamProgress = 0;
      }
    } else if (ufo.rescueStage === "hover-beam") {
      ufo.beamProgress += 0.035;
      ufo.beamOpacity = Math.min(0.7, ufo.beamProgress * 0.7);
      if (ufo.beamProgress >= 1) {
        ufo.rescueStage = "float-up";
      }
    } else if (ufo.rescueStage === "float-up") {
      const targetGorillaY = ufo.y + 8;
      player.y -= (player.y - targetGorillaY) * 0.04;
      player.floatAngle = (player.floatAngle || 0) + 0.045;
      
      if (Math.abs(player.y - targetGorillaY) < 5) {
        ufo.rescueStage = "fly-out";
        ufo.beamProgress = 1;
        player.invisible = true; // Gorilla enters the UFO
      }
    } else if (ufo.rescueStage === "fly-out") {
      if (ufo.beamOpacity > 0) {
        ufo.beamOpacity -= 0.06;
      } else {
        ufo.x += 7;
        ufo.y -= 3.5;
        if (ufo.x > W + 100) {
          ufo.rescueStage = "done";
          // End of transition, start phase 3
          transitionDone = true;
          state = "playing";
          player.invisible = false;
          player.y = -100; // Drops from ceiling into office
          player.floatAngle = 0;
          hunter.gap = HUNTER_MAX_GAP; // Hunter is far away again
        }
      }
    }
  }

  let finalJumpProgress = 0;
  function triggerVictory() {
    state = "victory";
    downHeld = false;
    if (digBtn) digBtn.classList.add("hidden");
    sfx.victory();
    
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("monkeyGameHighScore", String(Math.floor(highScore)));
      highscoreEl.textContent = `Recorde: ${Math.floor(highScore)}`;
    }
    
    finalJumpProgress = 0;
  }

  function updateVictorySequence() {
    if (speed > 0) speed = Math.max(0, speed - 0.08);
    groundOffset = (groundOffset + speed) % 24;

    environment.logs.forEach(l => l.x -= speed);
    environment.rocks.forEach(r => r.x -= speed);
    environment.rivers.forEach(r => r.x -= speed);
    environment.bananas.forEach(b => b.x -= speed);
    environment.powerups.forEach(p => p.x -= speed);

    if (hunter.gap < HUNTER_MAX_GAP + 200) {
      hunter.gap += 4;
    }
    hunterFillEl.style.width = "0%";
    hunterMeterEl.classList.remove("critical");

    // Gorilla runs to the right and jumps out the window
    player.x += 3;
    if (player.x > W - 150) {
      // Jump
      finalJumpProgress += 0.05;
      player.y -= Math.sin(finalJumpProgress * Math.PI) * 10;
      if (finalJumpProgress >= 1) {
        showVictoryScreen();
      }
    }
  }

  function showVictoryScreen() {
    state = "idle";
    victoryScoreEl.textContent = `Pontos: ${Math.floor(score)} | 🍌 x ${bananaCount}`;
    victoryScreen.classList.remove("hidden");
  }

  function update() {
    frame++;
    speed = BASE_SPEED + score / 1000;
    updateBackgroundElements();

    if (state === "victory") {
      updateVictorySequence();
      return;
    }
    if (state === "transition") {
      updateUfoTransition();
      return;
    }

    player.update(activeRock, frame, handleDamage, sfx);
    if (state === "gameover") return;

    if (!activeRock) {
      groundOffset = (groundOffset + speed) % 24;

      // Update environment obstacles and check collisions
      const collisionResult = environment.update(speed, score, player, hunter, sfx, handleDamage, triggerScreenShake);
      if (state === "gameover") return;

      if (collisionResult && collisionResult.w && !collisionResult.type) {
        // Encontra uma rocha e para para cavar
        activeRock = collisionResult;
        rockGraceLeft = ROCK_DIG_GRACE;
        digProgress = 0;
        player.digging = false;
      } else if (collisionResult === "banana") {
        bananaCount++;
        score += 10;
      } else if (collisionResult === "peel") {
        bananaCount++;
        score += 15;
      } else if (collisionResult === "spring") {
        score += 15;
      } else if (collisionResult === "heart") {
        player.lives++;
        score += 20;
      }
    }

    // Digging boulder physics
    if (activeRock) {
      if (!player.digging) {
        if (downHeld) {
          player.digging = true;
        } else {
          rockGraceLeft--;
          if (rockGraceLeft <= 0) {
            handleDamage("rock");
            return;
          }
        }
      }
      if (player.digging && downHeld) {
        digProgress++;
        if (digProgress % 6 === 0) sfx.digTick();
        player.y = GROUND_Y - player.h + Math.min(ROCK_DIG_DEPTH, (digProgress / ROCK_DIG_DURATION) * ROCK_DIG_DEPTH);
        if (digProgress >= ROCK_DIG_DURATION) {
          environment.rocks = environment.rocks.filter((r) => r !== activeRock);
          activeRock = null;
          player.digging = false;
          player.y = GROUND_Y - player.h;
          digProgress = 0;
        }
      }
    }

    hunter.update(player, environment.rivers, score, speed);
    if (hunter.gap <= 0) {
      handleDamage("hunter");
      return;
    }

    const dangerPct = Math.max(0, Math.min(100, (1 - hunter.gap / HUNTER_MAX_GAP) * 100));
    hunterFillEl.style.width = `${dangerPct}%`;
    hunterMeterEl.classList.toggle("critical", dangerPct > 75);

    score += 0.15;
    scoreEl.textContent = `Pontos: ${Math.floor(score)}`;
    bananasEl.textContent = `❤️ x ${player.lives} | 🍌 x ${bananaCount}`;

    if (score >= PHASE_3_SCORE && !transitionDone) {
      triggerUfoTransition();
      return;
    }

    if (score >= VICTORY_SCORE) {
      triggerVictory();
      return;
    }
  }

  function draw() {
    ctx.save();
    // Screen shake translate offset
    if (shakeTime > 0) {
      shakeTime--;
      const dx = (Math.random() - 0.5) * 8;
      const dy = (Math.random() - 0.5) * 8;
      ctx.translate(dx, dy);
    }

    ctx.clearRect(0, 0, W, H);

    if (digBtn) digBtn.classList.toggle("hidden", !(state === "playing" && activeRock));

    // Determine target sky colors based on score
    let skyTop, skyBottom;
    if (score < PHASE_2_SCORE) {
      // Fase 1: Selva
      skyTop = "#8fd3f4";
      skyBottom = "#dcf4ff";
    } else if (score < PHASE_3_SCORE) {
      // Fase 2: Marte
      skyTop = "#4a0404";
      skyBottom = "#b82e14";
    } else {
      // Fase 3: Escritório
      skyTop = "#dcdcdc";
      skyBottom = "#f0f0f0";
    }

    // Draw the sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, skyTop);
    skyGrad.addColorStop(1, skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // Render Nebulae
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(nebCanvas, 0, 0);
      ctx.restore();
    }

    // Render Stars
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE) {
      ctx.save();
      // Group stars into 3 batches to reduce draw calls from 90 to 3
      for (let g = 0; g < 3; g++) {
        ctx.beginPath();
        let twitchSum = 0;
        let count = 0;
        for (let i = g; i < stars.length; i += 3) {
          const star = stars[i];
          const twitch = Math.sin(frame * star.twinkleSpeed + star.phase) * 0.38 + 0.62;
          twitchSum += twitch;
          count++;
          ctx.rect(star.x - star.size / 2, star.y - star.size / 2, star.size, star.size);
        }
        const avgTwitch = count > 0 ? twitchSum / count : 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${avgTwitch})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw Constellation
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE) {
      const monkeyStars = [
        { x: W * 0.38, y: 40 },
        { x: W * 0.44, y: 25 },
        { x: W * 0.50, y: 28 },
        { x: W * 0.53, y: 50 },
        { x: W * 0.47, y: 65 },
        { x: W * 0.41, y: 55 },
        { x: W * 0.38, y: 40 }
      ];
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(monkeyStars[0].x, monkeyStars[0].y);
      for (let i = 1; i < monkeyStars.length; i++) {
        ctx.lineTo(monkeyStars[i].x, monkeyStars[i].y);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      for (const s of monkeyStars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = "8px monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.textAlign = "center";
      ctx.fillText("Constelação Primata 🐵", W * 0.45, 80);
      ctx.restore();
    }

    // Render Shooting Stars
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE && shootingStars.length > 0) {
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const ss of shootingStars) {
        const tailX = ss.x - Math.cos(ss.angle) * ss.progress;
        const tailY = ss.y + Math.sin(ss.angle) * ss.progress;
        const headX = ss.x - Math.cos(ss.angle) * (ss.progress - ss.length);
        const headY = ss.y + Math.sin(ss.angle) * (ss.progress - ss.length);

        const sgrad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        sgrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        sgrad.addColorStop(1, "rgba(255, 255, 255, 0.75)");
        ctx.strokeStyle = sgrad;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render Sun
    if (score < PHASE_2_SCORE) {
      ctx.save();
      const sunY = 55 + (score / PHASE_2_SCORE) * (GROUND_Y - 90);
      const sunColor = "#ff4500";

      const sunGlow = ctx.createRadialGradient(W - 80, sunY, 4, W - 80, sunY, 32);
      sunGlow.addColorStop(0, sunColor);
      sunGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(W - 80, sunY, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "32px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("☀️", W - 80, sunY);
      ctx.restore();
    }

    // Render Planets
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (const p of planets) {
        if (p.rings) {
          ctx.strokeStyle = "rgba(235, 200, 120, 0.4)";
          ctx.lineWidth = 3.5;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(2, 0.45);
          ctx.rotate(-Math.PI / 12);
          ctx.beginPath();
          ctx.arc(0, 0, p.r + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        const shad = ctx.createRadialGradient(p.x - p.r / 3, p.y - p.r / 3, 1, p.x, p.y, p.r);
        shad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
        shad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
        ctx.fillStyle = shad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Clouds
    if (score < PHASE_2_SCORE) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      for (const cloud of clouds) {
        ctx.beginPath();
        const cx = cloud.x;
        const cy = cloud.y;
        const cs = cloud.scale;
        ctx.arc(cx, cy, 14 * cs, 0, Math.PI * 2);
        ctx.arc(cx + 14 * cs, cy - 7 * cs, 17 * cs, 0, Math.PI * 2);
        ctx.arc(cx + 28 * cs, cy, 14 * cs, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Dragon
    if (dragon.active && score < PHASE_3_SCORE) {
      ctx.save();
      for (const p of dragon.particles) {
        ctx.fillStyle = `rgba(255, ${80 + Math.floor(Math.random() * 100)}, 0, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "32px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🐉", dragon.x, dragon.y);
      ctx.restore();
    }

    // Render UFO
    if (ufo.active && score >= PHASE_2_SCORE) {
      ctx.save();
      if (ufo.beamOpacity > 0) {
        const ufoBeam = ctx.createLinearGradient(0, ufo.y, 0, GROUND_Y);
        ufoBeam.addColorStop(0, `rgba(100, 255, 100, ${ufo.beamOpacity})`);
        ufoBeam.addColorStop(1, "rgba(100, 255, 100, 0)");
        ctx.fillStyle = ufoBeam;
        ctx.beginPath();
        ctx.moveTo(ufo.x - 8, ufo.y + 10);
        ctx.lineTo(ufo.x + 8, ufo.y + 10);
        ctx.lineTo(ufo.x + 36, GROUND_Y);
        ctx.lineTo(ufo.x - 36, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🛸", ufo.x, ufo.y);
      ctx.restore();
    }

    // Draw environment & obstacles
    environment.draw(ctx, frame, speed, activeRock, groundOffset, score);

    // Draw final window in victory sequence
    if (state === "victory") {
      ctx.save();
      const windowX = W - 100;
      const windowY = GROUND_Y - 120;
      
      // Wall outline
      ctx.fillStyle = "#bbbbbb";
      ctx.fillRect(windowX - 10, windowY - 10, 100, 130);
      
      // Glass
      ctx.fillStyle = "#87CEEB"; // Sky blue
      ctx.fillRect(windowX, windowY, 80, 110);
      
      // Window frame
      ctx.strokeStyle = "#444444";
      ctx.lineWidth = 4;
      ctx.strokeRect(windowX, windowY, 80, 110);
      ctx.beginPath();
      ctx.moveTo(windowX + 40, windowY);
      ctx.lineTo(windowX + 40, windowY + 110);
      ctx.moveTo(windowX, windowY + 55);
      ctx.lineTo(windowX + 80, windowY + 55);
      ctx.stroke();

      // Reflections
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.moveTo(windowX + 10, windowY + 90);
      ctx.lineTo(windowX + 60, windowY + 10);
      ctx.lineTo(windowX + 70, windowY + 10);
      ctx.lineTo(windowX + 20, windowY + 90);
      ctx.fill();
      ctx.restore();
    }

    // Draw modular player & hunter
    if (player.digging) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, GROUND_Y);
      ctx.clip();
      player.draw(ctx, frame);
      ctx.restore();

      const dustX = player.x + player.w / 2;
      ctx.fillStyle = "rgba(120,90,50,0.5)";
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.3 + i * 2;
        ctx.beginPath();
        ctx.ellipse(dustX + Math.cos(a) * 14, GROUND_Y - 2 + Math.sin(a * 1.7) * 3, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      player.draw(ctx, frame);
    }

    hunter.draw(ctx, player, frame);

    // Vine currently carrying the monkey
    if (player.swinging) {
      const cx = player.x + player.w / 2;
      drawVineRope(ctx, cx, 0, cx, player.y + player.h / 2, false);
    }

    // Dig indicator progress
    if (activeRock) {
      const barX = player.x - 10;
      const barY = player.y - 14;
      const barW = 60;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(barX, barY, barW, 6);
      if (player.digging) {
        ctx.fillStyle = "#d9c23c";
        ctx.fillRect(barX, barY, barW * (digProgress / ROCK_DIG_DURATION), 6);
      } else {
        ctx.fillStyle = "#fff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⬇ cave!", player.x + player.w / 2, barY - 6);
      }
    }

    // Red warning vignette
    if (state === "playing" && hunter.gap < 100) {
      const pulse = 0.15 + 0.15 * Math.abs(Math.sin(frame / 6));
      ctx.save();
      ctx.globalAlpha = pulse * (1 - hunter.gap / 100);
      ctx.fillStyle = "#c81e1e";
      ctx.fillRect(0, 0, W, 10);
      ctx.fillRect(0, H - 10, W, 10);
      ctx.restore();
    }

    ctx.restore();
  }

  function loop() {
    if (state !== "playing" && state !== "victory") return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Input listeners ---
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handleAction();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      downHeld = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") downHeld = false;
  });

  canvas.addEventListener("pointerdown", handleAction);

  if (digBtn) {
    const press = (e) => { e.preventDefault(); unlockAudio(); downHeld = true; };
    const release = (e) => { e.preventDefault(); downHeld = false; };
    digBtn.addEventListener("pointerdown", press);
    digBtn.addEventListener("pointerup", release);
    digBtn.addEventListener("pointerleave", release);
    digBtn.addEventListener("pointercancel", release);
  }

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", startGame);
  restartVictoryBtn.addEventListener("click", startGame);



  // initial idle draw
  resetGame();
  draw();
