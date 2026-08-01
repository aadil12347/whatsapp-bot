import 'package:dio/dio.dart';
import 'package:html/parser.dart' as html_parser;
import 'scraper_service.dart';

class TmdbResult {
  final String tmdbId;
  final String mediaType; // 'movie' or 'tv'
  final String tmdbUrl;   // e.g. https://www.themoviedb.org/movie/12345
  final String command;   // e.g. .p https://www.themoviedb.org/movie/12345
  final String? title;
  final String? posterPath;
  final String? imdbId;
  final int? seasonNumber;

  TmdbResult({
    required this.tmdbId,
    required this.mediaType,
    required this.tmdbUrl,
    required this.command,
    this.title,
    this.posterPath,
    this.imdbId,
    this.seasonNumber,
  });
}

class TmdbService {
  static const String _tmdbApiKey = 'fc6d85b3839330e3458701b975195487';

  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );

  /// Resolves TMDB information from post page URL & movie title
  static Future<TmdbResult?> resolveTmdbCommand(String postUrl, String rawTitle, {String? postHtml}) async {
    try {
      final htmlStr = postHtml ?? await ScraperService.fetchHtml(postUrl);

      // 1. Check for explicit TMDB link in HTML first
      final tmdbUrlMatch = RegExp(r'https?://(?:www\.)?themoviedb\.org/(movie|tv)/(\d+)(?:/season/(\d+))?', caseSensitive: false)
          .firstMatch(htmlStr);

      if (tmdbUrlMatch != null) {
        final mediaType = tmdbUrlMatch.group(1)!.toLowerCase();
        final id = tmdbUrlMatch.group(2)!;
        final seasonStr = tmdbUrlMatch.group(3);

        String fullUrl = 'https://www.themoviedb.org/$mediaType/$id';
        int? seasonNum;
        if (seasonStr != null) {
          seasonNum = int.tryParse(seasonStr);
          if (seasonNum != null) {
            fullUrl += '/season/$seasonNum';
          }
        } else if (mediaType == 'tv') {
          seasonNum = _extractSeasonNumber('$rawTitle $htmlStr');
          if (seasonNum != null) {
            fullUrl += '/season/$seasonNum';
          }
        }

        return TmdbResult(
          tmdbId: id,
          mediaType: mediaType,
          tmdbUrl: fullUrl,
          command: '.p $fullUrl',
          seasonNumber: seasonNum,
        );
      }

      // 2. Search for IMDB ID (e.g. tt1234567) in HTML
      String? imdbId;
      final imdbMatch = RegExp(r'imdb\.com/title/(tt\d{7,8})', caseSensitive: false).firstMatch(htmlStr) ??
          RegExp(r'\b(tt\d{7,8})\b', caseSensitive: false).firstMatch(htmlStr);

      if (imdbMatch != null) {
        imdbId = imdbMatch.group(1);
      }

      if (imdbId != null && imdbId.isNotEmpty) {
        final findResult = await _findTmdbByImdbId(imdbId, rawTitle, htmlStr);
        if (findResult != null) return findResult;
      }

      // 3. Fallback: Search TMDB by cleaned title
      return await _searchTmdbByTitle(rawTitle, htmlStr);
    } catch (e) {
      // Fallback on error
      return null;
    }
  }

  /// Query TMDB Find API using IMDB ID (ttXXXXXXX)
  static Future<TmdbResult?> _findTmdbByImdbId(String imdbId, String rawTitle, String htmlStr) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        'https://api.themoviedb.org/3/find/$imdbId',
        queryParameters: {
          'api_key': _tmdbApiKey,
          'external_source': 'imdb_id',
        },
      );

      final data = response.data;
      if (data == null) return null;

      final movieResults = data['movie_results'] as List?;
      final tvResults = data['tv_results'] as List?;

      if (movieResults != null && movieResults.isNotEmpty) {
        final item = movieResults.first as Map<String, dynamic>;
        final id = item['id'].toString();
        final title = item['title'] ?? item['original_title'];
        final posterPath = item['poster_path'];
        final fullUrl = 'https://www.themoviedb.org/movie/$id';

        return TmdbResult(
          tmdbId: id,
          mediaType: 'movie',
          tmdbUrl: fullUrl,
          command: '.p $fullUrl',
          title: title,
          posterPath: posterPath,
          imdbId: imdbId,
        );
      } else if (tvResults != null && tvResults.isNotEmpty) {
        final item = tvResults.first as Map<String, dynamic>;
        final id = item['id'].toString();
        final title = item['name'] ?? item['original_name'];
        final posterPath = item['poster_path'];

        final seasonNum = _extractSeasonNumber('$rawTitle $htmlStr');
        String fullUrl = 'https://www.themoviedb.org/tv/$id';
        if (seasonNum != null) {
          fullUrl += '/season/$seasonNum';
        }

        return TmdbResult(
          tmdbId: id,
          mediaType: 'tv',
          tmdbUrl: fullUrl,
          command: '.p $fullUrl',
          title: title,
          posterPath: posterPath,
          imdbId: imdbId,
          seasonNumber: seasonNum,
        );
      }
    } catch (_) {}
    return null;
  }

  /// Fallback: Search TMDB Multi API by cleaned title
  static Future<TmdbResult?> _searchTmdbByTitle(String rawTitle, String htmlStr) async {
    try {
      final cleanTitle = _cleanTitleForTmdb(rawTitle);
      if (cleanTitle.isEmpty) return null;

      final response = await _dio.get<Map<String, dynamic>>(
        'https://api.themoviedb.org/3/search/multi',
        queryParameters: {
          'api_key': _tmdbApiKey,
          'query': cleanTitle,
        },
      );

      final data = response.data;
      if (data == null) return null;

      final results = data['results'] as List?;
      if (results == null || results.isEmpty) return null;

      for (final rawItem in results) {
        final item = rawItem as Map<String, dynamic>;
        final mediaType = item['media_type'] as String?;
        if (mediaType == 'movie' || mediaType == 'tv') {
          final id = item['id'].toString();
          final title = item['title'] ?? item['name'] ?? cleanTitle;
          final posterPath = item['poster_path'];

          String fullUrl = 'https://www.themoviedb.org/$mediaType/$id';
          int? seasonNum;
          if (mediaType == 'tv') {
            seasonNum = _extractSeasonNumber('$rawTitle $htmlStr');
            if (seasonNum != null) {
              fullUrl += '/season/$seasonNum';
            }
          }

          return TmdbResult(
            tmdbId: id,
            mediaType: mediaType!,
            tmdbUrl: fullUrl,
            command: '.p $fullUrl',
            title: title,
            posterPath: posterPath,
            seasonNumber: seasonNum,
          );
        }
      }
    } catch (_) {}
    return null;
  }

  /// Clean title to remove qualities, audio specs, years in brackets, etc.
  static String _cleanTitleForTmdb(String title) {
    var clean = title
        .replaceAll(RegExp(r'Dual Audio|Multi Audio|Hindi-English|Hindi|English|Org|WEB-DL|HDRip|PREHD|PROPER|x264|HEVC|10bit|480p|720p|1080p|2160p|4K', caseSensitive: false), '')
        .replaceAll(RegExp(r'\[.*?\]|\{.*?\}'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    // Extract title up to year if year present, e.g. "Spider-Man: Brand New Day (2026)" -> "Spider-Man: Brand New Day"
    final yearMatch = RegExp(r'^(.*?)\s*\((\d{4})\)').firstMatch(clean);
    if (yearMatch != null) {
      clean = yearMatch.group(1)!.trim();
    }

    if (clean.toLowerCase().startsWith('download ')) {
      clean = clean.substring(9).trim();
    }

    return clean.trim();
  }

  /// Extract season number if mentioned in text (e.g. "Season 1", "S01", "Season 02")
  static int? _extractSeasonNumber(String text) {
    final match = RegExp(r'(?:Season|S)\s*0*(\d+)', caseSensitive: false).firstMatch(text);
    if (match != null) {
      return int.tryParse(match.group(1)!);
    }
    return null;
  }

  /// Formats raw post title to show ONLY title up to Year or Season + languages (e.g. "Spider-Man: Brand New Day (2026) {Hindi-English}")
  static String formatDisplayTitle(String rawTitle) {
    var title = rawTitle.trim();

    // 1. Strip leading "Download "
    if (title.toLowerCase().startsWith('download ')) {
      title = title.substring(9).trim();
    }

    // 2. Strip site domain watermarks at end
    title = title.replaceAll(RegExp(r'\s*\|\s*[A-Za-z0-9\.\-]+\s*$', caseSensitive: false), '').trim();

    // 3. Extract ONLY Language Info (e.g. "{Hindi-English}", "{Hindi-Eng}", "[Hindi-English]", "Hindi-English")
    String languageInfo = '';
    final braceLangMatch = RegExp(r'\{[^\}]*(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Marathi|Punjabi|Gujarati|Urdu|Eng)[^\}]*\}', caseSensitive: false).firstMatch(title) ??
        RegExp(r'\[[^\]]*(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Marathi|Punjabi|Gujarati|Urdu|Eng)[^\]]*\]', caseSensitive: false).firstMatch(title);

    if (braceLangMatch != null) {
      languageInfo = braceLangMatch.group(0)!.trim();
    } else {
      final plainLangMatch = RegExp(r'\b(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Marathi|Punjabi|Gujarati|Urdu|Eng)(?:[\-\+\s]+(?:Hindi|English|Tamil|Telugu|Kannada|Malayalam|Bengali|Marathi|Punjabi|Gujarati|Urdu|Eng))*\b', caseSensitive: false).firstMatch(title);
      if (plainLangMatch != null) {
        languageInfo = '{${plainLangMatch.group(0)!.trim()}}';
      }
    }

    // 4. Extract Core Title up to Year (2026) or Season (Season 1 / S01)
    String coreTitle = '';

    final seasonMatch = RegExp(r'^(.*?\b(?:Season\s*\d+|S\d+)\b\)?|\(.*?\b(?:Season\s*\d+|S\d+)\b\))', caseSensitive: false).firstMatch(title);
    final yearMatch = RegExp(r'^(.*?\b(?:19|20)\d{2}\b\)?|\(.*?\b(?:19|20)\d{2}\b\))', caseSensitive: false).firstMatch(title);

    if (seasonMatch != null) {
      coreTitle = seasonMatch.group(0)!.trim();
    } else if (yearMatch != null) {
      coreTitle = yearMatch.group(0)!.trim();
    } else {
      // Fallback: strip qualities, sizes, audio tags
      coreTitle = title
          .replaceAll(RegExp(r'\b(Dual Audio|Multi Audio|Hindi Audio|English Audio|480p|720p|1080p|2160p|4K|x264|x265|HEVC|10bit|PREHD|WEB-DL|HDRip|PROPER|CAMRip)\b', caseSensitive: false), '')
          .replaceAll(RegExp(r'\[\s*\d+(?:\.\d+)?\s*(?:MB|GB)\s*\]', caseSensitive: false), '')
          .replaceAll(RegExp(r'\{[^\}]*\}|\[[^\}]*\]'), '')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
    }

    if (languageInfo.isNotEmpty && !coreTitle.toLowerCase().contains(languageInfo.toLowerCase())) {
      return '$coreTitle $languageInfo'.trim();
    }

    return coreTitle.isNotEmpty ? coreTitle : title;
  }
}
