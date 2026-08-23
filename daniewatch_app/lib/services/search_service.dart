import 'package:dio/dio.dart';
import '../models/movie_item.dart';
import '../models/site_config.dart';

/// Search service for supported sites (VegaMovies / RogMovies).
/// VegaMovies/RogMovies: search.php JSON API
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
    return _searchVegaRog(site, query.trim(), page: page);
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
}
