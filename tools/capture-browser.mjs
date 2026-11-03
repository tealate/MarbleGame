// These functions run only inside the dedicated capture browser.
export async function recordCanvas(config) {
  const source = document.querySelector('#game canvas');
  // A separate output canvas supports sizes above the game's native framebuffer.
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  const context = canvas.getContext('2d');
  let frame;
  const draw = () => {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    frame = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(config.fps);
  const candidates = config.format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.42001f', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let timer;
  let watchdog;
  let recorder;
  try {
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error(`Edge cannot record ${config.format}; try format: webm or update Edge.`);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: config.videoBitsPerSecond });
    const chunks = [];
    await new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = event => reject(new Error(event.error?.message ?? 'MediaRecorder failed'));
      recorder.onstop = resolve;
      watchdog = setTimeout(() => reject(new Error('Recording timed out')), config.durationSeconds * 1000 + config.timeoutMs);
      recorder.start(250);
      timer = setTimeout(() => recorder.stop(), config.durationSeconds * 1000);
    });
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { data, mimeType: recorder.mimeType, sourceWidth: source.width, sourceHeight: source.height };
  } finally {
    clearTimeout(timer);
    clearTimeout(watchdog);
    if (recorder?.state === 'recording') recorder.stop();
    cancelAnimationFrame(frame);
    stream.getTracks().forEach(track => track.stop());
  }
}

// Decode the saved bytes from beginning to end, rather than trusting a file header.
export async function verifyVideo({ data, config }) {
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: `video/${config.format}` }));
  const video = document.createElement('video');
  video.muted = true;
  video.src = url;
  document.body.append(video);
  const sample = document.createElement('canvas');
  sample.width = 108;
  sample.height = 192;
  const context = sample.getContext('2d', { willReadFrequently: true });
  let frames = 0;
  let changes = 0;
  let last;
  let callback;
  let timer;
  const inspect = () => {
    context.drawImage(video, 0, 0, sample.width, sample.height);
    // Sample the marble zone, excluding the static headings above it.
    const pixels = context.getImageData(0, 134, 108, 58).data;
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    if (last !== undefined && last !== hash) changes++;
    last = hash;
    frames++;
    callback = video.requestVideoFrameCallback(inspect);
  };
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Saved video playback timed out')), config.durationSeconds * 1000 + config.timeoutMs);
      video.onerror = () => reject(new Error(`Saved video cannot decode: ${video.error?.message}`));
      video.onended = resolve;
      callback = video.requestVideoFrameCallback(inspect);
      video.play().catch(reject);
    });
    const duration = video.currentTime;
    if (video.videoWidth !== config.width || video.videoHeight !== config.height) throw new Error('Video resolution mismatch');
    if (Math.abs(duration - config.durationSeconds) > Math.max(1, config.durationSeconds * 0.1)) throw new Error(`Unexpected video duration: ${duration}`);
    if (frames < config.durationSeconds * 5 || changes < 3) throw new Error(`Video is frozen or too few decoded frames: ${frames} frames, ${changes} changes`);
    return { width: video.videoWidth, height: video.videoHeight, duration, decodedFrames: frames, movingFrames: changes, decodedFps: frames / duration };
  } finally {
    clearTimeout(timer);
    video.cancelVideoFrameCallback(callback);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
