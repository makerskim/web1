// 동영상 크기 줄이기: 휴대폰에서 동영상을 틀면서 작은 크기로 다시 녹화해요 (긴 쪽 1280px · 약 2.6Mbps)
// - 동영상 길이만큼 걸려요 (1분짜리면 1분)
// - 이 기기에서 안 되거나 줄여도 별로 작아지지 않으면 원본을 그대로 올려요
const LONG = 1280;
const V_BPS = 2_500_000;
const A_BPS = 128_000;

// mp4로 녹화할 수 있는 브라우저만 (webm은 아이폰에서 안 열리거나 넘겨 보기가 안 될 때가 있어요)
const TYPES = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
export function shrinkType(): string | null {
  try {
    if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
    if (typeof AudioContext === 'undefined' && !('webkitAudioContext' in window)) return null;
    return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  } catch {
    return null;
  }
}
export const canShrink = () => !!shrinkType();
/** 줄였을 때 크기 어림 (바이트) */
export const shrinkEstimate = (dur: number) => Math.round((dur * (V_BPS + A_BPS)) / 8);

export interface ShrinkJob { file: File; el: HTMLVideoElement; url: string; ctx: AudioContext; dest: MediaStreamAudioDestinationNode }

// 버튼을 누른 그 순간에 불러야 해요: 아이폰은 소리 나는 동영상을 누른 순간에만 틀 수 있어요
export function prepareShrink(files: File[]): ShrinkJob[] {
  if (!files.length || !shrinkType()) return [];
  let ctx: AudioContext;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    ctx.resume().catch(() => {});
  } catch {
    return [];
  }
  const jobs: ShrinkJob[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.src = url;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    // 화면에 아주 작게 붙여 둬야 장면이 그려져요 (보이지는 않아요)
    el.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
    document.body.appendChild(el);
    // 소리는 스피커로 내지 않고 녹화에만 넣어요
    let dest: MediaStreamAudioDestinationNode;
    try {
      dest = ctx.createMediaStreamDestination();
      ctx.createMediaElementSource(el).connect(dest);
    } catch {
      el.remove();
      URL.revokeObjectURL(url);
      continue;
    }
    // 눌린 순간에 한 번 틀었다 멈춰 두면 나중에도 소리와 함께 틀 수 있어요
    el.play().then(() => { el.pause(); el.currentTime = 0; }, () => {});
    jobs.push({ file, el, url, ctx, dest });
  }
  if (!jobs.length) ctx.close().catch(() => {});
  return jobs;
}

export function releaseShrink(jobs: ShrinkJob[]) {
  jobs.forEach((j) => { j.el.pause(); j.el.removeAttribute('src'); j.el.load(); j.el.remove(); URL.revokeObjectURL(j.url); });
  jobs[0]?.ctx.close().catch(() => {});
}

const wait = (el: HTMLVideoElement, ev: string) => new Promise<void>((ok, no) => {
  if (ev === 'loadedmetadata' && el.readyState >= 1) { ok(); return; }
  el.addEventListener(ev, () => ok(), { once: true });
  el.addEventListener('error', () => no(new Error('video')), { once: true });
});

/** 줄인 동영상 (안 되면 null → 원본으로) */
export async function shrinkVideo(job: ShrinkJob, dur: number, onProgress?: (f: number) => void): Promise<File | null> {
  const type = shrinkType();
  if (!type) return null;
  const v = job.el;
  let rec: MediaRecorder | null = null;
  let timer = 0;
  try {
    await wait(v, 'loadedmetadata');
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;
    const k = Math.min(1, LONG / Math.max(vw, vh));
    const w = Math.max(2, Math.round((vw * k) / 2) * 2);
    const h = Math.max(2, Math.round((vh * k) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const stream = canvas.captureStream(30);
    job.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    if (job.ctx.state !== 'running') await job.ctx.resume().catch(() => {});

    const chunks: Blob[] = [];
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: V_BPS, audioBitsPerSecond: A_BPS });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((r) => { rec!.onstop = () => r(); });

    v.currentTime = 0;
    g.drawImage(v, 0, 0, w, h);
    const total = dur || v.duration || 1;
    const rvfc = 'requestVideoFrameCallback' in v;
    const draw = () => {
      g.drawImage(v, 0, 0, w, h);
      onProgress?.(Math.min(1, v.currentTime / total));
      if (!v.ended) {
        if (rvfc) (v as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(draw);
        else requestAnimationFrame(draw);
      }
    };
    rec.start(1000);
    await v.play();
    draw();
    // 멈춰 버리면(다른 앱으로 가서 등) 다시 틀고, 오래 안 움직이면 그만둬요
    await new Promise<void>((ok, no) => {
      let last = -1;
      let still = 0;
      v.addEventListener('ended', () => ok(), { once: true });
      v.addEventListener('error', () => no(new Error('video')), { once: true });
      timer = window.setInterval(() => {
        if (v.ended) { ok(); return; }
        if (v.paused) v.play().catch(() => {});
        if (v.currentTime === last) { if (++still >= 8) no(new Error('stalled')); } else still = 0;
        last = v.currentTime;
      }, 2000);
    });
    g.drawImage(v, 0, 0, w, h);
    rec.stop();
    await stopped;
    const base = type.split(';')[0];
    const blob = new Blob(chunks, { type: base });
    // 거의 안 줄었으면 원본이 나아요
    if (!blob.size || blob.size > job.file.size * 0.9) return null;
    const name = `${job.file.name.replace(/\.[a-z0-9]{2,5}$/i, '') || 'video'}.mp4`;
    return new File([blob], name, { type: base, lastModified: job.file.lastModified });
  } catch {
    if (rec && rec.state !== 'inactive') try { rec.stop(); } catch { /* 이미 멈춤 */ }
    return null;
  } finally {
    clearInterval(timer);
    v.pause();
  }
}
