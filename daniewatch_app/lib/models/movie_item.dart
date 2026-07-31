/// Represents a movie/post card from the homepage or search results
class MovieItem {
  final String title;
  final String? thumbnail;
  final String postUrl;
  final String? permalink;

  const MovieItem({
    required this.title,
    this.thumbnail,
    required this.postUrl,
    this.permalink,
  });

  @override
  String toString() => 'MovieItem(title: $title, postUrl: $postUrl)';
}
