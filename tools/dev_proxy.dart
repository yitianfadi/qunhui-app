// 开发代理：让 Web 版客户端在浏览器里能跨域调用 DSM Web API
//
// 用法：dart run tools/dev_proxy.dart <NAS_IP> <NAS_PORT> [代理端口] [静态目录]
// 示例：dart run tools/dev_proxy.dart 192.168.1.10 5000 8090
//       dart run tools/dev_proxy.dart 192.168.1.100 5000 8091 uniappx/unpackage/dist/build/web
//
// 功能：
//   1. http://localhost:<port>/webapi/...  → 转发到 http://<NAS_IP>:<NAS_PORT>/webapi/...
//   2. 其余路径作为静态服务器托管 [静态目录]（默认 build/web）
//   3. 为所有响应注入 CORS 头，处理 OPTIONS 预检
import 'dart:io';

Future<void> main(List<String> args) async {
  final nasHost = args.isNotEmpty ? args[0] : '192.168.1.10';
  final nasPort = args.length > 1 ? int.parse(args[1]) : 5000;
  final proxyPort = args.length > 2 ? int.parse(args[2]) : 8090;
  final webRoot = args.length > 3 ? args[3] : 'build/web';

  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, proxyPort);
  // ignore: avoid_print
  print('✅ 开发代理已启动: http://localhost:$proxyPort');
  // ignore: avoid_print
  print('   NAS 转发目标: http://$nasHost:$nasPort');
  // ignore: avoid_print
  print('   静态目录: $webRoot');
  // ignore: avoid_print
  print('   在 App 登录页填: 主机 localhost / 端口 $proxyPort');

  await for (final req in server) {
    _handle(req, nasHost, nasPort, webRoot);
  }
}

Future<void> _handle(HttpRequest req, String nasHost, int nasPort, String webRoot) async {
  final res = req.response;

  // CORS
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers',
      'Origin, Content-Type, Accept, Authorization, X-Requested-With, User-Agent');
  if (req.method == 'OPTIONS') {
    res.statusCode = 204;
    await res.close();
    return;
  }

  if (req.uri.path.startsWith('/webapi') || req.uri.path.startsWith('/photo')) {
    await _proxy(req, nasHost, nasPort);
  } else {
    await _static(req, webRoot);
  }
}

Future<void> _proxy(HttpRequest req, String nasHost, int nasPort) async {
  final client = HttpClient();
  try {
    final target = Uri(
      scheme: 'http',
      host: nasHost,
      port: nasPort,
      path: req.uri.path,
      query: req.uri.query.isEmpty ? null : req.uri.query,
    );
    final rq = await client.openUrl(req.method, target);
    rq.headers.set('User-Agent', 'QunHuiApp-Proxy/0.1');
    final ct = req.headers.value('content-type');
    if (ct != null) rq.headers.set('Content-Type', ct);
    final cl = req.headers.value('content-length');
    if (cl != null) rq.headers.set('Content-Length', cl);
    await rq.addStream(req);

    final rs = await rq.close();
    req.response.statusCode = rs.statusCode;
    final rsCt = rs.headers.value('content-type');
    if (rsCt != null) req.response.headers.set('Content-Type', rsCt);
    final rsCl = rs.headers.value('content-length');
    if (rsCl != null) req.response.headers.set('Content-Length', rsCl);
    req.response.headers.set('Access-Control-Allow-Origin', '*');
    await req.response.addStream(rs);
    await req.response.close();
  } catch (e) {
    req.response.statusCode = 502;
    req.response.headers.contentType = ContentType.json;
    req.response.write('{"success":false,"proxy_error":"$e"}');
    await req.response.close();
  } finally {
    client.close(force: true);
  }
}

Future<void> _static(HttpRequest req, String webRoot) async {
  final root = Directory(webRoot);
  if (!root.existsSync()) {
    req.response.statusCode = 404;
    req.response.write('静态目录 $webRoot 不存在，请先构建前端');
    await req.response.close();
    return;
  }
  var path = req.uri.path == '/' ? '/index.html' : req.uri.path;
  final file = File('$webRoot$path');
  if (!file.existsSync()) {
    // SPA 回退
    final index = File('$webRoot/index.html');
    if (index.existsSync()) {
      req.response.statusCode = 200;
      req.response.headers.contentType = ContentType.html;
      await req.response.addStream(index.openRead());
      await req.response.close();
      return;
    }
    req.response.statusCode = 404;
    await req.response.close();
    return;
  }
  final ext = path.split('.').last.toLowerCase();
  const types = {
    'html': 'text/html',
    'js': 'application/javascript',
    'css': 'text/css',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'wasm': 'application/wasm',
    'ttf': 'font/ttf',
  };
  if (types.containsKey(ext)) {
    req.response.headers.contentType = ContentType.parse(types[ext]!);
  }
  req.response.statusCode = 200;
  await req.response.addStream(file.openRead());
  await req.response.close();
}
