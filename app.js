/* Frequency Generator ID — Web Audio API, 100% lokal */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- AudioContext tunggal ----------
  let actx = null;
  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  // ---------- Helper: log slider 1..20000 <-> 0..1000 ----------
  const FMIN = 1, FMAX = 20000;
  const freqToSlider = (f) => {
    f = Math.min(FMAX, Math.max(FMIN, f));
    return Math.round(1000 * Math.log(f / FMIN) / Math.log(FMAX / FMIN));
  };
  const sliderToFreq = (s) => {
    const t = Math.min(1000, Math.max(0, Number(s))) / 1000;
    return Math.round(FMIN * Math.pow(FMAX / FMIN, t));
  };
  const clampFreq = (f) => Math.min(20000, Math.max(1, Math.round(Number(f) || 440)));

  // =====================================================
  // 1) GENERATOR NADA
  // =====================================================
  const freqInput = $("freqInput"), freqSlider = $("freqSlider");
  const toneReadout = $("toneReadout"), toneWaveLabel = $("toneWaveLabel");
  const volSlider = $("volSlider"), volLabel = $("volLabel");
  const tonePlayBtn = $("tonePlayBtn"), toneStopBtn = $("toneStopBtn");
  const toneStatus = $("toneStatus"), toneCanvas = $("toneCanvas");
  const waveDesc = $("waveDesc");

  let toneWave = "sine";
  let toneOsc = null, toneGain = null, toneAnalyser = null;
  let toneRaf = null;

  const WAVE_INFO = {
    sine: "Sine: murni & halus, tanpa harmonik. Cocok untuk tuning & referensi.",
    square: "Square: tajam & hollow, kaya harmonik ganjil. Terdengar paling nyaring.",
    sawtooth: "Sawtooth: terang & buzzy, mengandung semua harmonik. Cocok untuk tes speaker.",
    triangle: "Triangle: lembut & rounded, versi halus dari square.",
  };

  function setFreq(f, fromSlider = false) {
    f = clampFreq(f);
    freqInput.value = f;
    if (!fromSlider) freqSlider.value = freqToSlider(f);
    toneReadout.textContent = f;
    if (toneOsc) toneOsc.frequency.setTargetAtTime(f, ctx().currentTime, 0.01);
    updateURL();
  }

  freqInput.addEventListener("input", () => setFreq(freqInput.value));
  freqSlider.addEventListener("input", () => setFreq(sliderToFreq(freqSlider.value), true));

  // Keyboard: ↑/↓ = 1Hz, Shift+↑/↓ = 10Hz
  freqInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
      setFreq(clampFreq(Number(freqInput.value) + step));
    }
  });

  // Waveform buttons (generator)
  document.querySelectorAll("#generator .wave-btns button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#generator .wave-btns button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      toneWave = b.dataset.wave;
      toneWaveLabel.textContent = toneWave;
      waveDesc.textContent = WAVE_INFO[toneWave];
      if (toneOsc) toneOsc.type = toneWave;
      updateURL();
    });
  });

  // Preset
  document.querySelectorAll(".preset-btns button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".preset-btns button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      setFreq(Number(b.dataset.freq));
      // auto-play biar langsung terdengar? tidak — biarkan user tekan play
    });
  });

  volSlider.addEventListener("input", () => {
    volLabel.textContent = volSlider.value + "%";
    if (toneGain) toneGain.gain.setTargetAtTime(volSlider.value / 100 * 0.9, ctx().currentTime, 0.02);
  });

  function drawOscilloscope(canvas, analyser, rafHolder) {
    const c = canvas.getContext("2d");
    const data = new Uint8Array(analyser.fftSize);
    const draw = () => {
      rafHolder.id = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(data);
      const W = canvas.width, H = canvas.height;
      c.fillStyle = "#05070d";
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(255,255,255,0.12)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
      c.strokeStyle = "#22d3ee";
      c.lineWidth = 2.5;
      c.beginPath();
      const step = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 255) * H;
        i === 0 ? c.moveTo(0, y) : c.lineTo(i * step, y);
      }
      c.stroke();
    };
    draw();
  }

  function startTone() {
    const ac = ctx();
    stopTone(true);
    toneOsc = ac.createOscillator();
    toneGain = ac.createGain();
    toneAnalyser = ac.createAnalyser();
    toneAnalyser.fftSize = 2048;
    toneOsc.type = toneWave;
    toneOsc.frequency.value = clampFreq(freqInput.value);
    const v = volSlider.value / 100 * 0.9;
    toneGain.gain.value = 0;
    toneOsc.connect(toneGain).connect(toneAnalyser).connect(ac.destination);
    toneOsc.start();
    toneGain.gain.setTargetAtTime(v, ac.currentTime, 0.03);
    toneStatus.textContent = "Memainkan " + freqInput.value + " Hz";
    toneStatus.classList.add("playing");
    tonePlayBtn.disabled = true;
    toneStopBtn.disabled = false;
    const holder = { id: null };
    toneRaf = holder;
    drawOscilloscope(toneCanvas, toneAnalyser, holder);
  }

  function stopTone(silent = false) {
    if (toneRaf) cancelAnimationFrame(toneRaf.id);
    toneRaf = null;
    if (toneOsc) {
      try {
        const o = toneOsc, g = toneGain;
        g.gain.setTargetAtTime(0, ctx().currentTime, 0.02);
        setTimeout(() => { try { o.stop(); } catch (_) {} }, 120);
      } catch (_) {}
    }
    toneOsc = null;
    if (!silent) {
      toneStatus.textContent = "Berhenti";
      toneStatus.classList.remove("playing");
      tonePlayBtn.disabled = false;
      toneStopBtn.disabled = true;
      // gambar idle
      const c = toneCanvas.getContext("2d");
      c.fillStyle = "#05070d";
      c.fillRect(0, 0, toneCanvas.width, toneCanvas.height);
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.beginPath(); c.moveTo(0, 90); c.lineTo(600, 90); c.stroke();
    }
  }

  tonePlayBtn.addEventListener("click", startTone);
  toneStopBtn.addEventListener("click", () => stopTone());

  // Share link ?freq=&waveform=
  function updateURL() {
    const url = new URL(window.location.href);
    url.searchParams.set("freq", freqInput.value);
    url.searchParams.set("waveform", toneWave);
    window.history.replaceState(null, "", url);
  }
  $("toneShareBtn").addEventListener("click", async () => {
    updateURL();
    try {
      await navigator.clipboard.writeText(window.location.href);
      $("toneShareBtn").textContent = "✅ Link disalin!";
    } catch (_) {
      prompt("Salin link ini:", window.location.href);
    }
    setTimeout(() => ($("toneShareBtn").textContent = "🔗 Salin Link"), 2000);
  });

  // Load dari URL
  (() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("freq")) setFreq(clampFreq(p.get("freq")));
    else freqSlider.value = freqToSlider(440);
    if (p.get("waveform") && WAVE_INFO[p.get("waveform")]) {
      toneWave = p.get("waveform");
      document.querySelectorAll("#generator .wave-btns button").forEach((x) =>
        x.classList.toggle("active", x.dataset.wave === toneWave)
      );
      toneWaveLabel.textContent = toneWave;
      waveDesc.textContent = WAVE_INFO[toneWave];
    }
  })();

  // ---------- Export WAV (tone) ----------
  function encodeWAV(buffer) {
    const nCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length * nCh * 2 + 44;
    const ab = new ArrayBuffer(len), v = new DataView(ab);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, "RIFF"); v.setUint32(4, len - 8, true); wstr(8, "WAVEfmt ");
    v.setUint16(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, nCh, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true);
    v.setUint16(34, 16, true); wstr(36, "data"); v.setUint32(40, len - 44, true);
    let off = 44;
    for (let i = 0; i < buffer.length; i++)
      for (let ch = 0; ch < nCh; ch++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    return new Blob([ab], { type: "audio/wav" });
  }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  $("toneSaveBtn").addEventListener("click", async () => {
    const dur = Number($("toneDur").value), f = clampFreq(freqInput.value);
    const sr = 44100;
    const off = new OfflineAudioContext(1, sr * dur, sr);
    const o = off.createOscillator(), g = off.createGain();
    o.type = toneWave; o.frequency.value = f;
    g.gain.value = (volSlider.value / 100) * 0.9;
    o.connect(g).connect(off.destination);
    o.start(0); o.stop(dur);
    const buf = await off.startRendering();
    downloadBlob(encodeWAV(buf), `tone-${f}Hz-${toneWave}-${dur}s.wav`);
  });

  // =====================================================
  // 2) FREQUENCY SWEEP + LOOP
  // =====================================================
  const sweepStart = $("sweepStart"), sweepEnd = $("sweepEnd");
  const sweepDur = $("sweepDur"), sweepDelay = $("sweepDelay");
  const sweepLoop = $("sweepLoop"), sweepContinue = $("sweepContinue");
  const sweepStartVol = $("sweepStartVol"), sweepEndVol = $("sweepEndVol");
  const sweepPlayBtn = $("sweepPlayBtn"), sweepStopBtn = $("sweepStopBtn");
  const sweepStatus = $("sweepStatus"), sweepCanvas = $("sweepCanvas");
  let sweepWave = "sine";
  let sweepPlaying = false, sweepOsc = null, sweepGain = null, sweepAnalyser = null;
  let sweepRaf = null, sweepTimer = null, sweepStartTime = 0, sweepLoopCount = 0;

  $("sweepStartVolLabel").textContent = sweepStartVol.value + "%";
  $("sweepEndVolLabel").textContent = sweepEndVol.value + "%";
  sweepStartVol.addEventListener("input", () => ($("sweepStartVolLabel").textContent = sweepStartVol.value + "%"));
  sweepEndVol.addEventListener("input", () => ($("sweepEndVolLabel").textContent = sweepEndVol.value + "%"));

  document.querySelectorAll("#sweepWaveBtns button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#sweepWaveBtns button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      sweepWave = b.dataset.wave;
    });
  });

  function sweepMode() {
    return document.querySelector('input[name="sweepMode"]:checked').value;
  }

  function runOneSweep(ac, f0, f1, dur, v0, v1, mode, onDone) {
    // stop node lama
    if (sweepOsc) { try { sweepOsc.stop(); } catch (_) {} }
    sweepOsc = ac.createOscillator();
    sweepGain = ac.createGain();
    sweepAnalyser = ac.createAnalyser();
    sweepAnalyser.fftSize = 2048;
    sweepOsc.type = sweepWave;
    const t = ac.currentTime;
    sweepOsc.frequency.setValueAtTime(Math.max(1, f0), t);
    if (mode === "exponential") {
      sweepOsc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    } else {
      sweepOsc.frequency.linearRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    sweepGain.gain.setValueAtTime(v0, t);
    sweepGain.gain.linearRampToValueAtTime(v1, t + dur);
    sweepOsc.connect(sweepGain).connect(sweepAnalyser).connect(ac.destination);
    sweepOsc.start(t);
    sweepOsc.stop(t + dur + 0.05);
    sweepStartTime = performance.now();
    sweepLoopCount++;

    // holder visualizer
    if (sweepRaf) cancelAnimationFrame(sweepRaf.id);
    const holder = { id: null };
    sweepRaf = holder;
    drawOscilloscope(sweepCanvas, sweepAnalyser, holder);

    // UI updater
    clearInterval(sweepTimer);
    sweepTimer = setInterval(() => {
      const el = (performance.now() - sweepStartTime) / 1000;
      const p = Math.min(1, el / dur);
      let cur;
      if (mode === "exponential") cur = f0 * Math.pow(f1 / f0, p);
      else cur = f0 + (f1 - f0) * p;
      $("sweepCurFreq").textContent = Math.round(cur) + " Hz";
      $("sweepCurTime").textContent = el.toFixed(1) + " dtk";
      $("sweepProgress").style.width = p * 100 + "%";
      $("sweepLoopCount").textContent = sweepLoopCount;
      if (p >= 1) {
        clearInterval(sweepTimer);
        onDone();
      }
    }, 60);
  }

  function startSweep() {
    const ac = ctx();
    const f0 = clampFreq(sweepStart.value), f1 = clampFreq(sweepEnd.value);
    const dur = Math.min(120, Math.max(0.5, Number(sweepDur.value) || 10));
    const delay = Math.min(10, Math.max(0, Number(sweepDelay.value) || 0));
    const v0 = sweepStartVol.value / 100 * 0.9, v1 = sweepEndVol.value / 100 * 0.9;
    const mode = sweepMode();
    sweepPlaying = true;
    sweepLoopCount = 0;
    sweepStatus.textContent = "Sweep berjalan…";
    sweepStatus.classList.add("playing");
    sweepPlayBtn.disabled = true;
    sweepStopBtn.disabled = false;

    const again = () => {
      if (!sweepPlaying) return;
      if (!sweepLoop.checked) {
        // sekali jalan
        if (sweepContinue.checked) {
          // biarkan nada akhir berbunyi terus sebagai tone
          sweepStatus.textContent = "Selesai — nada " + f1 + " Hz berlanjut";
          sweepPlaying = "holding";
          return;
        }
        stopSweep();
        sweepStatus.textContent = "Selesai";
        return;
      }
      setTimeout(() => {
        if (!sweepPlaying || sweepPlaying === "holding") return;
        runOneSweep(ac, f0, f1, dur, v0, v1, mode, again);
      }, delay * 1000);
    };
    runOneSweep(ac, f0, f1, dur, v0, v1, mode, again);
  }

  function stopSweep() {
    sweepPlaying = false;
    clearInterval(sweepTimer);
    if (sweepRaf) cancelAnimationFrame(sweepRaf.id);
    if (sweepOsc) { try { sweepOsc.stop(); } catch (_) {} }
    sweepOsc = null;
    sweepStatus.textContent = "Berhenti";
    sweepStatus.classList.remove("playing");
    sweepPlayBtn.disabled = false;
    sweepStopBtn.disabled = true;
    $("sweepProgress").style.width = "0%";
  }

  sweepPlayBtn.addEventListener("click", startSweep);
  sweepStopBtn.addEventListener("click", stopSweep);

  // =====================================================
  // 3) NOISE (white/pink/brown) + BANDPASS
  // =====================================================
  const noisePlayBtn = $("noisePlayBtn"), noiseStopBtn = $("noiseStopBtn");
  const noiseStatus = $("noiseStatus"), noiseCanvas = $("noiseCanvas");
  const noiseVol = $("noiseVol"), noiseDesc = $("noiseDesc");
  const bpEnable = $("bpEnable"), bpFreqSlider = $("bpFreqSlider");
  const bpFreqInput = $("bpFreqInput"), bpQ = $("bpQ");
  let noiseType = "white";
  let noiseSrc = null, noiseGain = null, noiseFilter = null, noiseAnalyser = null;
  let noiseRaf = null;

  const NOISE_INFO = {
    white: "White: energi merata di semua frekuensi. Terdengar “mendesis” terang.",
    pink: "Pink: lebih natural di telinga manusia, bass lebih hangat. Cocok untuk kalibrasi.",
    brown: "Brown: dalam & bergemuruh, dominan frekuensi rendah. Cocok untuk relaksasi & masking.",
  };

  document.querySelectorAll("#noiseTypeBtns button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#noiseTypeBtns button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      noiseType = b.dataset.noise;
      noiseDesc.textContent = NOISE_INFO[noiseType];
      if (noiseSrc) restartNoise(); // ganti live
    });
  });

  noiseVol.addEventListener("input", () => {
    $("noiseVolLabel").textContent = noiseVol.value + "%";
    if (noiseGain) noiseGain.gain.setTargetAtTime(noiseVol.value / 100 * 0.9, ctx().currentTime, 0.02);
  });

  // bandpass freq: slider log 20..20000
  const bpSliderToFreq = (s) => Math.round(20 * Math.pow(20000 / 20, s / 1000));
  const bpFreqToSlider = (f) => Math.round(1000 * Math.log(f / 20) / Math.log(20000 / 20));
  bpFreqSlider.addEventListener("input", () => {
    const f = bpSliderToFreq(Number(bpFreqSlider.value));
    bpFreqInput.value = f;
    $("bpFreqLabel").textContent = f + " Hz";
    if (noiseFilter) noiseFilter.frequency.setTargetAtTime(f, ctx().currentTime, 0.01);
  });
  bpFreqInput.addEventListener("input", () => {
    let f = Math.min(20000, Math.max(20, Number(bpFreqInput.value) || 1000));
    bpFreqSlider.value = bpFreqToSlider(f);
    $("bpFreqLabel").textContent = f + " Hz";
    if (noiseFilter) noiseFilter.frequency.setTargetAtTime(f, ctx().currentTime, 0.01);
  });
  bpQ.addEventListener("input", () => {
    $("bpQLabel").textContent = Number(bpQ.value).toFixed(1);
    if (noiseFilter) noiseFilter.Q.setTargetAtTime(Number(bpQ.value), ctx().currentTime, 0.01);
  });
  bpEnable.addEventListener("change", () => {
    if (noiseFilter) noiseFilter.type = bpEnable.checked ? "bandpass" : "allpass";
    // allpass = praktis bypass tanpa rebuild graph
  });

  // --- generator buffer noise ---
  function makeNoiseBuffer(ac, type, seconds = 4) {
    const sr = ac.sampleRate, len = sr * seconds;
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    if (type === "white") {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === "pink") {
      // Paul Kellet pink filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      // brown (red): integrasi + leak
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  function drawSpectrum(canvas, analyser) {
    const c = canvas.getContext("2d");
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      noiseRaf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const W = canvas.width, H = canvas.height;
      c.fillStyle = "#05070d";
      c.fillRect(0, 0, W, H);
      const bars = 64, step = Math.floor(data.length / bars);
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const h = v * H;
        const grad = c.createLinearGradient(0, H - h, 0, H);
        grad.addColorStop(0, "#22d3ee");
        grad.addColorStop(1, "#6c8cff");
        c.fillStyle = grad;
        c.fillRect(i * bw + 1, H - h, bw - 2, h);
      }
    };
    draw();
  }

  function startNoise() {
    const ac = ctx();
    stopNoise(true);
    noiseSrc = ac.createBufferSource();
    noiseSrc.buffer = makeNoiseBuffer(ac, noiseType, 4);
    noiseSrc.loop = true;
    noiseGain = ac.createGain();
    noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = bpEnable.checked ? "bandpass" : "allpass";
    noiseFilter.frequency.value = Number(bpFreqInput.value) || 1000;
    noiseFilter.Q.value = Number(bpQ.value) || 1;
    noiseAnalyser = ac.createAnalyser();
    noiseAnalyser.fftSize = 2048;
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(noiseAnalyser).connect(ac.destination);
    noiseGain.gain.value = 0;
    noiseSrc.start();
    noiseGain.gain.setTargetAtTime(noiseVol.value / 100 * 0.9, ac.currentTime, 0.05);
    noiseStatus.textContent = "Memainkan " + noiseType + " noise";
    noiseStatus.classList.add("playing");
    noisePlayBtn.disabled = true;
    noiseStopBtn.disabled = false;
    drawSpectrum(noiseCanvas, noiseAnalyser);
  }
  function restartNoise() { startNoise(); }
  function stopNoise(silent = false) {
    if (noiseRaf) cancelAnimationFrame(noiseRaf);
    noiseRaf = null;
    if (noiseSrc) { try { noiseSrc.stop(); } catch (_) {} }
    noiseSrc = null;
    if (!silent) {
      noiseStatus.textContent = "Berhenti";
      noiseStatus.classList.remove("playing");
      noisePlayBtn.disabled = false;
      noiseStopBtn.disabled = true;
    }
  }
  noisePlayBtn.addEventListener("click", startNoise);
  noiseStopBtn.addEventListener("click", () => stopNoise());

  // Save noise WAV (termasuk filter jika aktif)
  $("noiseSaveBtn").addEventListener("click", async () => {
    const dur = Number($("noiseDur").value);
    const sr = 44100;
    const off = new OfflineAudioContext(1, sr * dur, sr);
    // render noise mentah dulu (pakai Math.random, tidak bisa reuse buffer AC karena sampleRate beda — generate ulang)
    const len = sr * dur;
    const raw = off.createBuffer(1, len, sr);
    const d = raw.getChannelData(0);
    // generate sesuai tipe (duplikasi logika agar konsisten)
    if (noiseType === "white") {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (noiseType === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    const src = off.createBufferSource();
    src.buffer = raw;
    const g = off.createGain();
    g.gain.value = (noiseVol.value / 100) * 0.9;
    let node = src;
    if (bpEnable.checked) {
      const f = off.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = Number(bpFreqInput.value) || 1000;
      f.Q.value = Number(bpQ.value) || 1;
      node.connect(f); node = f;
    }
    node.connect(g).connect(off.destination);
    src.start(0);
    const buf = await off.startRendering();
    const suffix = bpEnable.checked ? `-bp${bpFreqInput.value}Hz` : "";
    downloadBlob(encodeWAV(buf), `${noiseType}-noise${suffix}-${dur}s.wav`);
  });

  // init slider posisi
  freqSlider.value = freqToSlider(440);
  bpFreqSlider.value = bpFreqToSlider(1000);
})();
