import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:html/parser.dart' as html_parser;

/// Data model for a resolved download server link
class ResolvedLink {
  final String serverName;
  final String directUrl;

  ResolvedLink({
    required this.serverName,
    required this.directUrl,
  });
}

/// Data model for single or multi-episode resolve results
class MultiResolveResult {
  final String serverName;
  final List<String> directUrls;

  MultiResolveResult({
    required this.serverName,
    required this.directUrls,
  });

  /// Format as WhatsApp .d command
  String toWhatsAppCommand() {
    if (directUrls.isEmpty) return '';
    return '.d ${directUrls.join(', ')}';
  }
}

/// Resolver service — resolves VCloud/HubCloud/Fastdl landing pages
/// to direct download URLs (supporting both movies and multi-episode series).
class ResolverService {
  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      followRedirects: true,
      maxRedirects: 8,
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

  /// Resolve all links (single movie link or multi-episode series links)
  static Future<MultiResolveResult> resolveAllEpisodes(String landingUrl) async {
    try {
      final html = await _fetchHtml(landingUrl);
      final doc = html_parser.parse(html);

      // Check if page contains intermediate VCloud / G-Direct links (e.g. nexdrive.fit landing page)
      final vcloudAnchors = <String>[];
      for (final el in doc.querySelectorAll('a[href]')) {
        final href = el.attributes['href'] ?? '';
        final lh = href.toLowerCase();
        if ((lh.contains('vcloud') ||
                lh.contains('fastdl') ||
                lh.contains('hubcloud') ||
                lh.contains('filebee') ||
                lh.contains('vikingfile')) &&
            !lh.contains('telegram') &&
            !lh.contains('category')) {
          vcloudAnchors.add(href);
        }
      }

      // If nexdrive/vgmlink contains VCloud link, navigate into VCloud link first
      if (vcloudAnchors.isNotEmpty) {
        final vcloudUrl = vcloudAnchors.firstWhere(
          (l) => l.toLowerCase().contains('vcloud'),
          orElse: () => vcloudAnchors.first,
        );
        return resolveAllEpisodes(vcloudUrl);
      }

      // Look for multiple episode or server download links inside VCloud
      final epLinks = <String>[];
      final seen = <String>{};

      for (final el in doc.querySelectorAll('a[href]')) {
        final href = el.attributes['href'] ?? '';
        final text = el.text.toLowerCase();
        final lh = href.toLowerCase();

        if (lh.contains('telegram') ||
            lh.contains('facebook') ||
            lh.contains('twitter') ||
            href.startsWith('#')) continue;

        if ((text.contains('episode') ||
                text.contains('ep ') ||
                text.contains('ep.') ||
                text.contains('vcloud') ||
                text.contains('download') ||
                text.contains('drive') ||
                text.contains('server')) &&
            (lh.contains('http') || lh.startsWith('/'))) {
          var fullUrl = href;
          if (!fullUrl.startsWith('http')) {
            final p = Uri.parse(landingUrl);
            fullUrl =
                '${p.scheme}://${p.host}${fullUrl.startsWith('/') ? '' : '/'}$fullUrl';
          }
          if (!seen.contains(fullUrl)) {
            seen.add(fullUrl);
            epLinks.add(fullUrl);
          }
        }
      }

      // If multiple episode links detected (> 1)
      if (epLinks.length > 1) {
        final resolvedDirectUrls = <String>[];
        for (final epUrl in epLinks) {
          try {
            final resolved = await resolveWithFallback(epUrl);
            if (resolved.directUrl.isNotEmpty &&
                !resolvedDirectUrls.contains(resolved.directUrl)) {
              resolvedDirectUrls.add(resolved.directUrl);
            }
          } catch (_) {}
        }
        if (resolvedDirectUrls.isNotEmpty) {
          return MultiResolveResult(
            serverName: 'VCloud Series (${resolvedDirectUrls.length} Episodes)',
            directUrls: resolvedDirectUrls,
          );
        }
      }

      // Single movie link fallback
      final singleResolved = await resolveWithFallback(landingUrl);
      return MultiResolveResult(
        serverName: singleResolved.serverName,
        directUrls: [singleResolved.directUrl],
      );
    } catch (e) {
      return MultiResolveResult(
        serverName: 'Direct Landing Link',
        directUrls: [landingUrl],
      );
    }
  }

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

      // If url is nexdrive/vgmlink landing page, find V-Cloud / G-Direct links first
      final innerLandingLinks = <String>[];
      for (final el in doc.querySelectorAll('a[href]')) {
        final href = el.attributes['href'] ?? '';
        final lh = href.toLowerCase();
        if ((lh.contains('vcloud') ||
                lh.contains('fastdl') ||
                lh.contains('hubcloud') ||
                lh.contains('filebee') ||
                lh.contains('vikingfile')) &&
            !lh.contains('telegram') &&
            !lh.contains('category')) {
          innerLandingLinks.add(href);
        }
      }

      if (innerLandingLinks.isNotEmpty) {
        final vcloudLink = innerLandingLinks.firstWhere(
          (l) => l.toLowerCase().contains('vcloud'),
          orElse: () => innerLandingLinks.first,
        );
        return extractAllServers(vcloudLink);
      }

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

      // Fallback: return initial landing URL
      return [ResolvedLink(serverName: 'Landing Link', directUrl: url)];
    } catch (e) {
      return [ResolvedLink(serverName: 'Landing Link', directUrl: url)];
    }
  }

  /// Resolve a download link using priority selection and redirect unwrapping:
  /// 10Gbps → FSLv2 → FSL → GDrive → Pixeldrain → any
  static Future<ResolvedLink> resolveWithFallback(String landingUrl) async {
    final servers = await extractAllServers(landingUrl);
    if (servers.isEmpty) {
      final unwrapped = await _resolveFinalUrl(landingUrl);
      return ResolvedLink(serverName: 'Landing Link', directUrl: unwrapped);
    }

    final sorted = _sortByPriority(servers);

    for (final server in sorted) {
      try {
        var url = server.directUrl;
        // Unwrap HTTP redirects & link= / r= parameters to obtain pure video download URL
        url = await _resolveFinalUrl(url);

        return ResolvedLink(serverName: server.serverName, directUrl: url);
      } catch (_) {
        continue;
      }
    }

    final finalFallback = await _resolveFinalUrl(sorted.first.directUrl);
    return ResolvedLink(serverName: sorted.first.serverName, directUrl: finalFallback);
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

  /// Follow redirect chain to resolve final URL and extract link=/r= video parameters
  static Future<String> _resolveFinalUrl(String startUrl) async {
    var currentUrl = startUrl;

    try {
      final response = await _dio.get<dynamic>(
        startUrl,
        options: Options(
          followRedirects: true,
          maxRedirects: 8,
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      final finalRedirect = response.realUri.toString();
      if (finalRedirect.isNotEmpty && finalRedirect.startsWith('http')) {
        currentUrl = finalRedirect;
      }

      // Check if URL contains query parameter link= (e.g. gamerxyt.com/dl.php?link=https://video-downloads.googleusercontent...)
      if (currentUrl.contains('link=')) {
        final parsed = Uri.parse(currentUrl);
        final linkParam = parsed.queryParameters['link'];
        if (linkParam != null && linkParam.isNotEmpty) {
          return Uri.decodeFull(linkParam);
        }
      }

      // Check if URL contains query parameter r= (base64 encoded)
      if (currentUrl.contains('r=')) {
        final parsed = Uri.parse(currentUrl);
        final rParam = parsed.queryParameters['r'];
        if (rParam != null && rParam.isNotEmpty) {
          try {
            final decoded = utf8.decode(base64.decode(rParam));
            if (decoded.contains('link=')) {
              final subLink = Uri.parse(decoded).queryParameters['link'];
              return subLink != null ? Uri.decodeFull(subLink) : decoded;
            }
            return decoded;
          } catch (_) {}
        }
      }
    } catch (_) {}

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
