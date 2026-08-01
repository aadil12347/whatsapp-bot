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
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
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

  /// Resolve download links with progress reporting:
  /// - For a single movie: returns EXACTLY 1 direct video link using priority fallback.
  /// - For a series: returns ALL episode direct links with per-episode progress callbacks.
  /// [onProgress] fires (current, total, isDone) for each episode being resolved.
  static Future<MultiResolveResult> resolveAllEpisodes(
    String landingUrl, {
    void Function(int current, int total, bool isDone)? onProgress,
  }) async {
    try {
      final html = await _fetchHtml(landingUrl);
      final doc = html_parser.parse(html);

      // Check if landingUrl is nexdrive/vgmlink landing page (not vcloud itself)
      if (!landingUrl.toLowerCase().contains('vcloud')) {
        // Collect ALL vcloud/hubcloud links from the page
        final vcloudLinks = <String>[];
        final fallbackLinks = <String>[]; // fastdl, filebee, etc.

        for (final el in doc.querySelectorAll('a[href]')) {
          final href = el.attributes['href'] ?? '';
          final lh = href.toLowerCase();

          if (lh.contains('telegram') || lh.contains('category') || lh.contains('.fans')) continue;

          if (lh.contains('vcloud') || lh.contains('hubcloud') || lh.contains('hubdrive') || lh.contains('hubcdn')) {
            if (!vcloudLinks.contains(href)) {
              vcloudLinks.add(href);
            }
          } else if (lh.contains('fastdl') || lh.contains('filebee') || lh.contains('vikingfile')) {
            if (!fallbackLinks.contains(href)) {
              fallbackLinks.add(href);
            }
          }
        }

        // Multiple vcloud links = Series (each link is an episode)
        if (vcloudLinks.length > 1) {
          final total = vcloudLinks.length;
          int completed = 0;
          onProgress?.call(0, total, false);

          final tasks = vcloudLinks.asMap().entries.map((entry) async {
            final idx = entry.key;
            final epUrl = entry.value;
            print('[Resolver] Starting Ep ${idx + 1}/$total: $epUrl');
            try {
              final resolved = await resolveWithFallback(epUrl).timeout(const Duration(seconds: 20));
              completed++;
              onProgress?.call(completed, total, completed == total);
              print('[Resolver] Ep ${idx + 1}/$total completed -> ${resolved.directUrl}');
              return MapEntry(idx, resolved.directUrl);
            } catch (e) {
              completed++;
              onProgress?.call(completed, total, completed == total);
              print('[Resolver] Ep ${idx + 1}/$total error: $e');
              return MapEntry(idx, epUrl);
            }
          });

          final results = await Future.wait(tasks);
          results.sort((a, b) => a.key.compareTo(b.key));

          final resolvedDirectUrls = results
              .map((r) => r.value)
              .where((url) => url.isNotEmpty && !url.contains('.fans'))
              .toList();

          if (resolvedDirectUrls.isNotEmpty) {
            return MultiResolveResult(
              serverName: 'VCloud Series (${resolvedDirectUrls.length} Episodes)',
              directUrls: resolvedDirectUrls,
            );
          }
        }

        // Single vcloud link = Movie — recurse into it
        if (vcloudLinks.isNotEmpty) {
          return resolveAllEpisodes(vcloudLinks.first, onProgress: onProgress);
        }

        // No vcloud links — fallback to fastdl/others
        if (fallbackLinks.isNotEmpty) {
          return resolveAllEpisodes(fallbackLinks.first, onProgress: onProgress);
        }
      }

      // Inside VCloud page: Check for multiple episode-like links
      final epAnchors = <String>[];
      for (final el in doc.querySelectorAll('a[href]')) {
        final href = el.attributes['href'] ?? '';
        final lh = href.toLowerCase();

        if (lh.contains('telegram') || lh.contains('facebook') ||
            lh.contains('twitter') || lh.contains('.fans') ||
            href.startsWith('#')) continue;

        // Check if link goes to a vcloud-like page (episode sub-links inside vcloud)
        if (lh.contains('vcloud') || lh.contains('hubcloud') || lh.contains('hubdrive')) {
          var fullUrl = href;
          if (!fullUrl.startsWith('http')) {
            final p = Uri.parse(landingUrl);
            fullUrl = '${p.scheme}://${p.host}${fullUrl.startsWith('/') ? '' : '/'}$fullUrl';
          }
          if (fullUrl != landingUrl && !epAnchors.contains(fullUrl)) {
            epAnchors.add(fullUrl);
          }
        }
      }

      // If multiple sub-links detected inside VCloud (> 1) — series
      if (epAnchors.length > 1) {
        final total = epAnchors.length;
        int completed = 0;
        onProgress?.call(0, total, false);

        final tasks = epAnchors.asMap().entries.map((entry) async {
          final idx = entry.key;
          final epUrl = entry.value;
          print('[Resolver] Starting Ep ${idx + 1}/$total: $epUrl');
          try {
            final resolved = await resolveWithFallback(epUrl).timeout(const Duration(seconds: 20));
            completed++;
            onProgress?.call(completed, total, completed == total);
            print('[Resolver] Ep ${idx + 1}/$total completed -> ${resolved.directUrl}');
            return MapEntry(idx, resolved.directUrl);
          } catch (e) {
            completed++;
            onProgress?.call(completed, total, completed == total);
            print('[Resolver] Ep ${idx + 1}/$total error: $e');
            return MapEntry(idx, epUrl);
          }
        });

        final results = await Future.wait(tasks);
        results.sort((a, b) => a.key.compareTo(b.key));

        final resolvedDirectUrls = results
            .map((r) => r.value)
            .where((url) => url.isNotEmpty && !url.contains('.fans'))
            .toList();

        if (resolvedDirectUrls.isNotEmpty) {
          return MultiResolveResult(
            serverName: 'VCloud Series (${resolvedDirectUrls.length} Episodes)',
            directUrls: resolvedDirectUrls,
          );
        }
      }

      // Single Movie Fallback — returns EXACTLY 1 direct link using priority fallback
      onProgress?.call(1, 1, false);
      final singleResolved = await resolveWithFallback(landingUrl).timeout(const Duration(seconds: 20));
      onProgress?.call(1, 1, true);
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

      // STEP A: Check script tags for double atob token URL FIRST (VCloud token page resolution)
      String? decodedTokenUrl;
      final scripts = doc.querySelectorAll('script');
      final combinedScript = scripts.map((s) => s.text).join('\n');

      final atobMatch =
          RegExp(r'''atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)''')
              .firstMatch(combinedScript);
      if (atobMatch != null) {
        try {
          final s1 = utf8.decode(base64.decode(atobMatch.group(1)!));
          decodedTokenUrl = utf8.decode(base64.decode(s1));
        } catch (_) {}
      }

      if (decodedTokenUrl != null) {
        if (!decodedTokenUrl.startsWith('http')) {
          final p = Uri.parse(url);
          decodedTokenUrl =
              '${p.scheme}://${p.host}${decodedTokenUrl.startsWith('/') ? '' : '/'}$decodedTokenUrl';
        }

        final dlHtml = await _fetchHtml(decodedTokenUrl, referer: url);
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
              lh.contains('t.me') ||
              lh.contains('.fans')) continue;

          if (href.isNotEmpty && (href.startsWith('http') || href.startsWith('/'))) {
            if (!href.startsWith('http')) {
              final p = Uri.parse(decodedTokenUrl);
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

      // STEP B: Check var reurl
      final reurlMatch =
          RegExp(r'''reurl\s*=\s*['"]([^'"]+)['"]''', caseSensitive: false)
              .firstMatch(html);
      if (reurlMatch != null) {
        var target = reurlMatch.group(1)!;
        final targetLink = _extractLinkFromUrl(target);
        if (targetLink != null) target = targetLink;
        return [ResolvedLink(serverName: 'Direct CDN Link', directUrl: target)];
      }

      // STEP C: If url is nexdrive/vgmlink landing page, find V-Cloud links (prefer vcloud over fastdl)
      if (!url.toLowerCase().contains('vcloud')) {
        final preferredLinks = <String>[];
        final fallbackLinks = <String>[];
        for (final el in doc.querySelectorAll('a[href]')) {
          final href = el.attributes['href'] ?? '';
          final lh = href.toLowerCase();
          if ((lh.contains('vcloud') ||
                  lh.contains('hubcloud') ||
                  lh.contains('hubdrive') ||
                  lh.contains('hubcdn') ||
                  lh.contains('fastdl') ||
                  lh.contains('filebee') ||
                  lh.contains('vikingfile')) &&
              !lh.contains('telegram') &&
              !lh.contains('category') &&
              !lh.contains('.fans')) {
            if (lh.contains('vcloud') || lh.contains('hubcloud') || lh.contains('hubdrive') || lh.contains('hubcdn')) {
              preferredLinks.add(href);
            } else {
              fallbackLinks.add(href);
            }
          }
        }

        // Use preferred vcloud links first, fallback to fastdl/others
        final innerLandingLinks = preferredLinks.isNotEmpty ? preferredLinks : fallbackLinks;
        if (innerLandingLinks.isNotEmpty) {
          final vcloudLink = innerLandingLinks.first;
          if (vcloudLink != url) {
            return extractAllServers(vcloudLink);
          }
        }
      }

      // Check direct buttons in initial doc
      for (final el in doc.querySelectorAll('a.btn, a[href]')) {
        final href = el.attributes['href'] ?? '';
        final text = el.text.trim();
        final lt = text.toLowerCase();
        final lh = href.toLowerCase();
        if (!lh.contains('.fans') && (lt.contains('download') || lt.contains('fsl') || lt.contains('server'))) {
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

  /// Resolve a download link using priority selection and comprehensive redirect unwrapping:
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
        // Unwrap HTTP redirects, HTML scripts & link=/r= parameters to obtain pure video download URL
        url = await _resolveFinalUrl(url, referer: landingUrl);

        if (!url.contains('.fans')) {
          return ResolvedLink(serverName: server.serverName, directUrl: url);
        }
      } catch (_) {
        continue;
      }
    }

    final finalFallback = await _resolveFinalUrl(sorted.first.directUrl, referer: landingUrl);
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

  /// Follow redirect chain, unpack link=/r= parameters, and parse JS/HTML redirects
  static Future<String> _resolveFinalUrl(String startUrl, {String? referer}) async {
    var currentUrl = startUrl;

    try {
      // 1. Check if input URL itself contains link= or r=
      final directMatch = _extractLinkFromUrl(currentUrl);
      if (directMatch != null) return directMatch;

      // 2. Perform GET request with HTTP redirect tracking and Referer header
      final headers = <String, String>{};
      if (referer != null) {
        headers['Referer'] = referer;
      }

      final response = await _dio.get<dynamic>(
        currentUrl,
        options: Options(
          headers: headers,
          followRedirects: true,
          maxRedirects: 8,
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      final finalRedirect = response.realUri.toString();
      if (finalRedirect.isNotEmpty && finalRedirect.startsWith('http')) {
        currentUrl = finalRedirect;
      }

      final redirectLinkMatch = _extractLinkFromUrl(currentUrl);
      if (redirectLinkMatch != null) return redirectLinkMatch;

      // 3. Check response body for window.location / var url / reurl / atob / meta refresh
      if (response.data is String) {
        final html = response.data as String;

        // Check reurl = '...' or var url = '...'
        final reurlMatch = RegExp(r'''(?:reurl|url)\s*=\s*['"]([^'"]+)['"]''', caseSensitive: false).firstMatch(html);
        if (reurlMatch != null) {
          final target = reurlMatch.group(1)!;
          final targetLink = _extractLinkFromUrl(target);
          if (targetLink != null) return targetLink;
          if (target.startsWith('http') && !target.contains('.fans')) return target;
        }

        // Check double atob script inside HTML
        final atobMatch = RegExp(r'''atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)''').firstMatch(html);
        if (atobMatch != null) {
          try {
            final s1 = utf8.decode(base64.decode(atobMatch.group(1)!));
            final decoded = utf8.decode(base64.decode(s1));
            final decodedLink = _extractLinkFromUrl(decoded);
            if (decodedLink != null) return decodedLink;
            if (decoded.startsWith('http')) return decoded;
          } catch (_) {}
        }
      }
    } catch (_) {}

    return currentUrl;
  }

  /// Extract direct link from query parameters like link= or r=
  static String? _extractLinkFromUrl(String url) {
    if (url.contains('link=')) {
      try {
        final parsed = Uri.parse(url);
        final linkParam = parsed.queryParameters['link'];
        if (linkParam != null && linkParam.isNotEmpty) {
          return Uri.decodeFull(linkParam);
        }
      } catch (_) {}
    }

    if (url.contains('r=')) {
      try {
        final parsed = Uri.parse(url);
        final rParam = parsed.queryParameters['r'];
        if (rParam != null && rParam.isNotEmpty) {
          final decoded = utf8.decode(base64.decode(rParam));
          if (decoded.contains('link=')) {
            final subLink = Uri.parse(decoded).queryParameters['link'];
            return subLink != null ? Uri.decodeFull(subLink) : decoded;
          }
          if (decoded.startsWith('http')) return decoded;
        }
      } catch (_) {}
    }

    return null;
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
