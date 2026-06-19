export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  valueArea: [number, number];
  profileBuckets: Array<{ price: number; volume: number; isPOC: boolean; inValueArea: boolean }>;
  aboveValueArea: boolean;
  belowValueArea: boolean;
  atPOC: boolean;
  nearVAH: boolean;
  nearVAL: boolean;
}

export function buildVolumeProfile(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  numBuckets = 30
): VolumeProfileResult {
  const size = Math.min(highs.length, lows.length, closes.length, volumes.length);
  const safeBuckets = Math.max(1, Math.floor(numBuckets || 30));
  const lastClose = size > 0 ? Number(closes[size - 1]) : 0;

  if (size === 0) {
    return {
      poc: lastClose,
      vah: lastClose,
      val: lastClose,
      valueArea: [lastClose, lastClose],
      profileBuckets: [{ price: lastClose, volume: 0, isPOC: true, inValueArea: true }],
      aboveValueArea: false,
      belowValueArea: false,
      atPOC: true,
      nearVAH: true,
      nearVAL: true,
    };
  }

  const minPrice = Math.min(...lows.slice(0, size));
  const maxPrice = Math.max(...highs.slice(0, size));
  const range = maxPrice - minPrice;
  const bucketSize = range > 0 ? range / safeBuckets : Math.max(lastClose * 0.001, 0.01);
  const bucketVolumes = new Array<number>(safeBuckets).fill(0);

  const overlapLength = (a1: number, a2: number, b1: number, b2: number): number => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

  for (let i = 0; i < size; i++) {
    const low = Math.min(Number(lows[i]), Number(highs[i]));
    const high = Math.max(Number(highs[i]), Number(lows[i]));
    const barVolume = Math.max(0, Number(volumes[i]) || 0);
    if (barVolume <= 0) continue;

    const barRange = high - low;
    if (barRange <= 0) {
      let idx = Math.floor((low - minPrice) / bucketSize);
      if (!Number.isFinite(idx)) idx = 0;
      idx = Math.max(0, Math.min(safeBuckets - 1, idx));
      bucketVolumes[idx] += barVolume;
      continue;
    }

    const start = Math.max(0, Math.min(safeBuckets - 1, Math.floor((low - minPrice) / bucketSize)));
    const end = Math.max(0, Math.min(safeBuckets - 1, Math.floor((high - minPrice) / bucketSize)));
    for (let b = start; b <= end; b++) {
      const bLow = minPrice + b * bucketSize;
      const bHigh = bLow + bucketSize;
      const overlap = overlapLength(low, high, bLow, bHigh);
      if (overlap > 0) bucketVolumes[b] += barVolume * (overlap / barRange);
    }
  }

  let pocIndex = 0;
  for (let i = 1; i < bucketVolumes.length; i++) {
    if (bucketVolumes[i] > bucketVolumes[pocIndex]) pocIndex = i;
  }

  const totalVolume = bucketVolumes.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;
  const inValueArea = new Array<boolean>(safeBuckets).fill(false);
  inValueArea[pocIndex] = true;
  let left = pocIndex - 1;
  let right = pocIndex + 1;
  let valueVolume = bucketVolumes[pocIndex];
  while (valueVolume < targetVolume && (left >= 0 || right < safeBuckets)) {
    const leftVol = left >= 0 ? bucketVolumes[left] : -1;
    const rightVol = right < safeBuckets ? bucketVolumes[right] : -1;
    if (leftVol >= rightVol) {
      if (left >= 0) {
        inValueArea[left] = true;
        valueVolume += bucketVolumes[left];
        left--;
      } else if (right < safeBuckets) {
        inValueArea[right] = true;
        valueVolume += bucketVolumes[right];
        right++;
      }
    } else if (right < safeBuckets) {
      inValueArea[right] = true;
      valueVolume += bucketVolumes[right];
      right++;
    } else if (left >= 0) {
      inValueArea[left] = true;
      valueVolume += bucketVolumes[left];
      left--;
    }
  }

  let lowVaIndex = 0;
  let highVaIndex = safeBuckets - 1;
  for (let i = 0; i < safeBuckets; i++) {
    if (inValueArea[i]) {
      lowVaIndex = i;
      break;
    }
  }
  for (let i = safeBuckets - 1; i >= 0; i--) {
    if (inValueArea[i]) {
      highVaIndex = i;
      break;
    }
  }

  const poc = minPrice + (pocIndex + 0.5) * bucketSize;
  const val = minPrice + lowVaIndex * bucketSize;
  const vah = minPrice + (highVaIndex + 1) * bucketSize;

  const near = (price: number, level: number, pct: number) =>
    level !== 0 && Math.abs(price - level) / Math.abs(level) <= pct;

  return {
    poc,
    vah,
    val,
    valueArea: [val, vah],
    profileBuckets: bucketVolumes.map((volume, i) => ({
      price: minPrice + (i + 0.5) * bucketSize,
      volume,
      isPOC: i === pocIndex,
      inValueArea: inValueArea[i],
    })),
    aboveValueArea: lastClose > vah,
    belowValueArea: lastClose < val,
    atPOC: near(lastClose, poc, 0.003),
    nearVAH: near(lastClose, vah, 0.005),
    nearVAL: near(lastClose, val, 0.005),
  };
}
