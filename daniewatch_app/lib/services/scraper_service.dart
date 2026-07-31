import 'package:dio/dio.dart';
import 'package:html/parser.dart' as html_parser;
import 'package:html/dom.dart';
import '../models/movie_item.dart';
import '../models/download_link.dart';
import '../models/site_config.dart';

/// Core scraping service — fetches HTML and parses movie cards and download links.
class ScraperService {
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
      },
    ),
  );

  /// Fetch raw HTML from a URL with site referer
  static Future<String> fetchHtml(String url, {String? referer}) async {
    try {
      final headers = <String, String>{};
      if (referer != null) {
        headers['Referer'] = referer;
      } else {
        try {
          final uri = Uri.parse(url);
          headers['Referer'] = '${uri.scheme}://${uri.host}/';
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
    } catch (e) {
      throw Exception('Failed to fetch $url: $e');
    }
  }

  /// Parse homepage HTML to extract ONLY movie post cards
  static Future<List<MovieItem>> fetchHomepage(
      MovieSite site, int page) async {
    final url = page == 1 ? '${site.domain}/' : '${site.domain}/page/$page/';

    final htmlStr = await fetchHtml(url);
    final doc = html_parser.parse(htmlStr);

    final items = <MovieItem>[];
    final seenUrls = <String>{};

    final selectors = [
      'div.poster-card',
      'div.movies-grid > div',
      'ul.recent-movies li',
      'figure',
      '.post-cards article',
      'div.recent-post article',
      'div.blog-cards article',
      'article'
    ];

    for (final sel in selectors) {
      final cardElements = doc.querySelectorAll(sel);
      if (cardElements.isNotEmpty) {
        for (final el in cardElements) {
          if (_isForbiddenSection(el)) continue;

          final item = _parseCardElement(el, site.domain);
          if (item != null && !seenUrls.contains(item.postUrl)) {
            seenUrls.add(item.postUrl);
            items.add(item);
          }
        }
        if (items.length >= 5) break;
      }
    }

    if (items.isEmpty) {
      final links = doc.querySelectorAll('a[href]');
      for (final link in links) {
        if (_isForbiddenSection(link)) continue;

        final href = link.attributes['href'] ?? '';
        if (!href.contains('/download-')) continue;

        final fullUrl = Uri.parse(site.domain).resolve(href).toString();
        if (seenUrls.contains(fullUrl)) continue;

        final img = link.querySelector('img') ?? link.parent?.querySelector('img');
        final thumbnail = _extractImgSrc(img, site.domain);

        var title = img?.attributes['alt'] ??
            link.attributes['title'] ??
            link.text.trim();
        title = cleanMovieTitle(title);
        if (title.isEmpty || title.length < 3) continue;

        seenUrls.add(fullUrl);
        items.add(MovieItem(
          title: title,
          thumbnail: thumbnail,
          postUrl: fullUrl,
        ));
      }
    }

    return items;
  }

  /// Check if element is inside header/footer/top-banner sections
  static bool _isForbiddenSection(Element el) {
    Element? curr = el;
    int depth = 0;
    while (curr != null && depth < 8) {
      final className = curr.className.toLowerCase();
      final idName = curr.id.toLowerCase();
      final tag = (curr.localName ?? '').toLowerCase();

      if (className.contains('hsl-section') ||
          className.contains('hsl-content') ||
          className.contains('vm3-premium-nav') ||
          className.contains('vm3-tag-cloud') ||
          className.contains('footer-content') ||
          className.contains('header') ||
          className.contains('nav') ||
          className.contains('sidebar') ||
          className.contains('widget') ||
          idName.contains('header') ||
          idName.contains('footer') ||
          tag == 'header' ||
          tag == 'footer' ||
          tag == 'nav') {
        return true;
      }
      curr = curr.parent;
      depth++;
    }
    return false;
  }

  /// Helper to extract real image URL from <img> tag
  static String? _extractImgSrc(Element? img, String domain) {
    if (img == null) return null;

    var src = img.attributes['data-src'] ??
        img.attributes['data-lazy-src'] ??
        img.attributes['data-original'] ??
        img.attributes['srcset'] ??
        img.attributes['src'] ??
        '';

    if (src.contains(' ')) {
      src = src.split(' ').first.trim();
    }

    if (src.isEmpty || src.startsWith('data:image/')) return null;

    try {
      return Uri.parse(domain).resolve(src).toString();
    } catch (_) {
      return src.startsWith('http') ? src : null;
    }
  }

  /// Parse a card container into a MovieItem
  static MovieItem? _parseCardElement(Element el, String domain) {
    final link = el.querySelector('a[href]');
    if (link == null) return null;

    final href = link.attributes['href'] ?? '';
    if (href.isEmpty || href == '/' || href.startsWith('#')) return null;

    final lowerHref = href.toLowerCase();
    if (lowerHref.endsWith('.apk') ||
        lowerHref.contains('/category/') ||
        lowerHref.contains('/genre/') ||
        lowerHref.contains('/tag/') ||
        lowerHref.contains('/page/') ||
        lowerHref.contains('/author/') ||
        lowerHref.contains('imdb.com') ||
        lowerHref.contains('telegram') ||
        lowerHref.contains('facebook') ||
        lowerHref.contains('how-to-download') ||
        lowerHref.contains('disclaimer') ||
        lowerHref.contains('contact-us') ||
        lowerHref.contains('dmca') ||
        lowerHref.contains('about-us')) return null;

    final img = el.querySelector('img');
    final thumbnail = _extractImgSrc(img, domain);

    var title = '';
    final heading = el.querySelector('h1, h2, h3, h4, .entry-title, .post-title, .title, figcaption, .poster-info');
    if (heading != null) {
      title = heading.text.trim();
    }
    if (title.isEmpty) {
      title = img?.attributes['alt'] ?? link.attributes['title'] ?? link.text.trim();
    }
    title = cleanMovieTitle(title);
    if (title.isEmpty || title.length < 3) return null;

    final fullUrl = Uri.parse(domain).resolve(href).toString();

    return MovieItem(
      title: title,
      thumbnail: thumbnail,
      postUrl: fullUrl,
    );
  }

  /// Clean up raw titles for homepage cards
  static String cleanMovieTitle(String title) {
    var clean = title
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#039;', "'")
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    clean = clean.replaceAll(RegExp(r'^(?:[A-Z0-9\-]+\s+)?(?:⭐\s*\d+(?:\.\d+)?/\d+\s+)?(?:[A-Za-z]+\s+\d+,\s+\d{4}\s+)?'), '');

    if (clean.toLowerCase().startsWith('download ')) {
      clean = clean.substring(9).trim();
    }

    return clean.trim();
  }

  /// Scrape a post page to extract download links along with heading and button label
  static Future<List<DownloadLink>> scrapePostLinks(String url) async {
    final htmlStr = await fetchHtml(url);
    final doc = html_parser.parse(htmlStr);

    final links = <DownloadLink>[];

    final contentEl = doc.querySelector(
            'main.page-body, .page-body, .entry-content, #main-content, div.content-kuss, div.content-area, article') ??
        doc.body;
    if (contentEl == null) return links;

    final allAnchors = contentEl.querySelectorAll('a[href]');
    for (final el in allAnchors) {
      final href = el.attributes['href'] ?? '';
      final lowerHref = href.toLowerCase();

      // STRICT FILTER: MUST be a download landing host URL
      if (!_isLandingDomain(lowerHref)) continue;

      if (href.contains('telegram') ||
          href.contains('facebook') ||
          href.contains('twitter') ||
          href.contains('comment') ||
          href.contains('#respond')) continue;

      var rawAnchorText = el.text
          .replaceAll('&amp;', '&')
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&#039;', "'")
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();

      // Find preceding heading (h1-h6 or p/div containing resolution / title)
      var headingText = '';
      Element? prev = el.parent;
      while (prev != null && headingText.isEmpty) {
        Element? sib = prev.previousElementSibling;
        while (sib != null) {
          final txt = sib.text.trim();
          if (txt.isNotEmpty &&
              (txt.contains('480p') ||
                  txt.contains('720p') ||
                  txt.contains('1080p') ||
                  txt.contains('2160p') ||
                  txt.contains('4K') ||
                  txt.contains('Download') ||
                  RegExp(r'^h[1-6]$', caseSensitive: false).hasMatch(sib.localName ?? ''))) {
            headingText = txt
                .replaceAll('&amp;', '&')
                .replaceAll('&lt;', '<')
                .replaceAll('&gt;', '>')
                .replaceAll('&quot;', '"')
                .replaceAll('&#039;', "'")
                .replaceAll(RegExp(r'\s+'), ' ')
                .trim();
            break;
          }
          sib = sib.previousElementSibling;
        }
        prev = prev.parent;
      }

      // Detect resolution badge
      final combinedText =
          '$rawAnchorText $headingText'.toLowerCase();
      var resolution = 'LINK';
      if (combinedText.contains('2160p') || combinedText.contains('4k')) {
        resolution = '2160p';
      } else if (combinedText.contains('1080p')) {
        resolution = '1080p';
      } else if (combinedText.contains('720p')) {
        resolution = '720p';
      } else if (combinedText.contains('480p')) {
        resolution = '480p';
      }

      // Extract custom button label if available (e.g., "V-Cloud [Resumable]", "G-Direct [10Gbps]")
      var buttonLabel = rawAnchorText;
      if (buttonLabel.toLowerCase() == 'download now' ||
          buttonLabel.toLowerCase() == 'download' ||
          buttonLabel.toLowerCase() == 'click here' ||
          buttonLabel.isEmpty) {
        buttonLabel = '';
      }

      var mainText = headingText.isNotEmpty ? headingText : (buttonLabel.isNotEmpty ? buttonLabel : 'Download Server');

      links.add(DownloadLink(
        text: mainText,
        href: href,
        resolution: resolution,
        heading: headingText.isNotEmpty ? headingText : null,
        buttonLabel: buttonLabel.isNotEmpty ? buttonLabel : null,
      ));
    }

    return links;
  }

  /// Check if a URL belongs strictly to a download landing domain
  static bool _isLandingDomain(String lowerUrl) {
    const domains = [
      'nexdrive', 'vgmlink', 'gdflix', 'fastdl', 'filebee',
      'hubcloud', 'vcloud', 'katdrive', 'kmhd', 'hubdrive',
      'hubcdn', 'gadgetsweb', 'filepress', 'gofile', 'pixeldrain',
      'mega.nz', 'yodrive'
    ];
    return domains.any((d) => lowerUrl.contains(d));
  }
}
