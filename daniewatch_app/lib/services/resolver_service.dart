import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:html/parser.dart' as html_parser;
import '../models/download_link.dart';

/// Resolver service — resolves VCloud/HubCloud/Fastdl landing pages
/// to direct download URLs.
class ResolverService {
  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      followRedirects: true,
      maxRedirects: 5,
      headers: {
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Upgrade-Insecure-Requests': '1',
      },
    ),
  );

  /// Extract all sub-option download server links from a landing page.
  static Future<List<ResolvedLink>> extractAllServers(String url) async {
    try {
      // Pixeldrain direct
      if (url.contains('pixeldrain') && url.contains('/u/')) {
        final id = url.split('/u/')[1].split('?')[0];
        return [
          ResolvedLink(
            serverName: 'Pixeldrain',
            directUrl: 'https://pixeldrain.com/api/file/$id?download',
          )
        ];
      }

      final html = await _fetchHtml(url);
      final doc = html_parser.parse(html);

      // Check var reurl
      final reurlMatch =
          RegExp(r'''reurl\s*=\s*['"]([^'"]+)['"]''', caseSensitive: false)
              .firstMatch(html);
      if (reurlMatch != null) {
        var target = reurlMatch.group(1)!;
        try {
          final parsed = Uri.parse(target);
          final linkParam = parsed.queryParameters['link'];
          final rParam = parsed.queryParameters['r'];
          if (rParam != null) {
            final decoded = utf8.decode(base64.decode(rParam));
            try {
              final subLink = Uri.parse(decoded).queryParameters['link'];
              target = subLink ?? decoded;
            } catch (_) {
              target = decoded;
            }
          } else if (linkParam != null) {
            target = linkParam;
          }
        } catch (_) {}
        return [ResolvedLink(serverName: 'Direct CDN Link', directUrl: target)];
      }

      // Check intermediate hubcloud / vcloud links
      final hubLinks = <String>[];
      for (final el in doc.querySelectorAll('a[href]')) {
        final href = el.attributes['href'] ?? '';
        final lh = href.toLowerCase();
        if ((lh.contains('hubcloud') ||
                lh.contains('vcloud') ||
                lh.contains('katdrive') ||
                lh.contains('kmhd')) &&
            (lh.contains('/drive/') ||
                lh.contains('/file/') ||
                lh.contains('?id=')) &&
            !lh.contains('telegram') &&
            !lh.contains('.fans')) {
          hubLinks.add(href);
        }
      }
      if (hubLinks.isNotEmpty) {
        return extractAllServers(hubLinks.first);
      }

      // Check script tags for double atob or var url
      String? decodedLink;

      // Extract all script content
      final scripts = doc.querySelectorAll('script');
      final combinedScript = scripts.map((s) => s.text).join('\n');

      final atobMatch =
          RegExp(r'''atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)''')
              .firstMatch(combinedScript);
      if (atobMatch != null) {
        try {
          final s1 = utf8.decode(base64.decode(atobMatch.group(1)!));
          decodedLink = utf8.decode(base64.decode(s1));
        } catch (_) {}
      }

      if (decodedLink == null) {
        final varMatch =
            RegExp(r'''var\s+url\s*=\s*['"]([^'"]+)['"]''', caseSensitive: false)
                .firstMatch(combinedScript);
        if (varMatch != null) decodedLink = varMatch.group(1);
      }

      if (decodedLink == null && url.contains('/video/')) {
        final vd = doc.querySelector('div.vd > center > a');
        if (vd != null) decodedLink = vd.attributes['href'];
      }

      if (decodedLink != null) {
        if (!decodedLink.startsWith('http')) {
          final p = Uri.parse(url);
          decodedLink =
              '${p.scheme}://${p.host}${decodedLink.startsWith('/') ? '' : '/'}$decodedLink';
        }

        final dlHtml = await _fetchHtml(decodedLink, referer: url);
        final dlDoc = html_parser.parse(dlHtml);

        final servers = <ResolvedLink>[];
        for (final el in dlDoc.querySelectorAll(
            'h2 a.btn, div.card-body a.btn, a.btn, a[href]')) {
          var href = el.attributes['href'] ?? '';
          var text = el.text.trim().replaceAll(RegExp(r'\s+'), ' ');
          final lt = text.toLowerCase();
          final lh = href.toLowerCase();

          if (lt.contains('login') ||
              lt.contains('admin') ||
              lt.contains('telegram') ||
              lh.contains('telegram.me') ||
              lh.contains('t.me')) continue;

          if (href.isNotEmpty && (href.startsWith('http') || href.startsWith('/'))) {
            if (!href.startsWith('http')) {
              final p = Uri.parse(decodedLink!);
              href =
                  '${p.scheme}://${p.host}${href.startsWith('/') ? '' : '/'}$href';
            }
            if (href.contains('pixeldrain') && href.contains('/u/')) {
              final id = href.split('/u/')[1].split('?')[0];
              href = 'https://pixeldrain.com/api/file/$id?download';
            }
            if (!servers.any((s) => s.directUrl == href)) {
              servers.add(ResolvedLink(
                  serverName: text.isNotEmpty ? text : 'Download Link',
                  directUrl: href));
            }
          }
        }
        if (servers.isNotEmpty) return servers;
      }

      // Check direct buttons in initial doc
      for (final el in doc.querySelectorAll('a.btn, a[href]')) {
        final href = el.attributes['href'] ?? '';
        final text = el.text.trim();
        final lt = text.toLowerCase();
        if (lt.contains('download') || lt.contains('fsl') || lt.contains('server')) {
          if (href.startsWith('http')) {
            return [ResolvedLink(serverName: text, directUrl: href)];
          }
        }
      }

      // Fallback: return the initial landing URL
      return [ResolvedLink(serverName: 'Landing Link', directUrl: url)];
    } catch (e) {
      return [ResolvedLink(serverName: 'Landing Link', directUrl: url)];
    }
  }

  /// Resolve a download link using priority selection:
  /// 10Gbps → FSLv2 → FSL → GDrive → Pixeldrain → any
  static Future<ResolvedLink> resolveWithFallback(String landingUrl) async {
    final servers = await extractAllServers(landingUrl);
    if (servers.isEmpty) {
      return ResolvedLink(serverName: 'Landing Link', directUrl: landingUrl);
    }

    final sorted = _sortByPriority(servers);

    for (final server in sorted) {
      try {
        var url = server.directUrl;
        final lt = server.serverName.toLowerCase();

        if (lt.contains('10gbps') || lt.contains('10 gbps')) {
          url = await _resolveFinalUrl(url);
          if (url.contains('link=')) {
            url = Uri.decodeFull(url.split('link=')[1].split('&')[0]);
          }
        }

        return ResolvedLink(serverName: server.serverName, directUrl: url);
      } catch (_) {
        continue;
      }
    }

    return sorted.first;
  }

  /// Sort servers by download priority
  static List<ResolvedLink> _sortByPriority(List<ResolvedLink> servers) {
    int priority(ResolvedLink s) {
      final t = s.serverName.toLowerCase();
      if (t.contains('10gbps') || t.contains('10 gbps')) return 0;
      if (t.contains('fslv2')) return 1;
      if (t.contains('fsl') && !t.contains('fslv2')) return 2;
      if (t.contains('gdrive') || t.contains('drive')) return 3;
      if (t.contains('pixeldrain')) return 4;
      if (t.contains('download file')) return 5;
      return 6;
    }

    final sorted = List<ResolvedLink>.from(servers);
    sorted.sort((a, b) => priority(a).compareTo(priority(b)));
    return sorted;
  }

  /// Follow redirect chain to resolve final URL (for 10Gbps servers)
  static Future<String> _resolveFinalUrl(String startUrl) async {
    var currentUrl = startUrl;

    for (var i = 0; i < 7; i++) {
      try {
        final response = await _dio.head(
          currentUrl,
          options: Options(
            followRedirects: false,
            validateStatus: (status) => status != null && status < 400,
          ),
        );
        final location = response.headers.value('location');
        if (location == null) break;
        currentUrl = location;
      } on DioException catch (e) {
        final location = e.response?.headers.value('location');
        if (location != null) {
          currentUrl = location;
        } else {
          break;
        }
      }
    }
    return currentUrl;
  }

  /// Fetch HTML with proper referer
  static Future<String> _fetchHtml(String url, {String? referer}) async {
    final headers = <String, String>{};
    if (referer != null) {
      headers['Referer'] = referer;
      try {
        headers['Origin'] = Uri.parse(referer).origin;
      } catch (_) {}
    }
    final response = await _dio.get<String>(
      url,
      options: Options(
        headers: headers,
        responseType: ResponseType.plain,
        validateStatus: (status) => status != null && status < 400,
      ),
    );
    return response.data ?? '';
  }
}
