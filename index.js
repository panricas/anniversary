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

    // 音效现场合成，不用另外带音频文件
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    let master = null;
    const voice = (freq, delay, length, peak, type, slideTo) => {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + length + 0.03);
    };
    // 一个带泛音的音，听起来像敲了一下小铃
    const bell = (freq, delay, length, peak) => {
      voice(freq, delay, length, peak);
      voice(freq * 2.01, delay, length * 0.6, peak * 0.3);
    };
    const SOUND = {
      tap: () => voice(1047, 0, 0.09, 0.16, 'sine', 1568),
      soft: () => voice(1319, 0, 0.07, 0.05),
      swipe: () => voice(620, 0, 0.16, 0.07, 'triangle', 240),
      close: () => { bell(1175, 0, 0.16, 0.11); bell(784, 0.07, 0.26, 0.1); },
      open: () => { bell(784, 0, 0.5, 0.11); bell(1175, 0.08, 0.5, 0.1); bell(1568, 0.16, 0.7, 0.1); },
      star: () => { bell(1568, 0, 0.3, 0.08); bell(2349, 0.05, 0.3, 0.07); bell(3136, 0.1, 0.45, 0.06); },
      heart: () => { bell(659, 0, 0.45, 0.12); bell(988, 0.1, 0.45, 0.11); bell(1319, 0.2, 0.7, 0.1); },
      launch: () => { voice(196, 0, 0.6, 0.1, 'triangle', 1568); bell(2093, 0.42, 0.6, 0.07); }
    };
    const ready = () => {
      if (!AudioCtx) return false;
      if (!ctx) {
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.7;
        master.connect(ctx.destination);
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
        const hiss = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = hiss.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const air = ctx.createBufferSource();
        air.buffer = hiss;
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

  // 音乐：只有一个播放器，放的是「眼下这首」。
  // 可以有一首从开场就放的背景音乐（data.music）；时间线每个节点还可以各带一首（song），
  // 飞船到站时换上，回到正文也接着放，直到进了另一年的相册
  const music = (() => {
    const button = $('music');
    const label = $('cosmosSong');
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    let src = '';
    // 她自己按了暂停：之后换歌只换不响，等她再按
    let off = false;
    // 已经在点按里静音起播，等到站再出声
    let queued = false;
    let held = false;
    let fading = 0;

    const sync = () => button.classList.toggle('is-playing', !audio.paused);
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    // 文件不在或者放不了，就不留一个点了没反应的按钮
    audio.addEventListener('error', () => {
      src = '';
      queued = false;
      audio.muted = false;
      button.hidden = true;
      label.textContent = '';
      label.hidden = true;
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      off = !audio.paused;
      if (off) audio.pause();
      else audio.play().catch(() => {});
    });

    const load = (next) => {
      src = next;
      audio.src = next;
      button.hidden = false;
    };
    // 音量慢慢推上来。iPhone 不让网页调音量，在它上面等于直接开始
    const swell = () => {
      clearInterval(fading);
      let v = 0;
      audio.volume = 0;
      fading = setInterval(() => {
        v = Math.min(1, v + 0.05);
        audio.volume = v;
        if (v >= 1) clearInterval(fading);
      }, 80);
    };

    return {
      play() {
        if (!data.music) return;
        load(data.music);
        audio.play().catch(() => {});
      },
      // 进相册的那一下点按里调用。手机只准在点按里开始播放，而到站是几秒以后的事，
      // 所以先静音放起来，到站时拨回开头、打开声音
      cue(song, name) {
        label.textContent = song && name ? `♪ ${name}` : '';
        label.hidden = true;
        // 这一年没配歌，或者正放着的就是这首：原来放什么接着放
        if (!song || song === src) {
          label.hidden = !label.textContent;
          return;
        }
        load(song);
        if (off) return;
        queued = true;
        audio.muted = true;
        audio.play().catch(() => {});
      },
      drop() {
        label.hidden = !label.textContent;
        if (!queued) return;
        queued = false;
        try { audio.currentTime = 0; } catch (err) {}
        audio.muted = false;
        swell();
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

    $('introTo').textContent = data.her ? `给 ${data.her}` : '';

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
  // 到了以后人在星空里面，这一年的照片是一颗颗会闪的星星，拖动环顾四周，轻点查看
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
    const LABEL = '12px -apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
    const cam = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, target: null };
    let w = 0;
    let h = 0;
    let focal = 0;
    let zoom = 1;
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
    let flybys = [];
    let passed = 0;
    let spin = 0;
    let warpMs = WARP_MS;
    let meteors = [];
    let nextMeteor = 0;
    let cosYaw = 1;
    let sinYaw = 0;
    let cosPitch = 1;
    let sinPitch = 0;

    // 视线方向 → 单位向量。yaw 是左右转，pitch 是抬头低头，都为 0 时看向 +z
    const unit = (yaw, pitch) => ({
      x: Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: Math.cos(yaw) * Math.cos(pitch)
    });

    // 由序号算出的固定「随机数」，同一颗星每次进来都在同一个位置
    const noise = (i, k) => {
      const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // 背景星：六成均匀撒在天球上，四成挤在一条斜带上当银河
    const backdrop = Array.from({ length: 1100 }, (_, i) => {
      let d;
      if (i % 5 < 2) {
        const p = unit(rand(0, Math.PI * 2), (rand(-1, 1) + rand(-1, 1)) * 0.11);
        d = { x: p.x * 0.825 - p.y * 0.565, y: p.x * 0.565 + p.y * 0.825, z: p.z };
      } else {
        d = unit(rand(0, Math.PI * 2), Math.asin(rand(-1, 1)));
      }
      return Object.assign(d, {
        size: rand(0.5, 1.7),
        phase: rand(0, Math.PI * 2),
        rate: rand(500, 1600),
        color: pick(['#ffffff', '#ffffff', '#cfe0ff', '#ffe6c8']),
        bright: Math.random() < 0.07
      });
    });

    // 星云：[左右角度, 上下角度, 色相, 大小]
    const nebulae = [
      [18, 14, 265, 0.95], [-38, -12, 215, 0.8], [72, 22, 320, 0.7],
      [150, -12, 190, 0.85], [-112, 18, 25, 0.6], [-162, -24, 280, 0.75]
    ].map(([yaw, pitch, hue, size]) => {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 256;
      const g = sprite.getContext('2d');
      const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, `hsla(${hue}, 80%, 58%, 0.5)`);
      grad.addColorStop(0.45, `hsla(${hue + 20}, 80%, 48%, 0.2)`);
      grad.addColorStop(1, `hsla(${hue + 40}, 80%, 40%, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      return Object.assign(unit(yaw * RAD, pitch * RAD), { sprite, size });
    });

    // 把天球上的方向投到屏幕上；结果写进同一个对象，z <= 0.08 表示在身后，不画
    const spot = { x: 0, y: 0, z: 0 };
    const project = (d) => {
      const x = d.x * cosYaw - d.z * sinYaw;
      const depth = d.x * sinYaw + d.z * cosYaw;
      const y = d.y * cosPitch - depth * sinPitch;
      spot.z = d.y * sinPitch + depth * cosPitch;
      if (spot.z > 0.08) {
        const k = (focal * zoom) / spot.z;
        spot.x = w / 2 + x * k;
        spot.y = h / 2 - y * k;
      }
      return spot;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = app.clientWidth;
      h = app.clientHeight;
      // 横向大约能看到 60° 的天空
      focal = w * 0.866;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      const gap = Math.min(15, 330 / list.length) * RAD;
      const nodes = list.map((photo, i) => {
        // 沿水平方向一左一右、一高一低地排开，连起来是一条折线星座
        const yaw = (i - (list.length - 1) / 2) * gap + (noise(i, 1) - 0.5) * 5 * RAD;
        const pitch = (i % 2 ? 1 : -1) * (8 + noise(i, 2) * 20) * RAD + 3 * RAD;
        const video = photo.type === 'video' || VIDEO.test(photo.src || '');
        const node = Object.assign(unit(yaw, pitch), {
          yaw, pitch, photo, video,
          thumb: null,
          ratio: 0,
          radius: 15 + noise(i, 4) * 4,
          missing: !photo.src,
          seen: false,
          phase: noise(i, 3) * Math.PI * 2,
          sx: 0,
          sy: 0,
          front: false,
          grow: 0
        });
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
      item.cosmos = { nodes, gap, to, from: Math.max(from, to), monthly: !!(m && m[2]) };
      return item.cosmos;
    };

    const updateTip = () => {
      const total = entry.nodes.length;
      const seen = entry.nodes.filter((n) => n.seen).length;
      $('cosmosTip').textContent = !seen ? '拖动环顾四周 · 轻点一颗星'
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

      ctx.save();
      ctx.translate(rand(-1, 1) * surge * 1.6, rand(-1, 1) * surge * 1.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      const halo = 110 + 210 * surge;
      ctx.globalAlpha = 0.18 + 0.5 * surge;
      ctx.drawImage(glowSprite(228), cx - halo, cy - halo, halo * 2, halo * 2);

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
        const tail = Math.min(1.1, s.z + speed * s.k * 5 + 0.003);
        const a = s.a + swirl * (1 - s.z);
        const x = cx + ((Math.cos(a) * s.r) / s.z) * w * 0.5;
        const y = cy + ((Math.sin(a) * s.r) / s.z) * w * 0.5;
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) {
          s.z = 1;
          continue;
        }
        const b = s.a + swirl * (1 - tail);
        ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.7);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.4 + (1 - s.z) * 2.1;
        ctx.beginPath();
        ctx.moveTo(cx + ((Math.cos(b) * s.r) / tail) * w * 0.5, cy + ((Math.sin(b) * s.r) / tail) * w * 0.5);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

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

      // 驾驶舱：仪表跟着推力走，钟往回转，挂饰被甩起来，整个舱在抖
      if (entry.from > entry.to) spin += surge * step * 0.06;
      cockpit.style.setProperty('--surge', surge.toFixed(3));
      cockpit.style.setProperty('--spin', spin.toFixed(3));
      cockpit.style.setProperty('--sway', `${((4 + surge * 9) * Math.sin(now / 300) + surge * 7).toFixed(2)}deg`);
      cockpit.style.transform = `translate3d(${(rand(-1, 1) * surge * 2.2).toFixed(2)}px, ${(rand(-1, 1) * surge * 2.2).toFixed(2)}px, 0)`;

      setText('warpDate', entry.monthly ? `${year}.${pad((months % 12) + 1)}` : String(year));
      setText('warpLabel', p < 0.16 ? '时光引擎 启动' : q >= 1 ? '已到达' : entry.from > entry.to ? '时光倒流中' : '就停在此刻');
      setText('hudSpeed', `${(surge * 0.99).toFixed(2)} c`);
      setText('hudBack', `${entry.from - months} 个月`);

      if (p >= 1) {
        // 引擎停下，落地时顿一下
        feedback.hush('arrive');
        arrive(now);
      }
    };

    const drawSky = (now, step) => {
      const nodes = entry.nodes;
      const age = now - began;

      if (cam.target) {
        // 转向正在看的那颗星，yaw 走近的那一边
        let turn = (cam.target.yaw - cam.yaw) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        cam.yaw += turn * Math.min(1, 0.07 * step);
        cam.pitch += (cam.target.pitch - cam.pitch) * Math.min(1, 0.07 * step);
      } else if (!drag) {
        // 松手后带一点惯性
        cam.yaw += cam.vyaw * step;
        cam.pitch += cam.vpitch * step;
        cam.vyaw *= Math.pow(0.88, step);
        cam.vpitch *= Math.pow(0.88, step);
      }
      cam.pitch = Math.max(-1, Math.min(1, cam.pitch));
      // 视线一直有一点很慢的晃动，像人飘在太空里
      const float = reduceMotion ? 0 : 1;
      cosYaw = Math.cos(cam.yaw + float * 0.024 * Math.sin(now / 5200));
      sinYaw = Math.sin(cam.yaw + float * 0.024 * Math.sin(now / 5200));
      cosPitch = Math.cos(cam.pitch + float * 0.014 * Math.cos(now / 6700));
      sinPitch = Math.sin(cam.pitch + float * 0.014 * Math.cos(now / 6700));
      // 刚到的时候星星从中间向四周散开，像飞船在减速
      zoom = reduceMotion ? 1 : 0.3 + 0.7 * (1 - Math.pow(1 - Math.min(1, age / 1600), 3));
      const fade = Math.min(1, age / 700);

      ctx.globalCompositeOperation = 'lighter';
      for (const n of nebulae) {
        const p = project(n);
        if (p.z < 0.25) continue;
        const r = (n.size * focal * zoom) / p.z;
        ctx.globalAlpha = 0.5 * fade * Math.min(1, (p.z - 0.25) * 3);
        ctx.drawImage(n.sprite, p.x - r, p.y - r, r * 2, r * 2);
      }

      for (const s of backdrop) {
        const p = project(s);
        if (p.z <= 0.08 || p.x < -4 || p.x > w + 4 || p.y < -4 || p.y > h + 4) continue;
        const twinkle = 0.5 + 0.5 * Math.sin(now / s.rate + s.phase);
        ctx.globalAlpha = fade * (0.25 + 0.75 * twinkle);
        if (s.bright) {
          const r = 3 + 3 * twinkle;
          ctx.drawImage(glowSprite(215), p.x - r, p.y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = s.color;
          ctx.fillRect(p.x, p.y, s.size, s.size);
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

      // 先算出每颗照片星落在屏幕的哪里，连线和点击判断都要用
      nodes.forEach((n, i) => {
        const p = project(n);
        n.front = p.z > 0.08;
        n.sx = p.x;
        n.sy = p.y;
        n.grow = reduceMotion ? 1 : Math.max(0, Math.min(1, (age - 900 - i * 170) / 600));
      });

      // 转到一颗照片星都看不见的方向时，在屏幕边上指个路
      if (age > 2600 && !nodes.some((n) => n.front && n.sx > 16 && n.sx < w - 16 && n.sy > 16 && n.sy < h - 16)) {
        let turn = 0;
        let lift = 0;
        let nearest = Infinity;
        for (const n of nodes) {
          let d = (n.yaw - cam.yaw) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) < nearest) {
            nearest = Math.abs(d);
            turn = d;
            lift = n.pitch - cam.pitch;
          }
        }
        // 左右差得不多就说明是抬头或低头看过了
        const sideways = nearest > 0.45;
        const dx = sideways ? Math.sign(turn) : 0;
        const dy = sideways ? 0 : -Math.sign(lift);
        const nudge = 5 * Math.sin(now / 260);
        const x = w / 2 + dx * (w / 2 - 30 + nudge);
        const y = h / 2 + dy * (h / 2 - 96 + nudge);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.72 + 0.25 * Math.sin(now / 260);
        ctx.strokeStyle = '#ffd9a0';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x - dx * 7 - dy * 9, y - dy * 7 - dx * 9);
        ctx.lineTo(x, y);
        ctx.lineTo(x - dx * 7 + dy * 9, y - dy * 7 + dx * 9);
        ctx.stroke();
        ctx.font = LABEL;
        ctx.fillStyle = '#ffe9c4';
        ctx.textBaseline = 'middle';
        ctx.textAlign = dx > 0 ? 'right' : dx < 0 ? 'left' : 'center';
        ctx.fillText('星星在这边', x - dx * 18, y - dy * 24);
        ctx.globalCompositeOperation = 'lighter';
      }

      // 星座连线：两头都点亮了就变成金色实线
      ctx.lineWidth = 1;
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1];
        const b = nodes[i];
        if (!a.front || !b.front || !b.grow) continue;
        const lit = a.seen && b.seen;
        ctx.globalAlpha = (lit ? 0.6 : 0.24) * b.grow;
        ctx.strokeStyle = lit ? '#ffd9a0' : '#bcd0ff';
        ctx.setLineDash(lit ? [] : [3, 6]);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.font = LABEL;
      ctx.textBaseline = 'middle';
      for (const n of nodes) {
        if (!n.front || !n.grow || n.sx < -80 || n.sx > w + 80 || n.sy < -80 || n.sy > h + 80) continue;
        const slow = 0.5 + 0.5 * Math.sin(now / 620 + n.phase);
        const quick = 0.5 + 0.5 * Math.sin(now / 97 + n.phase * 3);
        const r = n.radius * backOut(n.grow) * (1 + 0.04 * slow);
        const sprite = glowSprite(n.seen ? 40 : 215);

        // 光晕和十字星芒，忽大忽小就是在「闪」
        ctx.globalCompositeOperation = 'lighter';
        const halo = r * (2.8 + 0.6 * slow);
        ctx.globalAlpha = n.grow * (0.5 + 0.3 * slow + 0.12 * quick);
        ctx.drawImage(sprite, n.sx - halo, n.sy - halo, halo * 2, halo * 2);
        const ray = r * (2.4 + 2 * slow + 0.5 * quick);
        ctx.globalAlpha = n.grow * (0.35 + 0.5 * slow);
        ctx.drawImage(sprite, n.sx - ray, n.sy - 2, ray * 2, 4);
        ctx.drawImage(sprite, n.sx - 2, n.sy - ray, 4, ray * 2);

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = n.grow;
        ctx.fillStyle = '#0a1024';
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.thumb) {
          ctx.globalAlpha = n.grow * (n.seen ? 1 : 0.86);
          ctx.drawImage(n.thumb, n.sx - r, n.sy - r, r * 2, r * 2);
        } else if (n.video) {
          ctx.fillStyle = '#eef3ff';
          ctx.beginPath();
          ctx.moveTo(n.sx - r * 0.26, n.sy - r * 0.42);
          ctx.lineTo(n.sx + r * 0.46, n.sy);
          ctx.lineTo(n.sx - r * 0.26, n.sy + r * 0.42);
          ctx.fill();
        } else {
          // 照片还没放进来：只画一颗星
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(sprite, n.sx - r * 0.9, n.sy - r * 0.9, r * 1.8, r * 1.8);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = n.grow * 0.9;
        ctx.strokeStyle = n.seen ? '#ffd9a0' : '#cfe0ff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, r + 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // 旁边的小字，靠右的星星把字放在左边，免得出屏
        if (n.photo.title) {
          const left = n.sx > w * 0.6;
          ctx.globalAlpha = n.grow * (n.seen ? 0.95 : 0.72);
          ctx.fillStyle = n.seen ? '#ffe9c4' : '#dfe8ff';
          ctx.textAlign = left ? 'right' : 'left';
          ctx.fillText(n.photo.title, n.sx + (left ? -1 : 1) * (r + 10), n.sy);
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

      // 星星少就正对着星座中间，多了就从第一颗看起，后面的拖过去找
      cam.yaw = nodes.length <= 4 ? 0 : nodes[0].yaw + entry.gap * 1.2;
      cam.pitch = 0;
      cam.vyaw = cam.vpitch = 0;
      cam.target = null;
      meteors = [];
      rings = [];
      flybys = [];
      passed = Math.floor(entry.from / 12);
      spin = 0;
      // 今年的相册不用往回飞，飞一小段就到
      warpMs = entry.from > entry.to ? WARP_MS : 3000;
      setText('warpDest', `目的地 ${(item.date || '').slice(0, 7)}`);
      streaks = Array.from({ length: 300 }, () => ({
        a: rand(0, Math.PI * 2),
        r: rand(0.08, 1.2),
        z: rand(0.05, 1),
        k: rand(0.6, 1.4),
        color: `hsl(${Math.round(rand(195, 290))}, 100%, ${Math.round(rand(74, 92))}%)`
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
      // 手指往哪边拖，天空就跟着往哪边走
      cam.yaw -= dx / focal;
      cam.pitch += dy / focal;
      // 松手时的速度按时间算（折成每帧多少），不同刷新率的手机甩出去一样远
      const now = performance.now();
      const perFrame = 16.67 / Math.max(4, now - drag.last) / focal;
      drag.last = now;
      cam.vyaw = cam.vyaw * 0.5 - dx * perFrame * 0.5;
      cam.vpitch = cam.vpitch * 0.5 + dy * perFrame * 0.5;
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
      let nearest = 38;
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
      { value: days, unit: '天', label: '在一起的日子' },
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

  document.title = `${data.me || ''} & ${data.her || ''} · ${years} 周年`;
  const elapsed = renderHero();
  renderMoments();
  renderDeck();
  renderNumbers(elapsed);
  renderLetter();
  renderEnding();
  feedback.mount();
  // 开场结束后再启动翻页逻辑，封面的进场动画才不会在开场底下白白播完
  intro(() => {
    music.play();
    setupPages();
  });
})();
