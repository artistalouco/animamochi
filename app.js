// Definição das camadas atmosféricas
const ATMOSPHERE_LAYERS = [
  { id: 'ETHEREAL', name: 'Zona Etérea', min: 12000, max: 16000, color: '#92400e', mapColor: '#78350f', label: '> 12.000m', tempRange: '-5°C a -50°C' },
  { id: 'ELEVATED', name: 'Zona Elevada', min: 5000, max: 12000, color: '#0369a1', mapColor: '#075985', label: '5.000 - 12.000m', tempRange: '5°C a -5°C' },
  { id: 'FLOATING', name: 'Zona Flutuante', min: 2000, max: 5000, color: '#047857', mapColor: '#065f46', label: '2.000 - 5.000m', tempRange: '18°C a 5°C' },
  { id: 'TWILIGHT', name: 'Zona Crepuscular', min: 1000, max: 2000, color: '#c2410c', mapColor: '#9a3412', label: '1.000 - 2.000m', tempRange: '28°C a 18°C' },
  { id: 'ABYSSAL',  name: 'Zona Abissal & Oceano Global', min: 0, max: 1000, color: '#dc2626', mapColor: '#991b1b', label: '0 - 1.000m', tempRange: '40°C a 28°C' }
];

function calculateTemperature(z) {
  const clampedZ = Math.max(0, Math.min(16000, z));
  if (clampedZ <= 1000) {
    // Abissal (0m = 40°C -> 1000m = 28°C)
    return 40 - (clampedZ / 1000) * 12;
  } else if (clampedZ <= 2000) {
    // Crepuscular (1000m = 28°C -> 2000m = 18°C)
    return 28 - ((clampedZ - 1000) / 1000) * 10;
  } else if (clampedZ <= 5000) {
    // Flutuante (2000m = 18°C -> 5000m = 5°C)
    return 18 - ((clampedZ - 2000) / 3000) * 13;
  } else if (clampedZ <= 12000) {
    // Elevada (5000m = 5°C -> 12000m = -5°C)
    return 5 - ((clampedZ - 5000) / 7000) * 10;
  } else {
    // Etérea (12000m = -5°C -> 16000m = -50°C)
    return -5 - ((clampedZ - 12000) / 4000) * 45;
  }
}

function formatTemp(t) {
  const rounded = Math.round(t * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1).replace('.', ',')}°C`;
}

const PRESET_WAYPOINT_COLORS = [
  '#0284c7', '#059669', '#b45309', '#c2410c', '#dc2626', '#7c3aed', '#1e40af'
];

const WP_CATEGORIES = {
  'CAPITAL': { label: 'Capital', icon: '👑' },
  'CITY': { label: 'Cidade', icon: '🏙️' },
  'POI': { label: 'Ponto de Interesse', icon: '📍' },
  'HIDEOUT': { label: 'Esconderijo', icon: '🗝️' },
  'ALERT': { label: 'Alerta', icon: '⚠️' },
  'RUINS': { label: 'Ruínas', icon: '🏚️' },
  'UNKNOWN': { label: 'Desconhecido', icon: '❓' }
};

let selectedModalColor = PRESET_WAYPOINT_COLORS[0];

function getQuadrantInfo(x, y) {
  if (x === 0 && y === 0) {
    return { code: 'MZ', name: 'Marco Zero / Olho Solar', theme: '#0284c7', cardinal: 'Centro' };
  }
  if (x >= 0 && y >= 0) {
    return { code: 'QI', name: 'Quadrante I - Aurora (Esmeralda)', theme: '#059669', cardinal: 'Nordeste' };
  }
  if (x < 0 && y >= 0) {
    return { code: 'QII', name: 'Quadrante II - Zênite (Tecnológico)', theme: '#b45309', cardinal: 'Noroeste' };
  }
  if (x < 0 && y < 0) {
    return { code: 'QIII', name: 'Quadrante III - Crepúsculo (Horizonte)', theme: '#c2410c', cardinal: 'Sudoeste' };
  }
  return { code: 'QIV', name: 'Quadrante IV - Fenda (Umbria)', theme: '#7c3aed', cardinal: 'Sudeste' };
}

function getAltitudeLayer(z) {
  for (const layer of ATMOSPHERE_LAYERS) {
    if (z >= layer.min && z <= layer.max) return layer;
  }
  return z > 16000 ? ATMOSPHERE_LAYERS[0] : ATMOSPHERE_LAYERS[4];
}

function formatCota(z) {
  const kmVal = (z / 1000).toFixed(1);
  return `${z >= 0 ? '+' : ''}${Math.round(z).toLocaleString('pt-BR')}m (${kmVal}km)`;
}

function formatDist(d) {
  if (Math.abs(d) >= 1000) {
    return `${(d / 1000).toFixed(1).replace('.', ',')} km (${Math.round(d).toLocaleString('pt-BR')} m)`;
  }
  return `${Math.round(d).toLocaleString('pt-BR')} m`;
}

function formatCoordKm(val) {
  const km = (val / 1000).toFixed(1).replace('.', ',');
  return `${val >= 0 ? '+' : ''}${km} km`;
}

function formatETA(hours) {
  if (!isFinite(hours) || hours > 999) return 'BLOQUEIO EÓLICO';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function buildVectorString(x, y, z) {
  const quad = getQuadrantInfo(x, y);
  const layer = getAltitudeLayer(z);
  return `[${quad.code} - ${quad.name.replace(/Quadrante [IV]+ - /, '')}] + [${layer.name}] + Cota [${formatCota(z)}]`;
}

// -------------------------------------------------------------
// MODELO METEOROLÓGICO: VELOCIDADE HORIZONTAL E VERTICAL DO VENTO
// -------------------------------------------------------------
function calculateWind(x, y, z) {
  const r_km = Math.hypot(x, y) / 1000;
  let v_h = 0;
  let v_v = 0;

  // Zonas Inferiores: Crepuscular e Abissal (z <= 2000m)
  const r_eye_low = 22;
  let low_vh = 0;
  let low_vv = 0;

  if (r_km <= r_eye_low) {
    const t = r_km / r_eye_low;
    low_vh = 1.0 + (500.0 - 1.0) * t;
    low_vv = 0.5 + 115.0 * t;
  } else {
    const t = Math.min(1.0, (r_km - r_eye_low) / (500.0 - r_eye_low));
    low_vh = 11.0 + (500.0 - 11.0) * Math.pow(Math.max(0, 1.0 - t), 2.8);
    low_vv = 1.0 + 115.0 * Math.pow(Math.max(0, 1.0 - t), 3.5);
  }

  // Zona Elevada: 5.000m - 12.000m (50 a 80 km/h)
  const elev_vh = 50.0 + 30.0 * Math.exp(-r_km / 380.0);
  const elev_vv = 6.0 + 5.0 * Math.exp(-r_km / 300.0);

  // Zona Etérea: 12.000m - 16.000m (~250 km/h disperso)
  const eth_vh = 245.0 + 10.0 * Math.sin(r_km / 50.0) - 5.0 * Math.exp(-r_km / 60.0);
  const eth_vv = 15.0 + 10.0 * Math.exp(-r_km / 220.0);

  if (z <= 2000) {
    v_h = low_vh;
    v_v = low_vv;
  } else if (z <= 5000) {
    const k = (z - 2000) / 3000;
    v_h = (1 - k) * low_vh + k * elev_vh;
    v_v = (1 - k) * low_vv + k * elev_vv;
  } else if (z <= 12000) {
    v_h = elev_vh;
    v_v = elev_vv;
  } else {
    const k = Math.min(1.0, (z - 12000) / 3000);
    v_h = (1 - k) * elev_vh + k * eth_vh;
    v_v = (1 - k) * elev_vv + k * eth_vv;
  }

  const v_total = Math.hypot(v_h, v_v);
  const angle = Math.atan2(y, x) + Math.PI / 2;
  return {
    h: Math.round(v_h),
    v: Math.round(v_v),
    total: Math.round(v_total),
    angle: angle,
    vx: Math.cos(angle) * v_h,
    vy: Math.sin(angle) * v_h,
    vz: v_v
  };
}

// -------------------------------------------------------------
// MOTOR DE SIMULAÇÃO DE NAVEGAÇÃO, DERIVA E ROTA ÓTIMA
// -------------------------------------------------------------
function evaluatePathMetrics(points, airspeedKmh) {
  let totalDistMeters = 0;
  let totalTimeHours = 0;
  let weightedWindComponent = 0;
  let maxTurbulence = 0;
  let stalledSegments = 0;
  const segmentData = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dz = p1.z - p0.z;
    const segDist = Math.hypot(dx, dy, dz);
    if (segDist < 1) continue;

    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    const midZ = (p0.z + p1.z) / 2;

    const wind = calculateWind(midX, midY, midZ);
    if (wind.total > maxTurbulence) maxTurbulence = wind.total;

    // Vetor unitário da direção do segmento
    const ux = dx / segDist;
    const uy = dy / segDist;
    const uz = dz / segDist;

    // Produto escalar entre o vento 3D e a direção de voo (positivo = vento de cauda, negativo = vento de proa)
    const tailWind = (wind.vx * ux) + (wind.vy * uy) + (wind.vz * uz);

    // Penalidade por deriva lateral (crosswind exige correção de proa)
    const crossWindVecX = wind.vx - tailWind * ux;
    const crossWindVecY = wind.vy - tailWind * uy;
    const crossWindMag = Math.hypot(crossWindVecX, crossWindVecY);
    const crabDragPenalty = crossWindMag * 0.18;

    const netWindEffect = tailWind - crabDragPenalty;
    const rawGroundSpeed = airspeedKmh + netWindEffect;
    if (rawGroundSpeed < 20) stalledSegments++;

    const effectiveGroundSpeed = Math.max(15, rawGroundSpeed);
    const segDistKm = segDist / 1000;
    const segTimeHours = segDistKm / effectiveGroundSpeed;

    totalDistMeters += segDist;
    totalTimeHours += segTimeHours;
    weightedWindComponent += netWindEffect * segDist;

    segmentData.push({
      p0, p1,
      midZ,
      wind,
      netWindEffect,
      groundSpeed: effectiveGroundSpeed,
      cumDist: totalDistMeters
    });
  }

  const avgGroundSpeed = totalTimeHours > 0 ? (totalDistMeters / 1000) / totalTimeHours : airspeedKmh;
  const avgWindEffect = totalDistMeters > 0 ? weightedWindComponent / totalDistMeters : 0;

  return {
    points,
    segmentData,
    totalDistMeters,
    totalTimeHours,
    avgGroundSpeed,
    avgWindEffect,
    maxTurbulence,
    stalledSegments
  };
}

function buildQuadraticCurvePoints(wpA, wpB, ctrlPoint, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const x = inv * inv * wpA.x + 2 * inv * t * ctrlPoint.x + t * t * wpB.x;
    const y = inv * inv * wpA.y + 2 * inv * t * ctrlPoint.y + t * t * wpB.y;
    const z = inv * inv * wpA.z + 2 * inv * t * ctrlPoint.z + t * t * wpB.z;
    pts.push({ x, y, z: Math.max(100, Math.min(15800, z)) });
  }
  return pts;
}

function computeFlightSimulation(wpA, wpB, airspeedKmh) {
  if (!wpA || !wpB || wpA.id === wpB.id) return null;

  const steps = 40;
  const midX = (wpA.x + wpB.x) / 2;
  const midY = (wpA.y + wpB.y) / 2;
  const midZ = (wpA.z + wpB.z) / 2;

  // 1. Rota Direta (Linha Reta 3D)
  const directPoints = buildQuadraticCurvePoints(wpA, wpB, { x: midX, y: midY, z: midZ }, steps);
  const directEval = evaluatePathMetrics(directPoints, airspeedKmh);

  // 2. Busca pela Rota Ótima (Testa diferentes arcos laterais e cotas de cruzeiro atmosféricas)
  const dx = wpB.x - wpA.x;
  const dy = wpB.y - wpA.y;
  const dist2D = Math.hypot(dx, dy);
  const perpX = dist2D > 0 ? -dy / dist2D : 0;
  const perpY = dist2D > 0 ? dx / dist2D : 0;

  let bestEval = directEval;

  const lateralOffsets = [-0.35, -0.2, -0.1, 0, 0.1, 0.2, 0.35];
  const candidateAltitudes = [midZ, 3800, 6800, 9500, 13200];

  lateralOffsets.forEach(latFactor => {
    candidateAltitudes.forEach(targetZ => {
      const ctrl = {
        x: midX + perpX * dist2D * latFactor,
        y: midY + perpY * dist2D * latFactor,
        z: targetZ
      };
      const candidatePts = buildQuadraticCurvePoints(wpA, wpB, ctrl, steps);
      const candEval = evaluatePathMetrics(candidatePts, airspeedKmh);

      // Função custo que prioriza menor tempo de viagem e penaliza turbulência extrema (>320 km/h)
      const candScore = candEval.totalTimeHours * (candEval.maxTurbulence > 320 ? 1.25 : 1.0);
      const bestScore = bestEval.totalTimeHours * (bestEval.maxTurbulence > 320 ? 1.25 : 1.0);

      if (candScore < bestScore - 0.01) {
        bestEval = candEval;
      }
    });
  });

  return {
    direct: directEval,
    optimal: bestEval
  };
}

const appState = {
  camera: {
    yaw: 45 * (Math.PI / 180),
    pitch: 35 * (Math.PI / 180),
    zoom: 0.00075,
    panX: 0,
    panY: 30,
    heightScale: 20.0
  },
  cursorAltitude: 3400,
  sondeOpacity: 0.85,
  sondeThickness: 1.8,
  sim: {
    airspeed: 180,
    routeMode: 'OPTIMAL',
    lastResult: null
  },
  mouse: {
    isDragging: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
    canvasX: 0,
    canvasY: 0,
    isOverCanvas: false,
    groundCoords: { x: 0, y: 0 }
  },
  ruler: {
    active: false,
    pointA: null,
    pointB: null
  },
  profile: {
    isExpanded: false,
    hoverRatio: null
  },
  showLayerPlanes: true,
  showStems: true,
  showWindFlow: true,
  animTime: 0,
  filterLayer: 'ALL',
  filterCategory: 'ALL',
  searchQuery: '',
  wpCompactMode: true,
  selectedWaypointId: '1',
  hoveredWaypoint: null,
  pendingEditId: null,
  zoneImages: {
    ETHEREAL: { img: null, opacity: 0.7, name: '' },
    ELEVATED: { img: null, opacity: 0.7, name: '' },
    FLOATING: { img: null, opacity: 0.7, name: '' },
    TWILIGHT: { img: null, opacity: 0.7, name: '' },
    ABYSSAL:  { img: null, opacity: 0.7, name: '' }
  },
  waypoints: [
    { id: '1', name: 'Olho Solar (Marco Zero)', category: 'CAPITAL', customIcon: '👑', x: 0, y: 0, z: 2500, color: '#0284c7', desc: 'Ponto Primordial Central' },
    { id: '2', name: 'Ilha Aiyra (Mura)', category: 'CITY', customIcon: '🏙️', x: 260000, y: 220000, z: 3400, color: '#059669', desc: 'Capital Esmeralda' },
    { id: '3', name: 'Posto Avançado / Zenith', category: 'POI', customIcon: '📍', x: -280000, y: 310000, z: 8500, color: '#b45309', desc: 'Guilda dos Céus' },
    { id: '4', name: 'Horiz / Ajunta', category: 'HIDEOUT', customIcon: '🗝️', x: -310000, y: -240000, z: 3100, color: '#c2410c', desc: 'Libertadores do Horizonte' },
    { id: '5', name: 'Entrada de Ruína Antiga', category: 'RUINS', customIcon: '🏚️', x: 280000, y: -290000, z: 850, color: '#dc2626', desc: 'Borda da Grande Fenda' },
    { id: '6', name: 'Estação Superior de Éter', category: 'ALERT', customIcon: '⚠️', x: 120000, y: 150000, z: 13500, color: '#0f766e', desc: 'Coleta de Cristais Solares' },
    { id: '7', name: 'Sonda Submersa do Abismo', category: 'UNKNOWN', customIcon: '❓', x: 90000, y: -160000, z: 450, color: '#7c3aed', desc: 'Nuvem Tóxica Abissal' }
  ]
};

const canvas = document.getElementById('viewCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');

const compassCanvas = document.getElementById('compassCanvas');
const compassCtx = compassCanvas.getContext('2d');

const profileCanvas = document.getElementById('profileCanvas');
const profileCtx = profileCanvas.getContext('2d');
const profileContainer = document.getElementById('profileCanvasContainer');
const profileDrawer = document.getElementById('profileDrawer');
const telemBar = document.getElementById('telemBar');

function project3D(x, y, z) {
  const cam = appState.camera;
  const scaledZ = z * cam.heightScale;

  const cosYaw = Math.cos(cam.yaw);
  const sinYaw = Math.sin(cam.yaw);
  const rx = x * cosYaw - y * sinYaw;
  const ry = x * sinYaw + y * cosYaw;

  const cosPitch = Math.cos(cam.pitch);
  const sinPitch = Math.sin(cam.pitch);
  const rz = ry * sinPitch + scaledZ * cosPitch;
  const depth = ry * cosPitch - scaledZ * sinPitch;

  const cx = canvas.width / 2 + cam.panX;
  const cy = canvas.height / 2 + cam.panY;

  return {
    screenX: cx + rx * cam.zoom,
    screenY: cy - rz * cam.zoom,
    depth: depth
  };
}

function unprojectScreenToGround(screenX, screenY, groundZ = 0) {
  const cam = appState.camera;
  const cx = canvas.width / 2 + cam.panX;
  const cy = canvas.height / 2 + cam.panY;

  const dx = (screenX - cx) / cam.zoom;
  const dy = (cy - screenY) / cam.zoom;

  const cosPitch = Math.cos(cam.pitch);
  const sinPitch = Math.sin(cam.pitch);
  const cosYaw = Math.cos(cam.yaw);
  const sinYaw = Math.sin(cam.yaw);

  const scaledZ = groundZ * cam.heightScale;
  const safeSin = Math.abs(sinPitch) < 0.001 ? 0.001 : sinPitch;
  const ry = (dy - scaledZ * cosPitch) / safeSin;
  const rx = dx;

  const x = rx * cosYaw + ry * sinYaw;
  const y = -rx * sinYaw + ry * cosYaw;

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

// -------------------------------------------------------------
// RENDERIZAÇÃO BOTTOM-UP DAS CAMADAS E IMAGENS PNG
// -------------------------------------------------------------
function renderAtmosphereAndZoneImages() {
  const gridSize = 500000;

  const sortedLayers = [
    { layer: ATMOSPHERE_LAYERS.find(l => l.id === 'ABYSSAL'),  z: 0 },
    { layer: ATMOSPHERE_LAYERS.find(l => l.id === 'TWILIGHT'), z: 1000 },
    { layer: ATMOSPHERE_LAYERS.find(l => l.id === 'FLOATING'), z: 2000 },
    { layer: ATMOSPHERE_LAYERS.find(l => l.id === 'ELEVATED'), z: 5000 },
    { layer: ATMOSPHERE_LAYERS.find(l => l.id === 'ETHEREAL'), z: 12000 }
  ];

  sortedLayers.forEach(({ layer, z }) => {
    if (!layer) return;
    if (appState.filterLayer !== 'ALL' && appState.filterLayer !== layer.id) return;

    const zoneData = appState.zoneImages[layer.id];
    const hasImage = !!(zoneData && zoneData.img);
    const isHighlighted = (appState.filterLayer === 'ALL' || appState.filterLayer === layer.id);
    const layerMapColor = layer.mapColor || layer.color;

    const pSW = project3D(-gridSize, -gridSize, z);
    const pSE = project3D(gridSize, -gridSize, z);
    const pNE = project3D(gridSize, gridSize, z);
    const pNW = project3D(-gridSize, gridSize, z);

    if (hasImage) {
      const img = zoneData.img;
      const w = img.width || 1000;
      const h = img.height || 1000;

      const a = (pNE.screenX - pNW.screenX) / w;
      const b = (pNE.screenY - pNW.screenY) / w;
      const c = (pSW.screenX - pNW.screenX) / h;
      const d = (pSW.screenY - pNW.screenY) / h;
      const e = pNW.screenX;
      const f = pNW.screenY;

      ctx.save();
      ctx.globalAlpha = zoneData.opacity;
      ctx.imageSmoothingEnabled = true;
      ctx.transform(a, b, c, d, e, f);
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = layerMapColor;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pSW.screenX, pSW.screenY);
      ctx.lineTo(pSE.screenX, pSE.screenY);
      ctx.lineTo(pNE.screenX, pNE.screenY);
      ctx.lineTo(pNW.screenX, pNW.screenY);
      ctx.closePath();
      ctx.stroke();

      ctx.font = 'bold 9px Consolas, monospace';
      ctx.fillStyle = layerMapColor;
      ctx.textAlign = 'left';
      ctx.fillText(`${layer.name.toUpperCase()} [${formatCota(z)} | 🌡️ ${layer.tempRange}]`, pSE.screenX + 6, pSE.screenY);
      ctx.restore();
    } else if (appState.showLayerPlanes && z > 0) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = isHighlighted ? layerMapColor : 'rgba(100, 116, 139, 0.18)';
      ctx.fillStyle = isHighlighted ? (layerMapColor + '14') : 'transparent';

      ctx.beginPath();
      ctx.moveTo(pSW.screenX, pSW.screenY);
      ctx.lineTo(pSE.screenX, pSE.screenY);
      ctx.lineTo(pNE.screenX, pNE.screenY);
      ctx.lineTo(pNW.screenX, pNW.screenY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = 'bold 9px Consolas, monospace';
      ctx.fillStyle = isHighlighted ? layerMapColor : 'rgba(100, 116, 139, 0.45)';
      ctx.textAlign = 'left';
      ctx.fillText(`${layer.name.toUpperCase()} [${formatCota(z)} | 🌡️ ${layer.tempRange}]`, pSE.screenX + 6, pSE.screenY);
      ctx.restore();
    }
  });

  if (appState.showLayerPlanes && (appState.filterLayer === 'ALL' || appState.filterLayer === 'ETHEREAL')) {
    const zCeil = 16000;
    const topLayer = ATMOSPHERE_LAYERS[0];
    const topColor = topLayer.mapColor || topLayer.color;
    const c1 = project3D(-gridSize, -gridSize, zCeil);
    const c2 = project3D(gridSize, -gridSize, zCeil);
    const c3 = project3D(gridSize, gridSize, zCeil);
    const c4 = project3D(-gridSize, gridSize, zCeil);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = topColor;
    ctx.fillStyle = topColor + '08';
    ctx.beginPath();
    ctx.moveTo(c1.screenX, c1.screenY);
    ctx.lineTo(c2.screenX, c2.screenY);
    ctx.lineTo(c3.screenX, c3.screenY);
    ctx.lineTo(c4.screenX, c4.screenY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = topColor;
    ctx.textAlign = 'left';
    ctx.fillText(`TETO ATMOSFÉRICO [${formatCota(zCeil)}]`, c2.screenX + 6, c2.screenY);
    ctx.restore();
  }
}

// -------------------------------------------------------------
// RENDERIZAÇÃO DO VENTO DINÂMICO (VETOR PRINCIPAL + SUB-ROTAS)
// -------------------------------------------------------------
function renderWindStreamlines3D() {
  if (!appState.showWindFlow) return;

  const z = appState.cursorAltitude;
  const opac = appState.sondeOpacity ?? 0.85;
  const thick = appState.sondeThickness ?? 1.8;

  let expansionFactor = 1.0;
  if (z <= 2000) {
    expansionFactor = 0.85 + (z / 2000) * 0.35;
  } else if (z <= 5000) {
    expansionFactor = 1.2 + ((z - 2000) / 3000) * 0.8;
  } else if (z <= 12000) {
    expansionFactor = 2.0 + ((z - 5000) / 7000) * 0.9;
  } else {
    expansionFactor = 2.9 + ((z - 12000) / 4000) * 1.3;
  }

  const baseRadii = [22000, 50000, 95000, 160000, 240000, 340000, 460000];
  const tTime = appState.animTime || 0;

  ctx.save();

  baseRadii.forEach((baseR, ringIdx) => {
    const curR = baseR * expansionFactor;
    if (curR > 680000) return;

    const sampleWind = calculateWind(curR, 0, z);
    const speed = sampleWind.total;

    let rgb = '2, 132, 199'; // Azul padrão
    if (speed >= 350) rgb = '220, 38, 38';       // Vermelho (Tempestade)
    else if (speed >= 180) rgb = '194, 65, 12';  // Âmbar/Laranja (Forte)
    else if (speed <= 15) rgb = '5, 150, 105';   // Esmeralda (Calmo)

    const mainAlpha = Math.min(1, opac * 0.85);
    const subAlpha = Math.min(1, opac * 0.50);

    // 1. Grande Vetor Principal (Anel Mestre)
    ctx.strokeStyle = `rgba(${rgb}, ${mainAlpha})`;
    ctx.lineWidth = 1.4 * thick;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -tTime * Math.max(12, (speed / 10));

    const segments = 48;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const rx = Math.cos(angle) * curR;
      const ry = Math.sin(angle) * curR;
      const pt = project3D(rx, ry, z);
      if (i === 0) ctx.moveTo(pt.screenX, pt.screenY);
      else ctx.lineTo(pt.screenX, pt.screenY);
    }
    ctx.stroke();

    // 2. Sub-rotas Menores (Filetes de vento internos)
    const nextBaseR = baseRadii[ringIdx + 1] || (baseR + 110000);
    const bandWidth = (nextBaseR - baseR) * expansionFactor;
    const subLanes = 3;

    ctx.strokeStyle = `rgba(${rgb}, ${subAlpha})`;
    ctx.lineWidth = 0.9 * thick;

    for (let lane = 1; lane <= subLanes; lane++) {
      const laneR = curR + (bandWidth * (lane / (subLanes + 1)));
      if (laneR > 680000) continue;

      const laneWind = calculateWind(laneR, 0, z);
      const angularSpeed = Math.max(0.08, laneWind.total / 420);

      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -tTime * Math.max(16, (laneWind.total / 7)) * (lane % 2 === 0 ? 1.15 : 0.85);

      const streamCount = 4 + ringIdx;
      const arcSpan = (Math.PI * 2) / (streamCount * 1.7);

      ctx.beginPath();
      for (let s = 0; s < streamCount; s++) {
        const seedOffset = (s / streamCount) * Math.PI * 2 + (lane * 1.1) + (ringIdx * 0.5);
        const startAngle = seedOffset + tTime * angularSpeed * 0.25;
        const arcSteps = 8;

        for (let k = 0; k <= arcSteps; k++) {
          const frac = k / arcSteps;
          const a = startAngle + frac * arcSpan;
          const driftR = laneR + Math.sin(frac * Math.PI + seedOffset) * (bandWidth * 0.12);
          const rx = Math.cos(a) * driftR;
          const ry = Math.sin(a) * driftR;
          const pt = project3D(rx, ry, z);

          if (k === 0) ctx.moveTo(pt.screenX, pt.screenY);
          else ctx.lineTo(pt.screenX, pt.screenY);
        }
      }
      ctx.stroke();
    }
  });

  // Centro do Olho Solar na cota da Sonda
  const pEyeCenter = project3D(0, 0, z);
  const eyeRadiusMeters = 20000 * expansionFactor;
  const pEyeRim = project3D(eyeRadiusMeters, 0, z);
  const screenEyeRadius = Math.hypot(pEyeRim.screenX - pEyeCenter.screenX, pEyeRim.screenY - pEyeCenter.screenY);

  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = `rgba(2, 132, 199, ${Math.min(1, opac)})`;
  ctx.lineWidth = 1.5 * thick;
  ctx.beginPath();
  ctx.arc(pEyeCenter.screenX, pEyeCenter.screenY, Math.max(5, screenEyeRadius), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}


function renderTacticalCompass() {
  if (!compassCanvas || !compassCtx) return;
  const w = compassCanvas.width;
  const h = compassCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = 32;

  compassCtx.clearRect(0, 0, w, h);

  compassCtx.beginPath();
  compassCtx.arc(cx, cy, radius, 0, Math.PI * 2);
  compassCtx.strokeStyle = 'rgba(22, 42, 56, 0.8)';
  compassCtx.lineWidth = 3;
  compassCtx.stroke();

  compassCtx.beginPath();
  compassCtx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
  compassCtx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
  compassCtx.lineWidth = 1;
  compassCtx.stroke();

  function projectCompass(x, y, z) {
    const yaw = appState.camera.yaw;
    const pitch = appState.camera.pitch;

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const rx = x * cosYaw - y * sinYaw;
    const ry = x * sinYaw + y * cosYaw;

    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const rz = ry * sinPitch + z * cosPitch;

    return { x: cx + rx, y: cy - rz };
  }

  const axes = [
    { label: 'N', x: 0, y: 26, z: 0, color: '#00f0ff', isNorth: true },
    { label: 'S', x: 0, y: -24, z: 0, color: '#5c7e91' },
    { label: 'L', x: 24, y: 0, z: 0, color: '#00ffaa' },
    { label: 'O', x: -24, y: 0, z: 0, color: '#ffaa00' },
    { label: 'Z', x: 0, y: 0, z: 24, color: '#ff2a55' }
  ];

  axes.forEach(axis => {
    const pt = projectCompass(axis.x, axis.y, axis.z);

    compassCtx.beginPath();
    compassCtx.moveTo(cx, cy);
    compassCtx.lineTo(pt.x, pt.y);
    compassCtx.strokeStyle = axis.isNorth ? '#00f0ff' : (axis.color + '88');
    compassCtx.lineWidth = axis.isNorth ? 2.5 : 1.2;
    compassCtx.stroke();

    if (axis.isNorth) {
      compassCtx.beginPath();
      compassCtx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      compassCtx.fillStyle = '#00f0ff';
      compassCtx.fill();
    }

    compassCtx.font = axis.isNorth ? 'bold 10px Consolas, monospace' : '9px Consolas, monospace';
    compassCtx.fillStyle = axis.color;
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'middle';
    compassCtx.fillText(axis.label, pt.x, pt.y - (axis.isNorth ? 5 : 0));
  });

  compassCtx.beginPath();
  compassCtx.arc(cx, cy, 2, 0, Math.PI * 2);
  compassCtx.fillStyle = '#00f0ff';
  compassCtx.fill();
}

document.getElementById('compassBox').addEventListener('click', () => {
  appState.camera.yaw = 0;
  appState.camera.pitch = 35 * (Math.PI / 180);
  document.getElementById('statAngles').innerText = '35° / 0°';
  document.getElementById('statProjection').innerText = 'ISOMÉTRICA (3D)';
  render3DScene();
});

function render3DScene() {
  if (!canvas.width || !canvas.height) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Fundo Branco mantido conforme solicitado
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const gridSize = 500000;
  const step = 50000;

  // Grade Planar Básica
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';

  for (let gx = -gridSize; gx <= gridSize; gx += step) {
    const p1 = project3D(gx, -gridSize, 0);
    const p2 = project3D(gx, gridSize, 0);
    ctx.beginPath();
    ctx.moveTo(p1.screenX, p1.screenY);
    ctx.lineTo(p2.screenX, p2.screenY);
    ctx.stroke();

    if (gx !== 0 && gx % 100000 === 0) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.fillText(`${gx / 1000}km`, p1.screenX - 10, p1.screenY + 12);
    }
  }

  for (let gy = -gridSize; gy <= gridSize; gy += step) {
    const p1 = project3D(-gridSize, gy, 0);
    const p2 = project3D(gridSize, gy, 0);
    ctx.beginPath();
    ctx.moveTo(p1.screenX, p1.screenY);
    ctx.lineTo(p2.screenX, p2.screenY);
    ctx.stroke();

    if (gy !== 0 && gy % 100000 === 0) {
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.fillText(`${gy / 1000}km`, p1.screenX - 35, p1.screenY);
    }
  }

  // Círculos radiais de distância
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = 'rgba(2, 132, 199, 0.18)';
  for (let r = 100000; r <= gridSize; r += 100000) {
    ctx.beginPath();
    const segments = 48;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const rx = Math.cos(angle) * r;
      const ry = Math.sin(angle) * r;
      const pt = project3D(rx, ry, 0);
      if (i === 0) ctx.moveTo(pt.screenX, pt.screenY);
      else ctx.lineTo(pt.screenX, pt.screenY);
    }
    ctx.stroke();
  }
  ctx.restore();

  renderAtmosphereAndZoneImages();
  renderWindStreamlines3D();

  // Eixos Principais
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#047857';
  const xNeg = project3D(-gridSize, 0, 0);
  const xPos = project3D(gridSize, 0, 0);
  ctx.beginPath();
  ctx.moveTo(xNeg.screenX, xNeg.screenY);
  ctx.lineTo(xPos.screenX, xPos.screenY);
  ctx.stroke();

  ctx.strokeStyle = '#0369a1';
  const yNeg = project3D(0, -gridSize, 0);
  const yPos = project3D(0, gridSize, 0);
  ctx.beginPath();
  ctx.moveTo(yNeg.screenX, yNeg.screenY);
  ctx.lineTo(yPos.screenX, yPos.screenY);
  ctx.stroke();

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#92400e';
  const zBase = project3D(0, 0, 0);
  const zTop = project3D(0, 0, 16000);
  ctx.beginPath();
  ctx.moveTo(zBase.screenX, zBase.screenY);
  ctx.lineTo(zTop.screenX, zTop.screenY);
  ctx.stroke();

  for (let zTick = 2000; zTick <= 16000; zTick += 2000) {
    const tickPt = project3D(0, 0, zTick);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(tickPt.screenX - 4, tickPt.screenY - 1, 8, 2);
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = '#78350f';
    ctx.textAlign = 'left';
    ctx.fillText(`${formatCota(zTick)}`, tickPt.screenX + 8, tickPt.screenY + 3);
  }

  ctx.font = 'bold 10px Consolas, monospace';
  ctx.fillStyle = '#065f46';
  ctx.fillText('+X NASCENTE [+500 km] ▶', xPos.screenX + 6, xPos.screenY);
  ctx.fillStyle = '#075985';
  ctx.fillText('▲ +Y MERIDIANO AURORA [+500 km]', yPos.screenX + 6, yPos.screenY);
  ctx.fillStyle = '#78350f';
  ctx.fillText('▲ +Z COTA MÁXIMA (16.000m / 16 km)', zTop.screenX + 6, zTop.screenY - 6);

  const qOffset = 250000;
  drawFloorTag(qOffset, qOffset, 'QI: AURORA [NORDESTE • 500x500 km]', '#059669');
  drawFloorTag(-qOffset, qOffset, 'QII: ZÊNITE [NOROESTE • 500x500 km]', '#b45309');
  drawFloorTag(-qOffset, -qOffset, 'QIII: CREPÚSCULO [SUDOESTE • 500x500 km]', '#c2410c');
  drawFloorTag(qOffset, -qOffset, 'QIV: FENDA [SUDESTE • 500x500 km]', '#7c3aed');

  renderFlightTrajectory();
  renderWaypoints3D();
  renderMeasurementRuler();
  renderCursorReticle();
  renderTacticalCompass();
}

function drawFloorTag(x, y, text, color) {
  const p = project3D(x, y, 0);
  ctx.font = 'bold 10px Consolas, monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, p.screenX, p.screenY);
}

function renderMeasurementRuler() {
  if (!appState.ruler.active) return;

  const { pointA, pointB } = appState.ruler;
  const currentTarget = pointB || (appState.mouse.isOverCanvas ? { ...appState.mouse.groundCoords, z: appState.cursorAltitude } : null);

  if (pointA && currentTarget) {
    const p1 = project3D(pointA.x, pointA.y, pointA.z || 0);
    const p2 = project3D(currentTarget.x, currentTarget.y, currentTarget.z || 0);

    const dx = currentTarget.x - pointA.x;
    const dy = currentTarget.y - pointA.y;
    const dz = (currentTarget.z || 0) - (pointA.z || 0);
    const dist2D = Math.hypot(dx, dy);
    const dist3D = Math.hypot(dx, dy, dz);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c2410c';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(p1.screenX, p1.screenY);
    ctx.lineTo(p2.screenX, p2.screenY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = '#c2410c';
    ctx.beginPath();
    ctx.arc(p1.screenX, p1.screenY, 5, 0, Math.PI * 2);
    ctx.arc(p2.screenX, p2.screenY, 5, 0, Math.PI * 2);
    ctx.fill();

    const midX = (p1.screenX + p2.screenX) / 2;
    const midY = (p1.screenY + p2.screenY) / 2;
    const label = `RÉGUA 3D: ${formatDist(dist3D)} (ΔXY: ${formatDist(dist2D)}, ΔZ: ${dz >= 0 ? '+' : ''}${dz}m)`;

    ctx.font = 'bold 10px Consolas, monospace';
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(midX - textWidth / 2 - 6, midY - 14, textWidth + 12, 18);
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1;
    ctx.strokeRect(midX - textWidth / 2 - 6, midY - 14, textWidth + 12, 18);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, midX, midY - 1);
    ctx.restore();
  }
}

function renderCursorReticle() {
  if (!appState.mouse.isOverCanvas || appState.mouse.isDragging) return;

  const { x, y } = appState.mouse.groundCoords;
  const z = appState.cursorAltitude;
  const p3D = project3D(x, y, z);
  const pGround = project3D(x, y, 0);

  ctx.save();

  if (z > 0 && appState.showStems) {
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pGround.screenX, pGround.screenY);
    ctx.lineTo(p3D.screenX, p3D.screenY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(2, 132, 199, 0.12)';
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.45)';
    ctx.beginPath();
    ctx.ellipse(pGround.screenX, pGround.screenY, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(2, 132, 199, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);

  const crossSize = 14;
  ctx.beginPath();
  ctx.moveTo(p3D.screenX - crossSize, p3D.screenY);
  ctx.lineTo(p3D.screenX + crossSize, p3D.screenY);
  ctx.moveTo(p3D.screenX, p3D.screenY - crossSize);
  ctx.lineTo(p3D.screenX + crossSize, p3D.screenY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p3D.screenX, p3D.screenY, 7, 0, Math.PI * 2);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const wind = calculateWind(x, y, z);
  const arrowLen = Math.max(12, Math.min(36, wind.total / 14));
  const arrowAngle = wind.angle;
  const arrEndX = p3D.screenX + Math.cos(arrowAngle) * arrowLen;
  const arrEndY = p3D.screenY + Math.sin(arrowAngle) * arrowLen;

  ctx.strokeStyle = '#00ffaa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p3D.screenX, p3D.screenY);
  ctx.lineTo(arrEndX, arrEndY);
  ctx.stroke();

  

  const temp = calculateTemperature(z);
  ctx.font = 'bold 9px Consolas, monospace';
  ctx.fillStyle = '#0f172a';
  const tagCoord = `[X: ${formatCoordKm(x)}, Y: ${formatCoordKm(y)}, Z: ${formatCota(z)}]`;
  const tagWind = `💨 ${wind.total}km/h (H:${wind.h} | V:${wind.v >= 0 ? '+' : ''}${wind.v}) | 🌡️ ${formatTemp(temp)}`;
  ctx.fillText(tagCoord, p3D.screenX + 12, p3D.screenY - 14);
  ctx.fillStyle = temp <= 0 ? '#0284c7' : (temp >= 28 ? '#dc2626' : '#047857');
  ctx.fillText(tagWind, p3D.screenX + 12, p3D.screenY - 3);
	
  ctx.restore();
}

// -------------------------------------------------------------
// RENDERIZAÇÃO DA TRAJETÓRIA 3D (DIRETA + ROTA ÓTIMA EÓLICA)
// -------------------------------------------------------------
function renderFlightTrajectory() {
  const simRes = appState.sim.lastResult;
  if (!simRes) return;

  const isOptimalMode = appState.sim.routeMode === 'OPTIMAL';
  const directPts = simRes.direct.points;
  const optimalPts = simRes.optimal.points;

  ctx.save();

  // 1. Linha de referência da Rota Direta
  ctx.lineWidth = isOptimalMode ? 1.5 : 2.8;
  ctx.strokeStyle = isOptimalMode ? 'rgba(2, 132, 199, 0.4)' : '#0284c7';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  directPts.forEach((pt, idx) => {
    const p = project3D(pt.x, pt.y, pt.z);
    if (idx === 0) ctx.moveTo(p.screenX, p.screenY);
    else ctx.lineTo(p.screenX, p.screenY);
  });
  ctx.stroke();

  // 2. Rota Ótima (desenhada em um único traço contínuo super leve)
  if (isOptimalMode) {
    if (appState.showStems) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.22)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      optimalPts.forEach((pt, idx) => {
        const pg = project3D(pt.x, pt.y, 0);
        if (idx === 0) ctx.moveTo(pg.screenX, pg.screenY);
        else ctx.lineTo(pg.screenX, pg.screenY);
      });
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = simRes.optimal.avgWindEffect >= 5 ? '#059669' : (simRes.optimal.avgWindEffect <= -15 ? '#dc2626' : '#0284c7');
    ctx.beginPath();
    optimalPts.forEach((pt, idx) => {
      const p = project3D(pt.x, pt.y, pt.z);
      if (idx === 0) ctx.moveTo(p.screenX, p.screenY);
      else ctx.lineTo(p.screenX, p.screenY);
    });
    ctx.stroke();

    // Marcador animado na rota
    const tProgress = ((appState.animTime || 0) * 0.22) % 1;
    const floatIdx = tProgress * (optimalPts.length - 1);
    const idx0 = Math.floor(floatIdx);
    const idx1 = Math.min(optimalPts.length - 1, idx0 + 1);
    const frac = floatIdx - idx0;

    const curX = optimalPts[idx0].x + (optimalPts[idx1].x - optimalPts[idx0].x) * frac;
    const curY = optimalPts[idx0].y + (optimalPts[idx1].y - optimalPts[idx0].y) * frac;
    const curZ = optimalPts[idx0].z + (optimalPts[idx1].z - optimalPts[idx0].z) * frac;
    const pDrone = project3D(curX, curY, curZ);

    ctx.fillStyle = '#059669';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pDrone.screenX, pDrone.screenY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const midPt = optimalPts[Math.floor(optimalPts.length / 2)];
    const pMid = project3D(midPt.x, midPt.y, midPt.z);
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = '#065f46';
    ctx.textAlign = 'center';
    ctx.fillText(`⚡ ROTA ÓTIMA [${formatETA(simRes.optimal.totalTimeHours)}]`, pMid.screenX, pMid.screenY - 10);
  } else {
    const midPt = directPts[Math.floor(directPts.length / 2)];
    const pMid = project3D(midPt.x, midPt.y, midPt.z);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(pMid.screenX - 3.5, pMid.screenY - 3.5, 7, 7);
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`📏 ROTA DIRETA [${formatETA(simRes.direct.totalTimeHours)}]`, pMid.screenX, pMid.screenY - 10);
  }

  ctx.restore();
}

function renderWaypoints3D() {
  const sorted = [...appState.waypoints].sort((a, b) => {
    return project3D(b.x, b.y, b.z).depth - project3D(a.x, a.y, a.z).depth;
  });

  sorted.forEach(wp => {
    const layer = getAltitudeLayer(wp.z);

    if (appState.filterLayer !== 'ALL' && layer.id !== appState.filterLayer) return;
    if (appState.filterCategory !== 'ALL' && wp.category !== appState.filterCategory) return;
    if (appState.searchQuery && !wp.name.toLowerCase().includes(appState.searchQuery.toLowerCase())) return;
	
    const pos3D = project3D(wp.x, wp.y, wp.z);
    const ground3D = project3D(wp.x, wp.y, 0);
    const isSelected = (wp.id === appState.selectedWaypointId);
    const wpColor = wp.color || layer.mapColor || layer.color;
    const iconToUse = wp.customIcon || WP_CATEGORIES[wp.category || 'POI']?.icon || '📍';

    if (appState.showStems) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = isSelected ? '#0284c7' : 'rgba(51, 65, 85, 0.45)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pos3D.screenX, pos3D.screenY);
      ctx.lineTo(ground3D.screenX, ground3D.screenY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.strokeStyle = wpColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(ground3D.screenX, ground3D.screenY, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? '#0f172a' : wpColor;
    ctx.fillStyle = isSelected ? '#0284c7' : wpColor;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pos3D.screenX, pos3D.screenY, 12, 0, Math.PI * 2);
      ctx.strokeStyle = wpColor;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    const s = isSelected ? 6.5 : 5;
    ctx.beginPath();
    ctx.moveTo(pos3D.screenX, pos3D.screenY - s);
    ctx.lineTo(pos3D.screenX + s, pos3D.screenY);
    ctx.lineTo(pos3D.screenX, pos3D.screenY + s);
    ctx.lineTo(pos3D.screenX - s, pos3D.screenY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(iconToUse, pos3D.screenX, pos3D.screenY - 14);

    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(wp.name, pos3D.screenX + 12, pos3D.screenY - 2);

    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = wpColor;
    ctx.fillText(`${formatCota(wp.z)} [${formatCoordKm(wp.x)}, ${formatCoordKm(wp.y)}]`, pos3D.screenX + 12, pos3D.screenY + 9);
    ctx.restore();
  });
}

function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  render3DScene();
}

function resizeProfileCanvas() {
  if (!profileCanvas || !profileContainer) return;
  const rect = profileContainer.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    profileCanvas.width = rect.width;
    profileCanvas.height = rect.height;
    renderProfileCanvas();
  }
}

function renderProfileCanvas() {
  if (!profileCanvas || !profileCtx) return;
  const w = profileCanvas.width;
  const h = profileCanvas.height;
  if (!w || !h) return;

  profileCtx.clearRect(0, 0, w, h);
  profileCtx.fillStyle = '#070d13';
  profileCtx.fillRect(0, 0, w, h);

  const selA = document.getElementById('selPointA').value;
  const selB = document.getElementById('selPointB').value;
  const wpA = appState.waypoints.find(w => w.id === selA);
  const wpB = appState.waypoints.find(w => w.id === selB);

  const padLeft = 85;
  const padRight = 45;
  const padTop = 15;
  const padBottom = 26;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  if (plotW <= 0 || plotH <= 0) return;

  const maxAlt = 16000;
  function altToY(z) {
    const clampedZ = Math.max(0, Math.min(maxAlt, z));
    return padTop + plotH * (1 - clampedZ / maxAlt);
  }

  ATMOSPHERE_LAYERS.forEach(layer => {
    const yTop = altToY(layer.max);
    const yBot = altToY(layer.min);
    const bandHeight = yBot - yTop;

    profileCtx.fillStyle = (layer.color || '#00f0ff') + '15';
    profileCtx.fillRect(padLeft, yTop, plotW, bandHeight);

    profileCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    profileCtx.lineWidth = 1;
    profileCtx.beginPath();
    profileCtx.moveTo(padLeft, yTop);
    profileCtx.lineTo(padLeft + plotW, yTop);
    profileCtx.stroke();

    profileCtx.font = 'bold 8px Consolas, monospace';
    profileCtx.fillStyle = (layer.color || '#fff') + 'cc';
    profileCtx.textAlign = 'right';
    profileCtx.fillText(`${layer.name.toUpperCase()} (${layer.tempRange})`, padLeft + plotW - 8, yTop + 12);
  });

  const tickSteps = [0, 2000, 5000, 10000, 12000, 16000];
  tickSteps.forEach(cota => {
    const y = altToY(cota);
    profileCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    profileCtx.beginPath();
    profileCtx.moveTo(padLeft - 4, y);
    profileCtx.lineTo(padLeft, y);
    profileCtx.stroke();

    profileCtx.font = '9px Consolas, monospace';
    profileCtx.fillStyle = '#7a9eb3';
    profileCtx.textAlign = 'right';
    profileCtx.fillText(`${(cota / 1000).toFixed(0)}k m`, padLeft - 6, y + 3);
  });

  const simRes = appState.sim.lastResult;
  if (!wpA || !wpB || wpA.id === wpB.id || !simRes) {
    profileCtx.font = '11px Consolas, monospace';
    profileCtx.fillStyle = '#5c7e91';
    profileCtx.textAlign = 'center';
    profileCtx.fillText('SELECIONE DOIS WAYPOINTS DISTINTOS NA BARRA LATERAL PARA VER O PERFIL DE ELEVAÇÃO', padLeft + plotW / 2, padTop + plotH / 2);
    document.getElementById('profileSubtitle').innerText = 'SELECIONE PONTOS DISTINTOS';
    return;
  }

  const activeRoute = appState.sim.routeMode === 'OPTIMAL' ? simRes.optimal : simRes.direct;
  const dx = wpB.x - wpA.x;
  const dy = wpB.y - wpA.y;
  const dz = wpB.z - wpA.z;
  const dist2D = Math.hypot(dx, dy);

  document.getElementById('profileSubtitle').innerText = `[${wpA.name}] ➔ [${wpB.name}] | ETA: ${formatETA(activeRoute.totalTimeHours)} | V.SOLO: ${Math.round(activeRoute.avgGroundSpeed)} km/h`;

  const x1 = padLeft;
  const y1 = altToY(wpA.z);
  const x2 = padLeft + plotW;
  const y2 = altToY(wpB.z);

  // Linha direta tracejada de fundo
  profileCtx.save();
  profileCtx.setLineDash([4, 4]);
  profileCtx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
  profileCtx.lineWidth = 1.5;
  profileCtx.beginPath();
  profileCtx.moveTo(x1, y1);
  profileCtx.lineTo(x2, y2);
  profileCtx.stroke();
  profileCtx.restore();

  // Curva da rota ativa (Ótima ou Direta)
  const routePts = activeRoute.points;
  const grad = profileCtx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, 'rgba(0, 255, 170, 0.28)');
  grad.addColorStop(1, 'rgba(0, 240, 255, 0.02)');

  profileCtx.fillStyle = grad;
  profileCtx.beginPath();
  profileCtx.moveTo(x1, padTop + plotH);
  routePts.forEach((pt, idx) => {
    const px = padLeft + (idx / (routePts.length - 1)) * plotW;
    const py = altToY(pt.z);
    profileCtx.lineTo(px, py);
  });
  profileCtx.lineTo(x2, padTop + plotH);
  profileCtx.closePath();
  profileCtx.fill();

  profileCtx.strokeStyle = appState.sim.routeMode === 'OPTIMAL' ? '#00ffaa' : '#00f0ff';
  profileCtx.lineWidth = 2.5;
  profileCtx.beginPath();
  routePts.forEach((pt, idx) => {
    const px = padLeft + (idx / (routePts.length - 1)) * plotW;
    const py = altToY(pt.z);
    if (idx === 0) profileCtx.moveTo(px, py);
    else profileCtx.lineTo(px, py);
  });
  profileCtx.stroke();

  function drawNode(x, y, name, z, color, align) {
    profileCtx.fillStyle = color || '#00f0ff';
    profileCtx.beginPath();
    profileCtx.arc(x, y, 5, 0, Math.PI * 2);
    profileCtx.fill();

    profileCtx.strokeStyle = '#ffffff';
    profileCtx.lineWidth = 1.5;
    profileCtx.stroke();

    profileCtx.font = 'bold 9px Consolas, monospace';
    profileCtx.fillStyle = '#ffffff';
    profileCtx.textAlign = align;
    const xOff = align === 'left' ? 8 : -8;
    profileCtx.fillText(`${name} (${formatCota(z)})`, x + xOff, y - 6);
  }

  drawNode(x1, y1, wpA.name, wpA.z, wpA.color, 'left');
  drawNode(x2, y2, wpB.name, wpB.z, wpB.color, 'right');

  const numSteps = 5;
  for (let i = 0; i <= numSteps; i++) {
    const curDist = (activeRoute.totalDistMeters * i) / numSteps;
    const curX = padLeft + (plotW * i) / numSteps;

    profileCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    profileCtx.beginPath();
    profileCtx.moveTo(curX, padTop + plotH);
    profileCtx.lineTo(curX, padTop + plotH + 4);
    profileCtx.stroke();

    profileCtx.font = '9px Consolas, monospace';
    profileCtx.fillStyle = '#7a9eb3';
    profileCtx.textAlign = 'center';
    profileCtx.fillText(`${(curDist / 1000).toFixed(0)} km`, curX, padTop + plotH + 16);
  }

  if (appState.profile.hoverRatio !== null) {
    const r = appState.profile.hoverRatio;
    const curX = padLeft + plotW * r;
    const segIdx = Math.min(activeRoute.segmentData.length - 1, Math.floor(r * activeRoute.segmentData.length));
    const seg = activeRoute.segmentData[segIdx];
    const curZ = seg ? seg.midZ : (wpA.z + dz * r);
    const curY = altToY(curZ);
    const curD = activeRoute.totalDistMeters * r;

    profileCtx.setLineDash([3, 3]);
    profileCtx.strokeStyle = '#ffaa00';
    profileCtx.lineWidth = 1;
    profileCtx.beginPath();
    profileCtx.moveTo(curX, padTop);
    profileCtx.lineTo(curX, padTop + plotH);
    profileCtx.stroke();
    profileCtx.setLineDash([]);

    profileCtx.fillStyle = '#ffaa00';
    profileCtx.beginPath();
    profileCtx.arc(curX, curY, 4, 0, Math.PI * 2);
    profileCtx.fill();

    const windSign = seg && seg.netWindEffect >= 0 ? '+' : '';
    const windInfo = seg ? ` | Vento Efetivo: ${windSign}${Math.round(seg.netWindEffect)}km/h | V.Solo: ${Math.round(seg.groundSpeed)}km/h` : '';
    const hoverTag = `${(curD / 1000).toFixed(1)} km | Cota: ${formatCota(curZ)}${windInfo}`;
    profileCtx.font = 'bold 9px Consolas, monospace';
    profileCtx.fillStyle = '#ffaa00';
    profileCtx.textAlign = r > 0.65 ? 'right' : (r < 0.35 ? 'left' : 'center');
    profileCtx.fillText(hoverTag, curX, Math.max(padTop + 12, curY - 9));
  }
}

window.addEventListener('resize', () => {
  resizeCanvas();
  resizeProfileCanvas();
});

profileCanvas.addEventListener('mousemove', (e) => {
  const rect = profileCanvas.getBoundingClientRect();
  const padLeft = 85;
  const padRight = 45;
  const plotW = profileCanvas.width - padLeft - padRight;
  if (plotW <= 0) return;

  const mouseX = e.clientX - rect.left;
  if (mouseX >= padLeft && mouseX <= padLeft + plotW) {
    appState.profile.hoverRatio = (mouseX - padLeft) / plotW;
  } else {
    appState.profile.hoverRatio = null;
  }
  renderProfileCanvas();
});

profileCanvas.addEventListener('mouseleave', () => {
  appState.profile.hoverRatio = null;
  renderProfileCanvas();
});

function toggleProfileDrawer(forceOpen = null) {
  const newState = forceOpen !== null ? forceOpen : !appState.profile.isExpanded;
  appState.profile.isExpanded = newState;

  profileDrawer.classList.toggle('collapsed', !appState.profile.isExpanded);
  document.getElementById('btnCollapseProfile').innerText = appState.profile.isExpanded ? '▼ MINIMIZAR' : '▲ EXPANDIR';
  document.getElementById('btnToggleProfile').classList.toggle('active', appState.profile.isExpanded);

  if (appState.profile.isExpanded) {
    telemBar.style.bottom = '214px';
  } else {
    telemBar.style.bottom = '44px';
  }

  setTimeout(resizeProfileCanvas, 260);
}

document.getElementById('btnCollapseProfile').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleProfileDrawer();
});

document.getElementById('profileHeader').addEventListener('click', () => {
  toggleProfileDrawer();
});

document.getElementById('btnToggleProfile').addEventListener('click', () => {
  toggleProfileDrawer();
});

canvas.addEventListener('mousedown', (e) => {
  appState.mouse.isDragging = true;
  appState.mouse.isPanning = (e.button === 2 || e.shiftKey);
  appState.mouse.lastX = e.clientX;
  appState.mouse.lastY = e.clientY;
});

window.addEventListener('mouseup', () => {
  appState.mouse.isDragging = false;
  appState.mouse.isPanning = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mouseenter', () => {
  appState.mouse.isOverCanvas = true;
});

canvas.addEventListener('mouseleave', () => {
  appState.mouse.isOverCanvas = false;
  if (appState.selectedWaypointId) {
    selectWaypoint(appState.selectedWaypointId);
  }
  render3DScene();
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseInside = (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );
  appState.mouse.isOverCanvas = mouseInside;

  if (appState.mouse.isDragging) {
    const dx = e.clientX - appState.mouse.lastX;
    const dy = e.clientY - appState.mouse.lastY;
    appState.mouse.lastX = e.clientX;
    appState.mouse.lastY = e.clientY;

    if (appState.mouse.isPanning) {
      appState.camera.panX += dx;
      appState.camera.panY += dy;
    } else {
      appState.camera.yaw += dx * 0.007;
      appState.camera.pitch += dy * 0.007;
      appState.camera.pitch = Math.max(0.0, Math.min(Math.PI / 2, appState.camera.pitch));

      const degYaw = Math.round(appState.camera.yaw * (180 / Math.PI)) % 360;
      const degPitch = Math.round(appState.camera.pitch * (180 / Math.PI));
      document.getElementById('statAngles').innerText = `${degPitch}° / ${degYaw}°`;
      document.getElementById('statProjection').innerText = degPitch === 0 ? 'PERFIL VERTICAL (EIXO Z)' : (degPitch >= 89 ? 'PLANAR CENITAL (2D)' : 'ISOMÉTRICA (3D)');
    }
    if (!appState.showWindFlow && !appState.sim.lastResult) render3DScene();
  } else if (mouseInside) {
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    appState.mouse.canvasX = canvasX;
    appState.mouse.canvasY = canvasY;

    const ground = unprojectScreenToGround(canvasX, canvasY, appState.cursorAltitude);
    appState.mouse.groundCoords = ground;

    updateLiveHoverTelemetry(ground.x, ground.y, appState.cursorAltitude);
    if (!appState.showWindFlow && !appState.sim.lastResult) render3DScene();
  }
});

function updateLiveHoverTelemetry(x, y, z) {
  const telemLabel = document.getElementById('telemLabelMode');
  if (telemLabel) telemLabel.innerText = 'RASTREAMENTO EM TEMPO REAL:';

  const quad = getQuadrantInfo(x, y);
  const layer = getAltitudeLayer(z);
  const wind = calculateWind(x, y, z);

  const kmX = (x / 1000).toFixed(1).replace('.', ',');
  const kmY = (y / 1000).toFixed(1).replace('.', ',');
  const temp = calculateTemperature(z);	
  document.getElementById('telemCoords').innerText = `X: ${x >= 0 ? '+' : ''}${kmX}km (${x.toLocaleString('pt-BR')}m) | Y: ${y >= 0 ? '+' : ''}${kmY}km (${y.toLocaleString('pt-BR')}m) | Z: ${formatCota(z)}`;
  document.getElementById('telemLayer').innerText = `${layer.name.toUpperCase()} (${formatCota(z)} | 🌡️ ${formatTemp(temp)})`;
  document.getElementById('telemQuadrant').innerText = `${quad.name.toUpperCase()} (${quad.cardinal})`;

  const windText = `${wind.total} km/h (Horizontal: ${wind.h} km/h | Vertical: ${wind.v >= 0 ? '+' : ''}${wind.v} km/h)`;
  document.getElementById('telemWind').innerText = windText;
  document.getElementById('statWindHead').innerText = `${wind.total} km/h`;

  document.getElementById('telemVector').innerText = `VETOR NÁUTICO: [${quad.code} - ${quad.name.replace(/Quadrante [IV]+ - /, '')}] + [${layer.name}] + Cota [${formatCota(z)}] + Vento [${wind.total}km/h]`;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) {
    const deltaZ = e.deltaY < 0 ? 250 : -250;
    setCursorAltitude(appState.cursorAltitude + deltaZ);
  } else {
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    appState.camera.zoom = Math.max(0.0001, Math.min(0.005, appState.camera.zoom * zoomFactor));
    render3DScene();
  }
}, { passive: false });

canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const ground = unprojectScreenToGround(clickX, clickY, appState.cursorAltitude);
  openModal(null, ground.x, ground.y, appState.cursorAltitude);
});

canvas.addEventListener('click', (e) => {
  if (appState.mouse.isPanning) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  if (appState.ruler.active) {
    const ground = unprojectScreenToGround(clickX, clickY, appState.cursorAltitude);
    if (!appState.ruler.pointA) {
      appState.ruler.pointA = { x: ground.x, y: ground.y, z: appState.cursorAltitude };
    } else if (!appState.ruler.pointB) {
      appState.ruler.pointB = { x: ground.x, y: ground.y, z: appState.cursorAltitude };
    } else {
      appState.ruler.pointA = { x: ground.x, y: ground.y, z: appState.cursorAltitude };
      appState.ruler.pointB = null;
    }
    render3DScene();
    return;
  }

  let clickedWp = null;
  let closestDist = 18;

  appState.waypoints.forEach(wp => {
    if (appState.filterCategory !== 'ALL' && wp.category !== appState.filterCategory) return;
    if (appState.filterLayer !== 'ALL' && getAltitudeLayer(wp.z).id !== appState.filterLayer) return;

    const p = project3D(wp.x, wp.y, wp.z);
    const d = Math.hypot(p.screenX - clickX, p.screenY - clickY);
    if (d < closestDist) {
      closestDist = d;
      clickedWp = wp;
    }
  });

  if (clickedWp) {
    selectWaypoint(clickedWp.id);
  }
});

function selectWaypoint(id) {
  appState.selectedWaypointId = id;
  const wp = appState.waypoints.find(w => w.id === id);
  if (!wp) return;

  const telemLabel = document.getElementById('telemLabelMode');
  if (telemLabel) telemLabel.innerText = 'INSPEÇÃO DE COORDENADA:';

  const quad = getQuadrantInfo(wp.x, wp.y);
  const layer = getAltitudeLayer(wp.z);
  const wind = calculateWind(wp.x, wp.y, wp.z);

  const kmX = (wp.x / 1000).toFixed(1).replace('.', ',');
  const kmY = (wp.y / 1000).toFixed(1).replace('.', ',');
  const temp = calculateTemperature(wp.z);
  document.getElementById('telemCoords').innerText = `X: ${wp.x >= 0 ? '+' : ''}${kmX}km (${wp.x.toLocaleString('pt-BR')}m) | Y: ${wp.y >= 0 ? '+' : ''}${kmY}km (${wp.y.toLocaleString('pt-BR')}m) | Z: ${formatCota(wp.z)}`;
  document.getElementById('telemLayer').innerText = `${layer.name.toUpperCase()} (${formatCota(wp.z)} | 🌡️ ${formatTemp(temp)})`;
  document.getElementById('telemQuadrant').innerText = `${quad.name.toUpperCase()} (${quad.cardinal})`;

  const windText = `${wind.total} km/h (Horizontal: ${wind.h} km/h | Vertical: ${wind.v >= 0 ? '+' : ''}${wind.v} km/h)`;
  document.getElementById('telemWind').innerText = windText;
  document.getElementById('statWindHead').innerText = `${wind.total} km/h`;

  document.getElementById('telemVector').innerText = `VETOR NÁUTICO: ${buildVectorString(wp.x, wp.y, wp.z)} + Vento [${wind.total}km/h]`;

  renderWaypointCards();
  updateVectorDistance();
  render3DScene();
}

function updateVectorDistance() {
  const idA = document.getElementById('selPointA').value;
  const idB = document.getElementById('selPointB').value;
  const airspeed = Math.max(20, parseFloat(document.getElementById('inputAirspeed').value) || 180);
  const routeMode = document.getElementById('selRouteMode').value;

  appState.sim.airspeed = airspeed;
  appState.sim.routeMode = routeMode;

  const wpA = appState.waypoints.find(w => w.id === idA);
  const wpB = appState.waypoints.find(w => w.id === idB);

  if (!wpA || !wpB || wpA.id === wpB.id) {
    appState.sim.lastResult = null;
    document.getElementById('calcDist3D').innerText = '0 m';
    document.getElementById('calcDist2DAndZ').innerText = '0 km / 0 m';
    document.getElementById('calcPitchAngle').innerText = '0.0°';
    document.getElementById('calcWindEffect').innerText = '0 km/h';
    document.getElementById('calcGroundSpeed').innerText = '0 km/h';
    document.getElementById('calcETA').innerText = '--';
    document.getElementById('calcOptimalGain').innerText = '--';
    render3DScene();
    renderProfileCanvas();
    return;
  }

  const dx = wpB.x - wpA.x;
  const dy = wpB.y - wpA.y;
  const dz = wpB.z - wpA.z;
  const dist2D = Math.sqrt(dx * dx + dy * dy);
  const pitchRad = Math.atan2(dz, dist2D);
  const pitchDeg = pitchRad * (180 / Math.PI);

  const simResult = computeFlightSimulation(wpA, wpB, airspeed);
  appState.sim.lastResult = simResult;

  const activeMetrics = routeMode === 'OPTIMAL' ? simResult.optimal : simResult.direct;

  document.getElementById('calcDist3D').innerText = formatDist(activeMetrics.totalDistMeters);
  document.getElementById('calcDist2DAndZ').innerText = `${(dist2D / 1000).toFixed(1)} km | ΔZ: ${dz >= 0 ? '+' : ''}${dz}m`;
  document.getElementById('calcPitchAngle').innerText = `${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(2)}°`;

  // Efeito do vento
  const windEff = Math.round(activeMetrics.avgWindEffect);
  const windEl = document.getElementById('calcWindEffect');
  if (windEff >= 5) {
    windEl.innerText = `+${windEff} km/h (CAUDA FAVORÁVEL)`;
    windEl.style.color = 'var(--accent-emerald)';
  } else if (windEff <= -5) {
    windEl.innerText = `${windEff} km/h (PROA / CONTRA)`;
    windEl.style.color = 'var(--accent-rose)';
  } else {
    windEl.innerText = `${windEff >= 0 ? '+' : ''}${windEff} km/h (NEUTRO / TRAVÉS)`;
    windEl.style.color = 'var(--accent-amber)';
  }

  document.getElementById('calcGroundSpeed').innerText = `${Math.round(activeMetrics.avgGroundSpeed)} km/h`;
  document.getElementById('calcETA').innerText = formatETA(activeMetrics.totalTimeHours);

  // Comparativo de economia entre Rota Ótima e Rota Direta
  const savedMinutes = Math.round((simResult.direct.totalTimeHours - simResult.optimal.totalTimeHours) * 60);
  const gainEl = document.getElementById('calcOptimalGain');
  if (savedMinutes > 1) {
    gainEl.innerText = `-${savedMinutes} min vs. Rota Direta`;
    gainEl.style.color = 'var(--accent-emerald)';
  } else {
    gainEl.innerText = 'Rota Direta já é a ideal';
    gainEl.style.color = 'var(--text-muted)';
  }

  // Status de Diagnóstico
  const statusEl = document.getElementById('calcFlightStatus');
  if (activeMetrics.stalledSegments > 0) {
    statusEl.innerText = '⚠️ PROA CRÍTICA / DERIVA SEVERA';
    statusEl.style.background = 'rgba(255, 42, 85, 0.2)';
    statusEl.style.color = 'var(--accent-rose)';
  } else if (activeMetrics.maxTurbulence > 300) {
    statusEl.innerText = `⚡ TURBULÊNCIA (${activeMetrics.maxTurbulence} km/h)`;
    statusEl.style.background = 'rgba(255, 170, 0, 0.2)';
    statusEl.style.color = 'var(--accent-amber)';
  } else if (windEff >= 10) {
    statusEl.innerText = '💨 CORRENTE DE CAUDA ÓTIMA';
    statusEl.style.background = 'rgba(0, 255, 170, 0.18)';
    statusEl.style.color = 'var(--accent-emerald)';
  } else {
    statusEl.innerText = '✓ CRUZEIRO ESTÁVEL';
    statusEl.style.background = 'rgba(0, 240, 255, 0.15)';
    statusEl.style.color = 'var(--accent-cyan)';
  }

  render3DScene();
  renderProfileCanvas();
}

function populateSelectDropdowns() {
  const selA = document.getElementById('selPointA');
  const selB = document.getElementById('selPointB');

  const prevA = selA.value;
  const prevB = selB.value;

  const optionsHtml = appState.waypoints.map(wp => `<option value="${wp.id}">${wp.name}</option>`).join('');

  selA.innerHTML = optionsHtml;
  selB.innerHTML = optionsHtml;

  selA.value = prevA || appState.waypoints[0]?.id || '';
  selB.value = prevB || appState.waypoints[1]?.id || '';

  updateVectorDistance();
}

document.getElementById('selPointA').addEventListener('change', updateVectorDistance);
document.getElementById('selPointB').addEventListener('change', updateVectorDistance);
document.getElementById('inputAirspeed').addEventListener('input', updateVectorDistance);
document.getElementById('selRouteMode').addEventListener('change', updateVectorDistance);

window.setCursorAltitude = function(val) {
  const clamped = Math.max(0, Math.min(16000, Math.round(val)));
  appState.cursorAltitude = clamped;
  document.getElementById('inputCursorZ').value = clamped;
  document.getElementById('labelCursorZ').innerText = formatCota(clamped);
  document.getElementById('statCursorZ').innerText = formatCota(clamped);

  const ground = appState.mouse.groundCoords;
  updateLiveHoverTelemetry(ground.x, ground.y, clamped);
  render3DScene();
};

document.getElementById('inputCursorZ').addEventListener('input', (e) => {
  setCursorAltitude(e.target.value);
});

document.getElementById('inputSondeOpacity')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  appState.sondeOpacity = val;
  document.getElementById('labelSondeOpacity').innerText = `${Math.round(val * 100)}%`;
  render3DScene();
});

document.getElementById('inputSondeThickness')?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  appState.sondeThickness = val;
  document.getElementById('labelSondeThickness').innerText = `${val.toFixed(1)}x`;
  render3DScene();
});

window.setZScale = function(val) {
  const numVal = parseFloat(val);
  appState.camera.heightScale = numVal;
  document.getElementById('inputZScale').value = numVal;
  document.getElementById('labelZScale').innerText = `${numVal.toFixed(1)}x`;
  render3DScene();
};

document.getElementById('inputZScale').addEventListener('input', (e) => {
  setZScale(e.target.value);
});

document.getElementById('selCategoryFilter').addEventListener('change', (e) => {
  appState.filterCategory = e.target.value;
  renderWaypointCards();
  render3DScene();
});

document.getElementById('btnViewIso').addEventListener('click', () => {
  appState.camera.yaw = 45 * (Math.PI / 180);
  appState.camera.pitch = 35 * (Math.PI / 180);
  appState.camera.panX = 0;
  appState.camera.panY = 30;
  document.getElementById('statProjection').innerText = 'ISOMÉTRICA (3D)';
  document.getElementById('statAngles').innerText = '35° / 45°';
  render3DScene();
});

document.getElementById('btnViewTop').addEventListener('click', () => {
  appState.camera.yaw = 0;
  appState.camera.pitch = 89.9 * (Math.PI / 180);
  appState.camera.panX = 0;
  appState.camera.panY = 0;
  document.getElementById('statProjection').innerText = 'PLANAR CENITAL (2D)';
  document.getElementById('statAngles').innerText = '90° / 0°';
  render3DScene();
});

document.getElementById('btnViewSide').addEventListener('click', () => {
  appState.camera.yaw = 0;
  appState.camera.pitch = 0.0;
  appState.camera.panX = 0;
  appState.camera.panY = 130;
  document.getElementById('statProjection').innerText = 'PERFIL VERTICAL (EIXO Z)';
  document.getElementById('statAngles').innerText = '0° / 0°';
  render3DScene();
});

const btnToggleRuler = document.getElementById('btnToggleRuler');
btnToggleRuler.addEventListener('click', () => {
  appState.ruler.active = !appState.ruler.active;
  btnToggleRuler.classList.toggle('active', appState.ruler.active);
  if (!appState.ruler.active) {
    appState.ruler.pointA = null;
    appState.ruler.pointB = null;
  }
  render3DScene();
});

const btnToggleWind = document.getElementById('btnToggleWind');
btnToggleWind.addEventListener('click', () => {
  appState.showWindFlow = !appState.showWindFlow;
  btnToggleWind.classList.toggle('active', appState.showWindFlow);
  render3DScene();
});

document.getElementById('btnResetCamera').addEventListener('click', () => {
  appState.camera.panX = 0;
  appState.camera.panY = 30;
  appState.camera.zoom = 0.00075;
  render3DScene();
});

document.getElementById('btnToggleLayers').addEventListener('click', (e) => {
  appState.showLayerPlanes = !appState.showLayerPlanes;
  e.currentTarget.classList.toggle('active', appState.showLayerPlanes);
  render3DScene();
});

document.getElementById('btnToggleStems').addEventListener('click', (e) => {
  appState.showStems = !appState.showStems;
  e.currentTarget.classList.toggle('active', appState.showStems);
  render3DScene();
});

document.querySelectorAll('.layer-toggle-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.layer-toggle-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    appState.filterLayer = e.target.getAttribute('data-layer');
    document.getElementById('activeLayerLabel').innerText = e.target.innerText;
    
    renderWaypointCards();
    render3DScene();
  });
});

// -------------------------------------------------------------
// GERENCIADOR DE IMAGENS PNG 1000x1000 POR ZONA
// -------------------------------------------------------------
const zoneImagesContainer = document.getElementById('zoneImagesContainer');

function renderZoneImageControls() {
  zoneImagesContainer.innerHTML = '';
  let loadedCount = 0;

  ATMOSPHERE_LAYERS.forEach(layer => {
    const data = appState.zoneImages[layer.id];
    const hasImage = !!data.img;
    if (hasImage) loadedCount++;

    const card = document.createElement('div');
    card.className = 'zone-img-card';
    card.style.borderLeftColor = layer.color;

    card.innerHTML = `
      <div class="zone-img-head">
      <span style="color:${layer.color}">${layer.name.toUpperCase()}</span>
      <span style="font-size:9px; color:var(--accent-amber)">🌡️ ${layer.tempRange} (${layer.label})</span>
    </div>
      <div class="zone-img-meta">
        <span>${hasImage ? `✓ ${data.name || 'PNG 1000x1000'}` : 'Padrão (Sem imagem)'}</span>
        <span>Opacidade: <b>${Math.round(data.opacity * 100)}%</b></span>
      </div>
      <div class="zone-img-ctrls">
        <input type="range" class="hud-slider" min="0.05" max="1" step="0.05" value="${data.opacity}" id="opac_${layer.id}" title="Opacidade da imagem">
        <button class="btn-mini" id="btnUpload_${layer.id}">+ PNG</button>
        ${hasImage ? `<button class="btn-mini danger" id="btnClear_${layer.id}" style="flex:0.6">✕</button>` : ''}
        <input type="file" id="file_${layer.id}" accept="image/png, image/*" style="display:none">
      </div>
    `;

    const fileInput = card.querySelector(`#file_${layer.id}`);
    const btnUpload = card.querySelector(`#btnUpload_${layer.id}`);
    const opacSlider = card.querySelector(`#opac_${layer.id}`);
    const btnClear = card.querySelector(`#btnClear_${layer.id}`);

    btnUpload.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const image = new Image();
        image.onload = () => {
          appState.zoneImages[layer.id].img = image;
          appState.zoneImages[layer.id].name = file.name;
          renderZoneImageControls();
          render3DScene();
        };
        image.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });

    opacSlider.addEventListener('input', (e) => {
      appState.zoneImages[layer.id].opacity = parseFloat(e.target.value);
      card.querySelector('.zone-img-meta b').innerText = `${Math.round(e.target.value * 100)}%`;
      render3DScene();
    });

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        appState.zoneImages[layer.id].img = null;
        appState.zoneImages[layer.id].name = '';
        renderZoneImageControls();
        render3DScene();
      });
    }

    zoneImagesContainer.appendChild(card);
  });

  document.getElementById('zoneImgCounter').innerText = loadedCount > 0 ? `${loadedCount} CARREGADOS` : 'PADRÃO (ORIGINAL)';
}

// -------------------------------------------------------------
// LISTAGEM DE WAYPOINTS + DROPMENU AGRUPADO
// -------------------------------------------------------------
const wpListContainer = document.getElementById('wpListContainer');
const selQuickWaypoint = document.getElementById('selQuickWaypoint');
const inputSearchWp = document.getElementById('inputSearchWp');
const btnToggleWpViewMode = document.getElementById('btnToggleWpViewMode');

if (inputSearchWp) {
  inputSearchWp.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value.trim();
    renderWaypointCards();
    render3DScene();
  });
}

if (selQuickWaypoint) {
  selQuickWaypoint.addEventListener('change', (e) => {
    if (e.target.value) {
      selectWaypoint(e.target.value);
    }
  });
}

if (btnToggleWpViewMode) {
  btnToggleWpViewMode.addEventListener('click', () => {
    appState.wpCompactMode = !appState.wpCompactMode;
    btnToggleWpViewMode.innerText = appState.wpCompactMode ? 'MODO: COMPACTO' : 'MODO: LISTA';
    renderWaypointCards();
  });
}

function renderWaypointCards() {
  wpListContainer.innerHTML = '';

  // 1. Filtra os waypoints conforme Camada, Categoria e Busca por Texto
  const filteredWps = appState.waypoints.filter(wp => {
    const layer = getAltitudeLayer(wp.z);
    if (appState.filterLayer !== 'ALL' && layer.id !== appState.filterLayer) return false;
    if (appState.filterCategory !== 'ALL' && wp.category !== appState.filterCategory) return false;
    if (appState.searchQuery && !wp.name.toLowerCase().includes(appState.searchQuery.toLowerCase())) return false;
    return true;
  });

  document.getElementById('wpCounter').innerText = `${filteredWps.length} PONTOS VISÍVEIS`;

  // 2. Popula o Dropmenu Agrupado por Zona Atmosférica (<optgroup>)
  if (selQuickWaypoint) {
    selQuickWaypoint.innerHTML = '';
    if (filteredWps.length === 0) {
      selQuickWaypoint.innerHTML = '<option value="">-- Nenhum ponto encontrado --</option>';
    } else {
      ATMOSPHERE_LAYERS.forEach(layer => {
        const groupWps = filteredWps
          .filter(wp => getAltitudeLayer(wp.z).id === layer.id)
          .sort((a, b) => b.z - a.z);

        if (groupWps.length > 0) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = `── ${layer.name.toUpperCase()} (${layer.tempRange}) ──`;

          groupWps.forEach(wp => {
            const wpCat = WP_CATEGORIES[wp.category || 'POI'] || { icon: '📍' };
            const iconToUse = wp.customIcon || wpCat.icon;
            const opt = document.createElement('option');
            opt.value = wp.id;
            opt.textContent = `${iconToUse} ${wp.name} [${formatCota(wp.z)}]`;
            if (wp.id === appState.selectedWaypointId) opt.selected = true;
            optgroup.appendChild(opt);
          });

          selQuickWaypoint.appendChild(optgroup);
        }
      });
    }
  }

  // 3. Renderiza os Cards (Apenas o selecionado no Modo Compacto, ou todos no Modo Lista)
  const cardsToShow = appState.wpCompactMode
    ? filteredWps.filter(wp => wp.id === appState.selectedWaypointId)
    : filteredWps;

  // Se o ponto selecionado não estiver no filtro atual mas houver resultados, mostra o primeiro no modo compacto
  if (appState.wpCompactMode && cardsToShow.length === 0 && filteredWps.length > 0) {
    cardsToShow.push(filteredWps[0]);
  }

  cardsToShow.forEach(wp => {
    const layer = getAltitudeLayer(wp.z);
    const quad = getQuadrantInfo(wp.x, wp.y);
    const itemColor = wp.color || layer.color;

    const kmX = (wp.x / 1000).toFixed(1).replace('.', ',');
    const kmY = (wp.y / 1000).toFixed(1).replace('.', ',');
    const temp = calculateTemperature(wp.z);

    const wpCat = WP_CATEGORIES[wp.category || 'POI'] || { label: 'Ponto de Interesse', icon: '📍' };
    const iconToUse = wp.customIcon || wpCat.icon;

    const card = document.createElement('div');
    card.className = `wp-card ${wp.id === appState.selectedWaypointId ? 'selected' : ''}`;
    card.style.borderLeftColor = itemColor;
    card.innerHTML = `
      <div class="wp-card-head">
        <span class="wp-card-title">${iconToUse} ${wp.name}</span>
        <span class="wp-badge" style="color:${itemColor}; border-color:${itemColor}">${quad.code}</span>
      </div>
      <div class="wp-details">
        <span>X: ${wp.x >= 0 ? '+' : ''}${kmX}km | Y: ${wp.y >= 0 ? '+' : ''}${kmY}km</span>
        <span style="color:${itemColor}">${formatCota(wp.z)} | 🌡️ ${formatTemp(temp)}</span>
      </div>
      <div class="wp-subtext">${layer.name} // ${wpCat.label}</div>
      <div class="wp-actions">
        <button class="btn-mini" onclick="focusOnWaypoint('${wp.id}')">FOCAR</button>
        <button class="btn-mini" onclick="openModal('${wp.id}')">EDITAR</button>
        <button class="btn-mini danger" onclick="deleteWaypoint('${wp.id}')">EXCLUIR</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') {
        selectWaypoint(wp.id);
      }
    });

    wpListContainer.appendChild(card);
  });
}

window.focusOnWaypoint = function(id) {
  selectWaypoint(id);
  const wp = appState.waypoints.find(w => w.id === id);
  if (!wp) return;
  appState.camera.panX = 0;
  appState.camera.panY = 0;
  render3DScene();
};

window.deleteWaypoint = function(id) {
  appState.waypoints = appState.waypoints.filter(w => w.id !== id);
  if (appState.selectedWaypointId === id) {
    appState.selectedWaypointId = appState.waypoints[0]?.id || null;
  }
  populateSelectDropdowns();
  renderWaypointCards();
  render3DScene();
  renderProfileCanvas();
};

const modal = document.getElementById('wpModalOverlay');
const inputName = document.getElementById('inputWpName');
const inputX = document.getElementById('inputWpX');
const inputY = document.getElementById('inputWpY');
const inputZ = document.getElementById('inputWpZ');
const inputCategory = document.getElementById('inputWpCategory');
const inputCustomIcon = document.getElementById('inputCustomIcon') || document.getElementById('inputWpCustomIcon');
const inputCustomColor = document.getElementById('inputWpCustomColor');
const swatchesContainer = document.getElementById('colorSwatchesContainer');

inputCategory.addEventListener('change', (e) => {
  const defaultIcon = WP_CATEGORIES[e.target.value]?.icon || '📍';
  if (inputCustomIcon) inputCustomIcon.value = defaultIcon;
});

function setupColorSwatches() {
  swatchesContainer.innerHTML = '';
  PRESET_WAYPOINT_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch-btn';
    btn.style.backgroundColor = color;
    if (color === selectedModalColor) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      setModalColor(color);
    });
    swatchesContainer.appendChild(btn);
  });
}

function setModalColor(color) {
  selectedModalColor = color;
  inputCustomColor.value = color;
  document.querySelectorAll('.color-swatch-btn').forEach(b => {
    b.classList.toggle('selected', b.style.backgroundColor === color || rgbToHex(b.style.backgroundColor) === color.toLowerCase());
  });
}

function rgbToHex(rgb) {
  if (!rgb || !rgb.startsWith('rgb')) return rgb;
  const parts = rgb.match(/\d+/g);
  if (!parts || parts.length < 3) return rgb;
  return "#" + parts.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

inputCustomColor.addEventListener('input', (e) => {
  setModalColor(e.target.value);
});

window.openModal = function(editId = null, presetX = 100000, presetY = 100000, presetZ = 3400) {
  appState.pendingEditId = editId;
  setupColorSwatches();

  if (editId) {
    const wp = appState.waypoints.find(w => w.id === editId);
    if (!wp) return;
    document.getElementById('modalHeading').innerText = 'EDITAR PONTO NÁUTICO';
    inputName.value = wp.name;
    inputCategory.value = wp.category || 'POI';
    if (inputCustomIcon) inputCustomIcon.value = wp.customIcon || WP_CATEGORIES[wp.category || 'POI']?.icon || '📍';
    inputX.value = wp.x;
    inputY.value = wp.y;
    inputZ.value = wp.z;
    setModalColor(wp.color || '#0284c7');
  } else {
    document.getElementById('modalHeading').innerText = 'REGISTRAR PONTO NÁUTICO';
    inputName.value = `Ponto-${Math.floor(100 + Math.random() * 900)}`;
    inputCategory.value = 'POI';
    if (inputCustomIcon) inputCustomIcon.value = WP_CATEGORIES['POI'].icon;
    inputX.value = Math.round(presetX);
    inputY.value = Math.round(presetY);
    inputZ.value = Math.round(presetZ);
    setModalColor(PRESET_WAYPOINT_COLORS[Math.floor(Math.random() * PRESET_WAYPOINT_COLORS.length)]);
  }
  modal.classList.add('open');
};

document.getElementById('btnCancelModal').addEventListener('click', () => modal.classList.remove('open'));
document.getElementById('btnOpenNewModal').addEventListener('click', () => openModal(null));

document.getElementById('btnSaveWp').addEventListener('click', () => {
  const name = inputName.value.trim() || 'Ponto Não Nomeado';
  const category = inputCategory.value;
  const customIcon = (inputCustomIcon ? inputCustomIcon.value.trim() : '') || WP_CATEGORIES[category]?.icon || '📍';
  const x = parseInt(inputX.value, 10) || 0;
  const y = parseInt(inputY.value, 10) || 0;
  const z = Math.max(0, Math.min(16000, parseInt(inputZ.value, 10) || 0));
  const color = selectedModalColor || inputCustomColor.value || '#0284c7';

  if (appState.pendingEditId) {
    const wp = appState.waypoints.find(w => w.id === appState.pendingEditId);
    if (wp) {
      wp.name = name;
      wp.category = category;
      wp.customIcon = customIcon;
      wp.x = x;
      wp.y = y;
      wp.z = z;
      wp.color = color;
    }
  } else {
    const newId = Date.now().toString();
    appState.waypoints.push({ id: newId, name, category, customIcon, x, y, z, color });
    appState.selectedWaypointId = newId;
  }

  modal.classList.remove('open');
  populateSelectDropdowns();
  renderWaypointCards();
  selectWaypoint(appState.selectedWaypointId);
  render3DScene();
  renderProfileCanvas();
});

document.getElementById('btnExportData').addEventListener('click', () => {
  const exportPayload = {
    sistema: 'Cartografia 3D Isométrica',
    versao: '2.7-SimuladorEolico',
    origem: 'Marco Zero (0,0,0)',
    cursorAltitude: appState.cursorAltitude,
    airspeed: appState.sim.airspeed,
    waypoints: appState.waypoints
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cartografia_3d_quadrantes_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const jsonInput = document.getElementById('jsonInputFile');
document.getElementById('btnImportData').addEventListener('click', () => jsonInput.click());

jsonInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed.waypoints)) {
        appState.waypoints = parsed.waypoints;
        if (parsed.cursorAltitude !== undefined) setCursorAltitude(parsed.cursorAltitude);
        if (parsed.airspeed !== undefined) {
          document.getElementById('inputAirspeed').value = parsed.airspeed;
        }
        populateSelectDropdowns();
        renderWaypointCards();
        selectWaypoint(appState.waypoints[0]?.id || '1');
        render3DScene();
        renderProfileCanvas();
      }
    } catch (err) {}
  };
  reader.readAsText(file);
});

function animLoop(timestamp) {
  appState.animTime = timestamp * 0.001;
  if (appState.showWindFlow || appState.sim.lastResult) {
    render3DScene();
  }
  requestAnimationFrame(animLoop);
}

window.onload = function() {
  resizeCanvas();
  resizeProfileCanvas();
  populateSelectDropdowns();
  renderZoneImageControls();
  renderWaypointCards();
  setCursorAltitude(3400);
  selectWaypoint('1');
  requestAnimationFrame(animLoop);
};