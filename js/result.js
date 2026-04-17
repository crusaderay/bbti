import { interpolate } from './i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bandLabel(value, ui) {
  const result = ui?.result ?? {};
  const map = {
    1: result.bandLow ?? 'Low',
    2: result.bandMid ?? 'Mid',
    3: result.bandHigh ?? 'High',
  };
  return map[value] ?? map[2];
}

function detailDescription(archetype) {
  return archetype.longDesc ?? archetype.fullDesc;
}

const IMAGE_ALPHA_THRESHOLD = 12;
const IMAGE_ANALYSIS_MAX_SIDE = 256;
const IMAGE_TARGET_OCCUPANCY = 0.82;
const IMAGE_MIN_ZOOM = 0.9;
const IMAGE_MAX_ZOOM = 1.9;
const IMAGE_BG_COLOR_THRESHOLD = 18;
const IMAGE_MIN_FOREGROUND_PIXELS = 120;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function estimateBackgroundColor(data, width, height) {
  const samplePoints = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  samplePoints.forEach(([x, y]) => {
    const idx = (y * width + x) * 4;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    count += 1;
  });

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
}

function colorDistanceSquared(data, idx, color) {
  const dr = data[idx] - color.r;
  const dg = data[idx + 1] - color.g;
  const db = data[idx + 2] - color.b;
  return dr * dr + dg * dg + db * db;
}

function scanBounds(width, height, predicate) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!predicate(x, y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count += 1;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return {
    left: minX / width,
    top: minY / height,
    right: (maxX + 1) / width,
    bottom: (maxY + 1) / height,
    count,
  };
}

function getArchetypeImageSrc(archetype) {
  const index = Number(archetype.index);
  if (!Number.isFinite(index) || !archetype.code) return null;
  const paddedIndex = String(index).padStart(2, '0');
  return `./img_bbti_normalized/${paddedIndex}_${archetype.code}.png`;
}

function renderArchetypeImage({ archetype, className, loading = 'lazy', ui }) {
  const src = getArchetypeImageSrc(archetype);
  if (!src) return '';
  const altTemplate = ui?.result?.imageAltTemplate ?? '{code} · {name}';
  const alt = interpolate(altTemplate, {
    code: archetype.code ?? '',
    name: archetype.name ?? '',
  });

  return `
    <figure class="${className} js-archetype-image-wrap">
      <img
        class="js-archetype-image"
        src="${src}"
        alt="${escapeHtml(alt)}"
        loading="${loading}"
        decoding="async"
      >
    </figure>
  `;
}

function getOpaqueBounds(imageEl) {
  const { naturalWidth, naturalHeight } = imageEl;
  if (!naturalWidth || !naturalHeight) return null;

  const scale = Math.min(1, IMAGE_ANALYSIS_MAX_SIDE / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.clearRect(0, 0, width, height);
  context.drawImage(imageEl, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const bgColor = estimateBackgroundColor(data, width, height);
  const bgThresholdSquared = IMAGE_BG_COLOR_THRESHOLD * IMAGE_BG_COLOR_THRESHOLD;

  const foregroundBounds = scanBounds(width, height, (x, y) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha <= IMAGE_ALPHA_THRESHOLD) return false;
    if (alpha < 250) return true;
    return colorDistanceSquared(data, idx, bgColor) > bgThresholdSquared;
  });

  if (foregroundBounds && foregroundBounds.count >= IMAGE_MIN_FOREGROUND_PIXELS) {
    return foregroundBounds;
  }

  return scanBounds(width, height, (x, y) => {
    const idx = (y * width + x) * 4;
    return data[idx + 3] > IMAGE_ALPHA_THRESHOLD;
  });
}

function normalizeSingleImage(imageEl) {
  if (imageEl.dataset.sizeNormalized === '1') return;

  try {
    const bounds = getOpaqueBounds(imageEl);
    if (!bounds) return;

    const contentWidth = bounds.right - bounds.left;
    const contentHeight = bounds.bottom - bounds.top;
    if (contentWidth <= 0 || contentHeight <= 0) return;

    const zoom = clamp(
      Math.min(
        IMAGE_TARGET_OCCUPANCY / contentWidth,
        IMAGE_TARGET_OCCUPANCY / contentHeight,
      ),
      IMAGE_MIN_ZOOM,
      IMAGE_MAX_ZOOM,
    );

    const centerX = ((bounds.left + bounds.right) / 2) * 100;
    const centerY = ((bounds.top + bounds.bottom) / 2) * 100;

    imageEl.style.objectPosition = `${centerX.toFixed(2)}% ${centerY.toFixed(2)}%`;
    imageEl.style.setProperty('--archetype-zoom', zoom.toFixed(3));
  } finally {
    imageEl.dataset.sizeNormalized = '1';
  }
}

export function normalizeArchetypeImages(root = document) {
  const images = root.querySelectorAll('.js-archetype-image');

  images.forEach((imageEl) => {
    const runNormalization = () => {
      window.requestAnimationFrame(() => normalizeSingleImage(imageEl));
    };

    if (imageEl.complete && imageEl.naturalWidth > 0) {
      runNormalization();
    } else {
      imageEl.addEventListener('load', runNormalization, { once: true });
    }
  });
}

function renderRadar(result, ui) {
  const scores = result.modelScores;
  const size = 280;
  const center = size / 2;
  const radius = 86;
  const angleStep = (Math.PI * 2) / scores.length;
  const radarAriaLabel = ui?.result?.radarAriaLabel ?? '';

  const points = scores
    .map((score, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const currentRadius = radius * (score.average / 3);
      const x = center + Math.cos(angle) * currentRadius;
      const y = center + Math.sin(angle) * currentRadius;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const rings = [1, 2, 3]
    .map((ring) => {
      const ringPoints = scores
        .map((_, index) => {
          const angle = -Math.PI / 2 + angleStep * index;
          const currentRadius = radius * (ring / 3);
          const x = center + Math.cos(angle) * currentRadius;
          const y = center + Math.sin(angle) * currentRadius;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');

      return `<polygon points="${ringPoints}" class="radar__ring"></polygon>`;
    })
    .join('');

  const spokes = scores
    .map((_, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" class="radar__spoke"></line>`;
    })
    .join('');

  const labels = scores
    .map((score, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const labelRadius = radius + 30;
      const x = center + Math.cos(angle) * labelRadius;
      const y = center + Math.sin(angle) * labelRadius;
      return `
        <g>
          <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="radar__label">
            ${escapeHtml(score.label)}
          </text>
        </g>
      `;
    })
    .join('');

  return `
    <svg class="radar-chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(radarAriaLabel)}">
      ${rings}
      ${spokes}
      <polygon points="${points}" class="radar__shape"></polygon>
      <polygon points="${points}" class="radar__outline"></polygon>
      ${labels}
    </svg>
  `;
}

function renderModelBars(result) {
  return result.modelScores
    .map(
      (score) => `
        <div class="stat-bar">
          <div class="stat-bar__head">
            <span>${escapeHtml(score.label)}</span>
            <strong>${score.percentage}%</strong>
          </div>
          <div class="stat-bar__track">
            <div class="stat-bar__fill" style="width: ${score.percentage}%"></div>
          </div>
        </div>
      `,
    )
    .join('');
}

function renderDimensionList(dimensions, result, ui) {
  return dimensions
    .map((dimension, index) => {
      const value = result.userVector[index];
      return `
        <li class="dimension-chip">
          <span>${escapeHtml(dimension.id)} · ${escapeHtml(dimension.name)}</span>
          <strong>${escapeHtml(bandLabel(value, ui))}</strong>
        </li>
      `;
    })
    .join('');
}

function renderTopMatches(result, ui) {
  const distanceTemplate = ui?.result?.distanceLabelTemplate ?? 'distance {distance}';
  return result.rankedMatches
    .slice(0, 3)
    .map(
      ({ archetype, distance }, index) => `
        <li class="match-row">
          <span>${index + 1}. ${escapeHtml(archetype.code)} · ${escapeHtml(archetype.name)}</span>
          <strong>${escapeHtml(interpolate(distanceTemplate, { distance }))}</strong>
        </li>
      `,
    )
    .join('');
}

function renderPersonalBullets(result) {
  return (result.personalReadout?.bullets ?? [])
    .map(
      (line) => `
        <li class="match-row">
          <span>${escapeHtml(line)}</span>
        </li>
      `,
    )
    .join('');
}

export function renderResultView({ result, dimensions, meme, ui }) {
  const { archetype } = result;
  const description = detailDescription(archetype);
  const resultUi = ui?.result ?? {};
  const originLabel = result.matchedBy === 'special'
    ? (resultUi.originSpecial ?? '')
    : result.matchedBy === 'fallback'
      ? (resultUi.originFallback ?? '')
      : interpolate(resultUi.originDistanceTemplate ?? '', { distance: result.distance });
  const prototype = archetype.playerArchetype ?? archetype.teamArchetype ?? (resultUi.defaultPrototype ?? '');
  const resultImage = renderArchetypeImage({
    archetype,
    className: 'result-hero__image-wrap',
    loading: 'eager',
    ui,
  });
  const analysisHeading = interpolate(resultUi.analysisHeadingTemplate ?? '', {
    name: archetype.name ?? '',
  });

  return `
    <div class="result-layout">
      <article class="result-hero card">
        <div class="result-hero__main">
          <div class="result-hero__copy">
            <p class="eyebrow">${escapeHtml(resultUi.eyebrow ?? '')}</p>
            <div class="result-hero__badge">${escapeHtml(originLabel)}</div>
            <h1 class="result-code">${escapeHtml(archetype.code)}</h1>
            <h2 class="result-name">${escapeHtml(archetype.name)}</h2>
            <p class="result-short">${escapeHtml(archetype.shortDesc)}</p>
          </div>
          <div class="result-hero__visual">
            ${resultImage}
          </div>
        </div>
        <blockquote class="quote-card">“${escapeHtml(archetype.quote)}”</blockquote>
        <div class="action-row">
          <button class="button button--primary" type="button" data-action="share-result">${escapeHtml(resultUi.shareImageButton ?? '')}</button>
          <button class="button" type="button" data-action="copy-share-text">${escapeHtml(resultUi.copyTextButton ?? '')}</button>
          <button class="button" type="button" data-action="restart-quiz">${escapeHtml(resultUi.restartButton ?? '')}</button>
          <button class="button" type="button" data-action="open-gallery">${escapeHtml(resultUi.galleryButton ?? '')}</button>
        </div>
      </article>

      <section class="result-grid">
        <article class="card">
          <div class="card-head">
            <div>
              <p class="eyebrow">${escapeHtml(resultUi.modelsEyebrow ?? '')}</p>
              <h3>${escapeHtml(resultUi.radarHeading ?? '')}</h3>
            </div>
            <span class="pill">${escapeHtml(archetype.rarity || resultUi.unknownRarity || '')}</span>
          </div>
          ${renderRadar(result, ui)}
          <div class="stat-stack">
            ${renderModelBars(result)}
          </div>
        </article>

        <article class="card">
          <p class="eyebrow">${escapeHtml(resultUi.analysisEyebrow ?? '')}</p>
          <h3>${escapeHtml(analysisHeading)}</h3>
          <p class="body-copy">${escapeHtml(description)}</p>
          <div class="result-meta">
            <div>
              <span>${escapeHtml(resultUi.metaPrototypeLabel ?? '')}</span>
              <strong>${escapeHtml(prototype)}</strong>
            </div>
            <div>
              <span>${escapeHtml(resultUi.metaTriggerLabel ?? '')}</span>
              <strong>${escapeHtml(result.note || resultUi.defaultTriggerNote || '')}</strong>
            </div>
          </div>
          ${
            meme
              ? `
                <div class="meme-card">
                  <p class="eyebrow">${escapeHtml(resultUi.memeEyebrow ?? '')}</p>
                  <strong>${escapeHtml(meme.text)}</strong>
                  <span>${escapeHtml(meme.source)}</span>
                </div>
              `
              : ''
          }
        </article>

        <article class="card">
          <p class="eyebrow">${escapeHtml(resultUi.roastEyebrow ?? '')}</p>
          <h3>${escapeHtml(resultUi.roastHeading ?? '')}</h3>
          <p class="body-copy">${escapeHtml(result.personalReadout?.summary ?? resultUi.defaultRoastSummary ?? '')}</p>
          <ul class="match-list">
            ${renderPersonalBullets(result)}
          </ul>
        </article>

        <article class="card">
          <p class="eyebrow">${escapeHtml(resultUi.dimensionsEyebrow ?? '')}</p>
          <h3>${escapeHtml(resultUi.dimensionsHeading ?? '')}</h3>
          <ul class="dimension-grid">
            ${renderDimensionList(dimensions, result, ui)}
          </ul>
        </article>

        <article class="card">
          <p class="eyebrow">${escapeHtml(resultUi.matchesEyebrow ?? '')}</p>
          <h3>${escapeHtml(resultUi.matchesHeading ?? '')}</h3>
          <ul class="match-list">
            ${renderTopMatches(result, ui)}
          </ul>
        </article>
      </section>
    </div>
  `;
}

function renderGalleryCard(archetype, currentCode, ui) {
  const galleryUi = ui?.gallery ?? {};
  const prototype = archetype.playerArchetype ?? archetype.teamArchetype ?? (galleryUi.defaultPrototype ?? '');
  const description = detailDescription(archetype);
  const isActive = currentCode === archetype.code ? ' is-current' : '';
  const archetypeImage = renderArchetypeImage({
    archetype,
    className: 'gallery-card__image-wrap',
    ui,
  });

  return `
    <article class="gallery-card card${isActive}">
      <div class="gallery-card__top">
        <div>
          <p class="eyebrow">${escapeHtml(archetype.rarity || galleryUi.unlabeledRarity || '')}</p>
          <h3>${escapeHtml(archetype.code)} · ${escapeHtml(archetype.name)}</h3>
        </div>
        <span class="pill">${escapeHtml(archetype.isSpecial ? (galleryUi.specialBadge ?? '') : (galleryUi.standardBadge ?? ''))}</span>
      </div>
      ${archetypeImage}
      <p class="gallery-card__short">${escapeHtml(archetype.shortDesc)}</p>
      <blockquote class="gallery-card__quote">“${escapeHtml(archetype.quote)}”</blockquote>
      <p class="gallery-card__body">${escapeHtml(description)}</p>
      <div class="gallery-card__meta">
        <span>${escapeHtml(prototype)}</span>
        ${
          archetype.triggerCondition
            ? `<strong>${escapeHtml(archetype.triggerCondition)}</strong>`
            : ''
        }
      </div>
    </article>
  `;
}

export function renderGalleryView({ archetypes, currentCode, ui }) {
  const galleryUi = ui?.gallery ?? {};
  return `
    <div class="gallery-layout">
      <article class="card gallery-hero">
        <p class="eyebrow">${escapeHtml(galleryUi.eyebrow ?? '')}</p>
        <h1>${escapeHtml(galleryUi.title ?? '')}</h1>
        <p class="body-copy">
          ${escapeHtml(galleryUi.body ?? '')}
        </p>
        <div class="action-row">
          <button class="button button--primary" type="button" data-action="show-result">${escapeHtml(galleryUi.returnResultButton ?? '')}</button>
          <button class="button" type="button" data-action="show-landing">${escapeHtml(galleryUi.backHomeButton ?? '')}</button>
        </div>
      </article>
      <section class="gallery-grid">
        ${archetypes.map((archetype) => renderGalleryCard(archetype, currentCode, ui)).join('')}
      </section>
    </div>
  `;
}
