// 画面の録画。Ctrl+F12 (メインプロセスから届く) と MCP の start_recording / stop_recording で始めて止める。
// ウィンドウの中身 (地球儀と、重ねている名前、字幕、パネル) を getDisplayMedia で受け取り、音楽を混ぜて
// MediaRecorder で書き出す。中身は 1 秒ごとにメインプロセスへ送り、data/recordings/ のファイルに追記する (recording.ts)。
// 大きさは今のウィンドウの物理ピクセルのまま。きっちりした大きさにしたいときは、先に動画用サイズ (F11) にする

const CHUNK_MS = 1000;
const BITS_PER_PIXEL = 0.2; // 1 画素 1 コマあたりのビット数。1920×1080、30 コマで約 12Mbps
const MIN_VIDEO_BPS = 8_000_000;
const MAX_VIDEO_BPS = 60_000_000;
const AUDIO_BPS = 192_000;

// 使える最初の形式で書き出す。Electron 33 (Chromium 130) は MP4 (H.264 + AAC) を直接書ける。
// avc1.640034 は High プロファイルのレベル 5.2 で、4K 60 コマまで収まる
const FORMATS: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
  { mimeType: 'video/mp4;codecs=avc1.640034,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

export type RecordingInfo = { file: string; width: number; height: number; fps: number; mimeType: string };

// H.264 は縦横が奇数だと書けないので、偶数に切り下げる
export function evenSize(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export function videoBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(MAX_VIDEO_BPS, Math.max(MIN_VIDEO_BPS, width * height * fps * BITS_PER_PIXEL)));
}

export function initScreenRecorder(options: {
  fps: () => number; // 設定の「録画のコマ数」
  audioTrack: () => MediaStreamTrack | null; // 音楽 (music-player.ts)
  onSaved: (filePath: string | null) => void; // 保存できなかったときは null
}) {
  let session: {
    recorder: MediaRecorder;
    stream: MediaStream;
    info: RecordingInfo;
    stopped: Promise<string | null>;
  } | null = null;
  let starting: Promise<RecordingInfo> | null = null;

  async function begin(fps: number): Promise<RecordingInfo> {
    const ratio = window.devicePixelRatio;
    const width = evenSize(window.innerWidth * ratio);
    const height = evenSize(window.innerHeight * ratio);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: width, max: width },
        height: { ideal: height, max: height },
        frameRate: { ideal: fps, max: fps },
      },
      audio: false,
    });
    const audio = options.audioTrack();
    if (audio) stream.addTrack(audio);

    const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mimeType));
    if (!format) {
      stream.getVideoTracks().forEach((track) => track.stop());
      throw new Error('録画できる形式がありません');
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: videoBitrate(width, height, fps),
      audioBitsPerSecond: AUDIO_BPS,
    });
    const file = await window.weatherApi.recordingBegin(format.extension);
    const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
    const info = {
      file,
      width: settings.width ?? width,
      height: settings.height ?? height,
      fps: settings.frameRate ?? fps,
      mimeType: recorder.mimeType || format.mimeType,
    };

    let writing = Promise.resolve();
    let failed = false;
    // 送る順番を保つため、前の書き込みを待ってから次を送る
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size === 0) return;
      writing = writing
        .then(async () => window.weatherApi.recordingChunk(new Uint8Array(await event.data.arrayBuffer())))
        .catch((err) => {
          failed = true;
          console.error('recording write failed', err);
        });
    });
    const stopped = new Promise<string | null>((resolve) => {
      recorder.addEventListener('stop', () => {
        // 音楽の音の流れは使い回すので止めない
        stream.getVideoTracks().forEach((track) => track.stop());
        void writing
          .then(() => window.weatherApi.recordingEnd())
          .then((saved) => resolve(failed ? null : saved))
          .catch((err) => {
            console.error('recording end failed', err);
            resolve(null);
          });
      });
    });
    // ウィンドウが閉じたときなど、映像が途切れたら止める
    stream.getVideoTracks()[0]?.addEventListener('ended', () => void stop());
    recorder.start(CHUNK_MS);
    session = { recorder, stream, info, stopped };
    return info;
  }

  async function start(fps = options.fps()): Promise<RecordingInfo> {
    if (session) throw new Error('すでに録画中です');
    if (starting) return starting;
    starting = begin(fps === 60 ? 60 : 30);
    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  // 書き終えるまで待ち、保存したパスを返す (保存できなかったときは null)
  async function stop(): Promise<string | null> {
    const current = session;
    if (!current) return null;
    session = null;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    const saved = await current.stopped;
    options.onSaved(saved);
    return saved;
  }

  async function toggle(): Promise<void> {
    try {
      if (session) await stop();
      else await start();
    } catch (err) {
      console.error('recording failed', err);
      options.onSaved(null);
    }
  }

  window.weatherApi.onRecordingToggle(() => void toggle());

  return {
    start,
    stop,
    recording: () => (session ? { ...session.info } : null),
  };
}

export type ScreenRecorder = ReturnType<typeof initScreenRecorder>;
