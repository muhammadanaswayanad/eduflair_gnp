(function () {
    const canvas = document.getElementById('hero-gl');
    const stage = document.getElementById('hero-stage');
    if (!canvas || !stage) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power'
    });
    if (!gl) return;

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vs = compile(gl.VERTEX_SHADER, [
        'attribute vec2 a_pos;',
        'void main() {',
        '  gl_Position = vec4(a_pos, 0.0, 1.0);',
        '}'
    ].join('\n'));

    const fs = compile(gl.FRAGMENT_SHADER, [
        'precision mediump float;',
        'uniform vec2 u_res;',
        'uniform float u_time;',
        'uniform float u_mobile;',
        'void main() {',
        '  vec2 uv = gl_FragCoord.xy / u_res;',
        '  float bands = 0.0;',
        '  float y0 = 0.28 + sin(uv.x * 7.2 + u_time * 0.35) * 0.045 + sin(uv.x * 18.0 - u_time * 0.8) * 0.012;',
        '  float y1 = 0.48 + sin(uv.x * 7.2 + u_time * 0.35 + 1.4) * 0.045 + sin(uv.x * 18.0 - u_time * 0.8 + 1.0) * 0.012;',
        '  float y2 = 0.68 + sin(uv.x * 7.2 + u_time * 0.35 + 2.8) * 0.045 + sin(uv.x * 18.0 - u_time * 0.8 + 2.0) * 0.012;',
        '  bands += smoothstep(0.04, 0.0, abs(uv.y - y0)) * 0.42;',
        '  bands += smoothstep(0.04, 0.0, abs(uv.y - y1)) * 0.42;',
        '  if (u_mobile < 0.5) bands += smoothstep(0.04, 0.0, abs(uv.y - y2)) * 0.36;',
        '  vec2 o1 = vec2(0.18 + sin(u_time * 0.12) * 0.08, 0.62 + cos(u_time * 0.09) * 0.06);',
        '  vec2 o2 = vec2(0.78 + cos(u_time * 0.1) * 0.07, 0.28 + sin(u_time * 0.14) * 0.05);',
        '  float orbs = exp(-12.0 * length(uv - o1)) * 0.38 + exp(-10.0 * length(uv - o2)) * 0.28;',
        '  if (u_mobile > 0.5) orbs *= 0.65;',
        '  float glow = bands + orbs;',
        '  vec3 teal = vec3(0.18, 0.78, 0.72);',
        '  vec3 mint = vec3(0.60, 0.96, 0.89);',
        '  vec3 col = mix(teal, mint, clamp(orbs * 1.4, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, glow * 0.62);',
        '}'
    ].join('\n'));

    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const locPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    const locRes = gl.getUniformLocation(program, 'u_res');
    const locTime = gl.getUniformLocation(program, 'u_time');
    const locMobile = gl.getUniformLocation(program, 'u_mobile');

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    let running = false;
    let visible = true;
    let pageVisible = document.visibilityState === 'visible';
    let raf = 0;
    let start = performance.now();

    function isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1 : 1.5);
        const w = Math.max(1, Math.floor(stage.clientWidth * dpr));
        const h = Math.max(1, Math.floor(stage.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(locRes, canvas.width, canvas.height);
        gl.uniform1f(locMobile, isMobile() ? 1 : 0);
    }

    function frame(now) {
        if (!running) return;
        gl.uniform1f(locTime, (now - start) / 1000);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        raf = requestAnimationFrame(frame);
    }

    function play() {
        if (running || !visible || !pageVisible) return;
        running = true;
        resize();
        raf = requestAnimationFrame(frame);
    }

    function pause() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }

    function sync() {
        if (visible && pageVisible) play();
        else pause();
    }

    canvas.classList.add('is-live');
    resize();
    window.addEventListener('resize', resize, { passive: true });

    document.addEventListener('visibilitychange', () => {
        pageVisible = document.visibilityState === 'visible';
        sync();
    });

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            sync();
        }, { threshold: 0.08 });
        io.observe(stage);
    } else {
        visible = true;
    }

    sync();
}());
