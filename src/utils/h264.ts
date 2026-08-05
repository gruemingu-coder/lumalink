/** Parse SPS/PPS NAL units from an Annex-B H.264 access unit. */
export function extractSpsPps(data: Uint8Array): { sps: Uint8Array; pps: Uint8Array } | null {
  const nals = splitAnnexBNals(data);
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  for (const nal of nals) {
    if (nal.length === 0) continue;
    const type = nal[0] & 0x1f;
    if (type === 7) sps = nal;
    if (type === 8) pps = nal;
  }
  return sps && pps ? { sps, pps } : null;
}

export function buildAvcCodecString(sps: Uint8Array): string {
  if (sps.length < 4) return "avc1.42E01E";
  const profile = sps[1].toString(16).padStart(2, "0").toUpperCase();
  const constraints = sps[2].toString(16).padStart(2, "0").toUpperCase();
  const level = sps[3].toString(16).padStart(2, "0").toUpperCase();
  return `avc1.${profile}${constraints}${level}`;
}

/** Build an avcC description blob for WebCodecs VideoDecoder.configure(). */
export function buildAvcCDescription(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const spsLen = sps.length;
  const ppsLen = pps.length;
  const out = new Uint8Array(11 + spsLen + ppsLen);
  let i = 0;
  out[i++] = 1; // configurationVersion
  out[i++] = sps[1] ?? 0x42; // AVCProfileIndication
  out[i++] = sps[2] ?? 0x00; // profile_compatibility
  out[i++] = sps[3] ?? 0x1e; // AVCLevelIndication
  out[i++] = 0xff; // lengthSizeMinusOne (4-byte NAL lengths)
  out[i++] = 0xe1; // numOfSequenceParameterSets = 1
  out[i++] = (spsLen >> 8) & 0xff;
  out[i++] = spsLen & 0xff;
  out.set(sps, i);
  i += spsLen;
  out[i++] = 1; // numOfPictureParameterSets
  out[i++] = (ppsLen >> 8) & 0xff;
  out[i++] = ppsLen & 0xff;
  out.set(pps, i);
  return out;
}

/** Convert Annex-B NALs to length-prefixed AVCC (required by some WebCodecs builds). */
export function annexBToAvcc(data: Uint8Array): Uint8Array {
  const nals = splitAnnexBNals(data);
  let total = 0;
  for (const nal of nals) total += 4 + nal.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const nal of nals) {
    const len = nal.length;
    out[offset++] = (len >> 24) & 0xff;
    out[offset++] = (len >> 16) & 0xff;
    out[offset++] = (len >> 8) & 0xff;
    out[offset++] = len & 0xff;
    out.set(nal, offset);
    offset += len;
  }
  return out;
}

function splitAnnexBNals(data: Uint8Array): Uint8Array[] {
  const starts: number[] = [];
  let i = 0;
  while (i + 3 < data.length) {
    if (data[i] === 0 && data[i + 1] === 0) {
      if (data[i + 2] === 1) {
        starts.push(i + 3);
        i += 3;
        continue;
      }
      if (i + 3 < data.length && data[i + 2] === 0 && data[i + 3] === 1) {
        starts.push(i + 4);
        i += 4;
        continue;
      }
    }
    i += 1;
  }
  if (starts.length === 0) return data.length ? [data] : [];
  const nals: Uint8Array[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? findStartBefore(data, starts[s + 1]) : data.length;
    if (to > from) nals.push(data.subarray(from, to));
  }
  return nals;
}

function findStartBefore(data: Uint8Array, pos: number): number {
  for (let j = pos - 1; j >= 2; j--) {
    if (data[j] === 1 && data[j - 1] === 0 && data[j - 2] === 0) {
      if (j >= 3 && data[j - 3] === 0) return j - 3;
      return j - 2;
    }
  }
  return pos;
}

export function looksLikeKeyFrame(data: Uint8Array): boolean {
  for (const nal of splitAnnexBNals(data)) {
    if (nal.length === 0) continue;
    const nalType = nal[0] & 0x1f;
    if (nalType === 5 || nalType === 7) return true;
  }
  return false;
}
