import { W, H, GROUND_Y, JUMP_AIR_FRAMES, MIN_HAZARD_GAP, RIVER_LOG_CLEARANCE, ROCK_LOG_CLEARANCE, ROCK_RIVER_CLEARANCE, ROCK_DIG_GRACE, HUNTER_MAX_GAP, HUNTER_BANANA_BONUS, PHASE_2_SCORE, PHASE_3_SCORE } from "./Config.js";
import { drawVineRope } from "./Helpers.js";

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export class Environment {
  constructor() {
    this.reset();
  }

  reset() {
    this.logs = [];
    this.bananas = [];
    this.powerups = [];
    this.rocks = [];
    this.rivers = [];
    
    this.spawnTimer = 60;
    this.bananaTimer = 120;
    this.riverTimer = 420;
    this.rockTimer = 500 + Math.random() * 200;
  }

  spawnLog() {
    const h = 30 + Math.random() * 20;
    const w = 30 + Math.random() * 30;
    this.logs.push({ x: W + 20, y: GROUND_Y - h, w, h });
  }

  spawnRock() {
    const w = 55 + Math.random() * 20;
    this.rocks.push({ x: W + 20, w, h: 46 });
  }

  spawnItem(score) {
    const onGround = Math.random() < 0.7;
    const y = onGround ? GROUND_Y - 30 : GROUND_Y - 110 - Math.random() * 30;
    
    let heartMax = 1;
    if (score >= PHASE_2_SCORE && score < PHASE_3_SCORE) heartMax = 2;

    const currentHearts = this.powerups.filter(p => p.type === "heart" && !p.collected).length;
    if (currentHearts < heartMax && Math.random() < 0.02) { // 2% chance per tick to spawn heart if under max
        this.powerups.push({ x: W + 20, y: y - 5, w: 26, h: 26, type: "heart", collected: false });
        return;
    }

    // 5% chance of spawning a power-up instead of a normal banana
    const isPowerUp = Math.random() < 0.05;
    if (isPowerUp) {
      const type = Math.random() < 0.5 ? "peel" : "spring";
      this.powerups.push({ x: W + 20, y: y - 5, w: 26, h: 26, type, collected: false });
    } else {
      this.bananas.push({ x: W + 20, y, w: 26, h: 26, collected: false });
    }
  }

  spawnRiver(speed) {
    const w = Math.round(JUMP_AIR_FRAMES * speed) + 70 + Math.random() * 40;
    const swingDuration = Math.ceil((w + 90) / speed) + 15;
    this.rivers.push({
      x: W + 20,
      w,
      vineOffset: w * 0.18,
      vineGrabbed: false,
      swingDuration,
      hunterSwimDuration: Math.round(swingDuration * 1.3),
      hunterTriggered: false,
      phase: Math.random() * 10,
    });
  }

  update(speed, score, player, hunter, sfx, endGame, triggerScreenShake) {
    // 1. Spawning
    this.spawnTimer--;
    if (this.spawnTimer <= 0) {
      this.spawnLog();
      this.spawnTimer = 70 - Math.min(30, Math.floor(score / 20)) + Math.random() * 40;
      this.bananaTimer = Math.max(this.bananaTimer, MIN_HAZARD_GAP);
    }

    this.bananaTimer--;
    if (this.bananaTimer <= 0) {
      this.spawnItem(score);
      this.bananaTimer = 90 + Math.random() * 90;
      this.spawnTimer = Math.max(this.spawnTimer, MIN_HAZARD_GAP);
    }

    this.riverTimer--;
    if (this.riverTimer <= 0 && this.rivers.length === 0) {
      const lastLog = this.logs[this.logs.length - 1];
      const lastRock = this.rocks[this.rocks.length - 1];
      const logClear = !lastLog || lastLog.x + lastLog.w < W - RIVER_LOG_CLEARANCE;
      const rockClear = !lastRock || lastRock.x + lastRock.w < W - ROCK_RIVER_CLEARANCE;
      if (logClear && rockClear) {
        this.spawnRiver(speed);
        this.riverTimer = 450 + Math.random() * 300;
        this.spawnTimer = Math.max(this.spawnTimer, 100);
        this.bananaTimer = Math.max(this.bananaTimer, 80);
        this.rockTimer = Math.max(this.rockTimer, 200);
      } else {
        this.riverTimer = 10;
      }
    }

    this.rockTimer--;
    if (this.rockTimer <= 0 && this.rocks.length === 0) {
      const lastLog = this.logs[this.logs.length - 1];
      const lastRiver = this.rivers[this.rivers.length - 1];
      const logClear = !lastLog || lastLog.x + lastLog.w < W - ROCK_LOG_CLEARANCE;
      const riverClear = !lastRiver || lastRiver.x + lastRiver.w < W - ROCK_RIVER_CLEARANCE;
      if (logClear && riverClear) {
        this.spawnRock();
        this.rockTimer = 500 + Math.random() * 300;
        this.spawnTimer = Math.max(this.spawnTimer, 100);
        this.bananaTimer = Math.max(this.bananaTimer, 80);
        this.riverTimer = Math.max(this.riverTimer, 200);
      } else {
        this.rockTimer = 10;
      }
    }

    // 2. Obstacles motion
    for (const log of this.logs) log.x -= speed;
    this.logs = this.logs.filter((l) => l.x + l.w > -10);

    for (const b of this.bananas) b.x -= speed;
    this.bananas = this.bananas.filter((b) => b.x + b.w > -10 && !b.collected);

    for (const p of this.powerups) p.x -= speed;
    this.powerups = this.powerups.filter((p) => p.x + p.w > -10 && !p.collected);

    for (const river of this.rivers) river.x -= speed;
    this.rivers = this.rivers.filter((r) => r.x + r.w > -HUNTER_MAX_GAP - 60);

    for (const rock of this.rocks) rock.x -= speed;
    this.rocks = this.rocks.filter((r) => r.x + r.w > -10);

    // 3. Collision logic
    const hitbox = { x: player.x + 6, y: player.y + 6, w: player.w - 12, h: player.h - 12 };

    // Log collisions
    for (const log of this.logs) {
      const logHitbox = { x: log.x + 4, y: log.y + 4, w: log.w - 8, h: log.h - 8 };
      if (rectsOverlap(hitbox, logHitbox)) {
        triggerScreenShake();
        endGame("log");
        return;
      }
    }

    // Rock collisions
    for (const rock of this.rocks) {
      const rockHitbox = { x: rock.x + 6, y: GROUND_Y - rock.h + 8, w: rock.w - 12, h: rock.h - 8 };
      if (rectsOverlap(hitbox, rockHitbox)) {
        // If super jump is active, ignore rock collisions entirely (the player can jump over them)
        if (player.superJumpTimer > 0) {
          continue;
        }

        if (player.jumping || player.swinging) {
          triggerScreenShake();
          endGame("rock");
          return;
        }

        // Engage digging mode
        return rock; 
      }
    }

    // Banana collection
    for (const b of this.bananas) {
      if (!b.collected && rectsOverlap(hitbox, b)) {
        b.collected = true;
        hunter.gap = Math.min(HUNTER_MAX_GAP, hunter.gap + HUNTER_BANANA_BONUS);
        if (sfx) sfx.banana();
        return "banana";
      }
    }

    // Power-up collection
    for (const p of this.powerups) {
      if (!p.collected && rectsOverlap(hitbox, p)) {
        p.collected = true;
        if (p.type === "peel") {
          // Push hunter back significantly
          hunter.gap = Math.min(HUNTER_MAX_GAP, hunter.gap + 80);
          if (sfx) {
            // Play double banana sfx as slip sound
            sfx.banana();
            setTimeout(() => sfx.banana(), 80);
          }
          return "peel";
        } else if (p.type === "spring") {
          player.collectSuperJump();
          if (sfx) {
            sfx.jump();
            setTimeout(() => sfx.jump(), 90);
          }
          return "spring";
        } else if (p.type === "heart") {
          // Heart grants an extra life in game loop
          if (sfx) {
             sfx.banana(); // Maybe a specific sound later, for now banana sound
             setTimeout(() => sfx.banana(), 50);
          }
          return "heart";
        }
      }
    }

    // River collisions
    for (const river of this.rivers) {
      const vineX = river.x + river.vineOffset;
      if (!player.swinging && !river.vineGrabbed && player.jumping) {
        // Extend vineZone to cover from y: 0 down to GROUND_Y - 20 (allowing grabs at any jump height)
        const vineZone = { x: vineX - 16, y: 0, w: 32, h: GROUND_Y - 20 };
        if (rectsOverlap(hitbox, vineZone)) {
          river.vineGrabbed = true;
          player.swinging = true;
          player.jumping = true;
          player.swingT = 0;
          player.swingDuration = river.swingDuration;
          player.swingStartY = player.y;
          if (sfx) sfx.vineGrab();
        }
      }

      if (!player.swinging && rectsOverlap(hitbox, { x: river.x, y: GROUND_Y - 16, w: river.w, h: H - GROUND_Y + 16 })) {
        triggerScreenShake();
        endGame("river");
        return;
      }
    }
  }

  draw(ctx, frame, speed, activeRock, groundOffset, score) {
    // 1. Ground & Parallax Offset
    let groundTop, groundAccent;
    if (score < 700) { // PHASE_2_SCORE
      groundTop = "#7a9e4f";
      groundAccent = "#5c7d3a";
    } else if (score < 1400) { // PHASE_3_SCORE
      groundTop = "#9c3b2b"; // Mars red
      groundAccent = "#6b2318";
    } else {
      groundTop = "#999999"; // Office carpet/floor
      groundAccent = "#777777";
    }

    ctx.fillStyle = groundTop;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = groundAccent;
    for (let i = 0; i < W; i += 24) {
      ctx.fillRect(i - groundOffset, GROUND_Y, 12, 6);
    }

    // 2. Rivers
    for (const river of this.rivers) {
      const wgrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
      wgrad.addColorStop(0, "#5aa9d6");
      wgrad.addColorStop(1, "#2c6f9e");
      ctx.fillStyle = wgrad;
      ctx.fillRect(river.x, GROUND_Y, river.w, H - GROUND_Y);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let wx = 0; wx < river.w; wx += 20) {
        const wy = GROUND_Y + 10 + Math.sin(frame * 0.1 + wx) * 3;
        ctx.moveTo(river.x + wx, wy);
        ctx.quadraticCurveTo(river.x + wx + 5, wy + 4, river.x + wx + 10, wy);
      }
      ctx.stroke();
    }

    // 3. Logs
    ctx.font = "40px serif";
    for (const log of this.logs) {
      ctx.save();
      ctx.translate(log.x + log.w / 2, log.y + log.h / 2);
      ctx.font = `${Math.max(log.w, log.h) + 10}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪵", 0, 0);
      ctx.restore();
    }

    // 4. Rocks
    for (const rock of this.rocks) {
      ctx.save();
      ctx.translate(rock.x + rock.w / 2, GROUND_Y - rock.h / 2 + 6);
      ctx.font = `${rock.h + 32}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🪨", 0, 0);
      ctx.restore();
    }

    // 5. Bananas
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of this.bananas) {
      ctx.fillText("🍌", b.x + b.w / 2, b.y + b.h / 2);
    }

    // 6. Power-ups
    for (const p of this.powerups) {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      
      // Twinkle scale effect
      const scale = 1.0 + Math.sin(frame * 0.15) * 0.1;
      ctx.scale(scale, scale);

      if (p.type === "peel") {
        // Curved yellow peel shape
        ctx.fillStyle = "#ffe066";
        ctx.strokeStyle = "#4a3223";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI, true);
        ctx.lineTo(-4, 6);
        ctx.lineTo(0, 2);
        ctx.lineTo(4, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#4a3223";
        ctx.textAlign = "center";
        ctx.fillText("PEEL", 0, -8);
      } else if (p.type === "spring") {
        // Red spring coil symbol
        ctx.strokeStyle = "#ff3366";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-7, 7);
        ctx.bezierCurveTo(-3, 3, 3, 3, 0, 0);
        ctx.bezierCurveTo(-3, -3, 3, -3, 0, -6);
        ctx.bezierCurveTo(-3, -9, 3, -9, 0, -12);
        ctx.stroke();

        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#ff3366";
        ctx.textAlign = "center";
        ctx.fillText("JUMP", 0, -16);
      } else if (p.type === "heart") {
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("❤️", 0, 0);
      }
      ctx.restore();
    }

    // 7. Hanging/swaying vines over rivers
    for (const river of this.rivers) {
      if (river.vineGrabbed) continue;
      const vineX = river.x + river.vineOffset;
      const handX = vineX + Math.sin(frame * 0.05 + river.phase) * 8;
      const handY = GROUND_Y - 95;
      drawVineRope(ctx, vineX, 0, handX, handY);
    }
  }
}
