import { W, H, GROUND_Y, HUNTER_MAX_GAP, HUNTER_SWIM_PENALTY } from "./Config.js";
import { drawSoftShadow, drawLittleHand, shadeColor } from "./Helpers.js";

export class Hunter {
  constructor() {
    this.reset();
  }

  reset() {
    this.gap = HUNTER_MAX_GAP;
    this.swimming = false;
    this.swimFramesLeft = 0;
    
    // Adaptive AI
    this.sprintTimer = 0;
    this.maxGapFrames = 0;
  }

  update(monkey, rivers, score, speed) {
    const hunterX = monkey.x - this.gap;

    // Swimming logic
    if (this.swimFramesLeft > 0) {
      this.swimFramesLeft--;
      this.swimming = true;
    } else {
      this.swimming = false;
      for (const river of rivers) {
        if (!river.hunterTriggered && hunterX + 14 > river.x && hunterX - 14 < river.x + river.w) {
          river.hunterTriggered = true;
          this.swimFramesLeft = river.hunterSwimDuration;
          this.swimming = true;
          break;
        }
      }
    }

    // Adaptive AI Speed logic
    let baseClosingSpeed = 0.16 + score / 2200;

    // Sprint when player is at HUNTER_MAX_GAP for too long (10 seconds)
    if (this.gap >= HUNTER_MAX_GAP) {
      this.maxGapFrames++;
      if (this.maxGapFrames > 600) {
        this.sprintTimer = 300; // 5 seconds sprint
        this.maxGapFrames = 0;
      }
    } else {
      this.maxGapFrames = 0;
    }

    if (this.sprintTimer > 0) {
      this.sprintTimer--;
      baseClosingSpeed *= 1.5; // closes in 50% faster
    }

    // Recovery speed reduction (35% slow down if gap is < 20% of max)
    if (this.gap < HUNTER_MAX_GAP * 0.2) {
      baseClosingSpeed *= 0.65;
    }

    const closing = this.swimming ? -HUNTER_SWIM_PENALTY : baseClosingSpeed;
    this.gap -= closing;

    if (this.gap <= 0) {
      this.gap = 0;
    }
  }

  drawNet(ctx, x, y) {
    const angle = -Math.PI / 6;
    const len = 34;
    const netCx = x + Math.cos(angle) * len;
    const netCy = y + Math.sin(angle) * len;

    // handle
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(netCx, netCy);
    ctx.stroke();

    // rim
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(netCx, netCy, 9, 0, Math.PI * 2);
    ctx.stroke();

    // mesh grid
    ctx.strokeStyle = "rgba(120,90,50,0.55)";
    ctx.lineWidth = 0.8;
    for (let i = -8; i <= 8; i += 4) {
      ctx.beginPath();
      ctx.moveTo(netCx - 8, netCy + i);
      ctx.lineTo(netCx + 8, netCy + i);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(netCx + i, netCy - 8);
      ctx.lineTo(netCx + i, netCy + 8);
      ctx.stroke();
    }
  }

  draw(ctx, monkey, frameNum) {
    const hx = monkey.x - this.gap;
    if (hx < -60 || hx > W + 60) return;
    const swing = Math.sin(frameNum * 0.35);
    const SKIN = "#d8a274";
    const OUTLINE = "#3d2612";
    const HAT = "#c9a24a";

    ctx.save();
    ctx.translate(hx, this.swimming ? GROUND_Y - 14 : GROUND_Y);

    if (!this.swimming) drawSoftShadow(ctx, 16, 5);

    const headY = -24;

    if (this.swimming) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const rr = 10 + i * 6 + (frameNum * 0.6) % 6;
        ctx.globalAlpha = Math.max(0, 0.5 - i * 0.15);
        ctx.beginPath();
        ctx.ellipse(0, headY + 24, rr, rr * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ears
    for (const side of [-1, 1]) {
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(side * 10.5, headY, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // head (flat skin circle)
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, headY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eyebrows
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-7, headY - 3);
    ctx.lineTo(-2, headY - 4);
    ctx.moveTo(2, headY - 4);
    ctx.lineTo(7, headY - 3);
    ctx.stroke();

    // eyes
    for (const ex of [-4.5, 4.5]) {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(ex, headY, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex - 0.6, headY - 0.6, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // mustache
    ctx.fillStyle = "#4a3524";
    ctx.beginPath();
    ctx.ellipse(0, headY + 5.5, 5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, headY + 7, 2.4, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // safari hat
    ctx.fillStyle = HAT;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, headY - 10, 13.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, headY - 12, 8, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shadeColor(HAT, -30);
    ctx.fillRect(-8, headY - 12.5, 16, 2.2);

    // little floating hands, one holding the net
    const bob = swing * 2;
    drawLittleHand(ctx, -19, headY + 9 - bob, SKIN, OUTLINE);
    const netHandX = 19;
    const netHandY = headY + 9 + bob;
    this.drawNet(ctx, netHandX, netHandY);
    drawLittleHand(ctx, netHandX, netHandY, SKIN, OUTLINE);

    // Sprint indicators (red angry lines `💢` when sprinting)
    if (this.sprintTimer > 0) {
      ctx.font = "14px Arial";
      ctx.fillStyle = "#d9342b";
      ctx.textAlign = "center";
      ctx.fillText("💢", 0, headY - 18);
    }

    ctx.restore();
  }
}
