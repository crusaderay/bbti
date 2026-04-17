import { interpolate } from './i18n.js';

function trimTextForCanvas(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function truncateLineToWidth(ctx, text, maxWidth, suffix = '…') {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let output = text;
  while (output && ctx.measureText(output + suffix).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return output ? `${output}${suffix}` : suffix;
}

// Character-based wrap — used for CJK where every glyph is a break opportunity.
function wrapTextByChar(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = Array.from(text);
  let line = '';
  let cursorY = y;

  for (const char of chars) {
    const testLine = line + char;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }

  return cursorY;
}

// Word-based wrap — used for English / Latin scripts so we don't split words mid-glyph.
function wrapTextByWord(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }

  return cursorY;
}

function wrapTextByCharLimited(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = Array.from(text);
  let line = '';
  let cursorY = y;
  let lineCount = 0;

  for (const char of chars) {
    const testLine = line + char;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line) {
      lineCount += 1;

      if (lineCount >= maxLines) {
        ctx.fillText(truncateLineToWidth(ctx, line, maxWidth), x, cursorY);
        return cursorY;
      }

      ctx.fillText(line, x, cursorY);
      line = char;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    lineCount += 1;
    const content = lineCount > maxLines ? truncateLineToWidth(ctx, line, maxWidth) : line;
    ctx.fillText(content, x, cursorY);
  }

  return cursorY;
}

function wrapTextByWordLimited(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let cursorY = y;
  let lineCount = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && line) {
      lineCount += 1;

      if (lineCount >= maxLines) {
        ctx.fillText(truncateLineToWidth(ctx, line, maxWidth), x, cursorY);
        return cursorY;
      }

      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    lineCount += 1;
    const content = lineCount > maxLines ? truncateLineToWidth(ctx, line, maxWidth) : line;
    ctx.fillText(content, x, cursorY);
  }

  return cursorY;
}

function hasCJK(text) {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(String(text ?? ''));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (hasCJK(text)) return wrapTextByChar(ctx, text, x, y, maxWidth, lineHeight);
  return wrapTextByWord(ctx, text, x, y, maxWidth, lineHeight);
}

function wrapTextLimited(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  if (hasCJK(text)) return wrapTextByCharLimited(ctx, text, x, y, maxWidth, lineHeight, maxLines);
  return wrapTextByWordLimited(ctx, text, x, y, maxWidth, lineHeight, maxLines);
}

const SHARE_URL = 'https://bbti.hardestquestionfor.men';

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawRadarChart(ctx, result, centerX, centerY, radius, fontStack) {
  const scores = result.modelScores;
  const angleStep = (Math.PI * 2) / scores.length;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;

  for (let ring = 1; ring <= 3; ring += 1) {
    ctx.beginPath();

    scores.forEach((_, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const ringRadius = radius * (ring / 3);
      const x = centerX + Math.cos(angle) * ringRadius;
      const y = centerY + Math.sin(angle) * ringRadius;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.closePath();
    ctx.stroke();
  }

  scores.forEach((_, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  ctx.beginPath();
  scores.forEach((score, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const currentRadius = radius * (score.average / 3);
    const x = centerX + Math.cos(angle) * currentRadius;
    const y = centerY + Math.sin(angle) * currentRadius;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 140, 0, 0.28)';
  ctx.fill();
  ctx.strokeStyle = '#ff8c00';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#dce4ef';
  ctx.font = `600 28px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  scores.forEach((score, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const labelRadius = radius + 42;
    const x = centerX + Math.cos(angle) * labelRadius;
    const y = centerY + Math.sin(angle) * labelRadius;
    ctx.fillText(score.label, x, y);
  });

  ctx.restore();
}

export function generateShareText(result, ui) {
  const { archetype } = result;
  const shareUi = ui?.share ?? {};
  const templates = Array.isArray(shareUi.templates) && shareUi.templates.length > 0
    ? shareUi.templates
    : [`${archetype.code} · ${archetype.name} — ${SHARE_URL}`];

  const template = templates[Math.floor(Math.random() * templates.length)];
  return interpolate(template, {
    code: archetype.code ?? '',
    name: archetype.name ?? '',
    quote: archetype.quote ?? '',
    shortDesc: archetype.shortDesc ?? '',
    url: SHARE_URL,
  });
}

export async function generateShareImage(result, ui) {
  const shareUi = ui?.share ?? {};
  const fontStack = shareUi.fontStack ?? '"Helvetica Neue", sans-serif';
  const brandSubtitle = shareUi.brandSubtitleOnCard ?? ui?.header?.brandSubtitle ?? 'Basketball Big Personality Test';
  const tagline = shareUi.tagline ?? '';
  const canvasInitError = shareUi.canvasInitError ?? 'Canvas init failed';
  const canvasBlobError = shareUi.canvasBlobError ?? 'Share image generation failed';

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(canvasInitError);
  }
  const { archetype } = result;

  ctx.fillStyle = '#090d12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#151b24');
  gradient.addColorStop(1, '#0b1017');
  ctx.fillStyle = gradient;
  ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.strokeStyle = 'rgba(255, 140, 0, 0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(540, 380, 200, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(80, 960);
  ctx.lineTo(1000, 960);
  ctx.stroke();

  drawRoundedRect(ctx, 88, 96, 904, 500, 36);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.35)';
  ctx.stroke();

  ctx.fillStyle = '#ff8c00';
  ctx.font = `800 54px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.fillText('BBTI', 140, 176);

  ctx.fillStyle = '#93a0ae';
  ctx.font = `500 24px ${fontStack}`;
  ctx.fillText(brandSubtitle, 140, 214);

  ctx.fillStyle = '#f7fbff';
  ctx.font = '800 136px "JetBrains Mono", "SF Mono", monospace';
  ctx.fillText(archetype.code, 140, 352);

  ctx.font = `800 56px ${fontStack}`;
  ctx.fillText(archetype.name, 140, 432);

  ctx.fillStyle = '#c4ceda';
  ctx.font = `500 30px ${fontStack}`;
  wrapText(ctx, trimTextForCanvas(archetype.shortDesc), 140, 494, 760, 42);

  ctx.textAlign = 'center';
  drawRadarChart(ctx, result, 540, 1040, 190, fontStack);

  // Lower content area uses top-baseline layout to avoid clipping and overlap.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#f5b054';
  ctx.font = `600 34px ${fontStack}`;
  const quoteText = trimTextForCanvas(`“${archetype.quote}”`);
  wrapTextLimited(ctx, quoteText, 150, 1348, 780, 46, 2);

  ctx.fillStyle = '#dde5ee';
  ctx.font = `500 28px ${fontStack}`;
  const detailText = trimTextForCanvas(archetype.longDesc ?? archetype.fullDesc);
  wrapTextLimited(ctx, detailText, 150, 1452, 780, 36, 4);

  drawRoundedRect(ctx, 120, 1718, 840, 128, 24);
  ctx.fillStyle = 'rgba(255, 140, 0, 0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.28)';
  ctx.stroke();

  ctx.fillStyle = '#ffb457';
  ctx.font = '600 28px "JetBrains Mono", "SF Mono", monospace';
  ctx.fillText('bbti.hardestquestionfor.men', 156, 1754);

  ctx.fillStyle = '#9aa6b2';
  ctx.font = `500 24px ${fontStack}`;
  wrapTextLimited(ctx, trimTextForCanvas(tagline), 156, 1796, 760, 30, 1);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(canvasBlobError));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

export async function downloadShareImage(result, ui) {
  const previewWindow = openMobilePreviewWindow(ui);
  const blob = await generateShareImage(result, ui);
  const filename = `bbti-${result.archetype.code.toLowerCase()}.png`;
  if (previewWindow) {
    renderMobilePreviewWindow(previewWindow, blob, result, ui);
    return;
  }

  triggerFileDownload(blob, filename);
}

export async function copyShareText(result, ui) {
  const text = generateShareText(result, ui);
  await writeClipboardText(text, ui);
  return text;
}

export async function shareResult(result, ui) {
  const text = generateShareText(result, ui);
  // "Generate share image" should only generate/download image and keep users on result page.
  await downloadShareImage(result, ui);
  try {
    await writeClipboardText(text, ui);
  } catch (error) {
    console.warn('Clipboard write failed while sharing (image was generated):', error);
  }
  return text;
}

async function writeClipboardText(text, ui) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    const message = ui?.share?.copyUnsupportedError ?? 'Copy failed: clipboard unavailable';
    throw new Error(message);
  }
}

function isLikelyMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function openMobilePreviewWindow(ui) {
  if (typeof window === 'undefined' || typeof window.open !== 'function' || !isLikelyMobileDevice()) {
    return null;
  }

  const previewWindow = window.open('', '_blank');
  if (!previewWindow) return null;

  const shareUi = ui?.share ?? {};
  const title = shareUi.mobilePreviewPageTitle ?? 'BBTI 分享图';
  const loading = shareUi.mobilePreviewLoading ?? '正在生成分享图...';

  previewWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${escapeHtmlText(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1017;
        color: #f7fbff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .preview-shell {
        width: min(100vw, 860px);
        padding: 24px 16px 40px;
        box-sizing: border-box;
        text-align: center;
      }
      .preview-loading {
        margin: 0;
        color: rgba(247, 251, 255, 0.78);
        font-size: 16px;
      }
    </style>
  </head>
  <body>
    <main class="preview-shell">
      <p class="preview-loading">${escapeHtmlText(loading)}</p>
    </main>
  </body>
</html>`);
  previewWindow.document.close();
  return previewWindow;
}

function renderMobilePreviewWindow(previewWindow, blob, result, ui) {
  const shareUi = ui?.share ?? {};
  const title = shareUi.mobilePreviewPageTitle ?? 'BBTI 分享图';
  const hint = shareUi.mobilePreviewHint ?? '长按图片可保存到相册，或用浏览器右上角分享按钮处理。';
  const url = URL.createObjectURL(blob);

  try {
    const doc = previewWindow.document;
    doc.title = title;
    doc.body.innerHTML = '';

    const style = doc.createElement('style');
    style.textContent = `
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0b1017;
        color: #f7fbff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .preview-shell {
        width: min(100vw, 920px);
        margin: 0 auto;
        padding: 20px 12px 40px;
        box-sizing: border-box;
      }
      .preview-hint {
        margin: 0 0 16px;
        text-align: center;
        color: rgba(247, 251, 255, 0.8);
        font-size: 15px;
        line-height: 1.5;
      }
      .preview-image {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
        margin: 0 auto;
        border-radius: 20px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
      }
    `;
    doc.head.appendChild(style);

    const main = doc.createElement('main');
    main.className = 'preview-shell';

    const hintEl = doc.createElement('p');
    hintEl.className = 'preview-hint';
    hintEl.textContent = hint;

    const image = doc.createElement('img');
    image.className = 'preview-image';
    image.src = url;
    image.alt = `${result.archetype.code} ${result.archetype.name}`;

    main.appendChild(hintEl);
    main.appendChild(image);
    doc.body.appendChild(main);

    previewWindow.addEventListener('beforeunload', () => {
      URL.revokeObjectURL(url);
    }, { once: true });
  } catch (error) {
    console.warn('Preview window rendering failed, falling back to file download:', error);
    URL.revokeObjectURL(url);
    triggerFileDownload(blob, `bbti-${result.archetype.code.toLowerCase()}.png`);
  }
}

function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
