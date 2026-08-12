// Analyzes a local audio stream and reports a 0–1 volume level on every
// animation frame, so the UI can show a live "your voice is being heard" meter.

export function createAudioMeter(stream, onLevel) {
  const audioContext = new AudioContext();
  // Chrome (and others) can create the context in a "suspended" state,
  // especially when it's constructed after an awaited call like
  // getUserMedia — even though the whole flow started from a click.
  // Without this, the analyser just reports silence forever.
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  let rafId = null;
  let smoothedLevel = 0;

  function tick() {
    analyser.getByteTimeDomainData(dataArray);

    // Root-mean-square of the waveform — standard way to measure loudness.
    // Values are centered at 128 (silence); we normalize deviation to 0–1.
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const rawLevel = Math.min(rms * 4, 1); // amplify a bit so normal speech is clearly visible

    // Smooth like a real VU meter: jump up quickly when you speak, ease
    // back down between words instead of snapping to zero every frame.
    const smoothing = rawLevel > smoothedLevel ? 0.6 : 0.15;
    smoothedLevel += (rawLevel - smoothedLevel) * smoothing;

    onLevel(smoothedLevel);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  // Call this when the stream stops, to release the audio context.
  return function stopMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    source.disconnect();
    audioContext.close();
  };
}
