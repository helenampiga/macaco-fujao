import { GROUND_Y, W } from "./Config.js";

export function lerpColor(c1, c2, factor) {
  const parse = (hex) => {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(x => x + x).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  };
  const rgb1 = parse(c1);
  const rgb2 = parse(c2);
  const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor);
  const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor);
  const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

export function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0xff) + percent;
  let b = (num & 0xff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

export function drawSoftShadow(ctx, rx, ry) {
  const grad = ctx.createRadialGradient(0, -1, 1, 0, -1, rx);
  grad.addColorStop(0, "rgba(20,15,10,0.38)");
  grad.addColorStop(1, "rgba(20,15,10,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, -1, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawVineRope(ctx, ax, ay, hx, hy, armed) {
  ctx.save();
  ctx.strokeStyle = armed ? "#d9c23c" : "#3f6b2a";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + hx) / 2 + (hx - ax) * 0.15, (ay + hy) / 2, hx, hy);
  ctx.stroke();
  // leaf tufts along the vine
  for (let t = 0.25; t < 1; t += 0.25) {
    const lx = ax + (hx - ax) * t;
    const ly = ay + (hy - ay) * t;
    ctx.fillStyle = "#4f8a34";
    ctx.beginPath();
    ctx.ellipse(lx - 3, ly, 4, 2, 0.6, 0, Math.PI * 2);
    ctx.ellipse(lx + 3, ly + 2, 4, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // knot/handle
  ctx.fillStyle = "#5c4322";
  ctx.beginPath();
  ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLittleHand(ctx, x, y, color, outline) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // finger creases
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.8;
  for (const fx of [-2, 0, 2]) {
    ctx.beginPath();
    ctx.moveTo(x + fx, y + 3);
    ctx.lineTo(x + fx, y + 4.8);
    ctx.stroke();
  }
}
