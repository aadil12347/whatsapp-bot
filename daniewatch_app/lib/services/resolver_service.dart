import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:html/parser.dart' as html_parser;
import '../models/server_priority.dart';

/// Data model for an episode link found on landing page
class EpisodeItem {
  final String label;
  final String url;
  final int index;

  EpisodeItem({
    required this.label,
    required this.url,
    required this.index,
  });
}

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
    final convertedUrls = directUrls.map((url) {
      if (url.contains('pixeldrain') || url.contains('sriflix')) {
        return ResolverService.applyPixeldrainWorkerProxy(url);
      }
      return url;
    }).toList();
    return '.d ${convertedUrls.join(', ')}';
  }
}

/// Resolver service — resolves VCloud/HubCloud/Fastdl landing pages
/// to direct download URLs (supporting both movies and multi-episode series).
class ResolverService {
  static const List<String> _pixeldrainWorkers = [
    'cdn.pixeldrain.eu.cc',
    'pixeldrain.isuru.eu.org',
  ];

  static String applyPixeldrainWorkerProxy(String url) {
    if (url.isEmpty) return url;
    final match = RegExp(
      r'(?:pixeldrain\.(?:com|dev|org|net)|pd\d\.sriflix\.online|cdn\.pixeldrain\.eu\.cc|pixeldrain\.isuru\.eu\.org)\/(?:u\/|api\/file\/|file\/)?([a-zA-Z0-9_-]+)',
      caseSensitive: false,
    ).firstMatch(url);
    if (match != null && match.group(1) != null) {
      final id = match.group(1)!;
      if (id.toLowerCase() != 'u' && id.toLowerCase() != 'api' && id.toLowerCase() != 'file') {
        return 'https://cdn.pixeldrain.eu.cc/$id';
      }
    }
    return url;
  }

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

  /// Extract VCloud episode links from a landing page without resolving direct video links yet
  static Future<List<EpisodeItem>> extractEpisodeLinks(String landingUrl) async {
    try {
      final html = await _fetchHtml(landingUrl);
      final doc = html_parser.parse(html);

      final vcloudLinks = <String>[];
      final fallbackLinks = <String>[];

      for (final el in doc.querySelectorAll('a[href]')) {
        var href = el.attributes['href'] ?? '';
        if (href.isEmpty || href.startsWith('#')) continue;

        try {
          href = Uri.parse(landingUrl).resolve(href).toString();
        } catch (_) {}

        final lh = href.toLowerCase();

        if (lh.contains('telegram') ||
            lh.contains('facebook') ||
            lh.contains('twitter') ||
            lh.contains('category') ||
            lh.contains('.fans') ||
            href == landingUrl) continue;

        if (lh.contains('vcloud') ||
            lh.contains('hubcloud') ||
            lh.contains('hubdrive') ||
            lh.contains('hubcdn')) {
          if (!vcloudLinks.contains(href)) {
            vcloudLinks.add(href);
          }
        } else if (lh.contains('fastdl') ||
            lh.contains('filebee') ||
            lh.contains('vikingfile') ||
            lh.contains('pixeldrain') ||
            lh.contains('gofile') ||
            lh.contains('nexdrive') ||
            lh.contains('vgmlink')) {
          if (!fallbackLinks.contains(href)) {
            fallbackLinks.add(href);
          }
        }
      }

      final targetLinks = vcloudLinks.isNotEmpty ? vcloudLinks : fallbackLinks;
      final episodes = <EpisodeItem>[];

      for (int i = 0; i < targetLinks.length; i++) {
        final epNum = i + 1;
        final epStr = epNum < 10 ? '0$epNum' : '$epNum';
        episodes.add(EpisodeItem(
          label: 'Episode $epStr',
          url: targetLinks[i],
          index: epNum,
        ));
      }

      return episodes;
    } catch (e) {
      return [EpisodeItem(label: 'Movie / Direct Link', url: landingUrl, index: 1)];
    }
  }

  /// Resolve a list of selected EpisodeItems to direct download URLs
  static Future<MultiResolveResult> resolveEpisodesList(
    List<EpisodeItem> episodes, {
    String? referer,
    void Function(int current, int total, bool isDone)? onProgress,
  }) async {
    if (episodes.isEmpty) {
      return MultiResolveResult(serverName: 'Direct Link', directUrls: []);
    }

    if (episodes.length == 1) {
      onProgress?.call(1, 1, false);
      final resolved = await _resolveSingleEpisodeWithRetry(episodes.first.url, referer: referer);
      onProgress?.call(1, 1, true);

      if (resolved != null && resolved.isNotEmpty) {
        return MultiResolveResult(
          serverName: '${episodes.first.label} (VCloud)',
          directUrls: [applyPixeldrainWorkerProxy(resolved)],
        );
      } else {
        return MultiResolveResult(
          serverName: '${episodes.first.label} (Direct)',
          directUrls: [applyPixeldrainWorkerProxy(episodes.first.url)],
        );
      }
    }

    final total = episodes.length;
    int completed = 0;
    onProgress?.call(0, total, false);

    final tasks = episodes.asMap().entries.map((entry) async {
      final idx = entry.key;
      final ep = entry.value;

      if (idx > 0) {
        await Future.delayed(Duration(milliseconds: 1000 * idx));
      }

      final directUrl = await _resolveSingleEpisodeWithRetry(ep.url, referer: referer);
      completed++;
      onProgress?.call(completed, total, completed == total);
      return MapEntry(idx, directUrl);
    });

    final results = await Future.wait(tasks);
    results.sort((a, b) => a.key.compareTo(b.key));

    final resolvedDirectUrls = results
        .map((r) => r.value)
        .whereType<String>()
        .where((url) => url.isNotEmpty && !url.contains('.fans'))
        .map((url) => applyPixeldrainWorkerProxy(url))
        .toList();

    return MultiResolveResult(
      serverName: 'VCloud Series (${resolvedDirectUrls.length} Episodes)',
      directUrls: resolvedDirectUrls,
    );
  }

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

      final vcloudLinks = <String>[];
      final fallbackLinks = <String>[];

      for (final el in doc.querySelectorAll('a[href]')) {
        var href = el.attributes['href'] ?? '';
        if (href.isEmpty || href.startsWith('#')) continue;

        try {
          href = Uri.parse(landingUrl).resolve(href).toString();
        } catch (_) {}

        final lh = href.toLowerCase();

        if (lh.contains('telegram') ||
            lh.contains('facebook') ||
            lh.contains('twitter') ||
            lh.contains('category') ||
            lh.contains('.fans') ||
            href == landingUrl) continue;

        if (lh.contains('vcloud') ||
            lh.contains('hubcloud') ||
            lh.contains('hubdrive') ||
            lh.contains('hubcdn')) {
          if (!vcloudLinks.contains(href)) {
            vcloudLinks.add(href);
          }
        } else if (lh.contains('fastdl') ||
            lh.contains('filebee') ||
            lh.contains('vikingfile') ||
            lh.contains('pixeldrain') ||
            lh.contains('gofile') ||
            lh.contains('nexdrive') ||
            lh.contains('vgmlink')) {
          if (!fallbackLinks.contains(href)) {
            fallbackLinks.add(href);
          }
        }
      }

      // 1. Multiple vcloud episode links detected on initial landing page (> 1) -> SERIES!
      if (vcloudLinks.length > 1) {
        final total = vcloudLinks.length;
        int completed = 0;
        onProgress?.call(0, total, false);

        final tasks = vcloudLinks.asMap().entries.map((entry) async {
          final idx = entry.key;
          final epUrl = entry.value;

          // Stagger requests by 1200ms to prevent Cloudflare/VCloud rate limiting
          if (idx > 0) {
            await Future.delayed(Duration(milliseconds: 1200 * idx));
          }

          print('[Resolver] Starting Ep ${idx + 1}/$total: $epUrl');
          final directUrl = await _resolveSingleEpisodeWithRetry(epUrl, referer: landingUrl);

          completed++;
          onProgress?.call(completed, total, completed == total);
          print('[Resolver] Ep ${idx + 1}/$total completed -> ${directUrl ?? "Failed"}');
          return MapEntry(idx, directUrl);
        });

        final results = await Future.wait(tasks);
        results.sort((a, b) => a.key.compareTo(b.key));

        final resolvedDirectUrls = results
            .map((r) => r.value)
            .whereType<String>()
            .where((url) => url.isNotEmpty && !url.contains('.fans'))
            .toList();

        if (resolvedDirectUrls.isNotEmpty) {
          return MultiResolveResult(
            serverName: 'VCloud Series (${resolvedDirectUrls.length} Episodes)',
            directUrls: resolvedDirectUrls,
          );
        }
      }

      // 2. Single vcloud link found -> MOVIE! Returns EXACTLY 1 best direct video link
      if (vcloudLinks.length == 1) {
        onProgress?.call(1, 1, false);
        final resolved = await resolveWithFallback(vcloudLinks.first, referer: landingUrl);
        onProgress?.call(1, 1, true);

        if (resolved.directUrl.isNotEmpty && !resolved.directUrl.contains('.fans')) {
          return MultiResolveResult(
            serverName: resolved.serverName,
            directUrls: [resolved.directUrl],
          );
        }
      }

      // 3. Multiple fallback links detected (> 1) -> fallback series
      if (fallbackLinks.length > 1) {
        final total = fallbackLinks.length;
        int completed = 0;
        onProgress?.call(0, total, false);

        final tasks = fallbackLinks.asMap().entries.map((entry) async {
          final idx = entry.key;
          final epUrl = entry.value;

          if (idx > 0) {
            await Future.delayed(Duration(milliseconds: 400 * idx));
          }

          print('[Resolver] Starting Ep ${idx + 1}/$total: $epUrl');
          final directUrl = await _resolveSingleEpisodeWithRetry(epUrl, referer: landingUrl);

          completed++;
          onProgress?.call(completed, total, completed == total);
          return MapEntry(idx, directUrl);
        });

        final results = await Future.wait(tasks);
        results.sort((a, b) => a.key.compareTo(b.key));

        final resolvedDirectUrls = results
            .map((r) => r.value)
            .whereType<String>()
            .where((url) => url.isNotEmpty && !url.contains('.fans'))
            .toList();

        if (resolvedDirectUrls.isNotEmpty) {
          return MultiResolveResult(
            serverName: 'Series (${resolvedDirectUrls.length} Episodes)',
            directUrls: resolvedDirectUrls,
          );
        }
      }

      // 4. Single fallback link -> MOVIE fallback! Returns EXACTLY 1 direct video link
      if (fallbackLinks.length == 1) {
        onProgress?.call(1, 1, false);
        final resolved = await resolveWithFallback(fallbackLinks.first, referer: landingUrl);
        onProgress?.call(1, 1, true);

        if (resolved.directUrl.isNotEmpty && !resolved.directUrl.contains('.fans')) {
          return MultiResolveResult(
            serverName: resolved.serverName,
            directUrls: [resolved.directUrl],
          );
        }
      }

      // 5. Single Landing Fallback — returns EXACTLY 1 direct link
      onProgress?.call(1, 1, false);
      final singleDirect = await _resolveSingleEpisodeWithRetry(landingUrl, referer: landingUrl);
      onProgress?.call(1, 1, true);

      if (singleDirect != null) {
        return MultiResolveResult(
          serverName: 'Direct CDN Link',
          directUrls: [singleDirect],
        );
      }

      return MultiResolveResult(
        serverName: 'Direct Landing Link',
        directUrls: [landingUrl],
      );
    } catch (e) {
      return MultiResolveResult(
        serverName: 'Direct Landing Link',
        directUrls: [landingUrl],
      );
    }
  }

  /// Resolve a single episode URL to a direct CDN download URL.
  /// Retries up to 3 times if it returns a raw vcloud/landing page URL.
  static Future<String?> _resolveSingleEpisodeWithRetry(String epUrl, {String? referer}) async {
    for (int attempt = 1; attempt <= 3; attempt++) {
      try {
        final resolved = await resolveWithFallback(epUrl, referer: referer).timeout(const Duration(seconds: 12));
        final url = resolved.directUrl;

        // Verify if the URL is a real direct download/CDN link (NOT a raw vcloud landing page)
        final isRawLanding = url == epUrl ||
            url.trim().isEmpty ||
            (url.contains('vcloud.zip/') && !url.contains('/drive/'));

        if (!isRawLanding && url.startsWith('http') && !url.contains('.fans')) {
          return applyPixeldrainWorkerProxy(url);
        }

        print('[Resolver] Attempt $attempt for $epUrl returned landing page ($url). Retrying in ${400 * attempt}ms...');
        await Future.delayed(Duration(milliseconds: 400 * attempt));
      } catch (e) {
        print('[Resolver] Attempt $attempt for $epUrl error: $e. Retrying in ${400 * attempt}ms...');
        await Future.delayed(Duration(milliseconds: 400 * attempt));
      }
    }

    // Try unwrapping raw redirects one final time
    try {
      final finalUrl = await _resolveFinalUrl(epUrl, referer: referer).timeout(const Duration(seconds: 10));
      final isRawLanding = finalUrl == epUrl || (finalUrl.contains('vcloud.zip/') && !finalUrl.contains('/drive/'));
      if (!isRawLanding && finalUrl.startsWith('http') && !finalUrl.contains('.fans')) {
        return applyPixeldrainWorkerProxy(finalUrl);
      }
    } catch (_) {}

    return null;
  }

  /// Extract all sub-option download server links from a landing page.
  static Future<List<ResolvedLink>> extractAllServers(String url, {String? referer}) async {
    try {
      // Pixeldrain direct
      if ((url.contains('pixeldrain') || url.contains('sriflix')) && (url.contains('/u/') || url.contains('/api/file/'))) {
        return [
          ResolvedLink(
            serverName: 'Pixeldrain',
            directUrl: applyPixeldrainWorkerProxy(url),
          )
        ];
      }

      final html = await _fetchHtml(url, referer: referer);
      final doc = html_parser.parse(html);

      // STEP A: Check script tags for token URL (double atob, single atob, location.href, or var url)
      String? decodedTokenUrl;
      final scripts = doc.querySelectorAll('script');
      final combinedScript = scripts.map((s) => s.text).join('\n');

      // 1. Double atob: atob(atob('...'))
      final doubleAtobMatch =
          RegExp(r'''atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)''')
              .firstMatch(combinedScript);
      if (doubleAtobMatch != null) {
        try {
          final s1 = utf8.decode(base64.decode(doubleAtobMatch.group(1)!));
          decodedTokenUrl = utf8.decode(base64.decode(s1));
        } catch (_) {}
      }

      // 2. Single atob: atob('...')
      if (decodedTokenUrl == null) {
        final singleAtobMatch =
            RegExp(r'''atob\(\s*['"]([^'"]+)['"]\s*\)''').firstMatch(combinedScript);
        if (singleAtobMatch != null) {
          try {
            final s1 = utf8.decode(base64.decode(singleAtobMatch.group(1)!));
            if (s1.contains('/') || s1.startsWith('http')) {
              decodedTokenUrl = s1;
            }
          } catch (_) {}
        }
      }

      // 3. Location href assignment: location.href = "..." or window.location = "..."
      if (decodedTokenUrl == null) {
        final hrefMatch = RegExp(
                r'''(?:location\.href|window\.location|url)\s*=\s*['"]([^'"]+)['"]''',
                caseSensitive: false)
            .firstMatch(combinedScript);
        if (hrefMatch != null) {
          final target = hrefMatch.group(1)!;
          if (target.contains('/') || target.startsWith('http')) {
            decodedTokenUrl = target;
          }
        }
      }

      if (decodedTokenUrl != null) {
        if (!decodedTokenUrl.startsWith('http')) {
          final p = Uri.parse(url);
          decodedTokenUrl =
              '${p.scheme}://${p.host}${decodedTokenUrl.startsWith('/') ? '' : '/'}$decodedTokenUrl';
        }

        final dlHtml = await _fetchHtml(decodedTokenUrl, referer: referer ?? url);
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
            if (href.contains('pixeldrain') || href.contains('sriflix')) {
              href = applyPixeldrainWorkerProxy(href);
            }
            if (!servers.any((s) => s.directUrl == href)) {
              servers.add(ResolvedLink(
                  serverName: text.isNotEmpty ? text : 'Download Link',
                  directUrl: href));
            }
          }
        }

        final pxlScriptMatch = RegExp(r'''var\s+pxl\s*=\s*['"]([^'"]+)['"]''', caseSensitive: false).firstMatch(dlHtml);
        if (pxlScriptMatch != null && pxlScriptMatch.group(1) != null) {
          final realPxlUrl = applyPixeldrainWorkerProxy(pxlScriptMatch.group(1)!);
          if (!servers.any((s) => s.directUrl == realPxlUrl)) {
            servers.add(ResolvedLink(
              serverName: 'Pixeldrain (Cloudflare Proxy)',
              directUrl: realPxlUrl,
            ));
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
  static Future<ResolvedLink> resolveWithFallback(String landingUrl, {String? referer}) async {
    if (landingUrl.contains('pixeldrain') || landingUrl.contains('sriflix')) {
      final proxied = applyPixeldrainWorkerProxy(landingUrl);
      return ResolvedLink(serverName: 'Pixeldrain', directUrl: proxied);
    }

    final servers = await extractAllServers(landingUrl, referer: referer);
    if (servers.isEmpty) {
      final unwrapped = await _resolveFinalUrl(landingUrl);
      return ResolvedLink(serverName: 'Landing Link', directUrl: unwrapped);
    }

    final sorted = _sortByPriority(servers);

    for (final server in sorted) {
      try {
        var url = server.directUrl;
        if (url.contains('pixeldrain') || url.contains('sriflix')) {
          url = applyPixeldrainWorkerProxy(url);
        } else {
          // Unwrap HTTP redirects, HTML scripts & link=/r= parameters to obtain pure video download URL
          url = await _resolveFinalUrl(url, referer: landingUrl);
        }

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

  /// Sort servers by download priority using user-configured order from ServerPriorityManager.
  /// Default: FSL → FSLv2 → 10Gbps. User can reorder via Settings.
  static List<ResolvedLink> _sortByPriority(List<ResolvedLink> servers) {
    final order = ServerPriorityManager.getOrder();

    int priority(ResolvedLink s) {
      final t = '${s.serverName} ${s.directUrl}'.toLowerCase();
      for (int i = 0; i < order.length; i++) {
        if (order[i].matches(t)) return i;
      }
      return order.length; // unmatched → lowest priority
    }

    final sorted = List<ResolvedLink>.from(servers);
    sorted.sort((a, b) => priority(a).compareTo(priority(b)));
    return sorted;
  }

  /// Follow redirect chain, unpack link=/r= parameters, and parse JS/HTML redirects
  static Future<String> _resolveFinalUrl(String startUrl, {String? referer}) async {
    var currentUrl = startUrl;

    try {
      // Instant return for known direct CDN URLs (Pixeldrain API, Google Drive CDN, Cloudflare R2, direct media files)
      final lower = currentUrl.toLowerCase();
      if (lower.contains('pixeldrain') ||
          lower.contains('sriflix') ||
          lower.contains('googleusercontent.com') ||
          lower.contains('cloudflarestorage.com') ||
          lower.contains('r2.dev') ||
          lower.contains('.mp4') ||
          lower.contains('.mkv') ||
          lower.contains('.avi') ||
          lower.contains('.zip')) {
        if (lower.contains('pixeldrain') || lower.contains('sriflix')) {
          return applyPixeldrainWorkerProxy(currentUrl);
        }
        return currentUrl;
      }

      // 1. Check if input URL itself contains link= or r=
      final directMatch = _extractLinkFromUrl(currentUrl);
      if (directMatch != null) return directMatch;

      // 2. Perform GET request with HTTP redirect tracking and Referer header
      final headers = <String, String>{
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      };
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

  /// Fetch HTML with proper referer and complete browser headers
  static Future<String> _fetchHtml(String url, {String? referer}) async {
    final headers = <String, String>{
      'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
      'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Upgrade-Insecure-Requests': '1',
    };
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
        sendTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 8),
        validateStatus: (status) => status != null && status < 400,
      ),
    );
    return response.data ?? '';
  }
}
