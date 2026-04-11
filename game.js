const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tileSize = 64;

// --- CONFIG & STATE ---
let gold, lives, wave, difficulty, gameSpeed = 2;
let gameState = "MENU"; 
let enemies = [], towers = [], projectiles = [], enemyProjectiles = [], floatingTexts = [];
let waveQueue = [], spawnTimer = 0, nextSpawnDelay = 60, prepTimer = 0, screenShake = 0;
let selectedTowerType = null, activeTower = null;

const TOWER_DATA = [
    { name: "Ninja",     cost: 100,  range: 160, damage: 12,  speed: 18  }, // very fast
    { name: "Teddy",     cost: 125,  range: 88,  damage: 30,  speed: 50  }, // close-range AoE squash
    { name: "Knight",    cost: 150,  range: 110, damage: 35,  speed: 95  }, // slow, heavy
    { name: "Archer",    cost: 200,  range: 280, damage: 20,  speed: 38  }, // fast
    { name: "Frost",     cost: 250,  range: 190, damage: 18,  speed: 70  }, // medium
    { name: "Wizard",    cost: 400,  range: 220, damage: 30,  speed: 80  }, // medium-slow
    { name: "Cannon",    cost: 600,  range: 240, damage: 95,  speed: 140 }, // very slow
    { name: "Dino",      cost: 850,  range: 160, damage: 140, speed: 42  }, // fast chomps
    { name: "Demon",     cost: 1200, range: 210, damage: 65,  speed: 48  }, // rapid blasts
    { name: "Elemental", cost: 1800, range: 260, damage: 90,  speed: 115 }, // slow, massive
];

const mapGrid = Array.from({length:12}, () => new Array(20).fill(0));
let waypoints = [];
let exitRow = 9;
let mapCanvas = null;

const MAP_LAYOUTS = [
    [{x:0,y:1},{x:5,y:1},{x:5,y:4},{x:14,y:4},{x:14,y:7},{x:5,y:7},{x:5,y:9},{x:19,y:9}],
    [{x:0,y:3},{x:8,y:3},{x:8,y:1},{x:14,y:1},{x:14,y:5},{x:4,y:5},{x:4,y:9},{x:19,y:9}],
    [{x:0,y:8},{x:4,y:8},{x:4,y:2},{x:9,y:2},{x:9,y:6},{x:15,y:6},{x:15,y:4},{x:19,y:4}],
    [{x:0,y:5},{x:3,y:5},{x:3,y:2},{x:11,y:2},{x:11,y:8},{x:7,y:8},{x:7,y:5},{x:19,y:5}],
    [{x:0,y:10},{x:6,y:10},{x:6,y:7},{x:2,y:7},{x:2,y:4},{x:10,y:4},{x:10,y:1},{x:16,y:1},{x:16,y:7},{x:19,y:7}],
];

function generateMap() {
    for(let y=0;y<12;y++) for(let x=0;x<20;x++) mapGrid[y][x] = 0;
    const pts = MAP_LAYOUTS[Math.floor(Math.random() * MAP_LAYOUTS.length)];
    for(let i=0; i<pts.length-1; i++) {
        const a=pts[i], b=pts[i+1];
        if(a.x === b.x) { const y0=Math.min(a.y,b.y), y1=Math.max(a.y,b.y); for(let y=y0;y<=y1;y++) mapGrid[y][a.x]=1; }
        else             { const x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x); for(let x=x0;x<=x1;x++) mapGrid[a.y][x]=1; }
    }
    exitRow = pts[pts.length-1].y;
    waypoints = pts.map(p => ({x: p.x*tileSize+tileSize/2, y: p.y*tileSize+tileSize/2}));
    renderMapCache();
}

// --- AUDIO ---
const audio = {
    ctx: null,
    init() { if (this.ctx && this.ctx.state !== 'suspended') return; this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume().then(() => this.startMusic()); },
    play(freq, type='sine', dur=0.1, vol=0.04) {
        if(!this.ctx || this.ctx.state === 'suspended') return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(vol, this.ctx.currentTime); g.gain.linearRampToValueAtTime(0, this.ctx.currentTime+dur);
        o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime+dur);
    },
    playFireBreath() {
        if(!this.ctx || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(60, t+0.35);
        g.gain.setValueAtTime(0.10, t); g.gain.linearRampToValueAtTime(0, t+0.35);
        o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.35);
        const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
        o2.type = 'square'; o2.frequency.setValueAtTime(380, t); o2.frequency.linearRampToValueAtTime(140, t+0.25);
        g2.gain.setValueAtTime(0.05, t); g2.gain.linearRampToValueAtTime(0, t+0.25);
        o2.connect(g2); g2.connect(this.ctx.destination); o2.start(t); o2.stop(t+0.25);
    },
    playHeal() {
        if(!this.ctx || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;
        for(const [f, d] of [[600,0],[800,0.07],[1000,0.14]]) {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(f, t+d);
            g.gain.setValueAtTime(0.04, t+d); g.gain.linearRampToValueAtTime(0, t+d+0.18);
            o.connect(g); g.connect(this.ctx.destination); o.start(t+d); o.stop(t+d+0.18);
        }
    },
    playDeath(type) {
        if(!this.ctx || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;
        if(type === 'blue_dragon') {
            // High crystalline shatter + deep resonant fall
            for(const [f, tp, d, v] of [[800,'sine',0.12,0.08],[400,'sine',0.25,0.07],[160,'sawtooth',0.65,0.1],[60,'sawtooth',0.8,0.07]]) {
                const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                o.type = tp; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(20, t+d);
                g.gain.setValueAtTime(v, t); g.gain.linearRampToValueAtTime(0, t+d);
                o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+d);
            }
        } else if(type === 'dragon') {
            // Massive falling roar
            for(const [f, tp, d, v] of [[250,'sawtooth',0.55,0.12],[120,'sawtooth',0.7,0.09],[500,'square',0.25,0.05]]) {
                const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                o.type = tp; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(20, t+d);
                g.gain.setValueAtTime(v, t); g.gain.linearRampToValueAtTime(0, t+d);
                o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+d);
            }
        } else if(type === 'goblin') {
            // Ascending magical chime cut short
            for(const [f, d] of [[500,0],[700,0.07],[900,0.14],[500,0.22]]) {
                const o = this.ctx.createOscillator(), g = this.ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t+d);
                g.gain.setValueAtTime(0.05, t+d); g.gain.linearRampToValueAtTime(0, t+d+0.12);
                o.connect(g); g.connect(this.ctx.destination); o.start(t+d); o.stop(t+d+0.12);
            }
        } else if(type === 'heavy') {
            // Low thudding crash + distorted growl
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(20, t+0.5);
            g.gain.setValueAtTime(0.14, t); g.gain.linearRampToValueAtTime(0, t+0.5);
            o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.5);
            const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
            o2.type = 'square'; o2.frequency.setValueAtTime(90, t+0.05); o2.frequency.exponentialRampToValueAtTime(30, t+0.35);
            g2.gain.setValueAtTime(0.07, t+0.05); g2.gain.linearRampToValueAtTime(0, t+0.35);
            o2.connect(g2); g2.connect(this.ctx.destination); o2.start(t+0.05); o2.stop(t+0.35);
        } else {
            // Scout: high-pitched squeal fading out
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(300, t+0.22);
            g.gain.setValueAtTime(0.07, t); g.gain.linearRampToValueAtTime(0, t+0.22);
            o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+0.22);
            const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
            o2.type = 'triangle'; o2.frequency.setValueAtTime(600, t+0.04); o2.frequency.exponentialRampToValueAtTime(150, t+0.2);
            g2.gain.setValueAtTime(0.04, t+0.04); g2.gain.linearRampToValueAtTime(0, t+0.2);
            o2.connect(g2); g2.connect(this.ctx.destination); o2.start(t+0.04); o2.stop(t+0.2);
        }
    },
    playTower(name) {
        if(!this.ctx || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;
        const mk = (freq, type, dur, vol, freqEnd) => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = type; o.frequency.setValueAtTime(freq, t);
            if(freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t+dur);
            g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t+dur);
            o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t+dur);
        };
        const sounds = {
            Ninja:     () => mk(900, 'sine', 0.06, 0.06, 350),                        // quick high swish
            Teddy:     () => { mk(180,'sawtooth',0.08,0.09,60); mk(90,'square',0.12,0.05,30); }, // wet squish
            Knight:    () => { mk(280, 'sawtooth', 0.18, 0.09, 70); mk(560, 'square', 0.06, 0.03, 200); }, // metallic clang
            Archer:    () => mk(520, 'triangle', 0.1, 0.07, 180),                     // bow twang
            Frost:     () => { mk(1200, 'sine', 0.2, 0.03); mk(1600, 'sine', 0.2, 0.03); }, // icy shimmer
            Wizard:    () => { mk(400, 'sine', 0.09, 0.05, 720); mk(720, 'sine', 0.09, 0.03, 300); }, // magical arc
            Cannon:    () => mk(100, 'sawtooth', 0.35, 0.14, 28),                     // deep boom
            Dino:      () => { mk(75, 'sawtooth', 0.22, 0.10, 45); mk(150, 'square', 0.1, 0.04, 90); }, // guttural chomp
            Demon:     () => mk(650, 'square', 0.14, 0.06, 180),                      // dark shriek
            Elemental: () => { [0, 0.02, 0.05].forEach((d,i) => { const f=[800,1100,550][i]; const o=this.ctx.createOscillator(),g=this.ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(f,t+d); o.frequency.exponentialRampToValueAtTime(f*0.45,t+d+0.18); g.gain.setValueAtTime(0.04,t+d); g.gain.linearRampToValueAtTime(0,t+d+0.18); o.connect(g); g.connect(this.ctx.destination); o.start(t+d); o.stop(t+d+0.18); }); }, // cosmic zap
        };
        (sounds[name] || (() => mk(250, 'square', 0.08, 0.04)))();
    },
    startMusic() {
        const playNote = () => {
            if (gameState !== "PLAYING") return;
            const freq = [130.81, 146.83, 164.81, 196.00][Math.floor(Math.random()*4)];
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
            g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 1.5);
            g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 4);
            o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 4);
        };
        setInterval(playNote, 3000);
    }
};

// --- CLASSES ---
class Enemy {
    constructor(waveNum, forceType = null) {
        this.x = waypoints[0].x; this.y = waypoints[0].y; this.wp = 0;
        this.dead = false; this.seed = Math.random() * 100;
        const diff = difficulty === 'hard' ? 1.6 : 1;
        if(forceType) {
            this.type = forceType;
        } else {
            const r = Math.random();
            if(waveNum >= 7 && r < 0.04)   this.type = 'blue_dragon';
            else if(waveNum >= 3 && r < 0.09)   this.type = 'dragon';
            else if(r < 0.14)              this.type = 'goblin';
            else if(r < 0.28)              this.type = 'heavy';
            else                           this.type = 'scout';
        }

        if(this.type === 'blue_dragon') {
            this.hp = (500 + waveNum * 120) * diff;
            this.speed = (0.75 + Math.random() * 0.25) * (difficulty === 'hard' ? 1.1 : 1);
            this.reward = 140 + waveNum * 5;
            this.breathRange = 320; this.breathCooldown = 180; this.breathTimer = Math.random() * 90;
            this.breathActive = 0; this.breathTargetX = 0; this.breathTargetY = 0;
        } else if(this.type === 'dragon') {
            this.hp = (300 + waveNum * 80) * diff;
            this.speed = (0.9 + Math.random() * 0.3) * (difficulty === 'hard' ? 1.1 : 1);
            this.reward = 80 + waveNum * 3;
            this.breathRange = 190; this.breathCooldown = 220; this.breathTimer = Math.random() * 100;
            this.breathActive = 0; this.breathTargetX = 0; this.breathTargetY = 0;
        } else if(this.type === 'goblin') {
            this.hp = (30 + waveNum * 12) * diff;
            this.speed = (1.6 + Math.random() * 0.5) * (difficulty === 'hard' ? 1.2 : 1);
            this.reward = 30 + waveNum;
            this.healRange = 160; this.healCooldown = 130; this.healTimer = Math.random() * 60;
            this.healAmount = 20 + waveNum * 4; this.healPulse = 0;
        } else if(this.type === 'heavy') {
            this.hp = (120 + waveNum * 50) * diff;
            this.speed = (1.2 + Math.random() * 0.4) * (difficulty === 'hard' ? 1.2 : 1);
            this.reward = 25 + waveNum;
            this.shootTimer = Math.random() * 80; this.shootCooldown = 120; this.shootRange = 150;
        } else {
            this.hp = (50 + waveNum * 30) * diff;
            this.speed = (1.8 + Math.random() * 0.6) * (difficulty === 'hard' ? 1.2 : 1);
            this.reward = 15 + waveNum;
        }
        this.maxHp = this.hp;
    }
    update() {
        const target = waypoints[this.wp+1];
        if(!target) { lives--; screenShake = 15; this.dead = true; updateUI(); return; }
        const dx = target.x - this.x, dy = target.y - this.y, dist = Math.hypot(dx,dy);
        if(dist < this.speed*gameSpeed) this.wp++;
        else { this.x += (dx/dist)*this.speed*gameSpeed; this.y += (dy/dist)*this.speed*gameSpeed; }

        if(this.type === 'dragon' || this.type === 'blue_dragon') {
            this.breathTimer += gameSpeed;
            if(this.breathActive > 0) this.breathActive -= gameSpeed;
            if(this.breathTimer >= this.breathCooldown) {
                const tgt = towers.find(t => !t.dead && Math.hypot(t.x - this.x, t.y - this.y) < this.breathRange);
                if(tgt) {
                    this.breathTimer = 0; this.breathActive = 35;
                    this.breathTargetX = tgt.x; this.breathTargetY = tgt.y;
                    tgt.hp--;
                    if(tgt.hp <= 0) {
                        tgt.dead = true; mapGrid[tgt.gy][tgt.gx] = 0; screenShake = 18;
                        floatingTexts.push({x: tgt.x, y: tgt.y, txt: "DESTROYED!", life: 1.8, color: this.type === 'blue_dragon' ? "#60a5fa" : "#f97316"});
                    }
                    audio.playFireBreath();
                }
            }
        } else if(this.type === 'goblin') {
            this.healTimer += gameSpeed;
            if(this.healPulse > 0) this.healPulse -= 0.015 * gameSpeed;
            if(this.healTimer >= this.healCooldown) {
                const nearby = enemies.filter(e => e !== this && !e.dead && Math.hypot(e.x-this.x, e.y-this.y) < this.healRange);
                if(nearby.length > 0) {
                    nearby.forEach(e => {
                        e.hp = Math.min(e.maxHp, e.hp + this.healAmount);
                        floatingTexts.push({x: e.x, y: e.y - 12, txt: `+${this.healAmount}`, life: 0.9, color: "#4ade80"});
                    });
                    this.healPulse = 1.0; this.healTimer = 0;
                    audio.playHeal();
                } else {
                    this.healTimer = this.healCooldown * 0.6; // retry sooner when nobody nearby
                }
            }
        } else if(this.type === 'heavy') {
            this.shootTimer += gameSpeed;
            if(this.shootTimer >= this.shootCooldown) {
                const tgt = towers.find(t => !t.dead && Math.hypot(t.x - this.x, t.y - this.y) < this.shootRange);
                if(tgt) {
                    this.shootTimer = 0;
                    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, tgt));
                    audio.play(180, 'square', 0.12, 0.05);
                }
            }
        }
    }
    draw() {
        // Dragon fire breath (canvas space, drawn before body)
        if((this.type === 'dragon' || this.type === 'blue_dragon') && this.breathActive > 0) {
            const alpha = Math.min(1, this.breathActive / 20);
            const dx = this.breathTargetX - this.x, dy = this.breathTargetY - this.y;
            const dist = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(angle);
            ctx.globalAlpha = alpha;
            const bc1 = this.type === 'blue_dragon' ? "#3b82f6" : "#f97316";
            const bc2 = this.type === 'blue_dragon' ? "#93c5fd" : "#fbbf24";
            ctx.fillStyle = bc1; ctx.shadowBlur = 25; ctx.shadowColor = bc1;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(dist,-22); ctx.lineTo(dist*1.1,0); ctx.lineTo(dist,-22+44); ctx.closePath(); ctx.fill();
            ctx.fillStyle = bc2; ctx.shadowColor = bc2;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(dist*0.85,-10); ctx.lineTo(dist,0); ctx.lineTo(dist*0.85,10); ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
        }
        // Goblin heal aura
        if(this.type === 'goblin' && this.healPulse > 0) {
            ctx.save();
            ctx.globalAlpha = this.healPulse * 0.5;
            ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 3;
            ctx.shadowBlur = 15; ctx.shadowColor = "#4ade80";
            ctx.beginPath(); ctx.arc(this.x, this.y, this.healRange * (1.2 - this.healPulse * 0.5), 0, Math.PI*2); ctx.stroke();
            ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
        }

        ctx.save(); ctx.translate(this.x, this.y);
        const w = Math.sin(Date.now() * 0.01 + this.seed);

        if (this.type === 'heavy') {
            // Armored demon brute
            const bg = ctx.createRadialGradient(0, 2, 3, 0, 2, 22);
            bg.addColorStop(0, "#7f1d1d"); bg.addColorStop(1, "#1c0606");
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.moveTo(-19, -12 + w); ctx.lineTo(19, -12 - w); ctx.lineTo(22, 18); ctx.lineTo(-22, 18); ctx.closePath(); ctx.fill();
            // Armor plate
            ctx.fillStyle = "rgba(120,0,0,0.55)"; ctx.fillRect(-14, -4, 28, 10);
            ctx.strokeStyle = "#991b1b"; ctx.lineWidth = 1; ctx.strokeRect(-14, -4, 28, 10);
            // Horns
            ctx.fillStyle = "#450a0a";
            ctx.beginPath(); ctx.moveTo(-10, -12+w); ctx.lineTo(-7, -26+w); ctx.lineTo(-3, -13+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(10, -12-w); ctx.lineTo(7, -26-w); ctx.lineTo(3, -13-w); ctx.closePath(); ctx.fill();
            // Glowing eyes
            ctx.shadowBlur = 10; ctx.shadowColor = "#ff4500";
            ctx.fillStyle = "#ff4500";
            ctx.beginPath(); ctx.arc(-7, -3+w, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(7, -3-w, 4, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#200000";
            ctx.beginPath(); ctx.arc(-7, -3+w, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(7, -3-w, 2, 0, Math.PI*2); ctx.fill();
        } else if(this.type === 'scout') {
            // Scout goblin
            const bg = ctx.createRadialGradient(0, 4, 2, 0, 4, 18);
            bg.addColorStop(0, "#4ade80"); bg.addColorStop(1, "#064e3b");
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.ellipse(0, 6, 12, 14, 0, 0, Math.PI*2); ctx.fill();
            // Head
            ctx.fillStyle = "#16a34a";
            ctx.beginPath(); ctx.arc(0, -10 + w * 1.5, 12, 0, Math.PI*2); ctx.fill();
            // Pointed ears
            ctx.fillStyle = "#15803d";
            ctx.beginPath(); ctx.moveTo(-10,-12+w); ctx.lineTo(-18,-22+w); ctx.lineTo(-6,-16+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(10,-12+w); ctx.lineTo(18,-22+w); ctx.lineTo(6,-16+w); ctx.closePath(); ctx.fill();
            // Glowing eyes
            ctx.shadowBlur = 6; ctx.shadowColor = "#a3e635";
            ctx.fillStyle = "#a3e635";
            ctx.beginPath(); ctx.arc(-4, -11+w, 3.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(4, -11+w, 3.5, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#000";
            ctx.beginPath(); ctx.arc(-4, -11+w, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(4, -11+w, 2, 0, Math.PI*2); ctx.fill();
            // Snarl mouth
            ctx.strokeStyle = "#064e3b"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, -8+w, 4, 0.1, Math.PI-0.1); ctx.stroke();

        } else if(this.type === 'dragon') {
            // Wings
            ctx.fillStyle = "#92400e";
            ctx.beginPath(); ctx.moveTo(-8,-4+w); ctx.lineTo(-36,-18+w); ctx.lineTo(-28,8+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(8,-4-w); ctx.lineTo(36,-18-w); ctx.lineTo(28,8-w); ctx.closePath(); ctx.fill();
            // Wing membrane
            ctx.fillStyle = "rgba(146,64,14,0.4)";
            ctx.beginPath(); ctx.moveTo(-8,-4+w); ctx.lineTo(-36,-18+w); ctx.lineTo(-24,-2+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(8,-4-w); ctx.lineTo(36,-18-w); ctx.lineTo(24,-2-w); ctx.closePath(); ctx.fill();
            // Body
            const dbg = ctx.createRadialGradient(0,4,4,0,4,22);
            dbg.addColorStop(0,"#fb923c"); dbg.addColorStop(1,"#7c2d12");
            ctx.fillStyle = dbg;
            ctx.beginPath(); ctx.ellipse(0,4,20,16,0,0,Math.PI*2); ctx.fill();
            // Belly scales
            ctx.fillStyle = "rgba(251,191,36,0.25)";
            ctx.beginPath(); ctx.ellipse(0,8,12,8,0,0,Math.PI*2); ctx.fill();
            // Neck + head
            ctx.fillStyle = "#ea580c";
            ctx.beginPath(); ctx.ellipse(-14+w*2,-14,8,11,-0.3,0,Math.PI*2); ctx.fill();
            // Spines along back
            ctx.fillStyle = "#dc2626";
            for(let i=0;i<4;i++) { ctx.beginPath(); ctx.moveTo(-6+i*5,-6); ctx.lineTo(-4+i*5,-16); ctx.lineTo(-2+i*5,-6); ctx.closePath(); ctx.fill(); }
            // Eyes
            ctx.shadowBlur = 10; ctx.shadowColor = "#fbbf24";
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath(); ctx.arc(-18+w*2,-17,4,0,Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(-18+w*2,-17,2,0,Math.PI*2); ctx.fill();
            // Nostril smoke when breathing
            if(this.breathActive > 0) {
                ctx.fillStyle = "#f97316"; ctx.shadowBlur = 12; ctx.shadowColor = "#f97316";
                ctx.beginPath(); ctx.arc(-22+w*2,-19,5,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            }

        } else if(this.type === 'blue_dragon') {
            // Wings — icy blue
            ctx.fillStyle = "#1e3a5f";
            ctx.beginPath(); ctx.moveTo(-8,-4+w); ctx.lineTo(-40,-20+w); ctx.lineTo(-30,10+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(8,-4-w); ctx.lineTo(40,-20-w); ctx.lineTo(30,10-w); ctx.closePath(); ctx.fill();
            // Wing membrane glow
            ctx.fillStyle = "rgba(96,165,250,0.35)";
            ctx.beginPath(); ctx.moveTo(-8,-4+w); ctx.lineTo(-40,-20+w); ctx.lineTo(-26,0+w); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(8,-4-w); ctx.lineTo(40,-20-w); ctx.lineTo(26,0-w); ctx.closePath(); ctx.fill();
            // Body
            const bdbg = ctx.createRadialGradient(0,4,4,0,4,26);
            bdbg.addColorStop(0,"#60a5fa"); bdbg.addColorStop(1,"#1e3a8a");
            ctx.fillStyle = bdbg;
            ctx.beginPath(); ctx.ellipse(0,4,22,18,0,0,Math.PI*2); ctx.fill();
            // Icy belly scales
            ctx.fillStyle = "rgba(186,230,253,0.3)";
            ctx.beginPath(); ctx.ellipse(0,8,13,9,0,0,Math.PI*2); ctx.fill();
            // Neck + head
            ctx.fillStyle = "#3b82f6";
            ctx.beginPath(); ctx.ellipse(-15+w*2,-15,9,12,-0.3,0,Math.PI*2); ctx.fill();
            // Ice spines along back
            ctx.fillStyle = "#93c5fd";
            for(let i=0;i<5;i++) { ctx.beginPath(); ctx.moveTo(-8+i*5,-5); ctx.lineTo(-6+i*5,-18); ctx.lineTo(-4+i*5,-5); ctx.closePath(); ctx.fill(); }
            // Eyes — glowing cyan
            ctx.shadowBlur = 12; ctx.shadowColor = "#67e8f9";
            ctx.fillStyle = "#67e8f9";
            ctx.beginPath(); ctx.arc(-19+w*2,-18,5,0,Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(-19+w*2,-18,2.5,0,Math.PI*2); ctx.fill();
            // Nostril glow when breathing
            if(this.breathActive > 0) {
                ctx.fillStyle = "#60a5fa"; ctx.shadowBlur = 14; ctx.shadowColor = "#60a5fa";
                ctx.beginPath(); ctx.arc(-23+w*2,-20,6,0,Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            }

        } else if(this.type === 'goblin') {
            // Robe/body
            const gbg = ctx.createRadialGradient(0,4,2,0,4,16);
            gbg.addColorStop(0,"#a855f7"); gbg.addColorStop(1,"#4c1d95");
            ctx.fillStyle = gbg;
            ctx.beginPath(); ctx.moveTo(-10,-4+w); ctx.lineTo(10,-4-w); ctx.lineTo(12,18); ctx.lineTo(-12,18); ctx.closePath(); ctx.fill();
            // Head
            ctx.fillStyle = "#7e22ce";
            ctx.beginPath(); ctx.arc(0,-12+w,11,0,Math.PI*2); ctx.fill();
            // Pointy hat
            ctx.fillStyle = "#4c1d95";
            ctx.beginPath(); ctx.moveTo(0,-34+w); ctx.lineTo(-10,-14+w); ctx.lineTo(10,-14+w); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#7c3aed";
            ctx.beginPath(); ctx.moveTo(-12,-14+w); ctx.lineTo(12,-14+w); ctx.lineTo(10,-10+w); ctx.lineTo(-10,-10+w); ctx.closePath(); ctx.fill();
            // Glowing eyes
            ctx.shadowBlur = 8; ctx.shadowColor = "#c084fc";
            ctx.fillStyle = "#c084fc";
            ctx.beginPath(); ctx.arc(-4,-13+w,3,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(4,-13+w,3,0,Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#000";
            ctx.beginPath(); ctx.arc(-4,-13+w,1.5,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(4,-13+w,1.5,0,Math.PI*2); ctx.fill();
            // Magic staff
            ctx.strokeStyle = "#6d28d9"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(12,-2+w); ctx.lineTo(18,16); ctx.stroke();
            ctx.fillStyle = "#c084fc"; ctx.shadowBlur = 12; ctx.shadowColor = "#a855f7";
            ctx.beginPath(); ctx.arc(12,-2+w,5,0,Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
        // HP bar with color indicating health level
        const hp = this.hp / this.maxHp;
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(this.x-22, this.y-36, 44, 6);
        ctx.fillStyle = hp > 0.5 ? "#22c55e" : (hp > 0.25 ? "#f59e0b" : "#ef4444");
        ctx.fillRect(this.x-22, this.y-36, 44*hp, 6);
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(this.x-22, this.y-36, 44, 6);
    }
}

class Tower {
    constructor(gx, gy, data) {
        this.gx = gx; this.gy = gy; this.data = data;
        this.x = gx*tileSize+tileSize/2; this.y = gy*tileSize+tileSize/2;
        const hpOverrides = { Demon: 7, Elemental: 9 };
        const baseHp = hpOverrides[data.name] ?? Math.max(3, Math.floor(data.cost / 100));
        this.timer = 0; this.rot = 0; this.hp = baseHp; this.maxHp = baseHp; this.dead = false; this.upgrades = 0; this.squashAnim = 0;
    }
    update() {
        this.timer += gameSpeed;

        if(this.data.name === 'Teddy') {
            if(this.squashAnim > 0) this.squashAnim -= 0.07 * gameSpeed;
            const inRange = enemies.filter(e => !e.dead && Math.hypot(e.x-this.x, e.y-this.y) < this.data.range);
            if(inRange.length > 0) {
                this.rot = Math.atan2(inRange[0].y - this.y, inRange[0].x - this.x);
                if(this.timer >= this.data.speed) {
                    this.timer = 0; this.squashAnim = 1.0;
                    inRange.forEach(e => {
                        e.hp -= this.data.damage;
                        floatingTexts.push({x: e.x, y: e.y - 14, txt: 'SQUISH!', life: 0.7, color: '#fbbf24'});
                        if(e.hp <= 0 && !e.dead) {
                            e.dead = true; gold += e.reward; updateUI();
                            audio.playDeath(e.type);
                            floatingTexts.push({x: e.x, y: e.y, txt: `+${e.reward}g`, life: 1.0, color: '#fbbf24'});
                        }
                    });
                    audio.playTower('Teddy');
                }
            }
            return;
        }

        const target = enemies.find(e => Math.hypot(e.x - this.x, e.y - this.y) < this.data.range);
        if(target) {
            this.rot = Math.atan2(target.y - this.y, target.x - this.x);
            if(this.timer >= this.data.speed) {
                projectiles.push(new Projectile(this.x, this.y, target, this.data.damage, this.data.name));
                this.timer = 0;
                audio.playTower(this.data.name);
            }
        }
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y);
        if(activeTower === this) {
            ctx.beginPath(); ctx.arc(0, 0, this.data.range, 0, Math.PI*2);
            ctx.fillStyle = "rgba(251,191,36,0.05)"; ctx.fill();
            ctx.strokeStyle = "rgba(251,191,36,0.3)"; ctx.lineWidth = 1; ctx.stroke();
        }
        const n = this.data.name;

        if(n === "Ninja") {
            ctx.fillStyle="#111827";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#374151";ctx.lineWidth=1;ctx.strokeRect(-22,-22,44,44);
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#4b5563";
            for(let i=0;i<4;i++){ctx.save();ctx.rotate(i*Math.PI/2);ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(5,-18);ctx.lineTo(-5,-18);ctx.closePath();ctx.fill();ctx.restore();}
            ctx.fillStyle="#9ca3af";ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();
            ctx.fillStyle="#1f2937";ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();
            ctx.restore();

        } else if(n === "Teddy") {
            ctx.fillStyle="#92400e";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#d97706";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.fillStyle="#b45309";ctx.beginPath();ctx.arc(0,2,14,0,Math.PI*2);ctx.fill();
            ctx.fillStyle="#a16207";
            ctx.beginPath();ctx.arc(-13,-12,8,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(13,-12,8,0,Math.PI*2);ctx.fill();
            ctx.fillStyle="#7c2d12";
            ctx.beginPath();ctx.arc(-13,-12,4,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(13,-12,4,0,Math.PI*2);ctx.fill();
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#1c1917";
            ctx.beginPath();ctx.arc(-5,-2,3.5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(5,-2,3.5,0,Math.PI*2);ctx.fill();
            ctx.fillStyle="#fff";
            ctx.beginPath();ctx.arc(-4,-3,1.5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(6,-3,1.5,0,Math.PI*2);ctx.fill();
            ctx.restore();
            ctx.fillStyle="#1c1917";ctx.beginPath();ctx.arc(0,5,4,0,Math.PI*2);ctx.fill();
            // Squash arms extend when attacking
            if(this.squashAnim > 0) {
                const ext = this.squashAnim * 24;
                ctx.save(); ctx.rotate(this.rot);
                ctx.fillStyle = `rgba(161,98,7,${this.squashAnim * 0.95})`;
                ctx.shadowBlur = 12; ctx.shadowColor = '#d97706';
                ctx.fillRect(-11, 14, 9, ext);   // left arm
                ctx.fillRect(2,   14, 9, ext);   // right arm
                // paws
                ctx.fillStyle = `rgba(180,115,40,${this.squashAnim})`;
                ctx.beginPath(); ctx.arc(-6,  14+ext, 6, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc( 7,  14+ext, 6, 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.restore();
            }

        } else if(n === "Knight") {
            ctx.fillStyle="#4b5563";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#374151";ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(-22,-7);ctx.lineTo(22,-7);ctx.stroke();
            ctx.beginPath();ctx.moveTo(-22,7);ctx.lineTo(22,7);ctx.stroke();
            ctx.beginPath();ctx.moveTo(-11,-22);ctx.lineTo(-11,-7);ctx.stroke();
            ctx.beginPath();ctx.moveTo(11,-7);ctx.lineTo(11,7);ctx.stroke();
            ctx.beginPath();ctx.moveTo(-11,7);ctx.lineTo(-11,22);ctx.stroke();
            ctx.strokeStyle="#9ca3af";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#b91c1c";
            ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(12,-6);ctx.lineTo(12,6);ctx.lineTo(0,14);ctx.lineTo(-12,6);ctx.lineTo(-12,-6);ctx.closePath();ctx.fill();
            ctx.strokeStyle="#f87171";ctx.lineWidth=1.5;ctx.stroke();
            ctx.strokeStyle="#fef2f2";ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,10);ctx.stroke();
            ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.stroke();
            ctx.restore();

        } else if(n === "Archer") {
            ctx.fillStyle="#5d3a1a";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#78350f";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.strokeStyle="rgba(0,0,0,0.3)";ctx.lineWidth=1;
            for(let yl=-14;yl<=14;yl+=10){ctx.beginPath();ctx.moveTo(-22,yl);ctx.lineTo(22,yl);ctx.stroke();}
            ctx.fillStyle="#1c0d04";ctx.fillRect(-3,-16,6,22);
            ctx.save();ctx.rotate(this.rot);
            ctx.strokeStyle="#d97706";ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(0,0,10,-1.0,1.0);ctx.stroke();
            ctx.beginPath();ctx.moveTo(9.5,-8.4);ctx.lineTo(9.5,8.4);ctx.stroke();
            ctx.strokeStyle="#92400e";ctx.lineWidth=1.5;
            ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(9,0);ctx.stroke();
            ctx.fillStyle="#d97706";
            ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(3,-4);ctx.lineTo(3,4);ctx.closePath();ctx.fill();
            ctx.restore();

        } else if(n === "Frost") {
            ctx.fillStyle="#0c4a6e";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#38bdf8";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.fillStyle="#7dd3fc";ctx.shadowBlur=10;ctx.shadowColor="#38bdf8";
            ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(7,-10);ctx.lineTo(0,-6);ctx.lineTo(-7,-10);ctx.closePath();ctx.fill();
            ctx.beginPath();ctx.moveTo(-22,-14);ctx.lineTo(-14,-8);ctx.lineTo(-18,-4);ctx.closePath();ctx.fill();
            ctx.beginPath();ctx.moveTo(22,-14);ctx.lineTo(14,-8);ctx.lineTo(18,-4);ctx.closePath();ctx.fill();
            ctx.shadowBlur=0;
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#7dd3fc";ctx.shadowBlur=8;ctx.shadowColor="#38bdf8";
            ctx.fillRect(2,-6,24,12);
            ctx.fillStyle="#bae6fd";ctx.fillRect(2,-6,6,12);
            ctx.shadowBlur=0;
            ctx.restore();

        } else if(n === "Wizard") {
            ctx.fillStyle="#1e1b4b";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#7c3aed";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.strokeStyle="#4c1d95";ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(-18,-18);ctx.lineTo(-12,-10);ctx.lineTo(-18,-2);ctx.stroke();
            ctx.beginPath();ctx.moveTo(18,18);ctx.lineTo(12,10);ctx.lineTo(18,2);ctx.stroke();
            ctx.fillStyle="#a78bfa";
            for(let [sx,sy] of [[-14,-16],[14,-14],[16,14],[-16,12],[0,-18]]){ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fill();}
            ctx.save();ctx.rotate(this.rot);
            const og=ctx.createRadialGradient(14,0,1,14,0,8);
            og.addColorStop(0,"#ede9fe");og.addColorStop(1,"#6d28d9");
            ctx.fillStyle=og;ctx.shadowBlur=20;ctx.shadowColor="#8b5cf6";
            ctx.beginPath();ctx.arc(14,0,7,0,Math.PI*2);ctx.fill();
            ctx.shadowBlur=0;
            ctx.restore();

        } else if(n === "Cannon") {
            ctx.fillStyle="#1e293b";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#475569";ctx.lineWidth=3;ctx.strokeRect(-22,-22,44,44);
            ctx.strokeStyle="#334155";ctx.lineWidth=4;
            ctx.beginPath();ctx.moveTo(-22,-8);ctx.lineTo(22,-8);ctx.stroke();
            ctx.beginPath();ctx.moveTo(-22,8);ctx.lineTo(22,8);ctx.stroke();
            ctx.fillStyle="#64748b";
            for(let [rx,ry] of [[-17,-17],[17,-17],[-17,17],[17,17]]){ctx.beginPath();ctx.arc(rx,ry,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#94a3b8";ctx.lineWidth=1;ctx.stroke();}
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#64748b";ctx.fillRect(0,-9,28,18);
            ctx.fillStyle="#94a3b8";ctx.fillRect(0,-9,8,18);ctx.fillRect(22,-7,6,14);
            ctx.strokeStyle="#334155";ctx.lineWidth=1;ctx.strokeRect(0,-9,28,18);
            ctx.restore();

        } else if(n === "Dino") {
            ctx.fillStyle="#14532d";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#16a34a";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.strokeStyle="#15803d";ctx.lineWidth=1;
            for(let sy=-16;sy<20;sy+=8)for(let sx=-16;sx<20;sx+=8){ctx.beginPath();ctx.arc(sx+4,sy+4,6,0,Math.PI);ctx.stroke();}
            ctx.fillStyle="#4ade80";
            for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*8-3,-22);ctx.lineTo(i*8,-33);ctx.lineTo(i*8+3,-22);ctx.closePath();ctx.fill();}
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#fb923c";ctx.shadowBlur=8;ctx.shadowColor="#f97316";
            ctx.beginPath();ctx.arc(-7,2,5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(7,2,5,0,Math.PI*2);ctx.fill();
            ctx.shadowBlur=0;
            ctx.fillStyle="#1a0a00";
            ctx.beginPath();ctx.arc(-7,2,2.5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(7,2,2.5,0,Math.PI*2);ctx.fill();
            ctx.restore();

        } else if(n === "Demon") {
            ctx.fillStyle="#1c0606";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#dc2626";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.strokeStyle="rgba(220,38,38,0.4)";ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(-22,10);ctx.lineTo(-10,0);ctx.lineTo(-16,-10);ctx.stroke();
            ctx.beginPath();ctx.moveTo(22,5);ctx.lineTo(8,-2);ctx.lineTo(14,-14);ctx.stroke();
            ctx.fillStyle="#450a0a";
            ctx.beginPath();ctx.moveTo(-14,-22);ctx.lineTo(-9,-36);ctx.lineTo(-4,-22);ctx.closePath();ctx.fill();
            ctx.beginPath();ctx.moveTo(14,-22);ctx.lineTo(9,-36);ctx.lineTo(4,-22);ctx.closePath();ctx.fill();
            ctx.fillStyle="#ef4444";ctx.shadowBlur=12;ctx.shadowColor="#ef4444";
            ctx.beginPath();ctx.arc(-8,-5,5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(8,-5,5,0,Math.PI*2);ctx.fill();
            ctx.shadowBlur=0;
            ctx.fillStyle="#300000";
            ctx.beginPath();ctx.arc(-8,-5,2.5,0,Math.PI*2);ctx.fill();
            ctx.beginPath();ctx.arc(8,-5,2.5,0,Math.PI*2);ctx.fill();
            ctx.save();ctx.rotate(this.rot);
            ctx.fillStyle="#dc2626";ctx.shadowBlur=15;ctx.shadowColor="#dc2626";
            ctx.beginPath();ctx.moveTo(2,4);ctx.lineTo(20,2);ctx.lineTo(17,-4);ctx.lineTo(24,-1);ctx.lineTo(20,-8);ctx.lineTo(12,-4);ctx.lineTo(14,2);ctx.closePath();ctx.fill();
            ctx.fillStyle="#fbbf24";ctx.shadowColor="#fbbf24";ctx.shadowBlur=5;
            ctx.beginPath();ctx.moveTo(4,2);ctx.lineTo(16,1);ctx.lineTo(14,-3);ctx.lineTo(19,-1);ctx.lineTo(16,-6);ctx.lineTo(10,-2);ctx.lineTo(12,1);ctx.closePath();ctx.fill();
            ctx.shadowBlur=0;
            ctx.restore();

        } else if(n === "Elemental") {
            ctx.fillStyle="#1e0a4e";ctx.fillRect(-22,-22,44,44);
            ctx.strokeStyle="#7c3aed";ctx.lineWidth=2;ctx.strokeRect(-22,-22,44,44);
            ctx.save();ctx.rotate(this.rot*0.5);
            ctx.strokeStyle="#a855f7";ctx.lineWidth=1.5;ctx.shadowBlur=12;ctx.shadowColor="#a855f7";
            ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*1.7);ctx.stroke();
            ctx.shadowBlur=0;ctx.restore();
            ctx.save();ctx.rotate(this.rot*-0.3);
            ctx.strokeStyle="#c084fc";ctx.lineWidth=1.5;
            ctx.beginPath();ctx.ellipse(0,0,18,8,0,0,Math.PI*2);ctx.stroke();
            ctx.restore();
            ctx.save();ctx.rotate(this.rot);
            const eg=ctx.createRadialGradient(0,0,2,0,0,12);
            eg.addColorStop(0,"#f0abfc");eg.addColorStop(0.6,"#9333ea");eg.addColorStop(1,"rgba(88,28,135,0)");
            ctx.fillStyle=eg;ctx.shadowBlur=25;ctx.shadowColor="#a855f7";
            ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();
            ctx.shadowBlur=0;
            ctx.restore();
        }

        // Fire damage HP bar (only shown when damaged)
        if(this.hp < this.maxHp) {
            const hpPct = this.hp / this.maxHp;
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(-22, 24, 44, 5);
            ctx.fillStyle = hpPct > 0.5 ? "#fb923c" : "#dc2626";
            ctx.fillRect(-22, 24, 44 * hpPct, 5);
        }

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, target, damage, type) {
        this.x = x; this.y = y; this.target = target;
        this.damage = damage; this.type = type;
        this.speed = 12; this.dead = false;
    }
    update() {
        let dx = this.target.x - this.x, dy = this.target.y - this.y, dist = Math.hypot(dx, dy);
        if(dist < this.speed * gameSpeed) {
            this.target.hp -= this.damage;
            if(this.type === "Frost") this.target.speed *= 0.95; // Frost slow effect
            if(this.target.hp <= 0 && !this.target.dead) {
                this.target.dead = true; gold += this.target.reward;
                floatingTexts.push({x: this.target.x, y: this.target.y, txt: `+${this.target.reward}g`, life: 1.0, color: "#fbbf24"});
                audio.playDeath(this.target.type);
                updateUI();
            }
            this.dead = true;
        } else {
            this.x += (dx/dist)*this.speed*gameSpeed; this.y += (dy/dist)*this.speed*gameSpeed;
        }
    }
    draw() {
        const props = {
            Ninja:     { color: "#94a3b8", r: 3 },
            Teddy:     { color: "#d97706", r: 3 },
            Knight:    { color: "#f87171", r: 4, glow: "#ef4444" },
            Archer:    { color: "#fbbf24", r: 3 },
            Frost:     { color: "#67e8f9", r: 4, glow: "#38bdf8" },
            Wizard:    { color: "#c084fc", r: 5, glow: "#a855f7" },
            Cannon:    { color: "#94a3b8", r: 6 },
            Dino:      { color: "#4ade80", r: 5, glow: "#16a34a" },
            Demon:     { color: "#f97316", r: 5, glow: "#dc2626" },
            Elemental: { color: "#f0abfc", r: 5, glow: "#a855f7" },
        };
        const p = props[this.type] || { color: "#fbbf24", r: 4 };
        if(p.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.glow; }
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, p.r, 0, Math.PI*2); ctx.fill();
        if(p.glow) ctx.shadowBlur = 0;
    }
}

class EnemyProjectile {
    constructor(x, y, target) {
        this.x = x; this.y = y; this.target = target;
        this.speed = 4; this.dead = false;
    }
    update() {
        const dx = this.target.x - this.x, dy = this.target.y - this.y, dist = Math.hypot(dx, dy);
        if(dist < this.speed * gameSpeed) {
            if(!this.target.dead) {
                this.target.hp -= 0.5;
                if(this.target.hp <= 0) {
                    this.target.dead = true; mapGrid[this.target.gy][this.target.gx] = 0;
                    screenShake = 18;
                    floatingTexts.push({x: this.target.x, y: this.target.y, txt: "DESTROYED!", life: 1.8, color: "#f97316"});
                }
            }
            this.dead = true;
        } else {
            this.x += (dx/dist)*this.speed*gameSpeed; this.y += (dy/dist)*this.speed*gameSpeed;
        }
    }
    draw() {
        ctx.fillStyle = "#ef4444"; ctx.shadowBlur = 8; ctx.shadowColor = "#dc2626";
        ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- MENU TAGLINE ---
(function() {
    const verbs = [
        'Survive','Endure','Repel','Withstand','Halt','Defy','Outlast','Crush',
        'Shatter','Vanquish','Weather','Resist','Thwart','Stem'
    ];
    const nouns = [
        'Onslaught','Siege','Horde','Tide','Tempest','Fury','Reckoning','Deluge',
        'Swarm','Rampage','Onslaught','Assault','Maelstrom','Avalanche','Darkness'
    ];
    const v = verbs[Math.floor(Math.random() * verbs.length)];
    const n = nouns[Math.floor(Math.random() * nouns.length)];
    document.getElementById('menu-tagline').textContent = `${v} the ${n}.`;
})();

// --- LEADERBOARD ---
function initLeaderboard(finalLives, diff) {
    const nameInput = document.getElementById('player-name');
    const submitBtn = document.getElementById('btn-submit-score');
    nameInput.focus();

    function saveAndShow() {
        const name = nameInput.value.trim() || 'Anonymous';
        const scores = JSON.parse(localStorage.getItem('dashytd_scores') || '[]');
        scores.push({ name, lives: finalLives, diff });
        scores.sort((a, b) => b.lives - a.lives);
        if(scores.length > 20) scores.length = 20;
        localStorage.setItem('dashytd_scores', JSON.stringify(scores));
        document.getElementById('name-entry').classList.add('hidden');
        renderLeaderboard(scores, name, finalLives, diff);
        document.getElementById('leaderboard').classList.remove('hidden');
    }

    submitBtn.onclick = saveAndShow;
    nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') saveAndShow(); });
}

function renderLeaderboard(scores, myName, myLives, myDiff) {
    const medals = ['🥇','🥈','🥉'];
    const medalClass = ['gold-rank','silver-rank','bronze-rank'];
    const diffLabel = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
    const container = document.getElementById('lb-rows');
    container.innerHTML = scores.map((s, i) => {
        const isMe = s.name === myName && s.lives === myLives && s.diff === myDiff;
        const rankEl = i < 3
            ? `<span class="lb-rank ${medalClass[i]}">${medals[i]}</span>`
            : `<span class="lb-rank">${i+1}.</span>`;
        return `<div class="lb-row">
            ${rankEl}
            <span class="lb-name${isMe ? ' lb-me' : ''}">${escHtml(s.name)}</span>
            <span class="lb-diff">${diffLabel[s.diff] || s.diff}</span>
            <span class="lb-lives">❤️ ${s.lives}</span>
        </div>`;
    }).join('');
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- ENGINE ---
function startGame(diff) {
    audio.init();
    difficulty = diff;
    gold = diff === 'easy' ? 600 : (diff === 'hard' ? 250 : 400); // INCREASED START GOLD
    lives = diff === 'easy' ? 30 : (diff === 'hard' ? 10 : 20);
    wave = 1; gameState = "PLAYING";
    document.getElementById('menu-overlay').classList.add('hidden');
    generateMap(); updateUI(); initUI(); startWave(); gameLoop();
}

function startWave() {
    let count = difficulty === 'normal' ? 12 + wave * 4 : 8 + wave * 3;
    waveQueue = Array(count).fill(0).map(() => new Enemy(wave));
    if(difficulty === 'normal') {
        const dragons = Array(wave).fill(0).map(() => new Enemy(wave, 'dragon'));
        waveQueue.push(...dragons);
        if(wave >= 10) {
            const blueDragons = Array(Math.floor((wave - 8) / 2)).fill(0).map(() => new Enemy(wave, 'blue_dragon'));
            waveQueue.push(...blueDragons);
        }
    }
    prepTimer = 400;
}

function gameLoop() {
    if(gameState !== "PLAYING" && gameState !== "PAUSED") return;

    if(gameState === "PAUSED") {
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0,0,1280,720);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fbbf24"; ctx.shadowBlur = 24; ctx.shadowColor = "#fbbf24";
        ctx.font = "bold 72px MedievalSharp"; ctx.fillText("PAUSED", 640, 330);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#aaa"; ctx.font = "22px sans-serif";
        ctx.fillText("Press  P  to resume", 640, 390);
        requestAnimationFrame(gameLoop);
        return;
    }

    ctx.save();
    if(screenShake > 0) { ctx.translate(Math.random()*screenShake - screenShake/2, Math.random()*screenShake - screenShake/2); screenShake *= 0.9; }
    ctx.clearRect(0,0,1280,720);
    drawMap();

    if(prepTimer > 0) {
        prepTimer -= gameSpeed;
        ctx.fillStyle = "white"; ctx.font = "30px MedievalSharp"; ctx.textAlign = "center";
        ctx.fillText(`Wave ${wave} Gathering...`, 640, 100);
    } else if(waveQueue.length > 0) {
        spawnTimer += gameSpeed;
        if(spawnTimer >= nextSpawnDelay) {
            enemies.push(waveQueue.shift());
            spawnTimer = 0;
            nextSpawnDelay = 30 + Math.random() * 120;
        }
    }

    enemies = enemies.filter(e => { e.update(); e.draw(); return !e.dead; });
    towers = towers.filter(t => { t.update(); t.draw(); return !t.dead; });
    projectiles = projectiles.filter(p => { p.update(); p.draw(); return !p.dead; });
    enemyProjectiles = enemyProjectiles.filter(p => { p.update(); p.draw(); return !p.dead; });
    floatingTexts = floatingTexts.filter(ft => {
        ft.y -= 1.2; ft.life -= 0.02;
        ctx.save(); ctx.globalAlpha = ft.life; ctx.fillStyle = ft.color; ctx.font = "bold 18px Arial"; ctx.fillText(ft.txt, ft.x, ft.y); ctx.restore();
        return ft.life > 0;
    });

    ctx.restore();
    if(lives <= 0) {
        gameState = "GAMEOVER";
        document.getElementById('go-waves').innerText = wave;
        document.getElementById('go-lives').innerText = (difficulty === 'easy' ? 30 : difficulty === 'hard' ? 10 : 20) - lives;
        document.getElementById('go-gold').innerText = gold + 'g';
        document.getElementById('gameover-overlay').classList.remove('hidden');
        return;
    }

    if(enemies.length === 0 && waveQueue.length === 0 && prepTimer <= 0) {
        if(wave >= 20) {
            gameState = "VICTORY";
            document.getElementById('vic-lives').innerText = lives;
            document.getElementById('vic-gold').innerText = gold + 'g';
            document.getElementById('victory-overlay').classList.remove('hidden');
            initLeaderboard(lives, difficulty);
            return;
        }
        let bonus = wave * 60; gold += bonus;
        floatingTexts.push({x: 640, y: 360, txt: `Wave ${wave} cleared! +${bonus}g`, life: 2.5, color: "#fbbf24"});
        audio.play(500, 'sine', 0.5);
        wave++; startWave(); updateUI();
    }
    requestAnimationFrame(gameLoop);
}

function renderMapCache() {
    const sr = n => { let v = Math.sin(n * 127.1 + 311.7) * 43758.5; return v - Math.floor(v); };
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = 1280; mapCanvas.height = 768;
    const mc = mapCanvas.getContext('2d');

    for(let ty = 0; ty < 12; ty++) {
        for(let tx = 0; tx < 20; tx++) {
            const px = tx*tileSize, py = ty*tileSize;
            const s = tx*37 + ty*73;

            if(mapGrid[ty][tx] === 1) {
                // ── DIRT PATH ──
                // Base warm brown, slight per-tile variation
                const bv = 0.88 + sr(s)*0.18;
                mc.fillStyle = `rgb(${Math.round(72*bv)},${Math.round(46*bv)},${Math.round(24*bv)})`;
                mc.fillRect(px, py, tileSize, tileSize);

                // Detect path direction for ruts
                const hL = tx > 0  && mapGrid[ty][tx-1] === 1;
                const hR = tx < 19 && mapGrid[ty][tx+1] === 1;
                const vU = ty > 0  && mapGrid[ty-1][tx] === 1;
                const vD = ty < 11 && mapGrid[ty+1][tx] === 1;
                const horiz = hL || hR, vert = vU || vD;

                // Worn-centre highlight
                const wg = horiz && !vert
                    ? mc.createLinearGradient(px, py, px, py+tileSize)
                    : mc.createLinearGradient(px, py, px+tileSize, py);
                wg.addColorStop(0,   'rgba(0,0,0,0.28)');
                wg.addColorStop(0.22,'rgba(0,0,0,0)');
                wg.addColorStop(0.78,'rgba(0,0,0,0)');
                wg.addColorStop(1,   'rgba(0,0,0,0.28)');
                mc.fillStyle = wg; mc.fillRect(px, py, tileSize, tileSize);

                // Wheel ruts
                mc.strokeStyle = 'rgba(30,14,4,0.45)'; mc.lineWidth = 2;
                if(horiz && !vert) {
                    // horizontal path → vertical ruts
                    for(let r = 0; r < 3; r++) {
                        const rx = px + 12 + r*18 + (sr(s+r*7)-0.5)*4;
                        mc.beginPath(); mc.moveTo(rx, py); mc.lineTo(rx, py+tileSize); mc.stroke();
                    }
                } else if(vert && !horiz) {
                    // vertical path → horizontal ruts
                    for(let r = 0; r < 3; r++) {
                        const ry = py + 12 + r*18 + (sr(s+r*7)-0.5)*4;
                        mc.beginPath(); mc.moveTo(px, ry); mc.lineTo(px+tileSize, ry); mc.stroke();
                    }
                } else {
                    // corner → both
                    for(let r = 0; r < 2; r++) {
                        const rx = px + 14 + r*22; const ry = py + 14 + r*22;
                        mc.beginPath(); mc.moveTo(rx, py); mc.lineTo(rx, py+tileSize); mc.stroke();
                        mc.beginPath(); mc.moveTo(px, ry); mc.lineTo(px+tileSize, ry); mc.stroke();
                    }
                }

                // Dark pebbles
                mc.fillStyle = 'rgba(28,14,4,0.7)';
                for(let p = 0; p < 5; p++) {
                    mc.beginPath();
                    mc.arc(px+4+sr(s+p*17)*56, py+4+sr(s+p*23)*56, 1+sr(s+p*11)*2.5, 0, Math.PI*2);
                    mc.fill();
                }
                // Light pebbles
                mc.fillStyle = 'rgba(180,130,70,0.4)';
                for(let p = 0; p < 3; p++) {
                    mc.beginPath();
                    mc.arc(px+6+sr(s+p*53)*52, py+6+sr(s+p*61)*52, 1+sr(s+p*29)*2, 0, Math.PI*2);
                    mc.fill();
                }

            } else {
                // ── GRASS ──
                // Base green with per-tile shade variation
                const gv = 0.82 + sr(s)*0.28;
                const gr = Math.round(5*gv), gg = Math.round(28 + sr(s+1)*14)*gv|0, gb = Math.round(5*gv);
                mc.fillStyle = `rgb(${gr},${gg},${gb})`; mc.fillRect(px, py, tileSize, tileSize);

                // Darker moss / shadow blotch (40 % of tiles)
                if(sr(s+200) > 0.6) {
                    mc.fillStyle = `rgba(0,${8+Math.round(sr(s+201)*10)},0,0.35)`;
                    mc.beginPath();
                    mc.ellipse(px+8+sr(s+202)*48, py+8+sr(s+203)*48,
                               10+sr(s+204)*22, 7+sr(s+205)*14,
                               sr(s+206)*Math.PI, 0, Math.PI*2);
                    mc.fill();
                }
                // Lighter sunlit patch (25 % of tiles)
                if(sr(s+210) > 0.75) {
                    mc.fillStyle = 'rgba(60,120,20,0.18)';
                    mc.beginPath();
                    mc.ellipse(px+10+sr(s+211)*44, py+10+sr(s+212)*44,
                               8+sr(s+213)*16, 6+sr(s+214)*10,
                               sr(s+215)*Math.PI, 0, Math.PI*2);
                    mc.fill();
                }

                // Grass blades
                for(let i = 0; i < 10; i++) {
                    const gx2 = px + sr(s+i*7)*tileSize;
                    const gy2 = py + sr(s+i*11)*tileSize;
                    const gh  = 4 + sr(s+i*13)*9;
                    const lean = (sr(s+i*19)-0.5)*6;
                    const green = 55 + Math.round(sr(s+i*17)*80);
                    mc.strokeStyle = `rgba(0,${green},0,0.65)`; mc.lineWidth = 1;
                    mc.beginPath(); mc.moveTo(gx2, gy2); mc.lineTo(gx2+lean, gy2-gh); mc.stroke();
                }
                // Tiny flowers (15 % of tiles)
                if(sr(s+100) > 0.85) {
                    mc.fillStyle = sr(s+101) > 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(251,191,36,0.8)';
                    mc.beginPath();
                    mc.arc(px+8+sr(s+102)*48, py+8+sr(s+103)*48, 2, 0, Math.PI*2);
                    mc.fill();
                }
            }
        }
    }

    // ── EDGE SHADOWS where path meets grass ──
    for(let ty = 0; ty < 12; ty++) {
        for(let tx = 0; tx < 20; tx++) {
            if(mapGrid[ty][tx] !== 1) continue;
            const px = tx*tileSize, py = ty*tileSize;
            for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                const nx = tx+dx, ny = ty+dy;
                if(nx<0||nx>=20||ny<0||ny>=12||mapGrid[ny][nx]===1) continue;
                const npx = nx*tileSize, npy = ny*tileSize;

                // Shadow bleeding onto the grass tile
                const x0g = dx===1?npx  :dx===-1?npx+tileSize:npx;
                const y0g = dy===1?npy  :dy===-1?npy+tileSize:npy;
                const x1g = dx===1?npx+20:dx===-1?npx+tileSize-20:npx;
                const y1g = dy===1?npy+20:dy===-1?npy+tileSize-20:npy;
                const sg = mc.createLinearGradient(x0g,y0g,x1g,y1g);
                sg.addColorStop(0,'rgba(0,0,0,0.5)'); sg.addColorStop(1,'rgba(0,0,0,0)');
                mc.fillStyle = sg; mc.fillRect(npx,npy,tileSize,tileSize);

                // Dark rim on the path edge itself
                const x0p = dx===-1?px+tileSize:dx===1?px:px;
                const y0p = dy===-1?py+tileSize:dy===1?py:py;
                const x1p = dx===-1?px+tileSize-10:dx===1?px+10:px;
                const y1p = dy===-1?py+tileSize-10:dy===1?py+10:py;
                const pg = mc.createLinearGradient(x0p,y0p,x1p,y1p);
                pg.addColorStop(0,'rgba(0,0,0,0.38)'); pg.addColorStop(1,'rgba(0,0,0,0)');
                mc.fillStyle = pg; mc.fillRect(px,py,tileSize,tileSize);
            }
        }
    }

    // Goal portal (baked in)
    mc.fillStyle = '#1e3a8a'; mc.shadowBlur = 20; mc.shadowColor = '#60a5fa';
    mc.fillRect(19*tileSize+10, exitRow*tileSize+10, 40, 44); mc.shadowBlur = 0;
}

function drawMap() {
    if(mapCanvas) ctx.drawImage(mapCanvas, 0, 0);
}

function initUI() {
    const container = document.getElementById('tower-buttons');
    container.innerHTML = "";
    TOWER_DATA.forEach(t => {
        const b = document.createElement('button'); b.className = 'tower-btn';
        b.innerHTML = `<div class="btn-top"><span>${t.name}</span><span>${t.cost}g</span></div><div class="btn-stats">Dmg: ${t.damage} | Rng: ${t.range} | ${(120/t.speed).toFixed(1)}/s</div>`;
        b.onclick = () => { audio.init(); selectedTowerType = t; Array.from(document.getElementsByClassName('tower-btn')).forEach(el=>el.classList.remove('active')); b.classList.add('active'); };
        container.appendChild(b);
    });
}

function updateUI() {
    document.getElementById('gold-val').innerText = gold;
    document.getElementById('lives-val').innerText = lives;
    document.getElementById('wave-val').innerText = wave;
}

canvas.addEventListener('click', (e) => {
    audio.init();
    const rect = canvas.getBoundingClientRect(), gx = Math.floor((e.clientX - rect.left)/tileSize), gy = Math.floor((e.clientY - rect.top)/tileSize);
    if(selectedTowerType && mapGrid[gy][gx] === 0) {
        if(gold >= selectedTowerType.cost) {
            towers.push(new Tower(gx, gy, selectedTowerType));
            mapGrid[gy][gx] = 2; gold -= selectedTowerType.cost; updateUI(); audio.play(100, 'sine', 0.2);
        } else {
            floatingTexts.push({x: e.clientX - rect.left, y: e.clientY - rect.top, txt: "Too Expensive!", life: 1.0, color: "#f87171"});
        }
    } else if(mapGrid[gy][gx] === 2) {
        activeTower = towers.find(t => t.gx === gx && t.gy === gy);
        document.getElementById('info-panel').classList.remove('hidden');
        showTowerInfo(activeTower);
    } else {
        activeTower = null; document.getElementById('info-panel').classList.add('hidden');
    }
});

function showTowerInfo(t) {
    const upgradeCost = t.data.cost * 2;
    const sellValue = Math.floor(t.data.cost * 0.5);
    document.getElementById('info-name').innerText = t.data.name;
    document.getElementById('info-stats').innerHTML =
        `Dmg: ${t.data.damage} &nbsp;|&nbsp; Rng: ${t.data.range}<br>HP: ${t.hp}/${t.maxHp} &nbsp;|&nbsp; Upgrades: ${t.upgrades}`;
    document.getElementById('btn-upgrade').innerText = `Upgrade — ${upgradeCost}g (2× HP)`;
    document.getElementById('btn-sell').innerText = `Sell +${sellValue}g`;
}

document.getElementById('btn-upgrade').onclick = () => {
    if(!activeTower) return;
    const cost = activeTower.data.cost * 2;
    if(gold < cost) {
        floatingTexts.push({x: activeTower.x, y: activeTower.y - 20, txt: "Too Expensive!", life: 1.0, color: "#f87171"});
        return;
    }
    gold -= cost;
    activeTower.maxHp *= 2;
    activeTower.hp = activeTower.maxHp;
    activeTower.upgrades++;
    showTowerInfo(activeTower);
    updateUI();
    audio.play(600, 'sine', 0.3, 0.06);
};

document.getElementById('btn-sell').onclick = () => {
    if(!activeTower) return;
    gold += Math.floor(activeTower.data.cost * 0.5);
    mapGrid[activeTower.gy][activeTower.gx] = 0;
    activeTower.dead = true;
    activeTower = null;
    document.getElementById('info-panel').classList.add('hidden');
    updateUI();
    audio.play(300, 'sine', 0.2, 0.04);
};

document.getElementById('btn-speed').onclick = (e) => {
    audio.init(); gameSpeed = gameSpeed === 8 ? 2 : gameSpeed + 2; e.target.innerText = `${gameSpeed/2}x Speed`;
};

document.addEventListener('keydown', e => {
    if(e.key !== 'p' && e.key !== 'P') return;
    if(gameState === 'PLAYING') { gameState = 'PAUSED'; }
    else if(gameState === 'PAUSED') { gameState = 'PLAYING'; requestAnimationFrame(gameLoop); }
});