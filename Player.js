import { W, H, GROUND_Y, GRAVITY, JUMP_FORCE, SWING_LIFT, MAX_HANG_GRACE, DOUBLE_TAP_WINDOW } from "./Config.js";
import { drawSoftShadow, drawLittleHand, drawVineRope } from "./Helpers.js";

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 90;
    this.y = GROUND_Y - 40;
    this.w = 40;
    this.h = 40;
    this.vy = 0;
    this.jumping = false;
    this.swinging = false;
    this.swingT = 0;
    this.swingDuration = 0;
    this.swingStartY = 0;
    this.digging = false;

    // Game feel & Power-ups
    this.coyoteTimeFramesLeft = 0;
    this.jumpBufferFramesLeft = 0;
    this.superJumpTimer = 0;
    this.wasGroundedLastFrame = true;
    this.invisible = false;
    this.floatAngle = 0;
    this.lives = 1;
    this.invulnerableTimer = 0;
  }

  isGrounded() {
    return this.y >= GROUND_Y - this.h;
  }

  jump(sfx) {
    if (this.swinging || this.digging) return;

    const currentJumpForce = this.superJumpTimer > 0 ? JUMP_FORCE * 1.38 : JUMP_FORCE;

    if (this.isGrounded() || this.coyoteTimeFramesLeft > 0) {
      this.vy = currentJumpForce;
      this.jumping = true;
      this.coyoteTimeFramesLeft = 0;
      if (sfx) sfx.jump();
    } else {
      // Trigger jump buffer if in air
      this.jumpBufferFramesLeft = 6;
    }
  }

  collectSuperJump() {
    this.superJumpTimer = 600; // 10 seconds at 60fps
  }

  takeDamage(endGame, reason) {
    if (this.invulnerableTimer > 0) return; // Ignore damage if invulnerable
    this.lives--;
    if (this.lives <= 0) {
      endGame(reason);
    } else {
      this.invulnerableTimer = 90; // 1.5 seconds of invulnerability
    }
  }

  update(activeRock, frame, endGame, sfx) {
    // Decrement timers
    if (this.invulnerableTimer > 0) this.invulnerableTimer--;
    if (this.jumpBufferFramesLeft > 0) this.jumpBufferFramesLeft--;
    if (this.superJumpTimer > 0) this.superJumpTimer--;

    // Coyote time tracking
    const grounded = this.isGrounded();
    if (!grounded && this.wasGroundedLastFrame && !this.jumping && !this.swinging) {
      this.coyoteTimeFramesLeft = 5;
    }
    if (!grounded && this.coyoteTimeFramesLeft > 0) {
      this.coyoteTimeFramesLeft--;
    }
    this.wasGroundedLastFrame = grounded;

    // Jump buffer check
    if (grounded && this.jumpBufferFramesLeft > 0) {
      this.jumpBufferFramesLeft = 0;
      this.jump(sfx);
    }

    // Monkey physics: swinging on vine vs normal gravity
    if (this.swinging) {
      this.swingT++;
      if (this.swingT > this.swingDuration + MAX_HANG_GRACE) {
        endGame("vine");
        return;
      }
      const t = Math.min(1, this.swingT / this.swingDuration);
      const arc = Math.sin(t * Math.PI) * SWING_LIFT;
      const idleSway = t >= 1 ? Math.sin(frame * 0.08) * 4 : 0;
      this.y = this.swingStartY - arc - idleSway;
    } else {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= GROUND_Y - this.h) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.jumping = false;
      }
    }
  }

  handleSwingRelease(lastSwingTapFrame, sfx) {
    this.swinging = false;
    this.vy = 0;
    if (sfx) sfx.vineRelease();
  }

  draw(ctx, frameNum) {
    if (this.invisible) return;
    if (this.invulnerableTimer > 0 && Math.floor(frameNum / 4) % 2 === 0) return;
    const cx = this.x + this.w / 2;
    const baseY = this.y + this.h;
    const jumping = this.jumping;
    const swing = jumping ? 0 : Math.sin(frameNum * 0.35);
    
    // Gorilla Palette
    const FUR = "#38383c";      // Dark charcoal grey
    const SKIN = "#6d6d74";     // Lighter muzzle/chest grey
    const OUTLINE = "#1b1b1d";  // Almost black
    const CHEST = "#525259";

    ctx.save();
    ctx.translate(cx, baseY - this.h / 2);
    if (this.floatAngle) {
      ctx.rotate(this.floatAngle);
    }
    ctx.translate(0, this.h / 2);

    drawSoftShadow(ctx, 16, 5);

    // Super jump indicator (spring mola effect under the monkey)
    if (this.superJumpTimer > 0) {
      ctx.save();
      ctx.strokeStyle = "#ff3366";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      // Draw a small 2D spiral spring
      ctx.moveTo(-10, 0);
      ctx.bezierCurveTo(-5, -5, 5, -5, 0, -8);
      ctx.bezierCurveTo(-5, -10, 5, -10, 0, -14);
      ctx.bezierCurveTo(-5, -15, 5, -15, 0, -18);
      ctx.stroke();
      ctx.restore();
    }

    const headY = -25;
    const bodyY = -9;

    // 1. Left Arm (behind body)
    const leftArmBob = -1 * swing * 2.5;
    ctx.save();
    ctx.translate(-4, bodyY - 4);
    ctx.fillStyle = FUR;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    // Shoulder
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Forearm
    ctx.beginPath(); ctx.ellipse(0, 7 + leftArmBob, 4.5, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawLittleHand(ctx, 0, 14 + leftArmBob, SKIN, OUTLINE);
    ctx.restore();

    // 2. Thick stocky neck / back fur
    ctx.fillStyle = FUR;
    ctx.beginPath();
    ctx.ellipse(-3, headY + 5, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. Body (Robust muscular chest)
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, 14, 12.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Gorilla Chest Plate (abs/muscles line) - shifted right
    ctx.fillStyle = CHEST;
    ctx.beginPath();
    ctx.ellipse(3, bodyY + 1.5, 8, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Chest center division
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3, bodyY - 6.5);
    ctx.lineTo(3, bodyY + 9.5);
    ctx.stroke();

    // 4. Head (sagittal crest style)
    ctx.fillStyle = FUR;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, headY);
    ctx.bezierCurveTo(-11, headY - 14, 11, headY - 14, 9, headY);
    ctx.arc(0, headY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5. Gorilla Face Mask - shifted right
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(5, headY + 2.5, 6.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrow ridge - shifted right
    ctx.fillStyle = FUR;
    ctx.fillRect(0, headY - 3, 11, 2.5);

    // Right-facing Eye
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(7.5, headY + 1.2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(8, headY + 0.6, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(8, headY + 4.5, 1.2, 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(5, headY + 8, 3.5, 0.1, Math.PI - 0.7);
    ctx.stroke();

    // 6. Ear (facing right, ear is on left side of face)
    ctx.fillStyle = FUR;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-4, headY - 1, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 7. Right Arm (in front)
    const rightArmBob = 1 * swing * 2.5;
    ctx.save();
    ctx.translate(6, bodyY - 4);
    ctx.fillStyle = FUR;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    // Shoulder
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Forearm
    ctx.beginPath(); ctx.ellipse(0, 7 + rightArmBob, 5.5, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawLittleHand(ctx, 0, 15 + rightArmBob, SKIN, OUTLINE);
    ctx.restore();

    // 8. Feet
    const footY = -1.2;
    const footBob = Math.abs(swing) * 2.2;
    // Left foot (behind)
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(-4, footY - (2.2 - footBob), 6, 4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Right foot (front)
    ctx.beginPath();
    ctx.ellipse(5, footY - footBob, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Super jump indicator (Spring/Mola floating overlay)
    if (this.superJumpTimer > 0) {
      ctx.font = "14px Arial";
      ctx.fillStyle = "#ff3366";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "center";
      ctx.fillText(`⚡ JUMP: ${Math.ceil(this.superJumpTimer / 60)}s`, 0, headY - 18);
    }

    ctx.restore();
  }
}
