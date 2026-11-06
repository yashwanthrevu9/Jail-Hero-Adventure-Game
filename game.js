/* ------------------------------------------------------------------
   SETTINGS - change these numbers to tune the game
------------------------------------------------------------------ */
const HERO_W = 65;           // picture size on screen
const HERO_H = 75;
const HITBOX_W = 34;         // smaller "real" hitbox so the game feels fair
const HITBOX_H = 46;
const OVERLAY_DELAY = 700;   // ms before the game over screen appears (stops accidental taps)
const BEST_KEY = 'jail-hero-best';
const RESTART_VOICE = null;     // optional voice on the restart button, e.g. '/voice.mp3' (null = none)
const TAP_SOUNDS = false;      // jump and score beeps: true = on, false = off
const SAD_TROMBONE = true;     // "wah wah" when you crash: true = on, false = off

// Background audio: plays again and again, the whole time the game is being played
const BACKGROUND_MUSIC = 'public/funny-audio.mp3';
const MUSIC_VOLUME = 1;        // 0 = silent, 1 = full

// Funny clips shown on the game over screen (files go in the public folder).
// A different clip is picked each time. zoom: 1 = normal, bigger = crops black borders.
// audio: (optional) a separate sound file that plays together with a silent clip.
const VIDEO_CLIPS = [
    { src: 'public/funny.mp4',  zoom: 1, audio: 'public/malli-modhalu.mp3' },
    // { src: 'public/funny2.mp4', zoom: 1 },
    // { src: 'public/funny3.mp4', zoom: 1 },
];

/* ------------------------------------------------------------------
   TEXT shown on the game screen
------------------------------------------------------------------ */
const TEXT = {
    title: 'JAIL HERO ADVENTURE',
    tapToStart: 'TAP TO START',
    score: 'SCORE',
    best: 'BEST',
    gameOver: 'FASAK'
};

function t(key) {
    return TEXT[key];
}

const FONT = '"Baloo 2", sans-serif';

/* ------------------------------------------------------------------
   SOUNDS - made with code, so no sound files are needed
------------------------------------------------------------------ */
let audioCtx = null;

function unlockAudio() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// One simple beep: start/end frequency, length in seconds, wave type, volume, delay
function tone(freqStart, freqEnd, duration, type = 'square', volume = 0.12, delay = 0) {
    if (!audioCtx) return null;
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);

    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    return osc;
}

let gameOverNotes = [];

// Stops the trombone so the video's own sound is heard clearly
function stopGameOverSound() {
    gameOverNotes.forEach(osc => {
        try { if (osc) osc.stop(); } catch (e) { /* already stopped */ }
    });
    gameOverNotes = [];
}

const sfx = {
    jump() {
        if (!TAP_SOUNDS) return;
        tone(380, 760, 0.12, 'square', 0.08);
    },
    point() {
        if (!TAP_SOUNDS) return;
        tone(880, 1320, 0.1, 'triangle', 0.1);
    },
    // Funny "sad trombone": wah wah wah waaaah
    gameOver() {
        if (!SAD_TROMBONE) return;
        gameOverNotes = [
            tone(311, 295, 0.35, 'sawtooth', 0.12, 0.0),
            tone(294, 278, 0.35, 'sawtooth', 0.12, 0.4),
            tone(277, 262, 0.35, 'sawtooth', 0.12, 0.8),
            tone(247, 150, 0.9, 'sawtooth', 0.14, 1.2)
        ];
    }
};

/* ------------------------------------------------------------------
   GAME AUDIO - funny-audio.mp3 plays in a loop the whole time the game
   is being played. It stops when the game is over.
------------------------------------------------------------------ */
const bgMusic = new Audio(BACKGROUND_MUSIC);
bgMusic.loop = true;
bgMusic.volume = MUSIC_VOLUME;
bgMusic.preload = 'auto';

bgMusic.addEventListener('error', () => {
    console.warn('Game audio could not be loaded. Check public/' + BACKGROUND_MUSIC.slice(1) + ' (it must be a real MP3 file).');
});

// Called on every tap, so if the browser blocked it once, the next tap starts it
function startMusic() {
    if (!bgMusic.paused) return;
    bgMusic.play().catch(err => {
        console.warn('Game audio could not play:', err);
    });
}

function stopMusic() {
    bgMusic.pause();
    bgMusic.currentTime = 0;
}

/* ------------------------------------------------------------------
   BEST SCORE (saved in the browser)
------------------------------------------------------------------ */
function loadBest() {
    try {
        return parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
    } catch (e) {
        return 0;
    }
}

function saveBest(value) {
    try {
        localStorage.setItem(BEST_KEY, String(value));
    } catch (e) {
        /* storage blocked - ignore */
    }
}

/* ------------------------------------------------------------------
   GAME OVER SCREEN (HTML) - funny video + restart button
------------------------------------------------------------------ */
const overlay = document.getElementById('gameover');
const goScore = document.getElementById('go-score');
const goBest = document.getElementById('go-best');
const goNew = document.getElementById('go-new');
const goVideo = document.getElementById('go-video');
const restartBtn = document.getElementById('restart-btn');

// Make the game-over video loop automatically
goVideo.loop = true;

const videoBox = goVideo.parentElement;
const unmuteBtn = document.getElementById('unmute-btn');

// Browsers sometimes start a clip muted - this button turns the sound on
unmuteBtn.addEventListener('click', () => {
    goVideo.muted = false;
    goVideo.volume = 1;
    goVideo.play().catch(() => {});
    unmuteBtn.classList.add('hidden');
});
let usableClips = [...VIDEO_CLIPS];
let currentClip = null;

// If a clip file is missing, skip it from now on and hide the box
goVideo.addEventListener('error', () => {
    usableClips = usableClips.filter(c => c !== currentClip);
    videoBox.classList.add('hidden');
});

// ----- Separate audio for the clip (kept in step with the video) -----
let clipAudio = null;

function stopClipAudio() {
    if (clipAudio) {
        clipAudio.pause();
        clipAudio = null;
    }
}

goVideo.addEventListener('playing', () => {
    if (clipAudio && clipAudio.paused) {
        clipAudio.currentTime = goVideo.currentTime;
        clipAudio.play().catch(err => console.warn('Clip audio could not play:', err));
    }
});
goVideo.addEventListener('pause', () => { if (clipAudio) clipAudio.pause(); });
goVideo.addEventListener('seeked', () => { if (clipAudio) clipAudio.currentTime = goVideo.currentTime; });

// Pick a random clip, but not the same one twice in a row
function pickClip() {
    if (usableClips.length === 0) return null;
    const others = usableClips.filter(c => c !== currentClip);
    const choices = others.length ? others : usableClips;
    return choices[Math.floor(Math.random() * choices.length)];
}

function showGameOver(score, best, isNewBest) {
    goScore.textContent = score;
    goBest.textContent = best;
    goNew.classList.toggle('hidden', !isNewBest);
    overlay.classList.remove('hidden');

    stopGameOverSound();
    unmuteBtn.classList.add('hidden');

    currentClip = pickClip();
    if (!currentClip) {
        videoBox.classList.add('hidden');
        return;
    }

    videoBox.classList.remove('hidden');
    videoBox.style.setProperty('--video-zoom', currentClip.zoom);
    goVideo.src = currentClip.src;
    goVideo.currentTime = 0;
    goVideo.volume = 1;

    stopClipAudio();
    if (currentClip.audio) {
        // the video stays silent, its sound comes from the separate audio file
        goVideo.muted = true;
        clipAudio = new Audio(currentClip.audio);
        clipAudio.loop = true; // <--- Make the separate audio file loop as well
        clipAudio.volume = 1;
        clipAudio.addEventListener('error', () => {
            console.warn('Clip audio could not be loaded. Check public/' + currentClip.audio.slice(1));
        });
    } else {
        goVideo.muted = false;
    }

    const playing = goVideo.play();
    if (playing && playing.catch) {
        // Some browsers block sound autoplay: retry muted so the clip still plays
        playing.catch(() => {
            goVideo.muted = true;
            if (!currentClip.audio) unmuteBtn.classList.remove('hidden');
            goVideo.play().catch(() => {});
        });
    }

    // Help find silent clips: warn in the Console if the file has no sound track
    setTimeout(() => {
        if (
            typeof goVideo.webkitAudioDecodedByteCount === 'number' &&
            goVideo.webkitAudioDecodedByteCount === 0 &&
            !goVideo.paused && !goVideo.muted
        ) {
            console.warn('This clip seems to have NO sound in the file itself: ' + currentClip.src);
        }
    }, 1500);
}

// Optional restart voice (off unless RESTART_VOICE is set)
const restartVoice = RESTART_VOICE ? new Audio(RESTART_VOICE) : null;

function playRestartVoice() {
    if (!restartVoice) return;
    restartVoice.currentTime = 0;
    restartVoice.play().catch(err => {
        console.warn('Restart voice could not play:', err);
    });
}

function hideGameOver() {
    goVideo.pause();
    stopClipAudio();
    overlay.classList.add('hidden');
}

/* ------------------------------------------------------------------
   MAIN SCENE
------------------------------------------------------------------ */
class ForestScene extends Phaser.Scene {

    constructor() {
        super('ForestScene');
    }

    preload() {
        this.load.image('hero', '/hero.png');
    }

    create() {

        // Dark cell backdrop (dark grey/black)
        this.add.rectangle(200, 350, 400, 700, 0x1a1a1a);

        // Jail Rods / Bars background graphics
        const bars = this.add.graphics();
        const numberOfBars = 10;
        const spacing = 400 / (numberOfBars + 1);

        for (let i = 1; i <= numberOfBars; i++) {
            let x = i * spacing;

            // Bar shadow/outline (dark gray)
            bars.fillStyle(0x333333);
            bars.fillRect(x - 5, 0, 10, 700);

            // Bar main body (metallic gray)
            bars.fillStyle(0x888888);
            bars.fillRect(x - 3, 0, 6, 700);

            // Metallic highlight stripe along the bar
            bars.fillStyle(0xcccccc);
            bars.fillRect(x - 1, 0, 2, 700);
        }

        // Horizontal security crossbars (top and bottom)
        bars.fillStyle(0x444444);
        bars.fillRect(0, 100, 400, 12); // Top horizontal beam
        bars.fillRect(0, 580, 400, 12); // Bottom horizontal beam

        // Ground/Floor
        this.add.rectangle(200, 685, 400, 30, 0x2b2b2b);

        // Hero photo
        this.hero = this.add.image(100, 300, 'hero');
        this.hero.setDisplaySize(HERO_W, HERO_H);

        this.velocityY = 0;
        this.gravity = 900;
        this.jumpPower = -350;

        this.started = false;
        this.gameOver = false;

        // Game data
        this.score = 0;
        this.best = loadBest();
        this.obstacles = [];
        this.spawnTime = 0;

        // Score
        this.scoreText = this.add.text(
            20, 20, '',
            {
                fontSize: '23px',
                color: '#ffffff',
                fontFamily: FONT,
            }
        );

        // Best score
        this.bestText = this.add.text(
            20, 50, '',
            {
                fontSize: '18px',
                color: '#ffdf80',
                fontFamily: FONT,
            }
        );

        // Title
        this.titleText = this.add.text(
            200, 75,
            '',
            {
                fontSize: '19px',
                color: '#ffffff',
                fontStyle: 'bold',
                fontFamily: FONT
            }
        ).setOrigin(0.5);

        // Message
        this.message = this.add.text(
            200, 560,
            '',
            {
                fontSize: '25px',
                color: '#ffffff',
                fontStyle: 'bold',
                align: 'center',
                fontFamily: FONT
            }
        ).setOrigin(0.5);

        this.refreshTexts();

        // Tap controls (restart is handled by the Play again button)
        this.input.on('pointerdown', () => {

            if (this.gameOver) return;

            unlockAudio();
            startMusic();
            sfx.jump();

            this.started = true;
            this.velocityY = this.jumpPower;
            this.refreshTexts();
        });

        // The Play again button restarts this scene
        restartBtn.onclick = () => {
            hideGameOver();
            playRestartVoice();
            this.scene.restart();
        };
    }

    // Draw all on-screen text
    refreshTexts() {
        this.titleText.setText(t('title'));
        this.scoreText.setText(t('score') + ': ' + this.score);
        this.bestText.setText(t('best') + ': ' + this.best);

        if (this.gameOver) {
            this.message.setText(t('gameOver'));
        } else if (!this.started) {
            this.message.setText(t('tapToStart'));
        } else {
            this.message.setText('');
        }
    }

    // Smaller hitbox centered on the hero
    getHeroHitbox() {
        return new Phaser.Geom.Rectangle(
            this.hero.x - HITBOX_W / 2,
            this.hero.y - HITBOX_H / 2,
            HITBOX_W,
            HITBOX_H
        );
    }

    // Create wooden obstacles
    createObstacles() {

        const gap = 230; 
        const gapY = Phaser.Math.Between(240, 450);

        const topHeight = gapY - gap / 2;
        const bottomY = gapY + gap / 2;
        const bottomHeight = 670 - bottomY;

        // Top wooden log
        const top = this.add.rectangle(
            430,
            topHeight / 2,
            45,
            topHeight,
            0x80502d
        );

        // Bottom wooden log
        const bottom = this.add.rectangle(
            430,
            bottomY + bottomHeight / 2,
            45,
            bottomHeight,
            0x80502d
        );

        // Wooden texture lines
        const topLine = this.add.rectangle(
            430, topHeight / 2, 7, topHeight, 0x57351f
        );

        const bottomLine = this.add.rectangle(
            430,
            bottomY + bottomHeight / 2,
            7,
            bottomHeight,
            0x57351f
        );

        this.obstacles.push({
            top,
            bottom,
            topLine,
            bottomLine,
            scored: false
        });
    }

    // End game
    endGame() {

        if (this.gameOver) return;

        this.gameOver = true;

        // Save best score
        const isNewBest = this.score > this.best;
        if (isNewBest) {
            this.best = this.score;
            saveBest(this.best);
        }

        this.message.setColor('#ffdf80');
        this.refreshTexts();

        stopMusic();
        sfx.gameOver();

        // Short pause, then show the funny video + restart button
        this.time.delayedCall(OVERLAY_DELAY, () => {
            showGameOver(this.score, this.best, isNewBest);
        });
    }

    update(time, delta) {

        if (!this.started || this.gameOver) return;

        const dt = Math.min(delta / 1000, 0.05);

        // Hero movement
        this.velocityY += this.gravity * dt;
        this.hero.y += this.velocityY * dt;

        // Boundary collision
        if (this.hero.y > 645 || this.hero.y < 0) {
            this.endGame();
            return;
        }

        // Spawn obstacles 
        this.spawnTime += delta;

        if (this.spawnTime >= 1000) {
            this.createObstacles();
            this.spawnTime = 0;
        }

        const heroBox = this.getHeroHitbox();

        // Move obstacles
        for (const pair of this.obstacles) {

            pair.top.x -= 190 * dt;
            pair.bottom.x -= 190 * dt;

            pair.topLine.x -= 190 * dt;
            pair.bottomLine.x -= 190 * dt;

            // Collision detection
            if (
                Phaser.Geom.Intersects.RectangleToRectangle(
                    heroBox,
                    pair.top.getBounds()
                ) ||
                Phaser.Geom.Intersects.RectangleToRectangle(
                    heroBox,
                    pair.bottom.getBounds()
                )
            ) {
                this.endGame();
                return;
            }

            // Score
            if (!pair.scored && pair.top.x < this.hero.x) {
                pair.scored = true;
                this.score++;
                sfx.point();

                this.scoreText.setText(t('score') + ': ' + this.score);
            }
        }

        // Remove obstacles outside screen
        this.obstacles = this.obstacles.filter(pair => {

            if (pair.top.x < -60) {

                pair.top.destroy();
                pair.bottom.destroy();
                pair.topLine.destroy();
                pair.bottomLine.destroy();

                return false;
            }

            return true;
        });
    }
}

const config = {

    type: Phaser.AUTO,

    width: 400,
    height:700,

    parent: 'game-container',

    backgroundColor: '#1a1a1a',

    scene: ForestScene,

    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

new Phaser.Game(config);
