// NAS SSH 辅助脚本（排查用，非项目运行时依赖）
//
// 用法：
//   node tools/nas_ssh.js "命令1" ["命令2" ...]
//   node tools/nas_ssh.js --sudo "命令"          # 以 root 执行（自动 sudo -S）
//   node tools/nas_ssh.js --file cmds.txt        # 从文件读取命令（每行一条）
//
// 连接信息默认 192.168.1.100:22 / tester，密码从项目根目录 _nas_pass.tmp 读取。
// 可用环境变量覆盖：NAS_SSH_HOST / NAS_SSH_PORT / NAS_SSH_USER

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const HOST = process.env.NAS_SSH_HOST || '192.168.1.100';
const PORT = Number(process.env.NAS_SSH_PORT || 22);
const USER = process.env.NAS_SSH_USER || 'tester';

const passFile = path.resolve(__dirname, '..', '_nas_pass.tmp');
if (!fs.existsSync(passFile)) {
  console.error('缺少 _nas_pass.tmp（SSH 密码文件）');
  process.exit(1);
}
const PASS = fs.readFileSync(passFile, 'utf8').replace(/\r?\n$/, '');

let args = process.argv.slice(2);
let useSudo = false;
let commands = [];

while (args.length > 0) {
  const a = args[0];
  if (a === '--sudo') {
    useSudo = true;
    args = args.slice(1);
  } else if (a === '--file') {
    const f = args[1];
    commands = commands.concat(
      fs
        .readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('#'))
    );
    args = args.slice(2);
  } else {
    commands.push(a);
    args = args.slice(1);
  }
}

if (commands.length === 0) {
  console.error('没有要执行的命令');
  process.exit(1);
}

/** 输出脱敏：把长随机串（sid / token 等）替换掉，避免写进日志 */
function maskSecret(text) {
  return text.replace(/[A-Za-z0-9_-]{24,}/g, (m) => `***(${m.length})`);
}

/** 把命令包成一次远程会话，逐条执行并带清晰分隔 */
function buildScript(list) {
  const lines = ['set +e'];
  list.forEach((cmd, i) => {
    const real = useSudo ? `echo '${PASS.replace(/'/g, "'\\''")}' | sudo -S -p '' ${cmd}` : cmd;
    lines.push(`echo "===== [${i + 1}] ${maskSecret(cmd).replace(/"/g, '\\"')} ====="`);
    lines.push(real);
    lines.push('echo');
  });
  return lines.join('\n');
}

const conn = new Client();

conn
  .on('ready', () => {
    conn.exec(buildScript(commands), (err, stream) => {
      if (err) {
        console.error('exec 失败:', err.message);
        conn.end();
        return;
      }
      let out = '';
      let errOut = '';
      stream
        .on('close', (code) => {
          if (errOut.trim()) {
            process.stdout.write('\n--- stderr ---\n' + errOut);
          }
          conn.end();
          process.exitCode = code === null ? 0 : 0; // 不因单条命令失败而中断后续
        })
        .on('data', (d) => {
          out += d.toString('utf8');
          process.stdout.write(d);
        })
        .stderr.on('data', (d) => {
          errOut += d.toString('utf8');
        });
    });
  })
  .on('error', (e) => {
    console.error('连接失败:', e.message);
    process.exit(1);
  })
  .connect({
    host: HOST,
    port: PORT,
    username: USER,
    password: PASS,
    readyTimeout: 20000,
    // DSM 的 SSH 主机密钥通常是自签，首次连接不校验
    algorithms: undefined,
  });
