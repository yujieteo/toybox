// The voice of the narration: Kokoro (82M, voice af_heart) on this computer. No cloud, no account.
// The voice packages and the model live in ~/.cache/toybox/voice for all copies of Toybox: the
// first sentence on a computer installs them (npm ci of core/voice/package-lock.json, then the
// model downloads into that node_modules). Each sentence becomes voice/<id>.wav next to the scene.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VOICE = 'af_heart', RATE = 24000;
const KEEP = 1200;   // samples of silence to keep at each end of a sentence (50 ms)
const here = path.dirname(fileURLToPath(import.meta.url));
export const VOICE_HOME = path.join(os.homedir(), '.cache', 'toybox', 'voice');

export const voiceId = (text) => createHash('sha1').update(`${VOICE} ${text}`).digest('hex').slice(0, 12);
export const voiceFile = (text) => `voice/${voiceId(text)}.wav`;

// The seconds of a voice file that exists in dir, or null.
export function voiceSeconds(dir, text) {
  const f = path.join(dir, voiceFile(text));
  if (!fs.existsSync(f)) return null;
  const head = Buffer.alloc(44), fd = fs.openSync(f, 'r');
  fs.readSync(fd, head, 0, 44, 0); fs.closeSync(fd);
  return Math.round((head.readUInt32LE(40) / 2 / RATE) * 1000) / 1000;
}

function install() {   // npm ci in VOICE_HOME when the packages are missing or their lock file is not the project's
  const lock = fs.readFileSync(path.join(here, 'voice', 'package-lock.json'), 'utf8'), done = path.join(VOICE_HOME, 'installed-lock.json');
  if (fs.existsSync(path.join(VOICE_HOME, 'node_modules')) && fs.existsSync(done) && fs.readFileSync(done, 'utf8') === lock) return;
  process.stderr.write(`Installing the voice packages in ${VOICE_HOME}\n`);
  fs.mkdirSync(VOICE_HOME, { recursive: true });
  fs.rmSync(done, { force: true });
  fs.copyFileSync(path.join(here, 'voice', 'package.json'), path.join(VOICE_HOME, 'package.json'));
  fs.writeFileSync(path.join(VOICE_HOME, 'package-lock.json'), lock);
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: VOICE_HOME, stdio: ['ignore', process.stderr, 'inherit'] });
  fs.writeFileSync(done, lock);   // written last: a failed install is tried again
}

let tts = null;
async function speak(text) {   // 16-bit mono WAV bytes, without the long silence at each end
  if (!tts) {
    install();
    const { KokoroTTS } = await import(pathToFileURL(path.join(VOICE_HOME, 'node_modules', 'kokoro-js', 'dist', 'kokoro.js')).href);
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  }
  const a = (await tts.generate(text, { voice: VOICE })).audio, loud = (v) => Math.abs(v) > 0.01;
  const pcm = a.subarray(Math.max(0, a.findIndex(loud) - KEEP), a.findLastIndex(loud) + KEEP);
  const wav = Buffer.alloc(44 + 2 * pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + 2 * pcm.length, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(2 * RATE, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2 * pcm.length, 40);
  pcm.forEach((v, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + 2 * i));
  return wav;
}

// Makes the voice file of each text that has none in dir. Returns the number of new files.
export async function makeVoices(dir, texts) {
  let made = 0;
  fs.mkdirSync(path.join(dir, 'voice'), { recursive: true });
  for (const text of new Set(texts)) {
    if (voiceSeconds(dir, text) !== null) continue;
    fs.writeFileSync(path.join(dir, voiceFile(text)), await speak(text));
    made++;
  }
  return made;
}
