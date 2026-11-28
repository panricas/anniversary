(function () {
  const data = window.ANNIVERSARY || {};
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const pages = $('pages');

  const NUMERAL = '"Didot", "Bodoni 72", Georgia, "Songti SC", serif';
  const SERIF = '"Songti SC", "STSong", "Noto Serif SC", serif';
  const GLOW = ['#ffd9a0', '#f6b6a8', '#fff4e0', '#d9b47a', '#e9685c'];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

  // 按本地时区解析，避免 new Date('YYYY-MM-DD') 被当成 UTC 而差出几个小时
  const parseDate = (str) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(str || '');
    if (!m) return new Date();
    return new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  };

  const start = parseDate(data.startDate);
  const years = data.years || 5;
  const anniversary = new Date(start);
  anniversary.setFullYear(start.getFullYear() + years);

  // 把一行字拆成单字，配合 CSS 做逐字浮现
  const splitChars = (node, text) => {
    node.textContent = '';
    Array.from(text || '').forEach((ch, i) => {
      if (ch === '\n') {
        node.appendChild(el('br'));
        return;
      }
      const span = el('span', 'char', ch === ' ' ? ' ' : ch);
      span.style.setProperty('--i', i);
      node.appendChild(span);
    });
    return node;
  };

  // 心形曲线，t 取 0 ~ 2π，返回值大致落在 [-1, 1] 之间
  const heartPoint = (t) => ({
    x: Math.pow(Math.sin(t), 3),
    y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16
  });

  const traceHeart = (ctx, x, y, size, steps = 24) => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = heartPoint((i / steps) * Math.PI * 2);
      ctx[i ? 'lineTo' : 'moveTo'](x + p.x * size, y + p.y * size);
    }
    ctx.closePath();
  };

  // 回弹：放大时先冲过头一点再落回来
  const backOut = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

  // 时间线某个节点的相册；没单独配相册时，就用这个节点自己的那张照片
  const albumOf = (item) => {
    if (item.album && item.album.length) {
      return item.album.map((entry) => (typeof entry === 'string' ? { src: entry } : entry));
    }
    return item.photo ? [{ src: item.photo, title: item.title, text: item.text }] : [];
  };

  const localPoint = (e) => {
    const rect = app.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // 点按反馈：凡是能点的地方，手上震一下、耳朵里响一声、落点荡开一圈光
  //   tap 普通按钮  soft 点空白处  open 打开  launch 进相册  close 关闭/返回  star 点亮星星  heart 爱心  swipe 甩照片
  // 把「收起来/移走」推迟到这次点击处理完之后。iPhone 的触感要等点击走完才触发，
  // 被点的东西要是在处理途中就没了，那一下触感也跟着没了
  const later = (fn) => setTimeout(fn, 0);

  const feedback = (() => {
    // 安卓的震动时长（毫秒）。太短马达转不起来，手上等于没感觉，所以最短也给到十几毫秒
    const BUZZ = {
      tap: 22, soft: 14, close: 18, swipe: 16, star: 26,
      open: [22, 60, 34], launch: [16, 40, 16, 40, 48], heart: [26, 70, 40], arrive: [48, 50, 24]
    };

    // iPhone 的浏览器没有震动接口，系统只在「开关」控件被拨动时给一下触感（iOS 17.4 起）。
    // 办法是给每个能点的东西盖一层透明的 label，里面连着一个看不见的开关：
    // 手指点在 label 上，系统替我们拨了开关，触感就跟着来了。
    // 必须是手指真的点到 label 才算数，脚本代点从 iOS 26.5 起不再触发
    const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const makeSwitch = (className) => {
      const label = el('label', className);
      label.setAttribute('aria-hidden', 'true');
      const toggle = el('input');
      toggle.type = 'checkbox';
      toggle.setAttribute('switch', '');
      toggle.tabIndex = -1;
      // label 被点后浏览器会再替开关补一次点击，别让它冒上去被当成第二次点按
      toggle.addEventListener('click', (e) => e.stopPropagation());
      label.appendChild(toggle);
      return label;
    };
    // where：top 盖在宿主所有内容上面（默认）；under 垫在内容下面，只接空白处；
    // 传一个节点则紧跟在它后面，盖住它但让后面的兄弟留在上层
    const touchable = (host, where) => {
      if (!IOS || !host || host.querySelector(':scope > .haptic')) return;
      const label = makeSwitch(where === 'under' ? 'haptic is-under' : where ? 'haptic is-flat' : 'haptic');
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      // 让 label 的层级只在宿主内部比较，不会盖到宿主外面的东西
      host.style.isolation = 'isolate';
      if (where === 'under') host.prepend(label);
      else if (where) where.after(label);
      else host.appendChild(label);
    };
    const mount = () => {
      app.querySelectorAll('button, [data-tap]').forEach((node) => touchable(node));
      touchable($('deck'));
      touchable($('ending'));
      touchable($('viewer'), 'under');
      touchable($('cosmos'), $('cosmosCanvas'));
    };

    // 没盖 label 的地方（甩照片、点页面空白）在 iPhone 上只能让脚本代点，老系统有效，新系统没有
    const tick = makeSwitch('');
    tick.style.display = 'none';

    // loose：手指落点没有 label 接着
    const buzz = (kind, loose) => {
      try {
        if (navigator.vibrate) {
          // 新的一下会顶掉正在进行的长震
          humming = false;
          navigator.vibrate(BUZZ[kind] || BUZZ.tap);
          return;
        }
        if (!IOS || !loose) return;
        document.head.appendChild(tick);
        tick.click();
        document.head.removeChild(tick);
      } catch (err) {}
    };

    // 长震：一段时间里手上一直在抖（穿越时光那几秒的引擎）。网页管不了震动的轻重，
    // 只能靠「震多久、歇多久」来做：level(进度 0~1) 给出 0~1 的力度，越大震得越长、歇得越短，直到几乎连成一片
    let humming = false;
    let beat = 0;
    const hush = (kind) => {
      clearTimeout(beat);
      beat = 0;
      try { quiet(); } catch (err) {}
      if (kind) buzz(kind, true);
      else if (humming) navigator.vibrate(0);
      humming = false;
    };
    const rumble = (ms, level) => {
      hush();
      roar(ms, level);
      try {
        if (navigator.vibrate) {
          const pattern = [];
          for (let t = 0; t < ms;) {
            // 浏览器最多收 99 段，快满了就一口气震到底
            if (pattern.length >= 96) {
              pattern.push(Math.round(ms - t));
              break;
            }
            const k = level(t / ms);
            const on = 60 + 140 * k;
            const off = 30 - 22 * k;
            pattern.push(Math.round(on), Math.round(off));
            t += on + off;
          }
          humming = navigator.vibrate(pattern);
          return;
        }
        if (!IOS) return;
        // iPhone 没有长震，只能让脚本连着拨开关，一下一下地敲；iOS 26.5 起这招没用了，那就是没有
        const began = performance.now();
        const knock = () => {
          const p = (performance.now() - began) / ms;
          if (p >= 1) return;
          buzz('tap', true);
          beat = setTimeout(knock, 150 - 90 * level(p));
        };
        knock();
      } catch (err) {}
    };

    // 音效现场合成，不用另外带音频文件。
    // 走的是八音盒那一路：一颗颗叮咚的小音、竖琴似的拨弦、弦乐似的暖垫，都泡在长长的回响里。
    // 所有的音都取自同一个五声音阶，连着点、叠着响都是和谐的；手机喇叭放不出低音，所以最低只到两百赫兹上下
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    // 回响的入口
    let hall = null;
    // 一段白噪声：扫过去的那阵风从它来
    let dust = null;
    const bend = (fn) => Float32Array.from({ length: 1025 }, (_, i) => fn(i / 512 - 1));
    // 出口的软限幅，输入按 ±3 算：小声原样过，叠得太响的地方压圆，不至于爆音
    const CEILING = bend((x) => {
      const u = Math.abs(3 * x);
      return Math.sign(x) * (u <= 0.5 ? u : 0.5 + 0.45 * Math.tanh((u - 0.5) / 0.45));
    });
    // wet 是送去回响的量
    const emit = (node, wet) => {
      node.connect(master);
      if (!wet) return;
      const send = ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(hall);
    };
    const noise = (t, length) => {
      const src = ctx.createBufferSource();
      src.buffer = dust;
      src.loop = true;
      src.start(t, Math.random() * 1.5);
      src.stop(t + length + 0.05);
      return src;
    };
    // 降 A 大调五声音阶（和背景音乐同一个调，叠在它上面不打架），从中央 C 下面的降 A 数起，每五个升一个八度
    const SCALE = [207.65, 233.08, 261.63, 311.13, 349.23];
    const tone = (step) => SCALE[step % 5] * Math.pow(2, Math.floor(step / 5));
    // 八音盒的一颗音：敲一下就慢慢散掉，上面带一个高八度的泛音和一点不成整数倍的「叮」
    const chime = (step, delay, length, peak, wet) => {
      const t = ctx.currentTime + delay;
      [[1, 1, 1], [2, 0.28, 0.6], [4.07, 0.1, 0.22]].forEach(([ratio, share, span]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = tone(step) * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak * share, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + length * span);
        osc.connect(gain);
        emit(gain, wet);
        osc.start(t);
        osc.stop(t + length * span + 0.05);
      });
    };
    // 竖琴似的一拨：两根略微错开的弦，拨下去是亮的，越响越暗
    const pluck = (step, delay, length, peak, wet) => {
      const t = ctx.currentTime + delay;
      const freq = tone(step);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * 7, 7000), t);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.6, t + length * 0.6);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      [0.998, 1.003].forEach((ratio) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq * ratio;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + length + 0.05);
      });
      filter.connect(gain);
      emit(gain, wet);
    };
    // 弦乐似的一层暖垫：一个和弦慢慢浮上来，再慢慢退下去
    const pad = (steps, delay, length, peak, wet) => {
      const t = ctx.currentTime + delay;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.exponentialRampToValueAtTime(2600, t + length * 0.4);
      filter.frequency.exponentialRampToValueAtTime(1100, t + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + length * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      steps.forEach((step) => [0.996, 1.004].forEach((ratio) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = tone(step) * ratio;
        const part = ctx.createGain();
        part.gain.value = 1 / steps.length;
        osc.connect(part);
        part.connect(filter);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }));
      filter.connect(gain);
      emit(gain, wet);
    };
    // 一阵风扫过去：音高从 from 滑到 to，crest 是最响的那一刻落在全程的哪里
    const sweep = (delay, length, peak, from, to, crest, wet) => {
      const t = ctx.currentTime + delay;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.setValueAtTime(from, t);
      band.frequency.exponentialRampToValueAtTime(to, t + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + length * crest);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      noise(t, length).connect(band);
      band.connect(gain);
      emit(gain, wet);
    };
    // 一串拨弦挨个响过去
    const run = (steps, delay, gap, length, peak, wet) => steps.forEach((step, i) => pluck(step, delay + i * gap, length, peak, wet));
    // 普通的点按不是每次同一个音，而是顺着一小段旋律往下走，连着点就像八音盒在转
    const TUNE = [8, 10, 9, 7, 8, 12, 10, 9];
    let bar = 0;
    const SOUND = {
      tap: () => {
        const step = TUNE[bar++ % TUNE.length];
        chime(step, 0, 1.2, 0.4, 0.5);
        pluck(step - 5, 0, 0.7, 0.14, 0.4);
      },
      soft: () => chime([13, 14, 15, 17][Math.floor(Math.random() * 4)], 0, 0.9, 0.14, 0.7),
      swipe: () => { sweep(0, 0.3, 0.08, 2400, 900, 0.3, 0.3); run([5, 7, 8], 0, 0.045, 0.7, 0.24, 0.4); },
      close: () => { chime(8, 0, 0.9, 0.3, 0.5); chime(5, 0.11, 1.3, 0.3, 0.6); pluck(0, 0.11, 0.9, 0.14, 0.4); },
      open: () => {
        run([0, 3, 5, 7, 8], 0, 0.07, 1.2, 0.3, 0.5);
        pad([0, 3, 7], 0.2, 1.8, 0.2, 0.5);
        chime(15, 0.38, 1.6, 0.22, 0.9);
      },
      star: () => { pluck(5, 0, 1, 0.22, 0.6); chime(15, 0.02, 1.6, 0.28, 0.9); chime(18, 0.1, 1.8, 0.14, 0.9); },
      // 两拨和弦像两下心跳，第二下带出一层暖垫，上面几颗音慢慢往高处飘
      heart: () => {
        run([0, 3], 0, 0, 0.7, 0.3, 0.4);
        run([2, 5], 0.26, 0, 1.1, 0.3, 0.5);
        pad([0, 3, 7], 0.26, 2.6, 0.24, 0.6);
        [10, 12, 13, 15].forEach((step, i) => chime(step, 0.56 + i * 0.17, 1.7, 0.2, 0.9));
      },
      // 竖琴从低到高刮上去，托起一层亮起来的暖垫，接着就是穿越的风声
      launch: () => {
        run([0, 2, 3, 5, 7, 8, 10, 12], 0, 0.06, 1, 0.26, 0.5);
        sweep(0.1, 0.6, 0.1, 600, 3600, 0.9, 0.4);
        pad([0, 3, 7, 8], 0.3, 2.4, 0.28, 0.5);
        chime(15, 0.52, 2, 0.3, 0.9);
        chime(18, 0.62, 2.2, 0.16, 0.9);
      }
    };
    const ready = () => {
      if (!AudioCtx) return false;
      if (!ctx) {
        ctx = new AudioCtx();
        const pre = ctx.createGain();
        pre.gain.value = 1 / 3;
        const ceiling = ctx.createWaveShaper();
        ceiling.curve = CEILING;
        ceiling.oversample = '2x';
        pre.connect(ceiling);
        ceiling.connect(ctx.destination);
        master = ctx.createGain();
        master.gain.value = 0.7;
        master.connect(pre);

        dust = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const grains = dust.getChannelData(0);
        for (let i = 0; i < grains.length; i++) grains[i] = Math.random() * 2 - 1;

        // 回响：一段两秒多、越来越弱的噪声，当作大厅的脉冲响应
        const tail = ctx.createBuffer(2, Math.round(ctx.sampleRate * 2.4), ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const samples = tail.getChannelData(ch);
          for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2.6);
        }
        const room = ctx.createConvolver();
        room.buffer = tail;
        const dark = ctx.createBiquadFilter();
        dark.type = 'lowpass';
        dark.frequency.value = 5200;
        hall = ctx.createGain();
        hall.gain.value = 0.5;
        hall.connect(room);
        room.connect(dark);
        dark.connect(master);
      }
      if (ctx.state !== 'running') ctx.resume();
      return true;
    };
    const sound = (kind) => {
      try {
        if (ready()) (SOUND[kind] || SOUND.tap)();
      } catch (err) {}
    };

    // 穿越时的风声：一声拉长的「咻——」，和长震一起响，跟着同一条力度曲线走，越快越尖越响
    let engine = null;
    const quiet = () => {
      if (!engine) return;
      const { out, sources, until } = engine;
      engine = null;
      const now = ctx.currentTime;
      if (now >= until) return;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.12);
      sources.forEach((node) => node.stop(now + 0.15));
    };
    const roar = (ms, level) => {
      try {
        if (!ready()) return;
        quiet();
        const t = ctx.currentTime;
        const span = ms / 1000;
        const curve = (fn) => Float32Array.from({ length: 48 }, (_, i) => fn(level(i / 47)));
        const follow = (param, fn) => param.setValueCurveAtTime(curve(fn), t, span);

        const out = ctx.createGain();
        out.gain.setValueAtTime(0, t);
        out.gain.linearRampToValueAtTime(1, t + 0.3);
        out.gain.setValueAtTime(1, t + span - 0.35);
        out.gain.linearRampToValueAtTime(0, t + span);
        out.connect(master);

        // 白噪声过带通就是风声；一宽一窄两层，窄的那层高一截，听起来才是「咻」而不是「沙」
        const air = ctx.createBufferSource();
        air.buffer = dust;
        air.loop = true;
        const layer = (q, pitch, loud) => {
          const band = ctx.createBiquadFilter();
          band.type = 'bandpass';
          band.Q.value = q;
          follow(band.frequency, pitch);
          const gain = ctx.createGain();
          follow(gain.gain, loud);
          air.connect(band);
          band.connect(gain);
          gain.connect(out);
        };
        layer(1.6, (k) => 700 + 2300 * k, (k) => 0.17 + 0.26 * k);
        layer(7, (k) => 1500 + 4300 * k, (k) => 0.12 + 0.36 * k);

        const sources = [air];
        sources.forEach((node) => {
          node.start(t);
          node.stop(t + span + 0.05);
        });
        engine = { out, sources, until: t + span };
      } catch (err) {}
    };

    // 落点的一圈光和溅出的火星；点空白处已经有爱心或烟花了，不再叠
    const ripple = (point) => {
      const ring = el('i', $('cosmos').hidden ? 'tap-ring' : 'tap-ring is-cool');
      ring.style.left = `${point.x}px`;
      ring.style.top = `${point.y}px`;
      const turn = rand(0, 60);
      for (let i = 0; i < 6; i++) {
        const spark = el('b');
        spark.style.setProperty('--a', `${Math.round(turn + i * 60 + rand(-14, 14))}deg`);
        spark.style.setProperty('--d', `${Math.round(-rand(34, 58))}px`);
        ring.appendChild(spark);
      }
      app.appendChild(ring);
      setTimeout(() => ring.remove(), 650);
    };

    const fire = (kind, point, loose) => {
      buzz(kind, loose);
      sound(kind);
      if (point && kind !== 'soft' && !reduceMotion) ripple(point);
    };

    // 按下去缩一点，松手弹回来。用独立的 scale 属性，不和按钮自己的 transform 动画打架
    const PRESSABLE = 'button, .moment-card[data-tap]';
    let pressed = null;
    const lift = () => {
      if (!pressed) return;
      const { node, anim } = pressed;
      pressed = null;
      anim.cancel();
      node.animate({ scale: ['0.92', '1.06', '1'] }, { duration: 340, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' });
    };
    if (!reduceMotion && app.animate) {
      app.addEventListener('pointerdown', (e) => {
        const node = e.target.closest(PRESSABLE);
        if (!node) return;
        lift();
        pressed = { node, anim: node.animate({ scale: ['1', '0.92'] }, { duration: 110, easing: 'ease-out', fill: 'forwards' }) };
      });
      window.addEventListener('pointerup', lift);
      window.addEventListener('pointercancel', lift);
    }

    // 所有按钮统一在这里响应；放在捕获阶段，按钮自己拦了冒泡也照样有反馈。
    // 照片堆和星空里的星星是手势判定出来的点按，由它们自己调 fire
    app.addEventListener('click', (e) => {
      // 开关被补点的那一下不是用户的点按
      if (e.target.matches('.haptic input')) return;
      if (e.target.closest('#deck')) return;
      const node = e.target.closest('button, [data-tap]');
      if (!node && !e.target.closest('.pages')) return;
      let point = localPoint(e);
      if (node && !e.detail) {
        // 键盘触发的点击没有坐标，落在按钮中心
        const rect = node.getBoundingClientRect();
        point = localPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
      }
      fire(node ? node.dataset.tap || 'tap' : 'soft', point, !e.target.closest('.haptic'));
    }, true);

    return { fire, mount, rumble, hush };
  })();

  const countUp = (node, target, duration) => {
    if (reduceMotion || !target) {
      node.textContent = target ? target.toLocaleString('en-US') : '?';
      node.countToken = null;
      return;
    }
    let begin = 0;
    const token = (node.countToken = {});
    const step = (now) => {
      if (node.countToken !== token) return;
      if (!begin) begin = now;
      const p = Math.min(1, (now - begin) / (duration || 1600));
      const eased = 1 - Math.pow(1 - p, 4);
      node.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
      else node.countToken = null;
    };
    requestAnimationFrame(step);
  };

  // 光点贴图：白芯加一圈带颜色的光晕，按色相缓存。烟花的火星和星空里的星星都用它画，边缘才是虚的
  const glows = {};
  const glowSprite = (hue) => {
    const key = (((Math.round(hue / 12) * 12) % 360) + 360) % 360;
    if (!glows[key]) {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.16, `hsla(${key}, 100%, 84%, 0.95)`);
      grad.addColorStop(0.42, `hsla(${key}, 100%, 62%, 0.3)`);
      grad.addColorStop(1, `hsla(${key}, 100%, 50%, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      glows[key] = sprite;
    }
    return glows[key];
  };

  // 粒子层：飘浮的光尘、点击冒出的小爱心、烟花
  const fx = (() => {
    const canvas = $('fx');
    const ctx = canvas.getContext('2d');
    const HEART_COLORS = ['#e0695c', '#e0695c', '#ef8a7e', '#f3a0a8', '#f6b6a8'];
    const SHELLS = ['peony', 'peony', 'peony', 'crackle', 'willow'];
    let w = 0;
    let h = 0;
    let last = 0;
    let dust = [];
    let rockets = [];
    let stars = [];
    let embers = [];
    let flashes = [];
    let hearts = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = app.clientWidth;
      h = app.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dust = Array.from({ length: reduceMotion ? 0 : 34 }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        r: rand(0.6, 2.2),
        speed: rand(0.08, 0.35),
        phase: rand(0, Math.PI * 2),
        color: pick(GLOW)
      }));
    };

    // 爱心贴图：带柔光和一点高光，飘的时候可以随意旋转缩放
    const heartSprites = {};
    const heartSprite = (color) => {
      if (!heartSprites[color]) {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 128;
        const g = sprite.getContext('2d');
        g.shadowColor = color;
        g.shadowBlur = 16;
        g.fillStyle = color;
        traceHeart(g, 64, 58.5, 34, 64);
        g.fill();
        g.shadowBlur = 0;
        const shine = g.createRadialGradient(50, 40, 2, 56, 50, 40);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = shine;
        g.fill();
        heartSprites[color] = sprite;
      }
      return heartSprites[color];
    };

    const addStar = (x, y, vx, vy, hue, extra) => {
      stars.push(Object.assign({
        x, y, vx, vy, hue,
        life: 1,
        decay: rand(0.011, 0.017),
        size: rand(1.1, 2),
        gravity: 0.045,
        drag: 0.955,
        shed: 0.3,
        tail: 6,
        trail: [],
        color: `hsl(${hue}, 100%, ${Math.round(rand(66, 80))}%)`
      }, extra));
    };

    const addEmber = (x, y, vx, vy, hue, decay) => {
      if (embers.length > 1500) return;
      embers.push({
        x, y, vx, vy,
        life: 1,
        decay: decay || rand(0.03, 0.07),
        size: rand(0.8, 1.7),
        color: `hsl(${hue}, 100%, 82%)`
      });
    };

    const explode = (x, y, hue, kind) => {
      flashes.push({ x, y, hue, life: 1, r: 120 });

      if (kind === 'heart') {
        // 外层亮、内层淡的两圈心形，速度带一点抖动，轮廓才不像描出来的线
        for (let i = 0; i < 150; i++) {
          const inner = i % 3 === 0;
          const p = heartPoint(rand(0, Math.PI * 2));
          const speed = (inner ? 3 : 5.3) * rand(0.93, 1.07);
          addStar(x, y, p.x * speed, (p.y - 0.16) * speed, hue + (inner ? 22 : 0) + rand(-8, 8), {
            gravity: 0.02,
            decay: rand(0.009, 0.013),
            size: inner ? rand(0.9, 1.4) : rand(1.2, 2.1)
          });
        }
        return;
      }

      const willow = kind === 'willow';
      const power = willow ? rand(3, 3.9) : rand(4.8, 7);
      const count = willow ? 64 : 84;
      for (let i = 0; i < count; i++) {
        // 在球面上均匀取方向再压到平面：边缘密、中间疏，和真烟花的球壳一样
        const angle = rand(0, Math.PI * 2);
        const z = rand(-1, 1);
        const speed = power * Math.sqrt(1 - z * z) * rand(0.9, 1.08);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        if (willow) {
          // 柳：金色，飞得慢、拖得长、往下垂
          addStar(x, y, vx, vy, rand(32, 46), {
            drag: 0.975,
            gravity: 0.06,
            decay: rand(0.006, 0.009),
            size: rand(0.9, 1.5),
            shed: 0.5,
            tail: 16
          });
        } else {
          addStar(x, y, vx, vy, hue + rand(-14, 14), { crackle: kind === 'crackle' });
        }
      }
      if (willow) return;

      // 芯：中间一小团偏色的火星
      const coreHue = hue + rand(140, 200);
      for (let i = 0; i < 26; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = power * rand(0.12, 0.45);
        addStar(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, coreHue, {
          size: rand(0.9, 1.5),
          decay: rand(0.016, 0.024)
        });
      }
    };

    // 从底部升起一枚烟花，到 (x, y) 炸开
    const firework = (x, y, heart) => {
      if (reduceMotion) return;
      rockets.push({
        x,
        y: h + 10,
        ty: y,
        hue: heart ? 350 : rand(0, 360),
        kind: heart ? 'heart' : pick(SHELLS),
        phase: rand(0, Math.PI * 2)
      });
    };

    const addHeart = (x, y, size, extra) => {
      hearts.push(Object.assign({
        x, y, size,
        vx: 0,
        vy: 0,
        lift: -1,
        age: 0,
        ttl: 1200,
        pop: 380,
        alpha: 1,
        amp: rand(6, 22),
        freq: rand(0.0014, 0.0028),
        phase: rand(0, Math.PI * 2),
        tilt: rand(-0.2, 0.2),
        lean: rand(0.12, 0.32),
        sprite: heartSprite(pick(HEART_COLORS))
      }, extra));
    };

    // 点击位置冒出几颗小爱心
    const burst = (x, y) => {
      if (reduceMotion) return;
      for (let i = 0; i < 7; i++) {
        addHeart(x, y, rand(4, 8), {
          vx: rand(-2.6, 2.6),
          vy: rand(-4, -1.2),
          lift: rand(-1.3, -0.6),
          ttl: rand(900, 1500),
          pop: 220,
          amp: rand(2, 6),
          freq: rand(0.003, 0.005)
        });
      }
    };

    // 一大片爱心从底部飘上来：大的近、快、亮，小的远、慢、淡，各自左右摇着往上
    const rain = () => {
      if (reduceMotion) return;
      for (let i = 0; i < 36; i++) {
        const size = rand(6, 17);
        const near = (size - 6) / 11;
        const lift = -(1.5 + 2.1 * near) * rand(0.85, 1.15);
        addHeart(rand(0, w), h + size * 2 + rand(0, 30), size, {
          vy: lift * 1.8,
          lift,
          age: -rand(0, 1600),
          ttl: rand(3600, 5200),
          alpha: 0.62 + 0.38 * near
        });
      }
    };

    const frame = (now) => {
      const step = Math.min(3, (now - last) / 16.67) || 1;
      last = now;
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const d of dust) {
        d.y -= d.speed * step;
        d.x += Math.sin(now / 1800 + d.phase) * 0.15 * step;
        if (d.y < -4) {
          d.y = h + 4;
          d.x = rand(0, w);
        }
        ctx.globalAlpha = 0.12 + 0.38 * (0.5 + 0.5 * Math.sin(now / 900 + d.phase));
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const f of flashes) {
        const r = f.r * (1.3 - 0.5 * f.life);
        ctx.globalAlpha = f.life * f.life * 0.5;
        ctx.drawImage(glowSprite(f.hue), f.x - r, f.y - r, r * 2, r * 2);
        f.life -= 0.07 * step;
      }
      flashes = flashes.filter((f) => f.life > 0);

      for (const r of rockets) {
        r.y += ((r.ty - r.y) * 0.09 - 2.5) * step;
        r.x += Math.sin(now / 70 + r.phase) * 0.45 * step;
        // 升空时一路往下撒火星
        addEmber(r.x + rand(-1, 1), r.y + rand(0, 8), rand(-0.35, 0.35), rand(0.4, 1.8), 38);
        addEmber(r.x + rand(-1, 1), r.y + rand(0, 8), rand(-0.35, 0.35), rand(0.4, 1.8), 38);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(glowSprite(38), r.x - 6, r.y - 6, 12, 12);
        if (r.y <= r.ty + 4) {
          r.done = true;
          explode(r.x, r.y, r.hue, r.kind);
        }
      }
      rockets = rockets.filter((r) => !r.done);

      for (const s of stars) {
        const drag = Math.pow(s.drag, step);
        s.vx *= drag;
        s.vy = s.vy * drag + s.gravity * step;
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.life -= s.decay * step;
        if (s.life <= 0) {
          // 爆裂型：熄灭的一瞬间再炸出几点白光
          if (s.crackle) {
            for (let i = 0; i < 4; i++) addEmber(s.x, s.y, rand(-1.8, 1.8), rand(-1.8, 1.8), 48, rand(0.05, 0.1));
            flashes.push({ x: s.x, y: s.y, hue: 48, life: 0.7, r: 9 });
          }
          continue;
        }
        s.trail.push(s.x, s.y);
        if (s.trail.length > s.tail * 2) s.trail.splice(0, 2);
        // 一路掉火星，这是毛边的来源
        if (Math.random() < s.shed * step) {
          addEmber(s.x, s.y, s.vx * 0.25 + rand(-0.4, 0.4), s.vy * 0.25 + rand(-0.4, 0.4), s.hue);
        }

        let alpha = Math.min(1, s.life * 2.2);
        // 快熄灭时忽明忽暗
        if (s.life < 0.35 && Math.random() < 0.4) alpha *= 0.3;

        // 拖尾：越靠后越细越淡
        const n = s.trail.length / 2;
        ctx.strokeStyle = s.color;
        for (let i = 1; i < n; i++) {
          const k = i / (n - 1);
          ctx.globalAlpha = alpha * k * k * 0.6;
          ctx.lineWidth = s.size * (0.3 + 0.7 * k);
          ctx.beginPath();
          ctx.moveTo(s.trail[i * 2 - 2], s.trail[i * 2 - 1]);
          ctx.lineTo(s.trail[i * 2], s.trail[i * 2 + 1]);
          ctx.stroke();
        }
        const r = s.size * 3.4;
        ctx.globalAlpha = alpha;
        ctx.drawImage(glowSprite(s.hue), s.x - r, s.y - r, r * 2, r * 2);
      }
      stars = stars.filter((s) => s.life > 0);

      for (const e of embers) {
        const drag = Math.pow(0.96, step);
        e.vx *= drag;
        e.vy = e.vy * drag + 0.035 * step;
        e.x += e.vx * step;
        e.y += e.vy * step;
        e.life -= e.decay * step;
        if (e.life <= 0) continue;
        ctx.globalAlpha = e.life * (Math.random() < 0.25 ? 0.3 : 1);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
      }
      embers = embers.filter((e) => e.life > 0);

      ctx.globalCompositeOperation = 'source-over';
      const wind = Math.sin(now / 2600) * 0.25;
      for (const p of hearts) {
        p.age += step * 16.67;
        if (p.age < 0 || p.age >= p.ttl) continue;
        const t = p.age / p.ttl;
        // 先被甩出去，再慢慢稳到各自的上浮速度
        p.vx *= Math.pow(0.95, step);
        p.vy += (p.lift - p.vy) * 0.05 * step;
        p.x += (p.vx + wind) * step;
        p.y += p.vy * step;
        const swing = p.age * p.freq + p.phase;
        const beat = 1 + 0.07 * Math.sin(p.age * 0.009 + p.phase);
        const shrink = t > 0.75 ? 1 - (t - 0.75) * 0.8 : 1;
        const side = p.size * 3.76 * backOut(Math.min(1, p.age / p.pop)) * beat * shrink;
        ctx.globalAlpha = p.alpha * Math.min(1, (1 - t) / 0.28);
        ctx.save();
        // 摆到哪边就往哪边歪
        ctx.translate(p.x + Math.sin(swing) * p.amp, p.y);
        ctx.rotate(p.tilt + Math.cos(swing) * p.lean);
        ctx.drawImage(p.sprite, -side / 2, -side / 2, side, side);
        ctx.restore();
      }
      hearts = hearts.filter((p) => p.age < p.ttl);

      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);

    return { firework, burst, rain, size: () => ({ w, h }) };
  })();

  // 音乐：两个播放器。
  // 背景音乐（data.music）一进页面就放，整页都是它；进星空相册时停住，出来从停下的地方接着放，右上角的 ♪ 按钮管的是它。
  // 时间线每个节点可以各带一首歌（song）：飞船到站时响起，点「返回」离开星空就停
  const music = (() => {
    const button = $('music');
    const label = $('cosmosSong');
    const player = () => {
      const el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      return el;
    };
    const bgm = player();
    const audio = player();
    let src = '';
    // 她自己按 ♪ 把背景音乐停了：之后不再自动接上，等她再按
    let off = false;
    // 人在星空相册里，背景音乐让位
    let away = false;
    // 已经在点按里静音起播，等到站再出声
    let queued = false;
    // 这一年的歌到站后应该是响着的
    let singing = false;
    let held = false;

    const sync = () => button.classList.toggle('is-playing', !bgm.paused);
    bgm.addEventListener('play', sync);
    bgm.addEventListener('pause', sync);
    // 文件不在或者放不了，就不留一个点了没反应的按钮
    bgm.addEventListener('error', () => {
      button.hidden = true;
    });
    audio.addEventListener('error', () => {
      src = '';
      queued = false;
      singing = false;
      audio.muted = false;
      label.textContent = '';
      label.hidden = true;
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      off = !bgm.paused;
      if (off) bgm.pause();
      else bgm.play().catch(() => {});
    });

    // 音量的渐变。iPhone 不让网页调音量，在它上面渐强等于直接开始、渐弱等于稍等一下就停
    const timers = new Map();
    const settle = (el) => {
      clearInterval(timers.get(el));
      el.volume = 1;
    };
    const ramp = (el, from, step, every) => {
      clearInterval(timers.get(el));
      let v = from;
      el.volume = v;
      timers.set(el, setInterval(() => {
        v += step;
        if (v > 0 && v < 1) {
          el.volume = v;
          return;
        }
        clearInterval(timers.get(el));
        if (step < 0) el.pause();
        el.volume = 1;
      }, every));
    };
    const load = (next) => {
      settle(audio);
      audio.muted = false;
      src = next;
      audio.src = next;
    };

    // 背景音乐该响的时候让它响：没被她关掉，人也不在相册里
    const resume = () => {
      if (!data.music || off || away) return;
      settle(bgm);
      if (bgm.paused) bgm.play().catch(() => {});
    };
    // 每一下触碰都顺手把该响却没响的接上：浏览器不许网页没被碰过就出声，
    // 切出去再回来时也可能不让自己接着放，都靠这里补上
    const wake = (e) => {
      if (e && e.target.closest && e.target.closest('#music')) return;
      resume();
      if (singing && !held && audio.paused) audio.play().catch(() => {});
    };
    const start = () => {
      if (!data.music) return;
      bgm.src = data.music;
      button.hidden = false;
      resume();
      ['touchend', 'click', 'keydown'].forEach((type) => document.addEventListener(type, wake, true));
      // 微信里可以借它的桥，不用等她碰屏幕
      if (window.WeixinJSBridge) window.WeixinJSBridge.invoke('getNetworkType', {}, () => wake());
      else document.addEventListener('WeixinJSBridgeReady', () => wake(), { once: true });
    };
    // 切到别的应用或者锁屏就先停，回来接着放
    let parked = [];
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        parked = [bgm, audio].filter((el) => !el.paused);
        parked.forEach((el) => el.pause());
        return;
      }
      parked.splice(0).forEach((el) => el.play().catch(() => {}));
    });

    return {
      play: start,
      // 进相册的那一下点按里调用：背景音乐收声停住。这一年有歌的话，手机只准在点按里开始播放，
      // 而到站是几秒以后的事，所以先静音放起来，到站时拨回开头、打开声音
      cue(song, name) {
        away = true;
        if (!bgm.paused) ramp(bgm, bgm.volume, -0.2, 40);
        label.textContent = song && name ? `♪ ${name}` : '';
        label.hidden = true;
        // 这一年没配歌：星空里是安静的
        if (!song) return;
        if (song === src) {
          settle(audio);
          audio.muted = false;
        } else load(song);
        queued = true;
        audio.muted = true;
        audio.play().catch(() => {});
      },
      drop() {
        label.hidden = !label.textContent;
        if (!queued) return;
        queued = false;
        singing = true;
        try { audio.currentTime = 0; } catch (err) {}
        audio.muted = false;
        ramp(audio, 0, 0.05, 80);
      },
      // 点「返回」离开星空：这一年的歌收声停掉，背景音乐从刚才停下的地方接着放
      stop() {
        const silent = queued;
        queued = false;
        singing = false;
        held = false;
        label.hidden = true;
        if (audio.paused) settle(audio);
        else if (silent) {
          settle(audio);
          audio.pause();
          audio.muted = false;
        } else ramp(audio, audio.volume, -0.2, 40);
        away = false;
        resume();
      },
      // hold / release：星空相册里播视频时先停一下，看完再接着放
      hold() {
        if (audio.paused) return;
        held = true;
        audio.pause();
      },
      release() {
        if (!held) return;
        held = false;
        audio.play().catch(() => {});
      }
    };
  })();

  // 开场：粒子依次聚成爱心、数字、「周年」，轻触后炸开进入正文
  const intro = (onStart) => {
    const root = $('intro');
    const canvas = $('introCanvas');
    const ctx = canvas.getContext('2d');
    const COUNT = 1100;
    let w = 0;
    let h = 0;
    let particles = [];
    let free = false;
    let running = true;
    let shape = -1;
    let timer = 0;

    if (data.her) {
      $('introTo').textContent = '给';
      $('introTo').appendChild(el('span', 'gothic', data.her));
    }

    const finish = () => {
      running = false;
      clearTimeout(timer);
      root.remove();
    };

    if (reduceMotion) {
      root.addEventListener('click', () => { later(finish); onStart(); }, { once: true });
      return;
    }

    const shapes = [
      (c) => { traceHeart(c, w / 2, h * 0.43, w * 0.3); c.fill(); },
      (c) => {
        c.font = `italic ${Math.min(w * 0.8, h * 0.5)}px ${NUMERAL}`;
        c.fillText(String(years), w / 2, h * 0.43);
      },
      (c) => {
        c.font = `600 ${w * 0.3}px ${SERIF}`;
        c.fillText('周年', w / 2, h * 0.43);
      }
    ];

    // 把图形画到离屏画布上，按固定间隔取出有颜色的点作为粒子的落点
    const sample = (draw) => {
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const c = off.getContext('2d');
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      draw(c);
      const pixels = c.getImageData(0, 0, w, h).data;
      const points = [];
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          if (pixels[(y * w + x) * 4 + 3] > 128) points.push([x, y]);
        }
      }
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
      return points;
    };

    const morph = () => {
      shape = (shape + 1) % shapes.length;
      const points = sample(shapes[shape]);
      if (points.length) {
        particles.forEach((p, i) => {
          const target = points[i % points.length];
          p.tx = target[0] + rand(-1, 1);
          p.ty = target[1] + rand(-1, 1);
        });
      }
      timer = setTimeout(morph, 3000);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = app.clientWidth;
      h = app.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const tick = (now) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        if (free) {
          p.vx *= 0.985;
          p.vy *= 0.985;
        } else {
          p.vx = (p.vx + (p.tx - p.x) * p.k) * 0.88;
          p.vy = (p.vy + (p.ty - p.y) * p.k) * 0.88;
        }
        p.x += p.vx;
        p.y += p.vy;
        const twinkle = 0.5 + 0.5 * Math.sin(now / 420 + p.phase);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.1 * twinkle;
        ctx.fillRect(p.x - p.size * 1.5, p.y - p.size * 1.5, p.size * 4, p.size * 4);
        ctx.globalAlpha = 0.45 + 0.55 * twinkle;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      requestAnimationFrame(tick);
    };

    resize();
    particles = Array.from({ length: COUNT }, () => {
      const x = rand(0, w);
      const y = rand(0, h);
      return {
        x, y, tx: x, ty: y, vx: 0, vy: 0,
        k: rand(0.008, 0.03),
        size: rand(1, 2.4),
        phase: rand(0, Math.PI * 2),
        color: pick(GLOW)
      };
    });
    timer = setTimeout(morph, 700);
    requestAnimationFrame(tick);

    root.addEventListener('click', () => {
      clearTimeout(timer);
      free = true;
      particles.forEach((p) => {
        const angle = Math.atan2(p.y - h * 0.43, p.x - w / 2) + rand(-0.3, 0.3);
        const speed = rand(5, 22);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      });
      root.classList.add('is-leaving');
      setTimeout(finish, 1200);
      onStart();
    }, { once: true });
  };

  // 星空相册：从时间线的某一年进入。先坐飞船穿过时光隧道倒回那一年，
  // 到了以后人悬在这一年的星系上方斜着往下看，照片是浮在星系盘上的一颗颗亮星，拖动绕着星系转，轻点查看
  const cosmos = (() => {
    const root = $('cosmos');
    const canvas = $('cosmosCanvas');
    const ctx = canvas.getContext('2d');
    const viewer = $('viewer');
    const card = $('viewerCard');
    const cockpit = $('cockpit');
    const WARP_MS = 5400;
    const RAD = Math.PI / 180;
    const VIDEO = /\.(mp4|mov|m4v|webm)(\?.*)?$/i;
    const LABEL = '11px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
    // 镜头绕着这一年的那一幕转：yaw 是绕到哪一边，pitch 是俯视的角度，都是弧度
    const cam = { yaw: 0, pitch: 0.62, vyaw: 0, vpitch: 0, target: null };
    let w = 0;
    let h = 0;
    let dpr = 1;
    let focal = 0;
    let eyeline = 0;
    let mode = 'off'; // off | warp | sky
    let looping = false;
    let last = 0;
    let began = 0;
    let entry = null;
    let current = -1;
    let drag = null;
    let streaks = [];
    let rings = [];
    let ringClock = 0;
    let clouds = [];
    let flybys = [];
    let passed = 0;
    let spin = 0;
    let turn = 0;
    let warpMs = WARP_MS;
    let meteors = [];
    let nextMeteor = 0;

    // 由序号算出的固定「随机数」，同一颗星每次进来都在同一个位置
    const noise = (i, k) => {
      const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // 由种子生出的一串固定随机数：同一年的星系每次进来都长一个样
    const seeded = (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // 色相、饱和度、亮度 → 0–1 的红绿蓝
    const tint = (hue, s, l) => {
      const a = s * Math.min(l, 1 - l);
      const part = (n) => {
        const k = (n + hue / 30 + 12) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      return [part(0), part(8), part(4)];
    };

    // 一团没有硬边的雾，星系的底图就是拿它一团团叠出来的；hue 传 -1 是黑的，用来压出尘埃带
    const puffs = {};
    const puff = (hue, s, l) => {
      const key = `${hue},${s},${l}`;
      if (!puffs[key]) {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const g = sprite.getContext('2d');
        const color = hue < 0 ? '0, 0, 0' : tint(hue, s, l).map((v) => Math.round(v * 255)).join(', ');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        [[0, 1], [0.25, 0.6], [0.55, 0.18], [1, 0]].forEach(([at, a]) => grad.addColorStop(at, `rgba(${color}, ${a})`));
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        puffs[key] = sprite;
      }
      return puffs[key];
    };

    // 穿越时一颗星被拉成的光迹，头在右边：白热的细芯往后越拖越细越暗，外面裹一层带颜色的虚光，
    // 再甩出几缕断断续续的细丝，尾巴末端碎成一截一截。逐像素算出来的，所以边是毛的
    const TRAIL_HUES = [198, 214, 230, 248, 266, 286];
    const trails = [];
    const trail = (index) => {
      if (!trails[index]) {
        const W = 384;
        const H = 40;
        const sprite = document.createElement('canvas');
        sprite.width = W;
        sprite.height = H;
        const g = sprite.getContext('2d');
        const image = g.createImageData(W, H);
        const [r, gr, b] = tint(TRAIL_HUES[index % TRAIL_HUES.length], 1, 0.7);
        // 一维的平滑噪声：隔一段取个随机数，中间用余弦接起来
        const noise = (knots) => {
          const v = Array.from({ length: knots + 2 }, () => Math.random());
          return (u) => {
            const at = u * knots;
            const i = Math.floor(at);
            const f = (1 - Math.cos((at - i) * Math.PI)) / 2;
            return v[i] * (1 - f) + v[i + 1] * f;
          };
        };
        const wobble = noise(9);
        const grain = noise(70);
        const crumble = noise(26);
        const wisps = Array.from({ length: 6 }, (_, i) => ({
          side: (i % 2 ? 1 : -1) * rand(0.18, 0.62),
          gap: noise(Math.round(rand(8, 18))),
          cut: rand(0.38, 0.62),
          a: rand(0.3, 0.6)
        }));
        for (let x = 0; x < W; x++) {
          const u = x / (W - 1);
          // 沿长度的明暗：尾巴淡出，头上最后一小段收掉（那里另外盖一颗光点）
          const along = Math.pow(u, 1.5) * Math.min(1, (1 - u) / 0.05) * (0.86 + 0.14 * grain(u));
          // 尾巴末端碎掉；断口跟着上下位置错开一点，不会是齐刷刷的一刀
          const crumbleAt = (v) => Math.min(1, Math.max(0, (crumble(Math.min(1, Math.max(0, u + v * 0.12))) - (0.42 - u) * 1.5) * 2.2));
          const wide = (0.3 + 0.7 * Math.pow(u, 0.6)) * (0.8 + 0.4 * wobble(u));
          for (let y = 0; y < H; y++) {
            const v = (y + 0.5 - H / 2) / (H / 2);
            const core = Math.exp(-Math.pow(v / ((0.035 + 0.1 * Math.pow(u, 1.4)) * (0.8 + 0.4 * wobble(u))), 2)) * along;
            let halo = Math.exp(-Math.pow(Math.abs(v) / (0.36 * wide), 1.5)) * along * 0.42;
            for (const wisp of wisps) {
              // 细丝离头越远散得越开
              const off = wisp.side * (0.25 + 0.75 * (1 - u));
              const on = Math.min(1, Math.max(0, (wisp.gap(u) - wisp.cut) * 3.5));
              halo += Math.exp(-Math.pow((v - off) / 0.05, 2)) * on * wisp.a * Math.pow(u, 0.9) * Math.min(1, (1 - u) / 0.12);
            }
            // 上下两条边压到零，贴图放大后不会露出一道直边
            const alpha = Math.min(1, (core + halo) * crumbleAt(v)) * Math.min(1, (1 - Math.abs(v)) * 5);
            const white = Math.min(1, core * 1.15);
            const at = (y * W + x) * 4;
            image.data[at] = 255 * (r + (1 - r) * white);
            image.data[at + 1] = 255 * (gr + (1 - gr) * white);
            image.data[at + 2] = 255 * (b + (1 - b) * white);
            image.data[at + 3] = 255 * alpha;
          }
        }
        g.putImageData(image, 0, 0);
        trails[index] = sprite;
      }
      return trails[index];
    };

    // 每一年是一个星系，长相跟着年份走：旋臂的颜色、旋臂上星云的颜色、旋臂拧得多紧（越小越紧）
    const LOOKS = [
      { arm: 218, knot: 345, slope: 0.31 },
      { arm: 196, knot: 18, slope: 0.36 },
      { arm: 250, knot: 330, slope: 0.27 },
      { arm: 176, knot: 40, slope: 0.33 },
      { arm: 232, knot: 352, slope: 0.4 },
      { arm: 272, knot: 28, slope: 0.29 }
    ];
    const ARMS = 2;
    // 旋臂是对数螺线：这是它在半径 r 处拧过去的角度
    const wind = (look, r) => Math.log(Math.max(r, 0.03) / 0.1) / look.slope;

    // 星系里的每一颗星：位置 3 个数、颜色 3 个数、大小、一个随机数，一共 8 个数一颗
    const STRIDE = 8;
    const scatter = (index) => {
      const look = LOOKS[index % LOOKS.length];
      const random = seeded(index * 977 + 11);
      const bell = () => (random() + random() + random() + random() - 2) * 1.73;
      const list = [];
      const put = (x, y, z, color, bright, size) => {
        list.push(x, y, z, color[0] * bright, color[1] * bright, color[2] * bright, size, random());
      };
      const arm = (k, r) => (k / ARMS) * Math.PI * 2 + wind(look, r);

      // 核球：中间一团偏黄的老星
      for (let i = 0; i < 2400; i++) {
        const r = 0.03 + 0.085 * random();
        put(bell() * r, bell() * r * 0.55, bell() * r, tint(30 + random() * 20, 0.75, 0.74), 0.08 + random() * 0.18, 1 + random() * 0.8);
      }
      // 盘：一多半的星挤在两条旋臂上，其余铺满整个盘。越往外越蓝，零星几颗特别亮的
      for (let i = 0; i < 27000; i++) {
        const r = Math.min(1.3, 0.05 - 0.23 * Math.log(random() * random() + 0.0001));
        const onArm = random() < 0.6;
        const a = onArm ? arm(Math.floor(random() * ARMS), r) + (bell() * 0.07) / r : random() * Math.PI * 2;
        const giant = random() < 0.012;
        const color = random() < 1 - r / 0.36 ? tint(32 + random() * 18, 0.8, 0.76)
          : !onArm ? tint(40, 0.32, 0.84)
            : random() < 0.035 ? tint(look.knot, 0.85, 0.66)
              : tint(look.arm + bell() * 14, 0.7, 0.76 + random() * 0.14);
        put(
          Math.cos(a) * r, bell() * (random() < 0.08 ? 0.05 : 0.013) * (1.2 - r * 0.5), Math.sin(a) * r, color,
          // 越靠中心星越密，单颗压暗一些，免得叠成一片白
          (giant ? 1 : onArm ? 0.26 + random() * 0.5 : 0.14 + random() * 0.3) * Math.min(1, 0.22 + r * 2.4),
          giant ? 2.4 + random() * 1.4 : 0.9 + random() * 0.9
        );
      }
      // 旋臂上的年轻星团：一小撮一小撮挤在一起的蓝白亮星
      for (let i = 0; i < 70; i++) {
        const r = 0.2 + 0.95 * random();
        const a = arm(i % ARMS, r) + (bell() * 0.045) / r;
        const tight = 0.008 + 0.014 * random();
        for (let k = 0; k < 26; k++) {
          put(
            Math.cos(a) * r + bell() * tight, bell() * tight * 0.6, Math.sin(a) * r + bell() * tight,
            tint(look.arm - 8 + bell() * 10, 0.6, 0.84), 0.35 + random() * 0.5, 1 + random() * 1.1
          );
        }
      }
      // 晕：稀稀拉拉裹在外面的星
      for (let i = 0; i < 900; i++) {
        const yaw = random() * Math.PI * 2;
        const lift = Math.asin(random() * 2 - 1);
        const r = 0.25 + 1.4 * Math.pow(random(), 1.6);
        put(
          Math.cos(yaw) * Math.cos(lift) * r, Math.sin(lift) * r * 0.7, Math.sin(yaw) * Math.cos(lift) * r,
          tint(30 + random() * 190, 0.4, 0.84), 0.14 + random() * 0.3, 0.9 + random() * 0.8
        );
      }
      return { look, seed: index * 131 + 7, points: new Float32Array(list) };
    };

    // 星系的底图：从正上方看下去的一层光，画在一张小画布上，再由 WebGL 按透视铺到星系盘上。
    // 星是一颗颗的点，星和星之间那层朦胧的光、旋臂里侧的暗带靠它
    const REACH = 1.45;
    const SHEET = 512;
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = SHEET;
    const paint = (model) => {
      const look = model.look;
      const random = seeded(model.seed);
      const bell = () => (random() + random() + random() + random() - 2) * 1.73;
      const g = sheet.getContext('2d');
      const half = SHEET / 2;
      const scale = half / REACH;
      const blob = (sprite, x, z, r, alpha) => {
        g.globalAlpha = alpha;
        g.drawImage(sprite, half + (x - r) * scale, half + (z - r) * scale, r * 2 * scale, r * 2 * scale);
      };
      // 第 k 条旋臂上半径 r 处的一个点；side 是往旋臂里侧（负）或外侧（正）偏多少
      const along = (k, r, side) => {
        const a = (k / ARMS) * Math.PI * 2 + wind(look, r);
        return [Math.cos(a) * (r + side), Math.sin(a) * (r + side)];
      };

      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, SHEET, SHEET);
      g.globalCompositeOperation = 'lighter';

      // 整个盘的底光：外圈偏旋臂的颜色，往里越来越暖
      blob(puff(look.arm, 0.55, 0.42), 0, 0, 1.42, 0.5);
      blob(puff(look.arm, 0.5, 0.5), 0, 0, 0.95, 0.24);
      blob(puff(38, 0.6, 0.5), 0, 0, 0.6, 0.2);
      // 旋臂：一团团雾沿着螺线叠出来，靠里偏暖，往外偏蓝，越往外越淡
      for (let k = 0; k < ARMS; k++) {
        for (let i = 0; i < 900; i++) {
          const r = 0.08 + 1.2 * Math.pow(random(), 1.15);
          const [x, z] = along(k, r, bell() * 0.06);
          const sprite = random() < 1 - r / 0.4 ? puff(38, 0.65, 0.6) : puff(look.arm, 0.7, random() < 0.5 ? 0.52 : 0.66);
          // 靠中心的地方雾团挤在一起，单团要淡，不然中间糊成一片白
          blob(sprite, x, z, 0.045 + 0.085 * random(), 0.1 * Math.max(0.15, 1.15 - r) * Math.min(1, 0.2 + r * 2.6));
        }
      }
      // 尘埃带：贴着旋臂里侧压暗，再在盘上随手压几下，底光就不那么匀
      g.globalCompositeOperation = 'source-over';
      const shade = puff(-1, 0, 0);
      for (let k = 0; k < ARMS; k++) {
        for (let i = 0; i < 520; i++) {
          const r = 0.2 + 0.9 * random();
          const [x, z] = along(k, r, -0.075 - 0.02 * r + bell() * 0.028);
          blob(shade, x, z, 0.02 + 0.04 * random(), 0.16);
        }
      }
      for (let i = 0; i < 260; i++) {
        const r = 0.22 + Math.sqrt(random());
        const a = random() * Math.PI * 2;
        blob(shade, Math.cos(a) * r, Math.sin(a) * r, 0.02 + 0.06 * random(), 0.14);
      }
      g.globalCompositeOperation = 'lighter';
      // 旋臂上零星几团发红的星云
      for (let i = 0; i < 34; i++) {
        const r = 0.2 + 0.9 * random();
        const [x, z] = along(i % ARMS, r, bell() * 0.035);
        blob(puff(look.knot, 0.8, 0.54), x, z, 0.014 + 0.026 * random(), 0.42);
      }
      // 核：中间暖色的一团，亮但不能亮成一片白，那样星星就看不见了
      blob(puff(40, 0.8, 0.6), 0, 0, 0.26, 0.34);
      g.globalAlpha = 1;
    };

    // ———— 每一年到站后看到的那一幕 ————
    // 六年六幕：恒星诞生的星云、旋涡星系、带光环的行星、黑洞、双星、爱心星团。
    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const ease = (lo, hi, v) => {
      const t = clamp((v - lo) / (hi - lo), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const WHITE = [1, 1, 1];

    // 撒一幕用的小工具：一串这一幕专用的固定随机数，和一层层往里记星星的本子。
    // 一层可以是星（stars）、发光的雾（fog，大小那一格记的是它在空间里的直径）、把雾压暗的尘埃（soot）；
    // spin 是它跟着整幕自转的倍数，beat 是它跟不跟着心跳胀缩
    const dice = (seed) => {
      const random = seeded(seed);
      return {
        random,
        bell: () => (random() + random() + random() + random() - 2) * 1.73,
        range: (lo, hi) => lo + random() * (hi - lo),
        any: (list) => list[Math.floor(random() * list.length)],
        layer: () => {
          const list = [];
          const put = (x, y, z, color, bright, size) => {
            list.push(x, y, z, color[0] * bright, color[1] * bright, color[2] * bright, size, random());
          };
          put.pack = (kind, spin = 0, beat = false) => ({ kind, spin, beat, data: new Float32Array(list) });
          return put;
        }
      };
    };

    // 照片星的默认摆法：从里往外沿一条螺线排开，悬在盘面上方一点。
    // 给了 yaw 的那几幕镜头的朝向是定死的，就把中间那颗星摆到镜头这一侧
    const spiral = (from, span, low, high, yaw) => (i, total, order) => {
      const gap = Math.max(28, Math.min(80, 540 / total)) * RAD;
      const base = yaw === undefined ? order * 1.9 : Math.PI / 2 - yaw - (total >> 1) * gap;
      return {
        angle: base + i * gap + (noise(i, 1) - 0.5) * 0.2,
        reach: from + span * Math.pow(total > 1 ? i / (total - 1) : 0.4, 0.8),
        lift: low + noise(i, 2) * high
      };
    };

    // ① 恒星诞生的星云：一圈发光的气体围着中间的空腔，暗色的尘埃柱指向刚点亮的一小群新星
    const nebula = (order) => {
      const { random, bell, range, any, layer } = dice(order * 977 + 11);
      const gas = layer();
      const soot = layer();
      const tips = layer();
      const stars = layer();
      const sparks = [];
      // 气体墙离中心多远，一圈下来有凸有凹
      const lump = (a) => 0.62 + 0.1 * Math.sin(a * 2 + 1.3) + 0.06 * Math.sin(a * 5 + 0.4) + 0.04 * Math.sin(a * 9 + 2.2);

      // 外圈的气体墙：里沿被新星照得发金，中间玫红，外面渐渐变成紫和蓝
      for (let i = 0; i < 900; i++) {
        const a = range(0, TAU);
        const off = bell() * 0.13 + 0.06;
        const r = lump(a) + off;
        const t = clamp((off + 0.12) / 0.4, 0, 1);
        const color = t < 0.28 ? tint(range(28, 44), 0.9, 0.6) : t < 0.6 ? tint(range(332, 352), 0.85, 0.56) : tint(range(232, 276), 0.8, 0.5);
        const dense = Math.max(0.4, 0.92 + 0.3 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 7 + 2.4) + 0.12 * Math.sin(a * 13));
        gas(Math.cos(a) * r, bell() * 0.07 * (1 + t), Math.sin(a) * r, color, (t < 0.28 ? 0.075 : 0.05) * dense * (1.15 - t * 0.6), range(0.12, 0.34));
      }
      // 空腔里一层很淡的青蓝色的光
      for (let i = 0; i < 160; i++) {
        const a = range(0, TAU);
        const r = Math.sqrt(random()) * 0.5;
        gas(Math.cos(a) * r, bell() * 0.05, Math.sin(a) * r, tint(range(186, 208), 0.8, 0.55), 0.03 * (1.2 - r), range(0.2, 0.44));
      }
      gas(0, 0, 0, tint(200, 0.6, 0.72), 0.2, 0.6);
      // 气体里的细丝：一条条随机游走的亮线
      for (let k = 0; k < 150; k++) {
        let a = range(0, TAU);
        let off = bell() * 0.12 + 0.05;
        let y = bell() * 0.05;
        const color = tint(off < 0.02 ? range(30, 46) : off < 0.14 ? range(334, 354) : range(236, 276), 0.8, 0.7);
        const dir = any([-1, 1]);
        for (let i = 0; i < 150; i++) {
          a += dir * 0.006 + bell() * 0.002;
          off += bell() * 0.004;
          y += bell() * 0.003;
          const r = lump(a) + off;
          stars(Math.cos(a) * r, y, Math.sin(a) * r, color, 0.1 + 0.16 * random(), 1 + random());
        }
      }
      // 往上翻涌的几缕气体，让它不是一张平饼
      for (let k = 0; k < 7; k++) {
        let a = range(0, TAU);
        let y = 0.03;
        const lean = bell() * 0.01;
        const r0 = lump(a) + range(0, 0.16);
        const top = range(0.16, 0.36);
        const hue = any([338, 348, 262, 30]);
        for (let i = 0; i < 46; i++) {
          const t = i / 46;
          y += top / 46;
          a += lean + bell() * 0.01;
          const r = r0 + t * 0.07;
          gas(Math.cos(a) * r + bell() * 0.02, y, Math.sin(a) * r + bell() * 0.02, tint(hue + range(-10, 10), 0.85, 0.56), 0.05 * (1 - t) + 0.008, 0.1 + 0.14 * t);
        }
      }
      // 尘埃：一缕缕细的暗纹缠在气体墙上，几根细长的尘埃柱伸向中心
      for (let k = 0; k < 30; k++) {
        let a = range(0, TAU);
        let off = range(-0.04, 0.26);
        const dir = any([-1, 1]);
        const wide = range(0.024, 0.06);
        for (let i = 0; i < 70; i++) {
          a += dir * 0.011 + bell() * 0.004;
          off += bell() * 0.007;
          const r = lump(a) + off;
          soot(Math.cos(a) * r, 0.03 + bell() * 0.01, Math.sin(a) * r, WHITE, 0.16, wide * (0.6 + 0.8 * Math.sin((i / 70) * Math.PI)));
        }
      }
      for (let k = 0; k < 6; k++) {
        let a = (k / 6) * TAU + range(-0.4, 0.4);
        const from = lump(a) + 0.03;
        const to = range(0.3, 0.42);
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const r = from + (to - from) * t;
          a += bell() * 0.014;
          const wide = 0.03 * (1 - t) + 0.011;
          soot(Math.cos(a) * r + bell() * wide * 0.4, 0.03, Math.sin(a) * r + bell() * wide * 0.4, WHITE, 0.42, wide * range(1.6, 2.6));
          if (i < 40) continue;
          // 柱尖被照亮的一道金边
          const x = Math.cos(a) * (r - 0.012);
          const z = Math.sin(a) * (r - 0.012);
          tips(x, 0.035, z, tint(38, 0.95, 0.62), 0.35, 0.03);
          for (let n = 0; n < 24; n++) stars(x + bell() * 0.008, 0.035 + bell() * 0.005, z + bell() * 0.008, tint(40, 0.9, 0.75), 0.35, 1.1);
        }
      }
      // 埋在气体里的星，偏红偏暗；空腔里和外面的散星
      for (let i = 0; i < 9000; i++) {
        const a = range(0, TAU);
        const r = lump(a) + bell() * 0.2 + 0.05;
        stars(Math.cos(a) * r, bell() * 0.08, Math.sin(a) * r, tint(range(18, 48), 0.6, 0.78), 0.12 + 0.3 * random(), 0.9 + random());
      }
      for (let i = 0; i < 5000; i++) {
        const a = range(0, TAU);
        const r = 0.05 + 1.4 * Math.pow(random(), 0.8);
        stars(Math.cos(a) * r, bell() * 0.12, Math.sin(a) * r, tint(any([210, 222, 200, 40]), 0.45, 0.86), 0.1 + 0.3 * random(), 0.9 + random());
      }
      // 中间刚点亮的新星团：蓝白色，最亮的几颗带星芒（星芒画在 2D 那一层，这里只记下位置和长短）
      for (let i = 0; i < 90; i++) {
        const x = bell() * 0.11;
        const y = 0.02 + bell() * 0.04;
        const z = bell() * 0.11;
        const big = i < 9;
        stars(x, y, z, tint(range(200, 222), 0.5, 0.9), big ? 1.6 : 0.5 + random() * 0.5, big ? 5 + random() * 3 : 1.6 + random() * 1.6);
        if (big) {
          tips(x, y, z, tint(208, 0.7, 0.75), 0.22, 0.07);
          sparks.push([x, y, z, 10 + random() * 9, random() * TAU]);
        }
      }
      return { sparks, layers: [gas.pack('fog', 1), soot.pack('soot', 1), tips.pack('fog', 1), stars.pack('stars', 1)] };
    };

    // ③ 带光环的行星：行星和环是逐像素算的（deep 里的 planet 那段），这里只撒环里反光的冰粒和几颗卫星
    const PLANET = { ball: 0.25, rin: 0.335, rout: 0.76, sun: [-0.834, 0.3208, 0.4491] };
    const planet = (order) => {
      const { random, bell, range, layer } = dice(order * 977 + 11);
      const stars = layer();
      const { ball, rin, rout, sun } = PLANET;
      // 环沿半径的疏密：C 环淡、B 环最密、卡西尼缝、A 环、最外一道细的 F 环
      const dense = (u) => (u < 0.2 ? 0.2 : u < 0.56 ? 0.85 : u < 0.62 ? 0.03 : u < 0.915 ? 0.55 : u < 0.95 ? 0 : 0.4);
      for (let i = 0; i < 9000; i++) {
        const r = range(rin, rout);
        const a = range(0, TAU);
        if (random() > dense((r - rin) / (rout - rin))) continue;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // 落在行星影子里的冰粒是暗的
        const along = x * sun[0] + z * sun[2];
        const lit = along > 0 ? 1 : ease(ball * 0.965, ball * 1.05, Math.sqrt(Math.max(0, x * x + z * z - along * along)));
        stars(x, bell() * 0.002, z, blend([1, 0.88, 0.7], [0.8, 0.88, 1], random()), (0.2 + 0.7 * Math.pow(random(), 3)) * (0.05 + 0.95 * lit), 0.8 + random() * 0.9);
      }
      [[0.92, 2.2, 0.03, 3.4], [1.08, 4.4, -0.02, 2.6], [0.86, 5.6, 0.05, 2.2]].forEach(([r, a, y, size]) => {
        stars(Math.cos(a) * r, y, Math.sin(a) * r, [1, 0.95, 0.88], 0.9, size);
      });
      return { layers: [stars.pack('stars')] };
    };

    // ④ 黑洞：黑影、吸积盘和被掰弯的光是逐像素算的（deep 里的 hole 那段），这里只撒盘外圈被甩出来的火星
    const HOLE = { ball: 0.125 };
    const hole = (order) => {
      const { random, bell, range, layer } = dice(order * 977 + 11);
      const stars = layer();
      for (let i = 0; i < 2600; i++) {
        const r = range(0.55, 1.25);
        const a = range(0, TAU);
        stars(Math.cos(a) * r, bell() * 0.02 * r, Math.sin(a) * r, tint(range(16, 40), 0.9, 0.7), 0.15 + 0.4 * Math.pow(random(), 3), 0.9 + random());
      }
      return { layers: [stars.pack('stars', 5)] };
    };

    // ⑤ 双星：一蓝一金两颗恒星，绕着它们流动的星尘画出一个 ∞
    const SUNS = [
      { x: -0.5, r: 0.1, color: [0.62, 0.78, 1], hue: 216, ray: 96 },
      { x: 0.44, r: 0.066, color: [1, 0.8, 0.42], hue: 40, ray: 70 }
    ];
    // ∞ 形的轨迹：左边那一圈大一点，绕着大的那颗
    const eight = (t) => {
      const s = Math.sin(t);
      const k = s < 0 ? 1.12 : 0.96;
      return [0.8 * s * k, 0.66 * s * Math.cos(t) * k];
    };
    const binary = (order) => {
      const { random, bell, range, any, layer } = dice(order * 977 + 11);
      const gas = layer();
      const stars = layer();
      const blue = SUNS[0].color;
      const gold = SUNS[1].color;
      const pink = [1, 0.62, 0.8];
      // 靠蓝星的那一圈偏蓝，靠金星的偏金，交汇的地方是粉的
      const shade = (x) => (x < 0 ? blend(pink, blue, ease(0, 0.45, -x)) : blend(pink, gold, ease(0, 0.4, x)));
      for (let i = 0; i < 380; i++) {
        const [x, z] = eight(range(0, TAU));
        gas(x + bell() * 0.03, bell() * 0.015, z + bell() * 0.03, shade(x), 0.06 + 0.04 * Math.exp(-(x * x + z * z) * 30), range(0.08, 0.2));
      }
      for (let i = 0; i < 22000; i++) {
        const t = range(0, TAU);
        const [x, z] = eight(t);
        const [x2, z2] = eight(t + 0.01);
        const len = Math.hypot(x2 - x, z2 - z) || 1;
        // 大多数星紧贴着轨迹，少数散得开一些
        const off = bell() * (random() < 0.2 ? 0.07 : 0.022);
        const giant = random() < 0.012;
        stars(
          x - ((z2 - z) / len) * off, bell() * 0.012, z + ((x2 - x) / len) * off, blend(shade(x), WHITE, 0.2 + 0.3 * random()),
          (giant ? 1.2 : 0.3 + 0.6 * random()) * (1 + 1.2 * Math.exp(-(x * x + z * z) * 40)), giant ? 2.4 + random() * 1.2 : 0.9 + random() * 0.9
        );
      }
      // 两颗星之间的交汇处最亮
      gas(0, 0, 0, [1, 0.8, 0.9], 0.3, 0.14);
      // 外面一层稀薄的尘埃盘和散星
      for (let i = 0; i < 6000; i++) {
        const a = range(0, TAU);
        const r = 0.3 + 1.15 * Math.sqrt(random());
        stars(Math.cos(a) * r, bell() * 0.035, Math.sin(a) * r * 0.82, tint(any([222, 262, 300, 40]), 0.5, 0.82), 0.06 + 0.2 * random(), 0.9 + random() * 0.8);
      }
      for (let i = 0; i < 60; i++) {
        const a = range(0, TAU);
        const r = range(0.5, 1.2);
        gas(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8, tint(range(240, 300), 0.7, 0.5), 0.02, range(0.3, 0.6));
      }
      // 两颗恒星各自照亮身边的一大团尘埃
      gas(SUNS[0].x, 0, 0, blue, 0.12, 0.68);
      gas(SUNS[1].x, 0, 0, gold, 0.1, 0.54);
      return { layers: [gas.pack('fog', 1), stars.pack('stars', 1)] };
    };

    // ⑥ 爱心星团：几万颗星聚成一颗立体的心，底下还有星流盘旋着往上汇
    const HEART = { size: 0.47, lift: 0.1, pivot: 0.14 };
    // 心的轮廓线（正面看最宽的那一圈），照片星就挂在这条线上。u 从顶上的凹口出发绕一整圈
    const heartLine = (u) => {
      const c = Math.sin(u);
      const s = Math.cos(u);
      // 这个方向上轮廓离中心多远：解 (r² − 1)³ = r⁵ · c² · s³，只有一个根，对半找
      let lo = 0.3;
      let hi = 1.6;
      for (let i = 0; i < 24; i++) {
        const r = (lo + hi) / 2;
        if (Math.pow(r * r - 1, 3) < Math.pow(r, 5) * c * c * s * s * s) lo = r;
        else hi = r;
      }
      // 比星星聚成的那层壳再往外一点点
      const r = lo * HEART.size * 1.05;
      return [c * r, s * r + HEART.lift, 0.02];
    };
    const heart = (order) => {
      const { random, bell, range, any, layer } = dice(order * 977 + 11);
      const glow = layer();
      const floor = layer();
      const body = layer();
      const drift = layer();
      const S = HEART.size;
      const lift = HEART.lift;
      // 立体的心：这个式子小于零的地方在心里面
      const inside = (X, Y, Z) => {
        const a = X * X + 2.25 * Z * Z + Y * Y - 1;
        return a * a * a - X * X * Y * Y * Y - 0.1125 * Z * Z * Y * Y * Y;
      };
      // 心里面透出来的一团玫红色的光
      for (let i = 0; i < 70; i++) {
        let X;
        let Y;
        let Z;
        do {
          X = range(-1.2, 1.2);
          Y = range(-1.1, 1.3);
          Z = range(-0.7, 0.7);
        } while (inside(X, Y, Z) > -0.05);
        glow(X * S, Y * S + lift, Z * S, tint(range(332, 350), 0.9, 0.56), 0.075, range(0.18, 0.34));
      }
      glow(0, lift + 0.08, 0, [1, 0.72, 0.8], 0.16, 0.6);
      let made = 0;
      while (made < 34000) {
        const X = range(-1.25, 1.25);
        const Y = range(-1.1, 1.35);
        const Z = range(-0.72, 0.72);
        const f = inside(X, Y, Z);
        if (f > 0) continue;
        // 贴着表面的星多，里面的少，心的轮廓才清楚
        const shell = f > -0.14;
        if (!shell && random() > 0.16) continue;
        made++;
        const giant = random() < 0.016;
        const color = random() < 0.06 ? tint(range(200, 222), 0.5, 0.88)
          : shell ? tint(range(328, 352), 0.85, 0.7 + 0.14 * random())
            : tint(range(350, 380) % 360, 0.8, 0.8);
        body(
          X * S + bell() * 0.004, Y * S + lift + bell() * 0.004, Z * S + bell() * 0.004, color,
          giant ? 1.3 : shell ? 0.4 + 0.6 * random() : 0.16 + 0.3 * random(), giant ? 2.8 + random() * 1.6 : 0.9 + random()
        );
      }
      // 从四周盘旋着汇过来的星流，和脚下一圈淡淡的星环
      for (let k = 0; k < 3; k++) {
        for (let i = 0; i < 2600; i++) {
          const t = Math.pow(random(), 0.8);
          const r = 0.22 + 1.15 * t;
          const a = (k / 3) * TAU + t * 4.6 + (bell() * 0.05) / (r + 0.2);
          drift(Math.cos(a) * r, -0.36 - 0.14 * t + bell() * 0.015, Math.sin(a) * r, blend(tint(340, 0.8, 0.76), tint(232, 0.6, 0.8), t), (0.4 + 0.6 * random()) * (1.15 - t * 0.6), 1 + random());
        }
      }
      for (let i = 0; i < 5000; i++) {
        const a = range(0, TAU);
        const r = 0.3 + 1.1 * Math.sqrt(random());
        drift(Math.cos(a) * r, -0.44 + bell() * 0.02, Math.sin(a) * r, tint(any([228, 262, 320]), 0.5, 0.82), 0.06 + 0.16 * random(), 0.9 + random() * 0.7);
      }
      for (let i = 0; i < 40; i++) {
        const a = range(0, TAU);
        const r = range(0.2, 1);
        floor(Math.cos(a) * r, -0.42, Math.sin(a) * r, tint(range(250, 330), 0.7, 0.5), 0.022, range(0.28, 0.52));
      }
      return { layers: [glow.pack('fog', 0, true), floor.pack('fog', 3), body.pack('stars', 0, true), drift.pack('stars', 3)] };
    };

    // 每一幕：提示语怎么说（tip）、星和雾怎么撒（make）、照片星摆在哪（place；沿一条闭合曲线排的另给 curve）、
    // 镜头停在哪（rest，没写 yaw 的跟着照片星走）、能俯仰到多少（tilt）、刚到站时从多高俯冲下来（dive）。
    // spins：整幕带着照片星慢慢自转；disc：盘面有多大（挡住身后的远景）；ball：中间那颗球的半径（挡住身后的星）；
    // stems：照片星往盘面垂一道光；pass / swirl：逐像素算的那一段叫什么、它自己转多快；
    // sway：镜头不绕圈，只在正面左右晃这么多；beats / pivot：整幕跟着心跳胀缩，绕着这个高度胀
    const SCENES = {
      nebula: {
        tip: '拖动环绕星云', make: nebula, place: spiral(0.22, 0.3, 0.05, 0.04),
        rest: { pitch: 0.66, dist: 1.16 }, tilt: [0.3, 1.25], dive: 1.4, spins: true, disc: 0.95, stems: true
      },
      galaxy: {
        tip: '拖动环绕星系', place: spiral(0.17, 0.34, 0.05, 0.05),
        make: (order) => {
          const model = scatter(order);
          return { look: model.look, seed: model.seed, layers: [{ kind: 'stars', spin: 1, beat: false, data: model.points }] };
        },
        rest: { pitch: 0.62, dist: 1.12 }, tilt: [0.3, 1.25], dive: 1.4, spins: true, disc: 1.3, stems: true, sheet: true, bloom: true
      },
      planet: {
        tip: '拖动环绕星环', make: planet, place: spiral(0.37, 0.15, 0.02, 0.015, 0.3), pass: 'planet', swirl: 1.5,
        rest: { yaw: 0.3, pitch: 0.36, dist: 1.2 }, tilt: [0.14, 1.2], dive: 1.4, spins: true, disc: PLANET.rout, ball: PLANET.ball, stems: true
      },
      hole: {
        tip: '拖动环绕黑洞', make: hole, place: spiral(0.3, 0.18, 0.03, 0.02), pass: 'hole', swirl: 4.5,
        rest: { pitch: 0.165, dist: 1.02 }, tilt: [0.07, 0.9], dive: 1.4, spins: true, disc: 0.95, ball: HOLE.ball, stems: true
      },
      binary: {
        tip: '拖动环绕双星', make: binary, place: (i, total) => ({ u: 0.45 + (i / total) * TAU }),
        curve: (u) => {
          const [x, z] = eight(u);
          return [x, 0.045, z];
        },
        rest: { yaw: 0.18, pitch: 0.78, dist: 1.26 }, tilt: [0.35, 1.3], dive: 1.4, spins: true, disc: 0.9, stems: true, suns: true
      },
      heart: {
        tip: '左右拖动看看这颗心', make: heart, place: (i, total) => ({ u: total > 1 ? 0.7 + (i / (total - 1)) * (TAU - 1.4) : 0.75 }),
        curve: heartLine,
        rest: { yaw: 0, pitch: 0.26, dist: 1.3 }, tilt: [0.02, 1], dive: 0.9, bulk: 0.5, sway: 0.42, beats: true, pivot: HEART.pivot
      }
    };
    const KINDS = ['nebula', 'galaxy', 'planet', 'hole', 'binary', 'heart'];
    const stage = (order) => {
      const scene = SCENES[KINDS[order % KINDS.length]];
      return { scene, ...scene.make(order) };
    };

    // 背景：无穷远处的星、几片很淡的星云、飘在镜头附近的星尘。
    // 有几幕镜头压得很平，头顶那半边天也看得到，所以星撒满整个天球
    const backdrop = (() => {
      const list = [];
      for (let i = 0; i < 5000; i++) {
        const yaw = rand(0, Math.PI * 2);
        const lift = Math.asin(rand(-1, 1));
        const color = tint(pick([220, 220, 215, 40, 28, 200]), 0.5, 0.86);
        // 亮的少、暗的多
        const bright = 0.2 + 0.8 * Math.pow(Math.random(), 4);
        list.push(Math.cos(yaw) * Math.cos(lift), Math.sin(lift), Math.sin(yaw) * Math.cos(lift), color[0] * bright, color[1] * bright, color[2] * bright, bright > 0.6 ? rand(1.8, 3) : rand(0.9, 1.6), Math.random());
      }
      return new Float32Array(list);
    })();
    // 星云：每一片是十来个又大又淡的光斑叠在一起，叠出来的形状不规则。[左右角度, 上下角度, 色相]
    const haze = (() => {
      const list = [];
      [[25, 2, 262], [100, -6, 205], [165, 6, 318], [-130, -2, 228], [-55, 8, 238], [-90, -40, 250], [60, -48, 215]].forEach(([yaw, lift, hue]) => {
        for (let i = 0; i < 10; i++) {
          const a = (yaw + rand(-17, 17)) * RAD;
          const b = (lift + rand(-9, 9)) * RAD;
          const color = tint(hue + rand(-22, 22), 0.75, 0.55);
          const bright = rand(0.035, 0.075);
          list.push(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b), color[0] * bright, color[1] * bright, color[2] * bright, rand(90, 210), Math.random());
        }
      });
      return new Float32Array(list);
    })();
    const motes = (() => {
      const list = [];
      for (let i = 0; i < 170; i++) {
        const yaw = rand(0, Math.PI * 2);
        const r = rand(0.35, 1.7);
        const color = tint(pick([215, 230, 40]), 0.5, 0.8);
        const bright = rand(0.05, 0.16);
        list.push(Math.cos(yaw) * r, rand(0.12, 1.2), Math.sin(yaw) * r, color[0] * bright, color[1] * bright, color[2] * bright, rand(1.4, 3), Math.random());
      }
      return new Float32Array(list);
    })();

    // 很远很远的别的星系：天球上几个淡淡的小光斑。[左右角度, 上下角度, 长, 扁, 歪, 色相]
    const far = [
      [20, -8, 15, 0.35, 0.5, 215], [-48, 4, 9, 0.6, -0.8, 40], [95, -14, 11, 0.3, 1.2, 280],
      [150, 2, 8, 0.7, 0.2, 200], [-120, -10, 13, 0.4, -0.3, 30], [-165, -4, 7, 0.5, 0.9, 220],
      [60, 9, 10, 0.45, 0.4, 250], [-80, 12, 12, 0.3, -1, 210], [175, -16, 8, 0.6, 0.7, 35],
      [-15, 14, 9, 0.5, 0.3, 225], [120, 16, 11, 0.4, -0.6, 35]
    ].map(([yaw, lift, size, flat, tilt, hue]) => ({
      x: Math.cos(yaw * RAD) * Math.cos(lift * RAD), y: Math.sin(lift * RAD), z: Math.sin(yaw * RAD) * Math.cos(lift * RAD),
      size, flat, tilt, hue
    }));

    // 这一帧镜头在哪、朝哪：e 是位置，r / u / f 是右、上、前三个方向。星系那层和照片星这层共用
    const lens = { ex: 0, ey: 1, ez: 1, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1 };
    const aim = (yaw, pitch, dist) => {
      lens.ex = Math.sin(yaw) * Math.cos(pitch) * dist;
      lens.ey = Math.sin(pitch) * dist;
      lens.ez = Math.cos(yaw) * Math.cos(pitch) * dist;
      // 一直盯着星系中心
      lens.fx = -lens.ex / dist;
      lens.fy = -lens.ey / dist;
      lens.fz = -lens.ez / dist;
      const flat = Math.hypot(lens.fx, lens.fz) || 1;
      lens.rx = lens.fz / flat;
      lens.rz = -lens.fx / flat;
      lens.ux = lens.fy * lens.rz;
      lens.uy = lens.fz * lens.rx - lens.fx * lens.rz;
      lens.uz = -lens.fy * lens.rx;
    };

    // 把空间里的一个点投到屏幕上；结果写进同一个对象，z 是离镜头多远，太近或在身后就不画
    const spot = { x: 0, y: 0, z: 0 };
    const cast = (dx, dy, dz) => {
      spot.z = dx * lens.fx + dy * lens.fy + dz * lens.fz;
      if (spot.z > 0.05) {
        const k = focal / spot.z;
        spot.x = w / 2 + (dx * lens.rx + dz * lens.rz) * k;
        spot.y = eyeline - (dx * lens.ux + dy * lens.uy + dz * lens.uz) * k;
      }
      return spot;
    };
    const project = (x, y, z) => cast(x - lens.ex, y - lens.ey, z - lens.ez);

    // 每一幕的本体用 WebGL 画：几万颗星要一颗颗按透视摆，2D 画布吃不消。
    // 拿不到 WebGL 的浏览器这里是 null，drawSky 里改用 2D 画布画一个稀疏的版本
    const deep = (() => {
      const view = $('cosmosDeep');
      let gl = null;
      try {
        gl = view.getContext('webgl', { alpha: false, antialias: false, depth: false });
      } catch (err) {}
      if (!gl) return null;

      const LENS = `
        uniform vec3 uEye;
        uniform vec3 uRight;
        uniform vec3 uUp;
        uniform vec3 uFwd;
        uniform vec3 uLens;
        vec4 place(vec3 d) {
          float z = dot(d, uFwd);
          return vec4(dot(d, uRight) * uLens.x, dot(d, uUp) * uLens.y + uLens.z * z, z * 0.998 - 0.01, z);
        }`;
      const link = (vertex, fragment, names) => {
        const program = gl.createProgram();
        [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].forEach(([type, source]) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          gl.attachShader(program, shader);
        });
        // 顶点数据的入口在每套着色器里都排在同样的位置，换着色器时不用重新开关
        ['aPos', 'aColor', 'aSize'].forEach((name, i) => gl.bindAttribLocation(program, i, name));
        gl.bindAttribLocation(program, 0, 'aCorner');
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
        const at = {};
        names.forEach((name) => { at[name] = gl.getUniformLocation(program, name); });
        return { program, at };
      };

      // 一个点：uGrow 是离得近时放大得多快，星星只放大一点（星星再近也是个点），星尘凑到眼前会虚成一片，
      // 雾团是实打实按远近缩放的。uPulse 是心跳（胀多大、绕着多高的地方胀），uBall 是中间那颗球的半径
      const POINT = `
        attribute vec3 aPos;
        attribute vec3 aColor;
        attribute vec2 aSize;
        ${LENS}
        uniform vec2 uSpin;
        uniform vec2 uPulse;
        uniform float uBall;
        uniform float uFar;
        uniform float uGrow;
        uniform float uDpr;
        uniform float uMax;
        uniform float uSoft;
        uniform float uTime;
        uniform float uFade;
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vec3 q = vec3(aPos.x, aPos.y - uPulse.y, aPos.z) * uPulse.x;
          vec3 p = vec3(q.x * uSpin.x - q.z * uSpin.y, q.y + uPulse.y, q.x * uSpin.y + q.z * uSpin.x);
          vec3 d = p - uEye * (1.0 - uFar);
          gl_Position = place(d);
          float near = 1.0 / max(mix(gl_Position.w, 1.0, uFar), 0.05);
          float size = aSize.x * uDpr * pow(near, uGrow);
          float shown = clamp(size, 1.5, uMax);
          // 小到不足一个像素的星不再缩小，改成变暗；凑到眼前的星尘摊得越大越淡
          float glow = min(1.0, (size * size) / (shown * shown)) / (1.0 + max(0.0, size - 6.0 * uDpr) * uSoft);
          float twinkle = 0.78 + 0.22 * sin(uTime * (0.5 + aSize.y * 2.6) + aSize.y * 50.0);
          gl_PointSize = shown;
          vColor = aColor * (glow * twinkle * uFade);
          vSeed = aSize.y;
          // 被中间那颗球挡在身后的不画：挪到看不见的地方去
          float len = length(d);
          float b = dot(uEye, d) / len;
          float h = b * b - dot(uEye, uEye) + uBall * uBall;
          if (uBall > 0.0 && h > 0.0 && b < 0.0 && -b - sqrt(max(h, 0.0)) < len) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        }`;
      const POINT_NAMES = ['uEye', 'uRight', 'uUp', 'uFwd', 'uLens', 'uSpin', 'uPulse', 'uBall', 'uFar', 'uGrow', 'uDpr', 'uMax', 'uSoft', 'uTime', 'uFade'];
      const stars = link(POINT, `
        precision mediump float;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float soft = max(0.0, 1.0 - dot(c, c) * 4.0);
          gl_FragColor = vec4(vColor * soft * soft * soft * soft, 1.0);
        }`, POINT_NAMES);
      // 雾：边比星星虚得多。几百团很淡的雾叠在一起，颜色只有 256 级会叠出一圈圈台阶，
      // 所以每一团各掺一点点噪声把台阶抹开
      const fog = link(POINT, `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        varying vec3 vColor;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float soft = max(0.0, 1.0 - dot(c, c) * 4.0);
          vec3 q = fract(vec3(gl_FragCoord.xyx) * 0.1031 + vSeed * 7.13);
          q += dot(q, q.yzx + 33.33);
          gl_FragColor = vec4(vColor * soft * soft + (fract((q.x + q.y) * q.z) - 0.5) / 255.0, 1.0);
        }`, POINT_NAMES);

      // 星系的底图：一张贴图按透视铺在盘面上
      const disc = link(`
        attribute vec2 aCorner;
        ${LENS}
        uniform vec2 uSpin;
        varying vec2 vUv;
        void main() {
          vec2 q = aCorner * ${REACH.toFixed(2)};
          gl_Position = place(vec3(q.x * uSpin.x - q.y * uSpin.y, 0.0, q.x * uSpin.y + q.y * uSpin.x) - uEye);
          vUv = aCorner * 0.5 + 0.5;
        }`, `
        precision mediump float;
        uniform sampler2D uSheet;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(uSheet, vUv).rgb * uFade, 1.0);
        }`, ['uEye', 'uRight', 'uUp', 'uFwd', 'uLens', 'uSpin', 'uSheet', 'uFade']);
      // 把画好雾的那张小图铺回整个屏幕
      const blit = link(`
        attribute vec2 aCorner;
        varying vec2 vUv;
        void main() {
          gl_Position = vec4(aCorner, 0.0, 1.0);
          vUv = aCorner * 0.5 + 0.5;
        }`, `
        precision mediump float;
        uniform sampler2D uSheet;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(uSheet, vUv).rgb * uFade, 1.0);
        }`, ['uSheet', 'uFade']);
      if (!stars || !disc) return null;

      // 行星和黑洞是逐像素算的：整屏铺一张面，每个像素顺着自己那条视线看出去碰到了什么。
      // 输出的颜色直接加到画面上，透明度那一格记的是「身后的星光还剩多少」
      const RAY = `
        attribute vec2 aCorner;
        ${LENS}
        varying vec3 vRay;
        void main() {
          gl_Position = vec4(aCorner, 0.0, 1.0);
          vRay = uFwd + uRight * (aCorner.x / uLens.x) + uUp * ((aCorner.y - uLens.z) / uLens.y);
        }`;
      const NOISE = `
        precision highp float;
        varying vec3 vRay;
        uniform vec3 uEye;
        uniform float uTurn;
        uniform float uFade;
        uniform float uPx;
        float hash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            v += vnoise(p) * amp;
            p = p * 2.03 + vec2(11.7, 5.3);
            amp *= 0.5;
          }
          return v / 0.9375;
        }
        float n1(float x) { return vnoise(vec2(x, 7.31)); }`;
      const PASSES = {
        // 带光环的行星：行星会挡住身后的环，环上有行星的影子，行星上也有环的影子
        planet: `${NOISE}
        const float RP = ${PLANET.ball.toFixed(3)};
        const float RIN = ${PLANET.rin.toFixed(3)};
        const float ROUT = ${PLANET.rout.toFixed(3)};
        const vec3 SUN = vec3(${PLANET.sun.map((v) => v.toFixed(4)).join(', ')});
        // 环沿半径的疏密：C 环淡、B 环最亮、卡西尼缝、A 环、恩克缝、最外一道细的 F 环。
        // fp 是这个像素在环上盖住多宽的一段（斜着看的地方一个像素盖住好几道纹），比它还细的纹就抹平，不然会闪
        float ring(float r, float fp) {
          float u = (r - RIN) / (ROUT - RIN);
          if (u <= 0.0 || u >= 1.0) return 0.0;
          float e = max(0.003, fp);
          float o = mix(0.1 + 0.16 * smoothstep(0.0, 0.2, u), 0.72 + 0.25 * n1(u * 23.0), smoothstep(0.2 - e, 0.2 + e, u));
          o = mix(o, 0.03, smoothstep(0.56 - e, 0.56 + e, u));
          o = mix(o, 0.5 + 0.14 * n1(u * 31.0), smoothstep(0.62 - e, 0.62 + e, u));
          o = mix(o, 0.0, smoothstep(0.915 - e, 0.915 + e, u));
          o = mix(o, 0.4, smoothstep(0.95 - e, 0.95 + e, u));
          o *= smoothstep(0.0, 0.012 + e, u) * (1.0 - smoothstep(0.985 - e, 1.0, u));
          float gap = max(0.006, fp);
          float k = (u - 0.845) / gap;
          o *= 1.0 - 0.9 * (0.006 / gap) * exp(-k * k);
          o *= 1.0 - 0.35 * smoothstep(0.19 - e, 0.2, u) * (1.0 - smoothstep(0.2, 0.215 + e, u));
          float fine = clamp(1.5 - fp * 150.0, 0.0, 1.0);
          o *= mix(0.86, 0.72 + 0.28 * n1(u * 150.0), fine) * (0.86 + 0.14 * n1(u * 70.0));
          return clamp(o, 0.0, 1.0);
        }
        // 环上的一点有没有落在行星的影子里
        float lit(vec2 p) {
          float along = dot(p, SUN.xz);
          if (along > 0.0) return 1.0;
          return smoothstep(RP * 0.965, RP * 1.05, sqrt(max(0.0, dot(p, p) - along * along)));
        }
        vec3 band(float i) {
          float k = mod(i * 5.0 + 2.0, 6.0);
          if (k < 0.5) return vec3(1.0, 0.8, 0.64);
          if (k < 1.5) return vec3(0.95, 0.6, 0.62);
          if (k < 2.5) return vec3(0.72, 0.62, 0.95);
          if (k < 3.5) return vec3(1.0, 0.93, 0.84);
          if (k < 4.5) return vec3(0.86, 0.5, 0.66);
          return vec3(0.98, 0.72, 0.5);
        }
        void main() {
          vec3 d = normalize(vRay);
          float b = dot(uEye, d);
          float tca = -b;
          float m = length(uEye + d * tca);
          // 行星的边缘按一个像素的宽度过渡，不出锯齿
          float cover = tca > 0.0 ? clamp((RP - m) / (uPx * tca) + 0.5, 0.0, 1.0) : 0.0;
          vec3 col = vec3(0.0);
          float through = 1.0;

          // 这条视线穿过环面的地方
          float o = 0.0;
          vec3 ice = vec3(0.0);
          float tP = abs(d.y) > 0.00001 ? -uEye.y / d.y : -1.0;
          if (tP > 0.0) {
            vec2 p = uEye.xz + d.xz * tP;
            float r = length(p);
            if (r > RIN && r < ROUT) {
              float along = abs(dot(p / r, d.xz / max(0.0001, length(d.xz))));
              float fp = uPx * tP * (along / abs(d.y) + sqrt(max(0.0, 1.0 - along * along))) / (ROUT - RIN);
              o = ring(r, fp);
              float u = (r - RIN) / (ROUT - RIN);
              ice = mix(vec3(1.0, 0.88, 0.7), vec3(0.8, 0.88, 1.0), 0.25 + 0.6 * n1(u * 8.0 + 3.0)) * (0.07 + 0.93 * lit(p)) * 0.95;
            }
          }
          // 环的这一段在行星前面还是后面
          bool ahead = tP < tca;
          if (o > 0.0 && !ahead) {
            col = ice * o;
            through = 1.0 - o * 0.92;
          }

          if (cover > 0.0) {
            vec3 n = normalize(uEye + d * (tca - sqrt(max(0.0, b * b - dot(uEye, uEye) + RP * RP))));
            // 行星自己慢慢转
            float cr = cos(uTurn);
            float sr = sin(uTurn);
            vec2 e = vec2(n.x * cr - n.z * sr, n.x * sr + n.z * cr);
            float lon = atan(e.y, e.x);
            // 一条条的云带，边缘被风搅得弯弯曲曲
            float wobble = 0.5 * (fbm(vec2(e.x * 2.6 + 3.0, n.y * 9.0)) + fbm(vec2(e.y * 2.6 + 8.0, n.y * 9.0 + 4.0)));
            float v = n.y + 0.05 * (wobble - 0.5) + 0.012 * sin(lon * 7.0 + n.y * 30.0);
            float k = (v * 0.5 + 0.5) * 11.0;
            float i0 = floor(k);
            vec3 body = mix(band(i0), band(i0 + 1.0), smoothstep(0.25, 0.75, k - i0));
            body *= 0.82 + 0.3 * fbm(vec2(e.x * 4.0 + e.y * 3.0 + 20.0, v * 46.0));
            float facing = dot(n, SUN);
            float mu = clamp(-dot(n, d), 0.0, 1.0);
            float light = pow(max(0.0, facing), 0.85) * (0.55 + 0.45 * sqrt(mu)) + 0.012;
            // 环投在行星上的影子
            float t = -n.y * RP / SUN.y;
            if (t > 0.0) light *= 1.0 - 0.8 * ring(length(n.xz * RP + SUN.xz * t), 0.012);
            // 大气：迎光那一侧的边缘泛一圈粉蓝
            body = body * light * 1.05 + vec3(0.5, 0.55, 0.95) * pow(1.0 - mu, 3.2) * smoothstep(-0.1, 0.5, facing);
            col = mix(col, body, cover);
            through *= 1.0 - cover;
          }
          // 贴着行星边缘的一圈大气辉光
          if (tca > 0.0 && m > RP && m < RP * 1.1) {
            float g = 1.0 - (m - RP) / (RP * 0.1);
            col += vec3(0.5, 0.6, 1.0) * g * g * g * 0.35 * smoothstep(-0.2, 0.6, dot(uEye + d * tca, SUN) / m) * (1.0 - cover);
          }
          if (o > 0.0 && ahead) {
            col = col * (1.0 - o * 0.92) + ice * o;
            through *= 1.0 - o * 0.92;
          }
          gl_FragColor = vec4(col * uFade, mix(1.0, through, uFade));
        }`,

        // 黑洞：光线经过它身边会被掰弯，所以盘的后半圈会翻到黑影的上方和下方
        hole: `${NOISE}
        const float CRIT = ${HOLE.ball.toFixed(3)};
        const float RIN = 0.2;
        const float ROUT = 0.98;
        vec3 ramp(float t) {
          t *= 4.0;
          vec3 c = mix(vec3(0.42, 0.1, 0.04), vec3(0.9, 0.34, 0.08), clamp(t, 0.0, 1.0));
          c = mix(c, vec3(1.0, 0.66, 0.26), clamp(t - 1.0, 0.0, 1.0));
          c = mix(c, vec3(1.0, 0.9, 0.7), clamp(t - 2.0, 0.0, 1.0));
          return mix(c, vec3(1.0, 0.98, 0.94), clamp(t - 3.0, 0.0, 1.0));
        }
        // 吸积盘上的一点有多亮、多不透明。fp 是这个像素在盘上盖住多宽，比它还细的纹抹平
        vec4 disc(vec2 p, vec2 toCam, float fp) {
          float r = length(p);
          float u = (r - RIN) / (ROUT - RIN);
          if (u <= 0.0 || u >= 1.0) return vec4(0.0);
          vec2 dir = p / r;
          // 越靠里转得越快，纹路被拧成一圈圈的丝；整个盘还在慢慢转
          float a = 3.4 / sqrt(r) + uTurn;
          vec2 q = vec2(dir.x * cos(a) - dir.y * sin(a), dir.x * sin(a) + dir.y * cos(a)) * r;
          float streak = fbm(q * 7.0) * 0.6 + mix(0.5, n1(r * 46.0), clamp(1.5 - fp * 70.0, 0.0, 1.0)) * 0.4;
          float glow = pow(RIN / r, 1.25) * smoothstep(0.0, 0.035, u) * pow(1.0 - u, 1.1) * (0.3 + 1.5 * streak * streak);
          // 朝我们转过来的那半边更亮
          float side = dir.y * toCam.x - dir.x * toCam.y;
          glow *= pow(1.0 + 0.45 * side, 2.1);
          vec3 c = ramp(clamp(pow(RIN / r, 0.85) * (0.8 + 0.25 * side), 0.0, 1.0));
          return vec4(c * glow * 1.5, smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.6, 1.0, u)));
        }
        void main() {
          vec3 d = normalize(vRay);
          float tca = -dot(uEye, d);
          vec3 P = uEye + d * tca;
          float b = length(P);
          if (tca <= 0.0 || b > 1.6) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
          vec2 toCam = normalize(uEye.xz);
          // 飞到黑洞身边之前，先直着穿过盘的前半圈。前半圈的盘是实的，会挡住它身后的那些光
          vec3 front = vec3(0.0);
          float veil = 1.0;
          float t = abs(d.y) > 0.00001 ? -uEye.y / d.y : -1.0;
          if (t > 0.0 && t < tca) {
            vec4 c = disc(uEye.xz + d.xz * t, toCam, uPx * t / abs(d.y));
            front = c.rgb;
            veil = 1.0 - c.a * max(clamp((c.r + c.g + c.b) * 2.2, 0.0, 1.0), 1.0 - smoothstep(CRIT * 1.5, CRIT * 2.6, b));
          }
          // 擦身而过的光被朝黑洞掰过去一个角度，离得越近掰得越狠；掉进黑影里的就什么都没有了
          vec3 back = vec3(0.0);
          float edge = smoothstep(0.0, 1.0, (b - CRIT) / (uPx * tca * 1.5));
          if (b > CRIT) {
            float q = CRIT / b;
            float bend = min(3.0, 0.8 * q / pow(max(0.0001, 1.0 - q * q * q), 0.6));
            vec3 e = d * cos(bend) - (P / b) * sin(bend);
            float s = abs(e.y) > 0.00001 ? -P.y / e.y : -1.0;
            if (s > 0.0) back += disc(P.xz + e.xz * s, toCam, uPx * (tca + s) / abs(e.y)).rgb;
            // 紧贴黑影的一圈细光环
            float k = (b - CRIT * 1.035) / 0.0075;
            back += vec3(1.1, 0.86, 0.58) * exp(-k * k);
          }
          float halo = max(0.0, 1.0 - b / 1.6);
          vec3 col = front + back * edge * veil + vec3(1.0, 0.5, 0.2) * 0.05 * halo * halo * halo;
          gl_FragColor = vec4(col * uFade, mix(1.0, edge * veil, uFade));
        }`
      };
      const passes = {};

      const buffer = (data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      };
      const corners = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
      const sky = buffer(backdrop);
      const mist = buffer(haze);
      const dust = buffer(motes);
      const pool = [];
      const texture = gl.createTexture();
      // 雾画在一张长宽各一半的小图上再铺回来：雾本来就没有细节，能省下四分之三的填充
      const veil = { frame: gl.createFramebuffer(), image: gl.createTexture(), w: 0, h: 0, ok: false };
      const widest = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
      let scene = null;
      let layers = [];
      let pass = null;
      let lost = false;
      view.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        lost = true;
      });

      const look = (at) => {
        gl.uniform3f(at.uEye, lens.ex, lens.ey, lens.ez);
        gl.uniform3f(at.uRight, lens.rx, 0, lens.rz);
        gl.uniform3f(at.uUp, lens.ux, lens.uy, lens.uz);
        gl.uniform3f(at.uFwd, lens.fx, lens.fy, lens.fz);
        gl.uniform3f(at.uLens, focal / (w / 2), focal / (h / 2), (h / 2 - eyeline) / (h / 2));
      };
      // 画一批点：angle 是它们转过的角度，isFar 的贴在天球上（不随镜头远近变），cap 是最大能画多大（像素）
      const points = (kit, source, total, angle, isFar, grow, cap, soft) => {
        const at = kit.at;
        gl.bindBuffer(gl.ARRAY_BUFFER, source);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE * 4, 24);
        gl.uniform2f(at.uSpin, Math.cos(angle), Math.sin(angle));
        gl.uniform1f(at.uFar, isFar);
        gl.uniform1f(at.uGrow, grow);
        gl.uniform1f(at.uMax, Math.min(widest, cap));
        gl.uniform1f(at.uSoft, soft);
        gl.drawArrays(gl.POINTS, 0, total);
      };
      // 这一层跟不跟着心跳胀缩、变亮，要不要被中间的球挡住
      const tune = (at, fade, beat, ball) => {
        gl.uniform2f(at.uPulse, 1 + 0.028 * beat, scene.pivot || 0);
        gl.uniform1f(at.uFade, fade * (1 + 0.22 * beat));
        gl.uniform1f(at.uBall, ball);
      };
      // 铺满整个屏幕的一张面
      const sweep = () => {
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
      points(stars, sky, 0, 0, 1, 0, 1, 0);

      return {
        get lost() { return lost; },
        // 逐像素的那段着色器没编过：行星 / 黑洞得用 2D 画布画个替身
        get bare() { return !!scene && !!scene.pass && !pass; },
        resize() {
          view.width = w * dpr;
          view.height = h * dpr;
          veil.w = Math.ceil(view.width / 2);
          veil.h = Math.ceil(view.height / 2);
          gl.bindTexture(gl.TEXTURE_2D, veil.image);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, veil.w, veil.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindFramebuffer(gl.FRAMEBUFFER, veil.frame);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, veil.image, 0);
          veil.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        },
        // 换一幕：把这一年的星和雾送进显卡；星系那一幕还有一张底图，行星和黑洞各有一段逐像素的着色器
        load(model) {
          if (lost) return;
          scene = model.scene;
          layers = model.layers.map((layer, i) => {
            pool[i] = pool[i] || gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, pool[i]);
            gl.bufferData(gl.ARRAY_BUFFER, layer.data, gl.STATIC_DRAW);
            return { kind: layer.kind, spin: layer.spin, beat: layer.beat, source: pool[i], count: layer.data.length / STRIDE };
          });
          if (scene.sheet) {
            paint(model);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, sheet);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          }
          pass = null;
          if (scene.pass) {
            // 这两段着色器长，第一次用到才编译
            if (!(scene.pass in passes)) passes[scene.pass] = link(RAY, PASSES[scene.pass], ['uEye', 'uRight', 'uUp', 'uFwd', 'uLens', 'uTurn', 'uFade', 'uPx']);
            pass = passes[scene.pass];
          }
        },
        // beat 是这一刻心跳到了哪（0–1），只有爱心那一幕不是 0
        draw(now, fade, beat) {
          if (lost || !scene) return;
          const ball = scene.ball || 0;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, view.width, view.height);
          gl.clearColor(0.004, 0.006, 0.018, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);

          if (scene.sheet) {
            gl.useProgram(disc.program);
            look(disc.at);
            gl.uniform2f(disc.at.uSpin, Math.cos(turn), Math.sin(turn));
            gl.uniform1f(disc.at.uFade, fade);
            gl.uniform1i(disc.at.uSheet, 0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            sweep();
          }

          // 天球：几片淡星云和无穷远的星
          gl.useProgram(stars.program);
          look(stars.at);
          gl.uniform1f(stars.at.uDpr, dpr);
          tune(stars.at, fade, 0, 0);
          // 星云不闪：时间给 0，每个光斑的明暗就定住了
          gl.uniform1f(stars.at.uTime, 0);
          points(stars, mist, haze.length / STRIDE, 0, 1, 0, 240 * dpr, 0);
          gl.uniform1f(stars.at.uTime, (now % 600000) / 1000);
          points(stars, sky, backdrop.length / STRIDE, 0, 1, 0, 8 * dpr, 0);

          if (pass) {
            gl.useProgram(pass.program);
            look(pass.at);
            gl.uniform1f(pass.at.uTurn, -turn * scene.swirl);
            gl.uniform1f(pass.at.uFade, fade);
            gl.uniform1f(pass.at.uPx, 1 / (focal * dpr));
            // 先把身后的星光按「还剩多少」压暗，再加上自己的光
            gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
            sweep();
            gl.blendFunc(gl.ONE, gl.ONE);
          }

          if (fog && blit && veil.ok && layers.some((layer) => layer.kind !== 'stars')) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, veil.frame);
            gl.viewport(0, 0, veil.w, veil.h);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(fog.program);
            look(fog.at);
            // 雾团的大小记的是空间里的直径，这里换算成小图上的像素
            gl.uniform1f(fog.at.uDpr, (focal * veil.w) / w);
            gl.uniform1f(fog.at.uTime, 0);
            for (const layer of layers) {
              if (layer.kind === 'stars') continue;
              // 尘埃不发光，只把已经画上的雾压暗
              if (layer.kind === 'soot') gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
              else gl.blendFunc(gl.ONE, gl.ONE);
              tune(fog.at, 1, layer.beat ? beat : 0, ball);
              points(fog, layer.source, layer.count, turn * layer.spin, 0, 1, widest, 0);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, view.width, view.height);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(blit.program);
            gl.uniform1f(blit.at.uFade, fade);
            gl.uniform1i(blit.at.uSheet, 0);
            gl.bindTexture(gl.TEXTURE_2D, veil.image);
            sweep();
          }

          gl.useProgram(stars.program);
          for (const layer of layers) {
            if (layer.kind !== 'stars') continue;
            tune(stars.at, fade, layer.beat ? beat : 0, ball);
            points(stars, layer.source, layer.count, turn * layer.spin, 0, 0.55, 14 * dpr, 0);
          }
          // 飘在镜头附近的星尘
          tune(stars.at, fade, 0, ball);
          points(stars, dust, motes.length / STRIDE, 0, 0, 1, 44 * dpr, 0.12);
        }
      };
    })();

    // 舱盖：一整道拱形的厚玻璃，断面是圆的，像一根弯成拱的玻璃棒。拱是一条超椭圆，从窗柱到拱顶一路圆过去，
    // 没有折角。玻璃上的明暗只跟「离中线多远、在拱的哪一段」有关，所以尺寸变了才逐像素算一次，存成两张图
    // （压暗的一张、发亮的一张）。每帧只做三件事：把隧道画面沿着中线翻过来画进玻璃里（圆玻璃棒里看到的景
    // 是反的，光线穿过去会折一下），盖上那两张图，再描一段慢慢游走的高光
    const canopy = (() => {
      const pane = $('cockpitCanopy');
      const g = pane.getContext('2d');
      const EDGE = 4; // 驾驶舱四周比屏幕多出的一圈，和 .cockpit 的 inset 对应
      const N = 240; // 中线切成多少小段
      const SLABS = 40; // 折射分成多少段来翻
      const SPEC = -0.46; // 高光落在断面的哪儿：-1 是朝窗里的那条边，1 是贴着船壳的那条边
      const shade = document.createElement('canvas');
      const gloss = document.createElement('canvas');
      const bell = (x, at, wide) => Math.exp(-((x - at) * (x - at)) / (wide * wide));
      let W = 0;
      let H = 0;
      let built = '';
      let hull = null;
      let glint = null;
      let slabs = [];
      let scratches = [];

      // 拱的中线：超椭圆的上半边，按弧长均匀取 N + 1 个点，每个点带一条朝外的法线和这一处玻璃的半宽
      const spine = () => {
        const a = W * 0.462;
        const b = H * 0.925;
        const power = 2 / 3.6;
        const raw = [];
        let total = 0;
        for (let i = 0; i <= 1600; i++) {
          const at = Math.PI * (1.02 - 1.04 * (i / 1600));
          const c = Math.cos(at);
          const s = Math.sin(at);
          const p = {
            x: W / 2 + a * Math.sign(c) * Math.pow(Math.abs(c), power),
            y: H * 0.972 - b * Math.sign(s) * Math.pow(Math.abs(s), power),
            run: 0
          };
          if (i) total += Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y);
          p.run = total;
          raw.push(p);
        }
        const pts = [];
        for (let i = 0, k = 0; i <= N; i++) {
          const want = (total * i) / N;
          while (k < raw.length - 2 && raw[k + 1].run < want) k++;
          const p = raw[k];
          const q = raw[k + 1];
          const u = (want - p.run) / (q.run - p.run || 1);
          pts.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, nx: 0, ny: 0, half: W * (0.026 + 0.011 * Math.sin((Math.PI * i) / N)) });
        }
        for (let i = 0; i <= N; i++) {
          const p = pts[Math.max(0, i - 1)];
          const q = pts[Math.min(N, i + 1)];
          const len = Math.hypot(q.x - p.x, q.y - p.y);
          pts[i].nx = (q.y - p.y) / len;
          pts[i].ny = -(q.x - p.x) / len;
        }
        return pts;
      };

      // 离中线 by 个半宽（或再加 px 像素）的那条平行线，from 到 to 之间的一段
      const offset = (path, pts, by, px, from, to, move) => {
        const step = from < to ? 1 : -1;
        for (let i = from; i !== to + step; i += step) {
          const p = pts[i];
          const d = p.half * by + px;
          if (move && i === from) path.moveTo(p.x + p.nx * d, p.y + p.ny * d);
          else path.lineTo(p.x + p.nx * d, p.y + p.ny * d);
        }
        return path;
      };

      const build = () => {
        const pts = spine();
        const PW = pane.width;
        const PH = pane.height;
        // 每个像素离中线多远（带正负，朝外为正）、落在拱的哪一段。只算玻璃附近的一圈
        const reach = (pts[N >> 1].half + 20) * dpr;
        const near = new Float32Array(PW * PH).fill(reach * reach);
        const where = new Float32Array(PW * PH);
        const outer = new Uint8Array(PW * PH);
        for (let i = 0; i < N; i++) {
          const ax = pts[i].x * dpr;
          const ay = pts[i].y * dpr;
          const dx = pts[i + 1].x * dpr - ax;
          const dy = pts[i + 1].y * dpr - ay;
          const len = dx * dx + dy * dy;
          const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - reach));
          const x1 = Math.min(PW - 1, Math.ceil(Math.max(ax, ax + dx) + reach));
          const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - reach));
          const y1 = Math.min(PH - 1, Math.ceil(Math.max(ay, ay + dy) + reach));
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const px = x + 0.5 - ax;
              const py = y + 0.5 - ay;
              const u = Math.max(0, Math.min(1, (px * dx + py * dy) / len));
              const ex = px - dx * u;
              const ey = py - dy * u;
              const d = ex * ex + ey * ey;
              const k = y * PW + x;
              if (d < near[k]) {
                near[k] = d;
                where[k] = i + u;
                outer[k] = ex * dy - ey * dx > 0 ? 1 : 0;
              }
            }
          }
        }

        // 拱的哪一段受光：左肩最亮（舱里的灯），拱顶和右肩各兜着一点，窗柱下半截很暗
        const lit = pts.map((p, i) => {
          const s = i / N;
          return Math.min(1, 0.14 + 0.95 * bell(s, 0.3, 0.075) + 0.5 * bell(s, 0.71, 0.05) + 0.3 * bell(s, 0.5, 0.1) + 0.28 * bell(s, 0.13, 0.05) + 0.2 * bell(s, 0.88, 0.04));
        });

        shade.width = gloss.width = PW;
        shade.height = gloss.height = PH;
        const dark = shade.getContext('2d');
        const bright = gloss.getContext('2d');
        const a = dark.createImageData(PW, PH);
        const b = bright.createImageData(PW, PH);
        const limit = reach * reach;
        for (let k = 0; k < near.length; k++) {
          if (near[k] >= limit) continue;
          const j = Math.min(N, Math.round(where[k]));
          const half = pts[j].half * dpr;
          const glow = lit[j];
          const dist = Math.sqrt(near[k]);
          const t = ((outer[k] ? 1 : -1) * dist) / half;
          const off = Math.abs(t);
          // 在玻璃里是 1，出了玻璃是 0，边上一个多像素的过渡
          const cover = Math.max(0, Math.min(1, (half - dist) / 1.5 + 0.5));
          let red = 0;
          let green = 0;
          let blue = 0;
          if (cover > 0) {
            // 圆玻璃贴着两条边各有一道暗带，中间才是透的
            a.data[k * 4] = 4;
            a.data[k * 4 + 1] = 8;
            a.data[k * 4 + 2] = 24;
            a.data[k * 4 + 3] = 255 * cover * (0.24 + 0.4 * bell(off, 0.74, 0.15));
            // 断面是圆的：越靠两条边，玻璃面越是侧对着人，反的光越多（一片渐变，不是一条线）；朝光的一侧
            // 有一片柔的高光，受光最足的那几段中间再有一道亮芯；背光的一侧兜着一点散光
            const round = Math.pow(1 - Math.sqrt(Math.max(0, 1 - t * t)), 1.5);
            const edge = cover * (round * (0.2 + 0.3 * glow) + bell(off, 1, 0.07) * 0.16);
            const spec = cover * (bell(t, SPEC, 0.27) * (0.08 + 0.42 * glow) + bell(t, SPEC, 0.075) * glow * glow * 0.85);
            const back = cover * bell(t, 0.42, 0.3) * (0.07 + 0.12 * glow);
            red = 170 * edge + 255 * spec + 120 * back + 140 * cover * 0.06;
            green = 212 * edge + 255 * spec + 190 * back + 200 * cover * 0.06;
            blue = 255 * (edge + spec + back + cover * 0.06);
          }
          if (cover < 1) {
            const past = Math.max(0, dist - half) / dpr;
            if (outer[k]) {
              // 玻璃嵌在船壳里：贴着玻璃一圈金属压条的反光
              const lip = (1 - cover) * (0.1 * bell(past, 3, 1.6) + 0.07 * Math.exp(-past / 10));
              red += 120 * lip;
              green += 160 * lip;
              blue += 235 * lip;
            } else {
              // 玻璃的光往窗里漫出来一点
              const spill = (1 - cover) * Math.exp(-past / 8) * (0.045 + 0.075 * glow);
              red += 130 * spill;
              green += 180 * spill;
              blue += 255 * spill;
            }
          }
          const top = Math.max(red, green, blue);
          if (top > 0) {
            b.data[k * 4] = (red / top) * 255;
            b.data[k * 4 + 1] = (green / top) * 255;
            b.data[k * 4 + 2] = (blue / top) * 255;
            b.data[k * 4 + 3] = Math.min(255, top);
          }
        }
        dark.putImageData(a, 0, 0);
        bright.putImageData(b, 0, 0);

        // 整面玻璃是鼓出去的：舱里的灯映在上面是顺着拱弯过去的几道月牙，不是直的
        bright.setTransform(dpr, 0, 0, dpr, 0, 0);
        bright.globalCompositeOperation = 'lighter';
        bright.lineCap = 'round';
        bright.lineJoin = 'round';
        const crescent = (at, inset, spread, widths, alpha) => {
          const p = pts[Math.round(at * N)];
          const fade = bright.createRadialGradient(p.x, p.y, 0, p.x, p.y, W * spread);
          fade.addColorStop(0, `rgba(215, 232, 255, ${alpha})`);
          fade.addColorStop(0.5, `rgba(215, 232, 255, ${alpha * 0.4})`);
          fade.addColorStop(1, 'rgba(215, 232, 255, 0)');
          bright.strokeStyle = fade;
          const line = offset(new Path2D(), pts, -1, -inset, 0, N, true);
          for (const width of widths) {
            bright.lineWidth = width;
            bright.stroke(line);
          }
        };
        crescent(0.29, 44, 0.46, [56, 44, 32, 21, 11], 0.022);
        crescent(0.72, 32, 0.28, [36, 26, 16, 7], 0.014);
        bright.setTransform(1, 0, 0, 1, 0, 0);

        hull = offset(new Path2D(), pts, 1, -0.5, 0, N, true);
        hull.lineTo(W + 9, pts[N].y);
        hull.lineTo(W + 9, -9);
        hull.lineTo(-9, -9);
        hull.lineTo(-9, pts[0].y);
        hull.closePath();
        glint = offset(new Path2D(), pts, SPEC, 0, 0, N, true);

        // 折射：玻璃切成一段段，每段沿自己那一截中线把隧道画面翻过来。只画翻过来以后落在这一段里的那一小块
        const scale = canvas.width / w;
        slabs = [];
        for (let k = 0; k < SLABS; k++) {
          const from = Math.round((k * N) / SLABS);
          const to = Math.round(((k + 1) * N) / SLABS);
          // 两头各探出去不到半个像素，相邻两段之间才不会漏一条缝
          const path = new Path2D();
          for (const [i, side, lap] of [[from, -1, -0.4], [from, 1, -0.4], [to, 1, 0.4], [to, -1, 0.4]]) {
            if (side < 0 && i === to) offset(path, pts, -1, 0, to - 1, from + 1, false);
            path.lineTo(pts[i].x + pts[i].nx * pts[i].half * side - pts[i].ny * lap, pts[i].y + pts[i].ny * pts[i].half * side + pts[i].nx * lap);
            if (side > 0 && i === from) offset(path, pts, 1, 0, from + 1, to - 1, false);
          }
          path.closePath();
          const mid = pts[(from + to) >> 1];
          const tx = -mid.ny;
          const ty = mid.nx;
          const m = [2 * tx * tx - 1, 2 * tx * ty, 2 * tx * ty, 2 * ty * ty - 1, 0, 0];
          m[4] = mid.x - (m[0] * mid.x + m[2] * mid.y);
          m[5] = mid.y - (m[1] * mid.x + m[3] * mid.y);
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -Infinity;
          let y1 = -Infinity;
          for (let i = from; i <= to; i++) {
            for (const side of [-1, 1]) {
              const x = pts[i].x + pts[i].nx * pts[i].half * side;
              const y = pts[i].y + pts[i].ny * pts[i].half * side;
              const fx = m[0] * x + m[2] * y + m[4];
              const fy = m[1] * x + m[3] * y + m[5];
              x0 = Math.min(x0, fx);
              y0 = Math.min(y0, fy);
              x1 = Math.max(x1, fx);
              y1 = Math.max(y1, fy);
            }
          }
          x0 = Math.max(EDGE, Math.floor(x0 - 1));
          y0 = Math.max(EDGE, Math.floor(y0 - 1));
          x1 = Math.min(EDGE + w, Math.ceil(x1 + 1));
          y1 = Math.min(EDGE + h, Math.ceil(y1 + 1));
          if (x1 <= x0 || y1 <= y0) continue;
          slabs.push({ path, m, x: x0, y: y0, wide: x1 - x0, tall: y1 - y0, sx: (x0 - EDGE) * scale, sy: (y0 - EDGE) * scale, sw: (x1 - x0) * scale, sh: (y1 - y0) * scale });
        }
      };

      const resize = () => {
        W = w + EDGE * 2;
        H = h + EDGE * 2;
        const key = `${W}x${H}@${dpr}`;
        pane.width = W * dpr;
        pane.height = H * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.lineCap = 'round';
        if (key !== built) build();
        built = key;
        // 玻璃上的细划痕：迎着光看是绕着光源的一圈圈弧
        scratches = Array.from({ length: 54 }, () => ({ r: rand(0.1, 0.66), a: rand(0, Math.PI * 2), len: rand(0.05, 0.24) }));
      };

      const clear = () => g.clearRect(0, 0, W, H);

      // light 是隧道有多亮（0–1），cx / cy 是隧道尽头在屏幕上的位置
      const draw = (now, light, cx, cy) => {
        g.clearRect(0, 0, W, H);

        // 玻璃外面的船壳，只在两个上角露一点
        const shell = g.createLinearGradient(0, 0, 0, H * 0.72);
        shell.addColorStop(0, 'rgba(2, 3, 9, 0.97)');
        shell.addColorStop(1, 'rgba(6, 9, 24, 0.92)');
        g.fillStyle = shell;
        g.fill(hull);

        for (const s of slabs) {
          g.save();
          g.clip(s.path);
          g.transform(s.m[0], s.m[1], s.m[2], s.m[3], s.m[4], s.m[5]);
          g.drawImage(canvas, s.sx, s.sy, s.sw, s.sh, s.x, s.y, s.wide, s.tall);
          g.restore();
        }
        g.drawImage(shade, 0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.5 + light * 0.5;
        g.drawImage(gloss, 0, 0, W, H);

        // 高光里最亮的一小段，在两根窗柱上慢慢上下游走
        const at = 0.36 + 0.08 * Math.sin(now / 1400);
        const hot = g.createLinearGradient(0, 0, 0, H);
        hot.addColorStop(at - 0.16, 'rgba(255, 255, 255, 0)');
        hot.addColorStop(at, `rgba(255, 255, 255, ${0.55 + light * 0.4})`);
        hot.addColorStop(at + 0.18, 'rgba(255, 255, 255, 0)');
        g.strokeStyle = hot;
        for (const [width, alpha] of [[7, 0.1], [4, 0.2], [1.6, 0.7]]) {
          g.lineWidth = width;
          g.globalAlpha = alpha;
          g.stroke(glint);
        }
        g.globalCompositeOperation = 'source-over';

        g.strokeStyle = '#e6f0ff';
        g.lineWidth = 0.6;
        for (const s of scratches) {
          g.globalAlpha = (0.02 + light * 0.13) * (1 - s.r);
          g.beginPath();
          g.arc(EDGE + cx, EDGE + cy, s.r * W, s.a, s.a + s.len);
          g.stroke();
        }
        g.globalAlpha = 1;
      };

      return { resize, clear, draw };
    })();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = app.clientWidth;
      h = app.clientHeight;
      // 横向大约能看到 60° 的范围；视线正对的那一点放在屏幕中间偏上
      focal = w * 0.866;
      eyeline = h * 0.46;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (deep) deep.resize();
      canopy.resize();
    };

    // 星星里的圆形小照片
    const makeThumb = (img) => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 96;
      const g = sprite.getContext('2d');
      const scale = Math.max(96 / img.naturalWidth, 96 / img.naturalHeight);
      g.beginPath();
      g.arc(48, 48, 48, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img, 48 - (img.naturalWidth * scale) / 2, 48 - (img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
      return sprite;
    };

    // 每一年只搭一次，再进来时点亮过的星星还亮着
    const build = (item) => {
      if (item.cosmos) return item.cosmos;
      const list = albumOf(item);
      const order = Math.max(0, (data.timeline || []).indexOf(item));
      const model = stage(order);
      const scene = model.scene;
      // 照片星按这一幕的摆法排开（沿螺线，或者挂在一条闭合的曲线上），连起来是这一年走过的路
      const nodes = list.map((photo, i) => {
        const video = photo.type === 'video' || VIDEO.test(photo.src || '');
        const seat = scene.place(i, list.length, order);
        const node = {
          photo, video,
          ...seat,
          // 它在这一幕里的位置（整幕自转之前的）
          home: scene.curve ? scene.curve(seat.u) : [Math.cos(seat.angle) * seat.reach, seat.lift, Math.sin(seat.angle) * seat.reach],
          bob: 0, nudge: 0, wide: 0,
          thumb: null,
          ratio: 0,
          missing: !photo.src,
          seen: false,
          phase: noise(i, 3) * Math.PI * 2,
          // 以下每帧重算：此刻在空间里的位置、落在屏幕的哪里、离镜头多远
          x: 0,
          y: 0,
          z: 0,
          sx: 0,
          sy: 0,
          depth: 1,
          front: false,
          grow: 0
        };
        const cover = video ? photo.poster : photo.src;
        if (cover) {
          const img = new Image();
          img.onload = () => {
            node.thumb = makeThumb(img);
            if (!video) node.ratio = img.naturalWidth / img.naturalHeight;
          };
          img.onerror = () => { if (!video) node.missing = true; };
          img.src = cover;
        }
        return node;
      });

      // 时光倒流的读数：从这个月倒回到这一年（月）
      const now = new Date();
      const m = /^(\d{4})(?:\D+(\d{1,2}))?/.exec(item.date || '');
      const from = now.getFullYear() * 12 + now.getMonth();
      const to = m ? m[1] * 12 + (m[2] ? m[2] - 1 : 0) : from;
      item.cosmos = { nodes, model, scene, to, from: Math.max(from, to), monthly: !!(m && m[2]) };
      return item.cosmos;
    };

    const updateTip = () => {
      const total = entry.nodes.length;
      const seen = entry.nodes.filter((n) => n.seen).length;
      $('cosmosTip').textContent = !seen ? `${entry.scene.tip} · 轻点一颗亮星`
        : seen < total ? `已点亮 ${seen} / ${total} 颗`
          : '这一年的星星都亮了';
    };

    const stopMedia = () => {
      const video = $('viewerMedia').querySelector('video');
      if (video) video.pause();
      music.release();
    };

    const closeViewer = () => {
      stopMedia();
      $('viewerMedia').textContent = '';
      viewer.hidden = true;
      current = -1;
      cam.target = null;
    };

    // origin：卡片从哪里弹出来（相对屏幕中心的偏移）
    const view = (index, origin) => {
      const nodes = entry.nodes;
      current = (index + nodes.length) % nodes.length;
      const node = nodes[current];
      const photo = node.photo;
      node.seen = true;
      cam.target = node;
      cam.vyaw = cam.vpitch = 0;
      stopMedia();

      const media = $('viewerMedia');
      const empty = () => {
        media.textContent = '';
        media.appendChild(el('p', 'viewer-empty', photo.src ? `待放${node.video ? '视频' : '照片'} ${photo.src}` : '未设置照片'));
      };
      media.textContent = '';
      if (node.missing) {
        empty();
      } else if (node.video) {
        const video = el('video');
        video.controls = true;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', '');
        video.preload = 'metadata';
        if (photo.poster) video.poster = photo.poster;
        video.onerror = empty;
        video.src = photo.src;
        media.appendChild(video);
        // 视频有自己的声音，播放时先把背景音乐停一下
        music.hold();
        video.play().catch(() => {});
      } else {
        const img = el('img');
        img.alt = photo.title || '';
        if (node.ratio) img.style.aspectRatio = node.ratio;
        img.onerror = empty;
        img.src = photo.src;
        media.appendChild(img);
      }

      $('viewerIndex').textContent = `${pad(current + 1)} / ${pad(nodes.length)}`;
      $('viewerTitle').textContent = photo.title || '';
      $('viewerText').textContent = photo.text || '';
      card.style.setProperty('--ox', `${origin.x}px`);
      card.style.setProperty('--oy', `${origin.y}px`);
      viewer.hidden = false;
      // 换一颗星时让弹出动画重新播一遍
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
      updateTip();
    };

    const arrive = (now) => {
      mode = 'sky';
      began = now;
      nextMeteor = now + 2500;
      root.classList.remove('is-warp');
      root.classList.add('is-sky');
      music.drop();
      cockpit.style.transform = '';
      cockpit.style.setProperty('--surge', 0);
    };

    // 仪表上的字每帧都在算，变了才写
    const setText = (id, text) => {
      const node = $(id);
      if (node.textContent !== text) node.textContent = text;
    };

    // 穿越的快慢：坐稳、点火停一拍，中间加速再减速，到站后再缓一拍。画面和手上的震动都跟着它走
    const surgeAt = (p) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.16) / 0.74))), 1.4);

    const drawWarp = (now, step) => {
      const p = Math.min(1, (now - began) / warpMs);
      const surge = surgeAt(p);
      const speed = 0.0012 + 0.05 * surge;
      // 飞船在轻轻压弯，隧道尽头相对准星左右漂
      const cx = w / 2 + Math.sin(now / 1100) * w * 0.04 * surge;
      const cy = h * 0.42 + Math.cos(now / 1500) * w * 0.025 * surge;
      const swirl = 0.5 * surge;

      const shakeX = rand(-1, 1) * surge * 1.6;
      const shakeY = rand(-1, 1) * surge * 1.6;
      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.globalCompositeOperation = 'lighter';

      const halo = 110 + 210 * surge;
      ctx.globalAlpha = 0.18 + 0.5 * surge;
      ctx.drawImage(glowSprite(228), cx - halo, cy - halo, halo * 2, halo * 2);

      // 迎面扑来的一团团星云，贴着舷窗擦过去：光有线条只是在看隧道，有它才像是自己在往里冲
      if (clouds.length < 12 && Math.random() < 0.07 * surge * step) {
        clouds.push({ a: rand(0, Math.PI * 2), r: rand(0.25, 0.95), z: 1, hue: pick([215, 250, 285, 320]) });
      }
      for (const c of clouds) {
        c.z -= speed * 0.7 * step;
        if (c.z <= 0.06) continue;
        const size = (0.2 / c.z) * w;
        ctx.globalAlpha = Math.min(1, (1 - c.z) * 3, (c.z - 0.06) * 6) * 0.22;
        ctx.drawImage(puff(c.hue, 0.8, 0.6), cx + ((Math.cos(c.a) * c.r) / c.z) * w * 0.5 - size, cy + ((Math.sin(c.a) * c.r) / c.z) * w * 0.5 - size, size * 2, size * 2);
      }
      clouds = clouds.filter((c) => c.z > 0.06);

      // 一圈圈迎面扩大的光环，隧道感主要靠它
      ringClock += step * 16.67 * surge * 1.35;
      if (ringClock > 210) {
        ringClock = 0;
        rings.push({ z: 1, hue: rand(215, 285) });
      }
      for (const r of rings) {
        r.z -= speed * 0.85 * step;
        if (r.z <= 0.04) continue;
        ctx.globalAlpha = Math.min(1, r.z * 9) * (1 - r.z) * 0.34;
        ctx.strokeStyle = `hsl(${r.hue}, 90%, 74%)`;
        ctx.lineWidth = 1 + (1 - r.z) * 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, (0.15 / r.z) * w, 0, Math.PI * 2);
        ctx.stroke();
      }
      rings = rings.filter((r) => r.z > 0.04);

      // 被拉成线的星星；越近拧得越多，整条隧道是个漩涡
      for (const s of streaks) {
        s.z -= speed * s.k * step;
        if (s.z <= 0.02) {
          s.z = 1;
          continue;
        }
        const tail = Math.min(1.15, s.z + speed * s.k * 8 + 0.003);
        const b = s.a + swirl * (1 - tail);
        const tx = cx + ((Math.cos(b) * s.r) / tail) * w * 0.5;
        const ty = cy + ((Math.sin(b) * s.r) / tail) * w * 0.5;
        // 尾巴也出了屏幕才算飞过去，不然头一出界整条光迹会突然消失
        if (tx < -40 || tx > w + 40 || ty < -40 || ty > h + 40) {
          s.z = 1;
          continue;
        }
        const a = s.a + swirl * (1 - s.z);
        const dx = cx + ((Math.cos(a) * s.r) / s.z) * w * 0.5 - tx;
        const dy = cy + ((Math.sin(a) * s.r) / s.z) * w * 0.5 - ty;
        const len = Math.hypot(dx, dy) || 0.001;
        const near = 1 - s.z;
        const half = (2.2 + near * 10) * s.size;
        const alpha = Math.min(1, near * 1.7) * s.lum * (0.82 + 0.18 * Math.sin(now * s.blink + s.a * 40));
        // 还在隧道尽头、暗得看不见的就不画了
        if (alpha < 0.04) continue;
        // 头朝飞的方向：把坐标系挪到头上、转过去，贴图往身后铺
        const ux = (dx / len) * dpr;
        const uy = (dy / len) * dpr;
        ctx.setTransform(ux, uy, -uy, ux, (tx + dx + shakeX) * dpr, (ty + dy + shakeY) * dpr);
        if (len > 1.5) {
          ctx.globalAlpha = alpha * Math.min(1, len / half);
          ctx.drawImage(trail(s.look), -len, -half, len, half * 2);
        }
        if (s.size > 1.5 && len > 1.5) {
          // 离得近的大星再罩一层更宽更淡的光
          ctx.globalAlpha = alpha * 0.3 * Math.min(1, len / half);
          ctx.drawImage(trail(s.look), -len * 0.8, -half * 2.4, len * 0.8, half * 4.8);
        }
        // 星星本身：一颗白热的光点顶在最前面
        const bead = half * (0.5 + 0.22 * Math.min(1, len / 60));
        ctx.globalAlpha = alpha;
        ctx.drawImage(glowSprite(TRAIL_HUES[s.look % TRAIL_HUES.length]), -bead, -bead, bead * 2, bead * 2);
      }
      ctx.setTransform(dpr, 0, 0, dpr, shakeX * dpr, shakeY * dpr);

      // 读数的头尾各留一小段不动，看得清从哪年出发、到了哪年
      const q = Math.min(1, Math.max(0, (p - 0.2) / 0.66));
      const eased = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      const months = Math.round(entry.from + (entry.to - entry.from) * eased);
      const year = Math.floor(months / 12);

      // 路过的每一年，从隧道尽头迎面飞来、擦着舷窗掠过去
      if (year < passed) {
        passed = year;
        if (year > Math.floor(entry.to / 12)) {
          flybys.push({ text: String(year), z: 1, side: flybys.length % 2 ? 1 : -1, lift: rand(-0.035, 0.02) });
        }
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#cfe2ff';
      for (const f of flybys) {
        f.z -= (0.011 + speed * 0.45) * step;
        if (f.z <= 0.05) continue;
        ctx.globalAlpha = Math.min(1, (1 - f.z) * 4) * Math.min(1, (f.z - 0.05) * 9) * 0.9;
        ctx.font = `italic ${Math.min(260, 12 / f.z)}px Didot, "Bodoni 72", Georgia, serif`;
        ctx.fillText(f.text, cx + ((f.side * 0.075) / f.z) * w * 0.5, cy + (f.lift / f.z) * w * 0.5);
      }
      flybys = flybys.filter((f) => f.z > 0.05);
      ctx.restore();
      canopy.draw(now, surge, cx, cy);

      // 驾驶舱：仪表跟着推力走，钟往回转，挂饰被甩起来，整个舱在抖
      if (entry.from > entry.to) spin += surge * step * 0.06;
      cockpit.style.setProperty('--surge', surge.toFixed(3));
      cockpit.style.setProperty('--spin', spin.toFixed(3));
      cockpit.style.setProperty('--sway', `${((4 + surge * 9) * Math.sin(now / 300) + surge * 7).toFixed(2)}deg`);
      cockpit.style.transform = `translate3d(${(rand(-1, 1) * surge * 2.2).toFixed(2)}px, ${(rand(-1, 1) * surge * 2.2).toFixed(2)}px, 0)`;

      setText('warpDate', entry.monthly ? `${year}.${pad((months % 12) + 1)}` : String(year));
      setText('hudSpeed', `${(surge * 0.99).toFixed(2)} c`);
      setText('hudBack', `${entry.from - months} 个月`);

      if (p >= 1) {
        // 引擎停下，落地时顿一下
        feedback.hush('arrive');
        arrive(now);
      }
    };

    // 没有 WebGL 时的替身：每一层星只挑一小部分，用小方块画在 2D 画布上
    const sparse = (fade) => {
      const model = entry.model;
      if (!model.dots) {
        model.dots = model.layers.filter((layer) => layer.kind === 'stars').map((layer) => {
          const p = layer.data;
          const list = [];
          const skip = STRIDE * Math.max(1, Math.round(p.length / STRIDE / 2600));
          for (let i = 0; i < p.length; i += skip) {
            const peak = Math.max(p[i + 3], p[i + 4], p[i + 5], 0.01);
            list.push({
              x: p[i], y: p[i + 1], z: p[i + 2],
              alpha: Math.min(1, peak * 1.5),
              color: `rgb(${[3, 4, 5].map((k) => Math.round((p[i + k] / peak) * 255)).join(', ')})`
            });
          }
          return { spin: layer.spin, list };
        });
      }
      ctx.fillStyle = '#dfe8ff';
      for (let i = 0; i < backdrop.length; i += STRIDE * 3) {
        const p = cast(backdrop[i], backdrop[i + 1], backdrop[i + 2]);
        if (p.z <= 0.05 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
        ctx.globalAlpha = fade * Math.min(1, backdrop[i + 3] + 0.2);
        ctx.fillRect(p.x, p.y, 1, 1);
      }
      if (model.look) {
        // 星系盘面的底光：一团压扁的雾
        const mid = project(0, 0, 0);
        const glow = (focal * 0.95) / mid.z;
        ctx.globalAlpha = 0.5 * fade;
        ctx.drawImage(puff(model.look.arm, 0.6, 0.45), mid.x - glow, mid.y + glow * lens.fy, glow * 2, glow * -2 * lens.fy);
      }
      for (const group of model.dots) {
        const c = Math.cos(turn * group.spin);
        const s = Math.sin(turn * group.spin);
        for (const d of group.list) {
          const p = project(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
          if (p.z <= 0.05 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
          const size = Math.min(2.4, 0.5 + 1 / p.z);
          ctx.globalAlpha = fade * d.alpha;
          ctx.fillStyle = d.color;
          ctx.fillRect(p.x, p.y, size, size);
        }
      }
    };

    // 行星和黑洞在画不了逐像素那一段时的替身：一颗球，加一圈压扁的环（后半圈在球后面，前半圈在球前面）
    const standIn = (fade) => {
      const scene = entry.scene;
      const mid = project(0, 0, 0);
      const k = focal / mid.z;
      const dark = scene.pass === 'hole';
      const band = (from, to) => {
        ctx.save();
        ctx.translate(mid.x, mid.y);
        ctx.scale(1, Math.max(0.02, -lens.fy));
        ctx.globalAlpha = 0.5 * fade;
        ctx.strokeStyle = dark ? '#ff9a4a' : '#e8d4bc';
        ctx.lineWidth = 0.4 * k;
        ctx.beginPath();
        ctx.arc(0, 0, 0.55 * k, from, to);
        ctx.stroke();
        ctx.restore();
      };
      ctx.globalCompositeOperation = 'source-over';
      band(Math.PI, TAU);
      const r = scene.ball * k;
      const grad = ctx.createRadialGradient(mid.x - r * 0.4, mid.y - r * 0.3, 0, mid.x, mid.y, r);
      grad.addColorStop(0, dark ? '#000' : '#ffe2c4');
      grad.addColorStop(1, dark ? '#000' : '#3a2646');
      ctx.globalAlpha = fade;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, r, 0, TAU);
      ctx.fill();
      band(0, Math.PI);
      ctx.globalCompositeOperation = 'lighter';
    };

    // 恒星外面的一大圈光：贴着星面最亮，往外很快淡下去，到九个半径远就没了。一颗星一张图，画一次存起来
    const flare = (sun) => {
      if (!sun.flare) {
        const size = 216;
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = size;
        const g = sprite.getContext('2d');
        const image = g.createImageData(size, size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const d = Math.max(1, Math.hypot(x - 107.5, y - 107.5) / 12);
            const at = (y * size + x) * 4;
            for (let k = 0; k < 3; k++) image.data[at + k] = sun.color[k] * 255;
            image.data[at + 3] = d < 9 ? 255 * Math.min(1, 0.8 * Math.pow(d, -2.5) * Math.pow(1 - d / 9, 2)) : 0;
          }
        }
        g.putImageData(image, 0, 0);
        sun.flare = sprite;
      }
      return sun.flare;
    };
    // 恒星的星面：中间白热，越靠边越斜着看过去，颜色越深。[离圆心多远, 颜色]
    const limb = (sun) => {
      if (!sun.limb) {
        sun.limb = [0, 0.35, 0.6, 0.8, 0.92, 0.975, 1].map((d) => {
          const mu = Math.sqrt(1 - d * d);
          const hot = Math.pow(mu, 1.6) * 0.9;
          const edge = ease(0, 0.22, mu);
          const rgb = sun.color.map((v) => Math.round(255 * Math.min(1, (v * v * 0.82 * (1 - hot) + hot) * edge + v * 0.55 * (1 - edge))));
          return [d, `rgb(${rgb.join(', ')})`];
        });
      }
      return sun.limb;
    };

    // 从镜头看过去，空间里的一点是不是被一颗球挡在了身后。球心都在盘面上（cx, 0, cz）
    const eclipsed = (x, y, z, cx, cz, r) => {
      const dx = x - lens.ex;
      const dy = y - lens.ey;
      const dz = z - lens.ez;
      const len = Math.hypot(dx, dy, dz) || 1;
      const ox = lens.ex - cx;
      const oz = lens.ez - cz;
      const b = (ox * dx + lens.ey * dy + oz * dz) / len;
      const h = b * b - (ox * ox + lens.ey * lens.ey + oz * oz) + r * r;
      return h > 0 && b < 0 && -b - Math.sqrt(h) < len;
    };

    const DIVE_MS = 2800;

    const drawSky = (now, step) => {
      const nodes = entry.nodes;
      const scene = entry.scene;
      const age = now - began;
      const calm = reduceMotion ? 0 : 1;

      if (cam.target) {
        // 镜头绕到正在看的那颗星这一侧，走近的那一边；只能从正面看的那一幕就朝它偏过去一点
        let swing = ((scene.sway ? cam.target.x * 0.8 : Math.atan2(cam.target.x, cam.target.z)) - cam.yaw) % TAU;
        if (swing > Math.PI) swing -= TAU;
        if (swing < -Math.PI) swing += TAU;
        cam.yaw += swing * Math.min(1, 0.05 * step);
      } else if (!drag) {
        // 松手后带一点惯性
        cam.yaw += cam.vyaw * step;
        cam.pitch += cam.vpitch * step;
        cam.vyaw *= Math.pow(0.9, step);
        cam.vpitch *= Math.pow(0.9, step);
        // 没人碰的时候镜头自己绕着慢慢飘；只能从正面看的那一幕是回到正面，左右来回晃
        if (scene.sway) cam.yaw += (calm * scene.sway * Math.sin(now / 6000) - cam.yaw) * Math.min(1, 0.012 * step);
        else cam.yaw -= calm * 0.0005 * step;
      }
      if (scene.sway) cam.yaw = clamp(cam.yaw, -scene.sway * 2, scene.sway * 2);
      cam.pitch = clamp(cam.pitch, scene.tilt[0], scene.tilt[1]);
      turn -= calm * 0.00022 * step;

      // 心跳：咚、咚两下，然后歇一会儿
      let beat = 0;
      if (scene.beats && !reduceMotion) {
        const p = (now / 1150) % 1;
        beat = Math.exp(-Math.pow((p - 0.12) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.34) / 0.07, 2));
      }

      // 刚出隧道时这一幕还在远处的下方，镜头一边俯冲一边绕进去、把视线压平；之后一直有一点很慢的漂浮
      const out = reduceMotion ? 0 : Math.pow(1 - Math.min(1, age / DIVE_MS), 3);
      aim(
        cam.yaw + out * 1.2 + calm * 0.02 * Math.sin(now / 5200),
        cam.pitch + (scene.dive - cam.pitch) * out + calm * 0.012 * Math.cos(now / 6700),
        scene.rest.dist * (1 + out * 1.5) + calm * 0.02 * Math.sin(now / 8300)
      );
      const fade = Math.min(1, age / 700);
      const flat = !deep || deep.lost;
      if (!flat) deep.draw(now, fade, beat);

      ctx.globalCompositeOperation = 'lighter';
      if (flat) sparse(fade);
      if (scene.pass && (flat || deep.bare)) standIn(fade);

      // 整幕转到了哪；这一帧挡在前面的球（行星、黑洞，或者两颗恒星）
      const c = scene.spins ? Math.cos(turn) : 1;
      const s = scene.spins ? Math.sin(turn) : 0;
      const orbs = scene.ball ? [{ x: 0, z: 0, r: scene.ball }]
        : scene.suns ? SUNS.map((sun) => ({ sun, x: sun.x * c, z: sun.x * s, r: sun.r }))
          : [];
      const covered = (x, y, z) => orbs.some((o) => eclipsed(x, y, z, o.x, o.z, o.r));

      // 很远的别的星系
      const mass = scene.ball || scene.bulk || 0;
      for (const g of far) {
        const p = cast(g.x, g.y, g.z);
        if (p.z <= 0.05 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
        // 正好落在盘面或者中间那一团后面的不画：它在后面，而这一层画在上面
        if (scene.disc && g.y < 0 && Math.hypot(lens.ex - (lens.ey / g.y) * g.x, lens.ez - (lens.ey / g.y) * g.z) < scene.disc) continue;
        const b = lens.ex * g.x + lens.ey * g.y + lens.ez * g.z;
        if (b < 0 && b * b - (lens.ex * lens.ex + lens.ey * lens.ey + lens.ez * lens.ez) + mass * mass > 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(g.tilt);
        ctx.scale(1, g.flat);
        ctx.globalAlpha = 0.34 * fade;
        ctx.drawImage(puff(g.hue, 0.6, 0.66), -g.size, -g.size, g.size * 2, g.size * 2);
        ctx.restore();
      }

      if (scene.bloom) {
        // 星系核心的光晕，一呼一吸
        const core = project(0, 0, 0);
        const bloom = ((focal * 0.17) / core.z) * (1 + 0.06 * Math.sin(now / 1900));
        const squash = 0.6 - 0.4 * lens.fy;
        ctx.globalAlpha = 0.22 * fade;
        ctx.drawImage(glowSprite(40), core.x - bloom, core.y - bloom * squash, bloom * 2, bloom * 2 * squash);
      }

      // 星云中间最亮的几颗新星：各带一道十字星芒，忽长忽短
      if (entry.model.sparks) {
        const sprite = glowSprite(205);
        const sc = Math.cos(turn);
        const ss = Math.sin(turn);
        for (const [x, y, z, len, phase] of entry.model.sparks) {
          const p = project(x * sc - z * ss, y, x * ss + z * sc);
          if (p.z <= 0.05) continue;
          const ray = (len / p.z) * (1 + calm * 0.25 * Math.sin(now / 800 + phase));
          ctx.globalAlpha = 0.8 * fade;
          ctx.drawImage(sprite, p.x - ray, p.y - 1.1, ray * 2, 2.2);
          ctx.drawImage(sprite, p.x - 1.1, p.y - ray, 2.2, ray * 2);
        }
      }

      // 两颗恒星：一圈光、实心的星面、十字星芒。远的那颗先画
      if (scene.suns) {
        const pair = orbs.map((o) => {
          const p = project(o.x, 0, o.z);
          return { sun: o.sun, x: p.x, y: p.y, z: p.z };
        }).sort((a, b) => b.z - a.z);
        for (const o of pair) {
          if (o.z <= 0.05) continue;
          const sun = o.sun;
          const r = (sun.r * focal) / o.z;
          ctx.globalAlpha = fade;
          ctx.drawImage(flare(sun), o.x - r * 9, o.y - r * 9, r * 18, r * 18);
          ctx.globalCompositeOperation = 'source-over';
          const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
          limb(sun).forEach(([d, color]) => grad.addColorStop(d, color));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(o.x, o.y, r, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          const ray = (sun.ray / o.z) * (1 + calm * 0.06 * Math.sin(now / 1700 + sun.x * 9));
          const sprite = glowSprite(sun.hue);
          ctx.globalAlpha = 0.85 * fade;
          ctx.drawImage(sprite, o.x - ray, o.y - 1.6, ray * 2, 3.2);
          ctx.drawImage(sprite, o.x - 1.6, o.y - ray, 3.2, ray * 2);
        }
      }

      // 流星
      if (!reduceMotion && now > nextMeteor) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        meteors.push({ x: rand(w * 0.2, w * 0.8), y: rand(0, h * 0.35), vx: dir * rand(5, 8), vy: rand(2.5, 4), life: 1 });
        nextMeteor = now + rand(3500, 8000);
      }
      for (const m of meteors) {
        m.x += m.vx * step;
        m.y += m.vy * step;
        m.life -= 0.022 * step;
        if (m.life <= 0) continue;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        grad.addColorStop(1, 'rgba(160, 200, 255, 0)');
        ctx.globalAlpha = Math.min(1, m.life * 2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12);
        ctx.stroke();
      }
      meteors = meteors.filter((m) => m.life > 0);

      // 这一幕里的一个点（自转、心跳之前的位置）此刻在空间的哪里（记在 here 里）、落在屏幕的哪里
      const swell = 1 + 0.028 * beat;
      const pivot = scene.pivot || 0;
      const here = { x: 0, y: 0, z: 0 };
      const hang = (hx, hy, hz, bob) => {
        here.x = (hx * c - hz * s) * swell;
        here.y = (hy - pivot) * swell + pivot + bob;
        here.z = (hx * s + hz * c) * swell;
        return project(here.x, here.y, here.z);
      };

      // 先算出每颗照片星此刻在哪、落在屏幕的哪里，连线和点击判断都要用。星星轻轻浮沉
      nodes.forEach((n, i) => {
        n.bob = calm * 0.012 * Math.sin(now / 1300 + n.phase);
        const p = hang(n.home[0], n.home[1], n.home[2], n.bob);
        n.x = here.x;
        n.y = here.y;
        n.z = here.z;
        n.front = p.z > 0.05 && !covered(n.x, n.y, n.z);
        n.sx = p.x;
        n.sy = p.y;
        n.depth = p.z;
        n.grow = reduceMotion ? 1 : Math.max(0, Math.min(1, (age - 900 - i * 170) / 600));
      });

      // 两颗星之间那段路上的一点：挂在曲线上的顺着曲线走，沿螺线排的角度和远近各走各的
      const trace = (a, b, bu, t) => {
        const bob = a.bob + (b.bob - a.bob) * t;
        if (scene.curve) {
          const q = scene.curve(a.u + (bu - a.u) * t);
          return hang(q[0], q[1], q[2], bob);
        }
        const angle = a.angle + (b.angle - a.angle) * t;
        const reach = a.reach + (b.reach - a.reach) * t;
        return hang(Math.cos(angle) * reach, a.lift + (b.lift - a.lift) * t, Math.sin(angle) * reach, bob);
      };
      // 把这一年的星星按顺序连起来；挂在闭合曲线上的，最后一颗再连回第一颗，围成一整圈。
      // [从哪颗, 到哪颗, 到的那颗在曲线上的位置, 这一段长出来多少]
      const legs = [];
      for (let i = 1; i < nodes.length; i++) legs.push([nodes[i - 1], nodes[i], nodes[i].u, nodes[i].grow]);
      if (scene.curve) legs.push([nodes[nodes.length - 1], nodes[0], nodes[0].u + TAU, nodes[nodes.length - 1].grow]);
      const steps = scene.curve ? 24 : 12;
      ctx.lineWidth = 1;
      for (const [a, b, bu, grow] of legs) {
        if (!grow) continue;
        // 两头都点亮了就变成金色实线
        const lit = a.seen && b.seen;
        ctx.globalAlpha = (lit ? 0.62 : 0.3) * grow;
        ctx.strokeStyle = lit ? '#ffd9a0' : '#bcd0ff';
        ctx.setLineDash(lit ? [] : [2, 5]);
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= steps; k++) {
          const p = trace(a, b, bu, (k / steps) * grow);
          // 被球挡住的那一截不画
          if (p.z <= 0.05 || covered(here.x, here.y, here.z)) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 一粒光顺着这条线流：闭合的一圈上它一直转，螺线上它流到头就消失，歇一下从头再来
      if (legs.length && !reduceMotion && nodes[nodes.length - 1].grow >= 1) {
        const at = scene.curve ? (now / 1500) % legs.length : ((now / 1500) % (legs.length + 1.6)) - 0.3;
        const i = clamp(Math.floor(at), 0, legs.length - 1);
        const p = trace(legs[i][0], legs[i][1], legs[i][2], clamp(at - i, 0, 1));
        if (p.z > 0.05 && !covered(here.x, here.y, here.z)) {
          ctx.globalAlpha = scene.curve ? 1 : clamp(Math.min((at + 0.3) * 3, (legs.length + 0.3 - at) * 3), 0, 1);
          ctx.drawImage(glowSprite(40), p.x - 6, p.y - 6, 12, 12);
        }
      }

      ctx.font = LABEL;
      ctx.textBaseline = 'middle';
      // 镜头压得低的时候几颗星几乎排成一行，小字会叠在一起：挨得太近的上下错开，慢慢挪过去不跳
      const taken = [];
      for (const n of nodes) {
        if (!scene.stems || !n.front || !n.grow || !n.photo.title) continue;
        if (!n.wide) n.wide = ctx.measureText(n.photo.title).width;
        const x0 = n.sx > w * 0.6 ? n.sx - 17 - n.wide : n.sx + 17;
        let y = n.sy;
        for (const t of taken) {
          if (x0 < t.x1 + 6 && x0 + n.wide > t.x0 - 6 && Math.abs(y - t.y) < 14) y = t.y + (n.sy + n.nudge >= t.y ? 14 : -14);
        }
        n.nudge += (y - n.sy - n.nudge) * Math.min(1, 0.14 * step);
        taken.push({ x0, x1: x0 + n.wide, y });
      }
      for (const n of nodes) {
        if (!n.front || !n.grow) continue;
        const slow = 0.5 + 0.5 * Math.sin(now / 620 + n.phase);
        const quick = 0.5 + 0.5 * Math.sin(now / 97 + n.phase * 3);
        const r = Math.max(5, Math.min(10, 7.5 * Math.pow(n.depth, -0.7))) * backOut(n.grow);
        const sprite = glowSprite(n.seen ? 40 : 205);
        ctx.globalCompositeOperation = 'lighter';

        if (scene.stems) {
          // 垂到盘面上的一道细光和落点的一小团亮：看得出这颗星悬在盘面上方多高
          const foot = hang(n.home[0], 0, n.home[2], 0);
          const stem = ctx.createLinearGradient(n.sx, n.sy, foot.x, foot.y);
          stem.addColorStop(0, n.seen ? 'rgba(255, 217, 160, 0.55)' : 'rgba(190, 215, 255, 0.5)');
          stem.addColorStop(1, 'rgba(190, 215, 255, 0)');
          ctx.globalAlpha = n.grow;
          ctx.strokeStyle = stem;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(n.sx, n.sy);
          ctx.lineTo(foot.x, foot.y);
          ctx.stroke();
          ctx.globalAlpha = n.grow * (0.25 + 0.2 * slow);
          ctx.drawImage(sprite, foot.x - r * 1.6, foot.y + r * 1.6 * lens.fy, r * 3.2, r * -3.2 * lens.fy);
        }

        if (!reduceMotion) {
          // 一圈圈往外荡开的光环：有盘面的和盘面一个朝向，没有的就正对着我们
          const wave = (now / 2600 + n.phase) % 1;
          const wide = 0.012 + 0.07 * wave;
          ctx.globalAlpha = n.grow * (1 - wave) * 0.55;
          ctx.strokeStyle = n.seen ? '#ffd9a0' : '#cfe2ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k <= 28; k++) {
            const a = (k / 28) * TAU;
            const p = scene.stems ? project(n.x + Math.cos(a) * wide, n.y, n.z + Math.sin(a) * wide)
              : project(n.x + Math.cos(a) * wide, n.y + Math.sin(a) * wide, n.z);
            if (k) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          }
          ctx.stroke();

          // 绕着它转的几粒星屑，各在各的轨道上，拖一条小尾巴
          for (let k = 0; k < 3; k++) {
            const way = k % 2 ? -1 : 1;
            const loop = 0.03 + k * 0.011;
            for (let t = 6; t >= 0; t--) {
              const a = way * (now / (520 + k * 190) - t * 0.13) + n.phase * (k + 2);
              const p = project(n.x + Math.cos(a) * loop, n.y + Math.sin(a) * loop * (k - 1) * 0.6, n.z + Math.sin(a) * loop);
              const size = (2.6 - t * 0.3) * Math.min(1.6, 1.2 / p.z);
              ctx.globalAlpha = n.grow * (1 - t / 7) * 0.9;
              ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
            }
          }
        }

        // 光晕和十字星芒，忽大忽小就是在「闪」
        const halo = r * (2.3 + 0.6 * slow);
        ctx.globalAlpha = n.grow * (0.5 + 0.3 * slow + 0.15 * quick);
        ctx.drawImage(sprite, n.sx - halo, n.sy - halo, halo * 2, halo * 2);
        const ray = r * (2.6 + 2.4 * slow + 0.7 * quick);
        ctx.globalAlpha = n.grow * (0.4 + 0.5 * slow);
        ctx.drawImage(sprite, n.sx - ray, n.sy - 1.3, ray * 2, 2.6);
        ctx.drawImage(sprite, n.sx - 1.3, n.sy - ray, 2.6, ray * 2);

        if (n.thumb) {
          // 星星中间嵌着小小的一张照片
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = n.grow * (n.seen ? 1 : 0.9);
          ctx.drawImage(n.thumb, n.sx - r, n.sy - r, r * 2, r * 2);
          ctx.globalAlpha = n.grow * 0.85;
          ctx.strokeStyle = n.seen ? '#ffd9a0' : '#dbe8ff';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 0.6, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // 照片还没放进来、或者是没有封面的视频：就是一颗亮星
          ctx.globalAlpha = n.grow;
          ctx.drawImage(sprite, n.sx - r * 0.9, n.sy - r * 0.9, r * 1.8, r * 1.8);
          if (n.video) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#0a1024';
            ctx.beginPath();
            ctx.moveTo(n.sx - r * 0.22, n.sy - r * 0.36);
            ctx.lineTo(n.sx + r * 0.4, n.sy);
            ctx.lineTo(n.sx - r * 0.22, n.sy + r * 0.36);
            ctx.fill();
          }
        }

        // 旁边的小字，靠右的星星把字放在左边，免得出屏；离得远的字淡一些。
        // 星星围着爱心挂一圈的那一幕，字放在圈外：上半圈的在星星上面，下半圈的在下面
        if (n.photo.title) {
          const left = n.sx > w * 0.6;
          const side = scene.stems ? (left ? -1 : 1) * (r + 9) : 0;
          const drop = scene.stems ? n.nudge : (n.home[1] > pivot ? -1 : 1) * (r + 13);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = n.grow * (n.seen ? 0.95 : 0.78) * Math.max(0.55, Math.min(1, 1.25 / n.depth));
          ctx.fillStyle = n.seen ? '#ffe9c4' : '#eef3ff';
          ctx.textAlign = !scene.stems ? 'center' : left ? 'right' : 'left';
          // 字压在一片星光上，先描一圈暗边才看得清
          ctx.strokeStyle = 'rgba(3, 5, 16, 0.7)';
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.strokeText(n.photo.title, n.sx + side, n.sy + drop);
          ctx.fillText(n.photo.title, n.sx + side, n.sy + drop);
        }
      }
    };

    const frame = (now) => {
      if (mode === 'off') {
        looping = false;
        return;
      }
      const step = Math.min(3, (now - last) / 16.67) || 1;
      last = now;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      if (mode === 'warp') drawWarp(now, step);
      else drawSky(now, step);
      requestAnimationFrame(frame);
    };

    const open = (item) => {
      entry = build(item);
      if (!entry.nodes.length) return;
      music.cue(item.song, item.songName);
      const nodes = entry.nodes;
      root.className = 'cosmos';
      root.hidden = false;
      resize();
      viewer.classList.toggle('is-single', nodes.length < 2);
      $('cosmosYear').textContent = (/^\d{4}/.exec(item.date || '') || [''])[0];
      $('cosmosTitle').textContent = item.title || '';
      viewer.hidden = true;
      current = -1;
      updateTip();

      // 镜头停在这一幕定好的位置；没定朝向的，停在螺线中段那颗星的这一侧
      const rest = entry.scene.rest;
      turn = 0;
      cam.yaw = rest.yaw === undefined ? Math.PI / 2 - nodes[nodes.length >> 1].angle : rest.yaw;
      cam.pitch = rest.pitch;
      cam.vyaw = cam.vpitch = 0;
      cam.target = null;
      if (deep) deep.load(entry.model);
      meteors = [];
      rings = [];
      clouds = [];
      flybys = [];
      passed = Math.floor(entry.from / 12);
      spin = 0;
      // 今年的相册不用往回飞，飞一小段就到
      warpMs = entry.from > entry.to ? WARP_MS : 3000;
      canopy.clear();
      // 光迹贴图趁现在画好，别等飞起来的第一帧再算
      for (let i = 0; i < TRAIL_HUES.length * 2; i++) trail(i);
      streaks = Array.from({ length: 330 }, () => ({
        a: rand(0, Math.PI * 2),
        r: rand(0.08, 1.2),
        z: rand(0.05, 1),
        k: rand(0.6, 1.4),
        // 贴图每个色相备两张，毛边各不一样；十颗里有一颗又大又亮
        look: Math.floor(rand(0, TRAIL_HUES.length * 2)),
        size: Math.random() < 0.1 ? rand(1.6, 2.4) : rand(0.55, 1.15),
        lum: rand(0.6, 1),
        blink: rand(0.004, 0.012)
      }));

      const now = performance.now();
      last = now;
      if (reduceMotion) {
        arrive(now);
      } else {
        mode = 'warp';
        began = now;
        root.classList.add('is-warp');
        feedback.rumble(warpMs, surgeAt);
      }
      if (!looping) {
        looping = true;
        requestAnimationFrame(frame);
      }
    };

    const close = () => {
      closeViewer();
      feedback.hush();
      music.stop();
      root.classList.add('is-leaving');
      setTimeout(() => {
        root.hidden = true;
        mode = 'off';
      }, 500);
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .viewer')) return;
      if (mode === 'warp') return;
      drag ={ id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, time: performance.now(), last: performance.now() };
      tapAt = null;
      cam.target = null;
      cam.vyaw = cam.vpitch = 0;
      try { root.setPointerCapture(e.pointerId); } catch (err) {}
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      // 手指按着星系靠近自己的这一侧：往哪边拖，它就往哪边转；往下拖是压过去俯视，往上是放平
      cam.yaw += (dx / focal) * 1.5;
      cam.pitch += (dy / focal) * 1.2;
      // 松手时的速度按时间算（折成每帧多少），不同刷新率的手机甩出去一样远
      const now = performance.now();
      const perFrame = 16.67 / Math.max(4, now - drag.last) / focal;
      drag.last = now;
      cam.vyaw = cam.vyaw * 0.5 + dx * perFrame * 0.75;
      cam.vpitch = cam.vpitch * 0.5 + dy * perFrame * 0.6;
    });
    root.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tapped = drag.moved < 10 && performance.now() - drag.time < 400;
      // 手指停住再松开就不甩出去
      if (tapped || performance.now() - drag.last > 80) cam.vyaw = cam.vpitch = 0;
      drag = null;
      tapAt = tapped ? localPoint(e) : null;
    });
    // 点星星要等 click 再打开卡片。手机上 click 排在 pointerup 之后才定落点，
    // 松手那一刻就把卡片盖上来的话，这同一下点按的 click 会落到卡片外的遮罩上，卡片刚开就被关掉
    root.addEventListener('click', (e) => {
      if (mode === 'warp') {
        // 轻触跳过穿越。同样放在 click 里：按下那一刻就到站的话，刚冒出来的返回按钮会接住这同一下点按
        began = performance.now() - warpMs;
        feedback.fire('tap', localPoint(e));
        return;
      }
      const point = tapAt;
      tapAt = null;
      if (!point || e.target.closest('button, .viewer')) return;
      let best = -1;
      let nearest = 36;
      entry.nodes.forEach((n, i) => {
        if (!n.front || n.grow < 1) return;
        const distance = Math.hypot(n.sx - point.x, n.sy - point.y);
        if (distance < nearest) {
          nearest = distance;
          best = i;
        }
      });
      if (best < 0) return;
      feedback.fire('star', { x: entry.nodes[best].sx, y: entry.nodes[best].sy });
      view(best, { x: entry.nodes[best].sx - w / 2, y: entry.nodes[best].sy - h / 2 });
    });
    root.addEventListener('pointercancel', () => { drag = null; });
    let tapAt = null;

    viewer.addEventListener('click', (e) => {
      if (e.target !== viewer && !e.target.matches('.viewer > .haptic')) return;
      feedback.fire('close', localPoint(e));
      later(closeViewer);
    });
    $('viewerClose').addEventListener('click', () => later(closeViewer));
    $('viewerPrev').addEventListener('click', () => view(current - 1, { x: -w * 0.7, y: 0 }));
    $('viewerNext').addEventListener('click', () => view(current + 1, { x: w * 0.7, y: 0 }));
    $('cosmosBack').addEventListener('click', close);
    window.addEventListener('resize', () => { if (mode !== 'off') resize(); });
    // 舱盖玻璃要逐像素算一次，趁还没人点相册先算好，免得点下去那一刻卡一下
    setTimeout(() => { if (mode === 'off') resize(); }, 1800);

    return { open };
  })();

  // 封面
  const renderHero = () => {
    const hero = $('hero');
    $('heroYears').textContent = years;
    $('heroMe').textContent = data.me || '';
    $('heroHer').textContent = data.her || '';
    $('heroDates').textContent = `${formatDate(start)} — ${formatDate(anniversary)}`;

    const elapsed = () => {
      const total = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
      return {
        days: Math.floor(total / 86400),
        hours: Math.floor(total / 3600) % 24,
        minutes: Math.floor(total / 60) % 60,
        seconds: total % 60
      };
    };

    const days = $('counterDays');
    const tick = () => {
      const t = elapsed();
      if (!days.countToken) days.textContent = t.days.toLocaleString('en-US');
      $('counterClock').innerHTML =
        `<b>${pad(t.hours)}</b>小时<b>${pad(t.minutes)}</b>分<b>${pad(t.seconds)}</b>秒`;
    };
    tick();
    setInterval(tick, 1000);
    hero.addEventListener('enter', () => {
      // 先占住 countToken，免得每秒的 tick 在数字滚动开始前把 0 改回去
      days.countToken = {};
      days.textContent = '0';
      setTimeout(() => countUp(days, elapsed().days, 2200), 1300);
    });

    if (data.cover) {
      const img = new Image();
      img.onload = () => {
        $('heroBg').style.backgroundImage = `url("${data.cover}")`;
        hero.classList.add('has-photo');
      };
      img.src = data.cover;
    }
    return elapsed;
  };

  // 时间线：每个节点一整屏，点「这一年的相册」进入星空
  const renderMoments = () => {
    const items = data.timeline || [];
    const before = $('deckPage');
    items.forEach((item, i) => {
      const page = el('section', 'page moment');
      page.style.setProperty('--hue', (i * 47 + 340) % 360);

      const bg = el('div', 'moment-bg');
      const image = el('div', 'moment-img');
      bg.appendChild(image);
      page.appendChild(bg);
      page.appendChild(el('div', 'moment-year', (/^\d{4}/.exec(item.date || '') || [''])[0]));

      const body = el('div', 'moment-body');
      const index = el('p', 'moment-index anim', `${pad(i + 1)} / ${pad(items.length)}`);
      const date = el('p', 'moment-date anim', item.date);
      date.style.setProperty('--i', 1);
      body.appendChild(index);
      body.appendChild(date);
      body.appendChild(splitChars(el('h2', 'moment-title'), item.title));
      if (item.text) {
        const text = el('p', 'moment-text anim', item.text);
        text.style.setProperty('--i', 6);
        body.appendChild(text);
      }
      const album = albumOf(item);
      const enter = (e) => {
        e.stopPropagation();
        cosmos.open(item);
      };
      if (album.length) {
        const button = el('button', 'moment-album anim');
        button.type = 'button';
        button.style.setProperty('--i', 3);
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c.8 7.500 4.500 11.200 12 12-7.500.8-11.200 4.500-12 12-.8-7.500-4.500-11.200-12-12 7.500-.8 11.200-4.500 12-12z" /></svg>';
        button.appendChild(el('span', '', '这一年的相册'));
        button.appendChild(el('b', '', album.length));
        button.dataset.tap = 'launch';
        button.addEventListener('click', enter);
        body.appendChild(button);
      }
      page.appendChild(body);

      if (item.photo) {
        const img = new Image();
        img.onload = () => {
          image.style.backgroundImage = `url("${item.photo}")`;
          // 横图铺满竖屏会被裁掉大半，改用相框展示
          if (img.naturalWidth > img.naturalHeight * 1.1) {
            page.classList.add('is-landscape');
            const card = el('figure', 'moment-card');
            card.appendChild(img);
            if (album.length) {
              card.dataset.tap = 'launch';
              card.addEventListener('click', enter);
            }
            page.insertBefore(card, body);
          }
        };
        // 照片缺失时标出期望的文件路径
        img.onerror = () => page.appendChild(el('p', 'moment-missing', `待放照片 ${item.photo}`));
        img.src = item.photo;
      }
      pages.insertBefore(page, before);
    });
  };

  // 大图查看
  const lightbox = (() => {
    const box = $('lightbox');
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      later(() => { box.hidden = true; });
    });
    return {
      open(src, caption) {
        $('lightboxImg').src = src;
        $('lightboxCaption').textContent = caption || '';
        box.hidden = false;
      }
    };
  })();

  // 照片堆：左右滑动把最上面一张甩到最底下，轻点看大图
  const renderDeck = () => {
    const root = $('deck');
    const cards = (data.gallery || []).map((item, i) => {
      const entry = typeof item === 'string' ? { src: item } : item;
      const node = el('figure', 'card');
      const frame = el('div', 'card-photo');
      node.style.setProperty('--hue', (i * 53 + 10) % 360);
      node.appendChild(frame);
      node.appendChild(el('figcaption', '', entry.caption || ''));
      root.appendChild(node);

      const card = { node, src: entry.src, caption: entry.caption, loaded: false, tilt: (i % 2 ? 1 : -1) * (2 + (i * 37) % 5) };
      const empty = () => {
        frame.textContent = entry.src || '未设置照片';
        frame.classList.add('is-empty');
      };
      if (!entry.src) {
        empty();
        return card;
      }
      const img = new Image();
      img.alt = entry.caption || '';
      img.draggable = false;
      img.onload = () => { card.loaded = true; };
      img.onerror = empty;
      img.src = entry.src;
      frame.appendChild(img);
      return card;
    });

    const order = cards.map((_, i) => i);
    $('deckTotal').textContent = pad(cards.length);
    if (!cards.length) return;

    // instant：刚被甩出去的那张要瞬间回到堆底，不能再播一遍飞回来的动画
    const layout = (instant) => {
      order.forEach((index, depth) => {
        const card = cards[index];
        const d = Math.min(depth, 3);
        const style = card.node.style;
        style.transition = card === instant ? 'none' : '';
        style.zIndex = order.length - depth;
        style.opacity = depth < 4 ? 1 : 0;
        style.transform = depth ? `translateY(${d * 12}px) scale(${1 - d * 0.05}) rotate(${card.tilt}deg)` : 'none';
      });
      $('deckIndex').textContent = pad(order[0] + 1);
      if (instant) requestAnimationFrame(() => { instant.node.style.transition = ''; });
    };

    let drag = null;
    let busy = false;
    let tapped = null;

    const release = (cancelled) => {
      if (!drag) return;
      const { card, dx, time, at } = drag;
      const duration = performance.now() - time;
      drag = null;
      card.node.style.transition = '';

      const flick = Math.abs(dx) > 30 && Math.abs(dx) / duration > 0.5;
      if (!cancelled && cards.length > 1 && (Math.abs(dx) > 90 || flick)) {
        const sign = dx > 0 ? 1 : -1;
        busy = true;
        feedback.fire('swipe', null, true);
        card.node.style.transform = `translateX(${sign * 150}%) rotate(${sign * 26}deg)`;
        card.node.style.opacity = 0;
        setTimeout(() => {
          order.push(order.shift());
          layout(card);
          busy = false;
        }, 300);
        return;
      }
      if (!cancelled && Math.abs(dx) < 8 && duration < 400) tapped = { card, at };
      layout();
    };

    root.addEventListener('pointerdown', (e) => {
      if (busy || drag) return;
      tapped = null;
      const card = cards[order[0]];
      card.node.classList.remove('is-nudging');
      card.node.style.transition = 'none';
      drag = { card, id: e.pointerId, x: e.clientX, dx: 0, time: performance.now(), at: localPoint(e) };
      try { root.setPointerCapture(e.pointerId); } catch (err) {}
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      drag.card.node.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 16}deg)`;
    });
    root.addEventListener('pointerup', () => release(false));
    root.addEventListener('pointercancel', () => release(true));
    // 轻点已经在 release 里处理了，这里拦住冒泡，免得再触发全局的点击爱心
    // 看大图等 click 再开，道理和星空里点星星一样：松手就盖上来的话，这一下的 click 会落在大图上把它关掉
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      const tap = tapped;
      tapped = null;
      if (!tap) return;
      feedback.fire(tap.card.loaded ? 'open' : 'tap', tap.card.loaded ? tap.at : null);
      if (tap.card.loaded) lightbox.open(tap.card.src, tap.card.caption);
    });

    layout();
    $('deckPage').addEventListener('enter', () => {
      cards[order[0]].node.classList.add('is-nudging');
    }, { once: true });
  };

  // 数字
  const renderNumbers = (elapsed) => {
    const monthsSince = () => {
      const now = new Date();
      let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
      if (now.getDate() < start.getDate()) months -= 1;
      return Math.max(0, months);
    };

    const days = elapsed().days;
    const items = [
      { value: days, unit: '天', label: '相爱的日子' },
      { value: monthsSince(), unit: '个月', label: '一起翻过的月历' },
      { value: Math.floor(days / 7), unit: '个', label: '一起过的周末' },
      { value: days * 24, unit: '小时', label: '有你的时间' }
    ].concat(data.numbers || []);

    const list = $('numbersList');
    const values = items.map((item, i) => {
      const cell = el('div', 'number anim');
      cell.style.setProperty('--i', i + 2);
      const line = el('p');
      const value = el('span', 'number-value', '0');
      line.appendChild(value);
      line.appendChild(el('span', 'number-unit', item.unit));
      cell.appendChild(line);
      cell.appendChild(el('p', 'number-label', item.label));
      list.appendChild(cell);
      return { node: value, target: Number(item.value) || 0 };
    });

    $('numbersPage').addEventListener('enter', () => {
      values.forEach(({ node, target }, i) => {
        node.textContent = target ? '0' : '?';
        setTimeout(() => countUp(node, target), 500 + i * 130);
      });
    });
  };

  // 信：点信封 → 封口翻开、信纸抽出 → 展开成整屏的信
  const renderLetter = () => {
    const letter = data.letter || {};
    const body = $('letterBody');
    const lines = [];
    if (letter.greeting) lines.push(el('p', 'letter-greeting', letter.greeting));
    (letter.paragraphs || []).forEach((text) => lines.push(el('p', 'letter-paragraph', text)));
    if (letter.sign) lines.push(el('p', 'letter-sign', letter.sign));
    lines.push(el('p', 'letter-date', formatDate(anniversary)));
    lines.forEach((line, i) => {
      line.classList.add('anim');
      line.style.setProperty('--i', i * 2 + 2);
      body.appendChild(line);
    });

    const envelope = $('envelope');
    const sheet = $('sheet');
    let opening = false;

    envelope.addEventListener('click', () => {
      if (opening) return;
      opening = true;
      envelope.classList.add('is-open');
      setTimeout(() => {
        sheet.hidden = false;
        body.scrollTop = 0;
        // 等一帧再加 class，否则从 display: none 出来不会有过渡
        requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
      }, reduceMotion ? 0 : 1250);
    });

    $('sheetClose').addEventListener('click', (e) => {
      e.stopPropagation();
      sheet.classList.remove('is-open');
      envelope.classList.remove('is-open');
      setTimeout(() => {
        sheet.hidden = true;
        opening = false;
      }, 600);
    });
  };

  // 结尾：进入后自动放烟花，点哪里哪里再放一枚，点爱心放一枚心形的
  const renderEnding = () => {
    const ending = $('ending');
    splitChars($('endingText'), data.ending || '');
    let timer = 0;

    const auto = () => {
      const { w, h } = fx.size();
      fx.firework(rand(w * 0.15, w * 0.85), rand(h * 0.12, h * 0.45));
      timer = setTimeout(auto, rand(500, 1300));
    };
    ending.addEventListener('enter', () => {
      clearTimeout(timer);
      timer = setTimeout(auto, 700);
    });
    ending.addEventListener('leave', () => clearTimeout(timer));

    ending.addEventListener('click', (e) => {
      const point = localPoint(e);
      fx.firework(point.x, point.y);
    });
    $('endingHeart').addEventListener('click', (e) => {
      e.stopPropagation();
      const { w, h } = fx.size();
      fx.firework(w / 2, h * 0.3, true);
      fx.rain();
    });
  };

  // 翻页：滑到哪一页，哪一页加上 is-active 并触发 enter，离开时触发 leave
  const setupPages = () => {
    const list = Array.from(pages.querySelectorAll('.page'));
    const hint = $('swipeHint');
    const bar = $('progressBar');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const page = entry.target;
        const active = page.classList.contains('is-active');
        if (entry.intersectionRatio >= 0.6 && !active) {
          page.classList.add('is-active');
          page.dispatchEvent(new Event('enter'));
          hint.classList.toggle('is-hidden', page === list[list.length - 1]);
        } else if (entry.intersectionRatio <= 0.05 && active) {
          page.classList.remove('is-active');
          page.dispatchEvent(new Event('leave'));
        }
      });
    }, { root: pages, threshold: [0, 0.05, 0.6, 1] });
    list.forEach((page) => observer.observe(page));

    let queued = false;
    pages.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const max = pages.scrollHeight - pages.clientHeight;
        bar.style.transform = `scaleX(${max > 0 ? pages.scrollTop / max : 0})`;
      });
    }, { passive: true });

    // 点击屏幕冒出小爱心（结尾页点击是放烟花，那里自己处理）
    pages.addEventListener('click', (e) => {
      if (e.target.closest('.ending, .envelope')) return;
      const point = localPoint(e);
      fx.burst(point.x, point.y);
    });
  };

  document.title = `${data.me || ''} & ${data.her || ''} · 相爱 ${years} 周年`;
  const elapsed = renderHero();
  renderMoments();
  renderDeck();
  renderNumbers(elapsed);
  renderLetter();
  renderEnding();
  feedback.mount();
  // 开场结束后再启动翻页逻辑，封面的进场动画才不会在开场底下白白播完
  music.play();
  intro(() => {
    setupPages();
  });
})();
