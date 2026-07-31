import 'package:dio/dio.dart';
import '../models/movie_item.dart';
import '../models/site_config.dart';

/// Search service for all three sites.
/// VegaMovies/RogMovies: search.php JSON API
/// HDHub4u: Typesense API at search.pingora.fyi
class SearchService {
  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {
        'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    ),
  );

  /// Search for movies/series on the given site with page support
  static Future<List<MovieItem>> search(MovieSite site, String query,
      {int page = 1}) async {
    if (query.trim().isEmpty) return [];

    if (site == MovieSite.hdhub4u) {
      return _searchHdhub4u(query.trim(), page: page);
    } else {
      return _searchVegaRog(site, query.trim(), page: page);
    }
  }

  /// Search VegaMovies or RogMovies via search.php JSON API
  static Future<List<MovieItem>> _searchVegaRog(
      MovieSite site, String query, {int page = 1}) async {
    final url =
        '${site.domain}/search.php?q=${Uri.encodeComponent(query)}&page=$page';

    final response = await _dio.get<dynamic>(
      url,
      options: Options(
        headers: {'Referer': '${site.domain}/'},
        responseType: ResponseType.json,
      ),
    );

    final data = response.data;
    if (data == null) return [];

    final hits = data['hits'] as List<dynamic>? ?? [];
    return hits.map<MovieItem>((h) {
      final doc = h['document'] as Map<String, dynamic>;
      final title =
          (doc['post_title'] as String? ?? '').replaceAll('&amp;', '&');
      final permalink = doc['permalink'] as String? ?? '';
      final thumbnail = doc['post_thumbnail'] as String?;

      final postUrl = permalink.startsWith('http')
          ? permalink
          : '${site.domain}$permalink';

      return MovieItem(
        title: title,
        permalink: postUrl,
        thumbnail: thumbnail,
        postUrl: postUrl,
      );
    }).toList();
  }

  /// Search HDHub4u via Typesense API
  static Future<List<MovieItem>> _searchHdhub4u(String query,
      {int page = 1}) async {
    final today = DateTime.now().toIso8601String().split('T')[0];

    final queryParams = {
      'q': query,
      'query_by': 'post_title,category,stars,director,imdb_id',
      'query_by_weights': '4,2,2,2,4',
      'sort_by': 'sort_by_date:desc',
      'limit': '15',
      'highlight_fields': 'none',
      'use_cache': 'true',
      'page': page.toString(),
      'analytics_tag': today,
    };

    final uri = Uri.parse(
            'https://search.pingora.fyi/collections/post/documents/search')
        .replace(queryParameters: queryParams);

    try {
      final response = await _dio.getUri<dynamic>(
        uri,
        options: Options(
          headers: {
            'Referer': 'https://new3.hdhub4u.cl/search.html',
            'Origin': 'https://new3.hdhub4u.cl',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          },
        ),
      );

      final data = response.data;
      if (data == null) return [];

      final hits = data['hits'] as List<dynamic>? ?? [];
      return hits.map<MovieItem>((h) {
        final doc = h['document'] as Map<String, dynamic>;
        final title =
            (doc['post_title'] as String? ?? '').replaceAll('&amp;', '&');
        var permalink = doc['permalink'] as String? ?? '';
        final thumbnail = doc['post_thumbnail'] as String?;

        if (!permalink.startsWith('http')) {
          permalink =
              'https://new3.hdhub4u.cl${permalink.startsWith('/') ? '' : '/'}$permalink';
        }

        return MovieItem(
          title: title,
          permalink: permalink,
          thumbnail: thumbnail,
          postUrl: permalink,
        );
      }).toList();
    } catch (e) {
      return [];
    }
  }
}
